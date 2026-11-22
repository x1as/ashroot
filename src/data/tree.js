// The Tree of the Hesperides (main menu): permanent progress bought with ash.
// Rebuilt to MATTER: every branch unlocks new weapon types (they only start dropping once unlocked),
// nodes give big, felt bonuses, and each branch ends in a capstone that changes how you play.
// Enemies are tuned so that a fresh hero needs the tree to get past the second depth.
//   Ствол  — survival (health, nectar)       Арес   — labrys, pelekys, titan cleaver; damage, charged power
//   Гермес — machairai, dory; speed, stamina  Гефест — aspis; forge, armour, loot
//   Мойры  — Hecate's staff; boons, fate, rules
// at: [t along branch 0..1, side -1/0/1 twig]. req: parent node id. weapon: weapon kind unlocked by the node.
const N = (id, br, name, icon, max, base, at, req, desc, apply, weapon) => ({ id, br, name, icon, max, base, at, req, desc, apply, weapon });

export const BRANCHES = {
  trunk: { name: 'Ствол Гесперид', color: '#ece4d0', desc: 'Здоровье и нектар' },
  blade: { name: 'Арес', color: '#ff6a3d', desc: 'Тяжёлое оружие, урон, усиленные удары' },
  wind: { name: 'Гермес', color: '#63e6cf', desc: 'Быстрое оружие, перекат, выносливость' },
  forge: { name: 'Гефест', color: '#ffb347', desc: 'Щит, кузня, броня, находки' },
  root: { name: 'Мойры', color: '#b88cff', desc: 'Посох, дары, судьба' },
};

const unlockDesc = (w) => () => `Открывает новое оружие: ${w}. Оно начнёт выпадать с врагов, и ты получишь первый экземпляр.`;

