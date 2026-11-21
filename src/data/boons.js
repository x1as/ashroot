// Run upgrades ("Дары"). Picked 1 of 3 after every cleared room.
// System: 5 ASPECTS. Every level you take in an aspect counts toward its RESONANCE:
//   3 levels -> Резонанс I, 5 levels -> Резонанс II (a rule-changing effect, not +%).
// PACTS are opt-in risk: a strong upside with a real drawback (Sirlin risk-reward).
// Numeric stat effects live in `stat`; behavioural effects are read by game/combat.js via lv(id).
export const ASPECTS = {
  blood: { name: 'Кровь', color: '#e0404f', icon: 'blood' },
  fire: { name: 'Пламя', color: '#ff8f3a', icon: 'fire' },
  frost: { name: 'Иней', color: '#93e2ff', icon: 'frost' },
  storm: { name: 'Гроза', color: '#ffd36b', icon: 'storm' },
  shadow: { name: 'Тень', color: '#b88cff', icon: 'shadow' },
  neutral: { name: 'Сталь', color: '#ece4d0', icon: 'neutral' },
  pact: { name: 'Пакт', color: '#ff3355', icon: 'pact' },
};

export const RESONANCE = {
  blood: ['Багровый пир: отмщение лечит вдвое по кровоточащим', 'Кровавый взрыв: кровоточащие взрываются при смерти, разнося 5 ран'],
  fire: ['Пожар: горение перекидывается на соседей', 'Солнце: каждый 8-й удар — огненная нова'],
  frost: ['Осколки: замёрзшие при смерти разлетаются ледяными иглами', 'Вьюга: перекат оставляет морозную волну'],
  storm: ['Цепь: молнии бьют на 2 цели дальше', 'Гнев небес: идеальный перекат — молния во всех врагов'],
  shadow: ['Тень следует: после переката удар — гарантированный крит', 'Казнь: криты наносят ×3'],
};


