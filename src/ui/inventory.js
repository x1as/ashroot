// Сокровищница — rebuilt after proven references:
//  • Diablo IV: hero in the centre with the 8 slots around it (armour left, weapon + jewellery right),
//    a floating item card on hover with the WORN item shown beside it for comparison, right-click to equip.
//  • Elden Ring smithing: the forge is its own screen — item list on the left, "before → after" for the next
//    upgrade level on the right, every cost shown as need / have.
// Skills: build-game-inventory (atomic equip/swap, locked items, keyboard + touch alternatives),
// game-ui-ux (>=18px text, rarity never by colour alone), pixel-art-sprites (integer-scaled icons).
import { G } from '../game/state.js';
import { SLOTS, SLOT_BY_ID, BASES, RARITY, WEIGHT, SLOT_MUL, AFFIXES, RELICS, ROOTS, ELEMENTS, ELEMENT_WEAPON, RESOURCES, RES_ORDER, FLAVOR, itemPower, itemScore, infuseCost, salvageYield } from '../data/items.js';
import { ASPECTS } from '../data/boons.js';
import { WEAPONS, ROLL, rawDps } from '../data/weapons.js';
import { SPR, heroFrames, weaponSprite } from '../art/bank.js';
import { itemIconURL, slotIconURL, iconSprite, ICON_OF } from '../art/items.js';
import { toDataURL } from '../engine/sprite.js';
import { sfx } from '../engine/audio.js';
import { writeSave } from '../game/save.js';
import { computeStats } from '../game/stats.js';
import { gearLook } from '../game/player.js';
import { POWER_INFO } from '../game/power.js';
import { equipItem, unequip, isEquipped, upgrade, infuse, salvage, scaledUpgradeCost, canPay, costText, rarityChances } from '../game/items.js';

const $ = (id) => document.getElementById(id);
const resURL = {}; const resIcon = (k) => (resURL[k] ||= toDataURL(SPR.icon[RESOURCES[k].icon], 4));
const aspURL = {}; const aspIcon = (a) => (aspURL[a] ||= toDataURL(SPR.icon[ASPECTS[a].icon], 4));
const TABS = [['gear', 'Снаряжение'], ['forge', 'Кузня'], ['res', 'Ресурсы'], ['codex', 'Летопись']];
const LEFT = ['helm', 'chest', 'gloves', 'boots'], RIGHT = ['weapon', 'amulet', 'ring', 'relic'];
const FILTERS = [['all', 'Всё'], ['weapon', 'Оружие'], ['armor', 'Броня'], ['jewel', 'Украшения']];
const SORTS = [['score', 'По мощи'], ['rarity', 'По редкости'], ['new', 'Новые'], ['slot', 'По ячейкам']];
const pips = (r) => `<span class="pips" aria-label="${RARITY[r].name}">${'◆'.repeat(r + 1)}${'◇'.repeat(3 - r)}</span>`;
let st = { tab: 'gear', sel: null, filter: 'all', sort: 'score', forge: false, onClose: null, confirm: false, forgeSel: null };

const statsWith = (equip, items) => computeStats(G.save.nodes, equip, items || G.save.inv.items, G.run ? G.run.boons : {});
const dps = (s) => rawDps(WEAPONS[s.wk]) * s.dmgMul;
const kindName = (it) => {
  const b = BASES[it.base];
  if (b.slot === 'weapon') return WEAPONS[b.kind].name;
  if (WEIGHT[b.kind]) return `${WEIGHT[b.kind].name} броня`;
  return SLOT_BY_ID[b.slot].name;
};
const infColor = (it) => (it.infuse.startsWith('root:') ? '#ffb347' : ASPECTS[it.infuse].color);

export function showGear(o = {}) {
  st = { ...st, tab: o.forge && o.tab ? o.tab : 'gear', sel: null, forge: !!o.forge, onClose: o.onClose || null, confirm: false, forgeSel: null };
  $('gear').hidden = false; G.paused = true; document.body.classList.add('overlay');
  render();
}
function close() {
  hideTip();
  $('gear').hidden = true; G.paused = false; document.body.classList.remove('overlay');
  writeSave(G.save);
  G.onGearChanged?.();
  st.onClose?.();
}

