// The hero. State machine: move | attack | charge | dodge | skill | flask | hurt | fall | dead.
// Souls-like commitment: windups cannot be cancelled; recovery can be cancelled into a dodge.
import { G } from './state.js';
import { CLASSES } from '../data/classes.js';
import { input } from '../engine/input.js';
import { damp, angTo, angDiff, dist, clamp, lerp, ease, TAU, rand } from '../engine/util.js';
import { drawSprite } from '../engine/sprite.js';
import { burst, smear, ring, shake, text, kick, part, flash } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR } from '../art/bank.js';
import { collide, moveCollide, tileAt, T, TS, spikeState, solidT } from './world.js';
import { hitEnemy, hurtPlayer, lv, reso, nova, dotScale, floorScale, bolt, chillE } from './combat.js';

export function createPlayer(cls, stats, x, y) {
  const C = CLASSES[cls];
  const P = {
    cls, C, s: stats, x, y, vx: 0, vy: 0, r: 4,
    hp: stats.maxHp, sta: stats.maxSta, staDelay: 0, rally: 0, rallyT: 0, rallyGlow: 0,
    state: 'move', st: 0, face: -Math.PI / 2, faceX: 1, flipS: 1,
    combo: 0, comboWin: 0, struck: false, atk: null, phase: 'wind',
    dodge: { dx: 0, dy: 1 }, dodgeAge: 0, iframe: 0, inv: 0, perfectDone: false,
    flasks: stats.flasks, skillCd: 0, charge: 0, flash: 0, nextCrit: false,
    animT: 0, sq: 1, lastSafe: { x, y }, afterimg: [], cloth: [], frostShield: 0, frostCd: 0,
    arcaneUp: stats.arcaneShield, shots: 0, dead: false, hyperNow: false, tempestT: 0,
    setState(s) { this.state = s; this.st = 0; },
    die() { this.dead = true; this.setState('dead'); G.onPlayerDeath?.(); },
  };
  for (let i = 0; i < 6; i++) P.cloth.push({ x, y: y - 8, px: x, py: y - 8 });
  return P;
}