export const BOONS = [
  // ---------- BLOOD ----------
  { id: 'b_rend', aspect: 'blood', name: 'Рваные раны', desc: (l) => `Удары накладывают ${l} ран (кровотечение 2/с за рану, до 10).` },
  { id: 'b_thirst', aspect: 'blood', name: 'Жажда', desc: (l) => `Отмщение возвращает +${15 * l}% урона и длится на ${0.5 * l} с дольше.`, stat: (s, l) => { s.rallyEff += 0.15 * l; s.rallyTime += 0.5 * l; } },
  { id: 'b_frenzy', aspect: 'blood', name: 'Исступление', desc: (l) => `+${4 * l}% скорости атаки за каждые 10% потерянного HP.` },
  { id: 'b_hemo', aspect: 'blood', name: 'Гемофилия', desc: (l) => `Кровотечение наносит +${40 * l}% урона.` },
  { id: 'b_sacr', aspect: 'blood', name: 'Причастие', desc: (l) => `Убийство лечит ${1 + l} HP.` },
  // ---------- FIRE ----------
  { id: 'f_ignite', aspect: 'fire', name: 'Поджог', desc: (l) => `${[0, 25, 40, 55][l]}% шанс поджечь (6 урона/с, 3 с).` },
  { id: 'f_cinder', aspect: 'fire', name: 'Угольный след', desc: (l) => `Перекат оставляет огонь: ${6 + 4 * l} урона/с.` },
  { id: 'f_pyre', aspect: 'fire', name: 'Погребальный костёр', desc: (l) => `Горящие враги взрываются при смерти: ${10 + 10 * l} урона.` },
  { id: 'f_heat', aspect: 'fire', name: 'Жар', desc: (l) => `+${12 * l}% урона по горящим.` },
  { id: 'f_flare', aspect: 'fire', name: 'Вспышка', desc: (l) => `Умение выпускает огненную нову: ${15 + 10 * l} урона.` },
  // ---------- FROST ----------
  { id: 'i_chill', aspect: 'frost', name: 'Озноб', desc: (l) => `${[0, 40, 60, 80][l]}% шанс охладить. 5 стаков = заморозка 1.2 с.` },
  { id: 'i_shatter', aspect: 'frost', name: 'Раскол', desc: (l) => `Удар по замёрзшему: +${30 + 30 * l}% урона.` },
  { id: 'i_armor', aspect: 'frost', name: 'Ледяной панцирь', desc: (l) => `После урона — щит на ${5 + 5 * l} HP (раз в 8 с).` },
  { id: 'i_nova', aspect: 'frost', name: 'Морозный ответ', desc: (l) => `Идеальный перекат морозит врагов в радиусе ${40 + 15 * l}.` },
  { id: 'i_brittle', aspect: 'frost', name: 'Хрупкость', desc: (l) => `Охлаждённые получают +${3 * l}% урона за стак.` },
  // ---------- STORM ----------
  { id: 's_arc', aspect: 'storm', name: 'Дуга', desc: (l) => `Каждый 4-й удар — молния на ${1 + l} цели: ${8 + 4 * l} урона.` },
  { id: 's_static', aspect: 'storm', name: 'Статика', desc: (l) => `+${8 * l}% скорости бега и выносливости.`, stat: (s, l) => { s.speed *= 1 + 0.08 * l; s.staRegen *= 1 + 0.08 * l; } },
  { id: 's_overload', aspect: 'storm', name: 'Перегрузка', desc: (l) => `Криты бьют током по площади: ${5 + 5 * l} урона.` },
  { id: 's_conduit', aspect: 'storm', name: 'Громоотвод', desc: (l) => `Перекат сквозь врага бьёт током: ${6 + 6 * l} урона.` },
  { id: 's_tempest', aspect: 'storm', name: 'Буря', desc: (l) => `Раз в ${7 - l} с молния в случайного врага: ${20 + 8 * l}.` },
  // ---------- SHADOW ----------
  { id: 'h_eye', aspect: 'shadow', name: 'Острый глаз', desc: (l) => `+${4 + 4 * l}% шанса крита.`, stat: (s, l) => { s.crit += 0.04 + 0.04 * l; } },
  { id: 'h_ambush', aspect: 'shadow', name: 'Засада', desc: (l) => `Первый удар по целому врагу — крит, +${25 * l + 25}% урона.` },
  { id: 'h_veil', aspect: 'shadow', name: 'Покров', desc: (l) => `Окно идеального переката +${(0.03 * l).toFixed(2)} с, замедление дольше.`, stat: (s, l) => { s.perfectWindow += 0.03 * l; s.slowmo += 0.08 * l; } },
  { id: 'h_exec', aspect: 'shadow', name: 'Палач', desc: (l) => `+${15 + 15 * l}% урона по врагам ниже 30% HP.` },
  { id: 'h_echo', aspect: 'shadow', name: 'Эхо клинка', desc: (l) => `Криты с шансом ${15 + 10 * l}% повторяются теневым ударом.` },
  // ---------- NEUTRAL ----------
  { id: 'n_might', aspect: 'neutral', name: 'Сила', desc: (l) => `+${10 * l}% урона.`, stat: (s, l) => { s.dmgMul *= 1 + 0.1 * l; } },
  { id: 'n_vigor', aspect: 'neutral', name: 'Живучесть', desc: (l) => `+${12 * l} к макс. HP.`, stat: (s, l) => { s.maxHp += 12 * l; } },
  { id: 'n_wind', aspect: 'neutral', name: 'Дыхание', desc: (l) => `+${15 * l} выносливости.`, stat: (s, l) => { s.maxSta += 15 * l; } },
  { id: 'n_haste', aspect: 'neutral', name: 'Проворство', desc: (l) => `+${8 * l}% скорости атаки.`, stat: (s, l) => { s.atkSpeed *= 1 + 0.08 * l; } },
  { id: 'n_guard', aspect: 'neutral', name: 'Закалка', desc: (l) => `−${6 * l}% получаемого урона.`, stat: (s, l) => { s.dmgTaken *= 1 - 0.06 * l; } },
  { id: 'n_focus', aspect: 'neutral', name: 'Фокус', desc: (l) => `−${12 * l}% перезарядки умения.`, stat: (s, l) => { s.skillCd *= 1 - 0.12 * l; } },
  { id: 'n_greed', aspect: 'neutral', name: 'Алчность', desc: (l) => `+${25 * l}% пепла.`, stat: (s, l) => { s.ashMul += 0.25 * l; } },
  // ---------- CLASS ----------
  { id: 'c_fourth', aspect: 'shadow', cls: 'rogue', name: 'Четвёртый клинок', max: 1, desc: () => 'Комбо получает 4-й удар: вихрь 360°.' },
  { id: 'c_venom', aspect: 'blood', cls: 'rogue', name: 'Ядовитые клинки', max: 1, desc: () => 'Каждый удар — 1 рана. Теневой шаг — 3 раны.' },
  { id: 'c_wrath', aspect: 'fire', cls: 'warrior', name: 'Гнев', max: 1, desc: () => '+3% урона за каждый пропущенный удар в зале (до 30%).' },
  { id: 'c_quake', aspect: 'storm', cls: 'warrior', name: 'Землетрясение', max: 1, desc: () => 'Финишер комбо пускает ударную волну.' },
  { id: 'c_split', aspect: 'storm', cls: 'mage', name: 'Расщепление', max: 1, desc: () => 'Снаряд при попадании делится на 2 осколка (40%).' },
  { id: 'c_overheat', aspect: 'fire', cls: 'mage', name: 'Перегрев', max: 1, desc: () => 'Каждый 5-й снаряд — огромный, ×2.5 урона, взрыв.' },
  { id: 'c_pierce', aspect: 'shadow', cls: 'archer', name: 'Пронзание', max: 1, desc: () => 'Все стрелы пробивают +1 врага.' },
  { id: 'c_quick', aspect: 'frost', cls: 'archer', name: 'Быстрый натяг', max: 1, desc: () => 'Натяг на 35% быстрее.' },
  // ---------- PACTS ----------
  { id: 'p_glass', aspect: 'pact', pact: true, max: 1, name: 'Стеклянное сердце', desc: () => '+50% урона. −35% макс. HP.', stat: (s) => { s.dmgMul *= 1.5; s.maxHp *= 0.65; } },
  { id: 'p_blood', aspect: 'pact', pact: true, max: 1, name: 'Плата кровью', desc: () => 'Атаки не тратят выносливость. Каждая атака стоит 1 HP (отмщением можно вернуть).', stat: (s) => { s.staFree = true; s.hpCost = 1; } },
  { id: 'p_mad', aspect: 'pact', pact: true, max: 1, name: 'Безумный бег', desc: () => '+25% скорости атаки и бега. Враги быстрее на 20%.', stat: (s) => { s.atkSpeed *= 1.25; s.speed *= 1.25; s.enemySpeed *= 1.2; } },
  { id: 'p_gold', aspect: 'pact', pact: true, max: 1, name: 'Проклятое золото', desc: () => '+100% пепла. У врагов +25% HP.', stat: (s) => { s.ashMul += 1; s.enemyHp *= 1.25; } },
  { id: 'p_vow', aspect: 'pact', pact: true, max: 1, name: 'Обет трезвости', desc: () => '−1 фляга навсегда. +35% урона.', stat: (s) => { s.flasks -= 1; s.dmgMul *= 1.35; } },
  { id: 'p_last', aspect: 'pact', pact: true, max: 1, name: 'Последний вздох', desc: () => 'Ниже 30% HP урон ×2. Лечение −50%.', stat: (s) => { s.healMul *= 0.5; } },
];

export const BOON = Object.fromEntries(BOONS.map((b) => [b.id, { max: 3, ...b }]));
