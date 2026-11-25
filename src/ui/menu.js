// Main menu = the Ash Tree. One hero stands at its roots; the trunk and four themed branches
// (Клинок, Ветер, Горн, Корень) hold permanent upgrades. "Спуститься" starts a run.
import { G } from '../game/state.js';
import { TREE, TREE_BY_ID, BRANCHES, nodeCost } from '../data/tree.js';
import { WEAPONS, ROLL, rawDps } from '../data/weapons.js';
import { SPR, heroFrames } from '../art/bank.js';
import { toDataURL, pcircle } from '../engine/sprite.js';
import { mulberry32, clamp, rand, ease, damp } from '../engine/util.js';
import { writeSave } from '../game/save.js';
import { emit } from '../game/events.js';
import { sfx, initAudio } from '../engine/audio.js';
import { startRun, runStats } from '../game/run.js';
import { gearLook } from '../game/player.js';
import { showSettings } from './settings.js';
import { makeItem, addItem } from '../game/items.js';
import { BASES } from '../data/items.js';

const TW = 380, TH = 262;
const TRUNK = { x: 190, y0: 238, y1: 128 };
const BR = {
  forge: [[180, 168], [118, 172], [34, 142]],
  blade: [[184, 134], [150, 66], [70, 26]],
  wind: [[196, 134], [230, 66], [310, 26]],
  root: [[200, 168], [262, 172], [346, 142]],
};
const BR_ORDER = ['blade', 'wind', 'forge', 'root'];
const bez = (p, t) => {
  const [a, b, c] = p, u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
};
const bezN = (p, t) => { const a = bez(p, Math.max(0, t - 0.01)), b = bez(p, Math.min(1, t + 0.01)); const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };

export function nodePos(n) {
  const [t, side] = n.at;
  if (n.br === 'trunk') return [TRUNK.x + side * 20, TRUNK.y0 - (TRUNK.y0 - TRUNK.y1 + 10) * t];
  const [x, y] = bez(BR[n.br], t), [nx, ny] = bezN(BR[n.br], t);
  return [x + nx * side * 16, y + ny * side * 16];
}

let buf, g, selected = null, hover = null, embers = [];
const M = { cam: { x: TW / 2, y: TH / 2 - 6, s: 3 }, drag: null, t: 0, intro: 0, focus: 'blade' };
const sprDraw = (spr, x, y, a = 1) => { g.globalAlpha = a; g.drawImage(spr.c, Math.round(x), Math.round(y), spr.w, spr.h); g.globalAlpha = 1; };

export function initMenu(canvas) {
  buf = document.createElement('canvas'); g = buf.getContext('2d');
  const toWorld = (cx, cy) => { const v = G.view, s = M.cam.s / v.dpr; return { x: M.cam.x + (cx - v.cw / 2) / s, y: M.cam.y + (cy - v.ch / 2) / s }; };
  const pickNode = (cx, cy) => {
    const p = toWorld(cx, cy);
    let best = null, bd = 9;
    for (const n of TREE) { const [x, y] = nodePos(n); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (G.mode !== 'menu') return;
    initAudio();
    M.drag = { x: e.clientX, y: e.clientY, cx: M.cam.x, cy: M.cam.y, moved: 0 };
    M.target = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (G.mode !== 'menu') return;
    if (M.drag) {
      const s = M.cam.s / G.view.dpr;
      M.drag.moved = Math.max(M.drag.moved, Math.hypot(e.clientX - M.drag.x, e.clientY - M.drag.y));
      if (M.drag.moved > 6) { M.cam.x = M.drag.cx - (e.clientX - M.drag.x) / s; M.cam.y = M.drag.cy - (e.clientY - M.drag.y) / s; clampCam(); }
    }
    hover = pickNode(e.clientX, e.clientY);
    canvas.style.cursor = hover ? 'pointer' : 'default';
  });
  addEventListener('pointerup', (e) => {
    if (G.mode !== 'menu' || !M.drag) return;
    const moved = M.drag.moved; M.drag = null;
    if (moved > 6) return;
    const n = pickNode(e.clientX, e.clientY);
    if (n) { selected = n; if (n.br !== 'trunk') focusBranch(n.br); sfx.ui(); renderPanel(); }
  });
  canvas.addEventListener('wheel', (e) => { if (G.mode !== 'menu') return; e.preventDefault(); M.cam.s = clamp(M.cam.s + (e.deltaY < 0 ? 1 : -1), M.minS, M.minS + 4); sizeBuf(); clampCam(); }, { passive: false });
  document.getElementById('btn-descend').addEventListener('click', () => { initAudio(); sfx.door(); hideMenu(); startRun(); });
  document.getElementById('btn-gear').addEventListener('click', () => { initAudio(); sfx.ui(); G.ui.showGear({ forge: true }); });
  document.getElementById('btn-settings').addEventListener('click', () => { initAudio(); sfx.ui(); showSettings(() => { G.paused = false; document.body.classList.remove('overlay'); renderPanel(); }); });
  for (let i = 0; i < 40; i++) embers.push(newEmber(true));
}
function newEmber(init) { return { x: rand(0, TW), y: init ? rand(0, TH) : TH + 4, vy: -rand(4, 12), vx: rand(-3, 3), c: Math.random() < 0.7 ? '#b8aa90' : '#ff8f3a', life: rand(4, 12) }; }

