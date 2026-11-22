// Сокровищница v4 — one fixed three-pane layout instead of floating tooltips that covered the grid:
//   [ hero: paper doll with 8 slots + key stats ] [ bag: filters, sort, uniform tiles ] [ item: always-visible detail ]
// Hover a tile = preview it on the right; click = pin it there with its actions (equip, lock, salvage).
// The detail pane always shows what changes versus the item worn in that slot.
// The forge uses the same skeleton: item list | the item | the anvil.
// Skills: build-game-inventory (atomic equip/swap, locked items, keyboard + touch alternatives),
// game-ui-ux (>=16px text, rarity never by colour alone), frontend-design (one loud element: the item niche).
import { G } from '../game/state.js';
import { SLOTS, SLOT_BY_ID, BASES, RARITY, WEIGHT, SLOT_MUL, AFFIXES, RELICS, ROOTS, ELEMENTS, ELEMENT_WEAPON, RESOURCES, RES_ORDER, FLAVOR, itemPower, itemScore, infuseCost, salvageYield, TITAN_PROPS, LEGEND } from '../data/items.js';
import { ASPECTS } from '../data/boons.js';
import { WEAPONS, ROLL, rawDps } from '../data/weapons.js';
import { SPR, heroFrames, weaponSprite } from '../art/bank.js';
import { itemIconURL, slotIconURL, iconSprite, ICON_OF } from '../art/items.js';
import { toDataURL } from '../engine/sprite.js';
import { sfx } from '../engine/audio.js';
import { writeSave } from '../game/save.js';
import { computeStats } from '../game/stats.js';
import { gearLook } from '../game/player.js';
import { equipItem, unequip, isEquipped, upgrade, infuse, salvage, scaledUpgradeCost, canPay, costText, rarityChances } from '../game/items.js';

const $ = (id) => document.getElementById(id);
const resURL = {}; const resIcon = (k) => (resURL[k] ||= toDataURL(SPR.icon[RESOURCES[k].icon], 4));
const aspURL = {}; const aspIcon = (a) => (aspURL[a] ||= toDataURL(SPR.icon[ASPECTS[a].icon], 4));
const TABS = [['gear', 'Снаряжение'], ['forge', 'Кузня'], ['res', 'Ресурсы'], ['codex', 'Летопись']];
const LEFT = ['helm', 'chest', 'gloves', 'boots'], RIGHT = ['weapon', 'amulet', 'ring', 'relic'];
const FILTERS = [['all', 'Всё'], ['weapon', 'Оружие'], ['armor', 'Броня'], ['jewel', 'Украшения']];
const SORTS = [['score', 'по мощи'], ['rarity', 'по редкости'], ['new', 'сначала новые'], ['slot', 'по ячейкам']];
const pips = (r) => `<span class="pips" aria-label="${RARITY[r].name}">${'◆'.repeat(r + 1)}${'◇'.repeat(3 - r)}</span>`;
let st = { tab: 'gear', sel: null, hover: null, filter: 'all', sort: 'score', forge: false, onClose: null, confirm: false, forgeSel: null };

const statsWith = (equip, items) => computeStats(G.save.nodes, equip, items || G.save.inv.items, G.run ? G.run.boons : {});
const dps = (s) => rawDps(WEAPONS[s.wk]) * s.dmgMul;
const kindName = (it) => {
  const b = BASES[it.base];
  if (b.slot === 'weapon') return WEAPONS[b.kind].name;
  if (WEIGHT[b.kind]) return `${WEIGHT[b.kind].name.toLowerCase()} броня`;
  return SLOT_BY_ID[b.slot].name.toLowerCase();
};
const infColor = (it) => (it.infuse.startsWith('root:') ? '#ffb347' : ASPECTS[it.infuse].color);
const hearts = (n) => '♥'.repeat(n);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function showGear(o = {}) {
  st = { ...st, tab: o.forge && o.tab ? o.tab : 'gear', sel: null, hover: null, forge: !!o.forge, onClose: o.onClose || null, confirm: false, forgeSel: null };
  $('gear').hidden = false; G.paused = true; document.body.classList.add('overlay');
  render();
}
function close() {
  $('gear').hidden = true; G.paused = false; document.body.classList.remove('overlay');
  writeSave(G.save);
  G.onGearChanged?.();
  st.onClose?.();
}

