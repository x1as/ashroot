// Loot plates (one large card per picked-up item: icon, name, rarity, key stat, comparison with what
// is worn) and a compact resource feed that merges repeated pickups into one line.
import { G } from '../game/state.js';
import { RARITY, RESOURCES, BASES, WEIGHT, RELICS, itemPower } from '../data/items.js';
import { WEAPONS, rawDps } from '../data/weapons.js';
import { itemIconURL } from '../art/items.js';
import { toDataURL } from '../engine/sprite.js';
import { SPR } from '../art/bank.js';
import { computeStats } from '../game/stats.js';

const box = () => document.getElementById('toasts') || (() => { const d = document.createElement('div'); d.id = 'toasts'; d.setAttribute('aria-live', 'polite'); document.body.appendChild(d); return d; })();
const feedBox = () => document.getElementById('matfeed') || (() => { const d = document.createElement('div'); d.id = 'matfeed'; document.body.appendChild(d); return d; })();

export function mainStat(it) {
  const b = BASES[it.base], pw = itemPower(it);
  if (b.slot === 'weapon') return `${WEAPONS[b.kind].name}, сила ×${pw.toFixed(2)}`;
  if (WEIGHT[b.kind]) return `${WEIGHT[b.kind].name} броня`;
  if (b.kind === 'relic') return RELICS[it.relic]?.name || 'Реликвия';
  return `${it.affixes.length} свойств`;
}

// what changes if this item replaces the worn one (same numbers as the inventory comparison)
export function deltaLines(it) {
  const inv = G.save.inv, boons = G.run ? G.run.boons : {};
  const cur = computeStats(G.save.nodes, inv.equip, inv.items, boons);
  const next = computeStats(G.save.nodes, { ...inv.equip, [it.slot]: it.uid }, [...inv.items.filter((i) => i.uid !== it.uid), it], boons);
  const out = [];
  const add = (label, a, b, better = 1) => { const d = Math.round(b - a); if (d) out.push({ label, d, good: d * better > 0 }); };
  add('урон/с', rawDps(WEAPONS[cur.wk]) * cur.dmgMul, rawDps(WEAPONS[next.wk]) * next.dmgMul);
  add('HP', cur.maxHp, next.maxHp); add('броня', cur.armor, next.armor); add('выносливость', cur.maxSta, next.maxSta);
  add('нагрузка', cur.load, next.load, -1);
  return out;
}

export function lootToast(it, ok) {
  const R = RARITY[it.rarity], el = document.createElement('div');
  el.className = 'toast'; el.style.setProperty('--r', R.color);
  const worn = G.save.inv.equip[it.slot] === it.uid;
  const d = ok && !worn ? deltaLines(it).slice(0, 3) : [];
  el.innerHTML = `<img alt="" src="${itemIconURL(it, 4)}">
    <div><b>${it.name}</b>
    <small><span class="pips">${'◆'.repeat(it.rarity + 1)}</span> ${R.name}, ${mainStat(it)}</small>
    ${ok ? (d.length ? `<span class="delta">${d.map((x) => `<i class="${x.good ? 'up' : 'down'}">${x.good ? '▲' : '▼'} ${x.d > 0 ? '+' : ''}${x.d} ${x.label}</i>`).join('')}</span>` : '<span class="delta"><i>в инвентаре</i></span>') : '<span class="delta"><i class="down">инвентарь полон</i></span>'}
    </div>`;
  const b = box();
  b.prepend(el);
  while (b.children.length > 3) b.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4700);
}

const feed = {};
export function matFeed(id, n) {
  const f = feedBox(), Rz = RESOURCES[id];
  let row = feed[id];
  if (!row || !row.el.isConnected) {
    const el = document.createElement('div'); el.className = 'feed';
    el.innerHTML = `<img alt="" src="${toDataURL(SPR.icon[Rz.icon], 4)}"><span></span>`;
    f.appendChild(el); row = feed[id] = { el, n: 0 };
  }
  row.n += n;
  row.el.querySelector('span').innerHTML = `<b style="color:${Rz.color}">+${row.n}</b> ${Rz.name}`;
  row.el.classList.remove('out'); row.el.classList.add('bump');
  setTimeout(() => row.el.classList.remove('bump'), 160);
  clearTimeout(row.t1); clearTimeout(row.t2);
  row.t1 = setTimeout(() => row.el.classList.add('out'), 2400);
  row.t2 = setTimeout(() => { row.el.remove(); delete feed[id]; }, 2900);
}
export function clearToasts() { box().innerHTML = ''; feedBox().innerHTML = ''; }
