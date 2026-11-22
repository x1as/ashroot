// Damage pipeline: every hit in the game goes through here. Deterministic for the PLAYER's
// incoming damage (no variance, no enemy crits); the player's own crits are the only dice.
import { G } from './state.js';
import { BOSS_ELEMENT } from '../data/items.js';
import { rollLoot } from './items.js';
import { COUNTER_WINDOW } from '../data/enemies.js';
import { RESONANCE } from '../data/boons.js';
import { angDiff, angTo, dist, rand, chance, TAU, clamp } from '../engine/util.js';
import { burst, dissolve, text, ring, shake, hitstop, slowmo, flash, banner, kick } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR } from '../art/bank.js';
import { emit } from './events.js';

export const lv = (id) => G.run?.boons[id] || 0;
export const aspectLv = (a) => G.run?.aspects[a] || 0;
export const reso = (a, tier) => aspectLv(a) >= (tier === 1 ? 3 : 5) - (G.player?.s.resoShift || 0);
export const floorScale = () => 1 + 0.24 * ((G.run?.floor || 1) - 1);
export const dotScale = () => (G.player?.s.dmgMul || 1) * (1 + 0.2 * ((G.run?.floor || 1) - 1));

export function later(t, fn) { (G.delayed ||= []).push({ t, fn }); }
export function updateDelayed(dt) {
  if (!G.delayed) return;
  for (const d of G.delayed) { d.t -= dt; if (d.t <= 0) d.fn(); }
  G.delayed = G.delayed.filter((d) => d.t > 0);
}

const TYPE_COL = { slash: '#ece4d0', pierce: '#ece4d0', arcane: '#b88cff', fire: '#ff8f3a', bleed: '#e0404f', frost: '#93e2ff', shock: '#ffd36b', shadow: '#b88cff' };

