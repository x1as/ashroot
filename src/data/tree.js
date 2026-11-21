// The Ash Tree: permanent upgrades bought with ash. It IS the main menu.
// Trunk = shared. Four branches = four classes (a branch's nodes only work for its class).
// at: [t along branch 0..1, side -1/0/1 twig]. req: parent node id.
const N = (id, br, name, icon, max, base, at, req, desc, apply) => ({ id, br, name, icon, max, base, at, req, desc, apply });

export const TREE = [
  // ---------- TRUNK (bottom -> top) ----------
  N('t_root', 'trunk', 'Корень жизни', 'heart', 5, 25, [0.05, 0], null, (r) => `+${6 * r}% макс. HP`, (s, r) => { s.maxHp *= 1 + 0.06 * r; }),
  N('t_ash', 'trunk', 'Пепельная жатва', 'ash', 3, 30, [0.16, -1], 't_root', (r) => `+${12 * r}% пепла`, (s, r) => { s.ashMul += 0.12 * r; }),
  N('t_sta', 'trunk', 'Выносливость', 'wind', 3, 35, [0.16, 1], 't_root', (r) => `+${10 * r} выносливости`, (s, r) => { s.maxSta += 10 * r; }),
  N('t_flask', 'trunk', 'Сок Древа', 'flask', 2, 90, [0.3, 0], 't_root', (r) => `+${r} фляга`, (s, r) => { s.flasks += r; }),
  N('t_bark', 'trunk', 'Крепкая кора', 'shieldi', 3, 60, [0.42, -1], 't_flask', (r) => `−${4 * r}% получаемого урона`, (s, r) => { s.dmgTaken *= 1 - 0.04 * r; }),
  N('t_might', 'trunk', 'Сила корней', 'sword', 5, 45, [0.42, 1], 't_flask', (r) => `+${4 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.04 * r; }),
  N('t_reroll', 'trunk', 'Перебор судьбы', 'dice', 2, 120, [0.56, -1], 't_bark', (r) => `+${r} переброс даров за этаж`, (s, r) => { s.rerolls += r; }),
  N('t_gift', 'trunk', 'Дар ветвей', 'seed', 1, 150, [0.56, 1], 't_might', () => 'Забег начинается с 1 случайного дара', (s) => { s.startBoon = true; }),
  N('t_sight', 'trunk', 'Глаз рока', 'shadow', 1, 260, [0.7, 0], 't_reroll', () => 'Выбор из 4 даров вместо 3', (s) => { s.cards = 4; }),
  N('t_heal', 'trunk', 'Тёплая смола', 'flask', 2, 110, [0.82, -1], 't_flask', (r) => `Фляга лечит +${8 * r}%`, (s, r) => { s.flaskHeal += 0.08 * r; }),
  N('t_last', 'trunk', 'Второе дыхание', 'star', 1, 420, [0.82, 1], 't_sight', () => 'Раз за забег пережить смертельный удар с 1 HP', (s) => { s.lastStand = true; }),

  // ---------- ROGUE ----------
  N('r_crit', 'rogue', 'Холодный расчёт', 'shadow', 3, 40, [0.18, 0], null, (r) => `+${4 * r}% шанс крита`, (s, r) => { s.crit += 0.04 * r; }),
  N('r_dodge', 'rogue', 'Лёгкая поступь', 'boot', 2, 50, [0.32, -1], 'r_crit', (r) => `Перекат дешевле на ${10 * r}%`, (s, r) => { s.dodgeCost *= 1 - 0.1 * r; }),
  N('r_combo', 'rogue', 'Отточенные клинки', 'dagger', 3, 55, [0.32, 1], 'r_crit', (r) => `+${6 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.06 * r; }),
  N('r_step', 'rogue', 'Тень за спиной', 'shadow', 3, 70, [0.48, 0], 'r_crit', (r) => `Теневой шаг −${10 * r}% перезарядки`, (s, r) => { s.skillCd *= 1 - 0.1 * r; }),
  N('r_back', 'rogue', 'Удар в спину', 'dagger', 2, 90, [0.62, -1], 'r_step', (r) => `+${20 * r}% к урону со спины`, (s, r) => { s.backstab += 0.2 * r; }),
  N('r_perf', 'rogue', 'Танец на лезвии', 'wind', 2, 90, [0.62, 1], 'r_step', (r) => `Окно идеального переката +${(0.03 * r).toFixed(2)} с`, (s, r) => { s.perfectWindow += 0.03 * r; }),
  N('r_venom', 'rogue', 'Яд в крови', 'blood', 1, 160, [0.78, 0], 'r_back', () => 'Начинать с даром «Ядовитые клинки»', (s) => { s.startWith.push('c_venom'); }),
  N('r_cap', 'rogue', 'Танец клинков', 'star', 1, 380, [0.95, 0], 'r_venom', () => 'Каждый финишер выпускает теневой клинок', (s) => { s.bladeDance = true; }),

  // ---------- WARRIOR ----------
  N('w_hp', 'warrior', 'Шкура медведя', 'heart', 4, 40, [0.18, 0], null, (r) => `+${10 * r} макс. HP`, (s, r) => { s.maxHp += 10 * r; }),
  N('w_dmg', 'warrior', 'Тяжёлая рука', 'sword', 3, 55, [0.32, -1], 'w_hp', (r) => `+${6 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.06 * r; }),
  N('w_hyper', 'warrior', 'Несгибаемость', 'shieldi', 3, 60, [0.32, 1], 'w_hp', (r) => `Во время замаха −${10 * r}% урона`, (s, r) => { s.hyperArmor += 0.1 * r; }),
  N('w_slam', 'warrior', 'Раскол земли', 'hammer', 2, 70, [0.48, 0], 'w_hp', (r) => `Сокрушение: радиус +${12 * r}%`, (s, r) => { s.slamR *= 1 + 0.12 * r; }),
  N('w_sta', 'warrior', 'Бычья сила', 'wind', 2, 75, [0.62, -1], 'w_slam', (r) => `+${12 * r} выносливости`, (s, r) => { s.maxSta += 12 * r; }),
  N('w_poise', 'warrior', 'Ломатель стоек', 'hammer', 2, 85, [0.62, 1], 'w_slam', (r) => `+${25 * r}% урона по стойке`, (s, r) => { s.poiseDmg *= 1 + 0.25 * r; }),
  N('w_wrath', 'warrior', 'Кровь берсерка', 'fire', 1, 160, [0.78, 0], 'w_sta', () => 'Начинать с даром «Гнев»', (s) => { s.startWith.push('c_wrath'); }),
  N('w_cap', 'warrior', 'Неудержимый', 'star', 1, 380, [0.95, 0], 'w_wrath', () => 'Раз за этаж: смертельный удар оставляет 1 HP', (s) => { s.unstoppable = true; }),

  // ---------- MAGE ----------
  N('m_dmg', 'mage', 'Чистые чары', 'orb', 3, 40, [0.18, 0], null, (r) => `+${6 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.06 * r; }),
  N('m_cast', 'mage', 'Быстрые руны', 'storm', 3, 55, [0.32, -1], 'm_dmg', (r) => `+${5 * r}% скорости заклинаний`, (s, r) => { s.atkSpeed *= 1 + 0.05 * r; }),
  N('m_hp', 'mage', 'Плотная мантия', 'heart', 3, 50, [0.32, 1], 'm_dmg', (r) => `+${7 * r} макс. HP`, (s, r) => { s.maxHp += 7 * r; }),
  N('m_blink', 'mage', 'Складка мира', 'shadow', 3, 70, [0.48, 0], 'm_dmg', (r) => `Скачок −${10 * r}% перезарядки`, (s, r) => { s.skillCd *= 1 - 0.1 * r; }),
  N('m_reach', 'mage', 'Дальний взгляд', 'orb', 2, 75, [0.62, -1], 'm_blink', (r) => `Снаряды быстрее и дальше на ${15 * r}%`, (s, r) => { s.projSpeed *= 1 + 0.15 * r; }),
  N('m_shield', 'mage', 'Чародейский щит', 'shieldi', 1, 140, [0.62, 1], 'm_blink', () => 'Первый удар в каждом зале поглощается', (s) => { s.arcaneShield = true; }),
  N('m_split', 'mage', 'Раздвоение', 'storm', 1, 160, [0.78, 0], 'm_reach', () => 'Начинать с даром «Расщепление»', (s) => { s.startWith.push('c_split'); }),
  N('m_cap', 'mage', 'Архимаг', 'star', 1, 380, [0.95, 0], 'm_split', () => 'Каждый 4-й снаряд самонаводится сильнее и пробивает', (s) => { s.archmage = true; }),

  // ---------- ARCHER ----------
  N('a_dmg', 'archer', 'Тяжёлые наконечники', 'bow', 3, 40, [0.18, 0], null, (r) => `+${6 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.06 * r; }),
  N('a_charge', 'archer', 'Твёрдая рука', 'wind', 3, 55, [0.32, -1], 'a_dmg', (r) => `Натяг быстрее на ${8 * r}%`, (s, r) => { s.chargeMul *= 1 - 0.08 * r; }),
  N('a_hp', 'archer', 'Охотничья куртка', 'heart', 3, 50, [0.32, 1], 'a_dmg', (r) => `+${7 * r} макс. HP`, (s, r) => { s.maxHp += 7 * r; }),
  N('a_volley', 'archer', 'Шире залп', 'bow', 3, 70, [0.48, 0], 'a_dmg', (r) => `Залп: +${r * 2} стрелы`, (s, r) => { s.volleyExtra += 2 * r; }),
  N('a_kite', 'archer', 'Охота на ходу', 'boot', 2, 75, [0.62, -1], 'a_volley', (r) => `Скорость при натяге +${15 * r}%`, (s, r) => { s.chargeMove += 0.15 * r; }),
  N('a_crit', 'archer', 'В яблочко', 'shadow', 2, 85, [0.62, 1], 'a_volley', (r) => `Натянутые стрелы: +${10 * r}% крита`, (s, r) => { s.chargedCrit += 0.1 * r; }),
  N('a_pierce', 'archer', 'Сквозная стрела', 'bow', 1, 160, [0.78, 0], 'a_kite', () => 'Начинать с даром «Пронзание»', (s) => { s.startWith.push('c_pierce'); }),
  N('a_cap', 'archer', 'Ястребиный глаз', 'star', 1, 380, [0.95, 0], 'a_pierce', () => 'Полный натяг: пробивает всех и всегда крит', (s) => { s.hawkeye = true; }),
];

export const TREE_BY_ID = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const nodeCost = (n, rank) => Math.round(n.base * Math.pow(1.55, rank));
