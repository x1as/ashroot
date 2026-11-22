// The hero. State machine: move | hold | power | attack | charge | dodge | flask | hurt | stun | fall | dead.
// No skill button: the weapon's identity lives in its combo and its charged technique (hold attack).
// Souls-like commitment: windups cannot be cancelled; recovery can be cancelled into a dodge.
import { G } from './state.js';
import { WEAPONS } from '../data/weapons.js';
import { BASES } from '../data/items.js';
import { ELEMENT_ACCENT } from '../art/bank.js';
import { input } from '../engine/input.js';
import { damp, angTo, angDiff, dist, clamp, lerp, ease, TAU, rand } from '../engine/util.js';
import { drawSprite, rp, pcircle } from '../engine/sprite.js';
import { burst, smear, ring, shake, text, kick, part, flash } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR, heroFrames } from '../art/bank.js';
import { collide, moveCollide, tileAt, T, TS, spikeState, solidT } from './world.js';
import { hitProp } from './props.js';
import { unleash } from './power.js';
import { weaponSprite } from '../art/bank.js';
import { hitEnemy, hurtPlayer, lv, reso, nova, dotScale, floorScale, bolt, chillE, aspectLv, later } from './combat.js';
import { ASPECTS } from '../data/boons.js';
import { weaponTint } from '../art/bank.js';

const METAL = ['#e8e2d2', '#f0d9a0', '#c9d2e8', '#ffd36b'];
const AURA_KEYS = ['blood', 'fire', 'frost', 'storm', 'shadow'];
// dominant god-aspect on the weapon (boons + gear + infusion): it colours swings and drips off the blade
function auraOf(P) {
  let best = null, bl = 0;
  for (const k of AURA_KEYS) { const l = aspectLv(k) + (P.s.gearAspects[k] || 0) + (P.s.element === k ? 2 : 0); if (l > bl) { bl = l; best = k; } }
  return best ? { k: best, l: bl, col: ASPECTS[best].color } : null;
}

// look of the hero from the equipped armour weights + weapon infusion
export function gearLook(inv) {
  const kind = (slot) => { const it = inv.items.find((i) => i.uid === inv.equip[slot]); return it ? BASES[it.base].kind : 'none'; };
  const w = inv.items.find((i) => i.uid === inv.equip.weapon);
  const el = w && w.infuse && !w.infuse.startsWith('root:') ? w.infuse : null;
  return { helm: kind('helm'), chest: kind('chest'), boots: kind('boots'), element: el, wr: w ? w.rarity : 0 };
}
export function applyLoadout(P, stats, look) {
  P.s = stats; P.wk = stats.wk; P.C = WEAPONS[stats.wk];
  P.frames = heroFrames(look); P.accent = P.frames.accent; P.wr = look.wr || 0;
}

export function createPlayer(stats, look, x, y) {
  const P = {
    s: stats, x, y, vx: 0, vy: 0, r: 4,
    hp: stats.maxHp, sta: stats.maxSta, staDelay: 0, rally: 0, rallyT: 0, rallyGlow: 0,
    state: 'move', st: 0, face: -Math.PI / 2, faceX: 1, flipS: 1,
    combo: 0, comboWin: 0, struck: false, atk: null, phase: 'wind',
    dodge: { dx: 0, dy: 1 }, dodgeAge: 0, iframe: 0, inv: 0, perfectDone: false,
    flasks: stats.flasks, charge: 0, slowT: 0, stunT: 0, pbleedT: 0, pburnT: 0, dotT: 0, rageT: 0, invisT: 0, domeT: 0, twinN: 0, shotN: 0, tipX: x, tipY: y, blockT: 0, flash: 0, nextCrit: false,
    animT: 0, sq: 1, lastSafe: { x, y }, afterimg: [], cloth: [], frostShield: 0, frostCd: 0,
    arcaneUp: !!stats.roots.bark, shots: 0, dead: false, hyperNow: false, tempestT: 0, sapT: 0, hits: 0, dagN: 0, thunderHits: 0,
    setState(s) { this.state = s; this.st = 0; },
    die() { this.dead = true; this.setState('dead'); G.onPlayerDeath?.(); },
  };
  for (let i = 0; i < 7; i++) P.cloth.push({ x, y: y - 8, px: x, py: y - 8 });
  applyLoadout(P, stats, look);
  return P;
}

const atkRate = (P) => {
  let r = P.s.atkSpeed;
  if (P.rageT > 0) r *= 1.4;
  if (P.s.leg.c_medium && P.hp < P.s.maxHp * 0.5) r *= 1.25;
  if (P.s.roots.rage && P.hp < P.s.maxHp * 0.4) r *= 1.25;
  return r;
};

function autoAim(P) {
  // touch: nearest enemy, preferring the stick direction; otherwise keep facing
  let best = null, bs = 1e9;
  const mv = Math.hypot(input.move.x, input.move.y) > 0.2 ? Math.atan2(input.move.y, input.move.x) : P.face;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(P.x, P.y, e.x, e.y);
    if (d > 190) continue;
    const score = d * (1 + Math.abs(angDiff(mv, angTo(P.x, P.y, e.x, e.y))) * 0.6);
    if (score < bs) { bs = score; best = e; }
  }
  return best ? angTo(P.x, P.y - 4, best.x, best.y - 4) : mv;
}