// layout from the real DOM: the free area is the screen minus the panel (right or bottom) and the dock
function layout() {
  const v = G.view;
  const pr = document.getElementById('panel').getBoundingClientRect();
  const dr = document.querySelector('.dock').getBoundingClientRect();
  const right = pr.width > 0 && pr.left > v.cw * 0.4;
  const padR = right ? v.cw - pr.left + 8 : 0;
  const bottomEdge = right ? dr.top : Math.min(dr.top, pr.height ? pr.top : dr.top);
  const top = 56;
  return { padR, top, bottom: bottomEdge, aw: v.cw - padR, ah: Math.max(80, bottomEdge - top) };
}
function clampCam() {
  const v = G.view, s = M.cam.s / v.dpr, L = layout();
  const offX = (L.aw / 2 - v.cw / 2) / s, offY = ((L.top + L.bottom) / 2 - v.ch / 2) / s;
  const hw = L.aw / s / 2, hh = L.ah / s / 2;
  const fx = TW / 2 - offX, fy = TH / 2 - offY;
  M.cam.x = hw * 2 >= TW ? fx : clamp(M.cam.x, hw - offX - 8, TW - hw - offX + 8);
  M.cam.y = hh * 2 >= TH + 10 ? fy : clamp(M.cam.y, hh - offY - 12, TH - hh - offY + 14);
}
function sizeBuf() { const v = G.view; buf.width = Math.ceil((v.cw * v.dpr) / M.cam.s) + 2; buf.height = Math.ceil((v.ch * v.dpr) / M.cam.s) + 2; }
export function resizeMenu() {
  const v = G.view, L = layout();
  const fit = Math.floor(Math.min((L.aw * v.dpr) / (TW + 6), (L.ah * v.dpr) / (TH + 10)));
  M.minS = Math.max(1, fit);
  M.cam.s = fit >= 2 ? fit : Math.max(M.minS, Math.min(2 * v.dpr, 3));
  sizeBuf();
  M.cam.x = TW / 2; M.cam.y = TH / 2;
  clampCam();
  focusBranch(M.focus);
}
// the camera glides toward a branch when the whole tree doesn't fit
function focusBranch(br) {
  M.focus = br;
  const c = BR[br][1], v = G.view, L = layout(), s = M.cam.s / v.dpr;
  const offX = (L.aw / 2 - v.cw / 2) / s, offY = ((L.top + L.bottom) / 2 - v.ch / 2) / s;
  M.target = { x: (c[0] * 2 + TRUNK.x) / 3 - offX, y: (c[1] + 150) / 2 - offY };
}

export function showMenu() {
  G.mode = 'menu'; G.run = null; G.player = null;
  document.getElementById('menu').hidden = false;
  document.body.classList.add('in-menu'); document.body.classList.remove('in-game');
  M.intro = 0;
  renderPanel();
  resizeMenu();
}
export function hideMenu() { document.getElementById('menu').hidden = true; document.body.classList.remove('in-menu'); document.body.classList.add('in-game'); }

const owned = (n) => G.save.nodes[n.id] || 0;
const available = (n) => !n.req || owned(TREE_BY_ID[n.req]) > 0;