function render() {
  const save = G.save, inv = save.inv;
  $('gear-close').onclick = close;
  $('gear-tabs').innerHTML = TABS.map(([id, name]) => `<button class="tab ${st.tab === id ? 'on' : ''}" data-tab="${id}" aria-pressed="${st.tab === id}">${name}${id === 'forge' && !st.forge ? '<small> · у очага</small>' : ''}</button>`).join('');
  for (const b of $('gear-tabs').querySelectorAll('.tab')) b.onclick = () => { st.tab = b.dataset.tab; st.confirm = false; sfx.ui(); render(); };
  $('gear-res').innerHTML = `<span class="res" title="Пепел"><img alt="" src="${toDataURL(SPR.icon.ash, 4)}"><b>${Math.floor(save.ash)}</b><small>пепел</small></span>` +
    ['bone', 'resin', 'shard', 'heart'].map((k) => `<span class="res" title="${RESOURCES[k].name}"><img alt="" src="${resIcon(k)}"><b>${inv.mats[k] || 0}</b><small>${RESOURCES[k].name.toLowerCase()}</small></span>`).join('');
  const main = $('gear-main');
  main.className = 'gear-main tab-' + st.tab;
  if (st.tab === 'res') { main.innerHTML = resourcesHTML(); return; }
  if (st.tab === 'codex') { main.innerHTML = codexHTML(); return; }
  if (st.tab === 'forge') { renderForge(main); return; }
  renderGear(main);
}

