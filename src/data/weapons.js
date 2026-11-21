// One hero, five WEAPON TYPES. The weapon decides the moveset, damage type and skill
// (the old classes live on as weapon archetypes, so the rock-paper-scissors matchups remain).
// Timings follow pixel-art-animator: windup -> strike (~30-80ms) -> follow-through -> recovery.
// dmgType: slash | pierce | arcane. Flat enemy ARMOR punishes many small hits,
// SHIELDS block slash/pierce from the front, RESISTS cut one type — no plain HP multiplication.
// rally = share of dealt damage that heals back recently lost HP (Bloodborne-style), per weapon.

export const HERO = {
  name: 'Геракл', title: 'Пепел с костра Эты',
  hp: 100, sta: 150, staRegen: 62, speed: 90,
  crit: 0.08, critMul: 2.0,
  flasks: 3, flaskHeal: 0.4,
  loadCap: 30,
  accent: ['#ff8f3a', '#b5481c'], // ember scarf; an infused weapon recolours it
};

// equip load -> roll (souls-like): light / medium / heavy
export const ROLL = {
  light: { name: 'Лёгкая', cost: 16, dist: 66, time: 0.30, iframe: 0.26, speed: 1.05 },
  medium: { name: 'Средняя', cost: 20, dist: 60, time: 0.32, iframe: 0.24, speed: 1 },
  heavy: { name: 'Тяжёлая', cost: 27, dist: 48, time: 0.36, iframe: 0.20, speed: 0.9, poise: true },
};
export const loadClass = (ratio) => (ratio < 0.35 ? 'light' : ratio < 0.7 ? 'medium' : 'heavy');

export const WEAPONS = {
  sword: {
    name: 'Ксифос', tagline: 'Меч гоплита: баланс скорости и широких дуг',
    sprite: 'sword', dmgType: 'slash', poiseDmg: 1.2, rally: 0.3,
    combo: [
      { dmg: 17, wind: 0.12, act: 0.06, rec: 0.18, range: 31, arc: 150, lunge: 20, sta: 12 },
      { dmg: 17, wind: 0.10, act: 0.06, rec: 0.18, range: 31, arc: 150, lunge: 20, sta: 12 },
      { dmg: 32, wind: 0.20, act: 0.08, rec: 0.30, range: 35, arc: 220, lunge: 28, sta: 18, finisher: true },
    ],
    skill: { id: 'spin', name: 'Вихрь Эола', cd: 5, desc: 'Вращение на 360°: урон вокруг, неуязвимость в начале.' },
    strong: 'неупокоенные, псы Гекаты', weak: 'гоплиты спереди',
  },
  dagger: {
    name: 'Махайры', tagline: 'Парные клинки: скорость, фланг, криты',
    sprite: 'dagger', dmgType: 'slash', poiseDmg: 0.6, rally: 0.4, critBonus: 0.06, backstab: 0.5,
    combo: [
      { dmg: 10, wind: 0.07, act: 0.05, rec: 0.13, range: 24, arc: 120, lunge: 22, sta: 6 },
      { dmg: 10, wind: 0.06, act: 0.05, rec: 0.13, range: 24, arc: 120, lunge: 22, sta: 6 },
      { dmg: 22, wind: 0.11, act: 0.06, rec: 0.24, range: 28, arc: 180, lunge: 32, sta: 10, finisher: true },
    ],
    skill: { id: 'shadowstep', name: 'Шаг Гермеса', cd: 4, desc: 'Рывок сквозь врагов: урон, неуязвимость, следующий удар — крит.' },
    strong: 'ламии, спарты, отпрыски Гидры', weak: 'гоплиты (броня режет мелкие удары)',
  },
  greatsword: {
    name: 'Палица', tagline: 'Оливковая палица Геракла: тяжёлые удары, пробой стойки',
    sprite: 'club', dmgType: 'slash', poiseDmg: 2.2, rally: 0.14, guardBreak: true, critMul: -0.2,
    combo: [
      { dmg: 33, wind: 0.30, act: 0.08, rec: 0.30, range: 38, arc: 160, lunge: 14, sta: 22, hyper: true },
      { dmg: 48, wind: 0.36, act: 0.10, rec: 0.40, range: 42, arc: 210, lunge: 24, sta: 26, hyper: true, finisher: true },
    ],
    skill: { id: 'slam', name: 'Удар Колебателя Земли', cd: 7, desc: 'Прыжок и удар о землю: урон по площади, ломает стойку.' },
    strong: 'гоплиты, неупокоенные', weak: 'псы Гекаты (быстрые), ламии (телепорт)',
  },
  staff: {
    name: 'Посох', tagline: 'Чары Гекаты: сквозь броню и щиты',
    sprite: 'staff', dmgType: 'arcane', poiseDmg: 0.8, rally: 0.22, ignoreArmor: true,
    bolt: { dmg: 18, wind: 0.10, rec: 0.26, speed: 240, life: 1.0, r: 3, sta: 11, homing: 1.6 },
    skill: { id: 'blink', name: 'Тропа Гекаты', cd: 5, desc: 'Телепорт, на старом месте — взрыв чар.' },
    strong: 'гоплиты, спарты', weak: 'ламии (сопротивление чарам), псы Гекаты',
  },
  bow: {
    name: 'Лук', tagline: 'Дар Аполлона: дальность, натяг, пробивание',
    sprite: 'bow', dmgType: 'pierce', poiseDmg: 0.9, rally: 0.22, critBonus: 0.02,
    arrow: { dmg: 12, wind: 0.06, rec: 0.22, speed: 300, sta: 7, chargeTime: 0.6, chargedDmg: 36, chargedSpeed: 430, chargedPierce: 2, chargedSta: 13, moveWhileCharging: 0.5 },
    skill: { id: 'volley', name: 'Залп Аполлона', cd: 6, desc: 'Отскок назад и веер из 7 стрел.' },
    strong: 'ламии, неупокоенные, отпрыски Гидры', weak: 'спарты (стрелы сквозь рёбра), гоплиты без натяга',
  },
};
export const WEAPON_ORDER = ['sword', 'dagger', 'greatsword', 'staff', 'bow'];

// Raw sustained DPS of the basic attack (balance sim + item card).
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
export function hitList(c) {
  if (c.combo) return c.combo.map((a) => a.dmg);
  if (c.bolt) return [c.bolt.dmg];
  return [c.arrow.dmg, c.arrow.chargedDmg];
}