// ---------------- player -> enemy ----------------
export function hitEnemy(e, base, o = {}) {
  if (e.dead || e.spawnT > 0) return 0;
  const P = G.player, s = P.s, cls = P.C;
  const type = o.type || cls.dmgType;
  const dot = o.dot;
  let d = base * (dot ? 1 : s.dmgMul);
  let crit = false, counter = false, blocked = false;
  const fx = o.fx ?? P.x, fy = o.fy ?? P.y;
  const fromAng = angTo(e.x, e.y, fx, fy);

  if (!dot) {
    // COUNTER: hitting during the white flash at the end of a windup interrupts it
    const cw = COUNTER_WINDOW + s.counterWindow;
    if (e.state === 'wind' && !e.isBoss && e.st >= e.windT - cw) { counter = true; d *= 1.5 * s.counterMul; }
    if (e.isBoss && e.counterable && e.wait < cw + 0.02) { counter = true; d *= 1.3 * s.counterMul; e.counterable = false; }
    // shield: frontal block unless guard-break / arcane / charged arrow / flank
    if (e.def.shield && e.state !== 'stagger' && !o.shieldBreak && type !== 'arcane' && Math.abs(angDiff(e.face, fromAng)) < 1.13) {
      blocked = true; d *= 0.12;
    }
    // backstab
    if (s.backstab && Math.abs(angDiff(e.face, fromAng)) > 2.0) d *= 1 + s.backstab;
    // flat armor punishes many small hits
    const armor = (e.armor || 0);
    if (armor && type !== 'arcane') d = Math.max(d * 0.15, d - armor);
    if (lv('h_ambush') && e.hp >= e.maxHp && !e.isBoss) { d *= 1.25 + 0.25 * lv('h_ambush'); o.forceCrit = true; }
    if (lv('h_exec') && e.hp < e.maxHp * 0.3) d *= 1.2 + 0.15 * lv('h_exec');
    if (lv('b_heads') && G.run.heads) d *= 1 + (0.03 + 0.01 * lv('b_heads')) * G.run.heads;
    // Harpe of Perseus: double damage on stunned / frozen
    if (s.leg.w_sword && P.wk === 'sword' && (e.state === 'stagger' || e.stunT > 0 || e.freeze > 0)) d *= 2;
    if (P.rageT > 0) d *= 1.15;
    if (lv('c_wrath')) d *= 1 + Math.min(0.3, 0.03 * (G.run.roomHits || 0));
    if (lv('p_last') && P.hp < P.s.maxHp * 0.3) d *= 2;
    if (P.sapT > 0) d *= 1.3;
    if (s.roots.weight && (e.state === 'stagger' || e.stunT > 0 || e.freeze > 0)) d *= 1.5;
    // crit
    const cc = s.crit + (o.critBonus || 0);
    if (s.leg.w_dagger && P.wk === 'dagger' && o.melee && ++P.dagN % 5 === 0) o.forceCrit = true;
    if (!blocked && (o.forceCrit || P.nextCrit || (reso('shadow', 1) && P.shadowCrit) || chance(cc))) {
      crit = true; d *= s.critMul * (reso('shadow', 2) ? 1.5 : 1); e.lastCrit = G.t;
      P.nextCrit = false; P.shadowCrit = false;
    }
  }
  const res = e.def.resist?.[type] || 0;
  d *= 1 - res;
  if (e.freeze > 0 && !dot) { d *= 1.5 + 0.4 * lv('i_shatter'); e.freeze = 0; burst(e.x, e.y - 6, 10, '#93e2ff', 70); sfx.block(); }
  if (e.chill > 0 && lv('i_brittle')) d *= 1 + 0.04 * lv('i_brittle') * e.chill;
  if (e.burn > 0 && lv('f_heat')) d *= 1 + 0.15 * lv('f_heat');
  if (e.isBoss && e.phase2Shield) d *= 0.5;

  // Hydra's fountain: a charged hit detonates all remaining poison at once
  if (o.power && lv('b_burst') && e.bleed > 0) {
    const pois = 2 * e.bleed * e.bleedT * (1 + 0.4 * lv('b_hemo')) * dotScale() * (1 + 0.5 * lv('b_burst'));
    d += pois; e.bleed = 0; e.bleedT = 0;
    burst(e.x, e.y - 6, 18, '#7bd66b', 110, { grav: 80 }); ring(e.x, e.y - 6, 2, 22, 0.3, '#7bd66b', 2);
    text(e.x, e.y - 30, 'ЯД ГИДРЫ', '#7bd66b', true);
  }
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  // executioner's axe: low-health enemies die outright
  if (o.execute && !dot && !e.isBoss && e.hp > 0 && e.hp < e.maxHp * o.execute) {
    e.hp = 0; text(e.x, e.y - 30, 'КАЗНЬ', '#ff3355', true); burst(e.x, e.y - 6, 20, '#8c1c33', 120, { grav: 80 }); hitstop(0.08);
    if (lv('c_execute')) P.hp = Math.min(s.maxHp, P.hp + 8 * s.healMul);
  }
  if (s.leech && !dot) P.hp = Math.min(s.maxHp, P.hp + d * s.leech * s.healMul);
  e.flash = dot ? 0.04 : 0.1;
  if (!dot) {
    e.lastHitT = G.t;
    // knockback (mass-weighted), poise
    const ka = angTo(fx, fy, e.x, e.y), kb = (o.knock ?? 40) / (e.def.mass || 1) * (e.isBoss ? 0.15 : 1);
    e.kx += Math.cos(ka) * kb; e.ky += Math.sin(ka) * kb;
    e.poise -= d * s.poiseDmg * (o.poiseMul || 1) * (counter ? 3 : 1);
    if (counter || (e.poise <= 0 && e.state !== 'stagger')) stagger(e, counter ? 0.9 : 0.6);
    else if (o.stun && e.hp > 0) stagger(e, o.stun);
    // juice
    const col = blocked ? '#8189a0' : crit ? '#ffd36b' : TYPE_COL[type];
    burst(e.x, e.y - 6, crit ? 9 : 5, col, crit ? 110 : 70, { ang: ka, spread: 0.9 });
    if (!blocked) burst(e.x, e.y - 4, 3, e.def.blood || '#8c1c33', 40, { ang: ka, spread: 0.5, grav: 60 });
    text(e.x, e.y - 18, blocked ? 'блок' : d, col, crit, blocked ? null : e);
    if (counter) { emit('counter', { type: e.type }); text(e.x, e.y - 28, 'КОНТР', '#ffffff', true); sfx.counter(); hitstop(0.1); ring(e.x, e.y - 6, 4, 26, 0.3, '#ffffff'); flash('#ffffff', 0.15); }
    else if (blocked) { sfx.block(); hitstop(0.03); }
    else { sfx.hit(crit); hitstop(crit ? 0.06 : o.heavy ? 0.07 : 0.035); }
    shake(crit || o.heavy ? 0.18 : 0.08);
    kick(Math.cos(ka), Math.sin(ka), crit ? 2 : 1);
    // rally: aggression heals back recently lost HP
    if (P.rally > 0) {
      const eff = s.rallyEff * (reso('blood', 1) && e.bleed > 0 ? 2 : 1) * (counter ? 2 : 1);
      const heal = Math.min(P.rally, d * eff) * s.healMul;
      if (heal > 0) { P.hp = Math.min(s.maxHp, P.hp + heal); P.rally -= heal; P.rallyGlow = 0.25; }
    }
    if (!o.noProc && !blocked) procs(e, d, crit, o);
  } else {
    text(e.x, e.y - 16, d, TYPE_COL[type], false, (e.dotTag ||= {}));
  }
  if (e.hp <= 0) killEnemy(e, { dirX: Math.cos(fromAng + Math.PI), dirY: Math.sin(fromAng + Math.PI) });
  return d;
}