export function updatePlayer(P, dt) {
  const s = P.s, C = P.C;
  P.st += dt; P.animT += dt;
  P.flash = Math.max(0, P.flash - dt);
  P.inv = Math.max(0, P.inv - dt);
  P.iframe = Math.max(0, P.iframe - dt);
  P.rallyGlow = Math.max(0, P.rallyGlow - dt);
  P.frostCd = Math.max(0, P.frostCd - dt);
  P.sapT = Math.max(0, P.sapT - dt);
  P.rageT = Math.max(0, P.rageT - dt); P.invisT = Math.max(0, P.invisT - dt); P.slowT = Math.max(0, P.slowT - dt); P.domeT = Math.max(0, P.domeT - dt);
  P.comboWin = Math.max(0, P.comboWin - dt);
  P.hyperNow = false;
  if (P.dead) return;
  tickPlayerStatus(P, dt);
  P.aura = auraOf(P); P.auraCol = P.aura ? P.aura.col : P.accent[0];
  if (P.aura) auraFx(P, dt);
  // stamina & rally
  if (P.staDelay > 0) P.staDelay -= dt; else P.sta = Math.min(s.maxSta, P.sta + s.staRegen * dt * (P.state === 'move' ? 1 : 0.4));
  if (P.rallyT > 0) P.rallyT -= dt; else P.rally = Math.max(0, P.rally - 30 * dt);
  // aim
  const mouseAim = !input.touch && input.mouse.inside;
  const aimWanted = mouseAim ? angTo(P.x, P.y - 5, G.mouseWorld.x, G.mouseWorld.y) : autoAim(P);
  if (P.state === 'move' || P.state === 'charge' || P.state === 'flask') P.face = aimWanted;
  // storm tempest
  if (lv('s_tempest')) {
    P.tempestT += dt;
    if (P.tempestT > 7 - lv('s_tempest')) {
      P.tempestT = 0;
      const alive = G.enemies.filter((e) => !e.dead && e.spawnT <= 0);
      if (alive.length) { const e = alive[(Math.random() * alive.length) | 0]; bolt(e.x, e.y - 90, e.x, e.y - 4); hitEnemy(e, (20 + 8 * lv('s_tempest')) * dotScale(), { type: 'shock', noProc: true, fx: e.x, fy: e.y - 10 }); }
    }
  }

  const mx = input.move.x, my = input.move.y;
  const moving = Math.hypot(mx, my) > 0.1;
  let speed = s.speed * (P.slowT > 0 ? 0.55 : 1);
  switch (P.state) {
    case 'move': {
      const k = moving ? 22 : 16;
      P.vx = damp(P.vx, mx * speed, k, dt); P.vy = damp(P.vy, my * speed, k, dt);
      if (input.pressed('dodge')) tryDodge(P, mx, my);
      else if (input.pressed('flask')) tryFlask(P);
      else if (input.pressed('attack')) { P.setState('hold'); }
      break;
    }
    case 'hold': {
      // tapping releases a normal attack; holding past 0.18 s starts pouring stamina into a charged strike
      P.vx = damp(P.vx, mx * speed * 0.6, 16, dt); P.vy = damp(P.vy, my * speed * 0.6, 16, dt);
      if (!input.held('attack')) { P.setState('move'); startAttack(P, true); break; }
      if (P.st >= 0.18) { P.setState('power'); P.power = 0; P.tier = 0; }
      break;
    }
    case 'power': {
      P.vx = damp(P.vx, mx * speed * 0.4, 14, dt); P.vy = damp(P.vy, my * speed * 0.4, 14, dt);
      // stamina pours into the weapon at chargeRate/s (tree, affixes, boons, divine gauntlets speed it up)
      const spend = s.staFree ? Math.min(s.maxSta - P.power, s.chargeRate * dt) : Math.min(P.sta, s.chargeRate * dt);
      if (!s.staFree) P.sta -= spend;
      P.power += spend; P.staDelay = 0.7;
      const pr = P.power / s.maxSta, tier = Math.floor(pr * 4 + 1e-6);
      if (tier > P.tier) { P.tier = tier; ring(P.x, P.y - 6, 4, 16 + tier * 6, 0.3, tier >= 4 ? '#ffffff' : P.accent[0], 2); sfx.ui(); if (tier >= 4) flash(P.accent[0], 0.12); }
      if (Math.random() < dt * (20 + 60 * pr)) { const aa = rand(TAU), rr = 10 + 18 * pr; part({ x: P.x + Math.cos(aa) * rr, y: P.y - 6 + Math.sin(aa) * rr * 0.6, vx: -Math.cos(aa) * 30, vy: -Math.sin(aa) * 20, life: 0.35, color: pr > 0.95 ? '#ffffff' : P.accent[0], size: 1.5, drag: 2, glow: true }); }
      if (input.pressed('dodge')) { P.sta += P.power * 0.5; P.power = 0; tryDodge(P, mx, my); break; }
      if (!input.held('attack')) {
        const p = P.power / s.maxSta;
        if (P.power < 6) { P.setState('move'); startAttack(P, true); break; }
        const o = unleash(P, p) || {};
        P.atk = { kind: 'power', wind: 0, act: 0.08, rec: o.rec ?? 0.2 + 0.35 * p, arc: 360, move: o.move, spinT: o.spin || 0 };
        P.setState('attack'); P.phase = 'act'; P.power = 0; P.sq = 0.6;
      }
      break;
    }
    case 'attack': updateAttack(P, dt); break;
    case 'charge': {
      P.charge = Math.min(1, P.charge + dt / (C.arrow.chargeTime * s.chargeMul * (lv('c_quick') ? 0.65 : 1)));
      const slow = C.arrow.moveWhileCharging + s.chargeMove;
      P.vx = damp(P.vx, mx * speed * slow, 18, dt); P.vy = damp(P.vy, my * speed * slow, 18, dt);
      if (P.charge >= 1 && !P.chargeFull) { P.chargeFull = true; flash('#63e6cf', 0.08); ring(P.x, P.y - 6, 2, 10, 0.25, '#ffffff'); sfx.ui(); }
      if (input.pressed('dodge')) { P.charge = 0; tryDodge(P, mx, my); break; }
      if (!input.held('attack')) fireArrow(P);
      break;
    }
    case 'dodge': updateDodge(P, dt); break;
    case 'stun': {
      P.vx = damp(P.vx, 0, 12, dt); P.vy = damp(P.vy, 0, 12, dt);
      if (Math.random() < dt * 12) part({ x: P.x + rand(-5, 5), y: P.y - 18, vx: 0, vy: -10, life: 0.3, color: '#ffd36b', size: 1, drag: 1 });
      if (P.st >= P.stunT) P.setState('move');
      break;
    }
    case 'flask': {
      P.vx = damp(P.vx, mx * speed * 0.35, 12, dt); P.vy = damp(P.vy, my * speed * 0.35, 12, dt);
      if (Math.random() < dt * 30) part({ x: P.x + rand(-5, 5), y: P.y - rand(0, 12), vx: 0, vy: -20, life: 0.5, color: '#93e2ff', size: 1, drag: 1 });
      if (P.st >= 0.85) {
        const heal = s.maxHp * s.flaskHeal * s.healMul;
        if (s.roots.sap) { P.sapT = 6; text(P.x, P.y - 34, 'живица: +30% урона', '#ffb347'); }
        P.hp = Math.min(s.maxHp, P.hp + heal); P.rally = 0;
        text(P.x, P.y - 24, '+' + Math.round(heal), '#b4ec5f', true); ring(P.x, P.y - 6, 3, 20, 0.4, '#b4ec5f');
        sfx.flask(); P.setState('move');
      }
      break;
    }
    case 'hurt': {
      P.vx = damp(P.vx, 0, 10, dt); P.vy = damp(P.vy, 0, 10, dt);
      if (P.st > 0.28) P.setState('move');
      break;
    }
    case 'fall': {
      P.vx = 0; P.vy = 0;
      if (P.st > 0.55) {
        P.x = P.lastSafe.x; P.y = P.lastSafe.y; P.setState('move'); P.inv = 1.0;
        const d = Math.max(8, Math.round(P.s.maxHp * 0.12));
        P.inv = 0; hurtPlayer(d, P.x, P.y + 1, { noStagger: true }); P.inv = 1.0;
      }
      return;
    }
  }
  if (P.state === 'attack' && P.atk?.hyper && P.phase !== 'rec') P.hyperNow = true;
  moveCollide(G.room, P, P.vx * dt, P.vy * dt);
  // bodies: player can't walk through enemies, but rolls through them
  if (P.state !== 'dodge') for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(P.x, P.y, e.x, e.y), m = P.r + e.r;
    if (d < m && d > 0) { const push = (m - d) * 0.6; moveCollide(G.room, P, ((P.x - e.x) / d) * push, ((P.y - e.y) / d) * push); }
  }
  collide(G.room, P);
  // terrain
  const tile = tileAt(G.room, P.x, P.y);
  if (tile === T.CHASM && P.state !== 'dodge') { P.setState('fall'); sfx.fall(); text(P.x, P.y - 18, 'падение', '#8189a0'); return; }
  if (tile === T.FLOOR) {
    const near = [[6, 0], [-6, 0], [0, 6], [0, -6]].every(([ox, oy]) => tileAt(G.room, P.x + ox, P.y + oy) !== T.CHASM);
    if (near) { P.lastSafe.x = P.x; P.lastSafe.y = P.y; }
  }
  if (tile === T.SPIKE && spikeState(G.room, Math.floor(P.x / TS), Math.floor(P.y / TS), G.t) === 2) hurtPlayer(Math.round(10 * floorScale()), P.x, P.y + 4, { noStagger: true });
  // facing flip with smooth squash-through
  const fx = Math.cos(P.face) >= 0 ? 1 : -1;
  P.faceX = fx;
  P.flipS = damp(P.flipS, fx, 26, dt);
  updateCloth(P, dt);
  for (const a of P.afterimg) a.t += dt;
  P.afterimg = P.afterimg.filter((a) => a.t < 0.25);
}

