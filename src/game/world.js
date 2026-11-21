// Rooms: tile grid, procedural pixel tiles baked once, 3/4 occlusion, collision, flow field.
import { mulberry32, rand, randi, pick } from '../engine/util.js';
import { G } from './state.js';

export const TS = 16;
export const T = { FLOOR: 0, WALL: 1, PILLAR: 2, CHASM: 3, SPIKE: 4 };
export const SPIKE_CYCLE = 2.4, SPIKE_WARN = 1.4, SPIKE_UP = 2.0; // down -> warn (tips) -> up (hurts)

const SIZES = { meet: [22, 14], terrain: [24, 16], twist: [24, 16], fork: [18, 12], arena: [26, 17], bonfire: [16, 11], boss: [28, 19] };

export function makeRoom(planId, theme, terrain, seed = (Math.random() * 1e9) | 0) {
  const [w, h] = SIZES[planId];
  const grid = new Uint8Array(w * h);
  const spikePhase = new Float32Array(w * h);
  const R = { w, h, grid, spikePhase, plan: planId, theme, seed, torches: [], exits: [], cleared: false, decor: [] };
  const set = (x, y, v) => { if (x > 0 && y > 1 && x < w - 1 && y < h - 1) grid[y * w + x] = v; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || x === w - 1 || y <= 1 || y === h - 1) grid[y * w + x] = T.WALL;
  const cx = Math.floor(w / 2);
  const mirror = (x, y, v) => { set(x, y, v); set(w - 1 - x, y, v); };

  switch (planId) {
    case 'meet': if (Math.random() < 0.5) { mirror(6, 5, T.PILLAR); mirror(6, h - 5, T.PILLAR); } break;
    case 'twist': {
      const v = randi(0, 2);
      if (v === 0) { for (const y of [5, h - 5]) { mirror(5, y, T.PILLAR); mirror(9, y, T.PILLAR); } }
      else if (v === 1) { for (let i = -2; i <= 2; i++) { set(cx + i, Math.floor(h / 2), T.PILLAR); } set(cx, Math.floor(h / 2) - 2, T.PILLAR); set(cx - 1, Math.floor(h / 2) + 2, T.PILLAR); }
      else { for (let i = 0; i < 5; i++) mirror(randi(3, cx - 2), randi(4, h - 3), T.PILLAR); }
      break;
    }
    case 'terrain': {
      const kind = terrain === 'both' ? pick(['chasm', 'spikes']) : terrain;
      R.terrain = kind;
      if (kind === 'chasm') {
        if (Math.random() < 0.5) {
          // central rift with two narrow bridges
          for (let y = 6; y <= h - 6; y++) for (let x = 3; x < w - 3; x++) set(x, y, T.CHASM);
          for (const bx of [6, w - 7]) for (let y = 6; y <= h - 6; y++) { set(bx, y, T.FLOOR); set(bx + 1, y, T.FLOOR); }
        } else {
          // island ring: platform in the middle, four bridges
          const my = Math.floor(h / 2);
          for (let y = 4; y < h - 3; y++) for (let x = 4; x < w - 4; x++) {
            const inner = x > 8 && x < w - 9 && y > 6 && y < h - 6;
            if (!inner) set(x, y, T.CHASM);
          }
          for (let x = 4; x < w - 4; x++) { set(x, my, T.FLOOR); }
          for (let y = 4; y < h - 3; y++) { set(cx, y, T.FLOOR); set(cx - 1, y, T.FLOOR); }
        }
      } else {
        // spike rows in alternating phase: there is always a readable, deterministic path
        for (let y = 4; y < h - 3; y += 3) for (let x = 2; x < w - 2; x++) {
          set(x, y, T.SPIKE);
          spikePhase[y * w + x] = ((Math.floor(x / 3) % 2) * SPIKE_CYCLE) / 2;
        }
        mirror(4, 6, T.PILLAR); mirror(4, h - 6, T.PILLAR);
      }
      break;
    }
    case 'fork': mirror(5, Math.floor(h / 2), T.PILLAR); break;
    case 'arena': for (const [x, y] of [[5, 5], [5, h - 5]]) mirror(x, y, T.PILLAR); break;
    case 'boss': for (const [x, y] of [[5, 5], [5, h - 5]]) mirror(x, y, T.PILLAR); break;
    case 'bonfire': break;
  }
  // exits in the top wall
  const exitAt = (x, kind) => R.exits.push({ x: x * TS + TS, y: 2 * TS - 2, tx: x, kind, open: false });
  if (planId === 'fork') { exitAt(4, 'safe'); exitAt(w - 6, 'cursed'); }
  else exitAt(cx - 1, 'next');
  // keep spawn lane in front of the entrance clear
  for (let y = h - 3; y < h - 1; y++) for (let x = cx - 2; x <= cx + 1; x++) if (grid[y * w + x] !== T.WALL) grid[y * w + x] = T.FLOOR;
  for (let x = 4; x < w - 4; x += 6) R.torches.push({ x: x * TS + 8, y: 1 * TS + 6 });
  R.entry = { x: cx * TS, y: (h - 2) * TS + 4 };
  bakeRoom(R);
  R.flow = new Int16Array(w * h).fill(-1);
  R.flowT = 0;
  return R;
}

