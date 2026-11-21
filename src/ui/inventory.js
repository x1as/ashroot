// Equipment & inventory screen (+ forge when allowed: in the hub and at bonfires).
// 8 slots on the left, the bag in the middle, the selected item with comparison and forge on the right.
import { G } from '../game/state.js';
import { SLOTS, SLOT_BY_ID, BASES, RARITY, WEIGHT, AFFIXES, RELICS, ROOTS, ELEMENTS, ELEMENT_WEAPON, RESOURCES, RES_ORDER, itemPower, infuseCost, salvageYield } from '../data/items.js';
import { ASPECTS } from '../data/boons.js';
import { WEAPONS, ROLL, rawDps } from '../data/weapons.js';
import { SPR, heroFrames } from '../art/bank.js';
import { toDataURL } from '../engine/sprite.js';
import { sfx } from '../engine/audio.js';
import { writeSave } from '../game/save.js';
import { computeStats } from '../game/stats.js';
import { gearLook } from '../game/player.js';
import { equipItem, unequip, isEquipped, upgrade, infuse, salvage, scaledUpgradeCost, canPay, costText } from '../game/items.js';

const $ = (id) => document.getElementById(id);
const icons = {};
const iconURL = (name, s = 5) => (icons[name + s] ||= toDataURL(SPR.icon[name], s));
const FILTERS = [['all', 'Все'], ['weapon', 'Оружие'], ['armor', 'Броня'], ['acc', 'Украшения']];
let st = { sel: null, filter: 'all', forge: false, onClose: null };

const kindName = (it) => {
  const b = BASES[it.base];
  if (b.slot === 'weapon') return WEAPONS[b.kind].name;
  if (WEIGHT[b.kind]) return WEIGHT[b.kind].name + ' · ' + SLOT_BY_ID[b.slot].name.toLowerCase();
  return SLOT_BY_ID[b.slot].name;
};
const statsWith = (equip) => computeStats(G.save.nodes, equip, G.save.inv.items, G.run ? G.run.boons : {});

