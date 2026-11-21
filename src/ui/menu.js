// Main menu = the Ash Tree. Choosing a class = choosing a branch; its leaves take your colour.
// The roots lead down into the dungeon: "Спуститься" starts a run.
import { G } from '../game/state.js';
import { TREE, TREE_BY_ID, nodeCost } from '../data/tree.js';
import { CLASSES, CLASS_ORDER, rawDps } from '../data/classes.js';
import { SPR } from '../art/bank.js';
import { toDataURL, pcircle } from '../engine/sprite.js';
import { mulberry32, clamp, rand, ease, damp } from '../engine/util.js';
import { writeSave } from '../game/save.js';
import { emit } from '../game/events.js';
import { sfx, initAudio } from '../engine/audio.js';
import { startRun } from '../game/run.js';
import { BOSSES, BOSS_ORDER } from '../data/bosses.js';

const TW = 380, TH = 262;
const TRUNK = { x: 190, y0: 238, y1: 128 };
const BR = {
  rogue: [[180, 168], [118, 172], [34, 142]],
  warrior: [[184, 134], [150, 66], [70, 26]],
  mage: [[196, 134], [230, 66], [310, 26]],
  archer: [[200, 168], [262, 172], [346, 142]],
};
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

let buf, g, canvasEl, selected = null, hover = null, embers = [];
const M = { cam: { x: TW / 2, y: TH / 2 - 6, s: 3 }, drag: null, t: 0, intro: 0 };

export function initMenu(canvas) {
  canvasEl = canvas;
  buf = document.createElement('canvas'); g = buf.getContext('2d');
  const toWorld = (cx, cy) => { const v = G.view, s = M.cam.s / v.dpr; return { x: M.cam.x + (cx - v.cw / 2) / s, y: M.cam.y + (cy - v.ch / 2) / s }; };
  const pickNode = (cx, cy) => {
    const p = toWorld(cx, cy);
    let best = null, bd = 9;
    for (const n of TREE) { const [x, y] = nodePos(n); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = n; } }
    if (!best) for (const cls of CLASS_ORDER) { const [x, y] = BR[cls][2]; if (Math.hypot(p.x - x, p.y - y) < 18) return { cls }; }
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
    if (n?.cls) { chooseClass(n.cls); return; }
    if (n) { selected = n; if (n.br !== 'trunk' && n.br !== G.save.cls) chooseClass(n.br, true); sfx.ui(); renderPanel(); }
  });
  canvas.addEventListener('wheel', (e) => { if (G.mode !== 'menu') return; e.preventDefault(); M.cam.s = clamp(M.cam.s + (e.deltaY < 0 ? 1 : -1), M.minS, M.minS + 4); const v = G.view; buf.width = Math.ceil((v.cw * v.dpr) / M.cam.s) + 2; buf.height = Math.ceil((v.ch * v.dpr) / M.cam.s) + 2; clampCam(); }, { passive: false });
  document.getElementById('btn-descend').addEventListener('click', () => { initAudio(); sfx.door(); hideMenu(); startRun(G.save.cls); });
  for (const cls of CLASS_ORDER) {
    const b = document.createElement('button');
    b.className = 'cls'; b.dataset.cls = cls; b.style.setProperty('--acc', CLASSES[cls].accent[0]);
    b.innerHTML = `<img alt="" src="${toDataURL(SPR.hero[cls].idle[0], 3)}"><span>${CLASSES[cls].name}</span>`;
    b.addEventListener('click', () => { initAudio(); chooseClass(cls); });
    document.getElementById('classes').appendChild(b);
  }
  for (let i = 0; i < 40; i++) embers.push(newEmber(true));
}
function newEmber(init) { return { x: rand(0, TW), y: init ? rand(0, TH) : TH + 4, vy: -rand(4, 12), vx: rand(-3, 3), c: Math.random() < 0.7 ? '#b8aa90' : '#ff8f3a', life: rand(4, 12) }; }

