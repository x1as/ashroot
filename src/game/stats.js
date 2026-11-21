// Pure stat pipeline: class base -> meta tree -> run boons. Used by the game and the balance sim.
import { CLASSES } from '../data/classes.js';
import { TREE } from '../data/tree.js';
import { BOON } from '../data/boons.js';

export function baseStats(clsId) {
  const c = CLASSES[clsId];
  return {
    cls: clsId,
    maxHp: c.hp, maxSta: c.sta, staRegen: c.staRegen, speed: c.speed,
    dodgeCost: c.dodge.cost, dodgeDist: c.dodge.dist, dodgeTime: c.dodge.time, iframe: c.dodge.iframe,
    crit: c.crit, critMul: c.critMul, poiseDmg: c.poiseDmg, backstab: c.backstab || 0,
    dmgMul: 1, atkSpeed: 1, dmgTaken: 1, ashMul: 1, healMul: 1,
    flasks: 3, flaskHeal: 0.4, skillCd: 1, perfectWindow: 0.14, slowmo: 0.35,
    rallyEff: c.rally ?? 0.3, rallyTime: 1.6,
    rerolls: 0, cards: 3, startBoon: false, startWith: [], lastStand: false, unstoppable: false,
    hyperArmor: 0, slamR: 1, projSpeed: 1, arcaneShield: false, archmage: false,
    chargeMul: 1, volleyExtra: 0, chargeMove: 0, chargedCrit: 0, hawkeye: false, bladeDance: false,
    staFree: false, hpCost: 0, enemySpeed: 1, enemyHp: 1,
  };
}

export function applyMeta(s, metaNodes) {
  for (const n of TREE) {
    const r = metaNodes[n.id] || 0;
    if (!r) continue;
    if (n.br !== 'trunk' && n.br !== s.cls) continue;
    n.apply(s, r);
  }
  return s;
}

export function applyBoons(s, boons) {
  for (const id in boons) {
    const b = BOON[id];
    if (b && b.stat) b.stat(s, boons[id]);
  }
  s.maxHp = Math.round(s.maxHp);
  s.flasks = Math.max(0, s.flasks);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

export function computeStats(clsId, metaNodes = {}, boons = {}) {
  return applyBoons(applyMeta(baseStats(clsId), metaNodes), boons);
}
