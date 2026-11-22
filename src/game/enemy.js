// Enemies: every attack is wind (telegraph on the ground) -> act -> rec (punish window).
// Aim tracks during the first 65% of the windup, then LOCKS: a dodge timed after the lock always works.
import { G } from './state.js';
import { ENEMIES, AFFIXES, SCALE, ATTACK_TOKENS, MIN_TELEGRAPH, COUNTER_WINDOW } from '../data/enemies.js';
import { angTo, angDiff, dist, damp, rand, TAU, clamp, ease } from '../engine/util.js';
import { drawSprite, pcircle } from '../engine/sprite.js';
import { burst, text, shadow, ring } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR } from '../art/bank.js';
import { collide, moveCollide, tileAt, T, los, flowDir, spawnPoint, solidT } from './world.js';
import { hurtPlayer, tickStatus, killEnemy, enemyBlast, floorScale } from './combat.js';

const LOCK = 0.65;

export function createEnemy(type, x, y, o = {}) {
  const def = ENEMIES[type], f = G.run.floor, ps = G.player.s;
  const affix = o.elite ? (o.affix || ['swift', 'brute', 'volatile'][(Math.random() * 3) | 0]) : null;
  const A = affix ? AFFIXES[affix] : {};
  let hp = def.hp * SCALE.hp(f) * ps.enemyHp * (o.elite ? SCALE.elite.hp : 1) * (A.hp || 1) * (o.hpMul || 1);
  const e = {
    type, def, isBoss: false, elite: !!o.elite, affix,
    x, y, kx: 0, ky: 0, vx: 0, vy: 0,
    r: def.r * (A.size || 1), size: (o.elite ? 1.15 : 1) * (A.size || 1),
    hp, maxHp: hp, dmg: Math.round(def.dmg * SCALE.dmg(f) * (o.elite ? SCALE.elite.dmg : 1) * (A.dmg || 1) * (o.dmgMul || 1)),
    armor: def.armor ? def.armor + SCALE.armor(f) : 0,
    speed: def.speed * (A.speed || 1) * ps.enemySpeed,
    windMul: A.wind || 1,
    poise: def.poise * (A.poise || 1), maxPoise: def.poise * (A.poise || 1),
    state: 'spawn', st: 0, spawnT: 0.8, cd: rand(0.4, 1.2), face: angTo(x, y, G.player.x, G.player.y), faceX: 1,
    aim: 0, flash: 0, bleed: 0, bleedT: 0, burn: 0, chill: 0, chillT: 0, freeze: 0,
    token: false, blinkCd: 0, hitN: 0, anim: rand(10), tele: null, dead: false,
  };
  e.def = { ...def, ash: def.ash * (o.elite ? 1 : 1) };
  return e;
}

const phaseT = (e, base) => Math.max(base === e.def.atk.wind ? MIN_TELEGRAPH : 0, base * e.windMul);

function takeToken(e) {
  if (e.def.ai === 'turret' || e.def.ai === 'bomber') return true;
  // deeper halls let more enemies swing at once (2 on depth 1-2, 3 on 3-4, 4 on 5)
  if ((G.tokens || 0) >= ATTACK_TOKENS + Math.floor(((G.run?.floor || 1) - 1) / 2)) return false;
  G.tokens = (G.tokens || 0) + 1; e.token = true; return true;
}
function freeToken(e) { if (e.token) { e.token = false; G.tokens = Math.max(0, G.tokens - 1); } }

function beginWind(e) {
  e.state = 'wind'; e.st = 0; e.windT = phaseT(e, e.def.atk.wind); e.hitN = 0; e.hitDone = false;
  e.aim = angTo(e.x, e.y, G.player.x, G.player.y);
  e.tele = { kind: e.def.atk.kind };
  sfx.telegraph();
}

