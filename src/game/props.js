// Room props: amphorae (break -> loot), Greek-fire pots (break -> explosion that hurts everyone: risk/reward),
// bronze braziers (light, solid) and marble hoplite statues (solid cover). All y-sorted with the actors.
import { G } from './state.js';
import { bake, drawSprite, pcircle, rp } from '../engine/sprite.js';
import { rand, randi, dist, TAU, chance } from '../engine/util.js';
import { burst, ring, shadow } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { TS, T } from './world.js';
import { floorScale } from './combat.js';

const ART = {
  amphora: ['...NN...', '..NEEN..', '...EE...', '..EeeE..', '.EewekE.', 'EeekkeeE', 'EekeekeE', 'EeekkeeE', '.EeeeeE.', '..EeeE..', '...EE...', '..NNNN..'],
  firepot: ['...gG...', '..gGg...', '..RRRR..', '.RrrrrR.', 'RrwrrrrR', 'RrkkkkrR', 'RrrrrrrR', '.RrrrrR.', '..RRRR..'],
  brazier: ['SSSSSSSSSS', '.SsssssS..', '..SSSSSS..', '...T..T...', '..T....T..', '.T......T.', 'T........T'],
  statue: ['....bwwb....', '...bwwwwb...', '...bwkwwb...', '....bwwb....', '..bbwwwwbb..', '.bwwwwwwwwb.', '.bwbwwwwbwb.', '.bw.bwwb.wb.', '.bw.bwwb.wb.', '....bwwb....', '....bw.wb...', '....bw.wb...', '...bbw.wbb..', '..pppppppp..', '..pllllllp..', '..pppppppp..'],
};
const DEF = {
  amphora: { r: 4, hp: 1, solid: true },
  firepot: { r: 4, hp: 1, solid: true },
  brazier: { r: 5, hp: 999, solid: true, light: true },
  statue: { r: 6, hp: 999, solid: true },
};
let SPRS = null;
const spr = (t) => (SPRS ||= Object.fromEntries(Object.entries(ART).map(([k, v]) => [k, bake(v)])))[t];

function freeSpot(R, near, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const tx = near ? near.tx + randi(-1, 1) : randi(2, R.w - 3), ty = near ? near.ty + randi(-1, 1) : randi(3, R.h - 3);
    if (tx < 1 || ty < 2 || tx >= R.w - 1 || ty >= R.h - 1) continue;
    if (R.grid[ty * R.w + tx] !== T.FLOOR) continue;
    const x = tx * TS + 8 + rand(-3, 3), y = ty * TS + 8 + rand(-3, 3);
    if (Math.hypot(x - R.entry.x, y - R.entry.y) < 48) continue;
    if (R.exits.some((e) => Math.hypot(x - e.x, y - 36) < 40)) continue;
    if (R.props.some((p) => Math.hypot(p.x - x, p.y - y) < 12)) continue;
    return { x, y, tx, ty };
  }
  return null;
}

export function placeProps(R) {
  R.props = [];
  if (R.plan === 'boss') {
    for (const [fx, fy] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.8], [0.8, 0.8]]) {
      const s = freeSpot(R, { tx: Math.round(R.w * fx), ty: Math.round(R.h * fy) }); if (s) R.props.push(mk('brazier', s));
    }
    return;
  }
  // braziers flank the room, statues watch from the corners, amphorae cluster along the walls
  for (const fx of [0.25, 0.75]) { const s = freeSpot(R, { tx: Math.round(R.w * fx), ty: 3 }); if (s) R.props.push(mk('brazier', s)); }
  if (R.plan !== 'bonfire') {
    for (const [fx, fy] of [[0.12, 0.3], [0.88, 0.3]]) if (chance(0.7)) { const s = freeSpot(R, { tx: Math.round(R.w * fx), ty: Math.round(R.h * fy) }); if (s) R.props.push(mk('statue', s)); }
    const clusters = randi(3, 5);
    for (let c = 0; c < clusters; c++) {
      const seed = freeSpot(R); if (!seed) continue;
      for (let i = 0; i < randi(2, 4); i++) { const s = freeSpot(R, seed, 12); if (s) R.props.push(mk(chance(0.22) ? 'firepot' : 'amphora', s)); }
    }
  }
}
function mk(type, s) { return { type, x: s.x, y: s.y, ...DEF[type], hpMax: DEF[type].hp, wob: 0 }; }

// bodies are pushed out of solid props
export function pushOut(e) {
  for (const p of G.room.props || []) {
    if (p.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y), m = e.r + p.r;
    if (d < m && d > 0) { const k = (m - d) / d; e.x += (e.x - p.x) * k; e.y += (e.y - p.y) * k; }
  }
}

export function hitProp(p) {
  if (p.dead || p.hp > 99) { if (!p.dead) { p.wob = 0.2; sfx.block(); } return; }
  p.hp -= 1; p.wob = 0.25;
  if (p.hp > 0) return;
  p.dead = true;
  const c = p.type === 'firepot' ? '#e0404f' : '#b5481c';
  burst(p.x, p.y - 4, 16, c, 70, { grav: 120, size: 2 });
  burst(p.x, p.y - 4, 8, '#ece4d0', 50, { grav: 120 });
  sfx.block();
  if (p.type === 'amphora') {
    const n = randi(1, 3);
    for (let i = 0; i < n; i++) G.pickups.push({ kind: 'ash', x: p.x, y: p.y, vx: rand(-50, 50), vy: rand(-50, 50), t: 0, v: 1 });
    if (chance(0.5)) G.pickups.push({ kind: 'mat', id: 'bone', n: 1, x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0 });
    if (chance(0.06)) G.pickups.push({ kind: 'mat', id: 'resin', n: 1, x: p.x, y: p.y, vx: rand(-40, 40), vy: rand(-40, 40), t: 0 });
  } else if (p.type === 'firepot') {
    // Greek fire: a short readable fuse, then it burns everything around — enemies and the hero alike
    G.hazards.push({ kind: 'circle', x: p.x, y: p.y, r: 34, t: 0, wind: 0.45, dmg: Math.round(14 * floorScale()), owner: 'enemy', color: '#ff8f3a', hurtsEnemies: true, enemyDmg: Math.round(40 * floorScale()) });
  }
}

export function drawProp(g, p) {
  if (p.dead) return;
  const s = spr(p.type);
  p.wob = Math.max(0, p.wob - 1 / 60);
  const w = Math.sin(p.wob * 60) * p.wob * 4;
  shadow(g, p.x, p.y, p.r + 1);
  drawSprite(g, s, p.x + w * 0.3, p.y, { sx: 1 + w * 0.02, sy: 1 - w * 0.02 });
  if (p.type === 'brazier') {
    for (let i = 0; i < 3; i++) G.parts.push({ x: p.x + rand(-3, 3), y: p.y - 8, vx: rand(-4, 4), vy: -rand(18, 40), life: rand(0.3, 0.6), max: 0.6, size: 1, color: Math.random() < 0.5 ? '#ff8f3a' : '#ffd36b', drag: 1, grav: 0, z: 0, vz: 0, glow: true });
    g.fillStyle = '#ffd36b'; g.globalAlpha = 0.7 + 0.3 * Math.sin(G.real * 12 + p.x); g.fillRect(rp(p.x - 3), rp(p.y - 9), 6, 2); g.globalAlpha = 1;
  }
}
export { TAU, pcircle, ring };
