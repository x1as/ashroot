// Pure stat pipeline: hero base -> meta tree -> equipped items -> run boons.
// Used by the game, the inventory screen (live preview) and the balance sim.
import { HERO, WEAPONS, ROLL, loadClass } from '../data/weapons.js';
import { G } from './state.js';
import { TREE } from '../data/tree.js';
import { BOON } from '../data/boons.js';
import { BASES, WEIGHT, SLOT_MUL, AFFIXES, RELICS, ELEMENTS, itemPower } from '../data/items.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ASPECT_IDX = ['blood', 'fire', 'frost', 'storm', 'shadow'];

export function baseStats() {
  return {
    maxHp: HERO.hp, maxSta: HERO.sta, staRegen: HERO.staRegen, speed: HERO.speed,
    crit: HERO.crit, critMul: HERO.critMul, poiseDmg: 1, backstab: 0,
    dmgMul: 1, atkSpeed: 1, dmgTaken: 1, ashMul: 1, healMul: 1, findMul: 1, matMul: 1,
    flasks: HERO.flasks, flaskHeal: HERO.flaskHeal, perfectWindow: 0.14, slowmo: 0.35,
    ward: 0, wardTime: 6, chargeRate: 75, powerMul: 1, reach: 1, leech: 0, igniteChance: 0, leg: {}, stunImm: false, slowImm: false, burnImm: false, unlocked: {},
    rallyEff: 1, rallyTime: 3, atkSta: 1, dodgeCost: 1, iframeBonus: 0,
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
  s.bag += G.save?.cheatBag || 0; // test code ARMORY widens the bag so every item fits
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
    // titanic property
    if (it.tp) {
      const k = it.tp.k;
      if (k === 'aspect') { const asp = ASPECT_IDX[it.tp.n]; s.gearAspects[asp] = (s.gearAspects[asp] || 0) + 1; }
      else if (k === 'ignite') s.igniteChance += 0.12;
      else if (k === 'keen') { s.crit += 0.06; s.critMul += 0.25; }
      else if (k === 'might') s.powerMul *= 1.2;
      else if (k === 'leech') s.leech += 1 / 500;
      else if (k === 'breath') { s.maxSta += 25; s.staRegen *= 1.1; }
    }
    // divine power (flag read by combat/player; pure stat parts applied here)
    if (it.legend) {
      s.leg[it.base] = true;
      switch (it.base) {
        case 'w_dagger': s.speed *= 1.2; break;
        case 'w_great': s.powerMul *= 1.3; break;
        case 'w_cleaver': s.powerMul *= 1.25; break;
        case 'h_light': s.speed *= 1.15; break;
        case 'h_heavy': s.ward += 1; s.stunImm = true; break;
        case 'c_light': s.ward += 2; s.wardTime *= 0.5; break;
        case 'c_heavy': s.slowImm = true; s.burnImm = true; s.armor += 15; break;
        case 'g_medium': s.powerMul *= 1.4; break;
        case 'g_heavy': s.chargeRate *= 1.4; break;
        case 'b_light': s.perfectWindow *= 2; s.dodgeCost *= 0.7; break;
        case 'b_medium': s.cards += 1; break;
        case 'b_heavy': s.slowImm = true; s.ward += 1; break;
      }
    }
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
  // armour becomes bronze shields: each absorbs one blow instead of a heart and comes back after a quiet moment
  s.ward += Math.min(3, Math.floor(s.armor / 26));
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
  s.maxHp = clamp(Math.round(s.maxHp), 1, 5); // five hearts, never more
  s.ward = clamp(Math.round(s.ward), 0, 4);
  s.maxSta = Math.round(s.maxSta);
  s.flasks = Math.max(0, s.flasks);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

// equip: { slot: item | uid }, items: inventory array (when equip holds uids)
export function computeStats(metaNodes = {}, equip = {}, items = null, boons = {}) {
  return applyBoons(applyGear(applyMeta(baseStats(), metaNodes), equip, items), boons);
}
