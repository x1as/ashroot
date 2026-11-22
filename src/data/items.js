// Items, resources and the forge. Pure data + pure formulas (used by the game and the balance sim).
//
// ITEM = { uid, base, slot, kind, rarity 0..3, ilvl (floor it dropped on), up 0..10,
//          infuse: null | 'blood'|'fire'|'frost'|'storm'|'shadow' | 'root:<id>', affixes: [{id, v}], power? }
// Upgrade (+1..+10) raises base stats 8% per level. Заточка (infusion) binds an element:
//   any piece counts as +1 level of that aspect for resonances; a weapon also gets the element's on-hit effect.
// Корневое усиление replaces the element with a unique rule-changing power (needs Сердцевина).

export const RARITY = [
  // rarity = whose hands made it: mortals, heroes, titans, gods
  { name: 'Смертный', color: '#b8aa90', mul: 1.0, affixes: 0 },
  { name: 'Героический', color: '#7fb2ff', mul: 1.12, affixes: 1 },
  { name: 'Титанический', color: '#b88cff', mul: 1.25, affixes: 2 },
  { name: 'Божественный', color: '#ffb347', mul: 1.4, affixes: 3 },
];

export const SLOTS = [
  { id: 'weapon', name: 'Оружие', icon: 'sword' },
  { id: 'helm', name: 'Голова', icon: 'helm' },
  { id: 'chest', name: 'Тело', icon: 'chest' },
  { id: 'gloves', name: 'Руки', icon: 'glove' },
  { id: 'boots', name: 'Ноги', icon: 'boot' },
  { id: 'amulet', name: 'Амулет', icon: 'amulet' },
  { id: 'ring', name: 'Кольцо', icon: 'ring' },
  { id: 'relic', name: 'Реликвия', icon: 'relic' },
];
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// armour weight classes (equipment types)
export const WEIGHT = {
  light: { name: 'Лёгкое', armor: 3, weight: 2 },
  medium: { name: 'Среднее', armor: 6, weight: 5 },
  heavy: { name: 'Тяжёлое', armor: 10, weight: 9 },
};
export const SLOT_MUL = { helm: 1, chest: 1.6, gloves: 0.8, boots: 0.9 };

export const BASES = {
  w_sword: { slot: 'weapon', kind: 'sword', name: 'Ксифос', icon: 'sword', legend: 'Харпа Персея' },
  w_dagger: { slot: 'weapon', kind: 'dagger', name: 'Махайры', icon: 'dagger', legend: 'Махайры Аталанты' },
  w_great: { slot: 'weapon', kind: 'greatsword', name: 'Палица', icon: 'club', legend: 'Палица Геракла' },
  w_staff: { slot: 'weapon', kind: 'staff', name: 'Посох', icon: 'orb', legend: 'Посох Гекаты' },
  w_bow: { slot: 'weapon', kind: 'bow', name: 'Лук', icon: 'bow', legend: 'Лук Аполлона' },
  h_light: { slot: 'helm', kind: 'light', name: 'Пилос', icon: 'helm', legend: 'Петас Гермеса' },
  h_medium: { slot: 'helm', kind: 'medium', name: 'Халкидский шлем', icon: 'helm', legend: 'Шлем Аида' },
  h_heavy: { slot: 'helm', kind: 'heavy', name: 'Коринфский шлем', icon: 'helm', legend: 'Шлем Ахилла' },
  c_light: { slot: 'chest', kind: 'light', name: 'Хитон', icon: 'chest', legend: 'Шкура Немейского льва' },
  c_medium: { slot: 'chest', kind: 'medium', name: 'Линоторакс', icon: 'chest', legend: 'Пояс Ипполиты' },
  c_heavy: { slot: 'chest', kind: 'heavy', name: 'Бронзовый панцирь', icon: 'chest', legend: 'Доспех Гефеста' },
  g_light: { slot: 'gloves', kind: 'light', name: 'Обмотки кулачного бойца', icon: 'glove', legend: 'Обмотки Полидевка' },
  g_medium: { slot: 'gloves', kind: 'medium', name: 'Наручи', icon: 'glove', legend: 'Наручи Персея' },
  g_heavy: { slot: 'gloves', kind: 'heavy', name: 'Бронзовые наручи', icon: 'glove', legend: 'Длани Атланта' },
  b_light: { slot: 'boots', kind: 'light', name: 'Сандалии', icon: 'boot', legend: 'Таларии Гермеса' },
  b_medium: { slot: 'boots', kind: 'medium', name: 'Эндромиды', icon: 'boot', legend: 'Сандалии Ясона' },
  b_heavy: { slot: 'boots', kind: 'heavy', name: 'Кнемиды', icon: 'boot', legend: 'Кнемиды Аякса' },
  a_amulet: { slot: 'amulet', kind: 'acc', name: 'Горгонейон', icon: 'amulet', legend: 'Эгида Афины' },
  r_ring: { slot: 'ring', kind: 'acc', name: 'Перстень', icon: 'ring', legend: 'Перстень Гигеса' },
  x_relic: { slot: 'relic', kind: 'relic', name: 'Реликвия', icon: 'relic' },
};
// genitive suffixes avoid Russian gender agreement: "Кольчуга стража", "Латы стража"
// heroic/titanic items carry a place or a people (genitive avoids Russian gender agreement)
export const SUFFIX = [' Спарты', ' Фив', ' Микен', ' Аргоса', ' Трои', ' Крита', ' Аркадии', ' Немеи', ' Лерны', ' аргонавта', ' гоплита', ' Стикса'];
export const LEGEND_SUFFIX = ' Олимпа'; // used only when a base has no unique godly name