export function updateEnemy(e, dt) {
  const P = G.player, A = e.def.atk, R = G.room;
  e.st += dt; e.anim += dt;
  e.flash = Math.max(0, e.flash - dt);
  if (e.state === 'spawn') {
    e.spawnT -= dt;
    if (Math.random() < dt * 40) G.parts.push({ x: e.x + rand(-6, 6), y: e.y, vx: 0, vy: -rand(10, 30), life: 0.5, max: 0.5, size: 1, color: '#6b5f82', drag: 1, grav: 0, z: 0, vz: 0 });
    if (e.spawnT <= 0) { e.state = 'chase'; e.st = 0; burst(e.x, e.y, 10, '#6b5f82', 50); }
    return;
  }
  tickStatus(e, dt);
  if (e.dead) return;
  if (e.stoneT > 0) e.stoneT -= dt;
  if (e.freeze > 0) { e.vx = 0; e.vy = 0; moveBody(e, dt); return; }
  const slow = 1 - 0.08 * e.chill;
  const dP = dist(e.x, e.y, P.x, P.y);
  const toP = angTo(e.x, e.y, P.x, P.y);
  const turn = e.def.shield ? 2.2 : 7;
  if (e.state !== 'act' && e.state !== 'stagger') e.face += clamp(angDiff(e.face, toP), -turn * dt, turn * dt);
  e.cd -= dt; e.blinkCd -= dt;
  let mvx = 0, mvy = 0;

  switch (e.state) {
    case 'chase': {
      const ai = e.def.ai;
      const hidden = P.invisT > 0; // helm of Hades / ring of Gyges: enemies lose the hero
      const sees = !hidden && los(R, e.x, e.y, P.x, P.y);
      let want = 'toward';
      if (ai === 'ranged' || ai === 'caster') {
        if (dP < (e.def.keep * 0.7)) want = 'away'; else if (dP < e.def.keep * 1.3 && sees) want = 'strafe'; else want = 'toward';
        if (ai === 'caster' && dP < e.def.blink && e.blinkCd <= 0) { blink(e); break; }
      }
      if (ai === 'turret' || hidden) want = 'none';
      if (want !== 'none') {
        let dir;
        if (want === 'toward') dir = sees ? { x: Math.cos(toP), y: Math.sin(toP) } : flowDir(R, e.x, e.y) || { x: Math.cos(toP), y: Math.sin(toP) };
        else if (want === 'away') dir = { x: -Math.cos(toP), y: -Math.sin(toP) };
        else { const s = Math.sin(e.anim * 0.7) > 0 ? 1 : -1; dir = { x: Math.cos(toP + s * 1.5) * 0.6, y: Math.sin(toP + s * 1.5) * 0.6 }; }
        mvx = dir.x * e.speed * slow; mvy = dir.y * e.speed * slow;
      }
      const inRange = dP < A.range * (ai === 'melee' ? 0.9 : 1) + P.r;
      const canSee = !hidden && (ai === 'melee' || ai === 'bomber' || ai === 'turret' || sees);
      if (inRange && canSee && e.cd <= 0 && P.state !== 'dead' && takeToken(e)) beginWind(e);
      break;
    }
    case 'wind': {
      const k = e.st / e.windT;
      if (k < LOCK) e.aim = toP;
      if (e.def.ai === 'melee' && k < 0.5) { mvx = Math.cos(toP) * e.speed * 0.25; mvy = Math.sin(toP) * e.speed * 0.25; }
      if (e.st >= e.windT) startAct(e);
      break;
    }
    case 'act': {
      if (A.kind === 'arc' || A.kind === 'combo') {
        if (A.lunge && e.st < 0.1) { mvx = Math.cos(e.aim) * A.lunge * 10; mvy = Math.sin(e.aim) * A.lunge * 10; }
        if (!e.hitDone) { e.hitDone = true; arcHit(e, A); }
        if (e.st >= A.act) {
          if (A.kind === 'combo' && e.hitN < A.hits - 1) { e.hitN++; e.state = 'gap'; e.st = 0; e.hitDone = false; e.aim = toP; e.tele = { kind: 'arc' }; sfx.telegraph(); }
          else toRec(e);
        }
      } else if (A.kind === 'lunge') {
        const v = A.dash * Math.max(0, 1 - e.st / A.act * 0.6);
        mvx = Math.cos(e.aim) * v; mvy = Math.sin(e.aim) * v;
        if (!e.hitDone && dist(e.x, e.y, P.x, P.y) < e.r + P.r + 3) { e.hitDone = true; hurtPlayer(e.dmg, e.x, e.y, { status: e.def.inflict }); }
        if (Math.random() < 0.6) G.parts.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 1, color: '#56603a', drag: 0, grav: 0, z: 0, vz: 0 });
        if (e.st >= A.act) toRec(e);
      } else if (e.st >= A.act) toRec(e);
      break;
    }
    case 'gap': {
      if (e.st < A.gap * 0.6) e.aim = toP;
      if (e.st >= A.gap) { e.state = 'act'; e.st = 0; sfx.swing(false); }
      break;
    }
    case 'rec': {
      if (e.st >= e.recT) { e.state = 'chase'; e.st = 0; e.cd = A.cd * rand(0.8, 1.3); }
      break;
    }
    case 'stagger': {
      if (e.st >= e.stagT) { e.state = 'chase'; e.st = 0; e.cd = 0.4; }
      break;
    }
  }
  // separation
  for (const o of G.enemies) {
    if (o === e || o.dead || o.spawnT > 0) continue;
    const d = dist(e.x, e.y, o.x, o.y), m = e.r + o.r;
    if (d < m && d > 0) { const p = (m - d) * 0.5; e.x += ((e.x - o.x) / d) * p; e.y += ((e.y - o.y) / d) * p; }
  }
  const k = e.state === 'act' && A.kind === 'lunge' ? 40 : 10;
  e.vx = damp(e.vx, mvx, k, dt); e.vy = damp(e.vy, mvy, k, dt);
  if (Math.abs(mvx) > 1) e.faceX = mvx > 0 ? 1 : -1;
  if (e.state === 'wind' || e.state === 'act') e.faceX = Math.cos(e.aim) >= 0 ? 1 : -1;
  moveBody(e, dt);
}

