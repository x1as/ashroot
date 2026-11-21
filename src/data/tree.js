// The Tree of the Hesperides (main menu) — its roots reach Tartarus; Heracles' pyre-ash feeds it.
// The Ash Tree (main menu): permanent upgrades bought with ash. One hero, so the branches are
// themes, not classes: ТРУНК (vitality) + КЛИНОК (offense) + ВЕТЕР (mobility) + ГОРН (forge & loot) + КОРЕНЬ (rules).
// The forge branch gates crafting: upgrade cap +5 -> +10, elemental infusion, root fusion.
// at: [t along branch 0..1, side -1/0/1 twig]. req: parent node id.
const N = (id, br, name, icon, max, base, at, req, desc, apply) => ({ id, br, name, icon, max, base, at, req, desc, apply });

export const BRANCHES = {
  trunk: { name: 'Ствол Гесперид', color: '#ece4d0', desc: 'Живучесть' },
  blade: { name: 'Арес', color: '#ff6a3d', desc: 'Урон, криты, стойка' },
  wind: { name: 'Гермес', color: '#63e6cf', desc: 'Перекат, выносливость, нагрузка' },
  forge: { name: 'Гефест', color: '#ffb347', desc: 'Кузня, находки, ресурсы' },
  root: { name: 'Мойры', color: '#b88cff', desc: 'Особые правила забега' },
};