// statuses enemies put on the hero: bleed / burn tick (never kill: they leave 1 HP), slow, stun
function tickPlayerStatus(P, dt) {
  if (P.pbleedT <= 0 && P.pburnT <= 0) return;
  P.pbleedT = Math.max(0, P.pbleedT - dt); P.pburnT = Math.max(0, P.pburnT - dt);
  P.dotT += dt;
  if (Math.random() < dt * 10) part({ x: P.x + rand(-3, 3), y: P.y - rand(4, 12), vx: 0, vy: P.pburnT > 0 ? -25 : 20, life: 0.4, color: P.pburnT > 0 ? '#ff8f3a' : '#e0404f', size: 1, drag: 1, grav: P.pburnT > 0 ? 0 : 60, glow: P.pburnT > 0 });
  if (P.dotT < 0.5) return;
  P.dotT -= 0.5;
  const d = Math.max(1, Math.round(((P.pbleedT > 0 ? 2 : 0) + (P.pburnT > 0 ? 3 : 0)) * floorScale()));
  if (G.godmode) return;
  P.hp = Math.max(1, P.hp - d); P.rally = Math.min(P.s.maxHp, P.rally + d * 0.6); P.rallyT = P.s.rallyTime;
  text(P.x + rand(-4, 4), P.y - 22, d, P.pburnT > 0 ? '#ff8f3a' : '#e0404f');
}
function auraFx(P, dt) {
  const A = P.aura, rate = Math.min(1, A.l / 5) * 22 + 4;
  if (Math.random() > dt * rate) return;
  const x = P.tipX + rand(-2, 2), y = P.tipY + rand(-2, 2);
  if (A.k === 'fire') part({ x, y, vx: rand(-8, 8), vy: -rand(20, 45), life: 0.45, color: Math.random() < 0.5 ? '#ff8f3a' : '#ffd36b', size: 1, drag: 1, glow: true });
  else if (A.k === 'frost') part({ x, y, vx: rand(-6, 6), vy: rand(4, 14), life: 0.6, color: Math.random() < 0.5 ? '#93e2ff' : '#ffffff', size: 0.5, drag: 2, glow: true });
  else if (A.k === 'storm') part({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-40, 40), vy: rand(-40, 40), life: 0.12, color: Math.random() < 0.5 ? '#ffd36b' : '#ffffff', size: 0.5, drag: 6, glow: true });
  else if (A.k === 'blood') part({ x, y, vx: 0, vy: 6, life: 0.6, color: Math.random() < 0.6 ? '#7bd66b' : '#3e8a35', size: 1, drag: 0.5, grav: 90 });
  else part({ x, y, vx: rand(-5, 5), vy: -rand(6, 16), life: 0.7, color: Math.random() < 0.5 ? '#b88cff' : '#4a2f7a', size: 1, drag: 1 });
}

function useSta(P, n) {
  if (P.s.staFree && n < 30 && P.state !== 'dodge') { P.hp = Math.max(1, P.hp - P.s.hpCost); P.rally += P.s.hpCost; P.rallyT = P.s.rallyTime; return true; }
  if (P.sta <= 0) return false;
  P.sta -= n; P.staDelay = 0.55;
  return true;
}

function tryDodge(P, mx, my) {
  const s = P.s;
  if (P.sta < s.dodgeCost * 0.5) { text(P.x, P.y - 20, 'нет сил', '#8189a0'); return; }
  P.sta -= s.dodgeCost; P.staDelay = 0.6;
  let dx = mx, dy = my;
  if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(P.face); dy = Math.sin(P.face); }
  const l = Math.hypot(dx, dy); P.dodge.dx = dx / l; P.dodge.dy = dy / l;
  P.setState('dodge'); P.dodgeAge = 0; P.iframe = s.iframe; P.perfectDone = false; P.conduitHit = new Set();
  P.face = Math.atan2(P.dodge.dy, P.dodge.dx);
  sfx.dodge();
  burst(P.x, P.y, 6, '#6b5f82', 40, { ang: Math.atan2(-P.dodge.dy, -P.dodge.dx), spread: 0.8 });
}
function updateDodge(P, dt) {
  const s = P.s;
  P.dodgeAge += dt;
  const k = P.st / s.dodgeTime;
  // ease-out roll: fast start, soft stop
  const v = (s.dodgeDist / s.dodgeTime) * 2.2 * (1 - ease.outQuad(Math.min(1, k)));
  P.vx = P.dodge.dx * v; P.vy = P.dodge.dy * v;
  if (Math.random() < 0.5) P.afterimg.push({ x: P.x, y: P.y, t: 0, flip: P.faceX < 0 });
  if ((lv('f_cinder') || s.emberTrail) && Math.random() < dt * 25) G.zones.push({ x: P.x, y: P.y, r: 7, t: 0, life: 2.2, dps: (6 + 4 * Math.max(1, lv('f_cinder'))) * dotScale(), type: 'fire', color: '#ff8f3a', tick: 0 });
  if (lv('s_conduit')) for (const e of G.enemies) if (!e.dead && !P.conduitHit.has(e) && dist(P.x, P.y, e.x, e.y) < e.r + 6) { P.conduitHit.add(e); hitEnemy(e, (6 + 6 * lv('s_conduit')) * dotScale(), { type: 'shock', noProc: true, knock: 10 }); }
  if (k >= 1) {
    P.setState('move');
    if (reso('frost', 2)) { ring(P.x, P.y, 2, 40, 0.35, '#93e2ff'); for (const e of G.enemies) if (!e.dead && dist(P.x, P.y, e.x, e.y) < 40) chillE(e, 3); }
    if (reso('shadow', 1)) P.shadowCrit = true;
    if (s.leg.h_medium) { P.invisT = 1; burst(P.x, P.y - 6, 10, '#4a2f7a', 40); text(P.x, P.y - 22, 'шлем Аида', '#b88cff'); }
    P.sq = 0.75;
  }
  if (input.pressed('attack') && k > 0.6) { P.setState('move'); input.buf.attack = 0.15; }
}