function chooseClass(cls, keepSel) {
  G.save.cls = cls; writeSave(G.save); sfx.ui();
  focusBranch(cls);
  if (!keepSel) selected = null;
  document.documentElement.style.setProperty('--acc', CLASSES[cls].accent[0]);
  renderPanel();
}

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
  // world offset between the screen centre and the centre of the free area
  const offX = (L.aw / 2 - v.cw / 2) / s, offY = ((L.top + L.bottom) / 2 - v.ch / 2) / s;
  const hw = L.aw / s / 2, hh = L.ah / s / 2;
  const fx = TW / 2 - offX, fy = TH / 2 - offY;
  M.cam.x = hw * 2 >= TW ? fx : clamp(M.cam.x, hw - offX - 8, TW - hw - offX + 8);
  M.cam.y = hh * 2 >= TH + 10 ? fy : clamp(M.cam.y, hh - offY - 12, TH - hh - offY + 14);
}
export function resizeMenu() {
  const v = G.view, L = layout();
  const fit = Math.floor(Math.min((L.aw * v.dpr) / (TW + 6), (L.ah * v.dpr) / (TH + 10)));
  M.layout = L;
  M.minS = Math.max(1, fit);
  M.cam.s = Math.max(M.minS, Math.min(2 * v.dpr, 3));
  if (fit >= 2) M.cam.s = fit;
  buf.width = Math.ceil((v.cw * v.dpr) / M.cam.s) + 2; buf.height = Math.ceil((v.ch * v.dpr) / M.cam.s) + 2;
  M.cam.x = TW / 2; M.cam.y = TH / 2;
  clampCam();
  focusBranch(G.save?.cls || 'rogue');
}
// the camera glides toward the chosen branch when the whole tree doesn't fit
function focusBranch(cls) {
  const c = BR[cls][1], v = G.view, L = layout(), s = M.cam.s / v.dpr;
  const offX = (L.aw / 2 - v.cw / 2) / s, offY = ((L.top + L.bottom) / 2 - v.ch / 2) / s;
  M.target = { x: (c[0] * 2 + TRUNK.x) / 3 - offX, y: (c[1] + 150) / 2 - offY };
}

export function showMenu() {
  G.mode = 'menu'; G.run = null; G.player = null;
  document.getElementById('menu').hidden = false;
  document.body.classList.add('in-menu'); document.body.classList.remove('in-game');
  M.intro = 0;
  document.documentElement.style.setProperty('--acc', CLASSES[G.save.cls].accent[0]);
  renderPanel();
  resizeMenu();
}
export function hideMenu() { document.getElementById('menu').hidden = true; document.body.classList.remove('in-menu'); document.body.classList.add('in-game'); }

const owned = (n) => G.save.nodes[n.id] || 0;
const available = (n) => !n.req || owned(TREE_BY_ID[n.req]) > 0;