function render() {
  const save = G.save, inv = save.inv;
  hideTip();
  $('gear-close').onclick = close;
  $('gear-tabs').innerHTML = TABS.map(([id, name]) => `<button class="tab ${st.tab === id ? 'on' : ''}" data-tab="${id}">${name}${id === 'forge' && !st.forge ? '<small>у очага</small>' : ''}</button>`).join('');
  for (const b of $('gear-tabs').querySelectorAll('.tab')) b.onclick = () => { st.tab = b.dataset.tab; st.confirm = false; sfx.ui(); render(); };
  $('gear-res').innerHTML = `<span class="res" title="Пепел"><img alt="" src="${toDataURL(SPR.icon.ash, 4)}"><b>${Math.floor(save.ash)}</b></span>` +
    ['bone', 'resin', 'shard', 'heart'].map((k) => `<span class="res" title="${RESOURCES[k].name}"><img alt="" src="${resIcon(k)}"><b>${inv.mats[k] || 0}</b></span>`).join('');
  const main = $('gear-main');
  main.className = 'gear-main tab-' + st.tab;
  if (st.tab === 'res') { main.innerHTML = resourcesHTML(); return; }
  if (st.tab === 'codex') { main.innerHTML = codexHTML(); return; }
  if (st.tab === 'forge') { renderForge(main); return; }
  renderGear(main);
}