// ---------------- attacks ----------------
function startAttack(P, fromTap) {
  const C = P.C;
  if (C.arrow) {
    input.pressed('attack');
    if (!P.s.staFree && P.sta <= 0) { text(P.x, P.y - 20, 'нет сил', '#8189a0'); return; }
    P.charge = 0; fireArrow(P);
    return;
  }
  input.pressed('attack');
  if (!P.s.staFree && P.sta <= 0) { text(P.x, P.y - 20, 'нет сил', '#8189a0'); return; }
  if (C.bolt) { P.atk = { ...C.bolt, act: 0.04, kind: 'bolt' }; }
  else {
    const list = comboList(P);
    if (P.comboWin <= 0) P.combo = 0;
    P.atk = { ...list[P.combo % list.length], kind: 'melee' };
  }
  useSta(P, P.atk.sta * P.s.atkSta);
  P.setState('attack'); P.phase = 'wind'; P.struck = false;
}
function comboList(P) {
  const list = P.C.combo.slice();
  if (lv('c_fourth')) list.push({ dmg: 16, wind: 0.08, act: 0.08, rec: 0.26, range: 28, arc: 360, lunge: 6, sta: 10, finisher: true, spin: true });
  return list;
}
function updateAttack(P, dt) {
  const a = P.atk, rate = atkRate(P);
  const wind = a.wind / rate, act = a.act / rate, rec = a.rec / rate;
  const mx = input.move.x, my = input.move.y;
  const mm = (a.move ?? (P.wk === 'dagger' && P.s.leg.w_dagger ? 1 : P.C.move ?? 0.55)) * P.s.speed * (P.slowT > 0 ? 0.55 : 1);
  P.vx = damp(P.vx, mx * mm, 14, dt); P.vy = damp(P.vy, my * mm, 14, dt);
  if (P.phase === 'wind') {
    // slight aim correction during windup (readable, not twitchy)
    const aim = !input.touch && input.mouse.inside ? angTo(P.x, P.y - 5, G.mouseWorld.x, G.mouseWorld.y) : autoAim(P);
    P.face += angDiff(P.face, aim) * Math.min(1, dt * 12);
    if (P.st >= wind) { P.phase = 'act'; P.st = 0; strike(P); }
  } else if (P.phase === 'act') {
    if (P.st >= act) { P.phase = 'rec'; P.st = 0; }
  } else {
    // cancel recovery into a dodge (Dead Cells responsiveness) — never the windup (souls commitment)
    if (input.pressed('dodge')) { P.comboWin = 0; tryDodge(P, mx, my); return; }
    if (a.kind !== 'power' && P.st > rec * 0.35 && input.peek('attack')) {
      if (a.kind === 'melee') { const list = comboList(P); P.combo = (P.combo + 1) % list.length; P.comboWin = 1; }
      P.setState('move'); startAttack(P); return;
    }
    if (P.st >= rec) { if (a.kind === 'melee') { P.combo = (P.combo + 1) % comboList(P).length; P.comboWin = 0.35; if (a.finisher) P.combo = 0; } P.setState('move'); }
  }
}

function strike(P) {
  const a = P.atk, s = P.s;
  if (a.kind === 'bolt') { fireBolt(P); return; }
  const wk = P.wk, style = P.C.style;
  const r = (a.range + (wk === 'spear' && s.leg.w_spear ? 10 : 0)) * s.reach;
  const arcW = (lv('c_wide') && wk === 'sword' ? 0.35 : 0) + (a.arc < 360 ? (s.reach - 1) * 0.5 : 0);
  const half = (a.arc * Math.PI) / 360 + arcW;
  const heavy = !!a.hyper;
  const metal = METAL[P.wr], col = P.auraCol;
  swingFx(P, style, a, r, half, metal, col, heavy);
  sfx.swing(heavy || style === 'axe');
  const o = { type: P.C.dmgType, knock: heavy ? 90 : 35, heavy, shieldBreak: P.C.guardBreak && heavy, poiseMul: a.finisher ? 1.5 : 1, melee: true };
  if (P.C.execute) o.execute = P.C.execute + (lv('c_execute') ? 0.15 : 0) + (s.leg.w_pelekys ? 0.1 : 0);
  if (a.bash) { o.stun = 0.9; o.knock = 140; o.shieldBreak = true; }
  if (wk === 'cleaver' && lv('c_titan')) o.stun = 0.5;
  if (wk === 'spear' && s.leg.w_spear) o.shieldBreak = true;
  if (wk === 'labrys' && a.spin && lv('c_labrys')) o.venom = 3;
  const victims = targetsIn(P, a, r, half, style);
  for (const e of victims) {
    slashMark(e.x, e.y - 6, P.face + Math.PI / 2 + rand(-0.4, 0.4), heavy ? 9 : 6);
    hitEnemy(e, a.dmg, o);
    if (wk === 'spear' && lv('c_phalanx')) later(0.09, () => { if (!e.dead) { slashMark(e.x, e.y - 5, P.face + Math.PI / 2, 5); hitEnemy(e, a.dmg * 0.6, { type: 'pierce', knock: 15, noProc: true }); } });
    if (wk === 'labrys' && a.spin && lv('c_labrys') && !e.isBoss) { const ang = angTo(e.x, e.y, P.x, P.y); e.kx += Math.cos(ang) * 160; e.ky += Math.sin(ang) * 160; }
  }
  for (const pr of G.room.props || []) {
    if (pr.dead || dist(P.x, P.y - 4, pr.x, pr.y - 4) > r + pr.r) continue;
    if (a.arc < 360 && Math.abs(angDiff(P.face, angTo(P.x, P.y - 4, pr.x, pr.y - 4))) > half + 0.2) continue;
    hitProp(pr);
  }
  if (victims.length && heavy) shake(style === 'cleave' ? 0.35 : 0.2);
  kick(Math.cos(P.face), Math.sin(P.face), heavy ? 2.5 : 1);
  // Nyx's shadow double repeats every third swing
  if (lv('h_twin') && ++P.twinN % 3 === 0) later(0.13, () => {
    if (P.dead) return;
    smear(P.x, P.y - 5, P.face - half, P.face + half, r * 0.5, r + 2, 0.22, '#b88cff');
    for (const e of targetsIn(P, a, r, half, style)) hitEnemy(e, a.dmg * (0.4 + 0.3 * lv('h_twin')), { type: 'shadow', knock: 10, noProc: true });
  });
  if (a.finisher) {
    const wave = (dmg, w = 170, c = col) => G.projs.push({ owner: 'player', kind: 'wave', x: P.x, y: P.y - 3, vx: Math.cos(P.face) * w, vy: Math.sin(P.face) * w, r: 8, dmg: dmg * s.dmgMul, type: 'slash', life: 0.6, pierce: 99, hit: new Set(), color: c, noProc: true, knock: 60 });
    if (lv('c_quake') && wk === 'greatsword') wave(25);
    if (lv('c_wide') && wk === 'sword') wave(14, 200);
    if (s.leg.w_cleaver && wk === 'cleaver') { wave(40, 160, '#ffd36b'); ring(P.x, P.y, 4, 60, 0.4, '#ffd36b', 2); }
    if (s.bladeDance) G.projs.push({ owner: 'player', kind: 'blade', x: P.x, y: P.y - 5, vx: Math.cos(P.face) * 220, vy: Math.sin(P.face) * 220, r: 4, dmg: 15 * s.dmgMul, type: 'shadow', life: 0.5, pierce: 3, hit: new Set(), color: '#b88cff' });
  }
}

