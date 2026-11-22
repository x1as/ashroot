// Screen-space HUD (CSS px). Minimal: bars top-left, the floor's interest curve top-centre,
// aspects top-right, boss bar bottom. Stamina is diegetic: a ring around the hero when spent.
import { G } from '../game/state.js';
import { SPR } from '../art/bank.js';
import { ASPECTS, RESONANCE } from '../data/boons.js';
import { ROOM_PLAN, FLOORS } from '../data/floors.js';
import { BOSSES } from '../data/bosses.js';
import { ease, clamp, TAU } from '../engine/util.js';
import { input } from '../engine/input.js';

const ROMAN2 = ['I', 'II'];
// game-ui-ux: >=18px text at 1080p, crisp vector type; pixel art only in sprites, at integer scale
const FONT = '"PT Sans", "Segoe UI", sans-serif';
const DISPLAY = '"Forum", Georgia, serif';
// icons are drawn at an integer multiple of their (Scale2x) canvas: never blurry, never shimmering
const icon = (ctx, name, x, y, s, a = 1) => { const sp = SPR.icon[name]; if (!sp) return; const m = Math.max(1, Math.round(s / 2)); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false; ctx.drawImage(sp.c, Math.round(x), Math.round(y), sp.c.width * m, sp.c.height * m); ctx.globalAlpha = 1; };
const font = (ctx, px) => { ctx.font = `700 ${Math.round(px * 1.5)}px ${FONT}`; };
const dfont = (ctx, px) => { ctx.font = `${Math.round(px)}px ${DISPLAY}`; };