export function stagger(e, t) {
  if (e.isBoss) { e.poise = e.maxPoise; e.stunT = Math.max(e.stunT || 0, t * 0.6); text(e.x, e.y - 34, 'ОШЕЛОМЛЁН', '#ffd36b', true); return; }
  e.state = 'stagger'; e.st = 0; e.stagT = t; e.poise = e.maxPoise; e.tele = null;
  if (e.token) { e.token = false; G.tokens = Math.max(0, (G.tokens || 0) - 1); }
}

function procs(e, d, crit, o) {
  const P = G.player;
  const ds = dotScale();
  const s = P.s;
  const rend = lv('b_rend') + (lv('c_venom') && P.wk === 'dagger' ? 1 : 0) + (o.venom || 0) + (s.element === 'blood' ? 1 : 0) + (crit ? s.critBleed : 0)
    + (o.melee ? (P.C.bleedOnHit || 0) + (s.leg.w_labrys && P.wk === 'labrys' ? 2 : 0) : 0);
  if (rend) { e.bleed = Math.min(10, e.bleed + rend); e.bleedT = 4; }
  if ((lv('f_ignite') && chance([0, 0.3, 0.45, 0.6][lv('f_ignite')])) || (s.element === 'fire' && chance(0.3)) || (s.igniteChance && chance(s.igniteChance))) ignite(e);
  if ((lv('i_chill') && chance([0, 0.4, 0.6, 0.8][lv('i_chill')])) || (s.element === 'frost' && chance(0.4))) chillE(e, 1);
  P.hits++;
  // Polydeuces' wraps: every 4th hit stuns
  if (s.leg.g_light && P.hits % 4 === 0 && !e.dead) { stagger(e, 0.7); ring(e.x, e.y - 8, 2, 12, 0.25, '#ffd36b', 1); }
  if (s.element === 'storm' && P.hits % 4 === 0) chain(e, 2 + (reso('storm', 1) ? 2 : 0), 10 * ds);
  if (P.thunderHits > 0) { P.thunderHits--; chain(e, 3, 14 * ds); }
  if (s.roots.echo && P.hits % 5 === 0) later(0.1, () => { if (!e.dead) { hitEnemy(e, d * 0.6 / s.dmgMul, { noProc: true, knock: 10 }); ring(e.x, e.y - 6, 2, 14, 0.25, P.accent[0]); } });
  if (lv('s_arc')) {
    P.arcCount = (P.arcCount || 0) + 1;
    if (P.arcCount % 4 === 0) chain(e, 1 + lv('s_arc') + (reso('storm', 1) ? 2 : 0), (10 + 5 * lv('s_arc')) * ds);
  }
  if (reso('fire', 2)) { P.sunCount = (P.sunCount || 0) + 1; if (P.sunCount % 8 === 0) nova(P.x, P.y, 55, 30 * ds, 'fire', '#ff8f3a'); }
  if (crit) {
    if (lv('s_overload')) nova(e.x, e.y, 26, (6 + 6 * lv('s_overload')) * ds, 'shock', '#ffd36b', e);
    if (lv('h_echo') && chance(0.2 + 0.1 * lv('h_echo'))) later(0.12, () => { if (!e.dead) { hitEnemy(e, d * 0.5 / P.s.dmgMul, { type: 'shadow', noProc: true, knock: 10 }); ring(e.x, e.y - 6, 2, 14, 0.25, '#b88cff'); } });
  }
}

