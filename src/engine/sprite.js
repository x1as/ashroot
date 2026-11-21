// Pixel sprite baker.
// Method (layer-pixel-art): every sprite lives on a FIXED grid with a FIXED palette,
// hard-edged pixels only, no anti-aliasing; every animation frame is derived from frame one
// (same canvas, bottom-centre anchor) so nothing drifts or bobs by accident.
// Sprites are authored as strings, one char = one pixel, then baked once into canvases.

export const PAL = {
  k: '#14111c', d: '#2a2438', m: '#433a56', l: '#6b5f82', p: '#9b8fb3',
  w: '#ece4d0', b: '#b8aa90', c: '#8a7c68',
  n: '#7d6b58', N: '#4a3d33',
  s: '#cfd5e0', S: '#8189a0', T: '#474e63',
  r: '#e0404f', R: '#8c1c33',
  e: '#ff8f3a', E: '#b5481c',
  y: '#ffd36b', Y: '#b88a2e',
  f: '#93e2ff', F: '#4b8fc9',
  a: '#b88cff', A: '#6a44c2',
  g: '#b4ec5f', G: '#5f9a2e',
  t: '#63e6cf', q: '#2f8f84',
  z: '#8f9c5e', Z: '#56603a', v: '#3a4028',
  h: '#f2a6b0', // flesh pink (heart boss)
};
export const OUTLINE = '#08060d';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// rows: string[]; opts.map: char->char remap (class colours); opts.accent: [x, X] hexes
export function bake(rows, opts = {}) {
  const map = opts.map || {};
  const pal = { ...PAL, ...(opts.pal || {}) };
  if (opts.accent) { pal.x = opts.accent[0]; pal.X = opts.accent[1]; }
  const outline = opts.outline !== false;
  const W = Math.max(...rows.map((r) => r.length));
  const H = rows.length;
  const pad = outline ? 1 : 0;
  const w = W + pad * 2, h = H + pad * 2;
  const grid = new Array(w * h).fill(null);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let ch = rows[y][x] || '.';
      if (map[ch]) ch = map[ch];
      if (ch === '.' || ch === ' ') continue;
      grid[(y + pad) * w + (x + pad)] = pal[ch] || '#ff00ff';
    }
  }
  if (outline) {
    const filled = grid.map((v) => v !== null);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (filled[y * w + x]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && filled[yy * w + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) grid[y * w + x] = OUTLINE;
    }
  }
  const c = mk(w, h), wc = mk(w, h);
  const g = c.getContext('2d'), wg = wc.getContext('2d');
  wg.fillStyle = '#ffffff';
  const pixels = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = grid[y * w + x];
    if (!col) continue;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
    wg.fillRect(x, y, 1, 1);
    if (col !== OUTLINE) pixels.push({ x, y, c: col });
  }
  // anchor: bottom centre (feet), like every frame shares one delivery canvas
  return { c, white: wc, w, h, ox: Math.floor(w / 2), oy: h - 1, pixels };
}

// Tinted silhouette (for elite auras, ghost echoes).
export function tint(spr, color) {
  const c = mk(spr.w, spr.h);
  const g = c.getContext('2d');
  g.drawImage(spr.white, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, spr.w, spr.h);
  return c;
}

export function toDataURL(spr, scale = 4) {
  const c = mk(spr.w * scale, spr.h * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr.c, 0, 0, c.width, c.height);
  return c.toDataURL();
}

// Draw a baked sprite at world position (anchor), with optional flip/scale (squash & stretch).
export function drawSprite(ctx, spr, x, y, o = {}) {
  const sx = (o.flip ? -1 : 1) * (o.sx ?? 1), sy = o.sy ?? 1;
  const img = o.white ? spr.white : spr.c;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(sx, sy);
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.drawImage(o.img || img, -spr.ox, -spr.oy);
  ctx.restore();
}

// Crisp pixel-perfect filled circle / ellipse (no AA) — used for telegraphs, shadows, nodes.
export function pcircle(ctx, cx, cy, r, ry = r) {
  cx = Math.round(cx); cy = Math.round(cy);
  const R = Math.max(0.5, r), RY = Math.max(0.5, ry);
  for (let y = -Math.ceil(RY); y <= Math.ceil(RY); y++) {
    const t = 1 - (y * y) / (RY * RY);
    if (t < 0) continue;
    const hw = Math.round(R * Math.sqrt(t));
    ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
}
export function pring(ctx, cx, cy, r, th = 1) {
  cx = Math.round(cx); cy = Math.round(cy);
  const steps = Math.max(12, Math.floor(r * 6));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), th, th);
  }
}
