// One hero, TEN weapon types. The weapon decides the moveset, damage type, how you move while swinging
// and the charged technique (hold attack: stamina pours into the weapon). No separate skill button.
// Archetypes borrowed from action games, named the Greek way: xiphos, machairai, club, staff, bow,
// dory spear, aspis + xiphos, labrys, pelekys great axe and the titan's cleaver (a slab-of-iron greatblade).
// Timings follow pixel-art-animator: windup -> strike (~30-80ms) -> follow-through -> recovery.
// unlock: id of the Tree node that adds this weapon type to the loot pool (null = available from the start).

export const HERO = {
  name: 'Геракл',
  title: 'Пепел с костра Эты',
  // hp = HEARTS: every enemy hit costs a whole heart (heavy blows two)
  hp: 5, sta: 150, staRegen: 60, speed: 92,
  crit: 0.06, critMul: 2.0,
  flasks: 2, flaskHeal: 0.4,
  loadCap: 30,
  accent: ['#ff8f3a', '#b5481c'],
};

export const ROLL = {
  light: { name: 'Лёгкая', cost: 16, dist: 66, time: 0.30, iframe: 0.26, speed: 1.05 },
  medium: { name: 'Средняя', cost: 20, dist: 60, time: 0.32, iframe: 0.24, speed: 1 },
  heavy: { name: 'Тяжёлая', cost: 27, dist: 48, time: 0.36, iframe: 0.20, speed: 0.9, poise: true },
};
export const loadClass = (ratio) => (ratio < 0.35 ? 'light' : ratio < 0.7 ? 'medium' : 'heavy');