export function ignite(e) { if (e.burn <= 0) burst(e.x, e.y - 6, 4, '#ff8f3a', 30, { grav: -40 }); e.burn = 3; }
export function chillE(e, n) {
  if (e.freeze > 0) return;
  e.chill = Math.min(5, e.chill + n); e.chillT = 3;
  if (e.chill >= 5) { e.chill = 0; e.freeze = e.isBoss ? 0.5 : 1.2; text(e.x, e.y - 24, 'ЗАМОРОЖЕН', '#93e2ff'); burst(e.x, e.y - 6, 12, '#93e2ff', 60); if (!e.isBoss) { e.state = 'stagger'; e.stagT = 1.2; e.st = 0; e.tele = null; } }
}
export function chain(from, n, dmg) {
  let cur = from; const hit = new Set([from]);
  for (let i = 0; i < n; i++) {
    let best = null, bd = 90;
    for (const e of G.enemies) { if (e.dead || hit.has(e) || e.spawnT > 0) continue; const dd = dist(cur.x, cur.y, e.x, e.y); if (dd < bd) { bd = dd; best = e; } }
    if (!best) break;
    bolt(cur.x, cur.y - 6, best.x, best.y - 6);
    hit.add(best); const tgt = best;
    later(0.04 * (i + 1), () => { tgt.lastShock = G.t; hitEnemy(tgt, dmg, { type: 'shock', noProc: true, dot: false, knock: 5, fx: cur.x, fy: cur.y }); });
    cur = best;
  }
}
export function bolt(x0, y0, x1, y1) {
  const n = Math.max(3, Math.floor(dist(x0, y0, x1, y1) / 6));
  for (let i = 0; i <= n; i++) {
    const t = i / n, jx = i && i < n ? rand(-3, 3) : 0, jy = i && i < n ? rand(-3, 3) : 0;
    G.parts.push({ x: x0 + (x1 - x0) * t + jx, y: y0 + (y1 - y0) * t + jy, vx: 0, vy: 0, life: 0.18, max: 0.18, size: 1, color: i % 2 ? '#ffffff' : '#ffd36b', drag: 0, grav: 0, z: 0, vz: 0 });
  }
  sfx.shoot();
}
// player-owned instant AoE
export function nova(x, y, r, dmg, type, color, except) {
  ring(x, y, 2, r, 0.35, color, 2);
  burst(x, y, 14, color, r * 2.2);
  for (const e of G.enemies) if (!e.dead && e !== except && dist(x, y, e.x, e.y) < r + e.r) hitEnemy(e, dmg, { type, noProc: true, fx: x, fy: y, knock: 60, dot: false, poiseMul: 1.5 });
  shake(0.15);
}