export const TREE = [
  // ---------- TRUNK ----------
  N('t_root', 'trunk', 'Золотое яблоко', 'heart', 5, 25, [0.05, 0], null, (r) => `+${6 * r}% макс. HP`, (s, r) => { s.maxHp *= 1 + 0.06 * r; }),
  N('t_sta', 'trunk', 'Дыхание титана', 'wind', 3, 30, [0.18, -1], 't_root', (r) => `+${12 * r} выносливости`, (s, r) => { s.maxSta += 12 * r; }),
  N('t_ash', 'trunk', 'Пепел Эты', 'ash', 3, 30, [0.18, 1], 't_root', (r) => `+${12 * r}% пепла`, (s, r) => { s.ashMul += 0.12 * r; }),
  N('t_flask', 'trunk', 'Нектар', 'flask', 2, 90, [0.34, 0], 't_root', (r) => `+${r} фляга`, (s, r) => { s.flasks += r; }),
  N('t_bark', 'trunk', 'Кора Гесперид', 'shieldi', 3, 60, [0.5, -1], 't_flask', (r) => `−${4 * r}% получаемого урона`, (s, r) => { s.dmgTaken *= 1 - 0.04 * r; }),
  N('t_heal', 'trunk', 'Сладкий нектар', 'flask', 2, 110, [0.5, 1], 't_flask', (r) => `Фляга лечит +${8 * r}%`, (s, r) => { s.flaskHeal += 0.08 * r; }),
  N('t_gift', 'trunk', 'Дар Гесперид', 'seed', 1, 150, [0.68, 0], 't_bark', () => 'Забег начинается с 1 случайного дара', (s) => { s.startBoon = true; }),
  N('t_last', 'trunk', 'Бессмертная половина', 'star', 1, 420, [0.84, 0], 't_gift', () => 'Раз за забег пережить смертельный удар с 1 HP', (s) => { s.lastStand = true; }),

  // ---------- BLADE ----------
  N('k_might', 'blade', 'Сила Ареса', 'sword', 5, 40, [0.16, 0], null, (r) => `+${4 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.04 * r; }),
  N('k_crit', 'blade', 'Глаз Афины', 'shadow', 3, 50, [0.3, -1], 'k_might', (r) => `+${3 * r}% шанса крита`, (s, r) => { s.crit += 0.03 * r; }),
  N('k_speed', 'blade', 'Рука Ахилла', 'dagger', 3, 55, [0.3, 1], 'k_might', (r) => `+${4 * r}% скорости атаки`, (s, r) => { s.atkSpeed *= 1 + 0.04 * r; }),
  N('k_critd', 'blade', 'Жало Эриний', 'blood', 2, 80, [0.46, -1], 'k_crit', (r) => `+${15 * r}% урона крита`, (s, r) => { s.critMul += 0.15 * r; }),
  N('k_poise', 'blade', 'Удар Антея', 'hammer', 2, 80, [0.46, 1], 'k_speed', (r) => `+${25 * r}% урона по стойке`, (s, r) => { s.poiseDmg *= 1 + 0.25 * r; }),
  N('k_counter', 'blade', 'Урок Хирона', 'storm', 2, 100, [0.62, 0], 'k_might', (r) => `КОНТР: +${25 * r}% урона, окно +${(0.03 * r).toFixed(2)} с`, (s, r) => { s.counterMul += 0.25 * r; s.counterWindow += 0.03 * r; }),
  N('k_stam', 'blade', 'Выучка спартанца', 'wind', 2, 90, [0.78, -1], 'k_counter', (r) => `Атаки тратят на ${12 * r}% меньше выносливости`, (s, r) => { s.atkSta *= 1 - 0.12 * r; }),
  N('k_cap', 'blade', 'Пиррихий', 'star', 1, 380, [0.95, 0], 'k_counter', () => 'Каждый финишер выпускает теневой клинок', (s) => { s.bladeDance = true; }),

  // ---------- WIND ----------
  N('v_dodge', 'wind', 'Крылатые пятки', 'boot', 3, 40, [0.16, 0], null, (r) => `Перекат дешевле на ${8 * r}%`, (s, r) => { s.dodgeCost *= 1 - 0.08 * r; }),
  N('v_regen', 'wind', 'Дыхание Зефира', 'wind', 3, 50, [0.3, -1], 'v_dodge', (r) => `+${10 * r}% восстановления выносливости`, (s, r) => { s.staRegen *= 1 + 0.1 * r; }),
  N('v_load', 'wind', 'Плечи Атланта', 'shieldi', 3, 55, [0.3, 1], 'v_dodge', (r) => `+${15 * r}% допустимой нагрузки`, (s, r) => { s.loadCap *= 1 + 0.15 * r; }),
  N('v_perf', 'wind', 'Хитрость Одиссея', 'shadow', 2, 80, [0.46, -1], 'v_regen', (r) => `Окно идеального переката +${(0.02 * r).toFixed(2)} с`, (s, r) => { s.perfectWindow += 0.02 * r; }),
  N('v_speed', 'wind', 'Бег Аталанты', 'boot', 2, 70, [0.46, 1], 'v_load', (r) => `+${4 * r}% скорости бега`, (s, r) => { s.speed *= 1 + 0.04 * r; }),
  N('v_iframe', 'wind', 'Неуловимость Гермеса', 'wind', 2, 110, [0.62, 0], 'v_dodge', (r) => `Неуязвимость переката +${(0.02 * r).toFixed(2)} с`, (s, r) => { s.iframeBonus += 0.02 * r; }),
  N('v_slow', 'wind', 'Милость Хроноса', 'dice', 1, 150, [0.78, 1], 'v_iframe', () => 'Замедление после идеального переката +50%', (s) => { s.slowmo *= 1.5; }),
  N('v_cap', 'wind', 'Мешок Эола', 'star', 1, 380, [0.95, 0], 'v_iframe', () => 'Идеальный перекат сбрасывает 40% перезарядки умения', (s) => { s.tailwind = true; }),

  // ---------- FORGE ----------
  N('g_cap', 'forge', 'Горн Гефеста', 'hammer', 5, 45, [0.16, 0], null, (r) => `Предел улучшения +${5 + r} (было +5)`, (s, r) => { s.upCap = 5 + r; }),
  N('g_cost', 'forge', 'Рука Дедала', 'ash', 3, 55, [0.3, -1], 'g_cap', (r) => `Улучшение дешевле на ${8 * r}%`, (s, r) => { s.forgeCost *= 1 - 0.08 * r; }),
  N('g_drop', 'forge', 'Жатва Деметры', 'bone', 3, 50, [0.3, 1], 'g_cap', (r) => `+${15 * r}% ресурсов с врагов`, (s, r) => { s.matMul += 0.15 * r; }),
  N('g_infuse', 'forge', 'Стихийная заточка', 'fire', 1, 120, [0.46, -1], 'g_cost', () => 'Открывает заточку под элемент', (s) => { s.canInfuse = true; }),
  N('g_find', 'forge', 'Удача Тюхе', 'dice', 3, 70, [0.46, 1], 'g_drop', (r) => `+${15 * r}% шанса найти предмет`, (s, r) => { s.findMul += 0.15 * r; }),
  N('g_root', 'forge', 'Корневое слияние', 'heartwood', 1, 260, [0.62, -1], 'g_infuse', () => 'Открывает корневые усиления', (s) => { s.canRoot = true; }),
  N('g_bag', 'forge', 'Сума Гермеса', 'relic', 2, 60, [0.62, 1], 'g_find', (r) => `+${10 * r} ячеек инвентаря`, (s, r) => { s.bag += 10 * r; }),
  N('g_salv', 'forge', 'Переплавка Киклопов', 'bone', 2, 80, [0.78, 0], 'g_bag', (r) => `Разбор даёт +${25 * r}% ресурсов`, (s, r) => { s.salvageMul += 0.25 * r; }),
  N('g_cap2', 'forge', 'Подмастерье Гефеста', 'star', 1, 400, [0.95, 0], 'g_root', () => 'Предметы падают на 1 редкость выше чаще', (s) => { s.rarityBoost = true; }),

  // ---------- ROOT ----------
  N('r_rally', 'root', 'Нить Немезиды', 'blood', 3, 45, [0.16, 0], null, (r) => `+${10 * r}% отмщения`, (s, r) => { s.rallyEff *= 1 + 0.1 * r; }),
  N('r_reroll', 'root', 'Жребий Лахесис', 'dice', 2, 120, [0.3, -1], 'r_rally', (r) => `+${r} переброс даров за этаж`, (s, r) => { s.rerolls += r; }),
  N('r_heal', 'root', 'Пир победителя', 'heart', 2, 70, [0.3, 1], 'r_rally', (r) => `Убийство лечит ${r} HP`, (s, r) => { s.killHeal += r; }),
  N('r_echo', 'root', 'Память Мнемосины', 'ash', 1, 110, [0.46, -1], 'r_reroll', () => 'При смерти в Древо уходит 75% пепла, а не 50% — тень уносит меньше', (s) => { s.deathKeep = 0.75; }),
  N('r_boss', 'root', 'Трофей героя', 'pact', 2, 90, [0.46, 1], 'r_heal', (r) => `Боссы дают +${20 * r}% пепла`, (s, r) => { s.bossAsh += 0.2 * r; }),
  N('r_sight', 'root', 'Око Клото', 'shadow', 1, 260, [0.62, 0], 'r_reroll', () => 'Выбор из 4 даров вместо 3', (s) => { s.cards = Math.max(s.cards, 4); }),
  N('r_unstop', 'root', 'Упрямство Сизифа', 'shieldi', 1, 300, [0.78, 1], 'r_sight', () => 'Раз за этаж смертельный удар оставляет 1 HP', (s) => { s.unstoppable = true; }),
  N('r_cap', 'root', 'Песнь Орфея', 'star', 1, 420, [0.95, 0], 'r_sight', () => 'Резонансы наступают на 1 уровень раньше (2 и 4)', (s) => { s.resoShift = 1; }),
];

export const TREE_BY_ID = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const nodeCost = (n, rank) => Math.round(n.base * Math.pow(1.55, rank));