// affixes: v rolled from [a, b] * (1 + 0.15 * (ilvl - 1)), rounded
export const AFFIXES = {
  hp: { name: (v) => `+${v} к макс. HP`, r: [6, 14], apply: (s, v) => { s.maxHp += v; }, slots: 'def' },
  sta: { name: (v) => `+${v} выносливости`, r: [10, 22], apply: (s, v) => { s.maxSta += v; }, slots: 'any' },
  regen: { name: (v) => `+${v}% восстановления выносливости`, r: [6, 14], apply: (s, v) => { s.staRegen *= 1 + v / 100; }, slots: 'any' },
  dmg: { name: (v) => `+${v}% урона`, r: [5, 11], apply: (s, v) => { s.dmgMul *= 1 + v / 100; }, slots: 'off' },
  crit: { name: (v) => `+${v}% шанса крита`, r: [3, 7], apply: (s, v) => { s.crit += v / 100; }, slots: 'off' },
  critd: { name: (v) => `+${v}% урона крита`, r: [12, 25], apply: (s, v) => { s.critMul += v / 100; }, slots: 'off' },
  atk: { name: (v) => `+${v}% скорости атаки`, r: [4, 9], apply: (s, v) => { s.atkSpeed *= 1 + v / 100; }, slots: 'off' },
  speed: { name: (v) => `+${v}% скорости бега`, r: [3, 7], apply: (s, v) => { s.speed *= 1 + v / 100; }, slots: 'def' },
  armor: { name: (v) => `+${v} брони`, r: [3, 7], apply: (s, v) => { s.armor += v; }, slots: 'def' },
  dodge: { name: (v) => `−${v}% цены переката`, r: [5, 11], apply: (s, v) => { s.dodgeCost *= 1 - v / 100; }, slots: 'def' },
  cd: { name: (v) => `−${v}% перезарядки умения`, r: [6, 13], apply: (s, v) => { s.skillCd *= 1 - v / 100; }, slots: 'any' },
  ash: { name: (v) => `+${v}% пепла`, r: [8, 18], apply: (s, v) => { s.ashMul += v / 100; }, slots: 'acc' },
  find: { name: (v) => `+${v}% находок`, r: [8, 18], apply: (s, v) => { s.findMul += v / 100; }, slots: 'acc' },
  flask: { name: (v) => `+${v}% лечения флягой`, r: [4, 9], apply: (s, v) => { s.flaskHeal += v / 100; }, slots: 'acc' },
  rally: { name: (v) => `+${v}% отмщения`, r: [8, 16], apply: (s, v) => { s.rallyEff *= 1 + v / 100; }, slots: 'any' },
};
export const AFFIX_POOL = {
  weapon: ['dmg', 'crit', 'critd', 'atk', 'rally', 'cd', 'sta'],
  armor: ['hp', 'armor', 'sta', 'regen', 'speed', 'dodge', 'rally'],
  acc: ['hp', 'sta', 'regen', 'dmg', 'crit', 'cd', 'ash', 'find', 'flask', 'rally', 'speed'],
};