export const tileAt = (R, x, y) => {
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return T.WALL;
  return R.grid[ty * R.w + tx];
};
export const solidT = (v) => v === T.WALL || v === T.PILLAR;

export function spikeState(R, tx, ty, t) {
  const ph = (t + R.spikePhase[ty * R.w + tx]) % SPIKE_CYCLE;
  return ph >= SPIKE_UP ? 2 : ph >= SPIKE_WARN ? 1 : 0;
}

// circle vs tile collision; `avoidChasm` treats chasm as solid (walking enemies)
export function collide(R, e, avoidChasm = false) {
  const blocked = (tx, ty) => { const v = tx < 0 || ty < 0 || tx >= R.w || ty >= R.h ? T.WALL : R.grid[ty * R.w + tx]; return solidT(v) || (avoidChasm && v === T.CHASM); };
  // centre inside a solid tile (pushed in by a big body): eject toward the nearest open side
  {
    const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS);
    if (blocked(tx, ty)) {
      const opts = [
        [e.x - tx * TS, -1, 0], [(tx + 1) * TS - e.x, 1, 0], [e.y - ty * TS, 0, -1], [(ty + 1) * TS - e.y, 0, 1],
      ].filter(([, dx, dy]) => !blocked(tx + dx, ty + dy)).sort((a, b) => a[0] - b[0]);
      if (opts.length) { const [d, dx, dy] = opts[0]; e.x += dx * (d + e.r + 0.1); e.y += dy * (d + e.r + 0.1); }
      else if (G.room === R && R.entry) { e.x = R.entry.x; e.y = R.entry.y; }
    }
  }
  for (let it = 0; it < 2; it++) {
    const x0 = Math.floor((e.x - e.r) / TS), x1 = Math.floor((e.x + e.r) / TS);
    const y0 = Math.floor((e.y - e.r) / TS), y1 = Math.floor((e.y + e.r) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const v = tx < 0 || ty < 0 || tx >= R.w || ty >= R.h ? T.WALL : R.grid[ty * R.w + tx];
      if (!(solidT(v) || (avoidChasm && v === T.CHASM))) continue;
      const nx = Math.max(tx * TS, Math.min(e.x, tx * TS + TS));
      const ny = Math.max(ty * TS, Math.min(e.y, ty * TS + TS));
      const dx = e.x - nx, dy = e.y - ny, d = Math.hypot(dx, dy);
      if (d < e.r) {
        if (d === 0) continue;
        const push = e.r - d;
        e.x += (dx / d) * push; e.y += (dy / d) * push;
      }
    }
  }
}

// sub-stepped move: fast bodies (rolls, lunges, dashes) can never tunnel through a 1-tile wall
export function moveCollide(R, e, dx, dy, avoidChasm = false) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  for (let i = 0; i < n; i++) { e.x += dx / n; e.y += dy / n; collide(R, e, avoidChasm); }
}