export function tickStatus(e, dt) {
  const ds = dotScale();
  e.statusT = (e.statusT || 0) + dt;
  if (e.chillT > 0) { e.chillT -= dt; if (e.chillT <= 0) e.chill = 0; }
  if (e.freeze > 0) e.freeze -= dt;
  if (e.bleedT > 0) { e.bleedT -= dt; if (e.bleedT <= 0) e.bleed = 0; }
  if (e.burn > 0) e.burn -= dt;
  if (e.statusT >= 0.5) {
    e.statusT -= 0.5;
    if (e.bleed > 0) { hitEnemy(e, 2 * e.bleed * 0.5 * (1 + 0.4 * lv('b_hemo')) * ds, { dot: true, type: 'bleed' }); G.parts.push({ x: e.x + rand(-3, 3), y: e.y - 4, vx: 0, vy: 20, life: 0.4, max: 0.4, size: 1, color: '#e0404f', drag: 1, grav: 80, z: 0, vz: 0 }); }
    if (e.burn > 0 && !e.dead) {
      hitEnemy(e, 6 * 0.5 * ds, { dot: true, type: 'fire' });
      if (reso('fire', 1)) for (const o of G.enemies) if (o !== e && !o.dead && o.burn <= 0 && dist(o.x, o.y, e.x, e.y) < 34) { ignite(o); break; }
    }
  }
  if (e.burn > 0 && Math.random() < dt * 14) G.parts.push({ x: e.x + rand(-4, 4), y: e.y - rand(2, 12), vx: rand(-5, 5), vy: -rand(15, 35), life: 0.5, max: 0.5, size: 1, color: Math.random() < 0.5 ? '#ff8f3a' : '#ffd36b', drag: 1, grav: 0, z: 0, vz: 0, glow: true });
}

export function killEnemy(e, o = {}) {
  if (e.dead) return;
  e.dead = true;
  const P = G.player, ds = dotScale();
  if (e.token) { e.token = false; G.tokens = Math.max(0, (G.tokens || 0) - 1); }
  const spr = e.isBoss ? SPR.boss[e.def.sprite] : SPR.enemy[e.type];
  dissolve(spr, e.x, e.y, e.faceX < 0, o.dirX || 0, o.dirY || 0);
  burst(e.x, e.y - 6, 10, '#6b5f82', 60);
  sfx.kill(); shake(e.isBoss ? 0.8 : 0.12);
  G.run.kills++;
  emit('kill', { type: e.type, elite: !!e.elite, boss: !!e.isBoss });
  // ash orbs
  const ash = Math.round(e.def.ash * (e.elite ? 4 : 1) * (e.isBoss ? 1 + P.s.bossAsh : 1));
  for (let i = 0; i < ash; i++) G.pickups.push({ kind: 'ash', x: e.x + rand(-4, 4), y: e.y + rand(-4, 4), vx: rand(-60, 60), vy: rand(-60, 60), t: 0, v: 1 });
  dropLoot(e);
  if (e.bleed > 0 && lv('b_heads')) { G.run.heads = Math.min(10, (G.run.heads || 0) + 1); text(P.x, P.y - 30, 'голова +' + G.run.heads, '#7bd66b'); }
  if (P.s.leg.w_pelekys && P.wk === 'pelekys') P.sta = Math.min(P.s.maxSta, P.sta + 25);
  if (P.s.leg.r_ring) P.invisT = Math.max(P.invisT, 1);
  const kh = (lv('b_sacr') ? 2 + 2 * lv('b_sacr') : 0) + P.s.killHeal + (P.s.roots.hunger ? P.s.maxHp * 0.03 : 0);
  if (kh) P.hp = Math.min(P.s.maxHp, P.hp + kh * P.s.healMul);
  if (e.burn > 0 && lv('f_pyre')) later(0.05, () => nova(e.x, e.y, 36, (10 + 10 * lv('f_pyre')) * ds, 'fire', '#ff8f3a', e));
  if (e.bleed > 0 && reso('blood', 2)) later(0.05, () => { ring(e.x, e.y, 2, 50, 0.4, '#e0404f', 2); for (const x of G.enemies) if (!x.dead && dist(x.x, x.y, e.x, e.y) < 50) { x.bleed = Math.min(10, x.bleed + 5); x.bleedT = 4; } });
  if (e.freezeKill || (e.freeze > 0 && reso('frost', 1))) shards(e.x, e.y, 6, 8 * ds);
  const blast = e.def.deathBlast || (e.affix === 'volatile' ? 0.6 : 0);
  if (blast && !e.isBoss) {
    G.hazards.push({ kind: 'circle', x: e.x, y: e.y, r: e.def.atk?.r || 34, t: 0, wind: blast, dmg: Math.round((e.def.atk?.kind === 'explode' ? e.dmg : 16 * floorScale())), owner: 'enemy', color: '#b4ec5f', hurtsEnemies: true });
  }
  if (e.isBoss && G.onBossDeath) G.onBossDeath(e);
}