// who a swing touches: arcs test angle, thrusts test a narrow line along the facing
function targetsIn(P, a, r, half, style) {
  const out = [], cx = Math.cos(P.face), cy = Math.sin(P.face);
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const dx = e.x - P.x, dy = e.y - P.y;
    if (style === 'thrust') {
      const along = dx * cx + dy * cy, across = Math.abs(dx * cy - dy * cx);
      if (along < -2 || along > r + e.r || across > e.r + 5 + (a.finisher ? 3 : 0)) continue;
    } else {
      if (Math.hypot(dx, dy) > r + e.r) continue;
      if (a.arc < 360 && Math.abs(angDiff(P.face, Math.atan2(dy, dx))) > half + 0.2) continue;
    }
    out.push(e);
  }
  return out;
}

// every weapon type has its own swing silhouette
function swingFx(P, style, a, r, half, metal, col, heavy) {
  const x = P.x, y = P.y - 5, f = P.face;
  if (style === 'twin') {
    smear(x, y, f - half, f + half, r * 0.78, r + 2, 0.13, metal);
    smear(x, y, f - half * 0.8, f + half * 0.8, r * 0.88, r, 0.1, col);
    if (a.finisher) { smear(x, y, f + 0.7 - 0.8, f + 0.7 + 0.8, r * 0.6, r + 6, 0.22, '#ffffff'); smear(x, y, f - 0.7 - 0.8, f - 0.7 + 0.8, r * 0.6, r + 6, 0.22, col); }
  } else if (style === 'smash') {
    smear(x, y, f - half * 1.05, f + half * 1.05, r * 0.25, r + 4, 0.3, '#8a7c68');
    smear(x, y, f - half * 0.9, f + half * 0.9, r * 0.45, r, 0.2, metal);
    const tx = P.x + Math.cos(f) * r * 0.85, ty = P.y + Math.sin(f) * r * 0.85;
    ring(tx, ty, 2, 16 + (a.finisher ? 14 : 0), 0.35, '#b8aa90', 2); burst(tx, ty, a.finisher ? 26 : 14, '#8a7c68', 90, { grav: 90, size: 2 });
  } else if (style === 'thrust') {
    // dory: a long narrow lance of light along the facing, a flash at the point
    smear(x, y, f - 0.07, f + 0.07, 6, r + 4, 0.16, col);
    smear(x, y, f - 0.035, f + 0.035, 10, r + 6, 0.12, '#ffffff');
    const tx = P.x + Math.cos(f) * (r + 4), ty = y + Math.sin(f) * (r + 4);
    ring(tx, ty, 1, a.finisher ? 12 : 7, 0.2, '#ffffff', 1);
    for (let i = 0; i < 4; i++) part({ x: tx, y: ty, vx: Math.cos(f + rand(-0.5, 0.5)) * 70, vy: Math.sin(f + rand(-0.5, 0.5)) * 70, life: 0.18, color: i % 2 ? col : '#fff6e0', size: 0.5, drag: 6 });
  } else if (style === 'axe') {
    // labrys: two blades = two arcs, outer edge and an inner echo; the finisher is a whirl
    smear(x, y, f - half * 1.05, f + half * 1.05, r * 0.55, r + 3, 0.24, col);
    smear(x, y, f - half * 0.9, f + half * 0.9, r * 0.72, r, 0.16, metal);
    smear(x, y, f - half * 0.7 + Math.PI, f + half * 0.7 + Math.PI, r * 0.5, r * 0.75, 0.14, metal);
    if (a.spin) { ring(x, y, 6, r + 4, 0.3, col, 2); burst(P.x, P.y, 16, '#8c1c33', 80, { grav: 60 }); }
  } else if (style === 'chop') {
    // pelekys: an overhead chop slammed into the floor, a crack runs ahead
    smear(x, y, f - half, f + half, r * 0.35, r + 3, 0.28, '#3b2a22');
    smear(x, y, f - half * 0.8, f + half * 0.8, r * 0.55, r, 0.18, metal);
    const tx = P.x + Math.cos(f) * r * 0.9, ty = P.y + Math.sin(f) * r * 0.9;
    for (let i = 1; i <= (a.finisher ? 5 : 3); i++) burst(tx + Math.cos(f) * i * 6, ty + Math.sin(f) * i * 6, 3, '#5c4a3a', 40, { grav: 80, size: 1.5 });
    ring(tx, ty, 2, a.finisher ? 22 : 14, 0.3, '#8a7c68', 2);
  } else if (style === 'cleave') {
    // titan's cleaver: an enormous dark slab of an arc, heavy dust and a white edge
    smear(x, y, f - half * 1.05, f + half * 1.05, r * 0.2, r + 6, 0.36, '#2a2530');
    smear(x, y, f - half, f + half, r * 0.55, r + 3, 0.26, metal);
    smear(x, y, f - half * 0.9, f + half * 0.9, r * 0.85, r + 1, 0.18, col);
    burst(P.x + Math.cos(f) * r * 0.7, P.y + Math.sin(f) * r * 0.7, a.finisher ? 30 : 16, '#6b5f52', 120, { grav: 80, size: 2 });
    if (a.finisher) { ring(P.x, P.y, 6, r + 10, 0.4, '#b8aa90', 3); shake(0.3); }
  } else {
    smear(x, y, f - half * 1.08, f + half * 1.08, Math.max(6, r * 0.45), r + 3, heavy ? 0.26 : 0.2, col);
    smear(x, y, f - half * 0.95, f + half * 0.95, Math.max(8, r * 0.7), r, heavy ? 0.16 : 0.12, metal);
    if (a.bash) { const tx = P.x + Math.cos(f) * 14, ty = y + Math.sin(f) * 14; ring(tx, ty, 2, 18, 0.25, '#f0d9a0', 2); burst(tx, ty, 10, '#f0d9a0', 80); }
  }
  if (a.spin && style !== 'axe') ring(x, y, 4, r, 0.25, col, 2);
  for (let i = 0; i < (heavy ? 10 : 5); i++) { const aa = f + rand(-half, half); part({ x: P.x + Math.cos(aa) * r * 0.8, y: y + Math.sin(aa) * r * 0.8, vx: Math.cos(aa) * 40, vy: Math.sin(aa) * 40, life: 0.25, color: i % 2 ? col : '#fff6e0', size: 0.5, drag: 6 }); }
}