export function los(R, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solidT(tileAt(R, ax + (bx - ax) * t, ay + (by - ay) * t))) return false;
  }
  return true;
}

// BFS distance field from the player — enemies flow around pillars and chasms
export function updateFlow(R, px, py) {
  const { w, h, grid, flow } = R;
  flow.fill(-1);
  const sx = Math.floor(px / TS), sy = Math.floor(py / TS);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const q = new Int32Array(w * h); let qh = 0, qt = 0;
  flow[sy * w + sx] = 0; q[qt++] = sy * w + sx;
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0, d = flow[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx, v = grid[j];
      if (flow[j] !== -1 || v === T.WALL || v === T.PILLAR || v === T.CHASM) continue;
      flow[j] = d + 1; q[qt++] = j;
    }
  }
}
export function flowDir(R, x, y) {
  const { w, h, flow } = R;
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  let best = null, bd = 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const f = flow[ny * w + nx];
    if (f < 0) continue;
    if (dx && dy && (flow[ty * w + nx] < 0 || flow[ny * w + tx] < 0)) continue; // no corner cutting
    if (f < bd) { bd = f; best = [nx * TS + 8 - x, ny * TS + 8 - y]; }
  }
  if (!best) return null;
  const l = Math.hypot(best[0], best[1]) || 1;
  return { x: best[0] / l, y: best[1] / l };
}

export function spawnPoint(R, px, py, minD = 90) {
  for (let i = 0; i < 200; i++) {
    const tx = randi(2, R.w - 3), ty = randi(3, R.h - 3);
    if (R.grid[ty * R.w + tx] !== T.FLOOR) continue;
    const x = tx * TS + 8, y = ty * TS + 8;
    if (Math.hypot(x - px, y - py) < minD && i < 150) continue;
    return { x, y };
  }
  return { x: R.w * 8, y: R.h * 6 };
}

// ---------------- baking ----------------
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
function shade(hex, k) { const [r, g, b] = hexRgb(hex); return rgb(r * k, g * k, b * k); }