// resources + items from monsters. Essences come from HOW the enemy died (emergent farming).
function dropLoot(e) {
  const P = G.player, s = P.s, f = G.run.floor;
  const mats = {};
  const add = (k, n = 1) => { mats[k] = (mats[k] || 0) + n; };
  const m = s.matMul;
  if (e.isBoss) { add('bone', 8); add('resin', 3); add('shard', 3); add('heart', 1); add('e_' + BOSS_ELEMENT[e.type], 2); }
  else {
    if (chance(0.45 * m)) add('bone', 1 + (chance(0.3) ? 1 : 0));
    if (chance((e.elite ? 1 : 0.05) * m)) add('resin', e.elite ? 2 : 1);
    if (e.elite && chance(0.35 * m)) add('shard', 1);
    const ess = e.bleed > 0 ? 'blood' : e.burn > 0 ? 'fire' : e.freeze > 0 || e.chill > 0 ? 'frost' : e.lastShock && G.t - e.lastShock < 0.5 ? 'storm' : e.lastCrit && G.t - e.lastCrit < 0.05 ? 'shadow' : null;
    if (ess && chance((e.elite ? 0.6 : 0.14) * m)) add('e_' + ess, 1);
  }
  for (const k in mats) for (let i = 0; i < Math.min(mats[k], 4); i++) G.pickups.push({ kind: 'mat', id: k, n: i === 0 ? mats[k] - Math.min(mats[k], 4) + 1 : 1, x: e.x + rand(-4, 4), y: e.y + rand(-4, 4), vx: rand(-70, 70), vy: rand(-70, 70), t: 0 });
  const pItem = e.isBoss ? 1 : e.elite ? 0.3 : 0.025;
  if (chance(pItem * s.findMul)) {
    const it = rollLoot(f, e.isBoss ? 1 : 0, s.rarityBoost, s.unlocked);
    G.pickups.push({ kind: 'item', item: it, x: e.x, y: e.y, vx: rand(-30, 30), vy: rand(-30, 30), t: 0 });
    if (e.isBoss && f === 5) G.pickups.push({ kind: 'item', item: rollLoot(f, 2, s.rarityBoost, s.unlocked), x: e.x + 10, y: e.y, vx: 40, vy: 0, t: 0 });
  }
}

export function shards(x, y, n, dmg) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    G.projs.push({ owner: 'player', kind: 'shard', x, y: y - 5, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 2, dmg, type: 'frost', life: 0.5, pierce: 0, hit: new Set(), color: '#93e2ff', noProc: true });
  }
}

