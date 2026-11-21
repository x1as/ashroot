// Pure stat pipeline: hero base -> meta tree -> equipped items -> run boons.
// Used by the game, the inventory screen (live preview) and the balance sim.
import { HERO, WEAPONS, ROLL, loadClass } from '../data/weapons.js';
import { TREE } from '../data/tree.js';
import { BOON } from '../data/boons.js';
import { BASES, WEIGHT, SLOT_MUL, AFFIXES, RELICS, ELEMENTS, itemPower } from '../data/items.js';

export function baseStats() {
  return {
    maxHp: HERO.hp, maxSta: HERO.sta, staRegen: HERO.staRegen, speed: HERO.speed,
    crit: HERO.crit, critMul: HERO.critMul, poiseDmg: 1, backstab: 0,
    dmgMul: 1, atkSpeed: 1, dmgTaken: 1, ashMul: 1, healMul: 1, findMul: 1, matMul: 1,
    flasks: HERO.flasks, flaskHeal: HERO.flaskHeal, skillCd: 1, perfectWindow: 0.14, slowmo: 0.35,
    rallyEff: 1, rallyTime: 1.6, atkSta: 1, dodgeCost: 1, iframeBonus: 0,
    counterMul: 1, counterWindow: 0,
    armor: 0, load: 0, loadCap: HERO.loadCap,
    rerolls: 0, cards: 3, startBoon: false, startWith: [], lastStand: false, unstoppable: false,
    killHeal: 0, deathKeep: 0.5, bossAsh: 0, resoShift: 0, tailwind: false, bladeDance: false,
    upCap: 5, forgeCost: 1, canInfuse: false, canRoot: false, bag: 40, salvageMul: 1, rarityBoost: false,
    hyperArmor: 0, slamR: 1, projSpeed: 1, chargeMul: 1, volleyExtra: 0, chargeMove: 0, chargedCrit: 0,
    staFree: false, hpCost: 0, enemySpeed: 1, enemyHp: 1,
    // gear-derived
    wk: 'sword', weaponPower: 1, element: null, roots: {}, gearAspects: {}, critBleed: 0, emberTrail: false,
  };
}

export function applyMeta(s, metaNodes) {
  for (const n of TREE) {
    const r = metaNodes[n.id] || 0;
    if (r) n.apply(s, r);
  }
  return s;
}

export function applyGear(s, equip, items) {
  const byUid = items ? Object.fromEntries(items.map((i) => [i.uid, i])) : {};
  for (const slot in equip || {}) {
    const it = typeof equip[slot] === 'object' ? equip[slot] : byUid[equip[slot]];
    if (!it) continue;
    const base = BASES[it.base], pw = itemPower(it);
    if (base.slot === 'weapon') { s.wk = base.kind; s.weaponPower = pw; s.dmgMul *= pw; }
    else if (WEIGHT[base.kind]) {
      s.armor += WEIGHT[base.kind].armor * SLOT_MUL[base.slot] * pw;
      s.load += WEIGHT[base.kind].weight * SLOT_MUL[base.slot];
    } else if (base.kind === 'relic' && it.relic && RELICS[it.relic]) RELICS[it.relic].apply(s);
    for (const a of it.affixes || []) AFFIXES[a.id]?.apply(s, Math.round(a.v * (1 + 0.04 * it.up)));
    if (it.infuse) {
      if (it.infuse.startsWith('root:')) s.roots[it.infuse.slice(5)] = true;
      else if (ELEMENTS.includes(it.infuse)) {
        s.gearAspects[it.infuse] = (s.gearAspects[it.infuse] || 0) + 1;
        if (base.slot === 'weapon') s.element = it.infuse;
      }
    }
  }
  // weapon type modifiers
  const W = WEAPONS[s.wk];
  s.crit += W.critBonus || 0;
  s.critMul += W.critMul || 0;
  s.poiseDmg *= W.poiseDmg;
  s.backstab += W.backstab || 0;
  s.rallyEff *= W.rally;
  if (s.element === 'shadow') { s.crit += 0.08; s.critMul += 0.3; }
  if (s.roots.wind) { s.dodgeCost *= 0.75; s.perfectWindow += 0.03; }
  // armour: diminishing returns; equip load decides the roll
  s.dmgTaken *= 80 / (80 + s.armor);
  s.loadRatio = s.load / s.loadCap;
  s.roll = loadClass(s.loadRatio);
  const RL = ROLL[s.roll];
  s.dodgeCost = RL.cost * s.dodgeCost;
  s.dodgeDist = RL.dist; s.dodgeTime = RL.time; s.iframe = RL.iframe + s.iframeBonus;
  s.speed *= RL.speed;
  s.heavyPoise = !!RL.poise;
  return s;
}

export function applyBoons(s, boons) {
  for (const id in boons) {
    const b = BOON[id];
    if (b && b.stat) b.stat(s, boons[id]);
  }
  s.maxHp = Math.round(s.maxHp);
  s.maxSta = Math.round(s.maxSta);
  s.flasks = Math.max(0, s.flasks);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

// equip: { slot: item | uid }, items: inventory array (when equip holds uids)
export function computeStats(metaNodes = {}, equip = {}, items = null, boons = {}) {
  return applyBoons(applyGear(applyMeta(baseStats(), metaNodes), equip, items), boons);
}