// style: how swings look; move: speed multiplier while attacking
export const WEAPONS = {
  sword: {
    name: 'Ксифос', tagline: 'Меч гоплита: две широкие дуги и выпад-луч на добивании', unlock: null,
    sprite: 'sword', style: 'arc', move: 0.55, dmgType: 'slash', poiseDmg: 1.2, rally: 0.3,
    combo: [
      { dmg: 17, wind: 0.12, act: 0.06, rec: 0.18, range: 31, arc: 150, sta: 12 },
      { dmg: 17, wind: 0.10, act: 0.06, rec: 0.18, range: 31, arc: 150, sta: 12 },
      { dmg: 34, wind: 0.20, act: 0.08, rec: 0.30, range: 48, width: 10, arc: 30, shape: 'line', sta: 18, finisher: true },
    ],
    power: { name: 'Серп Персея', desc: 'Волны-полумесяцы рассекают всё на пути: 1, 3 или 5 волн. Полная шкала: кольцо из клинков вокруг героя.' },
    strong: 'неупокоенные, псы Гекаты', weak: 'гоплиты спереди',
  },
  dagger: {
    name: 'Махайры', tagline: 'Парные клинки: короткие уколы конусом и крест на добивании', unlock: 'v_dagger',
    sprite: 'dagger', style: 'twin', move: 0.8, dmgType: 'slash', poiseDmg: 0.6, rally: 0.4, critBonus: 0.06, backstab: 0.5,
    combo: [
      { dmg: 10, wind: 0.07, act: 0.05, rec: 0.13, range: 27, arc: 64, shape: 'cone', sta: 6 },
      { dmg: 10, wind: 0.06, act: 0.05, rec: 0.13, range: 27, arc: 64, shape: 'cone', sta: 6 },
      { dmg: 24, wind: 0.11, act: 0.06, rec: 0.24, range: 32, width: 7, arc: 120, shape: 'cross', sta: 10, finisher: true },
    ],
    power: { name: 'Танец теней', desc: 'Вихрь из 3–12 молниеносных порезов вокруг героя, каждый оставляет теневой след. Полная шкала: финальный крест.' },
    strong: 'ламии, спарты, отпрыски Гидры', weak: 'гоплиты (броня режет мелкие удары)',
  },
  greatsword: {
    name: 'Палица', tagline: 'Оливковая палица Геракла: тяжёлая дуга и удар сверху в точку', unlock: null,
    sprite: 'club', style: 'smash', move: 0.35, dmgType: 'slash', poiseDmg: 2.2, rally: 0.14, guardBreak: true, critMul: -0.2,
    combo: [
      { dmg: 33, wind: 0.30, act: 0.08, rec: 0.30, range: 38, arc: 160, sta: 22, hyper: true },
      { dmg: 50, wind: 0.36, act: 0.10, rec: 0.40, range: 26, r: 26, arc: 120, shape: 'impact', sta: 26, hyper: true, finisher: true },
    ],
    power: { name: 'Гнев Геракла', desc: 'Удар о землю и расходящиеся волны. Полная шкала: трещины в шесть сторон с огнём из-под земли.' },
    strong: 'гоплиты, неупокоенные', weak: 'псы Гекаты (быстрые), ламии (телепорт)',
  },
  staff: {
    name: 'Посох', tagline: 'Чары Гекаты: сквозь броню и щиты', unlock: 'm_staff',
    sprite: 'staff', style: 'cast', move: 0.6, dmgType: 'arcane', poiseDmg: 0.8, rally: 0.22, ignoreArmor: true,
    bolt: { dmg: 18, wind: 0.10, rec: 0.26, speed: 240, life: 1.0, r: 3, sta: 11, homing: 1.6 },
    power: { name: 'Кометы Гекаты', desc: 'С неба падают 1–8 комет на ближайших врагов. Полная шкала: нова чар вокруг героя.' },
    strong: 'гоплиты, спарты', weak: 'ламии (сопротивление чарам), псы Гекаты',
  },
  bow: {
    name: 'Лук', tagline: 'Дар Аполлона: дальность и пробивание', unlock: null,
    sprite: 'bow', style: 'shot', move: 0.6, dmgType: 'pierce', poiseDmg: 0.9, rally: 0.22, critBonus: 0.02,
    arrow: { dmg: 14, wind: 0.06, rec: 0.22, speed: 320, sta: 7, chargeTime: 0.6, chargedDmg: 36, chargedSpeed: 430, chargedPierce: 2, chargedSta: 13, moveWhileCharging: 0.5 },
    power: { name: 'Стрела Аполлона', desc: 'Солнечная стрела пробивает всех. Полная шкала: веер из пяти стрел и вспышка солнца на излёте.' },
    strong: 'ламии, неупокоенные, отпрыски Гидры', weak: 'спарты (стрелы сквозь рёбра), гоплиты',
  },
  spear: {
    name: 'Дори', tagline: 'Копьё гоплита: уколы-лучи на всю длину и широкий мах на добивании', unlock: 'v_spear',
    sprite: 'spear', style: 'thrust', move: 0.65, dmgType: 'pierce', poiseDmg: 1.0, rally: 0.28, critBonus: 0.03,
    combo: [
      { dmg: 15, wind: 0.10, act: 0.07, rec: 0.16, range: 52, width: 8, arc: 30, shape: 'line', sta: 9 },
      { dmg: 15, wind: 0.09, act: 0.07, rec: 0.16, range: 52, width: 8, arc: 30, shape: 'line', sta: 9 },
      { dmg: 28, wind: 0.18, act: 0.09, rec: 0.28, range: 44, arc: 230, shape: 'arc', sta: 15, finisher: true },
    ],
    power: { name: 'Копьё Ахилла', desc: 'Бросок копья, которое пронзает всех и возвращается в руку. Больше заряда — больше копий. Полная шкала: дождь копий с неба.' },
    strong: 'ламии и спарты на дистанции', weak: 'толпа вплотную',
  },
  aspis: {
    name: 'Аспис и ксифос', tagline: 'Щит гоплита: укол, дуга и удар щитом конусом; блок спереди', unlock: 'f_aspis',
    sprite: 'sword', shield: true, style: 'arc', move: 0.5, dmgType: 'slash', poiseDmg: 1.3, rally: 0.25,
    combo: [
      { dmg: 15, wind: 0.12, act: 0.06, rec: 0.18, range: 36, width: 7, arc: 30, shape: 'line', sta: 11 },
      { dmg: 15, wind: 0.11, act: 0.06, rec: 0.18, range: 29, arc: 140, shape: 'arc', sta: 11 },
      { dmg: 28, wind: 0.18, act: 0.08, rec: 0.3, range: 30, arc: 90, shape: 'cone', sta: 16, finisher: true, bash: true },
    ],
    power: { name: 'Фаланга', desc: 'Удар щитом: волна бронзы отбрасывает и оглушает, а щит закрывает героя барьером. Полная шкала: купол неуязвимости.' },
    strong: 'спарты и ламии (стрелы и чары гаснут о щит)', weak: 'гоплиты, рыцари',
  },
  labrys: {
    name: 'Лабрис', tagline: 'Двойной топор Миноса: широкие рубящие круги, раны', unlock: 'k_labrys',
    sprite: 'labrys', style: 'axe', move: 0.45, dmgType: 'slash', poiseDmg: 1.5, rally: 0.24, bleedOnHit: 1,
    combo: [
      { dmg: 24, wind: 0.18, act: 0.08, rec: 0.24, range: 34, arc: 200, sta: 15 },
      { dmg: 24, wind: 0.16, act: 0.08, rec: 0.24, range: 34, arc: 200, sta: 15 },
      { dmg: 36, wind: 0.24, act: 0.12, rec: 0.32, range: 36, arc: 360, sta: 20, finisher: true, spin: true },
    ],
    power: { name: 'Вихрь Миноса', desc: 'Герой вращается с топором и может двигаться, каждый оборот рубит всё вокруг. Полная шкала: вихрь затягивает врагов.' },
    strong: 'толпы неупокоенных и псов', weak: 'гоплиты (броня)',
  },
  pelekys: {
    name: 'Пелекус', tagline: 'Секира палача: удар сверху в точку и раскол земли вперёд, казнь', unlock: 'k_pelekys',
    sprite: 'pelekys', style: 'chop', move: 0.3, dmgType: 'slash', poiseDmg: 2.4, rally: 0.16, guardBreak: true, execute: 0.25,
    combo: [
      { dmg: 46, wind: 0.36, act: 0.1, rec: 0.36, range: 26, r: 19, arc: 120, shape: 'impact', sta: 24, hyper: true },
      { dmg: 64, wind: 0.42, act: 0.12, rec: 0.46, range: 66, width: 16, arc: 40, shape: 'line', sta: 28, hyper: true, finisher: true },
    ],
    power: { name: 'Казнь', desc: 'Удар сверху раскалывает землю вперёд; враги с малым запасом здоровья гибнут сразу. Полная шкала: трещина взрывается трижды.' },
    strong: 'элита и гоплиты', weak: 'быстрые псы',
  },
  cleaver: {
    name: 'Тесак Титана', tagline: 'Кусок железа с рукоятью: огромные дуги и удар о землю', unlock: 'k_cleaver',
    sprite: 'cleaver', style: 'cleave', move: 0.25, dmgType: 'slash', poiseDmg: 2.8, rally: 0.12, guardBreak: true, critMul: -0.3,
    combo: [
      { dmg: 42, wind: 0.34, act: 0.12, rec: 0.34, range: 48, arc: 240, sta: 24, hyper: true },
      { dmg: 42, wind: 0.3, act: 0.12, rec: 0.34, range: 48, arc: 240, sta: 24, hyper: true },
      { dmg: 72, wind: 0.42, act: 0.14, rec: 0.5, range: 30, r: 36, arc: 120, shape: 'impact', sta: 30, hyper: true, finisher: true },
    ],
    power: { name: 'Падение Титана', desc: 'Три сокрушительных круга подряд и удар о землю. Полная шкала: пять кругов и землетрясение.' },
    strong: 'всё, что стоит рядом', weak: 'всё, что стреляет издалека',
  },
};
export const WEAPON_ORDER = ['sword', 'dagger', 'greatsword', 'staff', 'bow', 'spear', 'aspis', 'labrys', 'pelekys', 'cleaver'];

export function rawDps(c) {
  if (c.combo) {
    const t = c.combo.reduce((s, a) => s + a.wind + a.act + a.rec, 0);
    const d = c.combo.reduce((s, a) => s + a.dmg, 0);
    return d / t;
  }
  if (c.bolt) return c.bolt.dmg / (c.bolt.wind + c.bolt.rec);
  if (c.arrow) return c.arrow.dmg / (c.arrow.wind + c.arrow.rec);
  return 0;
}
export function hitList(c) {
  if (c.combo) return c.combo.map((a) => a.dmg);
  if (c.bolt) return [c.bolt.dmg];
  return [c.arrow.dmg];
}