export function renderPanel() {
  const save = G.save;
  document.getElementById('ash').textContent = Math.floor(save.ash);
  const el = document.getElementById('panel');
  const st = save.stats;
  const s = runStats(), W = WEAPONS[s.wk];
  const weapon = save.inv.items.find((i) => i.uid === save.inv.equip.weapon);
  document.getElementById('btn-gear').querySelector('img').src = toDataURL(heroFrames(gearLook(save.inv)).idle[0], 3);
  if (!selected) {
    el.innerHTML = `
      <p class="eyebrow">Геракл · пепел с костра Эты</p>
      <h2>${weapon ? weapon.name + (weapon.up ? ' +' + weapon.up : '') : 'Без оружия'}</h2>
      <p class="tag">${W.name} · ${W.tagline}</p>
      <dl class="stats">
        <div><dt>Сердца</dt><dd>${s.maxHp}</dd></div>
        <div><dt>Выносл.</dt><dd>${s.maxSta}</dd></div>
        <div><dt>Урон/с</dt><dd>${(rawDps(W) * s.dmgMul).toFixed(0)}</dd></div>
        <div><dt>Щиты</dt><dd>${s.ward}</dd></div>
      </dl>
      <p class="skill"><b>Усиленная атака: ${W.power.name}.</b> ${W.power.desc}</p>
      <p class="mu">Нагрузка ${Math.round(s.load)}/${Math.round(s.loadCap)} · перекат: <b>${ROLL[s.roll].name.toLowerCase()}</b><br>
      <span class="good">Силён против:</span> ${W.strong}<br><span class="bad">Слаб против:</span> ${W.weak}</p>
      ${save.respecRefund ? `<p class="echo">Древо выросло заново: вложенный пепел (${save.respecRefund}) возвращён.</p>` : ''}
      <details class="myth"><summary>Миф</summary><p>Смертная часть Геракла сгорела на костре на горе Эта. Бессмертная вознеслась на Олимп. Но Гера не простила: она отворила Тартар, и кровь Тифона потекла в корни яблони Гесперид, что питает богов бессмертием. Пепел героя пророс в эти корни. Каждый раз, падая, он восстаёт из пепла у подножия Древа и снова спускается: через Эреб, Стикс, Флегетон и Коцит — в Тартар, к сердцу Тифона.</p></details>
      <p class="hint">Нажми узел на дереве, чтобы вложить пепел. Оружие, броня и кузня — в «Снаряжении».</p>
      <p class="record">Забегов ${st.runs} · побед ${st.wins} · глубина ${st.bestFloor ? 'I II III IV V'.split(' ')[st.bestFloor - 1] : '—'}${save.echo ? ` · <span class="echo">твоя тень на глубине ${save.echo.floor}: ${save.echo.ash} пепла</span>` : ''}</p>`;
    return;
  }
  const n = selected, r = owned(n), maxed = r >= n.max, can = available(n), cost = nodeCost(n, r);
  const B = BRANCHES[n.br];
  el.innerHTML = `
    <p class="eyebrow" style="color:${B.color}">${n.br === 'trunk' ? 'Ствол' : 'Ветвь · ' + B.name} — ${B.desc.toLowerCase()}</p>
    <h2><img class="ico" alt="" src="${toDataURL(SPR.icon[n.icon], 4)}">${n.name}</h2>
    <p class="rank">${'◆'.repeat(r)}${'◇'.repeat(n.max - r)}</p>
    <p class="desc">${r ? `Сейчас: ${n.desc(r)}` : 'Не изучено'}</p>
    ${maxed ? '' : `<p class="desc next">Далее: ${n.desc(r + 1)}</p>`}
    ${!can ? `<p class="bad">Сначала изучи «${TREE_BY_ID[n.req].name}»</p>` : ''}
    <div class="row">
      <button id="buy" ${maxed || !can || save.ash < cost ? 'disabled' : ''}>${maxed ? 'Изучено' : `Вложить ${cost} пепла`}</button>
      <button id="back" class="ghost">Назад</button>
    </div>`;
  el.querySelector('#back').onclick = () => { selected = null; renderPanel(); };
  const buy = el.querySelector('#buy');
  if (buy) buy.onclick = () => {
    if (save.ash < cost || maxed || !can) return;
    save.ash -= cost; save.nodes[n.id] = r + 1; save.respecRefund = 0; writeSave(save);
    emit('nodeBuy', { id: n.id, rank: r + 1 });
    if (n.weapon && r === 0) {
      // unlocking a weapon type hands over the first one (heroic) right away
      const baseId = Object.keys(BASES).find((k) => BASES[k].slot === 'weapon' && BASES[k].kind === n.weapon);
      if (baseId) { const it = makeItem(baseId, Math.max(1, save.stats.bestFloor || 1), 1); addItem(save.inv, it, runStats().bag); writeSave(save); }
    }
    sfx.pick(); M.pulse = { n, t: 0 };
    renderPanel();
  };
}

