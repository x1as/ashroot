// rally = share of dealt damage that heals back recently lost HP (Bloodborne-style).
// Normalised per class: big hitters and ranged get less, so aggression is rewarded, face-tanking is not.
// Four classes = four corners of a non-transitive matrix (see data/enemies.js MATCHUPS).
// Timings follow pixel-art-animator: windup -> strike (~30-80ms) -> follow-through -> recovery.
// dmgType: slash | pierce | arcane. Flat enemy ARMOR punishes many small hits (rogue),
// SHIELDS block slash/pierce from the front, RESISTS cut one type — no plain HP multiplication.

export const CLASSES = {
  rogue: {
    name: 'Разбойник', tagline: 'Скорость, фланг, криты',
    accent: ['#b4ec5f', '#5f9a2e'],
    hp: 85, sta: 100, staRegen: 50, speed: 94, rally: 0.4,
    dodge: { cost: 16, dist: 64, time: 0.30, iframe: 0.24 },
    crit: 0.12, critMul: 2.0, poiseDmg: 0.6,
    backstab: 0.5, // +50% from behind
    weapon: 'dagger', dmgType: 'slash',
    combo: [
      { dmg: 10, wind: 0.07, act: 0.05, rec: 0.13, range: 22, arc: 110, lunge: 20, sta: 6 },
      { dmg: 10, wind: 0.06, act: 0.05, rec: 0.13, range: 22, arc: 110, lunge: 20, sta: 6 },
      { dmg: 22, wind: 0.11, act: 0.06, rec: 0.24, range: 26, arc: 170, lunge: 30, sta: 10, finisher: true },
    ],
    skill: { name: 'Теневой шаг', cd: 4, desc: 'Рывок сквозь врагов: урон, неуязвимость, следующий удар — крит.' },
    strong: 'культисты, стрелки, гнойники', weak: 'щитоносцы (броня режет мелкие удары)',
  },
  warrior: {
    name: 'Воин', tagline: 'Тяжёлые удары, пробой стойки',
    accent: ['#ff6a3d', '#9c2f17'],
    hp: 125, sta: 100, staRegen: 40, speed: 80, rally: 0.14,
    dodge: { cost: 26, dist: 54, time: 0.36, iframe: 0.24 },
    crit: 0.05, critMul: 1.8, poiseDmg: 2.2,
    guardBreak: true, // heavy hits ignore shields
    weapon: 'greatsword', dmgType: 'slash',
    combo: [
      { dmg: 33, wind: 0.30, act: 0.08, rec: 0.30, range: 34, arc: 150, lunge: 14, sta: 20, hyper: true },
      { dmg: 48, wind: 0.36, act: 0.10, rec: 0.40, range: 38, arc: 200, lunge: 24, sta: 24, hyper: true, finisher: true },
    ],
    skill: { name: 'Сокрушение', cd: 7, desc: 'Прыжок и удар о землю: урон по площади, ломает стойку.' },
    strong: 'щитоносцы, гнильцы', weak: 'падальщики (быстрые), культисты (телепорт)',
  },
  mage: {
    name: 'Маг', tagline: 'Чары сквозь броню и щиты',
    accent: ['#b88cff', '#6a44c2'],
    hp: 64, sta: 90, staRegen: 46, speed: 86, rally: 0.22,
    dodge: { cost: 22, dist: 58, time: 0.32, iframe: 0.24 },
    crit: 0.08, critMul: 2.0, poiseDmg: 0.8,
    weapon: 'staff', dmgType: 'arcane', ignoreArmor: true,
    bolt: { dmg: 18, wind: 0.10, rec: 0.26, speed: 240, life: 1.0, r: 3, sta: 11, homing: 1.6 },
    skill: { name: 'Скачок', cd: 5, desc: 'Телепорт, на старом месте — взрыв чар.' },
    strong: 'щитоносцы, скелеты', weak: 'культисты (сопротивление чарам), падальщики',
  },
  archer: {
    name: 'Лучник', tagline: 'Дальность, натяг, пробивание',
    accent: ['#63e6cf', '#2f8f84'],
    hp: 74, sta: 95, staRegen: 48, speed: 90, rally: 0.22,
    dodge: { cost: 18, dist: 62, time: 0.30, iframe: 0.24 },
    crit: 0.10, critMul: 2.0, poiseDmg: 0.9,
    weapon: 'bow', dmgType: 'pierce',
    arrow: { dmg: 12, wind: 0.06, rec: 0.22, speed: 300, sta: 7, chargeTime: 0.6, chargedDmg: 36, chargedSpeed: 430, chargedPierce: 2, chargedSta: 13, moveWhileCharging: 0.5 },
    skill: { name: 'Залп', cd: 6, desc: 'Отскок назад и веер из 7 стрел.' },
    strong: 'культисты, гнильцы, гнойники', weak: 'скелеты (стрелы проходят сквозь рёбра), щитоносцы без натяга',
  },
};

export const CLASS_ORDER = ['rogue', 'warrior', 'mage', 'archer'];

// Raw sustained DPS of the basic attack (used by the balance sim and the class card).
export function rawDps(c) {
  if (c.combo) {
    const t = c.combo.reduce((s, a) => s + a.wind + a.act + a.rec, 0);
    const d = c.combo.reduce((s, a) => s + a.dmg, 0);
    return d / t;
  }
  if (c.bolt) return c.bolt.dmg / (c.bolt.wind + c.bolt.rec);
  if (c.arrow) {
    const tap = c.arrow.dmg / (c.arrow.wind + c.arrow.rec);
    const ch = c.arrow.chargedDmg / (c.arrow.chargeTime + c.arrow.wind + c.arrow.rec);
    return Math.max(tap, ch);
  }
  return 0;
}
// Damage of one representative hit (matters vs flat armor).
export function hitList(c) {
  if (c.combo) return c.combo.map((a) => a.dmg);
  if (c.bolt) return [c.bolt.dmg];
  return [c.arrow.dmg, c.arrow.chargedDmg];
}