// ---------------- enemy -> player ----------------
export function hurtPlayer(dmg, sx, sy, o = {}) {
  const P = G.player;
  if (!P || P.dead || P.state === 'fall') return false;
  if (P.iframe > 0) {
    if (P.state === 'dodge' && P.dodgeAge < P.s.perfectWindow && !P.perfectDone) perfectDodge();
    return false;
  }
  if (P.inv > 0 && !o.ignoreInv) return false;
  const s = P.s;
  // aspis: the raised shield takes frontal blows and missiles (not while swinging or rolling)
  if (P.C.shield && !o.noBlock && (P.state === 'move' || P.state === 'hold' || P.state === 'power') && P.sta > 0
    && Math.abs(angDiff(P.face, angTo(P.x, P.y, sx, sy))) < 1.15) {
    P.blockT = G.real + 0.12; sfx.block(); burst(P.x + Math.cos(P.face) * 6, P.y - 6 + Math.sin(P.face) * 5, 8, '#f0d9a0', 80);
    if (o.proj) {
      const pr = o.proj;
      if (lv('c_reflect') || s.leg.w_aspis) {
        // the missile flies back as the hero's own, doubled
        const sp = Math.hypot(pr.vx, pr.vy) * 1.4, a = P.face;
        pr.owner = 'player'; pr.vx = Math.cos(a) * sp; pr.vy = Math.sin(a) * sp; pr.hit = new Set(); pr.dmg = pr.dmg * 2 / (s.dmgMul || 1); pr.type = 'pierce'; pr.life = 1.2; pr.pierce = 1;
        text(P.x, P.y - 22, 'отражено', '#f0d9a0');
      } else pr.life = 0;
      return false;
    }
    P.sta = Math.max(0, P.sta - 10); P.staDelay = 0.6;
    dmg *= 0.35; o.noStagger = true; o.status = null;
    text(P.x, P.y - 24, 'блок', '#f0d9a0');
  }
  if (G.godmode) { P.inv = 0.5; G.run.hitsTaken++; return false; }
  // Aegis of Athena: the first blow in a hall is turned to stone
  if (s.leg.a_amulet && !G.run.aegisUsed) {
    G.run.aegisUsed = true; P.inv = 0.5; flash('#ffd36b', 0.15); ring(P.x, P.y - 6, 4, 30, 0.4, '#ffd36b', 2); text(P.x, P.y - 24, 'ЭГИДА', '#ffd36b', true); sfx.block();
    let best = null, bd = 70;
    for (const e of G.enemies) { if (e.dead) continue; const dd = dist(e.x, e.y, sx, sy); if (dd < bd) { bd = dd; best = e; } }
    if (best) { stagger(best, 2); best.stoneT = 2; text(best.x, best.y - 26, 'КАМЕНЬ', '#b8aa90', true); }
    return false;
  }
  if (P.arcaneUp) { P.arcaneUp = false; ring(P.x, P.y - 6, 4, 22, 0.4, '#8f7a63', 2); text(P.x, P.y - 22, 'кора', '#b8aa90'); sfx.block(); P.inv = 0.4; return false; }
  dmg = dmg * s.dmgTaken * (P.hyperNow ? 1 - s.hyperArmor : 1);
  if (s.leg.c_light && dist(sx, sy, P.x, P.y) < 40) dmg *= 0.7; // Nemean lion hide
  if (P.frostShield > 0) { const ab = Math.min(P.frostShield, dmg); P.frostShield -= ab; dmg -= ab; burst(P.x, P.y - 6, 6, '#93e2ff', 50); if (dmg <= 0.5) { P.inv = 0.3; return false; } }
  dmg = Math.max(1, Math.round(dmg));
  P.hp -= dmg;
  P.rally = Math.min(dmg * 0.9 + P.rally * 0.5, s.maxHp); P.rallyT = s.rallyTime;
  G.run.roomHits = (G.run.roomHits || 0) + 1;
  G.run.hitsTaken++;
  P.inv = 0.5;
  P.flash = 0.12;
  if (lv('i_armor') && (P.frostCd || 0) <= 0) { P.frostShield = 5 + 5 * lv('i_armor'); P.frostCd = 8; }
  G.vign = Math.min(1, G.vign + 0.6);
  text(P.x, P.y - 20, dmg, '#e0404f', true);
  burst(P.x, P.y - 6, 8, '#e0404f', 70, { grav: 60 });
  sfx.hurt(); shake(0.35); hitstop(0.08);
  if (!P.hyperNow && !o.noStagger) {
    const a = angTo(sx, sy, P.x, P.y);
    P.vx = Math.cos(a) * 120; P.vy = Math.sin(a) * 120;
    P.setState('hurt');
  }
  if (o.status && P.hp > 0) applyStatus(P, o.status);
  // Phoenix feather: once per depth, bursting back to life below 20%
  if (lv('f_phoenix') && P.hp > 0 && P.hp < s.maxHp * 0.2 && G.run.phoenixFloor !== G.run.floor) {
    G.run.phoenixFloor = G.run.floor; P.hp += s.maxHp * 0.35; P.inv = 1;
    banner('ПЕРО ФЕНИКСА', '', '#ff8f3a', 1.2); nova(P.x, P.y, 70, 40 * dotScale(), 'fire', '#ff8f3a');
    for (const e of G.enemies) if (!e.dead && dist(P.x, P.y, e.x, e.y) < 70) ignite(e);
  }
  if (P.hp <= 0) {
    if (s.lastStand && !G.run.lastStandUsed) { G.run.lastStandUsed = true; P.hp = 1; banner('ВТОРОЕ ДЫХАНИЕ', '', '#ffd36b', 1.6); slowmo(0.8, 0.2); P.inv = 1.2; return true; }
    if (s.unstoppable && !G.run.unstoppableUsed) { G.run.unstoppableUsed = true; P.hp = 1; banner('НЕУДЕРЖИМЫЙ', '', '#ff6a3d', 1.6); slowmo(0.8, 0.2); P.inv = 1.2; return true; }
    P.die();
  }
  return true;
}