// ---------------- drawing ----------------
export function updateMenu(rdt) {
  if (M.target && !M.drag) { M.cam.x = damp(M.cam.x, M.target.x, 4, rdt); M.cam.y = damp(M.cam.y, M.target.y, 4, rdt); }
  if (!M.drag) clampCam();
  M.t += rdt; M.intro = Math.min(1, M.intro + rdt * 0.7);
  for (const e of embers) { e.x += e.vx * rdt + Math.sin(M.t + e.y * 0.05) * 0.1; e.y += e.vy * rdt; e.life -= rdt; }
  embers = embers.map((e) => (e.y < -4 || e.life < 0 ? newEmber(false) : e));
  if (M.pulse) { M.pulse.t += rdt; if (M.pulse.t > 0.8) M.pulse = null; }
}

export function renderMenu(ctx) {
  const s = M.cam.s;
  const W = buf.width, H = buf.height;
  const ox = Math.floor(W / 2 - M.cam.x), oy = Math.floor(H / 2 - M.cam.y);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#07050c'; g.fillRect(0, 0, W, H);
  g.setTransform(1, 0, 0, 1, ox, oy);
  const rnd = mulberry32(7);
  for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? '#120e1a' : '#0d0a14'; g.fillRect(Math.floor(rnd() * TW * 1.4 - TW * 0.2), Math.floor(rnd() * TH), 1 + Math.floor(rnd() * 2), 1); }
  const grd = g.createRadialGradient(TRUNK.x, 90, 4, TRUNK.x, 90, 170);
  grd.addColorStop(0, 'rgba(184,170,144,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(-100, -60, TW + 200, TH + 100);
  // roots into the pit
  g.fillStyle = '#2e251f';
  const rr = mulberry32(3);
  for (let k = 0; k < 7; k++) {
    let x = TRUNK.x + (k - 3) * 4, y = TRUNK.y0 - 2, dx = (k - 3) * 0.5;
    for (let i = 0; i < 40; i++) { g.fillRect(Math.round(x), Math.round(y), i < 10 ? 3 : 2, 2); x += dx + (rr() - 0.5) * 1.2; y += 0.8; dx *= 1.02; }
  }
  g.fillStyle = '#050308'; pcircle(g, TRUNK.x, TH + 6, 56, 14);
  const pit = 0.5 + 0.5 * Math.sin(M.t * 2);
  g.globalAlpha = 0.25 + 0.15 * pit; g.fillStyle = '#ff8f3a'; pcircle(g, TRUNK.x, TH + 4, 30, 6); g.globalAlpha = 1;
  // trunk
  for (let y = TRUNK.y0; y > TRUNK.y1 - 14; y--) {
    const k = (TRUNK.y0 - y) / (TRUNK.y0 - TRUNK.y1 + 14);
    const w = Math.round(13 - k * 5 + Math.sin(y * 0.3) * 0.6);
    g.fillStyle = '#2e251f'; g.fillRect(TRUNK.x - w - 1, y, w * 2 + 2, 1);
    g.fillStyle = '#56473a'; g.fillRect(TRUNK.x - w, y, w * 2, 1);
    g.fillStyle = '#8f7a63'; g.fillRect(TRUNK.x - w + 2, y, Math.max(1, Math.floor(w * 0.5)), 1);
    if ((y * 7) % 11 < 2) { g.fillStyle = '#2e251f'; g.fillRect(TRUNK.x - w + 3 + ((y * 13) % (w * 2 - 4)), y, 1, 1); }
  }
  // branches
  const progress = {};
  for (const br of BR_ORDER) {
    const nodes = TREE.filter((n) => n.br === br);
    progress[br] = nodes.reduce((a, n) => a + owned(n), 0) / nodes.reduce((a, n) => a + n.max, 0);
    const p = BR[br], on = M.focus === br;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, [x, y] = bez(p, t), r = 5.5 - t * 4;
      g.fillStyle = '#2e251f'; pcircle(g, x, y + 1, r + 0.5);
      g.fillStyle = on ? '#6a5645' : '#54463a'; pcircle(g, x, y, r);
      g.fillStyle = on ? '#9c8670' : '#7d6b58'; g.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.6), Math.max(1, Math.round(r * 0.6)), 1);
    }
  }
  for (const n of TREE) {
    if (!n.at[1]) continue;
    const [x, y] = nodePos(n);
    const base = n.br === 'trunk' ? [TRUNK.x, y] : bez(BR[n.br], n.at[0]);
    g.fillStyle = '#4a3d33';
    for (let i = 0; i <= 10; i++) { const t = i / 10; g.fillRect(Math.round(base[0] + (x - base[0]) * t), Math.round(base[1] + (y - base[1]) * t), 2, 2); }
  }
  // leaves: each branch blooms in its colour as you invest in it
  const lr = mulberry32(11);
  for (const br of BR_ORDER) {
    const col = BRANCHES[br].color, grow = 0.25 + progress[br] * 0.75;
    for (let i = 0; i < 220; i++) {
      const t = 0.35 + lr() * 0.7, [bx, by] = bez(BR[br], Math.min(1, t));
      const x = bx + (lr() - 0.5) * 34 * t, y = by + (lr() - 0.6) * 26 * t;
      const lit = lr() < grow;
      const sway = Math.sin(M.t * 1.5 + i) * 0.6;
      g.fillStyle = lit ? col : lr() < 0.5 ? '#3a3448' : '#2a2438';
      g.globalAlpha = lit ? 0.85 : 0.65;
      g.fillRect(Math.round(x + sway), Math.round(y), lr() < 0.3 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
  }
  g.globalAlpha = 1;
  // the hero at the roots, in its current gear
  const hf = heroFrames(gearLook(G.save.inv));
  const hs = hf.idle[Math.floor(M.t / 0.5) % 2];
  sprDraw(hs, TRUNK.x + 22 - hs.ox, TRUNK.y0 + 8 - hs.oy);
  // nodes
  for (const n of TREE) {
    const [x, y] = nodePos(n);
    const r = owned(n), can = available(n), col = BRANCHES[n.br].color;
    const X = Math.round(x) - 5, Y = Math.round(y) - 5;
    const cost = nodeCost(n, r), afford = G.save.ash >= cost && r < n.max && can;
    g.fillStyle = '#08060d'; g.fillRect(X - 1, Y - 1, 12, 12);
    g.fillStyle = r >= n.max ? col : r > 0 ? '#2a2438' : '#14111c'; g.fillRect(X, Y, 10, 10);
    if (r > 0 && r < n.max) { g.fillStyle = col; g.fillRect(X, Y + 9, Math.round((10 * r) / n.max), 1); }
    g.globalAlpha = can ? 1 : 0.25;
    g.drawImage(SPR.icon[n.icon].c, X + 1, Y + 1, 8, 8);
    g.globalAlpha = 1;
    if (afford) { g.globalAlpha = 0.5 + 0.5 * Math.sin(M.t * 4 + x); g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(X - 1.5, Y - 1.5, 13, 13); g.globalAlpha = 1; }
    if (selected === n || hover === n) { g.strokeStyle = '#ece4d0'; g.lineWidth = 1; g.strokeRect(X - 2.5, Y - 2.5, 15, 15); }
    if (M.pulse && M.pulse.n === n) { const k = M.pulse.t / 0.8; g.globalAlpha = 1 - k; g.strokeStyle = col; g.beginPath(); g.arc(x, y, 6 + k * 18, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
  }
  for (const e of embers) { g.fillStyle = e.c; g.globalAlpha = Math.min(1, e.life / 2) * 0.7; g.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); }
  g.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#07050c'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.globalAlpha = ease.outCubic(M.intro);
  ctx.drawImage(buf, 0, 0, W * s, H * s);
  ctx.globalAlpha = 1;
  // branch names in crisp screen-resolution type (never inside the pixel buffer)
  const dpr = G.view.dpr;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = `400 ${Math.round(30 * dpr)}px "Forum", Georgia, serif`;
  // the game title sits over the top-left of the canvas: a branch name that would land on it drops below it
  const head = document.querySelector('#menu .brand')?.getBoundingClientRect();
  for (const br of BR_ORDER) {
    const [tx, ty] = BR[br][2], X = (tx + ox) * s;
    let Y = (ty + (ty < 60 ? -14 : 20) + oy) * s;
    const halfW = ctx.measureText(BRANCHES[br].name).width / 2 + 8 * dpr;
    if (head && X - halfW < head.right * dpr && X + halfW > head.left * dpr && Y - 20 * dpr < head.bottom * dpr) Y = head.bottom * dpr + 26 * dpr;
    ctx.lineWidth = 6 * dpr; ctx.strokeStyle = 'rgba(7,5,12,0.9)'; ctx.strokeText(BRANCHES[br].name, X, Y);
    ctx.fillStyle = BRANCHES[br].color; ctx.fillText(BRANCHES[br].name, X, Y);
  }
}

// inspection hook for tests: screen position of a node
export function nodeScreen(id) {
  const n = TREE_BY_ID[id], [x, y] = nodePos(n), v = G.view, s = M.cam.s / v.dpr;
  return { x: v.cw / 2 + (x - M.cam.x) * s, y: v.ch / 2 + (y - M.cam.y) * s };
}
window.__menu = { nodeScreen, M };
