import { BASE_WEAPONS } from '../data/tree.js';
// Inventory, loot generation and the forge (upgrade / infuse / salvage). Mutates G.save.inv.
import { TITAN_KEYS } from '../data/items.js';
import { BASES, RARITY, AFFIXES, AFFIX_POOL, RELICS, SUFFIX, LEGEND_SUFFIX, upgradeCost, infuseCost, salvageYield, RESOURCES } from '../data/items.js';

let uidSeq = Date.now() % 1e6;
const uid = () => (uidSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function newInventory() {
  // Heracles rises from the pyre with a mortal's kit
  const sword = makeItem('w_sword', 1, 0, { name: 'Ксифос с костра', affixes: [] });
  const hood = makeItem('h_light', 1, 0, { name: 'Пилос странника', affixes: [] });
  const coat = makeItem('c_light', 1, 0, { name: 'Опалённый хитон', affixes: [] });
  return { items: [sword, hood, coat], mats: { bone: 6 }, equip: { weapon: sword.uid, helm: hood.uid, chest: coat.uid }, codex: { w_sword: 0, h_light: 0, c_light: 0 } };
}

export function makeItem(baseId, ilvl, rarity, o = {}) {
  const base = BASES[baseId];
  const it = { uid: uid(), base: baseId, slot: base.slot, rarity, ilvl, up: 0, infuse: null, affixes: [], name: o.name || base.name };
  if (!o.name && rarity > 0) it.name = rarity === 3 ? base.legend || base.name + LEGEND_SUFFIX : base.name + pickOne(SUFFIX);
  if (base.kind === 'relic') it.relic = o.relic || pickOne(Object.keys(RELICS));
  if (rarity === 2) it.tp = o.tp || { k: pickOne(TITAN_KEYS), n: Math.floor(Math.random() * 5) };
  if (rarity === 3 && base.kind !== 'relic') it.legend = true;
  if (o.affixes) it.affixes = o.affixes;
  else {
    const pool = base.slot === 'weapon' ? AFFIX_POOL.weapon : base.kind === 'acc' || base.kind === 'relic' ? AFFIX_POOL.acc : AFFIX_POOL.armor;
    const ids = [...pool].sort(() => Math.random() - 0.5).slice(0, RARITY[rarity].affixes + (base.kind === 'acc' ? 1 : 0));
    it.affixes = ids.map((id) => ({ id, v: Math.max(1, Math.round(rnd(...AFFIXES[id].r) * (1 + 0.15 * (ilvl - 1)))) }));
  }
  return it;
}

// loot roll: floor-scaled rarity; `min` guarantees a floor (bosses)
// rarity weights per depth — also shown to the player in the Летопись tab
export function rarityWeights(ilvl, min = 0, boost = false) {
  const w = [Math.max(10, 62 - ilvl * 8), 28 + ilvl, 8 + ilvl * 3, 2 + ilvl * 1.5];
  if (boost) { w[0] *= 0.6; w[2] *= 1.4; w[3] *= 1.4; }
  for (let i = 0; i < min; i++) w[i] = 0;
  return w;
}
export function rarityChances(ilvl, min = 0, boost = false) { const w = rarityWeights(ilvl, min, boost), t = w.reduce((a, b) => a + b, 0); return w.map((x) => x / t); }
// weapon types drop only once unlocked on the Tree (sword, club, bow from the start)
export function rollLoot(ilvl, min = 0, boost = false, unlocked = {}) {
  const w = rarityWeights(ilvl, min, boost);
  let r = Math.random() * w.reduce((a, b) => a + b, 0), rarity = 0;
  for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) { rarity = i; break; } }
  const keys = Object.keys(BASES).filter((k) => (k !== 'x_relic' || rarity >= 1) && (BASES[k].slot !== 'weapon' || BASE_WEAPONS.includes(BASES[k].kind) || unlocked[BASES[k].kind]));
  const baseId = Math.random() < 0.08 && rarity >= 1 ? 'x_relic' : pickOne(keys);
  return makeItem(baseId, ilvl, Math.max(rarity, baseId === 'x_relic' ? 1 : 0));
}

// ---------------- inventory ops ----------------
export const findItem = (inv, id) => inv.items.find((i) => i.uid === id);
export const equipped = (inv, slot) => findItem(inv, inv.equip[slot]);
export const isEquipped = (inv, it) => inv.equip[it.slot] === it.uid;
export function equipItem(inv, it) { inv.equip[it.slot] = it.uid; }
export function unequip(inv, slot) { if (slot !== 'weapon') inv.equip[slot] = null; }

export function addItem(inv, it, bag) {
  if (inv.items.length >= bag) {
    // full: auto-salvage the worst unequipped common to make room
    const junk = inv.items.filter((i) => !isEquipped(inv, i) && i.rarity === 0 && i.up === 0).sort((a, b) => a.ilvl - b.ilvl)[0];
    if (!junk) return false;
    salvage(inv, junk, 1);
  }
  it.isNew = true;
  inv.items.push(it);
  // codex: remember the best rarity ever found per item type (and relic)
  inv.codex ||= {};
  const ck = it.base === 'x_relic' ? 'relic_' + it.relic : it.base;
  inv.codex[ck] = Math.max(inv.codex[ck] ?? -1, it.rarity);
  return true;
}
export function addMats(inv, mats) { for (const k in mats) inv.mats[k] = (inv.mats[k] || 0) + mats[k]; }

export function canPay(save, cost) {
  for (const k in cost) {
    const have = k === 'ash' ? save.ash : save.inv.mats[k] || 0;
    if (have < cost[k]) return false;
  }
  return true;
}
function pay(save, cost) { for (const k in cost) { if (k === 'ash') save.ash -= cost[k]; else save.inv.mats[k] -= cost[k]; } }

export function scaledUpgradeCost(it, s) {
  const c = upgradeCost(it);
  c.ash = Math.round(c.ash * (s?.forgeCost || 1));
  return c;
}
export function upgrade(save, it, s) {
  if (it.up >= (s?.upCap || 5)) return 'cap';
  const cost = scaledUpgradeCost(it, s);
  if (!canPay(save, cost)) return 'cost';
  pay(save, cost); it.up++;
  return 'ok';
}
export function infuse(save, it, what) {
  const cost = infuseCost(it, what);
  if (!canPay(save, cost)) return 'cost';
  pay(save, cost); it.infuse = what;
  return 'ok';
}
export function salvage(inv, it, mul = 1) {
  if (isEquipped(inv, it) || it.locked) return null;
  const y = salvageYield(it);
  for (const k in y) y[k] = Math.max(1, Math.round(y[k] * mul));
  addMats(inv, y);
  inv.items = inv.items.filter((i) => i !== it);
  return y;
}
export const costText = (cost) => Object.entries(cost).map(([k, v]) => `${v} ${k === 'ash' ? 'пепла' : RESOURCES[k].name.toLowerCase()}`).join(' · ');