function bakeRoom(R) {
  const { w, h, grid, theme } = R;
  const W = w * TS, H = h * TS;
  const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  const ov = document.createElement('canvas'); ov.width = W; ov.height = H;
  const g = bg.getContext('2d'), o = ov.getContext('2d');
  const rnd = mulberry32(R.seed);
  const [f0, f1, f2] = theme.floor, [w0, w1, w2] = theme.wall;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.WALL : grid[y * w + x]);

  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const v = at(tx, ty), X = tx * TS, Y = ty * TS;
    if (v === T.FLOOR || v === T.SPIKE || v === T.PILLAR) {
      // stone slab: base + per-pixel dither specks + darker seams
      g.fillStyle = f0; g.fillRect(X, Y, TS, TS);
      for (let i = 0; i < 26; i++) { g.fillStyle = rnd() < 0.5 ? f1 : f2; g.fillRect(X + ((rnd() * TS) | 0), Y + ((rnd() * TS) | 0), 1, 1); }
      g.fillStyle = f2; g.fillRect(X, Y + TS - 1, TS, 1); g.fillRect(X + TS - 1, Y, 1, TS);
      if (rnd() < 0.12) { g.fillStyle = f2; let cx = X + 3 + rnd() * 10, cy = Y + 3; for (let i = 0; i < 9; i++) { g.fillRect(cx | 0, cy | 0, 1, 1); cx += rnd() * 2 - 1; cy += 1; } }
      if (rnd() < 0.1) { g.fillStyle = theme.speck; for (let i = 0; i < 4; i++) g.fillRect(X + ((rnd() * 14) | 0), Y + ((rnd() * 14) | 0), 2, 1); }
      // ambient occlusion under the top wall
      if (at(tx, ty - 1) === T.WALL && ty <= 2) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y, TS, 4); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(X, Y + 4, TS, 3); }
      if (v === T.SPIKE) {
        g.fillStyle = shade(w1, 0.8); g.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
        g.fillStyle = shade(w0, 0.7);
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) g.fillRect(X + 3 + sx * 4, Y + 3 + sy * 4, 2, 2);
      }
    } else if (v === T.CHASM) {
      g.fillStyle = '#030206'; g.fillRect(X, Y, TS, TS);
      if (at(tx, ty - 1) !== T.CHASM) { // cliff face seen from above-front
        g.fillStyle = w1; g.fillRect(X, Y, TS, 5);
        g.fillStyle = shade(w1, 0.6); g.fillRect(X, Y + 5, TS, 3);
        g.fillStyle = shade(w1, 0.35); g.fillRect(X, Y + 8, TS, 2);
        for (let i = 0; i < 4; i++) { g.fillStyle = w2; g.fillRect(X + ((rnd() * 15) | 0), Y + ((rnd() * 4) | 0), 1, 1); }
      }
      if (rnd() < 0.15) { g.fillStyle = '#120c1c'; g.fillRect(X + ((rnd() * 15) | 0), Y + 10 + ((rnd() * 5) | 0), 1, 1); }
    } else if (v === T.WALL) {
      const below = at(tx, ty + 1);
      if (ty === 1 || (below !== T.WALL && ty < h - 1 && ty > 0 && tx > 0 && tx < w - 1)) {
        // front face: bricks
        g.fillStyle = w0; g.fillRect(X, Y, TS, TS);
        g.fillStyle = w1;
        for (let r = 0; r < 4; r++) { g.fillRect(X, Y + r * 4 + 3, TS, 1); const off = (r % 2) * 6 + ((tx * 5) % 4); for (let c = off; c < TS; c += 9) g.fillRect(X + c, Y + r * 4, 1, 3); }
        for (let i = 0; i < 6; i++) { g.fillStyle = rnd() < 0.5 ? w2 : w1; g.fillRect(X + ((rnd() * TS) | 0), Y + ((rnd() * TS) | 0), 1, 1); }
        g.fillStyle = w2; g.fillRect(X, Y, TS, 1);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(X, Y + TS - 2, TS, 2);
      } else {
        g.fillStyle = '#0c0912'; g.fillRect(X, Y, TS, TS);
        g.fillStyle = shade(w0, 0.5);
        if (at(tx, ty + 1) !== T.WALL) g.fillRect(X, Y + TS - 1, TS, 1);
        if (at(tx + 1, ty) !== T.WALL) g.fillRect(X + TS - 1, Y, 1, TS);
        if (at(tx - 1, ty) !== T.WALL) g.fillRect(X, Y, 1, TS);
      }
    }
  }
  // pillars: face in footprint (bg), cap above footprint (overlay) => correct 3/4 occlusion
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (at(tx, ty) !== T.PILLAR) continue;
    const X = tx * TS, Y = ty * TS;
    g.fillStyle = w0; g.fillRect(X + 1, Y, TS - 2, TS - 2);
    g.fillStyle = w1; for (let r = 0; r < 3; r++) g.fillRect(X + 1, Y + 4 + r * 4, TS - 2, 1);
    g.fillRect(X + 1, Y, 1, TS - 2);
    g.fillStyle = w2; g.fillRect(X + TS - 3, Y, 1, TS - 3);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(X, Y + TS - 2, TS, 3);
    o.fillStyle = shade(w2, 0.9); o.fillRect(X, Y - 10, TS, 10);
    o.fillStyle = w2; o.fillRect(X + 1, Y - 10, TS - 2, 1);
    o.fillStyle = shade(w0, 0.8); o.fillRect(X, Y - 1, TS, 1);
    for (let i = 0; i < 5; i++) { o.fillStyle = shade(w2, 1.2); o.fillRect(X + 2 + ((rnd() * 11) | 0), Y - 8 + ((rnd() * 6) | 0), 1, 1); }
  }
  // top wall cap overlays entities walking right under it
  for (let tx = 0; tx < w; tx++) { o.fillStyle = '#0c0912'; o.fillRect(tx * TS, 0, TS, TS - 4); o.fillStyle = shade(w0, 0.5); o.fillRect(tx * TS, TS - 5, TS, 1); }
  // scattered bones / roots decor
  for (let i = 0; i < 10; i++) {
    const tx = randi(2, w - 3), ty = randi(3, h - 2);
    if (at(tx, ty) !== T.FLOOR) continue;
    g.fillStyle = rnd() < 0.5 ? '#6b5f82' : theme.speck;
    const X = tx * TS + ((rnd() * 10) | 0), Y = ty * TS + ((rnd() * 10) | 0);
    g.fillRect(X, Y, 3, 1); g.fillRect(X + 1, Y - 1, 1, 3);
  }
  R.bg = bg; R.ov = ov; R.pw = W; R.ph = H;
}

