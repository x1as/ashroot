// Bosses run scripted moves as JS generators: each `yield t` waits t seconds.
// Every move = telegraph (wind) -> act -> rec (punish window, the boss stands still).
import { G } from './state.js';
import { BOSSES } from '../data/bosses.js';
import { MIN_TELEGRAPH } from '../data/enemies.js';
import { angTo, dist, rand, TAU, weighted, ease, clamp, angDiff, damp } from '../engine/util.js';
import { drawSprite, pcircle } from '../engine/sprite.js';
import { burst, ring, shake, text, banner, shadow, flash, slowmo } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR } from '../art/bank.js';
import { collide, moveCollide, spawnPoint, tileAt, solidT, T, flowDir, los } from './world.js';
import { hurtPlayer, floorScale, tickStatus } from './combat.js';
import { createEnemy } from './enemy.js';
import { tint } from '../engine/sprite.js';

const tintC = {};
export function createBoss(id, x, y) {
  const def = BOSSES[id];
  const hp = def.hp * (1.15 + 0.15 * def.floor) * G.player.s.enemyHp; // x1.3..x1.9 since the rework: deep bosses gate on gear + tree
  const b = {
    type: id, def: { ...def, mass: 50, ash: 60 + def.floor * 25, atk: { kind: 'boss' } }, isBoss: true,
    x, y, kx: 0, ky: 0, vx: 0, vy: 0, r: def.r, size: 1, hp, maxHp: hp, armor: def.armor || 0,
    poise: def.poise, maxPoise: def.poise, state: 'intro', st: 0, spawnT: 0, face: Math.PI / 2, faceX: 1,
    flash: 0, bleed: 0, bleedT: 0, burn: 0, chill: 0, chillT: 0, freeze: 0, stunT: 0, anim: 0,
    phase: 1, gen: null, wait: 0, tele: [], dead: false, z: 0, alpha: 1, speedMul: 1, chip: hp,
  };
  tintC[id] ||= tint(SPR.boss[def.sprite], '#e0404f'); // pre-bake the phase-2 glow (no hitch mid-fight)
  return b;
}

const S = () => floorScale();
const P = () => G.player;
const hz = (h) => { G.hazards.push({ t: 0, owner: 'enemy', color: '#e0404f', ...h }); };
const bullet = (b, a, sp, dmg, color = '#e0404f') => G.projs.push({ owner: 'enemy', kind: 'orb', x: b.x, y: b.y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, dmg: Math.round(dmg * S()), life: 4, color });
const W = (b, t) => Math.max(MIN_TELEGRAPH, t * (b.phase === 2 ? 0.85 : 1));