function moveBody(e, dt) {
  const kn = Math.hypot(e.kx, e.ky);
  const lunging = e.state === 'act' && e.def.atk.kind === 'lunge';
  moveCollide(G.room, e, (e.vx + e.kx) * dt, (e.vy + e.ky) * dt, !(lunging || kn > 25));
  e.kx *= Math.exp(-9 * dt); e.ky *= Math.exp(-9 * dt);
  // environmental kill: knocked or lunging into the chasm
  if (tileAt(G.room, e.x, e.y) === T.CHASM && !e.dead) {
    text(e.x, e.y - 16, 'в бездну', '#8189a0');
    burst(e.x, e.y, 8, '#6b5f82', 30);
    sfx.fall();
    e.hp = 0; killEnemy(e, {});
  }
}

function startAct(e) {
  const A = e.def.atk, P = G.player;
  e.state = 'act'; e.st = 0;
  freeToken(e);
  e.tokenHeldUntilRec = false;
  switch (A.kind) {
    case 'arc': case 'combo': sfx.swing(false); break;
    case 'lunge': sfx.swing(false); break;
    case 'shoot': {
      const sp = A.speed;
      G.projs.push({ owner: 'enemy', kind: 'bonearrow', x: e.x, y: e.y - 6, vx: Math.cos(e.aim) * sp, vy: Math.sin(e.aim) * sp, r: 2, dmg: e.dmg, life: 2.2, color: '#ece4d0', status: e.def.inflict });
      sfx.enemyShot();
      break;
    }
    case 'cast': {
      G.hazards.push({ kind: 'circle', x: P.x, y: P.y, r: A.r, t: 0, wind: A.act, dmg: e.dmg, owner: 'enemy', color: '#e0404f', status: e.def.inflict });
      break;
    }
    case 'explode': {
      enemyBlast(e.x, e.y, A.r, e.dmg, '#b4ec5f', true, e.dmg, e.def.inflict);
      e.def = { ...e.def, deathBlast: 0 };
      e.affix = null;
      e.hp = 0; killEnemy(e, {});
      break;
    }
    case 'radial': {
      for (let i = 0; i < A.n; i++) {
        const a = (i / A.n) * TAU + e.anim;
        G.projs.push({ owner: 'enemy', kind: 'orb', x: e.x, y: e.y - 6, vx: Math.cos(a) * A.speed, vy: Math.sin(a) * A.speed, r: 3, dmg: e.dmg, life: 3, color: '#e0404f', status: e.def.inflict });
      }
      sfx.enemyShot();
      break;
    }
  }
  e.tele = A.kind === 'arc' || A.kind === 'combo' ? e.tele : null;
}
function toRec(e) { e.state = 'rec'; e.st = 0; e.recT = e.def.atk.rec; e.tele = null; freeToken(e); }