// white slash streak across the target: sells every hit
function slashMark(x, y, ang, len) {
  for (let i = -len; i <= len; i += 0.5) {
    const k = 1 - Math.abs(i) / len;
    G.parts.push({ x: x + Math.cos(ang) * i, y: y + Math.sin(ang) * i, vx: 0, vy: 0, life: 0.12 + 0.1 * k, max: 0.22, size: k > 0.5 ? 1 : 0.5, color: '#ffffff', drag: 0, grav: 0, z: 0, vz: 0 });
  }
}

function fireBolt(P) {
  const b = P.C.bolt, s = P.s;
  P.shots++;
  const big = lv('c_overheat') && P.shots % 5 === 0;
  const arch = s.archmage && P.shots % 4 === 0;
  const sp = b.speed * s.projSpeed;
  // Hecate's staff (divine): every bolt is three
  const fan = s.leg.w_staff ? [-0.28, 0, 0.28] : [0];
  const twin = lv('h_twin') && ++P.twinN % 3 === 0;
  for (const off of fan) {
    const a = P.face + off;
    const pr = {
      owner: 'player', kind: 'bolt', x: P.x + Math.cos(a) * 8, y: P.y - 6 + Math.sin(a) * 8,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: big ? 6 : b.r, dmg: b.dmg * (big ? 2.5 : 1) * (off ? 0.6 : 1), type: 'arcane',
      life: b.life * s.projSpeed, pierce: arch ? 2 : 0, hit: new Set(), color: P.aura ? P.auraCol : '#b88cff', homing: b.homing * (arch ? 3 : 1), big: big && !off, split: lv('c_split') > 0,
    };
    G.projs.push(pr);
    if (twin && !off) later(0.12, () => G.projs.push({ ...pr, x: P.x, y: P.y - 6, hit: new Set(), color: '#b88cff', dmg: pr.dmg * (0.4 + 0.3 * lv('h_twin')), big: false }));
  }
  sfx.magic(); kick(-Math.cos(P.face), -Math.sin(P.face), 1);
  burst(P.x + Math.cos(P.face) * 9, P.y - 6 + Math.sin(P.face) * 9, 4, '#b88cff', 50, { ang: P.face, spread: 0.6 });
}

function fireArrow(P) {
  const A = P.C.arrow, s = P.s;
  const c = P.charge, full = c >= 1;
  const t = Math.pow(c, 1.5);
  const dmg = lerp(A.dmg, A.chargedDmg, t);
  const sp = lerp(A.speed, A.chargedSpeed, t) * s.projSpeed;
  useSta(P, full ? A.chargedSta : A.sta);
  const pierce = (full ? A.chargedPierce : 0) + (lv('c_pierce') ? 1 : 0) + (full && s.hawkeye ? 99 : 0);
  P.shotN++;
  const sun = s.leg.w_bow && P.shotN % 4 === 0; // Apollo's bow: every 4th arrow is a sunbeam
  const fan = lv('c_quick') && P.shotN % 3 === 0 ? [-0.18, 0, 0.18] : [0];
  const twin = lv('h_twin') && ++P.twinN % 3 === 0;
  for (const off of fan) {
    const a = P.face + off;
    const pr = {
      owner: 'player', kind: sun && !off ? 'sunbeam' : 'arrow', x: P.x + Math.cos(a) * 6, y: P.y - 6 + Math.sin(a) * 6,
      vx: Math.cos(a) * sp * (sun ? 1.5 : 1), vy: Math.sin(a) * sp * (sun ? 1.5 : 1), r: sun ? 4 : 3, dmg: dmg * (sun ? 1.6 : 1), type: 'pierce', life: 0.9, pierce: sun ? 99 : pierce, hit: new Set(),
      color: sun ? '#ffd36b' : P.auraCol, full, shieldBreak: full || sun, critBonus: full ? s.chargedCrit : 0, forceCrit: full && s.hawkeye,
    };
    G.projs.push(pr);
    if (twin && !off) later(0.1, () => G.projs.push({ ...pr, x: P.x, y: P.y - 6, hit: new Set(), color: '#b88cff', dmg: pr.dmg * (0.4 + 0.3 * lv('h_twin')) }));
  }
  sfx.bow(c); kick(-Math.cos(P.face), -Math.sin(P.face), full ? 3 : 1);
  if (full) shake(0.08);
  P.atk = { wind: 0, act: 0.06, rec: 0.22, kind: 'arrow' };
  P.setState('attack'); P.phase = 'act'; P.charge = 0;
}

export function safeTarget(P, tx, ty) {
  for (let i = 0; i < 12; i++) {
    const v = tileAt(G.room, tx, ty);
    if (!solidT(v) && v !== T.CHASM) return { x: tx, y: ty };
    tx = lerp(tx, P.x, 0.2); ty = lerp(ty, P.y, 0.2);
  }
  return { x: P.x, y: P.y };
}
function tryFlask(P) {
  if (P.flasks <= 0) { text(P.x, P.y - 20, 'пусто', '#8189a0'); return; }
  P.flasks--; P.setState('flask');
}

// ---------------- cloth (verlet scarf/cape in class colour) ----------------
function updateCloth(P, dt) {
  const ax = P.x - P.faceX * 2, ay = P.y - 9 - (P.jumpZ || 0);
  const pts = P.cloth;
  pts[0].x = ax; pts[0].y = ay;
  const g = 60, drag = 0.86;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag;
    p.px = p.x; p.py = p.y;
    p.x += vx - P.faceX * 0.25 + Math.sin(G.real * 3 + i) * 0.05; p.y += vy + g * dt * dt * 6;
  }
  const seg = 2.2;
  for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const diff = (d - seg) / d;
    b.x -= dx * diff; b.y -= dy * diff;
  }
}