// relics always carry one unique power
export const RELICS = {
  phoenix: { name: 'Перо Феникса', desc: 'Раз за этаж смертельный удар оставляет 1 HP.', apply: (s) => { s.unstoppable = true; } },
  hourglass: { name: 'Песок Хроноса', desc: 'Идеальный перекат: замедление вдвое дольше, окно +0.03 с.', apply: (s) => { s.slowmo *= 2; s.perfectWindow += 0.03; } },
  fang: { name: 'Зуб дракона Кадма', desc: 'Криты накладывают 2 раны яда.', apply: (s) => { s.critBleed = 2; } },
  ember: { name: 'Нартекс Прометея', desc: 'Перекат оставляет огненный след: огонь, украденный у богов.', apply: (s) => { s.emberTrail = true; } },
  compass: { name: 'Нить Ариадны', desc: 'Выбор из 4 даров вместо 3.', apply: (s) => { s.cards = Math.max(s.cards, 4); } },
  coin: { name: 'Обол Харона', desc: '+40% пепла и находок.', apply: (s) => { s.ashMul += 0.4; s.findMul += 0.4; } },
};

// Корневые усиления (root powers). weapon roots / armour+accessory roots
export const ROOTS = {
  hunger: { slot: 'weapon', name: 'Корень Эрисихтона', desc: 'Убийство лечит 3% макс. HP.' },
  echo: { slot: 'weapon', name: 'Корень нимфы Эхо', desc: 'Каждый 5-й удар повторяется с силой 60%.' },
  thunder: { slot: 'weapon', name: 'Корень Зевса', desc: 'После идеального переката 3 удара бьют цепной молнией.' },
  weight: { slot: 'weapon', name: 'Корень Атланта', desc: '+50% урона по ошеломлённым и замёрзшим.' },
  bark: { slot: 'gear', name: 'Корень Дафны', desc: 'Первый удар в каждом зале поглощается.' },
  sap: { slot: 'gear', name: 'Корень амброзии', desc: 'Фляга даёт +30% урона на 6 с.' },
  wind: { slot: 'gear', name: 'Корень Зефира', desc: '−25% цены переката, окно идеального переката +0.03 с.' },
  rage: { slot: 'gear', name: 'Корень Ареса', desc: 'Ниже 40% HP: +25% скорости атаки.' },
};

export const ELEMENTS = ['blood', 'fire', 'frost', 'storm', 'shadow'];
export const ELEMENT_WEAPON = {
  blood: 'Каждый удар — 1 рана яда Гидры.',
  fire: '30% шанс поджечь.',
  frost: '40% шанс охладить.',
  storm: 'Каждый 4-й удар — цепная молния.',
  shadow: '+8% крита, +30% урона крита.',
};

export const RESOURCES = {
  bone: { name: 'Прах теней', color: '#ece4d0', icon: 'bone', desc: 'С любых врагов. Улучшение до +3.' },
  resin: { name: 'Смола Гесперид', color: '#ffb347', icon: 'resin', desc: 'С элиты, изредка с обычных. Улучшение +4…+6, заточка.' },
  shard: { name: 'Осколок адаманта', color: '#93e2ff', icon: 'shard', desc: 'С элиты и боссов. Улучшение +7…+9, корневое усиление.' },
  heart: { name: 'Ихор', color: '#ffd36b', icon: 'heartwood', desc: 'Кровь богов, только с боссов. +10 и корневое усиление.' },
  e_blood: { name: 'Яд Гидры', color: '#e0404f', icon: 'blood', desc: 'С врагов, убитых кровотечением.' },
  e_fire: { name: 'Пламя Прометея', color: '#ff8f3a', icon: 'fire', desc: 'С врагов, убитых горящими.' },
  e_frost: { name: 'Иней Борея', color: '#93e2ff', icon: 'frost', desc: 'С охлаждённых и замёрзших.' },
  e_storm: { name: 'Искра Зевса', color: '#ffd36b', icon: 'storm', desc: 'С врагов, добитых молнией.' },
  e_shadow: { name: 'Тень Никты', color: '#b88cff', icon: 'shadow', desc: 'С врагов, добитых критом.' },
};
export const RES_ORDER = ['bone', 'resin', 'shard', 'heart', 'e_blood', 'e_fire', 'e_frost', 'e_storm', 'e_shadow'];
export const BOSS_ELEMENT = { warden: 'blood', singer: 'storm', smith: 'fire', widow: 'frost', heart: 'shadow' };

