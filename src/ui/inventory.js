// Сокровищница: equipment, forge, resources and the codex in one screen.
// Skills applied: build-game-inventory (atomic equip/swap, locked items never salvaged, keyboard + touch
// alternatives to drag-and-drop, tooltip facts), game-ui-ux (>=18px text, rarity never by colour alone,
// one focused control, screen stack), pixel-art-sprites (icons only at integer scale).
import { G } from '../game/state.js';
import { SLOTS, SLOT_BY_ID, BASES, RARITY, WEIGHT, SLOT_MUL, AFFIXES, RELICS, ROOTS, ELEMENTS, ELEMENT_WEAPON, RESOURCES, RES_ORDER, FLAVOR, itemPower, itemScore, infuseCost, salvageYield } from '../data/items.js';
import { ASPECTS } from '../data/boons.js';
import { WEAPONS, ROLL, rawDps } from '../data/weapons.js';
import { SPR, heroFrames } from '../art/bank.js';
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
const FILTERS = [['all', 'Всё', null], ...SLOTS.map((s) => [s.id, s.name, s.id])];
const SORTS = [['score', 'По мощи'], ['rarity', 'По редкости'], ['new', 'Сначала новые'], ['slot', 'По ячейкам']];
const pips = (r) => `<span class="pips" aria-label="${RARITY[r].name}">${'◆'.repeat(r + 1)}${'◇'.repeat(3 - r)}</span>`;
let st = { tab: 'gear', sel: null, hover: null, filter: 'all', sort: 'score', forge: false, onClose: null, confirm: false };

const statsWith = (equip) => computeStats(G.save.nodes, equip, G.save.inv.items, G.run ? G.run.boons : {});
const kindName = (it) => {
  const b = BASES[it.base];
  if (b.slot === 'weapon') return WEAPONS[b.kind].name;
  if (WEIGHT[b.kind]) return `${WEIGHT[b.kind].name.toLowerCase()} броня, ${SLOT_BY_ID[b.slot].name.toLowerCase()}`;
  return SLOT_BY_ID[b.slot].name;
};

export function showGear(o = {}) {
  st = { ...st, tab: o.forge && o.tab ? o.tab : 'gear', sel: null, hover: null, forge: !!o.forge, onClose: o.onClose || null, confirm: false };
  $('gear').hidden = false; G.paused = true; document.body.classList.add('overlay');
  render();
  $('gear').querySelector('.tab.on')?.focus();
}
function close() {
  $('gear').hidden = true; G.paused = false; document.body.classList.remove('overlay');
  writeSave(G.save);
  G.onGearChanged?.();
  st.onClose?.();
}