const MOVES = {
  *slam(b, p) {
    b.pose = 'raise'; b.counterable = true;
    hz({ kind: 'circle', x: b.x, y: b.y, r: p.r, wind: W(b, p.wind), dmg: Math.round(p.dmg * S()) });
    sfx.telegraph();
    yield W(b, p.wind);
    b.counterable = false; b.pose = 'slam'; shake(0.5); sfx.boom();
    if (p.embers) for (let i = 0; i < p.embers; i++) bullet(b, (i / p.embers) * TAU, 90, p.dmg * 0.5, '#ff8f3a');
    yield p.rec;
  },
  *charge(b, p) {
    const a = angTo(b.x, b.y, P().x, P().y);
    b.pose = 'raise'; b.aim = a;
    const len = p.speed * p.dur;
    hz({ kind: 'line', x: b.x, y: b.y, ang: a, len, w: b.r * 2, wind: W(b, p.wind), dmg: 0, visualOnly: true });
    yield W(b, p.wind);
    b.pose = 'dash'; b.dash = { vx: Math.cos(a) * p.speed, vy: Math.sin(a) * p.speed, t: p.dur, dmg: Math.round(p.dmg * S()), hit: false, trail: p.trail };
    sfx.swing(true);
    yield p.dur;
    b.dash = null; b.pose = null; shake(0.2);
    yield p.rec;
  },
  *spikes(b, p) {
    b.pose = 'raise';
    const base = angTo(b.x, b.y, P().x, P().y), fan = p.fan || 1;
    for (let f = 0; f < fan; f++) {
      const a = base + (fan > 1 ? (f - (fan - 1) / 2) * 0.45 : 0);
      for (let i = 1; i <= p.count; i++) {
        const x = b.x + Math.cos(a) * (b.r + i * p.step), y = b.y + Math.sin(a) * (b.r + i * p.step);
        if (solidT(tileAt(G.room, x, y))) break;
        hz({ kind: 'circle', x, y, r: p.r, wind: W(b, p.wind) + i * 0.07, dmg: Math.round(p.dmg * S()), spike: true, color: '#e0404f' });
      }
    }
    yield W(b, p.wind) + p.count * 0.07;
    b.pose = null;
    yield p.rec;
  },
  *ring(b, p) {
    b.pose = 'raise'; b.counterable = true;
    b.glow = W(b, p.wind);
    yield W(b, p.wind);
    b.counterable = false;
    for (let w = 0; w < p.waves; w++) {
      const off = w * (Math.PI / p.n);
      for (let i = 0; i < p.n; i++) bullet(b, off + (i / p.n) * TAU, p.speed, p.dmg, b.def.color);
      sfx.enemyShot(); ring(b.x, b.y - 10, 4, 20, 0.3, b.def.color);
      yield p.gap;
    }
    b.pose = null;
    yield p.rec;
  },
  *volley(b, p) {
    b.pose = 'raise';
    for (let k = 0; k < p.bursts; k++) {
      b.aimLine = { t: 0, wind: k === 0 ? W(b, p.wind) : p.gap };
      yield k === 0 ? W(b, p.wind) : p.gap;
      const a = angTo(b.x, b.y - 10, P().x, P().y);
      for (let i = 0; i < p.n; i++) bullet(b, a - p.spread / 2 + (p.spread * i) / (p.n - 1), p.speed, p.dmg, b.def.color);
      sfx.enemyShot();
    }
    b.aimLine = null; b.pose = null;
    yield p.rec;
  },
  *blink(b, p) {
    b.pose = 'vanish';
    for (let i = 0; i < 10; i++) { b.alpha = 1 - i / 10; yield 0.03; }
    burst(b.x, b.y - 10, 20, b.def.color, 70);
    const a = rand(TAU), tx = P().x + Math.cos(a) * 48, ty = P().y + Math.sin(a) * 48;
    const ok = !solidT(tileAt(G.room, tx, ty)) && tileAt(G.room, tx, ty) !== T.CHASM;
    if (ok) { b.x = tx; b.y = ty; }
    b.counterable = true;
    hz({ kind: 'circle', x: b.x, y: b.y, r: p.r, wind: W(b, p.wind), dmg: Math.round(p.dmg * S()) });
    for (let i = 0; i < 10; i++) { b.alpha = i / 10; yield W(b, p.wind) / 10; }
    b.alpha = 1; b.counterable = false; b.pose = 'slam'; shake(0.35); sfx.boom();
    yield p.rec;
  },
  *combo(b, p) {
    for (let h = 0; h < p.hits; h++) {
      // step in, telegraph an arc, swing
      const t0 = h === 0 ? W(b, p.wind) : p.gap;
      b.pose = 'raise';
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const a = angTo(b.x, b.y, P().x, P().y);
        if (s < steps * 0.6) b.aim = a;
        if (dist(b.x, b.y, P().x, P().y) > p.range * 0.7) { b.vx = Math.cos(a) * 70; b.vy = Math.sin(a) * 70; }
        b.arcTele = { aim: b.aim, arc: p.arc, r: p.range + b.r * 0.5, k: s / steps };
        b.counterable = h === 0;
        yield t0 / steps;
      }
      b.vx = 0; b.vy = 0; b.counterable = false;
      b.arcTele = null; b.pose = 'slam';
      const half = (p.arc * Math.PI) / 360, R = p.range + b.r * 0.5;
      G.arcs.push({ x: b.x, y: b.y - 6, a0: b.aim - half, a1: b.aim + half, r0: R * 0.4, r1: R, t: 0, life: 0.2, color: b.def.color });
      const pl = P();
      if (dist(b.x, b.y, pl.x, pl.y) < R + pl.r && Math.abs(angDiff(b.aim, angTo(b.x, b.y, pl.x, pl.y))) < half) hurtPlayer(Math.round(p.dmg * S()), b.x, b.y, { status: { kind: 'slow', t: 1.2 } });
      sfx.swing(true); shake(0.15);
      yield 0.12;
    }
    b.pose = null;
    yield p.rec;
  },
  *rain(b, p) {
    b.pose = 'raise';
    for (let i = 0; i < p.count; i++) {
      const pl = P();
      const x = pl.x + rand(-p.spread, p.spread) * (i === 0 ? 0 : 1), y = pl.y + rand(-p.spread, p.spread) * 0.7 * (i === 0 ? 0 : 1);
      if (solidT(tileAt(G.room, x, y))) continue;
      hz({ kind: 'circle', x, y, r: p.r, wind: W(b, p.wind) + i * 0.08, dmg: Math.round(p.dmg * S()), color: b.def.color, fall: true });
    }
    yield W(b, p.wind);
    b.pose = null;
    yield p.rec + p.count * 0.08;
  },
  *summon(b, p) {
    b.pose = 'raise'; sfx.roar();
    yield 0.6;
    for (let i = 0; i < p.n; i++) {
      if (G.enemies.filter((e) => !e.dead && !e.isBoss).length >= 4) break;
      const sp = spawnPoint(G.room, P().x, P().y, 80);
      G.enemies.push(createEnemy(p.type, sp.x, sp.y, {}));
    }
    b.pose = null;
    yield p.rec;
  },
  *spiral(b, p) {
    b.pose = 'raise'; b.glow = W(b, p.wind); b.counterable = true;
    yield W(b, p.wind);
    b.counterable = false;
    const n = Math.floor(p.dur / p.rate);
    let a = rand(TAU);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < p.arms; k++) bullet(b, a + (k / p.arms) * TAU, p.speed, p.dmg, b.def.color);
      a += 0.32;
      if (i % 3 === 0) sfx.enemyShot();
      yield p.rate;
    }
    b.pose = null;
    yield p.rec;
  },
  *walk(b, t) {
    const steps = Math.ceil(t / 0.1);
    for (let i = 0; i < steps; i++) {
      if (!b.def.stationary) {
        const pl = P(), a = angTo(b.x, b.y, pl.x, pl.y);
        const dir = los(G.room, b.x, b.y, pl.x, pl.y) ? { x: Math.cos(a), y: Math.sin(a) } : flowDir(G.room, b.x, b.y) || { x: Math.cos(a), y: Math.sin(a) };
        if (dist(b.x, b.y, pl.x, pl.y) > 40) { b.vx = dir.x * b.def.speed * b.speedMul; b.vy = dir.y * b.def.speed * b.speedMul; } else { b.vx *= 0.5; b.vy *= 0.5; }
      }
      yield 0.1;
    }
    b.vx = 0; b.vy = 0;
  },
};