const atkRate = (P) => {
  let r = P.s.atkSpeed;
  if (lv('b_frenzy')) r *= 1 + 0.04 * lv('b_frenzy') * Math.floor((1 - P.hp / P.s.maxHp) * 10);
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
  P.skillCd = Math.max(0, P.skillCd - dt);
  P.comboWin = Math.max(0, P.comboWin - dt);
  P.hyperNow = false;
  if (P.dead) return;
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
  let speed = s.speed;
  switch (P.state) {
    case 'move': {
      const k = moving ? 22 : 16;
      P.vx = damp(P.vx, mx * speed, k, dt); P.vy = damp(P.vy, my * speed, k, dt);
      if (input.pressed('dodge')) tryDodge(P, mx, my);
      else if (input.pressed('skill')) trySkill(P);
      else if (input.pressed('flask')) tryFlask(P);
      else if (input.peek('attack')) startAttack(P);
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
    case 'skill': updateSkill(P, dt); break;
    case 'flask': {
      P.vx = damp(P.vx, mx * speed * 0.35, 12, dt); P.vy = damp(P.vy, my * speed * 0.35, 12, dt);
      if (Math.random() < dt * 30) part({ x: P.x + rand(-5, 5), y: P.y - rand(0, 12), vx: 0, vy: -20, life: 0.5, color: '#93e2ff', size: 1, drag: 1 });
      if (P.st >= 0.85) {
        const heal = s.maxHp * s.flaskHeal * s.healMul;
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
  if (P.state !== 'dodge' && !(P.state === 'skill' && P.cls === 'rogue')) for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(P.x, P.y, e.x, e.y), m = P.r + e.r;
    if (d < m && d > 0) { const push = (m - d) * 0.6; moveCollide(G.room, P, ((P.x - e.x) / d) * push, ((P.y - e.y) / d) * push); }
  }
  collide(G.room, P);
  // terrain
  const tile = tileAt(G.room, P.x, P.y);
  if (tile === T.CHASM && P.state !== 'dodge' && !(P.state === 'skill' && P.cls !== 'mage')) { P.setState('fall'); sfx.fall(); text(P.x, P.y - 18, 'падение', '#8189a0'); return; }
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
  if (lv('f_cinder') && Math.random() < dt * 25) G.zones.push({ x: P.x, y: P.y, r: 7, t: 0, life: 2.2, dps: (6 + 4 * lv('f_cinder')) * dotScale(), type: 'fire', color: '#ff8f3a', tick: 0 });
  if (lv('s_conduit')) for (const e of G.enemies) if (!e.dead && !P.conduitHit.has(e) && dist(P.x, P.y, e.x, e.y) < e.r + 6) { P.conduitHit.add(e); hitEnemy(e, (6 + 6 * lv('s_conduit')) * dotScale(), { type: 'shock', noProc: true, knock: 10 }); }
  if (k >= 1) {
    P.setState('move');
    if (reso('frost', 2)) { ring(P.x, P.y, 2, 40, 0.35, '#93e2ff'); for (const e of G.enemies) if (!e.dead && dist(P.x, P.y, e.x, e.y) < 40) chillE(e, 3); }
    if (reso('shadow', 1)) P.shadowCrit = true;
    P.sq = 0.75;
  }
  if (input.pressed('attack') && k > 0.6) { P.setState('move'); input.buf.attack = 0.15; }
}

// ---------------- attacks ----------------
function startAttack(P) {
  const C = P.C;
  if (C.arrow) {
    input.pressed('attack');
    if (!useSta(P, 0)) return;
    P.setState('charge'); P.charge = 0; P.chargeFull = false; sfx.bow(0);
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
  useSta(P, P.atk.sta);
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
  if (P.phase === 'wind') {
    P.vx = damp(P.vx, 0, 14, dt); P.vy = damp(P.vy, 0, 14, dt);
    // slight aim correction during windup (readable, not twitchy)
    const aim = !input.touch && input.mouse.inside ? angTo(P.x, P.y - 5, G.mouseWorld.x, G.mouseWorld.y) : autoAim(P);
    P.face += angDiff(P.face, aim) * Math.min(1, dt * 12);
    if (P.st >= wind) { P.phase = 'act'; P.st = 0; strike(P); }
  } else if (P.phase === 'act') {
    if (a.lunge) { const v = a.lunge / Math.max(0.05, act); P.vx = Math.cos(P.face) * v; P.vy = Math.sin(P.face) * v; }
    if (P.st >= act) { P.phase = 'rec'; P.st = 0; }
  } else {
    P.vx = damp(P.vx, mx * P.s.speed * 0.25, 12, dt); P.vy = damp(P.vy, my * P.s.speed * 0.25, 12, dt);
    // cancel recovery into a dodge (Dead Cells responsiveness) — never the windup (souls commitment)
    if (input.pressed('dodge')) { P.comboWin = 0; tryDodge(P, mx, my); return; }
    if (P.st > rec * 0.35 && input.peek('attack')) {
      if (a.kind === 'melee') { const list = comboList(P); P.combo = (P.combo + 1) % list.length; P.comboWin = 1; }
      P.setState('move'); startAttack(P); return;
    }
    if (P.st >= rec) { if (a.kind === 'melee') { P.combo = (P.combo + 1) % comboList(P).length; P.comboWin = 0.35; if (a.finisher) P.combo = 0; } P.setState('move'); }
  }
}

function strike(P) {
  const a = P.atk, s = P.s;
  if (a.kind === 'bolt') { fireBolt(P); return; }
  const half = (a.arc * Math.PI) / 360;
  const r = a.range;
  const heavy = !!a.hyper;
  smear(P.x, P.y - 5, P.face - half * 1.05, P.face + half * 1.05, Math.max(4, r - 12), r, heavy ? 0.22 : 0.16, P.C.accent[0]);
  if (a.spin) ring(P.x, P.y - 5, 4, r, 0.25, P.C.accent[0], 2);
  sfx.swing(heavy);
  let any = false;
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(P.x, P.y - 4, e.x, e.y - 4);
    if (d > r + e.r) continue;
    if (a.arc < 360 && Math.abs(angDiff(P.face, angTo(P.x, P.y - 4, e.x, e.y - 4))) > half + 0.2) continue;
    any = true;
    hitEnemy(e, a.dmg, { type: P.C.dmgType, knock: heavy ? 90 : 35, heavy, shieldBreak: P.C.guardBreak && heavy, poiseMul: a.finisher ? 1.5 : 1 });
  }
  if (any && heavy) shake(0.2);
  kick(Math.cos(P.face), Math.sin(P.face), heavy ? 2.5 : 1);
  if (a.finisher) {
    if (lv('c_quake')) G.projs.push({ owner: 'player', kind: 'wave', x: P.x, y: P.y - 3, vx: Math.cos(P.face) * 170, vy: Math.sin(P.face) * 170, r: 8, dmg: 25 * s.dmgMul, type: 'slash', life: 0.6, pierce: 99, hit: new Set(), color: P.C.accent[0], noProc: true, knock: 60 });
    if (s.bladeDance) G.projs.push({ owner: 'player', kind: 'blade', x: P.x, y: P.y - 5, vx: Math.cos(P.face) * 220, vy: Math.sin(P.face) * 220, r: 4, dmg: 15 * s.dmgMul, type: 'shadow', life: 0.5, pierce: 3, hit: new Set(), color: '#b88cff' });
  }
}

function fireBolt(P) {
  const b = P.C.bolt, s = P.s;
  P.shots++;
  const big = lv('c_overheat') && P.shots % 5 === 0;
  const arch = s.archmage && P.shots % 4 === 0;
  const sp = b.speed * s.projSpeed;
  G.projs.push({
    owner: 'player', kind: 'bolt', x: P.x + Math.cos(P.face) * 8, y: P.y - 6 + Math.sin(P.face) * 8,
    vx: Math.cos(P.face) * sp, vy: Math.sin(P.face) * sp, r: big ? 6 : b.r, dmg: b.dmg * (big ? 2.5 : 1), type: 'arcane',
    life: b.life * s.projSpeed, pierce: arch ? 2 : 0, hit: new Set(), color: '#b88cff', homing: b.homing * (arch ? 3 : 1), big, split: lv('c_split') > 0,
  });
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
  G.projs.push({
    owner: 'player', kind: 'arrow', x: P.x + Math.cos(P.face) * 6, y: P.y - 6 + Math.sin(P.face) * 6,
    vx: Math.cos(P.face) * sp, vy: Math.sin(P.face) * sp, r: 3, dmg, type: 'pierce', life: 0.9, pierce, hit: new Set(),
    color: P.C.accent[0], full, shieldBreak: full, critBonus: full ? s.chargedCrit : 0, forceCrit: full && s.hawkeye,
  });
  sfx.bow(c); kick(-Math.cos(P.face), -Math.sin(P.face), full ? 3 : 1);
  if (full) shake(0.08);
  P.atk = { wind: 0, act: 0.06, rec: 0.22, kind: 'arrow' };
  P.setState('attack'); P.phase = 'act'; P.charge = 0;
}

// ---------------- skills ----------------
function trySkill(P) {
  if (P.skillCd > 0) { text(P.x, P.y - 20, Math.ceil(P.skillCd) + ' с', '#8189a0'); return; }
  P.skillCd = P.C.skill.cd * P.s.skillCd;
  P.setState('skill'); P.skillHit = new Set();
  const a = P.face;
  if (lv('f_flare')) nova(P.x, P.y, 44, (15 + 10 * lv('f_flare')) * dotScale(), 'fire', '#ff8f3a');
  if (P.cls === 'rogue') { P.iframe = 0.22; sfx.dodge(); P.skillDir = a; }
  if (P.cls === 'warrior') { P.iframe = 0.1; P.skillFrom = { x: P.x, y: P.y }; const L = 46; P.skillTo = safeTarget(P, P.x + Math.cos(a) * L, P.y + Math.sin(a) * L); sfx.swing(true); }
  if (P.cls === 'mage') {
    const ox = P.x, oy = P.y;
    let dx = input.move.x, dy = input.move.y;
    if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(a); dy = Math.sin(a); }
    const l = Math.hypot(dx, dy);
    const to = safeTarget(P, P.x + (dx / l) * 80, P.y + (dy / l) * 80);
    burst(P.x, P.y - 6, 16, '#b88cff', 60);
    P.x = to.x; P.y = to.y; P.iframe = 0.25;
    burst(P.x, P.y - 6, 16, '#b88cff', 60);
    G.hazards.push({ kind: 'circle', x: ox, y: oy, r: 44, t: 0, wind: 0.18, dmg: 30 * P.s.dmgMul, owner: 'player', color: '#b88cff', type: 'arcane' });
    sfx.magic(); P.sq = 0.6;
  }
  if (P.cls === 'archer') { P.iframe = 0.18; P.skillDir = a; sfx.dodge(); }
}
function safeTarget(P, tx, ty) {
  for (let i = 0; i < 12; i++) {
    const v = tileAt(G.room, tx, ty);
    if (!solidT(v) && v !== T.CHASM) return { x: tx, y: ty };
    tx = lerp(tx, P.x, 0.2); ty = lerp(ty, P.y, 0.2);
  }
  return { x: P.x, y: P.y };
}
function updateSkill(P, dt) {
  const s = P.s;
  if (P.cls === 'rogue') {
    const D = 0.16;
    const v = 72 / D;
    P.vx = Math.cos(P.skillDir) * v; P.vy = Math.sin(P.skillDir) * v;
    P.afterimg.push({ x: P.x, y: P.y, t: 0, flip: P.faceX < 0, col: true });
    for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && !P.skillHit.has(e) && dist(P.x, P.y, e.x, e.y) < e.r + 8) { P.skillHit.add(e); hitEnemy(e, 22, { type: 'slash', knock: 20, venom: 3 }); }
    if (P.st >= D) { P.nextCrit = true; P.setState('move'); P.vx *= 0.2; P.vy *= 0.2; P.sq = 0.7; }
  } else if (P.cls === 'warrior') {
    const D = 0.42, k = Math.min(1, P.st / D);
    const e = ease.inOutSine(k);
    P.x = lerp(P.skillFrom.x, P.skillTo.x, e); P.y = lerp(P.skillFrom.y, P.skillTo.y, e);
    P.vx = 0; P.vy = 0; P.hyperNow = true; P.jumpZ = Math.sin(k * Math.PI) * 18;
    if (k >= 1) {
      P.jumpZ = 0;
      const R = 52 * s.slamR;
      ring(P.x, P.y, 3, R, 0.4, P.C.accent[0], 2); burst(P.x, P.y, 26, '#8a7c68', 120, { grav: 50 });
      for (const en of G.enemies) if (!en.dead && en.spawnT <= 0 && dist(P.x, P.y, en.x, en.y) < R + en.r) hitEnemy(en, 50, { type: 'slash', knock: 120, heavy: true, shieldBreak: true, poiseMul: 3 });
      shake(0.5); sfx.boom(); P.sq = 0.6;
      P.setState('move');
    }
  } else if (P.cls === 'mage') {
    if (P.st > 0.12) P.setState('move');
  } else if (P.cls === 'archer') {
    const D = 0.15;
    if (P.st < D) { const v = 30 / D; P.vx = -Math.cos(P.skillDir) * v; P.vy = -Math.sin(P.skillDir) * v; }
    else {
      const n = 7 + s.volleyExtra, spread = 0.9;
      for (let i = 0; i < n; i++) {
        const a = P.skillDir - spread / 2 + (spread * i) / (n - 1);
        G.projs.push({ owner: 'player', kind: 'arrow', x: P.x, y: P.y - 6, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 3, dmg: 12, type: 'pierce', life: 0.7, pierce: 1 + (lv('c_pierce') ? 1 : 0), hit: new Set(), color: P.C.accent[0] });
      }
      sfx.bow(1); shake(0.1); P.vx = 0; P.vy = 0;
      P.setState('move');
    }
  }
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
  const H = SPR.hero[P.cls];
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
  // cloth behind body
  const back = Math.sin(P.face) < -0.3;
  if (!back) drawCloth(g, P);
  // weapon behind when facing up
  if (back) drawWeapon(g, P, z);
  const blink = P.inv > 0 && P.state !== 'dodge' && Math.floor(G.real * 20) % 2 === 0;
  drawSprite(g, spr, P.x, P.y + bob - z, { sx, sy, white: P.flash > 0, alpha: blink ? 0.45 : 1 });
  if (back) drawCloth(g, P);
  if (!back) drawWeapon(g, P, z);
  if (P.frostShield > 0) { g.globalAlpha = 0.5; g.fillStyle = '#93e2ff'; g.fillRect(Math.round(P.x - 7), Math.round(P.y - 17), 14, 1); g.globalAlpha = 1; }
}
function drawCloth(g, P) {
  const pts = P.cloth;
  g.fillStyle = P.C.accent[1];
  for (let i = 1; i < pts.length; i++) {
    const w = i < pts.length - 2 ? 2 : 1;
    g.fillRect(Math.round(pts[i].x), Math.round(pts[i].y), w, 2);
  }
  g.fillStyle = P.C.accent[0];
  for (let i = 1; i < pts.length - 1; i++) g.fillRect(Math.round(pts[i].x), Math.round(pts[i].y), 1, 1);
}
function drawWeapon(g, P, z) {
  const C = P.C;
  const key = C.weapon;
  const spr = SPR.weapon[key];
  let ang = P.face, reach = 4;
  if (P.state === 'attack' && P.atk?.kind === 'melee') {
    const half = (P.atk.arc * Math.PI) / 360, rate = atkRate(P);
    const side = P.combo % 2 === 0 ? 1 : -1;
    if (P.phase === 'wind') { const k = ease.outCubic(Math.min(1, P.st / (P.atk.wind / rate))); ang = P.face - side * half * 1.1 * k; reach = 3 - k * 2; }
    else if (P.phase === 'act') { const k = ease.outQuart(Math.min(1, P.st / (P.atk.act / rate))); ang = P.face - side * half * 1.1 + side * half * 2.2 * k; reach = 7; }
    else { const k = ease.inOutSine(Math.min(1, P.st / (P.atk.rec / rate))); ang = P.face + side * half * 1.1 * (1 - k); reach = 7 - 3 * k; }
    if (P.atk.spin) ang = P.face + (P.phase === 'act' ? TAU * Math.min(1, P.st / P.atk.act) : 0);
  } else if (key === 'bow') {
    reach = 5 + (P.state === 'charge' ? -P.charge * 2 : 0);
  } else if (key === 'staff') {
    ang = P.face; reach = 3;
  } else {
    ang = P.face + (P.faceX > 0 ? 0.9 : -0.9) * 0.6 + Math.sin(P.animT * 2) * 0.05; reach = 3;
  }
  const hx = P.x + Math.cos(ang) * reach, hy = P.y - 6 - z + Math.sin(ang) * reach * 0.8;
  g.save();
  g.translate(Math.round(hx), Math.round(hy));
  g.rotate(ang);
  g.drawImage(spr.c, key === 'bow' ? -2 : -2, -Math.floor(spr.h / 2));
  if (key === 'bow' && P.state === 'charge') {
    const pull = Math.round(P.charge * 4);
    g.drawImage(SPR.weapon['arrow_' + P.cls].c, -pull - 2, -2);
    if (P.chargeFull && Math.floor(G.real * 12) % 2 === 0) { g.fillStyle = '#ffffff'; g.fillRect(5, -1, 2, 2); }
  }
  if (key === 'staff') { g.globalAlpha = 0.5 + 0.3 * Math.sin(G.real * 6); g.fillStyle = '#b88cff'; g.fillRect(13, -2, 3, 3); g.globalAlpha = 1; }
  g.restore();
}