// one line of myth per item type, shown on the item plate
export const FLAVOR = {
  w_sword: 'Короткий меч гоплита. Им сражались у Фермопил.', w_dagger: 'Изогнутые клинки охотников Аркадии.',
  w_great: 'Палица из дикой оливы: Геракл срубил её у Немеи.', w_staff: 'Посох жриц Гекаты, богини перекрёстков и чар.',
  w_bow: 'Лук, подаренный Аполлоном. Стрелы помнят яд Гидры.', h_light: 'Войлочная шапка путника и пастуха.',
  h_medium: 'Открытый шлем с нащёчниками, его любили в Халкиде.', h_heavy: 'Глухой шлем с гребнем. Лицо видно лишь в прорезь.',
  c_light: 'Простой хитон. Лёгкость дороже защиты.', c_medium: 'Склеенные слои льна: доспех Александра.',
  c_heavy: 'Бронзовая кираса, выкованная по мышцам героя.', g_light: 'Ремни кулачного бойца, как у Полидевка.',
  g_medium: 'Кожаные наручи с бронзовыми пластинами.', g_heavy: 'Бронзовые рукавицы: держат удар молота.',
  b_light: 'Сандалии с ремнями до колена.', b_medium: 'Высокие эндромиды охотницы Аталанты.',
  b_heavy: 'Бронзовые поножи. Защищают голень гоплита.', a_amulet: 'Лик Медузы: отвращает зло и взгляды.',
  r_ring: 'Перстень с печатью. Гиг стал невидим, повернув такой.', x_relic: 'Вещь, которую помнят мифы.',
};
export const SLOT_WEIGHT = { weapon: 1.6, helm: 0.7, chest: 1, gloves: 0.6, boots: 0.7, amulet: 0.8, ring: 0.8, relic: 1.1 };
// one comparable number per item ("Мощь"): base power x rarity x upgrades x number of properties x slot weight
export const itemScore = (it) => Math.round(100 * (1 + 0.1 * (it.ilvl - 1)) * RARITY[it.rarity].mul * (1 + 0.08 * it.up) * (1 + 0.18 * it.affixes.length + (it.infuse ? 0.15 : 0)) * SLOT_WEIGHT[it.slot]);

export const itemPower = (it) => (1 + 0.1 * (it.ilvl - 1)) * RARITY[it.rarity].mul * (1 + 0.08 * it.up);

// ---------------- forge costs ----------------
export function upgradeCost(it) {
  const n = it.up, rm = 1 + it.rarity * 0.35;
  const cost = { ash: Math.round(18 * Math.pow(n + 1, 1.55) * rm) };
  if (n < 3) cost.bone = 3 + n * 2;
  else if (n < 6) { cost.bone = 6; cost.resin = n - 1; }
  else if (n < 9) { cost.resin = 3; cost.shard = n - 5; }
  else { cost.shard = 4; cost.heart = 1; }
  return cost;
}
export function infuseCost(it, what) {
  if (what.startsWith('root:')) return { ash: 140 + 40 * it.rarity, shard: 3, heart: 1 };
  return { ash: 50 + 20 * it.rarity, resin: 2, ['e_' + what]: 3 };
}
export function salvageYield(it) {
  const y = { bone: 2 + it.rarity * 2 + Math.floor(it.up / 2) };
  if (it.rarity >= 1) y.resin = it.rarity;
  if (it.rarity >= 2) y.shard = it.rarity - 1;
  if (it.up >= 7) y.shard = (y.shard || 0) + 1;
  return y;
}
export const COST_NAME = (k) => (k === 'ash' ? 'пепла' : RESOURCES[k].name.toLowerCase());