function* brain(b) {
  yield 1.2; // intro pause
  let last = null;
  while (true) {
    const pool = b.phase === 2 ? [...b.def.moves, ...b.def.p2] : b.def.moves;
    const choice = weighted(pool.filter((m) => m[0] !== last || pool.length < 2), (m) => m[1]);
    last = choice[0];
    yield* MOVES.walk(b, rand(0.4, 1.0) / b.speedMul);
    yield* MOVES[choice[0]](b, choice[2]);
  }
}

export function updateBoss(b, dt) {
  b.st += dt; b.anim += dt;
  b.flash = Math.max(0, b.flash - dt);
  b.chip = damp(b.chip, b.hp, b.hp < b.chip ? 2.5 : 20, dt);
  tickStatus(b, dt);
  if (b.dead) return;
  if (b.state === 'intro') {
    if (b.st > 0.1 && !b.introShown) { b.introShown = true; banner(b.def.name, b.def.title, b.def.color, 2.6); sfx.roar(); shake(0.4); }
    if (b.st > 1.6) { b.state = 'fight'; b.gen = brain(b); }
    return;
  }
  if (b.phase === 1 && b.hp < b.maxHp * 0.5) {
    b.phase = 2; b.speedMul = 1.2;
    banner(b.def.name, 'ярость', '#e0404f', 1.8); sfx.roar(); shake(0.6); flash('#e0404f', 0.25); slowmo(0.5, 0.3);
    ring(b.x, b.y - 10, 5, 60, 0.6, '#e0404f', 2);
    // clear telegraphs aren't cancelled: fairness — only the NEXT move uses phase-2 timings
  }
  if (b.stunT > 0) { b.stunT -= dt; b.vx = 0; b.vy = 0; }
  else if (b.freeze > 0) { /* frozen: tickStatus counts it down */ }
  else {
    b.wait -= dt * (1 - 0.06 * b.chill);
    while (b.wait <= 0 && b.gen) { const r = b.gen.next(); b.wait += r.value ?? 0.1; }
  }
  if (b.dash) {
    moveCollide(G.room, b, b.dash.vx * dt, b.dash.vy * dt, true);
    if (b.dash.trail && Math.random() < dt * 30) hz({ kind: 'circle', x: b.x, y: b.y, r: 9, wind: 0.5, dmg: Math.round(10 * S()), color: '#ff8f3a' });
    const pl = P();
    if (!b.dash.hit && dist(b.x, b.y, pl.x, pl.y) < b.r + pl.r + 2) { b.dash.hit = true; hurtPlayer(b.dash.dmg, b.x, b.y, { status: { kind: 'stun', t: 0.45 } }); }
    if (Math.random() < 0.7) burst(b.x, b.y, 1, '#6b5f82', 30);
  }
  moveCollide(G.room, b, (b.vx + b.kx) * dt, (b.vy + b.ky) * dt, true);
  b.kx *= Math.exp(-9 * dt); b.ky *= Math.exp(-9 * dt);
  const pl = P();
  if (Math.abs(b.vx) > 2) b.faceX = b.vx > 0 ? 1 : -1; else b.faceX = pl.x > b.x ? 1 : -1;
  // body contact pushes the player out (no contact damage: only telegraphed attacks hurt)
  const d = dist(b.x, b.y, pl.x, pl.y), m = b.r + pl.r;
  if (d < m && d > 0 && pl.state !== 'dodge') { const push = m - d; moveCollide(G.room, pl, ((pl.x - b.x) / d) * push, ((pl.y - b.y) / d) * push); }
}