// statuses enemies inflict on the hero (immunities from divine armour / Ares' rage)
const STATUS_NAME = { stun: 'ОГЛУШЁН', slow: 'ЗАМЕДЛЕН', bleed: 'КРОВОТЕЧЕНИЕ', burn: 'ГОРИШЬ' };
export function applyStatus(P, st) {
  const s = P.s, t = st.t;
  if (st.kind === 'stun') {
    if (s.stunImm || P.rageT > 0 || P.state === 'dead') return;
    P.setState('stun'); P.stunT = t; P.vx *= 0.3; P.vy *= 0.3;
  } else if (st.kind === 'slow') { if (s.slowImm) return; if (P.slowT > 0.2) { P.slowT = Math.max(P.slowT, t); return; } P.slowT = t; }
  else if (st.kind === 'bleed') { const had = P.pbleedT > 0; P.pbleedT = Math.max(P.pbleedT, t); if (had) return; }
  else if (st.kind === 'burn') { if (s.burnImm) return; const had = P.pburnT > 0; P.pburnT = Math.max(P.pburnT, t); if (had) return; }
  text(P.x, P.y - 32, STATUS_NAME[st.kind], { stun: '#ffd36b', slow: '#93e2ff', bleed: '#e0404f', burn: '#ff8f3a' }[st.kind], true);
}

export function perfectDodge() {
  const P = G.player, s = P.s;
  P.perfectDone = true;
  P.sta = Math.min(s.maxSta, P.sta + s.dodgeCost);
  P.nextCrit = true;
  G.run.perfects++;
  if (s.aeolus) { P.sta = s.maxSta; text(P.x, P.y - 36, 'мешок Эола', '#63e6cf'); }
  if (s.roots.thunder) P.thunderHits = 3;
  emit('perfect', {});
  slowmo(s.slowmo, 0.25);
  flash('#ffffff', 0.18);
  ring(P.x, P.y - 6, 3, 30, 0.45, '#ffffff', 1);
  text(P.x, P.y - 26, 'ИДЕАЛЬНО', '#ffffff', true);
  sfx.perfect();
  const ds = dotScale();
  if (lv('i_nova')) { const R = 40 + 15 * lv('i_nova'); ring(P.x, P.y, 2, R, 0.4, '#93e2ff', 2); for (const e of G.enemies) if (!e.dead && dist(P.x, P.y, e.x, e.y) < R) chillE(e, 5); }
  if (reso('storm', 2)) for (const e of G.enemies) if (!e.dead && e.spawnT <= 0) { bolt(e.x, e.y - 80, e.x, e.y - 4); hitEnemy(e, 30 * ds, { type: 'shock', noProc: true, fx: e.x, fy: e.y - 10 }); }
}

// enemy-owned AoE resolution
export function enemyBlast(x, y, r, dmg, color, hurtsEnemies, enemyDmg = dmg, status = null) {
  ring(x, y, 2, r, 0.3, color, 2);
  burst(x, y, 18, color, r * 2.5, { glow: true });
  sfx.boom(); shake(0.25);
  const P = G.player;
  if (P && dist(x, y, P.x, P.y) < r + 3) hurtPlayer(dmg, x, y, { status, noBlock: true });
  if (hurtsEnemies) for (const e of G.enemies) if (!e.dead && !e.isBoss && dist(x, y, e.x, e.y) < r) { e.hp -= enemyDmg; e.flash = 0.1; e.burn = Math.max(e.burn, color === '#ff8f3a' ? 2 : 0); if (e.hp <= 0) killEnemy(e); }
}
export { RESONANCE, clamp };