// dynamic tiles drawn every frame: spikes (under entities), exits (over the wall cap)
export function drawSpikes(g, R, t) {
  const { w, h, grid } = R;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (grid[ty * w + tx] !== T.SPIKE) continue;
    const s = spikeState(R, tx, ty, t), X = tx * TS, Y = ty * TS;
    if (s === 0) continue;
    g.fillStyle = s === 2 ? '#ece4d0' : '#8c1c33';
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      const px = X + 3 + sx * 4, py = Y + 3 + sy * 4;
      if (s === 2) { g.fillRect(px, py - 3, 2, 4); g.fillStyle = '#b8aa90'; g.fillRect(px + 1, py - 3, 1, 4); g.fillStyle = '#ece4d0'; }
      else g.fillRect(px, py, 2, 1);
    }
  }
}
export function drawExits(g, R, t) {
  for (const ex of R.exits) {
    const X = ex.tx * TS, Y = 0;
    const col = ex.kind === 'cursed' ? '#e0404f' : R.theme.accent;
    if (ex.open) {
      const p = 0.5 + 0.5 * Math.sin(t * 4);
      g.fillStyle = '#05030a'; g.fillRect(X + 2, Y + 4, TS * 2 - 4, TS * 2 - 4);
      g.fillStyle = col; g.globalAlpha = 0.35 + p * 0.3; g.fillRect(X + 4, Y + 6, TS * 2 - 8, TS * 2 - 8); g.globalAlpha = 1;
      g.fillStyle = col;
      for (let i = 0; i < 3; i++) { const yy = Y + 22 - ((t * 20 + i * 7) % 20); g.fillRect(X + 8 + i * 7, yy, 1, 2); }
    } else {
      g.fillStyle = '#05030a'; g.fillRect(X + 2, Y + 4, TS * 2 - 4, TS * 2 - 4);
      g.fillStyle = '#474e63'; for (let i = 0; i < 6; i++) g.fillRect(X + 4 + i * 5, Y + 5, 2, TS * 2 - 6);
      g.fillStyle = col; g.globalAlpha = 0.6; g.fillRect(X + 13, Y + 14, 6, 4); g.globalAlpha = 1;
    }
    // arch
    g.fillStyle = R.theme.wall[2]; g.fillRect(X, Y + 2, 2, TS * 2 - 2); g.fillRect(X + TS * 2 - 2, Y + 2, 2, TS * 2 - 2); g.fillRect(X, Y + 2, TS * 2, 2);
    if (ex.kind === 'cursed') { g.fillStyle = '#e0404f'; g.fillRect(X + 14, Y - 1, 4, 3); }
  }
}

export function openExits(R) {
  for (const ex of R.exits) {
    ex.open = true;
    R.grid[1 * R.w + ex.tx] = T.FLOOR; R.grid[1 * R.w + ex.tx + 1] = T.FLOOR;
  }
}
export function exitHit(R, x, y) {
  for (const ex of R.exits) if (ex.open && y < TS * 1.6 && x > ex.tx * TS && x < ex.tx * TS + TS * 2) return ex;
  return null;
}
export { G };