export function drawBoss(g, b) {
  if (b.dead) return;
  const spr = SPR.boss[b.def.sprite];
  shadow(g, b.x, b.y, b.r + 3);
  let sx = 1, sy = 1;
  const breathe = Math.sin(b.anim * 2.2) * 0.03;
  sy += breathe; sx -= breathe * 0.5;
  if (b.pose === 'raise') { sy *= 1.06; sx *= 0.96; }
  if (b.pose === 'slam') { sy *= 0.9; sx *= 1.08; }
  if (b.def.sprite === 'heart') { const beat = Math.pow(Math.max(0, Math.sin(b.anim * (b.phase === 2 ? 7 : 4.5))), 8) * 0.08; sx += beat; sy += beat; }
  const hover = b.def.sprite === 'singer' || b.def.sprite === 'heart' ? Math.sin(b.anim * 1.6) * 2 - 3 : 0;
  g.globalAlpha = b.alpha;
  if (b.phase === 2) {
    tintC[b.type] ||= tint(spr, '#e0404f');
    g.globalAlpha = b.alpha * (0.35 + 0.25 * Math.sin(G.real * 8));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) drawSprite(g, spr, b.x + dx, b.y + hover + dy, { flip: b.faceX < 0, sx, sy, img: tintC[b.type] });
    g.globalAlpha = b.alpha;
  }
  const counterFlash = b.counterable && Math.floor(G.real * 30) % 2 === 0 && b.wait < 0.18;
  drawSprite(g, spr, b.x, b.y + hover, { flip: b.faceX < 0, sx, sy, white: b.flash > 0 || counterFlash });
  g.globalAlpha = 1;
  if (b.stunT > 0) for (let i = 0; i < 4; i++) { const a = G.real * 5 + (i * TAU) / 4; g.fillStyle = '#ffd36b'; g.fillRect(Math.round(b.x + Math.cos(a) * 12), Math.round(b.y - spr.h - 3 + Math.sin(a) * 3), 1, 1); }
}
export function drawBossTele(g, b) {
  if (b.dead) return;
  if (b.arcTele) {
    const t = b.arcTele, half = (t.arc * Math.PI) / 360;
    g.globalAlpha = 0.12 + 0.3 * t.k; g.fillStyle = '#e0404f';
    g.beginPath(); g.moveTo(b.x, b.y); g.arc(b.x, b.y, t.r * (0.4 + 0.6 * t.k), t.aim - half, t.aim + half); g.closePath(); g.fill();
    g.globalAlpha = 0.7; g.strokeStyle = '#e0404f'; g.beginPath(); g.arc(b.x, b.y, t.r, t.aim - half, t.aim + half); g.stroke();
    g.globalAlpha = 1;
  }
  if (b.aimLine) {
    const pl = P(), a = angTo(b.x, b.y - 10, pl.x, pl.y);
    g.globalAlpha = 0.5; g.fillStyle = b.def.color;
    for (let x = 14; x < 160; x += 4) g.fillRect(Math.round(b.x + Math.cos(a) * x), Math.round(b.y - 10 + Math.sin(a) * x), 1, 1);
    g.globalAlpha = 1;
  }
  if (b.glow && b.pose === 'raise') { g.globalAlpha = 0.5; g.strokeStyle = b.def.color; g.beginPath(); g.arc(b.x, b.y - 10, 6 + 10 * Math.abs(Math.sin(G.real * 6)), 0, TAU); g.stroke(); g.globalAlpha = 1; }
}