// ---------------- equipment ----------------
function slotHTML(inv, id) {
  const sl = SLOT_BY_ID[id], it = inv.items.find((i) => i.uid === inv.equip[id]);
  const on = it && (st.sel === it.uid);
  return `<button class="eslot ${it ? 'full r' + it.rarity : 'empty'} ${on ? 'sel' : ''}" data-slot="${id}" ${it ? `data-uid="${it.uid}"` : ''} style="--r:${it ? RARITY[it.rarity].color : '#3a3448'}" aria-label="${sl.name}: ${it ? it.name : 'пусто'}" title="${sl.name}${it ? ': ' + it.name : ''}">
    <span class="pic"><img alt="" src="${it ? itemIconURL(it, 4) : slotIconURL(id, 4)}">${it && it.up ? `<i class="up">+${it.up}</i>` : ''}${it && it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}</span>
    <small>${sl.name}</small></button>`;
}
function renderGear(main) {
  const inv = G.save.inv, s = statsWith(inv.equip), W = WEAPONS[s.wk];
  const loadK = Math.min(1, s.load / s.loadCap);
  main.innerHTML = `
    <aside class="pane hero" aria-label="Надето">
      <div class="doll">
        <div class="ecol">${LEFT.map((id) => slotHTML(inv, id)).join('')}</div>
        <div class="stage"><canvas id="gear-hero" width="150" height="190"></canvas></div>
        <div class="ecol">${RIGHT.map((id) => slotHTML(inv, id)).join('')}</div>
      </div>
      <p class="wname"><b>${W.name}</b> · удержание атаки: ${W.power.name}</p>
      <dl class="sheet">
        <div><dt>Сердца</dt><dd class="hearts">${hearts(s.maxHp)}</dd></div>
        <div title="Бронзовые щиты: каждый принимает удар вместо сердца и восстанавливается"><dt>Щиты</dt><dd>${s.ward ? `<span class="wards">${'⛊'.repeat(s.ward)}</span>` : '<span class="mu">нет</span>'}</dd></div>
        <div><dt>Урон в секунду</dt><dd>${Math.round(dps(s))}</dd></div>
        <div><dt>Шанс крита</dt><dd>${Math.round(s.crit * 100)}%</dd></div>
        <div><dt>Выносливость</dt><dd>${s.maxSta}</dd></div>
        <div><dt>Перекат</dt><dd>${ROLL[s.roll].name.toLowerCase()}</dd></div>
        <div class="wide"><dt>Нагрузка</dt><dd>${Math.round(s.load)} из ${Math.round(s.loadCap)}<span class="bar"><i style="--k:${loadK}"></i></span></dd></div>
      </dl>
      ${Object.keys(s.gearAspects).length ? `<p class="asp">Аспекты: ${Object.entries(s.gearAspects).map(([a, n]) => `<span style="color:${ASPECTS[a].color}">${ASPECTS[a].name} +${n}</span>`).join(' · ')}</p>` : ''}
    </aside>
    <section class="pane bag" aria-label="Сумка">
      <div class="bagbar">
        <div class="seg" role="group" aria-label="Фильтр">${FILTERS.map(([id, n]) => `<button class="${st.filter === id ? 'on' : ''}" data-f="${id}" aria-pressed="${st.filter === id}">${n}<em>${countFor(inv, id)}</em></button>`).join('')}</div>
        <label class="sort">Порядок <select id="gear-sort">${SORTS.map(([id, n]) => `<option value="${id}" ${st.sort === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div id="gear-grid" class="grid"></div>
      <div class="bagfoot">
        <span class="cap" aria-hidden="true"><i style="--k:${Math.min(1, inv.items.length / s.bag)}"></i></span>
        <span>${inv.items.length} из ${s.bag}</span>
        <button id="bulk" class="ghost ${st.confirm ? 'warn' : ''}">${st.confirm ? 'Точно? Нажми ещё раз' : 'Разобрать всё смертное'}</button>
      </div>
    </section>
    <section class="pane detail" id="gear-detail" aria-live="polite"></section>`;
  drawHero(inv);
  const grid = $('gear-grid'), list = sorted(inv);
  grid.innerHTML = list.map((it) => `<button class="tile r${it.rarity} ${st.sel === it.uid ? 'sel' : ''} ${isEquipped(inv, it) ? 'worn' : ''}" data-uid="${it.uid}" draggable="true" style="--r:${RARITY[it.rarity].color}" aria-label="${it.name}, ${RARITY[it.rarity].name}${isEquipped(inv, it) ? ', надето' : ''}">
      <img alt="" src="${itemIconURL(it, 4)}">${it.up ? `<i class="up">+${it.up}</i>` : ''}${it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}
      ${isEquipped(inv, it) ? '<i class="eq" title="Надето"></i>' : ''}${it.isNew ? '<i class="new" title="Новое"></i>' : ''}${it.locked ? '<i class="lock" title="Закреплено">⚿</i>' : ''}</button>`).join('') || '<p class="empty">Здесь пусто. Вещи падают с врагов: с обычных редко, с элиты и боссов часто.</p>';
  for (const el of [...grid.querySelectorAll('.tile'), ...main.querySelectorAll('.eslot.full')]) bindItemEl(el, inv);
  for (const b of main.querySelectorAll('.eslot')) bindSlotDrop(b, inv);
  for (const b of main.querySelectorAll('.seg button')) b.onclick = () => { st.filter = b.dataset.f; sfx.ui(); render(); };
  $('gear-sort').onchange = (e) => { st.sort = e.target.value; render(); };
  $('bulk').onclick = () => {
    if (!st.confirm) { st.confirm = true; render(); return; }
    for (const i of inv.items.filter((x) => x.rarity === 0 && !isEquipped(inv, x) && !x.locked)) salvage(inv, i, s.salvageMul);
    st.confirm = false; sfx.pick(); writeSave(G.save); render();
  };
  renderDetail();
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
  const m = Math.max(1, Math.floor(Math.min(hc.width / hero.c.width, (hc.height - 20) / hero.c.height)));
  const x = Math.round((hc.width - hero.c.width * m) / 2), y = hc.height - 14 - hero.c.height * m;
  hg.fillStyle = 'rgba(200,146,74,0.16)'; hg.beginPath(); hg.ellipse(hc.width / 2, hc.height - 12, 50, 8, 0, 0, Math.PI * 2); hg.fill();
  hg.drawImage(hero.c, x, y, hero.c.width * m, hero.c.height * m);
  const w = inv.items.find((i) => i.uid === inv.equip.weapon);
  if (!w) return;
  const key = WEAPONS[BASES[w.base].kind].sprite, ws = weaponSprite(key, w.rarity), wm = Math.max(1, Math.round(m * 0.75));
  const hand = (ox, oy, ang) => {
    hg.save(); hg.translate(x + hero.c.width * m * ox, y + hero.c.height * m * oy); hg.rotate(ang);
    if (ws.glow) { hg.globalAlpha = 0.5; hg.drawImage(ws.glow, -2 * wm, -ws.glow.height * wm / 2 - wm, ws.glow.width * wm + 2 * wm, ws.glow.height * wm + 2 * wm); hg.globalAlpha = 1; }
    hg.drawImage(ws.c, -2 * wm, -ws.c.height * wm / 2, ws.c.width * wm, ws.c.height * wm);
    hg.restore();
  };
  if (key === 'dagger') { hand(0.12, 0.62, -2.3); hand(0.86, 0.62, -0.8); }
  else if (key === 'bow') hand(0.86, 0.45, 0);
  else hand(0.84, 0.6, -1.1);
  if (WEAPONS[BASES[w.base].kind].shield) { const sh = weaponSprite('shield', w.rarity); hg.drawImage(sh.c, x - sh.c.width * wm * 0.2, y + hero.c.height * m * 0.38, sh.c.width * wm, sh.c.height * wm); }
}

function equipNow(it) { const inv = G.save.inv; if (!isEquipped(inv, it)) { equipItem(inv, it); it.isNew = false; st.sel = it.uid; sfx.pick(); render(); } }
function bindItemEl(el, inv) {
  const it = inv.items.find((i) => i.uid === el.dataset.uid);
  if (!it) return;
  el.onclick = () => {
    st.sel = st.sel === it.uid ? null : it.uid; st.hover = null; it.isNew = false; sfx.ui(); render();
    // narrow screens stack the panes: bring the item pane into view
    if (st.sel && innerWidth <= 1000) requestAnimationFrame(() => $('gear-detail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  el.ondblclick = () => equipNow(it);
  el.oncontextmenu = (e) => { e.preventDefault(); equipNow(it); };
  el.onmouseenter = () => { st.hover = it.uid; renderDetail(); };
  el.onmouseleave = () => { st.hover = null; renderDetail(); };
  el.onfocus = el.onmouseenter;
  el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', it.uid); };
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

// ---------------- the item pane ----------------
function renderDetail() {
  const box = $('gear-detail');
  if (!box) return;
  const inv = G.save.inv;
  const id = st.hover || st.sel || inv.equip.weapon;
  const it = inv.items.find((i) => i.uid === id);
  if (!it) { box.innerHTML = '<p class="mu">Наведи на вещь, чтобы увидеть её здесь.</p>'; return; }
  const pinned = st.sel === it.uid;
  const eq = isEquipped(inv, it), worn = inv.items.find((i) => i.uid === inv.equip[it.slot]);
  box.innerHTML = `${cardHTML(it, { badge: eq ? 'Надето' : pinned ? 'Выбрано' : null })}
    ${eq ? '' : diffHTML(it, worn)}
    ${pinned || !st.hover ? actionsHTML(it) : '<p class="hint">Клик — выбрать. Двойной клик или правая кнопка — надеть сразу.</p>'}`;
  for (const b of box.querySelectorAll('[data-a]')) b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'on') equipNow(it);
    else if (a === 'off') { unequip(inv, it.slot); sfx.ui(); render(); }
    else if (a === 'lock') { it.locked = !it.locked; sfx.ui(); render(); }
    else if (a === 'salv') { if (salvage(inv, it, statsWith(inv.equip).salvageMul)) { st.sel = null; sfx.ui(); writeSave(G.save); render(); } }
  };
}
function facts(it) {
  const base = BASES[it.base], pw = itemPower(it), rows = [];
  if (base.slot === 'weapon') {
    const W = WEAPONS[base.kind];
    rows.push(['Урон в секунду', Math.round(rawDps(W) * pw)], ['Удар', { slash: 'рубящий', pierce: 'пронзающий', arcane: 'чары' }[W.dmgType]]);
  } else if (WEIGHT[base.kind]) {
    const Wt = WEIGHT[base.kind], m = SLOT_MUL[base.slot];
    rows.push(['Броня', Math.round(Wt.armor * m * pw)], ['Вес', Math.round(Wt.weight * m * 10) / 10]);
  }
  rows.push(['Мощь', itemScore(it)]);
  return rows;
}
export function cardHTML(it, o = {}) {
  const base = BASES[it.base], R = RARITY[it.rarity];
  const W = base.slot === 'weapon' ? WEAPONS[base.kind] : null;
  const aff = it.affixes.map((a) => `<li>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</li>`).join('');
  let extra = '';
  if (W) extra += `<div class="power"><h4>${W.power.name}</h4><p>${W.power.desc}</p><p class="mu">${W.tagline}${W.shield ? '. Щит блокирует удары и снаряды спереди' : ''}${W.bleedOnHit ? '. Каждый удар — рана яда' : ''}${W.execute ? `. Казнит врагов ниже ${Math.round(W.execute * 100)}% здоровья` : ''}.</p></div>`;
  if (it.tp && TITAN_PROPS[it.tp.k]) extra += `<p class="titan"><b>${TITAN_PROPS[it.tp.k].name}.</b> ${TITAN_PROPS[it.tp.k].desc(it)}</p>`;
  if (it.legend && LEGEND[it.base]) extra += `<p class="legend"><b>Божественная сила.</b> ${cap(LEGEND[it.base].replace(/^[^:]+:\s*/, ''))}</p>`;
  if (base.kind === 'relic') extra += `<p class="legend relic"><b>${RELICS[it.relic].name}.</b> ${RELICS[it.relic].desc}</p>`;
  if (it.infuse) {
    if (it.infuse.startsWith('root:')) { const r = ROOTS[it.infuse.slice(5)]; extra += `<p class="infl" style="--e:#ffb347"><b>${r.name}.</b> ${r.desc}</p>`; }
    else { const A = ASPECTS[it.infuse]; extra += `<p class="infl" style="--e:${A.color}"><b>Заточка: ${A.name}.</b> +1 к аспекту.${W ? ' ' + ELEMENT_WEAPON[it.infuse] : ''}</p>`; }
  }
  return `<article class="icard r${it.rarity}" style="--r:${R.color}">
    <header>
      <span class="niche"><img alt="" src="${itemIconURL(it, 6)}"></span>
      <div class="ttl">${o.badge ? `<p class="badge">${o.badge}</p>` : ''}<h3>${it.name}${it.up ? ` <span class="upv">+${it.up}</span>` : ''}</h3>
        <p class="rar">${pips(it.rarity)} ${R.name}</p><p class="kind">${kindName(it)} · глубина ${it.ilvl}${it.locked ? ' · закреплено' : ''}</p></div>
    </header>
    <dl class="facts">${facts(it).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${aff ? `<ul class="aff">${aff}</ul>` : ''}${extra}
    ${FLAVOR[it.base] ? `<p class="flavor">${FLAVOR[it.base]}</p>` : ''}
  </article>`;
}
function diffHTML(it, worn) {
  const inv = G.save.inv, cur = statsWith(inv.equip), ns = statsWith({ ...inv.equip, [it.slot]: it.uid });
  const rows = [];
  const add = (l, a, b, better = 1, f = (v) => Math.round(v)) => {
    const fa = f(a), fb = f(b);
    if (fa === fb) return;
    const good = (b - a) * better > 0;
    rows.push(`<tr class="${good ? 'up' : 'down'}"><th>${l}</th><td>${fa}</td><td aria-hidden="true">${good ? '▲' : '▼'}</td><td>${fb}</td></tr>`);
  };
  add('Урон в секунду', dps(cur), dps(ns)); add('Сердца', cur.maxHp, ns.maxHp); add('Бронзовые щиты', cur.ward, ns.ward);
  add('Выносливость', cur.maxSta, ns.maxSta); add('Броня', cur.armor, ns.armor); add('Крит, %', cur.crit * 100, ns.crit * 100);
  add('Скорость', cur.speed, ns.speed); add('Нагрузка', cur.load, ns.load, -1); add('Пепел, %', cur.ashMul * 100, ns.ashMul * 100); add('Находки, %', cur.findMul * 100, ns.findMul * 100);
  if (ns.roll !== cur.roll) rows.push(`<tr class="${['light', 'medium', 'heavy'].indexOf(ns.roll) < ['light', 'medium', 'heavy'].indexOf(cur.roll) ? 'up' : 'down'}"><th>Перекат</th><td>${ROLL[cur.roll].name.toLowerCase()}</td><td aria-hidden="true">→</td><td>${ROLL[ns.roll].name.toLowerCase()}</td></tr>`);
  return `<div class="diff"><h4>${worn ? `Вместо «${worn.name}»` : 'В пустую ячейку'}</h4>${rows.length ? `<table>${rows.join('')}</table>` : '<p class="mu">Характеристики не изменятся.</p>'}</div>`;
}
function actionsHTML(it) {
  const inv = G.save.inv, eq = isEquipped(inv, it), s = statsWith(inv.equip);
  return `<div class="acts">
    ${eq ? (it.slot !== 'weapon' ? '<button data-a="off" class="ghost">Снять</button>' : '<span class="mu">Оружие нельзя снять, только заменить.</span>') : '<button data-a="on" class="primary">Надеть</button>'}
    <button data-a="lock" class="ghost">${it.locked ? 'Открепить' : 'Закрепить'}</button>
    ${!eq && !it.locked ? `<button data-a="salv" class="ghost danger">Разобрать: ${costText(scaleY(salvageYield(it), s.salvageMul))}</button>` : ''}
  </div><p class="hint">Клавиши: E надеть, L закрепить, X разобрать, Esc снять выбор.</p>`;
}
const scaleY = (y, m) => { const o = {}; for (const k in y) o[k] = Math.max(1, Math.round(y[k] * m)); return o; };

// ---------------- forge: list | item | anvil ----------------
function renderForge(main) {
  const save = G.save, inv = save.inv, cur = statsWith(inv.equip);
  const list = [...inv.items].sort((a, b) => (isEquipped(inv, b) - isEquipped(inv, a)) || itemScore(b) - itemScore(a));
  if (!st.forgeSel || !inv.items.find((i) => i.uid === st.forgeSel)) st.forgeSel = list[0]?.uid;
  const it = inv.items.find((i) => i.uid === st.forgeSel);
  main.innerHTML = `
    <section class="pane flist" aria-label="Что улучшить">${list.map((i) => `<button class="frow ${i.uid === st.forgeSel ? 'on' : ''}" data-uid="${i.uid}" style="--r:${RARITY[i.rarity].color}"><img alt="" src="${itemIconURL(i, 3)}"><span><b>${i.name}</b><small>${pips(i.rarity)} ${isEquipped(inv, i) ? 'надето' : kindName(i)}</small></span><em>${i.up ? '+' + i.up : ''}</em></button>`).join('')}</section>
    <section class="pane detail">${it ? cardHTML(it) : '<p class="mu">Нет вещей.</p>'}</section>
    <section class="pane anvil">${it ? forgeBench(it, cur) : ''}</section>`;
  for (const b of main.querySelectorAll('.frow')) b.onclick = () => { st.forgeSel = b.dataset.uid; sfx.ui(); render(); };
  if (it && st.forge) bindForge(it, cur);
}
function forgeBench(it, cur) {
  const save = G.save;
  if (!st.forge) return `<div class="forge off"><h4>Горн погас</h4><p>Улучшать и затачивать вещи можно в Древе Гесперид и у очага Гестии.</p></div>`;
  const base = BASES[it.base];
  const capped = it.up >= cur.upCap, uc = scaledUpgradeCost(it, cur);
  const nx = { ...it, up: it.up + 1 };
  const before = facts(it), after = facts(nx);
  const upRows = before.map(([k, v], i) => `<tr><th>${k}</th><td>${v}</td><td aria-hidden="true">→</td><td class="${after[i][1] !== v ? 'up' : ''}">${after[i][1]}</td></tr>`).join('') +
    it.affixes.map((a) => `<tr><th>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</th><td></td><td aria-hidden="true">→</td><td class="up">${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * (it.up + 1))))}</td></tr>`).join('');
  let h = `<div class="forge"><h4>Улучшение${capped ? '' : ` +${it.up} → +${it.up + 1}`}</h4>
    ${capped ? `<p class="mu">${cur.upCap < 10 ? 'Предел +' + cur.upCap + '. Его поднимает узел «Горн Гефеста».' : 'Максимум +10.'}</p>` : `<table class="uptable">${upRows}</table>${costTable(uc)}<button id="f-up" class="primary" ${canPay(save, uc) ? '' : 'disabled'}>Улучшить</button>`}</div>`;
  if (!cur.canInfuse) h += '<div class="forge"><h4>Заточка под стихию</h4><p class="mu">Откроется узлом «Стихийная заточка» в ветви Гефеста.</p></div>';
  else h += `<div class="forge"><h4>Заточка под стихию${it.infuse ? ', заменит текущую' : ''}</h4><div class="elems">` + ELEMENTS.map((e) => {
    const c = infuseCost(it, e), ok = canPay(save, c) && it.infuse !== e;
    return `<button class="elem" data-inf="${e}" style="--e:${ASPECTS[e].color}" ${ok ? '' : 'disabled'} title="${ASPECTS[e].name}: ${costText(c)}"><img alt="" src="${aspIcon(e)}"><span>${ASPECTS[e].name}</span></button>`;
  }).join('') + `</div>${costTable(infuseCost(it, 'fire'), 'стихия')}</div>`;
  if (cur.canRoot) h += '<div class="forge"><h4>Корневое усиление</h4><div class="roots">' + Object.entries(ROOTS).filter(([, r]) => (r.slot === 'weapon') === (base.slot === 'weapon')).map(([id, r]) => {
    const c = infuseCost(it, 'root:' + id), ok = canPay(save, c) && it.infuse !== 'root:' + id;
    return `<button class="root" data-root="${id}" ${ok ? '' : 'disabled'}><b>${r.name}</b><span>${r.desc}</span></button>`;
  }).join('') + `</div>${costTable(infuseCost(it, 'root:x'))}</div>`;
  return h;
}
function costTable(c, elemLabel) {
  return `<table class="costs">${Object.entries(c).map(([k, v]) => {
    const have = k === 'ash' ? G.save.ash : G.save.inv.mats[k] || 0;
    const name = k === 'ash' ? 'Пепел' : elemLabel && k.startsWith('e_') ? 'Эссенция стихии' : RESOURCES[k].name;
    return `<tr class="${have >= v ? '' : 'lack'}"><th>${name}</th><td>нужно ${v}</td><td>есть ${Math.floor(have)}</td></tr>`;
  }).join('')}</table>`;
}
function bindForge(it, cur) {
  const save = G.save;
  $('f-up') && ($('f-up').onclick = () => { if (upgrade(save, it, cur) === 'ok') { sfx.pick(); writeSave(save); render(); } });
  for (const b of document.querySelectorAll('.anvil .elem')) b.onclick = () => { if (infuse(save, it, b.dataset.inf) === 'ok') { sfx.pick(); writeSave(save); render(); } };
  for (const b of document.querySelectorAll('.anvil .root')) b.onclick = () => { if (infuse(save, it, 'root:' + b.dataset.root) === 'ok') { sfx.pick(); writeSave(save); render(); } };
}

// ---------------- resources & codex ----------------
function resourcesHTML() {
  const inv = G.save.inv;
  const use = { bone: 'улучшение до +3', resin: 'улучшение +4…+6, заточка', shard: 'улучшение +7…+9, корни', heart: '+10 и корневые усиления' };
  return `<section class="restab">${RES_ORDER.map((k) => {
    const R = RESOURCES[k];
    return `<article class="resrow" style="--c:${R.color}"><img alt="" src="${resIcon(k)}"><div><h3>${R.name}</h3><p>${R.desc}</p><p class="mu">${use[k] ? 'Нужно для: ' + use[k] : 'Нужно для заточки под эту стихию'}</p></div><b>${inv.mats[k] || 0}</b></article>`;
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
    <tbody>${ch.map((row, i) => `<tr class="${i + 1 === depth ? 'cur' : ''}"><th>${['I', 'II', 'III', 'IV', 'V'][i]}</th>${row.map((p) => `<td>${Math.round(p * 1000) / 10}%</td>`).join('')}</tr>`).join('')}</tbody></table>
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