function renderPanel() {
  const save = G.save, cls = save.cls, C = CLASSES[cls];
  document.getElementById('ash').textContent = Math.floor(save.ash);
  for (const b of document.querySelectorAll('#classes .cls')) b.classList.toggle('on', b.dataset.cls === cls);
  const el = document.getElementById('panel');
  const st = save.stats;
  const branchNodes = TREE.filter((n) => n.br === cls), bought = branchNodes.reduce((s, n) => s + owned(n), 0), total = branchNodes.reduce((s, n) => s + n.max, 0);
  if (!selected) {
    el.innerHTML = `
      <p class="eyebrow">Ветвь · ${bought}/${total}</p>
      <h2>${C.name}</h2>
      <p class="tag">${C.tagline}</p>
      <dl class="stats">
        <div><dt>HP</dt><dd>${C.hp}</dd></div>
        <div><dt>Урон/с</dt><dd>${rawDps(C).toFixed(0)}</dd></div>
        <div><dt>Тип</dt><dd>${{ slash: 'рубящий', pierce: 'пронзающий', arcane: 'чары' }[C.dmgType]}</dd></div>
        <div><dt>Перекат</dt><dd>${C.dodge.cost} вын.</dd></div>
      </dl>
      <p class="skill"><b>${C.skill.name}.</b> ${C.skill.desc}</p>
      <p class="mu"><span class="good">Силён против:</span> ${C.strong}<br><span class="bad">Слаб против:</span> ${C.weak}</p>
      <p class="hint">Нажми узел на дереве, чтобы вложить пепел.</p>
      <p class="record">Забегов ${st.runs} · побед ${st.wins} · глубина ${st.bestFloor ? 'I II III IV V'.split(' ')[st.bestFloor - 1] : '—'}${save.echo ? ` · <span class="echo">отголосок на глубине ${save.echo.floor}: ${save.echo.ash} пепла</span>` : ''}</p>`;
    return;
  }
  const n = selected, r = owned(n), maxed = r >= n.max, can = available(n), cost = nodeCost(n, r);
  const brName = n.br === 'trunk' ? 'Ствол · для всех' : `Ветвь · ${CLASSES[n.br].name}`;
  el.innerHTML = `
    <p class="eyebrow">${brName}</p>
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
    save.ash -= cost; save.nodes[n.id] = r + 1; writeSave(save);
    emit('nodeBuy', { id: n.id, rank: r + 1 });
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
  const v = G.view, s = M.cam.s;
  const W = buf.width, H = buf.height;
  const ox = Math.floor(W / 2 - M.cam.x), oy = Math.floor(H / 2 - M.cam.y);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // background: deep gradient of the root-cave
  g.fillStyle = '#07050c'; g.fillRect(0, 0, W, H);
  g.setTransform(1, 0, 0, 1, ox, oy);
  const rnd = mulberry32(7);
  for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? '#120e1a' : '#0d0a14'; g.fillRect(Math.floor(rnd() * TW * 1.4 - TW * 0.2), Math.floor(rnd() * TH), 1 + Math.floor(rnd() * 2), 1); }
  const acc = CLASSES[G.save.cls].accent[0];
  // glow behind the crown
  const grd = g.createRadialGradient(TRUNK.x, 90, 4, TRUNK.x, 90, 170);
  grd.addColorStop(0, 'rgba(184,170,144,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
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
  g.globalAlpha = 0.25 + 0.15 * pit; g.fillStyle = acc; pcircle(g, TRUNK.x, TH + 4, 30, 6); g.globalAlpha = 1;
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
  for (const cls of CLASS_ORDER) {
    const p = BR[cls], on = cls === G.save.cls;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, [x, y] = bez(p, t), r = 5.5 - t * 4;
      g.fillStyle = '#2e251f'; pcircle(g, x, y + 1, r + 0.5);
      g.fillStyle = on ? '#6a5645' : '#54463a'; pcircle(g, x, y, r);
      g.fillStyle = on ? '#9c8670' : '#7d6b58'; g.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.6), Math.max(1, Math.round(r * 0.6)), 1);
    }
  }
  // twigs from branch to off-axis nodes
  for (const n of TREE) {
    if (!n.at[1]) continue;
    const [x, y] = nodePos(n);
    const base = n.br === 'trunk' ? [TRUNK.x, y] : bez(BR[n.br], n.at[0]);
    g.fillStyle = '#4a3d33';
    for (let i = 0; i <= 10; i++) { const t = i / 10; g.fillRect(Math.round(base[0] + (x - base[0]) * t), Math.round(base[1] + (y - base[1]) * t), 2, 2); }
  }
  // leaves: ash-grey on every branch, class colour on the chosen one
  const lr = mulberry32(11);
  for (const cls of CLASS_ORDER) {
    const on = cls === G.save.cls, ca = CLASSES[cls].accent;
    for (let i = 0; i < 220; i++) {
      const t = 0.35 + lr() * 0.7, [bx, by] = bez(BR[cls], Math.min(1, t));
      const x = bx + (lr() - 0.5) * 34 * t, y = by + (lr() - 0.6) * 26 * t;
      const sway = Math.sin(M.t * 1.5 + i) * 0.6;
      g.fillStyle = on ? (lr() < 0.5 ? ca[0] : ca[1]) : lr() < 0.5 ? '#3a3448' : '#2a2438';
      g.globalAlpha = on ? 0.85 : 0.7;
      g.fillRect(Math.round(x + sway), Math.round(y), lr() < 0.3 ? 2 : 1, 1);
    }
  }
  g.globalAlpha = 1;
  // branch tip = class seed (click to choose)
  for (const cls of CLASS_ORDER) {
    const [x, y] = BR[cls][2], on = cls === G.save.cls;
    const spr = SPR.hero[cls].idle[Math.floor(M.t / 0.5) % 2];
    g.globalAlpha = on ? 1 : 0.55;
    g.drawImage(spr.c, Math.round(x - spr.ox), Math.round(y - spr.oy + 6));
    g.globalAlpha = 1;
    if (on) { g.fillStyle = CLASSES[cls].accent[0]; g.fillRect(Math.round(x) - 4, Math.round(y) + 9, 9, 1); }
  }
  // nodes
  for (const n of TREE) {
    const [x, y] = nodePos(n);
    const r = owned(n), can = available(n), mine = n.br === 'trunk' || n.br === G.save.cls;
    const X = Math.round(x) - 5, Y = Math.round(y) - 5;
    const isSel = selected === n, isHov = hover === n;
    const cost = nodeCost(n, r), afford = G.save.ash >= cost && r < n.max && can;
    g.fillStyle = '#08060d'; g.fillRect(X - 1, Y - 1, 12, 12);
    g.fillStyle = r >= n.max ? acc : r > 0 ? '#2a2438' : '#14111c'; g.fillRect(X, Y, 10, 10);
    if (r > 0 && r < n.max) { g.fillStyle = acc; g.fillRect(X, Y + 9, Math.round((10 * r) / n.max), 1); }
    g.globalAlpha = can ? (mine ? 1 : 0.5) : 0.25;
    g.drawImage(SPR.icon[n.icon].c, X + 1, Y + 1, 8, 8);
    g.globalAlpha = 1;
    if (afford && mine) { g.globalAlpha = 0.5 + 0.5 * Math.sin(M.t * 4 + x); g.strokeStyle = acc; g.lineWidth = 1; g.strokeRect(X - 1.5, Y - 1.5, 13, 13); g.globalAlpha = 1; }
    if (isSel || isHov) { g.strokeStyle = '#ece4d0'; g.lineWidth = 1; g.strokeRect(X - 2.5, Y - 2.5, 15, 15); }
    if (M.pulse && M.pulse.n === n) { const k = M.pulse.t / 0.8; g.globalAlpha = 1 - k; g.strokeStyle = acc; g.beginPath(); g.arc(x, y, 6 + k * 18, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; }
  }
  // embers
  for (const e of embers) { g.fillStyle = e.c; g.globalAlpha = Math.min(1, e.life / 2) * 0.7; g.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); }
  g.globalAlpha = 1;
  // blit
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = ease.outCubic(M.intro);
  ctx.drawImage(buf, 0, 0, W * s, H * s);
  ctx.globalAlpha = 1;
}
export { BOSSES, BOSS_ORDER };
// inspection hook for tests: screen position of a node
export function nodeScreen(id) {
  const n = TREE_BY_ID[id], [x, y] = nodePos(n), v = G.view, s = M.cam.s / v.dpr;
  return { x: v.cw / 2 + (x - M.cam.x) * s, y: v.ch / 2 + (y - M.cam.y) * s };
}
window.__menu = { nodeScreen, M };