function render() {
  const save = G.save, inv = save.inv, s = statsWith(inv.equip);
  $('gear-close').onclick = close;
  $('gear-tabs').innerHTML = TABS.map(([id, name]) => `<button class="tab ${st.tab === id ? 'on' : ''}" data-tab="${id}" ${id === 'forge' && !st.forge ? 'title="Кузня доступна в Древе и у очага Гестии"' : ''}>${name}${id === 'forge' && !st.forge ? ' <small>у очага</small>' : ''}</button>`).join('');
  for (const b of $('gear-tabs').querySelectorAll('.tab')) b.onclick = () => { st.tab = b.dataset.tab; st.confirm = false; sfx.ui(); render(); };
  $('gear-res').innerHTML = `<span class="res" title="Пепел: валюта Древа и кузни"><img alt="" src="${toDataURL(SPR.icon.ash, 4)}"><b>${Math.floor(save.ash)}</b></span>` +
    ['bone', 'resin', 'shard', 'heart'].map((k) => `<span class="res" title="${RESOURCES[k].name}"><img alt="" src="${resIcon(k)}"><b>${inv.mats[k] || 0}</b></span>`).join('');
  const main = $('gear-main');
  main.className = 'gear-main tab-' + st.tab;
  if (st.tab === 'res') { main.innerHTML = resourcesHTML(); return; }
  if (st.tab === 'codex') { main.innerHTML = codexHTML(); return; }
  main.innerHTML = `
    <section class="doll" aria-label="Надето">
      <canvas id="gear-hero" width="160" height="200"></canvas>
      <div id="gear-slots" class="slots"></div>
      <dl id="gear-stats" class="gstats"></dl>
    </section>
    <section class="bag" aria-label="Инвентарь">
      <div class="bagbar">
        <div id="gear-filters" class="filters" role="tablist"></div>
        <label class="sort">Сортировка <select id="gear-sort">${SORTS.map(([id, n]) => `<option value="${id}" ${st.sort === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div id="gear-grid" class="grid"></div>
      <div class="bagfoot">
        <div class="cap"><span style="--k:${Math.min(1, inv.items.length / s.bag)}"></span></div>
        <span>${inv.items.length} из ${s.bag} мест</span>
        <button id="bulk" class="ghost">${st.confirm ? 'Точно разобрать? Нажми ещё раз' : 'Разобрать все смертные'}</button>
      </div>
    </section>
    <aside id="gear-detail" class="detail" aria-live="polite"></aside>`;
  drawHero(inv);
  renderSlots(inv);
  renderStats(s);
  renderBag(inv, s);
  renderDetail(s);
  $('gear-sort').onchange = (e) => { st.sort = e.target.value; render(); };
  $('bulk').onclick = () => {
    if (!st.confirm) { st.confirm = true; render(); return; }
    const junk = inv.items.filter((i) => i.rarity === 0 && !isEquipped(inv, i) && !i.locked);
    for (const i of junk) salvage(inv, i, s.salvageMul);
    st.confirm = false; sfx.pick(); writeSave(save); render();
  };
}

function drawHero(inv) {
  const hc = $('gear-hero'), hg = hc.getContext('2d');
  const hero = heroFrames(gearLook(inv)).idle[0];
  hg.imageSmoothingEnabled = false; hg.clearRect(0, 0, hc.width, hc.height);
  const m = Math.floor(Math.min(hc.width / hero.c.width, hc.height / hero.c.height)); // integer scale of the Scale2x canvas
  hg.drawImage(hero.c, (hc.width - hero.c.width * m) / 2, hc.height - hero.c.height * m, hero.c.width * m, hero.c.height * m);
}

function renderSlots(inv) {
  $('gear-slots').innerHTML = SLOTS.map((sl) => {
    const it = inv.items.find((i) => i.uid === inv.equip[sl.id]);
    return `<button class="slot r${it ? it.rarity : 'x'} ${it ? 'full' : ''} ${it && st.sel === it.uid ? 'sel' : ''}" data-slot="${sl.id}" style="--r:${it ? RARITY[it.rarity].color : '#3a3448'}" aria-label="${sl.name}: ${it ? it.name : 'пусто'}">
      <img alt="" src="${it ? itemIconURL(it, 4) : slotIconURL(sl.id, 4)}" class="${it ? '' : 'ghosticon'}">
      ${it && it.up ? `<i class="up">+${it.up}</i>` : ''}${it && it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}
      <span>${sl.name}</span></button>`;
  }).join('');
  for (const b of $('gear-slots').querySelectorAll('.slot')) {
    b.onclick = () => { const it = inv.items.find((i) => i.uid === inv.equip[b.dataset.slot]); st.sel = it ? it.uid : null; st.filter = b.dataset.slot; sfx.ui(); render(); };
    // drag & drop target (mouse); click/keys do the same for touch and keyboard
    b.ondragover = (e) => { e.preventDefault(); b.classList.add('drop'); };
    b.ondragleave = () => b.classList.remove('drop');
    b.ondrop = (e) => {
      e.preventDefault(); b.classList.remove('drop');
      const it = inv.items.find((i) => i.uid === e.dataTransfer.getData('text/plain'));
      if (it && it.slot === b.dataset.slot) { equipItem(inv, it); st.sel = it.uid; sfx.pick(); render(); }
      else { b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 300); sfx.block(); }
    };
  }
}

function renderStats(s) {
  const W = WEAPONS[s.wk];
  $('gear-stats').innerHTML = [
    ['Здоровье', s.maxHp], ['Выносливость', s.maxSta], ['Урон в секунду', (rawDps(W) * s.dmgMul).toFixed(0)],
    ['Броня', `${Math.round(s.armor)}, −${Math.round((1 - 80 / (80 + s.armor)) * 100)}% урона`], ['Крит', `${Math.round(s.crit * 100)}%, ×${s.critMul.toFixed(1)}`],
    ['Нагрузка', `${Math.round(s.load)} из ${Math.round(s.loadCap)}, ${ROLL[s.roll].name.toLowerCase()} перекат`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') +
    (Object.keys(s.gearAspects).length ? `<div class="wide"><dt>Аспекты от снаряжения</dt><dd>${Object.entries(s.gearAspects).map(([a, n]) => `<span style="color:${ASPECTS[a].color}">${ASPECTS[a].name} +${n}</span>`).join(', ')}</dd></div>` : '');
}

function sorted(inv) {
  const list = inv.items.filter((it) => st.filter === 'all' || it.slot === st.filter);
  const by = {
    score: (a, b) => itemScore(b) - itemScore(a),
    rarity: (a, b) => b.rarity - a.rarity || itemScore(b) - itemScore(a),
    new: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || itemScore(b) - itemScore(a),
    slot: (a, b) => SLOTS.findIndex((s) => s.id === a.slot) - SLOTS.findIndex((s) => s.id === b.slot) || itemScore(b) - itemScore(a),
  }[st.sort];
  return list.sort((a, b) => (isEquipped(inv, b) - isEquipped(inv, a)) || by(a, b));
}

function renderBag(inv) {
  $('gear-filters').innerHTML = FILTERS.map(([id, name, slot]) => {
    const n = id === 'all' ? inv.items.length : inv.items.filter((i) => i.slot === id).length;
    return `<button class="chip ${st.filter === id ? 'on' : ''}" data-f="${id}" title="${name}" role="tab" aria-selected="${st.filter === id}">${slot ? `<img alt="" src="${slotIconURL(slot, 2)}">` : ''}<span>${id === 'all' ? name : ''}</span><em>${n}</em></button>`;
  }).join('');
  for (const b of $('gear-filters').querySelectorAll('.chip')) b.onclick = () => { st.filter = b.dataset.f; render(); };
  const list = sorted(inv);
  $('gear-grid').innerHTML = list.map((it) => `<button class="tile r${it.rarity} ${st.sel === it.uid ? 'sel' : ''}" data-uid="${it.uid}" draggable="true" style="--r:${RARITY[it.rarity].color}" aria-label="${it.name}, ${RARITY[it.rarity].name}">
      <img alt="" src="${itemIconURL(it, 4)}">
      ${it.up ? `<i class="up">+${it.up}</i>` : ''}${it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}
      ${isEquipped(inv, it) ? '<i class="eq">надето</i>' : ''}${it.isNew ? '<i class="new"></i>' : ''}${it.locked ? '<i class="lock">⚿</i>' : ''}
      <i class="score">${itemScore(it)}</i><i class="tpips">${'◆'.repeat(it.rarity + 1)}</i></button>`).join('') ||
    `<p class="empty">${st.filter === 'all' ? 'Пока пусто. Обычные враги роняют вещи редко, элита и боссы — часто.' : 'Для этой ячейки вещей нет.'}</p>`;
  for (const b of $('gear-grid').querySelectorAll('.tile')) {
    const it = inv.items.find((i) => i.uid === b.dataset.uid);
    b.onclick = () => { st.sel = it.uid; it.isNew = false; sfx.ui(); render(); };
    b.ondblclick = () => { if (!isEquipped(inv, it)) { equipItem(inv, it); sfx.pick(); render(); } };
    b.onmouseenter = () => { if (st.sel !== it.uid) { st.hover = it.uid; renderDetail(statsWith(inv.equip)); } };
    b.onmouseleave = () => { st.hover = null; renderDetail(statsWith(inv.equip)); };
    b.ondragstart = (e) => { e.dataTransfer.setData('text/plain', it.uid); b.classList.add('drag'); };
    b.ondragend = () => b.classList.remove('drag');
  }
}

const infColor = (it) => (it.infuse.startsWith('root:') ? '#ffb347' : ASPECTS[it.infuse].color);

function itemFacts(it) {
  const base = BASES[it.base], pw = itemPower(it), rows = [];
  if (base.slot === 'weapon') {
    const W = WEAPONS[base.kind];
    rows.push(['Урон в секунду', (rawDps(W) * pw).toFixed(0)], ['Тип урона', { slash: 'рубящий', pierce: 'пронзающий', arcane: 'чары' }[W.dmgType]], ['Умение', W.skill.name]);
  } else if (WEIGHT[base.kind]) {
    const Wt = WEIGHT[base.kind], m = SLOT_MUL[base.slot];
    rows.push(['Броня', Math.round(Wt.armor * m * pw)], ['Вес', (Wt.weight * m).toFixed(1)], ['Класс', Wt.name]);
  }
  rows.push(['Мощь', itemScore(it)], ['Глубина', it.ilvl]);
  return rows;
}

function diffTable(it, cur) {
  const inv = G.save.inv;
  const ns = statsWith({ ...inv.equip, [it.slot]: it.uid });
  const row = (label, a, b, fmt = (v) => Math.round(v), better = 1) => {
    const d = b - a;
    if (Math.abs(d) < 0.5) return '';
    const good = d * better > 0;
    return `<tr class="${good ? 'up' : 'down'}"><th>${label}</th><td>${fmt(a)}</td><td>${fmt(b)}</td><td>${good ? '▲' : '▼'} ${d > 0 ? '+' : ''}${fmt(d)}</td></tr>`;
  };
  const rows = [
    row('Урон в секунду', rawDps(WEAPONS[cur.wk]) * cur.dmgMul, rawDps(WEAPONS[ns.wk]) * ns.dmgMul),
    row('Здоровье', cur.maxHp, ns.maxHp), row('Выносливость', cur.maxSta, ns.maxSta), row('Броня', cur.armor, ns.armor),
    row('Крит, %', cur.crit * 100, ns.crit * 100), row('Скорость бега', cur.speed, ns.speed),
    row('Нагрузка', cur.load, ns.load, (v) => Math.round(v), -1),
    row('Пепел, %', cur.ashMul * 100, ns.ashMul * 100), row('Находки, %', cur.findMul * 100, ns.findMul * 100),
  ].join('');
  const rollChange = ns.roll !== cur.roll ? `<p class="rollnote ${['light', 'medium', 'heavy'].indexOf(ns.roll) < ['light', 'medium', 'heavy'].indexOf(cur.roll) ? 'up' : 'down'}">Перекат станет: ${ROLL[ns.roll].name.toLowerCase()}</p>` : '';
  const worn = inv.items.find((i) => i.uid === inv.equip[it.slot]);
  return `<div class="diff"><h4>Если надеть${worn ? ` вместо «${worn.name}»` : ''}</h4>${rows ? `<table><thead><tr><th></th><th>сейчас</th><th>станет</th><th>разница</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="mu">Характеристики не изменятся.</p>'}${rollChange}</div>`;
}

function renderDetail(cur) {
  const save = G.save, inv = save.inv, el = $('gear-detail');
  if (!el) return;
  const it = inv.items.find((i) => i.uid === (st.hover || st.sel));
  if (!it) { el.innerHTML = '<div class="hint"><p>Выбери вещь в сумке или ячейку слева.</p><p>Перетащи вещь на ячейку, чтобы надеть. Двойной клик тоже надевает.</p><p>Клавиши: E надеть, L закрепить, X разобрать, I или Esc закрыть.</p></div>'; return; }
  const base = BASES[it.base], R = RARITY[it.rarity], eq = isEquipped(inv, it), preview = st.hover && st.hover !== st.sel;
  const facts = itemFacts(it).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const aff = it.affixes.map((a) => `<li>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</li>`).join('');
  let inf = '';
  if (it.infuse) {
    if (it.infuse.startsWith('root:')) { const r = ROOTS[it.infuse.slice(5)]; inf = `<p class="inf-line" style="--e:#ffb347"><b>${r.name}.</b> ${r.desc}</p>`; }
    else { const A = ASPECTS[it.infuse]; inf = `<p class="inf-line" style="--e:${A.color}"><b>Заточка: ${A.name}.</b> +1 к аспекту.${base.slot === 'weapon' ? ' ' + ELEMENT_WEAPON[it.infuse] : ''}</p>`; }
  }
  const relic = base.kind === 'relic' ? `<p class="relic"><b>${RELICS[it.relic].name}.</b> ${RELICS[it.relic].desc}</p>` : '';
  const actions = preview ? '' : `<div class="actions">
      ${eq ? (it.slot !== 'weapon' ? '<button id="g-off" class="ghost">Снять</button>' : '<span class="mu">Оружие в руках</span>') : '<button id="g-on">Надеть</button>'}
      <button id="g-lock" class="ghost">${it.locked ? 'Открепить' : 'Закрепить'}</button>
      ${!eq && !it.locked ? `<button id="g-salv" class="ghost danger">Разобрать: ${costText(scaleY(salvageYield(it), cur.salvageMul))}</button>` : ''}
    </div>`;
  el.innerHTML = `
    <div class="plate r${it.rarity}" style="--r:${R.color}">
      <div class="art"><img alt="" src="${itemIconURL(it, 8)}"></div>
      <div class="head">
        <h3>${it.name}${it.up ? ` <span class="upv">+${it.up}</span>` : ''}</h3>
        <p class="rar">${pips(it.rarity)} ${R.name}</p>
        <p class="kind">${kindName(it)}${eq ? ', надето' : ''}${it.locked ? ', закреплено' : ''}</p>
      </div>
    </div>
    <p class="flavor">${FLAVOR[it.base] || ''}</p>
    <dl class="facts">${facts}</dl>
    ${relic}${aff ? `<ul class="aff">${aff}</ul>` : ''}${inf}
    ${eq ? '' : diffTable(it, cur)}
    ${actions}
    ${st.tab === 'forge' && !preview ? forgeHTML(it, cur) : ''}`;
  if (preview) return;
  $('g-on') && ($('g-on').onclick = () => { equipItem(inv, it); it.isNew = false; sfx.pick(); render(); });
  $('g-off') && ($('g-off').onclick = () => { unequip(inv, it.slot); sfx.ui(); render(); });
  $('g-lock').onclick = () => { it.locked = !it.locked; sfx.ui(); render(); };
  $('g-salv') && ($('g-salv').onclick = () => { if (salvage(inv, it, cur.salvageMul)) { sfx.ui(); st.sel = null; writeSave(save); render(); } });
  if (st.tab === 'forge') bindForge(it, cur);
}

function forgeHTML(it, cur) {
  if (!st.forge) return '<div class="forge off"><h4>Кузня</h4><p>Горн доступен в Древе Гесперид и у очага Гестии.</p></div>';
  const save = G.save, base = BASES[it.base];
  const capped = it.up >= cur.upCap, uc = scaledUpgradeCost(it, cur);
  let h = `<div class="forge"><h4>Кузня</h4>
    <button id="f-up" ${capped || !canPay(save, uc) ? 'disabled' : ''}>${capped ? `Предел +${cur.upCap}` : `Улучшить до +${it.up + 1}`}</button>
    <p class="cost">${capped ? (cur.upCap < 10 ? 'Предел поднимает узел «Горн Гефеста»' : 'Максимум') : costLine(uc)}</p>`;
  if (!cur.canInfuse) h += '<p class="cost">Заточка под стихию: узел «Стихийная заточка» в ветви Гефеста.</p>';
  else h += `<p class="sub">Заточка под стихию${it.infuse ? ', заменит текущую' : ''}</p><div class="elems">` + ELEMENTS.map((e) => {
    const c = infuseCost(it, e), ok = canPay(save, c) && it.infuse !== e;
    return `<button class="elem" data-inf="${e}" style="--e:${ASPECTS[e].color}" ${ok ? '' : 'disabled'} title="${ASPECTS[e].name}: ${costText(c)}"><img alt="" src="${aspIcon(e)}"><span>${ASPECTS[e].name}</span></button>`;
  }).join('') + '</div>';
  if (cur.canRoot) h += '<p class="sub">Корневое усиление</p><div class="roots">' + Object.entries(ROOTS).filter(([, r]) => (r.slot === 'weapon') === (base.slot === 'weapon')).map(([id, r]) => {
    const c = infuseCost(it, 'root:' + id), ok = canPay(save, c) && it.infuse !== 'root:' + id;
    return `<button class="root" data-root="${id}" ${ok ? '' : 'disabled'}><b>${r.name}</b><span>${r.desc}</span></button>`;
  }).join('') + `</div><p class="cost">${costLine(infuseCost(it, 'root:x'))}</p>`;
  return h + '</div>';
}
const costLine = (c) => Object.entries(c).map(([k, v]) => {
  const have = k === 'ash' ? G.save.ash : G.save.inv.mats[k] || 0;
  return `<span class="${have >= v ? '' : 'lack'}">${v} ${k === 'ash' ? 'пепла' : RESOURCES[k].name.toLowerCase()} (есть ${Math.floor(have)})</span>`;
}).join(', ');
function bindForge(it, cur) {
  const save = G.save;
  $('f-up') && ($('f-up').onclick = () => { if (upgrade(save, it, cur) === 'ok') { sfx.pick(); writeSave(save); render(); } });
  for (const b of document.querySelectorAll('#gear-detail .elem')) b.onclick = () => { if (infuse(save, it, b.dataset.inf) === 'ok') { sfx.pick(); writeSave(save); render(); } };
  for (const b of document.querySelectorAll('#gear-detail .root')) b.onclick = () => { if (infuse(save, it, 'root:' + b.dataset.root) === 'ok') { sfx.pick(); writeSave(save); render(); } };
}
const scaleY = (y, m) => { const o = {}; for (const k in y) o[k] = Math.max(1, Math.round(y[k] * m)); return o; };

function resourcesHTML() {
  const inv = G.save.inv;
  const use = { bone: 'улучшение до +3', resin: 'улучшение +4…+6, заточка', shard: 'улучшение +7…+9, корни', heart: '+10 и корневые усиления' };
  return `<section class="restab">${RES_ORDER.map((k) => {
    const R = RESOURCES[k];
    return `<article class="resrow" style="--c:${R.color}"><img alt="" src="${resIcon(k)}"><div><h3>${R.name}</h3><p>${R.desc}</p>${use[k] ? `<p class="mu">Нужна для: ${use[k]}</p>` : '<p class="mu">Нужна для заточки под эту стихию</p>'}</div><b>${inv.mats[k] || 0}</b></article>`;
  }).join('')}</section>`;
}

function codexHTML() {
  const inv = G.save.inv, cx = inv.codex || {};
  const bases = Object.keys(BASES).filter((b) => b !== 'x_relic');
  const relics = Object.keys(RELICS);
  const cell = (key, iconKey, name, legend) => {
    const r = cx[key];
    const seen = r !== undefined && r >= 0;
    const url = seen ? toDataURL(iconSprite(iconKey, r), 4) : toDataURL(iconSprite(iconKey, 0), 4);
    return `<figure class="cx ${seen ? 'seen r' + r : 'unseen'}" style="--r:${seen ? RARITY[r].color : '#2a2438'}"><img alt="" src="${url}"><figcaption>${seen ? (r === 3 && legend ? legend : name) : '???'}</figcaption>${seen ? `<small>${pips(r)}</small>` : ''}</figure>`;
  };
  const depth = (G.run?.floor) || Math.max(1, G.save.stats.bestFloor || 1);
  const ch = [1, 2, 3, 4, 5].map((f) => rarityChances(f));
  const found = Object.keys(cx).length, total = bases.length + relics.length;
  return `<section class="codex">
    <div class="cxhead"><h3>Найдено ${found} из ${total}</h3><p class="mu">Здесь остаются все виды вещей, что ты когда-либо находил, и лучшая найденная редкость.</p></div>
    <div class="cxgrid">${bases.map((b) => cell(b, ICON_OF[b], BASES[b].name, BASES[b].legend)).join('')}${relics.map((k) => cell('relic_' + k, 'relic_' + k, RELICS[k].name)).join('')}</div>
    <h3 class="cxsub">Шансы редкости по глубинам</h3>
    <table class="chances"><thead><tr><th>Глубина</th>${RARITY.map((R, i) => `<th style="color:${R.color}">${pips(i)} ${R.name}</th>`).join('')}</tr></thead>
    <tbody>${ch.map((row, i) => `<tr class="${i + 1 === depth ? 'cur' : ''}"><th>${['I', 'II', 'III', 'IV', 'V'][i]}</th>${row.map((p) => `<td>${(p * 100).toFixed(1)}%</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="mu">Обычный враг роняет вещь с шансом 2.5%, элита 30%, босс всегда (не ниже Героической). Узлы «Удача Тюхе» и «Подмастерье Гефеста» повышают шансы.</p>
  </section>`;
}

export function initGear() {
  addEventListener('keydown', (e) => {
    if ($('gear').hidden) return;
    if (e.code === 'Escape' || e.code === 'KeyI') { e.stopPropagation(); close(); return; }
    const inv = G.save.inv, it = inv.items.find((i) => i.uid === st.sel);
    if (!it) return;
    if (e.code === 'KeyE' && !isEquipped(inv, it)) { equipItem(inv, it); sfx.pick(); render(); }
    if (e.code === 'KeyL') { it.locked = !it.locked; render(); }
    if (e.code === 'KeyX' && !isEquipped(inv, it) && !it.locked) { salvage(inv, it, statsWith(inv.equip).salvageMul); st.sel = null; render(); }
  }, true);
}