export function drawHUD(ctx, w2s) {
  const v = G.view, P = G.player, r = G.run;
  if (!P || !r) return;
  const cw = v.cw, ch = v.ch;
  const hs = clamp(Math.min(cw, ch) / 600, 1, 1.8);
  const pad = 14 * hs + (G.safe?.l || 0);
  const top = 12 * hs + (G.safe?.t || 0);
  ctx.textBaseline = 'alphabetic';

  // ---- HEARTS / shields / stamina ----
  const bw = Math.round(Math.min(220 * hs, cw * 0.36));
  const maxHp = P.s.maxHp;
  const px = Math.max(4, Math.round(4.2 * hs)); // one heart pixel, integer CSS px -> crisp
  let hx = pad;
  P.hpShown = P.hpShown === undefined ? P.hp : P.hpShown + (P.hp - P.hpShown) * 0.25;
  const low = P.hp <= 1 && !P.dead;
  for (let i = 0; i < maxHp; i++) {
    const fill = clamp(P.hp - i, 0, 1);
    const beat = low && i === 0 ? 1 + 0.12 * Math.max(0, Math.sin(G.real * 9)) : 1;
    drawHeart(ctx, hx, top, px * beat, fill, P.flash > 0 && fill < 1 && P.hp - i > -1);
    // ghost heart: the one just lost, filled back by hitting enemies before it fades
    if (P.rally > 0 && i >= Math.floor(P.hp) && i < Math.floor(P.hp) + P.rally && fill < 1) {
      const a = 0.35 + 0.35 * Math.sin(G.real * 10) * Math.min(1, P.rallyT);
      drawHeart(ctx, hx, top, px, Math.min(1, fill + P.rallyProg), false, `rgba(255,255,255,${a.toFixed(2)})`);
    }
    hx += px * 8 + Math.round(2 * hs);
  }
  // bronze shields (from armour): each takes a whole blow, then comes back after a quiet moment
  if (P.s.ward > 0 || P.frostShield > 0) hx += Math.round(4 * hs);
  for (let i = 0; i < P.s.ward; i++) {
    const full = i < P.ward, regen = i === P.ward ? P.wardT / P.s.wardTime : 0;
    drawShield(ctx, hx, top, px, full ? 1 : regen, P.pburnT > 0 && !full);
    hx += px * 8 + Math.round(2 * hs);
  }
  for (let i = 0; i < P.frostShield; i++) { drawShield(ctx, hx, top, px, 1, false, '#93e2ff', '#4b8fc9'); hx += px * 8 + Math.round(2 * hs); }
  const bh = px * 7;
  // stamina: full-width bar, segmented every 25 points so costs are readable; flashes red when spent
  const sy = top + bh + 6 * hs, sh = Math.max(5, Math.round(6 * hs));
  P.staChip = P.staChip === undefined ? P.sta : P.staChip + (P.sta - P.staChip) * (P.sta < P.staChip ? 0.06 : 1);
  const staLow = P.sta < P.s.dodgeCost;
  ctx.fillStyle = '#08060d'; ctx.fillRect(pad - 2, sy - 2, bw + 4, sh + 4);
  ctx.fillStyle = staLow && Math.sin(G.real * 14) > 0 ? '#3a1520' : '#1c1826'; ctx.fillRect(pad, sy, bw, sh);
  ctx.fillStyle = 'rgba(236,228,208,0.35)'; ctx.fillRect(pad, sy, (bw * Math.max(0, P.staChip)) / P.s.maxSta, sh);
  ctx.fillStyle = P.staDelay > 0 ? '#b8aa90' : '#ffe9a8';
  ctx.fillRect(pad, sy, (bw * Math.max(0, P.sta)) / P.s.maxSta, sh);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(pad, sy, (bw * Math.max(0, P.sta)) / P.s.maxSta, Math.max(1, sh * 0.3));
  ctx.fillStyle = '#08060d';
  for (let v2 = 25; v2 < P.s.maxSta; v2 += 25) ctx.fillRect(pad + (bw * v2) / P.s.maxSta, sy, Math.max(1, hs), sh);
  font(ctx, 10 * hs); ctx.textAlign = 'left'; ctx.fillStyle = staLow ? '#ff5a6a' : '#b8aa90';
  ctx.fillText(`${Math.floor(Math.max(0, P.sta))}`, pad + bw + 8 * hs, sy + sh - 1);
  // flasks + ash
  const fy = sy + sh + 8 * hs, is = hs >= 1.15 ? 4 : 2;
  for (let i = 0; i < P.s.flasks; i++) icon(ctx, 'flask', pad + i * (9 * is), fy, is, i < P.flasks ? 1 : 0.22);
  const ax = pad + Math.max(P.s.flasks, 1) * 9 * is + 10 * hs;
  icon(ctx, 'ash', ax, fy, is);
  font(ctx, 14 * hs); ctx.fillStyle = '#ece4d0';
  ctx.fillText(Math.floor(r.ash), ax + 9 * is, fy + 6 * is);
  if (P.arcaneUp) { ctx.fillStyle = '#b8aa90'; ctx.fillText('кора', ax + 9 * is + 70 * hs, fy + 6 * is); }
  if (r.items.length) { ctx.fillStyle = '#ffb347'; ctx.fillText(`находки ${r.items.length}`, ax + 9 * is + 140 * hs, fy + 6 * is); }

  // ---- interest curve: floor rooms as tension bars ----
  const F = FLOORS[r.floor - 1];
  const n = ROOM_PLAN.length, pw = 14 * hs, gap = 5 * hs;
  const totalW = n * pw + (n - 1) * gap, x0 = cw / 2 - totalW / 2;
  font(ctx, 12 * hs); ctx.textAlign = 'center'; ctx.fillStyle = F.theme.accent;
  dfont(ctx, 26 * hs); ctx.fillText(`${F.name}, ${F.sub.replace("Глубина", "глубина")}`, cw / 2, top + 14 * hs);
  for (let i = 0; i < n; i++) {
    const t = ROOM_PLAN[i].tension, hgt = (4 + t * 1.6) * hs, x = x0 + i * (pw + gap), y = top + 48 * hs - hgt;
    const cur = i === r.roomIdx, done = i < r.roomIdx;
    ctx.fillStyle = done ? '#6b5f82' : cur ? F.theme.accent : '#2a2438';
    if (cur) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.real * 5);
    ctx.fillRect(x, y, pw, hgt);
    ctx.globalAlpha = 1;
    if (ROOM_PLAN[i].id === 'arena' && r.cursed) { ctx.fillStyle = '#e0404f'; ctx.fillRect(x, y - 3 * hs, pw, 2 * hs); }
  }
  font(ctx, 10 * hs); ctx.fillStyle = '#9b8fb3';
  const S = G.room.state, wv = S && S.waves && S.waves.length > 1 && S.wave >= 0 && !S.cleared ? `, волна ${S.wave + 1} из ${S.waves.length}` : '';
  ctx.fillText(ROOM_PLAN[r.roomIdx].name + wv, cw / 2, top + 70 * hs);

  // ---- aspects (top right) ----
  let ay = top + (input.touch ? 44 : 0);
  const rx = cw - pad - (G.safe?.r || 0);
  ctx.textAlign = 'right';
  for (const [k, A] of Object.entries(ASPECTS)) {
    const lvl = r.aspects[k] || 0;
    if (!lvl) continue;
    icon(ctx, A.icon, rx - 9 * is, ay, is);
    font(ctx, 13 * hs); ctx.fillStyle = A.color;
    const sh2 = P.s.resoShift || 0, t1 = 3 - sh2, t2 = 5 - sh2;
    const tier = lvl >= t2 ? ROMAN2[1] : lvl >= t1 ? ROMAN2[0] : `${lvl}/${t1}`;
    ctx.fillText(`${A.name} ${tier}`, rx - 10 * is, ay + 6 * is);
    ay += 10 * is;
  }
  const pacts = Object.keys(r.boons).filter((id) => id.startsWith('p_')).length;
  if (pacts) { icon(ctx, 'pact', rx - 7 * is, ay, is); font(ctx, 13 * hs); ctx.fillStyle = '#ff3355'; ctx.fillText(`Пакты ${pacts}`, rx - 9 * is, ay + 6 * is); }

  // ---- charged attack hint + statuses ----
  if (!input.touch) {
    font(ctx, 11 * hs); ctx.textAlign = 'right'; ctx.fillStyle = '#6b5f82';
    ctx.fillText('держи атаку: ' + P.C.power.name, cw - pad - (G.safe?.r || 0), ch - pad - (G.safe?.b || 0));
  } else {
    const fl = document.getElementById('btn-flask');
    if (fl) fl.dataset.n = P.flasks;
  }
  {
    const st = [];
    if (P.state === 'stun') st.push(['оглушён', '#ffd36b', P.stunT - P.st]);
    if (P.slowT > 0) st.push(['замедлен', '#93e2ff', P.slowT]);
    if (P.pbleedT > 0) st.push(['рана: без лечения', '#e0404f', P.pbleedT]);
    if (P.pburnT > 0) st.push(['огонь: щиты плавятся', '#ff8f3a', P.pburnT]);
    if (P.rageT > 0) st.push(['ярость Ареса', '#ff3355', P.rageT]);
    if (P.invisT > 0) st.push(['невидим', '#b88cff', P.invisT]);
    if (P.domeT > 0) st.push(['купол', '#ffd36b', P.domeT]);
    font(ctx, 13 * hs); ctx.textAlign = 'center';
    let sx = cw / 2 - (st.length - 1) * 83 * hs;
    for (const [n, c, t] of st) {
      ctx.fillStyle = 'rgba(8,6,13,0.8)'; ctx.fillRect(sx - 80 * hs, ch * 0.16, 160 * hs, 20 * hs);
      ctx.fillStyle = c; ctx.fillRect(sx - 80 * hs, ch * 0.16 + 18 * hs, 160 * hs * Math.min(1, t / 3), 2 * hs);
      ctx.fillText(`${n} ${Math.max(0, t).toFixed(1)}`, sx, ch * 0.16 + 14 * hs);
      sx += 166 * hs;
    }
    ctx.textAlign = 'left';
  }

  // ---- diegetic stamina ring ----
  if (P.sta < P.s.maxSta - 0.5 && !P.dead) {
    // big readable ring beside the hero (world units -> screen), dodge-cost tick marks where a roll stops being possible
    const u = v.scale / v.dpr, sp = w2s(P.x + 11, P.y - 9), R = 5 * u;
    const k = Math.max(0, P.sta / P.s.maxSta), kc = P.s.dodgeCost / P.s.maxSta;
    ctx.lineWidth = Math.max(3, 1.6 * u);
    ctx.strokeStyle = 'rgba(8,6,13,0.7)'; ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = P.sta < P.s.dodgeCost ? '#ff5a6a' : P.staDelay > 0 ? '#b8aa90' : '#ffe9a8';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    ctx.strokeStyle = '#08060d'; ctx.lineWidth = Math.max(1, 0.5 * u);
    const a = -Math.PI / 2 + TAU * kc;
    ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * (R - 2 * u), sp.y + Math.sin(a) * (R - 2 * u)); ctx.lineTo(sp.x + Math.cos(a) * (R + 2 * u), sp.y + Math.sin(a) * (R + 2 * u)); ctx.stroke();
  }

  // ---- fork labels ----
  if (G.room.plan === 'fork' && G.room.exits[0].open) {
    for (const ex of G.room.exits) {
      const s = w2s(ex.x, ex.y + 30);
      font(ctx, 12 * hs); ctx.textAlign = 'center';
      ctx.fillStyle = ex.kind === 'cursed' ? '#ff3355' : '#ece4d0';
      ctx.fillText(ex.kind === 'cursed' ? 'ТРОПА НЕМЕЗИДЫ' : 'ТРОПА', s.x, s.y);
      font(ctx, 10 * hs); ctx.fillStyle = '#9b8fb3';
      ctx.fillText(ex.kind === 'cursed' ? 'арена: +элита, урон врагов ×1.25 · 2 дара' : 'обычная арена', s.x, s.y + 14 * hs);
    }
  }
  if (G.room.bonfire && !G.room.bonfire.used) { const s = w2s(G.room.bonfire.x, G.room.bonfire.y + 18); font(ctx, 11 * hs); ctx.textAlign = 'center'; ctx.fillStyle = '#ffd36b'; ctx.fillText('подойди к очагу Гестии', s.x, s.y);
    const nb = BOSSES[FLOORS[r.floor - 1].boss]; ctx.fillStyle = '#9b8fb3'; ctx.fillText(`за дверью — ${nb.name}. ${nb.myth}`, cw / 2, ch - 40 * hs); }
  if (G.room.echo) { const s = w2s(G.room.echo.x, G.room.echo.y + 12); font(ctx, 11 * hs); ctx.textAlign = 'center'; ctx.fillStyle = '#ece4d0'; ctx.fillText(`твоя тень · ${G.room.echo.ash} пепла`, s.x, s.y); }
  // controls hint in the very first room
  if (r.floor === 1 && r.roomIdx === 0 && G.room.state.t < 14) {
    font(ctx, 12 * hs); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(236,228,208,0.75)';
    const lines = input.touch ? ['стик — движение, ⚔ атака (держи — усиленный удар), ↯ перекат', 'бей в белую вспышку замаха — КОНТР · перекат в последний миг — ИДЕАЛЬНО']
      : ['WASD — движение, ЛКМ — атака (держи — усиленный удар), Space или ПКМ — перекат, Q — нектар, I — сокровищница', 'бей в белую вспышку замаха — КОНТР · перекат в последний миг — ИДЕАЛЬНО'];
    lines.forEach((l, i) => ctx.fillText(l, cw / 2, ch - (input.touch ? 150 : 52) * hs + i * 18 * hs));
  }

  // ---- boss bar ----
  const b = G.boss;
  if (b && !b.dead && b.state !== 'intro') {
    const w = input.touch ? Math.min(cw * 0.5, 420 * hs) : Math.min(cw * 0.62, 640 * hs), x = cw / 2 - w / 2, h = 7 * hs;
    const y = input.touch ? top + 74 * hs : ch - 34 * hs - (G.safe?.b || 0);
    font(ctx, 14 * hs); ctx.textAlign = 'left'; ctx.fillStyle = '#ece4d0';
    ctx.fillText(b.def.name, x, y - 8 * hs);
    ctx.fillStyle = '#08060d'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#2a1520'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(236,228,208,0.6)'; ctx.fillRect(x, y, (w * b.chip) / b.maxHp, h);
    ctx.fillStyle = b.phase === 2 ? '#e0404f' : '#b5281c'; ctx.fillRect(x, y, (w * Math.max(0, b.hp)) / b.maxHp, h);
    ctx.fillStyle = '#ece4d0'; ctx.fillRect(x + w / 2, y - 2, 1, h + 4);
  }

  // ---- banner (souls-style band) ----
  if (G.banner) {
    const B = G.banner, k = B.t / B.life;
    const a = k < 0.15 ? ease.outCubic(k / 0.15) : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const spread = 1 + (1 - ease.outCubic(Math.min(1, k * 2))) * 0.25;
    const cy = ch * 0.36;
    ctx.globalAlpha = a * 0.75;
    const grd = ctx.createLinearGradient(0, cy - 40 * hs, 0, cy + 40 * hs);
    grd.addColorStop(0, 'rgba(5,3,10,0)'); grd.addColorStop(0.5, 'rgba(5,3,10,0.9)'); grd.addColorStop(1, 'rgba(5,3,10,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, cy - 44 * hs, cw, 88 * hs);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    const tsz = Math.min(30 * hs, (cw * 0.9) / Math.max(6, B.title.length) * 0.95);
    dfont(ctx, tsz);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(2 * spread * hs)}px`;
    ctx.fillStyle = '#08060d'; ctx.fillText(B.title.toUpperCase(), cw / 2 + 3, cy + 3);
    ctx.fillStyle = B.color; ctx.fillText(B.title.toUpperCase(), cw / 2, cy);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (B.sub) { font(ctx, 13 * hs); ctx.fillStyle = '#b8aa90'; ctx.fillText(B.sub, cw / 2, cy + 26 * hs); }
    ctx.globalAlpha = 1;
  }

  // ---- vignettes / flash ----
  const lowV = P.hp <= 1 && !P.dead ? 0.25 + 0.15 * Math.pow(Math.max(0, Math.sin(G.real * 5)), 4) : 0;
  const va = Math.max(G.vign * 0.55, lowV);
  if (va > 0.01) {
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(140,28,51,0)'); g.addColorStop(1, `rgba(140,28,51,${va})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  }
  if (G.flash.a > 0.01) { ctx.globalAlpha = G.flash.a; ctx.fillStyle = G.flash.color; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
  if (G.slow > 0) { ctx.fillStyle = 'rgba(236,228,208,0.04)'; ctx.fillRect(0, 0, cw, ch); }
  // room transition: iris wipe
  if (G.transition) {
    const T = G.transition, k = T.dir > 0 ? ease.inCubic(Math.min(1, T.t / 0.35)) : 1 - ease.outCubic(Math.min(1, T.t / 0.45));
    const s = w2s(P.x, P.y - 6), maxR = Math.hypot(cw, ch);
    ctx.fillStyle = '#05030a';
    ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.arc(s.x, s.y, Math.max(0, maxR * (1 - k)), 0, TAU, true); ctx.fill('evenodd');
  }
}
export { RESONANCE };