function arcHit(e, A) {
  const P = G.player;
  const d = dist(e.x, e.y, P.x, P.y);
  const a = angTo(e.x, e.y, P.x, P.y);
  if (d < A.range + P.r && Math.abs(angDiff(e.aim, a)) < (A.arc * Math.PI) / 360) hurtPlayer(e.dmg, e.x, e.y, { status: e.def.inflict });
  const half = (A.arc * Math.PI) / 360;
  G.arcs.push({ x: e.x, y: e.y - 4, a0: e.aim - half, a1: e.aim + half, r0: A.range * 0.4, r1: A.range, t: 0, life: 0.18, color: '#e0404f' });
}

function blink(e) {
  const P = G.player;
  burst(e.x, e.y - 6, 14, '#8c1c33', 60);
  const p = spawnPoint(G.room, P.x, P.y, 110);
  e.x = p.x; e.y = p.y; e.blinkCd = 3; e.cd = Math.max(e.cd, 0.6);
  burst(e.x, e.y - 6, 14, '#8c1c33', 60);
  sfx.magic();
}

// ---------------- drawing ----------------
export function drawTelegraph(g, e) {
  if (!e.tele || e.dead) return;
  const A = e.def.atk;
  let k, windT;
  if (e.state === 'wind') { windT = e.windT; k = e.st / windT; }
  else if (e.state === 'gap') { windT = A.gap; k = e.st / A.gap; }
  else if (e.state === 'act' && (A.kind === 'arc' || A.kind === 'combo')) return;
  else return;
  const counter = e.state === 'wind' && e.st >= windT - COUNTER_WINDOW;
  const locked = k >= LOCK;
  const col = counter ? '#ffffff' : '#e0404f';
  g.save();
  g.fillStyle = col; g.strokeStyle = col;
  if (A.kind === 'arc' || A.kind === 'combo') {
    const half = (A.arc * Math.PI) / 360, r = A.range + 2;
    g.globalAlpha = 0.12 + 0.3 * ease.inQuad(k);
    g.beginPath(); g.moveTo(e.x, e.y); g.arc(e.x, e.y, r * (0.4 + 0.6 * ease.outCubic(k)), e.aim - half, e.aim + half); g.closePath(); g.fill();
    g.globalAlpha = locked ? 0.9 : 0.4; g.lineWidth = 1;
    g.beginPath(); g.arc(e.x, e.y, r, e.aim - half, e.aim + half); g.stroke();
  } else if (A.kind === 'lunge') {
    const len = A.dash * A.act * 0.75;
    g.translate(e.x, e.y); g.rotate(e.aim);
    g.globalAlpha = 0.12 + 0.3 * k; g.fillRect(0, -4, len * ease.outCubic(k), 8);
    g.globalAlpha = locked ? 0.9 : 0.35; g.fillRect(0, -4, len, 1); g.fillRect(0, 3, len, 1);
  } else if (A.kind === 'shoot') {
    g.translate(e.x, e.y - 6); g.rotate(e.aim);
    g.globalAlpha = locked ? 0.85 : 0.3;
    for (let x = 6; x < 200; x += locked ? 3 : 5) g.fillRect(x, 0, locked ? 2 : 1, 1);
  } else if (A.kind === 'explode') {
    g.globalAlpha = 0.1 + 0.3 * k; pcircle(g, e.x, e.y, A.r * ease.outCubic(k), A.r * ease.outCubic(k) * 0.7);
    g.globalAlpha = 0.7; g.strokeStyle = '#b4ec5f'; g.beginPath(); g.ellipse(e.x, e.y, A.r, A.r * 0.7, 0, 0, TAU); g.stroke();
  } else if (A.kind === 'radial' || A.kind === 'cast') {
    g.globalAlpha = 0.6 * k; g.beginPath(); g.arc(e.x, e.y - 6, 4 + 8 * k, 0, TAU); g.stroke();
  }
  g.restore();
}