export const TREE = [
  // ---------- TRUNK ----------
  N('t_root', 'trunk', 'Золотое яблоко', 'heart', 5, 30, [0.05, 0], null, (r) => `+${10 * r}% здоровья`, (s, r) => { s.maxHp *= 1 + 0.1 * r; }),
  N('t_flask', 'trunk', 'Нектар', 'flask', 3, 80, [0.2, 0], 't_root', (r) => `+${r} чаша нектара`, (s, r) => { s.flasks += r; }),
  N('t_heal', 'trunk', 'Сладкий нектар', 'flask', 3, 70, [0.36, -1], 't_flask', (r) => `Нектар лечит на ${10 * r}% больше`, (s, r) => { s.flaskHeal += 0.1 * r; }),
  N('t_bark', 'trunk', 'Кора Гесперид', 'shieldi', 4, 60, [0.36, 1], 't_root', (r) => `−${5 * r}% получаемого урона`, (s, r) => { s.dmgTaken *= 1 - 0.05 * r; }),
  N('t_ash', 'trunk', 'Пепел Эты', 'ash', 3, 50, [0.52, -1], 't_heal', (r) => `+${15 * r}% пепла`, (s, r) => { s.ashMul += 0.15 * r; }),
  N('t_gift', 'trunk', 'Дар Гесперид', 'seed', 2, 160, [0.52, 1], 't_bark', (r) => `Забег начинается с ${r} случайн${r > 1 ? 'ыми дарами' : 'ым даром'}`, (s, r) => { s.startBoon = r; }),
  N('t_last', 'trunk', 'Бессмертная половина', 'star', 1, 450, [0.8, 0], 't_gift', () => 'Раз за забег смертельный удар оставляет 1 здоровья и даёт 2 с неуязвимости', (s) => { s.lastStand = true; }),

  // ---------- ARES: heavy weapons & power ----------
  N('k_might', 'blade', 'Сила Ареса', 'sword', 5, 40, [0.14, 0], null, (r) => `+${8 * r}% урона`, (s, r) => { s.dmgMul *= 1 + 0.08 * r; }),
  N('k_labrys', 'blade', 'Лабрис Кносса', 'hammer', 1, 90, [0.27, -1], 'k_might', unlockDesc('Лабрис'), (s) => { s.unlocked.labrys = true; }, 'labrys'),
  N('k_power', 'blade', 'Ярость берсерка', 'fire', 3, 70, [0.27, 1], 'k_might', (r) => `+${20 * r}% урона усиленной атаки`, (s, r) => { s.powerMul *= 1 + 0.2 * r; }),
  N('k_crit', 'blade', 'Глаз Афины', 'shadow', 3, 60, [0.42, -1], 'k_labrys', (r) => `+${4 * r}% крита и +${10 * r}% урона крита`, (s, r) => { s.crit += 0.04 * r; s.critMul += 0.1 * r; }),
  N('k_pelekys', 'blade', 'Секира палача', 'hammer', 1, 160, [0.42, 1], 'k_power', unlockDesc('Пелекус'), (s) => { s.unlocked.pelekys = true; }, 'pelekys'),
  N('k_counter', 'blade', 'Урок Хирона', 'storm', 2, 90, [0.58, 0], 'k_might', (r) => `КОНТР: +${30 * r}% урона, окно шире на ${(0.03 * r).toFixed(2)} с`, (s, r) => { s.counterMul += 0.3 * r; s.counterWindow += 0.03 * r; }),
  N('k_cleaver', 'blade', 'Наследие титанов', 'sword', 1, 320, [0.76, 1], 'k_pelekys', unlockDesc('Тесак Титана'), (s) => { s.unlocked.cleaver = true; }, 'cleaver'),
  N('k_cap', 'blade', 'Ярость Ареса', 'star', 1, 420, [0.95, 0], 'k_cleaver', () => 'Полностью заряженный удар включает ярость: 4 с +40% скорости атаки и неуязвимость к оглушению', (s) => { s.aresRage = true; }),

  // ---------- HERMES: fast weapons & movement ----------
  N('v_regen', 'wind', 'Дыхание Зефира', 'wind', 4, 40, [0.14, 0], null, (r) => `+${15 * r}% восстановления выносливости`, (s, r) => { s.staRegen *= 1 + 0.15 * r; }),
  N('v_dagger', 'wind', 'Клинки Аталанты', 'dagger', 1, 90, [0.27, -1], 'v_regen', unlockDesc('Махайры'), (s) => { s.unlocked.dagger = true; }, 'dagger'),
  N('v_charge', 'wind', 'Быстрый вдох', 'wind', 3, 70, [0.27, 1], 'v_regen', (r) => `Заряд копится на ${20 * r}% быстрее`, (s, r) => { s.chargeRate *= 1 + 0.2 * r; }),
  N('v_dodge', 'wind', 'Крылатые пятки', 'boot', 3, 60, [0.42, -1], 'v_dagger', (r) => `Перекат дешевле на ${10 * r}%, неуязвимость дольше на ${(0.02 * r).toFixed(2)} с`, (s, r) => { s.dodgeCost *= 1 - 0.1 * r; s.iframeBonus += 0.02 * r; }),
  N('v_spear', 'wind', 'Фаланга Спарты', 'bow', 1, 150, [0.42, 1], 'v_charge', unlockDesc('Дори'), (s) => { s.unlocked.spear = true; }, 'spear'),
  N('v_sta', 'wind', 'Дыхание титана', 'wind', 3, 70, [0.6, 0], 'v_regen', (r) => `+${20 * r} выносливости`, (s, r) => { s.maxSta += 20 * r; }),
  N('v_perf', 'wind', 'Хитрость Одиссея', 'shadow', 2, 110, [0.76, -1], 'v_sta', (r) => `Окно идеального переката +${(0.03 * r).toFixed(2)} с`, (s, r) => { s.perfectWindow += 0.03 * r; }),
  N('v_cap', 'wind', 'Мешок Эола', 'star', 1, 400, [0.95, 0], 'v_perf', () => 'Идеальный перекат полностью восстанавливает выносливость', (s) => { s.aeolus = true; }),

  // ---------- HEPHAESTUS: shield, forge & armour ----------
  N('g_cap', 'forge', 'Горн Гефеста', 'hammer', 5, 45, [0.14, 0], null, (r) => `Предел улучшения +${5 + r} (было +5)`, (s, r) => { s.upCap = 5 + r; }),
  N('f_aspis', 'forge', 'Щит гоплита', 'shieldi', 1, 100, [0.27, -1], 'g_cap', unlockDesc('Аспис и ксифос'), (s) => { s.unlocked.aspis = true; }, 'aspis'),
  N('g_armor', 'forge', 'Бронза Гефеста', 'shieldi', 4, 55, [0.27, 1], 'g_cap', (r) => `+${6 * r} брони`, (s, r) => { s.armor += 6 * r; }),
  N('g_infuse', 'forge', 'Стихийная заточка', 'fire', 1, 120, [0.42, -1], 'f_aspis', () => 'Открывает заточку под стихию', (s) => { s.canInfuse = true; }),
  N('g_find', 'forge', 'Удача Тюхе', 'dice', 3, 70, [0.42, 1], 'g_armor', (r) => `+${20 * r}% шанса найти предмет и +${15 * r}% ресурсов`, (s, r) => { s.findMul += 0.2 * r; s.matMul += 0.15 * r; }),
  N('g_root', 'forge', 'Корневое слияние', 'heartwood', 1, 260, [0.6, -1], 'g_infuse', () => 'Открывает корневые усиления', (s) => { s.canRoot = true; }),
  N('g_bag', 'forge', 'Сума Гермеса', 'relic', 2, 60, [0.6, 1], 'g_find', (r) => `+${15 * r} мест в сумке, нагрузка +${15 * r}%`, (s, r) => { s.bag += 15 * r; s.loadCap *= 1 + 0.15 * r; }),
  N('g_cap2', 'forge', 'Подмастерье Гефеста', 'star', 1, 420, [0.95, 0], 'g_root', () => 'Вещи падают на ступень редкости выше чаще, улучшение дешевле на 25%', (s) => { s.rarityBoost = true; s.forgeCost *= 0.75; }),

  // ---------- MOIRAI: staff, boons & fate ----------
  N('r_rally', 'root', 'Нить Немезиды', 'blood', 3, 45, [0.14, 0], null, (r) => `+${15 * r}% отмщения`, (s, r) => { s.rallyEff *= 1 + 0.15 * r; }),
  N('m_staff', 'root', 'Тайна Гекаты', 'orb', 1, 100, [0.27, 1], 'r_rally', unlockDesc('Посох'), (s) => { s.unlocked.staff = true; }, 'staff'),
  N('r_reroll', 'root', 'Жребий Лахесис', 'dice', 3, 90, [0.27, -1], 'r_rally', (r) => `+${r} переброс даров за этаж`, (s, r) => { s.rerolls += r; }),
  N('r_sight', 'root', 'Око Клото', 'shadow', 1, 220, [0.42, -1], 'r_reroll', () => 'Выбор из 4 даров вместо 3', (s) => { s.cards = Math.max(s.cards, 4); }),
  N('r_heal', 'root', 'Пир победителя', 'heart', 3, 70, [0.42, 1], 'm_staff', (r) => `Убийство лечит ${2 * r} здоровья`, (s, r) => { s.killHeal += 2 * r; }),
  N('r_echo', 'root', 'Память Мнемосины', 'ash', 1, 120, [0.6, 0], 'r_rally', () => 'При смерти в Древо уходит 75% пепла, а не 50%', (s) => { s.deathKeep = 0.75; }),
  N('r_unstop', 'root', 'Упрямство Сизифа', 'shieldi', 1, 300, [0.76, 1], 'r_heal', () => 'Раз за этаж смертельный удар оставляет 1 здоровья', (s) => { s.unstoppable = true; }),
  N('r_cap', 'root', 'Песнь Орфея', 'star', 1, 420, [0.95, 0], 'r_sight', () => 'Резонансы наступают на 1 уровень раньше (2 и 4)', (s) => { s.resoShift = 1; }),
];

export const TREE_BY_ID = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const nodeCost = (n, rank) => Math.round(n.base * Math.pow(1.55, rank));
// weapon kinds that drop without any tree node
export const BASE_WEAPONS = ['sword', 'greatsword', 'bow'];