// 7x7 pixel heart; fill 0..1 from the left (partial hearts after small heals)
const HEART = ['.XX.XX.', 'XhrXrrX', 'XrrrrrX', 'XrrrrrX', '.XrrrX.', '..XrX..', '...X...'];
function drawHeart(ctx, x, y, px, fill, white, ghost) {
  x = Math.round(x); y = Math.round(y); px = Math.round(px);
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ch = HEART[r][c]; if (ch === '.') continue;
    let col;
    if (ch === 'X') col = ghost ? null : '#08060d';
    else {
      const on = (c - 0.5) / 6 < fill;
      if (ghost) col = on ? ghost : null;
      else col = white && on ? '#ffffff' : on ? (ch === 'h' || (r === 1 && c === 2) ? '#ff9aa4' : r >= 4 ? '#a8202f' : '#e0404f') : '#2a1520';
    }
    if (!col) continue;
    ctx.fillStyle = col; ctx.fillRect(x + c * px, y + r * px, px, px);
  }
  if (!ghost) { ctx.fillStyle = '#08060d'; ctx.fillRect(x + 3 * px, y, px, px); }
}
const SHIELD = ['XXXXXXX', 'XhbbbbX', 'XbbYbbX', 'XbYYYbX', '.XbbbX.', '..XbX..', '...X...'];
function drawShield(ctx, x, y, px, fill, hot, c1 = '#f0d9a0', c2 = '#c8924a') {
  x = Math.round(x); y = Math.round(y); px = Math.round(px);
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ch = SHIELD[r][c]; if (ch === '.') continue;
    const on = (6 - r + 0.5) / 7 < fill || fill >= 1;
    ctx.fillStyle = ch === 'X' ? '#08060d' : !on ? (hot ? '#5a2a10' : '#1c1826') : ch === 'h' ? '#ffffff' : ch === 'Y' ? c2 : c1;
    ctx.fillRect(x + c * px, y + r * px, px, px);
  }
}