export function drawEnemy(g, e) {
  if (e.dead) return;
  const spr = SPR.enemy[e.type];
  const A = e.def.atk;
  if (e.state === 'spawn') {
    const k = 1 - e.spawnT / 0.8;
    g.save(); g.beginPath(); g.rect(e.x - 20, e.y - 40, 40, 40); g.clip();
    g.globalAlpha = 0.5 + 0.5 * k;
    drawSprite(g, spr, e.x, e.y + (1 - ease.outCubic(k)) * spr.h, { flip: e.faceX < 0, white: k < 0.7 });
    g.restore();
    g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#6b5f82'; pcircle(g, e.x, e.y, 9 * k + 3, (9 * k + 3) * 0.4); g.globalAlpha = 1;
    return;
  }
  shadow(g, e.x, e.y, e.r + 1);
  let sx = e.size, sy = e.size, ox = 0;
  const moving = Math.hypot(e.vx, e.vy) > 5;
  if (e.state === 'wind') { const k = ease.outCubic(Math.min(1, e.st / e.windT)); sy *= 1 - 0.14 * k; sx *= 1 + 0.1 * k; ox = -Math.cos(e.aim) * 2 * k; }
  else if (e.state === 'act') { sy *= 1.12; sx *= 0.92; }
  else if (e.state === 'stagger') { ox = Math.sin(e.st * 50) * 1; }
  else if (moving) { const w = Math.sin(e.anim * (e.speed / 6)); sy *= 1 + w * 0.06; sx *= 1 - w * 0.04; }
  if (A.kind === 'explode' && e.state === 'wind') { const p = Math.sin(e.st * 30) * 0.08; sx *= 1.1 + p; sy *= 1.1 + p; }
  const bob = moving ? -Math.abs(Math.sin(e.anim * (e.speed / 6))) * 1 : 0;
  if (e.elite) {
    const c = SPR.enemyTint?.[e.type + e.affix];
    const col = AFFIXES[e.affix].color;
    const pulse = 0.5 + 0.5 * Math.sin(G.real * 6);
    g.globalAlpha = 0.5 + 0.4 * pulse;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) drawSprite(g, spr, e.x + ox + dx, e.y + bob + dy, { flip: e.faceX < 0, sx, sy, img: tintFor(e.type, col) });
    g.globalAlpha = 1;
  }
  const white = e.flash > 0 || (e.state === 'wind' && e.st >= e.windT - COUNTER_WINDOW && Math.floor(G.real * 30) % 2 === 0);
  drawSprite(g, spr, e.x + ox, e.y + bob, { flip: e.faceX < 0, sx, sy, white });
  if (e.stoneT > 0) { g.globalAlpha = 0.75; drawSprite(g, spr, e.x + ox, e.y + bob, { flip: e.faceX < 0, sx, sy, img: tintFor(e.type, '#8d8473') }); g.globalAlpha = 1; }
  else if (e.freeze > 0) { g.globalAlpha = 0.55; drawSprite(g, spr, e.x + ox, e.y + bob, { flip: e.faceX < 0, sx, sy, img: tintFor(e.type, '#93e2ff') }); g.globalAlpha = 1; }
  else if (e.chill > 0) { g.globalAlpha = 0.1 * e.chill; drawSprite(g, spr, e.x + ox, e.y + bob, { flip: e.faceX < 0, sx, sy, img: tintFor(e.type, '#93e2ff') }); g.globalAlpha = 1; }
  if (e.state === 'stagger') { for (let i = 0; i < 3; i++) { const a = G.real * 5 + (i * TAU) / 3; g.fillStyle = '#ffd36b'; g.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(e.y - spr.h - 2 + Math.sin(a) * 2), 1, 1); } }
  // small hp bar only once damaged (keeps the screen clean)
  if (e.hp < e.maxHp) {
    const w = Math.max(10, Math.round(e.r * 2.4)), x = Math.round(e.x - w / 2), y = Math.round(e.y - spr.h * e.size - 4);
    g.fillStyle = '#08060d'; g.fillRect(x - 1, y - 1, w + 2, 3);
    g.fillStyle = '#8c1c33'; g.fillRect(x, y, w, 1);
    g.fillStyle = e.elite ? AFFIXES[e.affix].color : '#e0404f'; g.fillRect(x, y, Math.max(0, Math.round((w * e.hp) / e.maxHp)), 1);
    if (e.bleed) { g.fillStyle = '#e0404f'; g.fillRect(x, y + 2, Math.min(w, e.bleed), 1); }
    if (e.armor) { g.fillStyle = '#8189a0'; g.fillRect(x - 3, y - 1, 2, 3); }
  }
}

const tintCache = new Map();
import { tint } from '../engine/sprite.js';
function tintFor(type, col) {
  const k = type + col;
  if (!tintCache.has(k)) tintCache.set(k, tint(SPR.enemy[type], col));
  return tintCache.get(k);
}
export { tintFor };
