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
const FONT = '"Tiny5", ui-monospace, monospace';
const DISPLAY = '"Press Start 2P", "Tiny5", ui-monospace, monospace';
const icon = (ctx, name, x, y, s, a = 1) => { const sp = SPR.icon[name]; if (!sp) return; ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false; ctx.drawImage(sp.c, Math.round(x), Math.round(y), sp.w * s, sp.h * s); ctx.globalAlpha = 1; };
const font = (ctx, px) => { ctx.font = `${Math.round(px * 1.15)}px ${FONT}`; };
const dfont = (ctx, px) => { ctx.font = `${Math.round(px)}px ${DISPLAY}`; };

export function drawHUD(ctx, w2s) {
  const v = G.view, P = G.player, r = G.run;
  if (!P || !r) return;
  const cw = v.cw, ch = v.ch;
  const hs = clamp(Math.min(cw, ch) / 560, 0.8, 1.35);
  const pad = 14 * hs + (G.safe?.l || 0);
  const top = 12 * hs + (G.safe?.t || 0);
  ctx.textBaseline = 'alphabetic';

  // ---- HP / rally / stamina ----
  const bw = Math.round(Math.min(220 * hs, cw * 0.36)), bh = Math.round(9 * hs);
  const maxHp = P.s.maxHp;
  P.chip = P.chip === undefined ? P.hp : P.chip + (P.hp - P.chip) * (P.hp < P.chip ? 0.04 : 0.5);
  ctx.fillStyle = '#08060d'; ctx.fillRect(pad - 2, top - 2, bw + 4, bh + 4);
  ctx.fillStyle = '#2a1520'; ctx.fillRect(pad, top, bw, bh);
  const hpw = (bw * Math.max(0, P.hp)) / maxHp;
  ctx.fillStyle = 'rgba(236,228,208,0.55)'; ctx.fillRect(pad, top, (bw * Math.max(0, P.chip)) / maxHp, bh);
  if (P.rally > 0) {
    const rw = (bw * Math.min(P.rally, maxHp - P.hp)) / maxHp;
    ctx.fillStyle = P.rallyGlow > 0 ? '#ffffff' : '#8a7c68';
    for (let x = 0; x < rw; x += 3) ctx.fillRect(pad + hpw + x, top, Math.min(2, rw - x), bh);
  }
  ctx.fillStyle = P.hp < maxHp * 0.3 ? (Math.sin(G.real * 8) > 0 ? '#ff5a6a' : '#e0404f') : '#e0404f';
  ctx.fillRect(pad, top, hpw, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pad, top, hpw, Math.max(1, bh * 0.3));
  font(ctx, 11 * hs); ctx.textAlign = 'left'; ctx.fillStyle = '#ece4d0';
  ctx.fillText(`${Math.max(0, Math.ceil(P.hp))} / ${maxHp}`, pad + bw + 8 * hs, top + bh - 1);
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
  const fy = sy + sh + 8 * hs, is = Math.max(2, Math.round(2.4 * hs));
  for (let i = 0; i < P.s.flasks; i++) icon(ctx, 'flask', pad + i * (8 * is), fy, is, i < P.flasks ? 1 : 0.22);
  const ax = pad + Math.max(P.s.flasks, 1) * 8 * is + 10 * hs;
  icon(ctx, 'ash', ax, fy, is);
  font(ctx, 14 * hs); ctx.fillStyle = '#ece4d0';
  ctx.fillText(Math.floor(r.ash), ax + 9 * is, fy + 6 * is);
  if (P.frostShield > 0) { ctx.fillStyle = '#93e2ff'; ctx.fillText(`❄${Math.ceil(P.frostShield)}`, ax + 9 * is + 50 * hs, fy + 6 * is); }
  if (P.arcaneUp) { ctx.fillStyle = '#b8aa90'; ctx.fillText('кора', ax + 9 * is + 50 * hs, fy + 6 * is); }
  if (r.items.length) { ctx.fillStyle = '#ffb347'; ctx.fillText(`находки ${r.items.length}`, ax + 9 * is + 90 * hs, fy + 6 * is); }

  // ---- interest curve: floor rooms as tension bars ----
  const F = FLOORS[r.floor - 1];
  const n = ROOM_PLAN.length, pw = 14 * hs, gap = 5 * hs;
  const totalW = n * pw + (n - 1) * gap, x0 = cw / 2 - totalW / 2;
  font(ctx, 12 * hs); ctx.textAlign = 'center'; ctx.fillStyle = F.theme.accent;
  ctx.fillText(`${F.sub.toUpperCase()} · ${F.name.toUpperCase()}`, cw / 2, top + 10 * hs);
  for (let i = 0; i < n; i++) {
    const t = ROOM_PLAN[i].tension, hgt = (4 + t * 1.6) * hs, x = x0 + i * (pw + gap), y = top + 34 * hs - hgt;
    const cur = i === r.roomIdx, done = i < r.roomIdx;
    ctx.fillStyle = done ? '#6b5f82' : cur ? F.theme.accent : '#2a2438';
    if (cur) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.real * 5);
    ctx.fillRect(x, y, pw, hgt);
    ctx.globalAlpha = 1;
    if (ROOM_PLAN[i].id === 'arena' && r.cursed) { ctx.fillStyle = '#e0404f'; ctx.fillRect(x, y - 3 * hs, pw, 2 * hs); }
  }
  font(ctx, 10 * hs); ctx.fillStyle = '#9b8fb3';
  ctx.fillText(ROOM_PLAN[r.roomIdx].name.toUpperCase(), cw / 2, top + 48 * hs);

  // ---- aspects (top right) ----
  let ay = top + (input.touch ? 44 : 0);
  const rx = cw - pad - (G.safe?.r || 0);
  ctx.textAlign = 'right';
  for (const [k, A] of Object.entries(ASPECTS)) {
    const lvl = r.aspects[k] || 0;
    if (!lvl) continue;
    icon(ctx, A.icon, rx - 7 * is, ay, is);
    font(ctx, 13 * hs); ctx.fillStyle = A.color;
    const sh2 = P.s.resoShift || 0, t1 = 3 - sh2, t2 = 5 - sh2;
    const tier = lvl >= t2 ? ROMAN2[1] : lvl >= t1 ? ROMAN2[0] : `${lvl}/${t1}`;
    ctx.fillText(`${A.name} ${tier}`, rx - 9 * is, ay + 6 * is);
    ay += 9 * is;
  }
  const pacts = Object.keys(r.boons).filter((id) => id.startsWith('p_')).length;
  if (pacts) { icon(ctx, 'pact', rx - 7 * is, ay, is); font(ctx, 13 * hs); ctx.fillStyle = '#ff3355'; ctx.fillText(`Пакты ${pacts}`, rx - 9 * is, ay + 6 * is); }

  // ---- skill cooldown (desktop) ----
  if (!input.touch) {
    const R = 20 * hs, cx = cw - pad - R - (G.safe?.r || 0), cy = ch - pad - R - (G.safe?.b || 0);
    ctx.fillStyle = 'rgba(8,6,13,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    const k = P.skillCd / (P.C.skill.cd * P.s.skillCd);
    ctx.strokeStyle = P.accent[0]; ctx.lineWidth = 3 * hs;
    ctx.beginPath(); ctx.arc(cx, cy, R - 2 * hs, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k)); ctx.stroke();
    font(ctx, 11 * hs); ctx.textAlign = 'center'; ctx.fillStyle = k > 0 ? '#6b5f82' : '#ece4d0';
    ctx.fillText(k > 0 ? Math.ceil(P.skillCd) : 'E', cx, cy + 4 * hs);
    font(ctx, 10 * hs); ctx.fillStyle = '#6b5f82'; ctx.textAlign = 'right';
    ctx.fillText(P.C.skill.name, cx - R - 8 * hs, cy + 4 * hs);
  } else {
    const btn = document.getElementById('btn-skill');
    if (btn) btn.style.setProperty('--cd', String(P.skillCd / (P.C.skill.cd * P.s.skillCd)));
    const fl = document.getElementById('btn-flask');
    if (fl) fl.dataset.n = P.flasks;
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
    const lines = input.touch ? ['стик — движение · ⚔ атака · ↯ перекат', 'бей в белую вспышку замаха — КОНТР · перекат в последний миг — ИДЕАЛЬНО']
      : ['WASD — движение · ЛКМ/J — атака · Space — перекат · E/ПКМ — умение · Q — нектар', 'бей в белую вспышку замаха — КОНТР · перекат в последний миг — ИДЕАЛЬНО'];
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
  const low = P.hp < maxHp * 0.3 && !P.dead ? 0.25 + 0.15 * Math.pow(Math.max(0, Math.sin(G.real * 5)), 4) : 0;
  const va = Math.max(G.vign * 0.55, low);
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