// ---------------- equipment (Diablo-style) ----------------
function slotHTML(inv, id) {
  const sl = SLOT_BY_ID[id], it = inv.items.find((i) => i.uid === inv.equip[id]);
  return `<button class="pslot ${it ? 'full r' + it.rarity : 'empty'}" data-slot="${id}" ${it ? `data-uid="${it.uid}"` : ''} style="--r:${it ? RARITY[it.rarity].color : '#3a3448'}" aria-label="${sl.name}: ${it ? it.name : 'пусто'}">
    <span class="pic"><img alt="" src="${it ? itemIconURL(it, 4) : slotIconURL(id, 4)}">${it && it.up ? `<i class="up">+${it.up}</i>` : ''}${it && it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}</span>
    <span class="lbl"><small>${sl.name}</small><b>${it ? it.name : 'пусто'}</b></span></button>`;
}
function renderGear(main) {
  const inv = G.save.inv, s = statsWith(inv.equip), W = WEAPONS[s.wk];
  main.innerHTML = `
    <section class="paper" aria-label="Надето">
      <div class="pcol left">${LEFT.map((id) => slotHTML(inv, id)).join('')}</div>
      <div class="stage">
        <canvas id="gear-hero" width="216" height="270"></canvas>
        <p class="wname">${W.name}: ${POWER_INFO[s.wk].name}</p>
      </div>
      <div class="pcol right">${RIGHT.map((id) => slotHTML(inv, id)).join('')}</div>
      <dl class="statbar">
        <div><dt>Здоровье</dt><dd>${s.maxHp}</dd></div><div><dt>Выносливость</dt><dd>${s.maxSta}</dd></div>
        <div><dt>Урон в секунду</dt><dd>${dps(s).toFixed(0)}</dd></div><div><dt>Броня</dt><dd>${Math.round(s.armor)}</dd></div>
        <div><dt>Крит</dt><dd>${Math.round(s.crit * 100)}%</dd></div><div><dt>Перекат</dt><dd>${ROLL[s.roll].name}</dd></div>
      </dl>
      ${Object.keys(s.gearAspects).length ? `<p class="asp">Аспекты снаряжения: ${Object.entries(s.gearAspects).map(([a, n]) => `<span style="color:${ASPECTS[a].color}">${ASPECTS[a].name} +${n}</span>`).join(', ')}</p>` : ''}
    </section>
    <section class="bag2" aria-label="Сумка">
      <div class="bagbar">
        <div class="filters">${FILTERS.map(([id, n]) => `<button class="chip ${st.filter === id ? 'on' : ''}" data-f="${id}">${n} <em>${countFor(inv, id)}</em></button>`).join('')}</div>
        <select id="gear-sort" aria-label="Сортировка">${SORTS.map(([id, n]) => `<option value="${id}" ${st.sort === id ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div id="gear-grid" class="grid2"></div>
      <div class="bagfoot">
        <div class="cap"><span style="--k:${Math.min(1, inv.items.length / s.bag)}"></span></div>
        <span>${inv.items.length} из ${s.bag}</span>
        <button id="bulk" class="ghost ${st.confirm ? 'warn' : ''}">${st.confirm ? 'Точно? Нажми ещё раз' : 'Разобрать все смертные'}</button>
      </div>
      <p class="keys">Наведи — сравнение с надетым. Правый клик или двойной клик — надеть. Перетащи на ячейку. Клавиши: E надеть, L закрепить, X разобрать.</p>
    </section>`;
  drawHero(inv);
  const grid = $('gear-grid'), list = sorted(inv);
  grid.innerHTML = list.map((it) => `<button class="tile2 r${it.rarity} ${st.sel === it.uid ? 'sel' : ''} ${isEquipped(inv, it) ? 'worn' : ''}" data-uid="${it.uid}" draggable="true" style="--r:${RARITY[it.rarity].color}" aria-label="${it.name}">
      <img alt="" src="${itemIconURL(it, 4)}">${it.up ? `<i class="up">+${it.up}</i>` : ''}${it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}
      ${isEquipped(inv, it) ? '<i class="eq">надето</i>' : ''}${it.isNew ? '<i class="new"></i>' : ''}${it.locked ? '<i class="lock">⚿</i>' : ''}
      <i class="tpips">${'◆'.repeat(it.rarity + 1)}</i></button>`).join('') || '<p class="empty">Пусто. Вещи падают с врагов: обычные редко, элита и боссы часто.</p>';
  for (const el of [...grid.querySelectorAll('.tile2'), ...main.querySelectorAll('.pslot.full')]) bindItemEl(el, inv);
  for (const b of main.querySelectorAll('.pslot')) bindSlotDrop(b, inv);
  for (const b of main.querySelectorAll('.chip')) b.onclick = () => { st.filter = b.dataset.f; render(); };
  $('gear-sort').onchange = (e) => { st.sort = e.target.value; render(); };
  $('bulk').onclick = () => {
    if (!st.confirm) { st.confirm = true; render(); return; }
    for (const i of inv.items.filter((x) => x.rarity === 0 && !isEquipped(inv, x) && !x.locked)) salvage(inv, i, s.salvageMul);
    st.confirm = false; sfx.pick(); writeSave(G.save); render();
  };
  if (st.sel) { const el = main.querySelector(`[data-uid="${st.sel}"]`); const it = inv.items.find((i) => i.uid === st.sel); if (el && it) showTip(it, el, true); }
}
const countFor = (inv, f) => inv.items.filter((i) => matchF(i, f)).length;
const matchF = (it, f) => f === 'all' || (f === 'weapon' && it.slot === 'weapon') || (f === 'armor' && LEFT.includes(it.slot)) || (f === 'jewel' && ['amulet', 'ring', 'relic'].includes(it.slot));
function sorted(inv) {
  const by = {
    score: (a, b) => itemScore(b) - itemScore(a),
    rarity: (a, b) => b.rarity - a.rarity || itemScore(b) - itemScore(a),
    new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || itemScore(b) - itemScore(a),
    slot: (a, b) => SLOTS.findIndex((x) => x.id === a.slot) - SLOTS.findIndex((x) => x.id === b.slot) || itemScore(b) - itemScore(a),
  }[st.sort];
  return inv.items.filter((i) => matchF(i, st.filter)).sort(by);
}
function drawHero(inv) {
  const hc = $('gear-hero'), hg = hc.getContext('2d');
  const hero = heroFrames(gearLook(inv)).idle[0];
  hg.imageSmoothingEnabled = false; hg.clearRect(0, 0, hc.width, hc.height);
  const m = Math.floor(Math.min(hc.width / hero.c.width, (hc.height - 20) / hero.c.height));
  const x = (hc.width - hero.c.width * m) / 2, y = hc.height - 16 - hero.c.height * m;
  hg.fillStyle = 'rgba(200,146,74,0.18)'; hg.beginPath(); hg.ellipse(hc.width / 2, hc.height - 14, 64, 10, 0, 0, Math.PI * 2); hg.fill();
  hg.drawImage(hero.c, x, y, hero.c.width * m, hero.c.height * m);
  // the equipped weapon in hand (twin machairai: one per hand), same integer scale as the hero
  const w = inv.items.find((i) => i.uid === inv.equip.weapon);
  if (!w) return;
  const key = WEAPONS[BASES[w.base].kind].sprite, ws = weaponSprite(key, w.rarity);
  const hand = (ox, oy, ang) => {
    hg.save(); hg.translate(x + hero.c.width * m * ox, y + hero.c.height * m * oy); hg.rotate(ang);
    if (ws.glow) { hg.globalAlpha = 0.5; hg.drawImage(ws.glow, -2 * m, -ws.glow.height * m / 2 - m, ws.glow.width * m + 2 * m, ws.glow.height * m + 2 * m); hg.globalAlpha = 1; }
    hg.drawImage(ws.c, -2 * m, -ws.c.height * m / 2, ws.c.width * m, ws.c.height * m);
    hg.restore();
  };
  if (key === 'dagger') { hand(0.12, 0.62, -2.3); hand(0.86, 0.62, -0.8); }
  else if (key === 'bow') hand(0.86, 0.45, 0);
  else hand(0.84, 0.6, -0.9);
}

function equipNow(it) { const inv = G.save.inv; if (!isEquipped(inv, it)) { equipItem(inv, it); it.isNew = false; st.sel = it.uid; sfx.pick(); render(); } }
function bindItemEl(el, inv) {
  const it = inv.items.find((i) => i.uid === el.dataset.uid);
  if (!it) return;
  el.onclick = () => { st.sel = st.sel === it.uid ? null : it.uid; it.isNew = false; sfx.ui(); render(); };
  el.ondblclick = () => equipNow(it);
  el.oncontextmenu = (e) => { e.preventDefault(); equipNow(it); };
  el.onmouseenter = () => { if (!st.sel) showTip(it, el, false); };
  el.onmouseleave = () => { if (!st.sel) hideTip(); };
  el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', it.uid); hideTip(); };
}
function bindSlotDrop(b, inv) {
  b.ondragover = (e) => { e.preventDefault(); b.classList.add('drop'); };
  b.ondragleave = () => b.classList.remove('drop');
  b.ondrop = (e) => {
    e.preventDefault(); b.classList.remove('drop');
    const it = inv.items.find((i) => i.uid === e.dataTransfer.getData('text/plain'));
    if (it && it.slot === b.dataset.slot) equipNow(it);
    else { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 300); sfx.block(); }
  };
  if (!b.dataset.uid) b.onclick = () => { st.filter = LEFT.includes(b.dataset.slot) ? 'armor' : b.dataset.slot === 'weapon' ? 'weapon' : 'jewel'; render(); };
}

// ---------------- item card + floating comparison ----------------
function facts(it) {
  const base = BASES[it.base], pw = itemPower(it), rows = [];
  if (base.slot === 'weapon') {
    const W = WEAPONS[base.kind];
    rows.push(['Урон в секунду', (rawDps(W) * pw).toFixed(0)], ['Удар', { slash: 'рубящий', pierce: 'пронзающий', arcane: 'чары' }[W.dmgType]]);
  } else if (WEIGHT[base.kind]) {
    const Wt = WEIGHT[base.kind], m = SLOT_MUL[base.slot];
    rows.push(['Броня', Math.round(Wt.armor * m * pw)], ['Вес', (Wt.weight * m).toFixed(1)]);
  }
  rows.push(['Мощь', itemScore(it)]);
  return rows;
}
export function cardHTML(it, o = {}) {
  const base = BASES[it.base], R = RARITY[it.rarity];
  const W = base.slot === 'weapon' ? WEAPONS[base.kind] : null;
  const aff = it.affixes.map((a) => `<li>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</li>`).join('');
  let extra = '';
  if (W) extra += `<p class="tech"><b>${W.skill.name}</b> — умение. <b>${POWER_INFO[base.kind].name}</b> — усиленный удар: ${POWER_INFO[base.kind].desc}</p>`;
  if (base.kind === 'relic') extra += `<p class="tech"><b>${RELICS[it.relic].name}.</b> ${RELICS[it.relic].desc}</p>`;
  if (it.infuse) {
    if (it.infuse.startsWith('root:')) { const r = ROOTS[it.infuse.slice(5)]; extra += `<p class="inf-line" style="--e:#ffb347"><b>${r.name}.</b> ${r.desc}</p>`; }
    else { const A = ASPECTS[it.infuse]; extra += `<p class="inf-line" style="--e:${A.color}"><b>Заточка: ${A.name}.</b> +1 к аспекту.${W ? ' ' + ELEMENT_WEAPON[it.infuse] : ''}</p>`; }
  }
  return `<article class="card2 r${it.rarity}" style="--r:${R.color}">
    ${o.badge ? `<p class="badge">${o.badge}</p>` : ''}
    <header><span class="art"><img alt="" src="${itemIconURL(it, 6)}"></span>
      <div><h3>${it.name}${it.up ? ` <span class="upv">+${it.up}</span>` : ''}</h3><p class="rar">${pips(it.rarity)} ${R.name}</p><p class="kind">${kindName(it)}, ${SLOT_BY_ID[base.slot].name.toLowerCase()}, глубина ${it.ilvl}${it.locked ? ', закреплено' : ''}</p></div></header>
    <dl class="facts">${facts(it).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${aff ? `<ul class="aff">${aff}</ul>` : ''}${extra}
    <p class="flavor">${FLAVOR[it.base] || ''}</p>
    ${o.after || ''}
  </article>`;
}
function diffHTML(it) {
  const inv = G.save.inv, cur = statsWith(inv.equip), ns = statsWith({ ...inv.equip, [it.slot]: it.uid });
  const rows = [];
  const add = (l, a, b, better = 1, f = (v) => Math.round(v)) => { const d = b - a; if (Math.abs(d) >= 0.5) rows.push(`<li class="${d * better > 0 ? 'up' : 'down'}">${d * better > 0 ? '▲' : '▼'} ${l}: ${f(a)} → ${f(b)}</li>`); };
  add('урон в секунду', dps(cur), dps(ns)); add('здоровье', cur.maxHp, ns.maxHp); add('выносливость', cur.maxSta, ns.maxSta);
  add('броня', cur.armor, ns.armor); add('крит, %', cur.crit * 100, ns.crit * 100); add('скорость', cur.speed, ns.speed); add('нагрузка', cur.load, ns.load, -1);
  add('пепел, %', cur.ashMul * 100, ns.ashMul * 100); add('находки, %', cur.findMul * 100, ns.findMul * 100);
  if (ns.roll !== cur.roll) rows.push(`<li class="${['light', 'medium', 'heavy'].indexOf(ns.roll) < ['light', 'medium', 'heavy'].indexOf(cur.roll) ? 'up' : 'down'}">перекат станет: ${ROLL[ns.roll].name.toLowerCase()}</li>`);
  return `<div class="diff2"><h4>Если надеть</h4>${rows.length ? `<ul>${rows.join('')}</ul>` : '<p class="mu">Ничего не изменится.</p>'}</div>`;
}
function actionsHTML(it) {
  const inv = G.save.inv, eq = isEquipped(inv, it), s = statsWith(inv.equip);
  return `<div class="tipact">
    ${eq ? (it.slot !== 'weapon' ? '<button data-a="off" class="ghost">Снять</button>' : '') : '<button data-a="on">Надеть</button>'}
    <button data-a="lock" class="ghost">${it.locked ? 'Открепить' : 'Закрепить'}</button>
    ${!eq && !it.locked ? `<button data-a="salv" class="ghost danger">Разобрать: ${costText(scaleY(salvageYield(it), s.salvageMul))}</button>` : ''}
    <button data-a="x" class="ghost">Закрыть</button></div>`;
}
function showTip(it, anchor, pinned) {
  const inv = G.save.inv, tip = $('gear-tip');
  const worn = inv.items.find((i) => i.uid === inv.equip[it.slot]);
  const eq = isEquipped(inv, it);
  tip.innerHTML = `<div class="tipcards">${cardHTML(it, { badge: eq ? 'Надето' : null, after: (eq ? '' : diffHTML(it)) + (pinned ? actionsHTML(it) : '') })}${!eq && worn && innerWidth > 900 ? cardHTML(worn, { badge: 'Надето сейчас' }) : ''}</div>`;
  tip.hidden = false; tip.classList.toggle('pinned', pinned);
  // position next to the anchor, kept inside the screen (Diablo-style)
  const r = anchor.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, pad = 12;
  let x = r.right + pad; if (x + tw > innerWidth - pad) x = r.left - tw - pad; if (x < pad) x = Math.max(pad, (innerWidth - tw) / 2);
  let y = Math.min(Math.max(pad, r.top - 20), innerHeight - th - pad);
  if (innerWidth <= 900) { x = pad; y = innerHeight - th - pad; }
  tip.style.left = x + 'px'; tip.style.top = Math.max(pad, y) + 'px';
  if (pinned) for (const b of tip.querySelectorAll('[data-a]')) b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'on') equipNow(it);
    else if (a === 'off') { unequip(inv, it.slot); sfx.ui(); render(); }
    else if (a === 'lock') { it.locked = !it.locked; sfx.ui(); render(); }
    else if (a === 'salv') { if (salvage(inv, it, statsWith(inv.equip).salvageMul)) { st.sel = null; sfx.ui(); writeSave(G.save); render(); } }
    else { st.sel = null; render(); }
  };
}
function hideTip() { const t = $('gear-tip'); if (t) { t.hidden = true; t.innerHTML = ''; } }
const scaleY = (y, m) => { const o = {}; for (const k in y) o[k] = Math.max(1, Math.round(y[k] * m)); return o; };

// ---------------- forge (Elden Ring smithing-style) ----------------
function renderForge(main) {
  const save = G.save, inv = save.inv, cur = statsWith(inv.equip);
  const list = [...inv.items].sort((a, b) => (isEquipped(inv, b) - isEquipped(inv, a)) || itemScore(b) - itemScore(a));
  if (!st.forgeSel || !inv.items.find((i) => i.uid === st.forgeSel)) st.forgeSel = list[0]?.uid;
  const it = inv.items.find((i) => i.uid === st.forgeSel);
  main.innerHTML = `
    <section class="flist" aria-label="Что улучшить">${list.map((i) => `<button class="frow ${i.uid === st.forgeSel ? 'on' : ''}" data-uid="${i.uid}" style="--r:${RARITY[i.rarity].color}"><img alt="" src="${itemIconURL(i, 2)}"><span><b>${i.name}</b><small>${pips(i.rarity)} ${isEquipped(inv, i) ? 'надето' : kindName(i)}</small></span><em>${i.up ? '+' + i.up : ''}</em></button>`).join('')}</section>
    <section class="fbench">${it ? forgeBench(it, cur) : '<p class="mu">Нет вещей.</p>'}</section>`;
  for (const b of main.querySelectorAll('.frow')) b.onclick = () => { st.forgeSel = b.dataset.uid; sfx.ui(); render(); };
  if (it && st.forge) bindForge(it, cur);
}
function forgeBench(it, cur) {
  const save = G.save;
  if (!st.forge) return `${cardHTML(it)}<div class="forge off"><h4>Горн погас</h4><p>Улучшать и затачивать можно в Древе Гесперид и у очага Гестии.</p></div>`;
  const base = BASES[it.base];
  const capped = it.up >= cur.upCap, uc = scaledUpgradeCost(it, cur);
  const nx = { ...it, up: it.up + 1 };
  const before = facts(it), after = facts(nx);
  const upRows = before.map(([k, v], i) => `<tr><th>${k}</th><td>${v}</td><td>→</td><td class="${after[i][1] !== v ? 'up' : ''}">${after[i][1]}</td></tr>`).join('') +
    it.affixes.map((a) => `<tr><th>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</th><td></td><td>→</td><td class="up">${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * (it.up + 1))))}</td></tr>`).join('');
  let h = `${cardHTML(it)}<div class="forge">
    <h4>Улучшение ${capped ? '' : `+${it.up} → +${it.up + 1}`}</h4>
    ${capped ? `<p class="mu">${cur.upCap < 10 ? 'Предел +' + cur.upCap + '. Поднимает узел «Горн Гефеста».' : 'Максимум +10.'}</p>` : `<table class="uptable">${upRows}</table>${costTable(uc)}<button id="f-up" ${canPay(save, uc) ? '' : 'disabled'}>Улучшить</button>`}`;
  if (!cur.canInfuse) h += '<p class="mu">Заточка под стихию откроется узлом «Стихийная заточка» (ветвь Гефеста).</p>';
  else h += `<h4>Заточка под стихию${it.infuse ? ', заменит текущую' : ''}</h4><div class="elems">` + ELEMENTS.map((e) => {
    const c = infuseCost(it, e), ok = canPay(save, c) && it.infuse !== e;
    return `<button class="elem" data-inf="${e}" style="--e:${ASPECTS[e].color}" ${ok ? '' : 'disabled'} title="${ASPECTS[e].name}: ${costText(c)}"><img alt="" src="${aspIcon(e)}"><span>${ASPECTS[e].name}</span></button>`;
  }).join('') + `</div>${costTable(infuseCost(it, 'fire'), 'стихия')}`;
  if (cur.canRoot) h += '<h4>Корневое усиление</h4><div class="roots">' + Object.entries(ROOTS).filter(([, r]) => (r.slot === 'weapon') === (base.slot === 'weapon')).map(([id, r]) => {
    const c = infuseCost(it, 'root:' + id), ok = canPay(save, c) && it.infuse !== 'root:' + id;
    return `<button class="root" data-root="${id}" ${ok ? '' : 'disabled'}><b>${r.name}</b><span>${r.desc}</span></button>`;
  }).join('') + `</div>${costTable(infuseCost(it, 'root:x'))}`;
  return h + '</div>';
}
function costTable(c, elemLabel) {
  return `<table class="costs">${Object.entries(c).map(([k, v]) => {
    const have = k === 'ash' ? G.save.ash : G.save.inv.mats[k] || 0;
    const name = k === 'ash' ? 'Пепел' : elemLabel && k.startsWith('e_') ? 'Эссенция стихии' : RESOURCES[k].name;
    return `<tr class="${have >= v ? '' : 'lack'}"><th>${name}</th><td>${v}</td><td>есть ${Math.floor(have)}</td></tr>`;
  }).join('')}</table>`;
}
function bindForge(it, cur) {
  const save = G.save;
  $('f-up') && ($('f-up').onclick = () => { if (upgrade(save, it, cur) === 'ok') { sfx.pick(); writeSave(save); render(); } });
  for (const b of document.querySelectorAll('.fbench .elem')) b.onclick = () => { if (infuse(save, it, b.dataset.inf) === 'ok') { sfx.pick(); writeSave(save); render(); } };
  for (const b of document.querySelectorAll('.fbench .root')) b.onclick = () => { if (infuse(save, it, 'root:' + b.dataset.root) === 'ok') { sfx.pick(); writeSave(save); render(); } };
}

// ---------------- resources & codex ----------------
function resourcesHTML() {
  const inv = G.save.inv;
  const use = { bone: 'улучшение до +3', resin: 'улучшение +4…+6, заточка', shard: 'улучшение +7…+9, корни', heart: '+10 и корневые усиления' };
  return `<section class="restab">${RES_ORDER.map((k) => {
    const R = RESOURCES[k];
    return `<article class="resrow" style="--c:${R.color}"><img alt="" src="${resIcon(k)}"><div><h3>${R.name}</h3><p>${R.desc}</p><p class="mu">${use[k] ? 'Нужна для: ' + use[k] : 'Нужна для заточки под эту стихию'}</p></div><b>${inv.mats[k] || 0}</b></article>`;
  }).join('')}</section>`;
}
function codexHTML() {
  const inv = G.save.inv, cx = inv.codex || {};
  const bases = Object.keys(BASES).filter((b) => b !== 'x_relic'), relics = Object.keys(RELICS);
  const cell = (key, iconKey, name, legend) => {
    const r = cx[key], seen = r !== undefined && r >= 0;
    return `<figure class="cx ${seen ? 'seen r' + r : 'unseen'}" style="--r:${seen ? RARITY[r].color : '#2a2438'}"><img alt="" src="${toDataURL(iconSprite(iconKey, seen ? r : 0), 4)}"><figcaption>${seen ? (r === 3 && legend ? legend : name) : '???'}</figcaption>${seen ? `<small>${pips(r)}</small>` : ''}</figure>`;
  };
  const depth = (G.run?.floor) || Math.max(1, G.save.stats.bestFloor || 1);
  const ch = [1, 2, 3, 4, 5].map((f) => rarityChances(f));
  return `<section class="codex">
    <div class="cxhead"><h3>Найдено ${Object.keys(cx).length} из ${bases.length + relics.length}</h3><p class="mu">Все виды вещей, что ты находил, и лучшая найденная редкость.</p></div>
    <div class="cxgrid">${bases.map((b) => cell(b, ICON_OF[b], BASES[b].name, BASES[b].legend)).join('')}${relics.map((k) => cell('relic_' + k, 'relic_' + k, RELICS[k].name)).join('')}</div>
    <h3 class="cxsub">Шансы редкости по глубинам</h3>
    <table class="chances"><thead><tr><th>Глубина</th>${RARITY.map((R, i) => `<th style="color:${R.color}">${pips(i)} ${R.name}</th>`).join('')}</tr></thead>
    <tbody>${ch.map((row, i) => `<tr class="${i + 1 === depth ? 'cur' : ''}"><th>${['I', 'II', 'III', 'IV', 'V'][i]}</th>${row.map((p) => `<td>${(p * 100).toFixed(1)}%</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="mu">Обычный враг роняет вещь с шансом 2.5%, элита 30%, босс всегда (не ниже Героической).</p>
  </section>`;
}

export function initGear() {
  addEventListener('keydown', (e) => {
    if ($('gear').hidden) return;
    if (e.code === 'Escape' || e.code === 'KeyI') { e.stopPropagation(); if (st.sel) { st.sel = null; render(); } else close(); return; }
    const inv = G.save.inv, it = inv.items.find((i) => i.uid === st.sel);
    if (!it) return;
    if (e.code === 'KeyE') equipNow(it);
    if (e.code === 'KeyL') { it.locked = !it.locked; render(); }
    if (e.code === 'KeyX' && !isEquipped(inv, it) && !it.locked) { salvage(inv, it, statsWith(inv.equip).salvageMul); st.sel = null; render(); }
  }, true);
}