// ---------------- drawing ----------------
export function drawPlayer(g, P) {
  const H = P.frames;
  const moving = Math.hypot(P.vx, P.vy) > 12;
  let spr;
  if (P.state === 'move' && moving) {
    // 4-frame cycle, frame time scales with speed (~100ms at full run, per animator timing)
    const f = Math.floor((P.animT * Math.hypot(P.vx, P.vy)) / 9) % 4;
    spr = H.run[f];
  } else spr = H.idle[Math.floor(P.animT / 0.5) % 2]; // 2-frame breathing, 500ms ping-pong
  if (P.state === 'dead') return;
  // squash & stretch springs back to 1
  P.sq = damp(P.sq, 1, 12, 1 / 60);
  let sx = P.flipS, sy = 1;
  if (P.state === 'dodge') { const k = P.st / P.s.dodgeTime; sy = 0.78 + 0.22 * k; sx *= 1.15 - 0.15 * k; }
  else if (P.state === 'attack' && P.phase === 'wind') { const k = Math.min(1, P.st / (P.atk.wind || 0.1)); sy = 1 - 0.1 * k; sx *= 1 + 0.06 * k; }
  else if (P.state === 'attack' && P.phase === 'act') { sy = 1.1; sx *= 0.94; }
  else if (P.state === 'fall') { const k = Math.min(1, P.st / 0.5); sy = 1 - k; sx *= 1 - k; }
  sy *= P.sq; sx *= 2 - P.sq;
  const bob = P.state === 'move' && moving ? -Math.abs(Math.sin(P.animT * Math.hypot(P.vx, P.vy) / 9 * Math.PI / 2)) : 0;
  const z = P.jumpZ || 0;
  for (const a of P.afterimg) drawSprite(g, spr, a.x, a.y, { flip: a.flip, alpha: 0.35 * (1 - a.t / 0.25), white: true });
  if (P.slowT > 0) { g.globalAlpha = 0.5; g.fillStyle = '#93e2ff'; pcircle(g, P.x, P.y, 7, 3); g.globalAlpha = 1; }
  if (P.domeT > 0) { g.globalAlpha = 0.18 + 0.08 * Math.sin(G.real * 12); g.fillStyle = '#ffd36b'; pcircle(g, P.x, P.y - 6, 16, 14); g.globalAlpha = 0.8; g.strokeStyle = '#fff3d0'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(rp(P.x), rp(P.y - 6), 16, 14, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  if (P.state === 'power') {
    // charge aura: grows with the stamina poured in; four tiers, white at full
    const pw = P.power / P.s.maxSta, R = 8 + 18 * pw, col = pw > 0.97 ? '#ffffff' : P.accent[0];
    g.globalAlpha = 0.18 + 0.2 * pw; g.fillStyle = col; pcircle(g, P.x, P.y, R, R * 0.45);
    g.globalAlpha = 0.9; g.strokeStyle = col; g.lineWidth = 0.75;
    g.beginPath(); g.ellipse(rp(P.x), rp(P.y), R, R * 0.45, 0, -Math.PI / 2, -Math.PI / 2 + TAU * pw); g.stroke();
    g.globalAlpha = 1;
  }
  // cloth behind body
  const back = Math.sin(P.face) < -0.3;
  if (!back) drawCloth(g, P);
  // weapon behind when facing up
  if (back) drawWeapon(g, P, z);
  const blink = P.inv > 0 && P.state !== 'dodge' && Math.floor(G.real * 20) % 2 === 0;
  drawSprite(g, spr, P.x, P.y + bob - z, { sx, sy, white: P.flash > 0, alpha: P.invisT > 0 ? 0.3 : blink ? 0.45 : 1 });
  if (P.state === 'stun') for (let i = 0; i < 3; i++) { const aa = G.real * 6 + (i * TAU) / 3; g.fillStyle = i ? '#ffd36b' : '#ffffff'; g.fillRect(rp(P.x + Math.cos(aa) * 5), rp(P.y - 19 + Math.sin(aa) * 1.5), 1, 1); }
  if (P.rageT > 0 && Math.random() < 0.4) part({ x: P.x + rand(-5, 5), y: P.y - rand(0, 14), vx: 0, vy: -30, life: 0.3, color: '#ff3355', size: 1, drag: 1, glow: true });
  if (back) drawCloth(g, P);
  if (!back) drawWeapon(g, P, z);
  if (P.frostShield > 0) { g.globalAlpha = 0.5; g.fillStyle = '#93e2ff'; g.fillRect(rp(P.x - 7), rp(P.y - 17), 14, 0.5); g.globalAlpha = 1; }
  if (P.sapT > 0) { g.globalAlpha = 0.4 + 0.3 * Math.sin(G.real * 10); g.fillStyle = '#ffb347'; g.fillRect(rp(P.x - 6), rp(P.y + 1), 12, 0.5); g.globalAlpha = 1; }
}
function drawCloth(g, P) {
  // verlet scarf, drawn at half-pixel resolution for a soft, continuous ribbon
  const pts = P.cloth, n = pts.length;
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1], b = pts[i], w = 2 - (i / n) * 1.5;
    for (let t = 0; t < 1; t += 0.34) {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      g.fillStyle = P.accent[1]; g.fillRect(rp(x - w / 2), rp(y), rp(w), 1.5);
      g.fillStyle = P.accent[0]; g.fillRect(rp(x - w / 2), rp(y), rp(w * 0.6), 0.5);
    }
  }
}
function weaponAngle(P, st) {
  const a = P.atk, half = (a.arc * Math.PI) / 360, rate = atkRate(P);
  if (P.C.style === 'thrust') {
    // dory: pull back, then drive the point straight out along the facing
    if (P.phase === 'wind') { const k = ease.outCubic(Math.min(1, st / (a.wind / rate))); return [P.face, 2 - k * 6]; }
    if (P.phase === 'act') { const k = ease.outQuart(Math.min(1, st / (a.act / rate))); return [P.face, -4 + k * 16]; }
    const k = ease.inOutSine(Math.min(1, st / (a.rec / rate))); return [P.face, 12 - 9 * k];
  }
  if (P.C.style === 'chop' || P.C.style === 'cleave') {
    // overhead: the blade rises high behind, then falls through the facing
    const side = P.combo % 2 === 0 ? 1 : -1, up = half * 1.4;
    if (P.phase === 'wind') { const k = ease.outCubic(Math.min(1, st / (a.wind / rate))); return [P.face - side * up * k, 3 - k * 3]; }
    if (P.phase === 'act') { const k = Math.min(1, st / (a.act / rate)); return [P.face - side * up + side * up * 1.8 * k * k, 7]; }
    const k = ease.inOutSine(Math.min(1, st / (a.rec / rate))); return [P.face + side * up * 0.8 * (1 - k), 7 - 3 * k];
  }
  const side = P.combo % 2 === 0 ? 1 : -1;
  if (P.phase === 'wind') { const k = ease.outCubic(Math.min(1, st / (a.wind / rate))); return [P.face - side * half * 1.15 * k, 3 - k * 2]; }
  if (P.phase === 'act') { const k = ease.outQuart(Math.min(1, st / (a.act / rate))); return [P.face - side * half * 1.15 + side * half * 2.3 * k, 8]; }
  const k = ease.inOutSine(Math.min(1, st / (a.rec / rate))); return [P.face + side * half * 1.15 * (1 - k), 8 - 4 * k];
}
function drawWeapon(g, P, z) {
  const key = P.C.sprite;
  const spr = weaponSprite(key, P.wr);
  const melee = P.state === 'attack' && P.atk?.kind === 'melee';
  const powering = P.state === 'power';
  const pw = powering ? P.power / P.s.maxSta : 0;
  const put = (a, r, alpha, hand = 0) => {
    const hx = P.x + Math.cos(a) * r - P.faceX * hand * 3, hy = P.y - 6 - z + Math.sin(a) * r * 0.8 + hand * 1.5;
    g.save(); g.globalAlpha = alpha;
    g.translate(rp(hx), rp(hy)); g.rotate(a);
    // titanic/divine weapons glow (soft pulsing silhouette behind the blade)
    if (spr.glow && alpha > 0.9) { g.globalAlpha = 0.35 + 0.25 * Math.sin(G.real * 5); g.drawImage(spr.glow, -3, -spr.h / 2 - 1, spr.w + 2, spr.h + 2); g.globalAlpha = alpha; }
    g.drawImage(spr.c, -2, -spr.h / 2, spr.w, spr.h);
    return g;
  };
  let ang = P.face, reach = 4;
  if (melee) {
    [ang, reach] = weaponAngle(P, P.st);
    if (P.atk.spin) ang = P.face + (P.phase === 'act' ? TAU * Math.min(1, P.st / P.atk.act) : 0);
  } else if (P.state === 'attack' && P.atk?.kind === 'power' && P.atk.spinT && P.st < P.atk.spinT) { ang = P.face + G.real * 22; reach = 6; }
  else if (powering) {
    // weapon drawn back over the shoulder, trembling with the stored power
    ang = P.face + Math.PI * (P.faceX > 0 ? -0.75 : 0.75) + Math.sin(G.real * 40) * 0.05 * pw; reach = 4;
    if (key === 'bow' || key === 'staff') ang = P.face;
    if (key === 'spear') { ang = P.face + Math.sin(G.real * 40) * 0.04 * pw; reach = -6 - pw * 4; }
  } else if (key === 'bow') reach = 5;
  else if (key === 'spear') { ang = P.face + (P.faceX > 0 ? 0.25 : -0.25) + Math.sin(P.animT * 2) * 0.04; reach = 0; }
  else if (key === 'staff') { ang = P.face; reach = 3; }
  else { ang = P.face + (P.faceX > 0 ? 0.9 : -0.9) * 0.6 + Math.sin(P.animT * 2) * 0.05; reach = 3; }

  if (key === 'dagger') {
    // twin machairai: one blade per hand, they alternate; the finisher swings both
    const side = P.combo % 2 === 0;
    const both = melee && P.atk.finisher;
    const idleA = P.face + (P.faceX > 0 ? -1.1 : 1.1) + Math.sin(P.animT * 2 + 1) * 0.05;
    const backAng = melee ? (both ? P.face * 2 - ang : side ? idleA : ang) : powering ? ang + 0.5 : idleA;
    const frontAng = melee ? (both || side ? ang : idleA) : ang;
    put(backAng, melee && !side && !both ? reach : 2, 1, 1).restore();
    if (melee && P.phase === 'act') for (const [dt, al] of [[0.04, 0.2], [0.02, 0.4]]) { const [a2, r2] = weaponAngle(P, Math.max(0, P.st - dt)); put(a2, r2, al).restore(); }
    put(frontAng, melee && (side || both) ? reach : 3, 1).restore();
    return;
  }
  if (melee && P.phase === 'act') for (const [dt, al] of [[0.05, 0.18], [0.03, 0.3], [0.015, 0.45]]) { const [a2, r2] = weaponAngle(P, Math.max(0, P.st - dt)); put(a2, r2, al).restore(); }
  const w = put(ang, reach, 1);
  // tip of the blade (aura particles spawn there)
  P.tipX = P.x + Math.cos(ang) * (reach + spr.w * 0.8); P.tipY = P.y - 6 - z + Math.sin(ang) * (reach + spr.w * 0.8) * 0.8;
  if (P.aura && P.aura.l >= 2) { w.globalAlpha = Math.min(0.55, 0.15 + 0.08 * P.aura.l) * (0.75 + 0.25 * Math.sin(G.real * 7)); const t = weaponTint(key, P.wr, P.auraCol); w.drawImage(t, -3, -spr.h / 2 - 1, spr.w + 2, spr.h + 2); w.globalAlpha = 1; w.drawImage(spr.c, -2, -spr.h / 2, spr.w, spr.h); }
  if (key === 'bow' && powering) {
    const pull = pw * 5, ar = SPR.weapon['arrow_' + (P.s.element || 'none')];
    w.drawImage(ar.c, -pull - 2, -ar.h / 2, ar.w, ar.h);
    if (pw > 0.95 && Math.floor(G.real * 12) % 2 === 0) { w.fillStyle = '#ffffff'; w.fillRect(5, -1, 2, 2); }
  }
  if (key === 'staff') { w.globalAlpha = 0.5 + 0.3 * Math.sin(G.real * 6); w.fillStyle = P.aura ? P.auraCol : '#b88cff'; const o = 2 + pw * 3; w.fillRect(15 - o / 2, -o / 2, o, o); }
  w.restore();
  if (P.C.shield) {
    // aspis on the off arm: raised to the front while not swinging (it blocks frontal hits and missiles)
    const sh = weaponSprite('shield', P.wr), up = !melee && P.state !== 'dodge';
    const d = up ? 6 : 3, side = up ? 0.55 : 1.4;
    const sa = P.face - P.faceX * side;
    const sx = P.x + Math.cos(sa) * d, sy = P.y - 6 - z + Math.sin(sa) * d * 0.8;
    if (sh.glow) { g.globalAlpha = 0.3 + 0.2 * Math.sin(G.real * 5); g.drawImage(sh.glow, rp(sx - sh.w / 2 - 1), rp(sy - sh.h / 2 - 1), sh.w + 2, sh.h + 2); g.globalAlpha = 1; }
    g.drawImage(sh.c, rp(sx - sh.w / 2), rp(sy - sh.h / 2), sh.w, sh.h);
    if (P.blockT > G.real) { g.globalAlpha = 0.7; g.fillStyle = '#ffffff'; g.fillRect(rp(sx - 3), rp(sy - 3), 6, 6); g.globalAlpha = 1; }
  }
}