export function showGear(o = {}) {
  st = { sel: null, filter: 'all', forge: !!o.forge, onClose: o.onClose || null };
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
  const save = G.save, inv = save.inv, s = statsWith(inv.equip);
  $('gear-title').textContent = st.forge ? 'Снаряжение и кузня' : 'Снаряжение';
  $('gear-close').onclick = close;
  // resources
  $('gear-res').innerHTML = `<span class="res"><img alt="" src="${iconURL('ash', 3)}"><b>${Math.floor(save.ash)}</b></span>` +
    RES_ORDER.filter((k) => inv.mats[k]).map((k) => `<span class="res" title="${RESOURCES[k].name}: ${RESOURCES[k].desc}"><img alt="" src="${iconURL(RESOURCES[k].icon, 3)}"><b>${inv.mats[k]}</b></span>`).join('');
  // hero preview
  const hc = $('gear-hero'), hg = hc.getContext('2d');
  const hero = heroFrames(gearLook(inv)).idle[0];
  hg.imageSmoothingEnabled = false; hg.clearRect(0, 0, hc.width, hc.height);
  const sc = Math.floor(Math.min(hc.width / hero.w, hc.height / hero.h));
  hg.drawImage(hero.c, (hc.width - hero.w * sc) / 2, hc.height - hero.h * sc, hero.w * sc, hero.h * sc);
  // slots
  $('gear-slots').innerHTML = SLOTS.map((sl) => {
    const it = inv.items.find((i) => i.uid === inv.equip[sl.id]);
    return `<button class="slot ${it ? 'full' : ''} ${st.sel === it?.uid && it ? 'sel' : ''}" data-slot="${sl.id}" style="--r:${it ? RARITY[it.rarity].color : '#2a2438'}" title="${sl.name}">
      <img alt="" src="${iconURL(it ? BASES[it.base].icon : sl.icon)}" class="${it ? '' : 'ghosticon'}">
      ${it && it.up ? `<i class="up">+${it.up}</i>` : ''}${it && it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}
      <span>${sl.name}</span></button>`;
  }).join('');
  for (const b of $('gear-slots').querySelectorAll('.slot')) b.onclick = () => { const it = inv.items.find((i) => i.uid === inv.equip[b.dataset.slot]); st.sel = it ? it.uid : null; st.filter = b.dataset.slot === 'weapon' ? 'weapon' : ['amulet', 'ring', 'relic'].includes(b.dataset.slot) ? 'acc' : 'armor'; sfx.ui(); render(); };
  // stats
  $('gear-stats').innerHTML = [
    ['HP', s.maxHp], ['Выносливость', s.maxSta], ['Урон/с', (rawDps(WEAPONS[s.wk]) * s.dmgMul).toFixed(0)], ['Броня', Math.round(s.armor) + ` (−${Math.round((1 - 80 / (80 + s.armor)) * 100)}%)`],
    ['Крит', Math.round(s.crit * 100) + '%'], ['Нагрузка', `${Math.round(s.load)}/${Math.round(s.loadCap)} · ${ROLL[s.roll].name.toLowerCase()}`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('') +
    (Object.keys(s.gearAspects).length ? `<div class="wide"><dt>Аспекты снаряжения</dt><dd>${Object.entries(s.gearAspects).map(([a, n]) => `<span style="color:${ASPECTS[a].color}">${ASPECTS[a].name} ${n}</span>`).join(' · ')}</dd></div>` : '');
  // filters + bag
  $('gear-filters').innerHTML = FILTERS.map(([id, name]) => `<button class="chip ${st.filter === id ? 'on' : ''}" data-f="${id}">${name}</button>`).join('') + `<span class="count">${inv.items.length}/${s.bag}</span>`;
  for (const b of $('gear-filters').querySelectorAll('.chip')) b.onclick = () => { st.filter = b.dataset.f; render(); };
  const list = inv.items.filter((it) => {
    if (st.filter === 'all') return true;
    if (st.filter === 'weapon') return it.slot === 'weapon';
    if (st.filter === 'armor') return ['helm', 'chest', 'gloves', 'boots'].includes(it.slot);
    return ['amulet', 'ring', 'relic'].includes(it.slot);
  }).sort((a, b) => (isEquipped(inv, b) - isEquipped(inv, a)) || b.rarity - a.rarity || b.ilvl - a.ilvl);
  $('gear-grid').innerHTML = list.map((it) => `<button class="tile ${st.sel === it.uid ? 'sel' : ''}" data-uid="${it.uid}" style="--r:${RARITY[it.rarity].color}" title="${it.name}">
      <img alt="" src="${iconURL(BASES[it.base].icon)}">${it.up ? `<i class="up">+${it.up}</i>` : ''}${it.infuse ? `<i class="inf" style="--e:${infColor(it)}"></i>` : ''}${isEquipped(inv, it) ? '<i class="eq">E</i>' : ''}</button>`).join('') || '<p class="empty">Пусто. Предметы падают с врагов: обычные редко, элита и боссы — часто.</p>';
  for (const b of $('gear-grid').querySelectorAll('.tile')) b.onclick = () => { st.sel = b.dataset.uid; sfx.ui(); render(); };
  renderDetail(s);
}

const infColor = (it) => (it.infuse.startsWith('root:') ? '#ffb347' : ASPECTS[it.infuse].color);

function renderDetail(cur) {
  const save = G.save, inv = save.inv, el = $('gear-detail');
  const it = inv.items.find((i) => i.uid === st.sel);
  if (!it) { el.innerHTML = '<p class="hint">Выбери предмет или ячейку. Наведи на ресурс вверху, чтобы узнать, где его взять.</p>'; return; }
  const base = BASES[it.base], R = RARITY[it.rarity], pw = itemPower(it), eq = isEquipped(inv, it);
  // comparison: what changes if this item is worn instead of the current one
  const alt = { ...inv.equip, [it.slot]: it.uid };
  const ns = statsWith(alt);
  const delta = (label, a, b, fmt = (v) => Math.round(v), better = 1) => {
    const d = b - a; if (Math.abs(d) < 0.5) return '';
    const good = d * better > 0;
    return `<li class="${good ? 'good' : 'bad'}">${label} ${d > 0 ? '+' : ''}${fmt(d)}</li>`;
  };
  const cmp = eq ? '' : [
    delta('Урон/с', rawDps(WEAPONS[cur.wk]) * cur.dmgMul, rawDps(WEAPONS[ns.wk]) * ns.dmgMul),
    delta('HP', cur.maxHp, ns.maxHp), delta('Выносливость', cur.maxSta, ns.maxSta), delta('Броня', cur.armor, ns.armor),
    delta('Нагрузка', cur.load, ns.load, (v) => Math.round(v), -1),
    ns.roll !== cur.roll ? `<li class="${['light', 'medium', 'heavy'].indexOf(ns.roll) < ['light', 'medium', 'heavy'].indexOf(cur.roll) ? 'good' : 'bad'}">Перекат: ${ROLL[ns.roll].name.toLowerCase()}</li>` : '',
  ].join('');
  let main = '';
  if (base.slot === 'weapon') { const W = WEAPONS[base.kind]; main = `<p class="main">Сила оружия ×${pw.toFixed(2)} · ${W.dmgType === 'arcane' ? 'чары' : W.dmgType === 'pierce' ? 'пронзающий' : 'рубящий'}</p><p class="mu">${W.tagline}. Умение: <b>${W.skill.name}</b> — ${W.skill.desc}</p>`; }
  else if (WEIGHT[base.kind]) { const Wt = WEIGHT[base.kind]; main = `<p class="main">Броня ${Math.round(Wt.armor * (base.slot === 'chest' ? 1.6 : base.slot === 'helm' ? 1 : base.slot === 'gloves' ? 0.8 : 0.9) * pw)} · вес ${(Wt.weight * (base.slot === 'chest' ? 1.6 : base.slot === 'helm' ? 1 : base.slot === 'gloves' ? 0.8 : 0.9)).toFixed(1)}</p>`; }
  else if (base.kind === 'relic') main = `<p class="main relic">${RELICS[it.relic].name}: ${RELICS[it.relic].desc}</p>`;
  const aff = it.affixes.map((a) => `<li>${AFFIXES[a.id].name(Math.round(a.v * (1 + 0.04 * it.up)))}</li>`).join('');
  let inf = '';
  if (it.infuse) {
    if (it.infuse.startsWith('root:')) { const r = ROOTS[it.infuse.slice(5)]; inf = `<p class="inf-line" style="color:#ffb347">◆ ${r.name}: ${r.desc}</p>`; }
    else { const A = ASPECTS[it.infuse]; inf = `<p class="inf-line" style="color:${A.color}">◆ Заточка: ${A.name} (+1 к аспекту)${base.slot === 'weapon' ? ' · ' + ELEMENT_WEAPON[it.infuse] : ''}</p>`; }
  }
  // forge
  let forge = '';
  if (st.forge) {
    const capped = it.up >= cur.upCap;
    const uc = scaledUpgradeCost(it, cur);
    forge += `<div class="forge"><h4>Кузня</h4>
      <button id="f-up" ${capped || !canPay(save, uc) ? 'disabled' : ''}>${capped ? `Предел +${cur.upCap}` : `Улучшить до +${it.up + 1}`}</button>
      <p class="cost">${capped ? (cur.upCap < 10 ? 'Предел поднимается узлом «Жар горна» в ветви Горн' : 'Максимум') : costText(uc)}</p>`;
    if (!cur.canInfuse) forge += '<p class="cost">Заточка под элемент: открой узел «Стихийная заточка» (Горн)</p>';
    else {
      forge += `<p class="sub">Заточка под элемент${it.infuse ? ' (заменит текущую)' : ''}</p><div class="elems">` + ELEMENTS.map((e) => {
        const c = infuseCost(it, e), ok = canPay(save, c) && it.infuse !== e;
        return `<button class="elem" data-inf="${e}" style="--e:${ASPECTS[e].color}" ${ok ? '' : 'disabled'} title="${ASPECTS[e].name}: ${costText(c)}"><img alt="" src="${iconURL(ASPECTS[e].icon, 4)}"></button>`;
      }).join('') + '</div><p class="cost">' + costText(infuseCost(it, 'fire')).replace(/эссенция пламени/, 'эссенция стихии') + '</p>';
    }
    if (cur.canRoot) {
      const roots = Object.entries(ROOTS).filter(([, r]) => (r.slot === 'weapon') === (base.slot === 'weapon'));
      forge += '<p class="sub">Корневое усиление</p><div class="roots">' + roots.map(([id, r]) => {
        const c = infuseCost(it, 'root:' + id), ok = canPay(save, c) && it.infuse !== 'root:' + id;
        return `<button class="root" data-root="${id}" ${ok ? '' : 'disabled'}><b>${r.name}</b><span>${r.desc}</span></button>`;
      }).join('') + `</div><p class="cost">${costText(infuseCost(it, 'root:x'))}</p>`;
    } else if (cur.canInfuse) forge += '<p class="cost">Корневые усиления: узел «Корневое слияние» (Горн)</p>';
    if (!eq) forge += `<button id="f-salv" class="ghost danger">Разобрать: ${costText(scaleY(salvageYield(it), cur.salvageMul))}</button>`;
    forge += '</div>';
  } else forge = '<p class="hint">Улучшать и затачивать можно в Древе и у костра.</p>';
  el.innerHTML = `
    <p class="eyebrow" style="color:${R.color}">${R.name} · ${kindName(it)} · глубина ${it.ilvl}</p>
    <h3 style="color:${R.color}">${it.name}${it.up ? ' +' + it.up : ''}</h3>
    ${main}${aff ? `<ul class="aff">${aff}</ul>` : ''}${inf}
    ${cmp ? `<ul class="cmp">${cmp}</ul>` : ''}
    <div class="row">${eq ? (it.slot !== 'weapon' ? '<button id="g-off" class="ghost">Снять</button>' : '<span class="mu">Надето</span>') : '<button id="g-on">Надеть</button>'}</div>
    ${forge}`;
  $('g-on') && ($('g-on').onclick = () => { equipItem(inv, it); sfx.pick(); render(); });
  $('g-off') && ($('g-off').onclick = () => { unequip(inv, it.slot); sfx.ui(); render(); });
  $('f-up') && ($('f-up').onclick = () => { if (upgrade(save, it, cur) === 'ok') { sfx.pick(); writeSave(save); render(); } });
  $('f-salv') && ($('f-salv').onclick = () => { if (salvage(inv, it, cur.salvageMul)) { sfx.ui(); st.sel = null; writeSave(save); render(); } });
  for (const b of el.querySelectorAll('.elem')) b.onclick = () => { if (infuse(save, it, b.dataset.inf) === 'ok') { sfx.pick(); writeSave(save); render(); } };
  for (const b of el.querySelectorAll('.root')) b.onclick = () => { if (infuse(save, it, 'root:' + b.dataset.root) === 'ok') { sfx.pick(); writeSave(save); render(); } };
}
const scaleY = (y, m) => { const o = {}; for (const k in y) o[k] = Math.max(1, Math.round(y[k] * m)); return o; };

export function initGear() {
  addEventListener('keydown', (e) => { if (!$('gear').hidden && (e.code === 'Escape' || e.code === 'KeyI')) { e.stopPropagation(); close(); } }, true);
}
