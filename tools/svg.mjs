// README hero image via the `pixel-art` SVG skill method: every pixel is a <rect> on a fixed grid,
// characters placed with <g transform="translate()">, tight viewBox. Source = the game's own sprites.
import fs from 'node:fs';
import { HEAD, TORSO, LEGS, LEGMAP, BOSS_ART } from '../src/art/pixels.js';
import { PAL, OUTLINE } from '../src/engine/sprite.js';
import { HERO } from '../src/data/weapons.js';

const P = 5; // px per pixel
function grid(rows, map = {}, accent) {
  const pal = { ...PAL, ...(accent ? { x: accent[0], X: accent[1] } : {}) };
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
  const g = Array.from({ length: H + 2 }, () => Array(W + 2).fill(null));
  rows.forEach((r, y) => [...r].forEach((ch, x) => { ch = map[ch] || ch; if (ch !== '.' && pal[ch]) g[y + 1][x + 1] = pal[ch]; }));
  const filled = g.map((r) => r.map((c) => c !== null));
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) if (!filled[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled[y + dy]?.[x + dx])) g[y][x] = OUTLINE;
  return g;
}
function rects(g) {
  let s = '';
  g.forEach((r, y) => r.forEach((c, x) => { if (c) s += `<rect x="${x * P}" y="${y * P}" width="${P}" height="${P}" fill="${c}"/>`; }));
  return s;
}
let body = '', x = 24;
// Heracles in four armour weights (the look follows equipped gear)
const LOOKS = [['none', 'без брони', '#ff8f3a'], ['light', 'лёгкая', '#e0404f'], ['medium', 'средняя', '#93e2ff'], ['heavy', 'тяжёлая', '#ffd36b']];
for (const [w, label, acc] of LOOKS) {
  const g = grid([...HEAD[w], ...TORSO[w], ...LEGS.stand], LEGMAP[w], [acc, '#2a2438']);
  body += `<g transform="translate(${x},${150 - g.length * P})">${rects(g)}</g>`;
  body += `<text x="${x + (g[0].length * P) / 2}" y="168" fill="${acc}" font-size="12" text-anchor="middle">${label}</text>`;
  x += 90;
}
let bx = 400;
for (const k of ['warden', 'smith', 'heart']) {
  const g = grid(BOSS_ART[k]);
  const s = 0.62;
  body += `<g transform="translate(${bx},${150 - g.length * P * s}) scale(${s})" opacity="0.9">${rects(g)}</g>`;
  bx += g[0].length * P * s + 14;
}
const W = Math.ceil(bx + 10), H = 184;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace">
<rect width="${W}" height="${H}" fill="#07050c" rx="12"/>
<text x="24" y="38" fill="#ece4d0" font-size="26" font-weight="700" letter-spacing="6">ASHROOT</text>
<text x="24" y="58" fill="#9b8fb3" font-size="12">Тринадцатый подвиг Геракла · 5 глубин Аида · 5 порождений Тифона</text>
${body}
</svg>`;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/hero.svg', svg);
console.log('docs/hero.svg', W, 'x', H, (svg.length / 1024).toFixed(0) + 'KB');
