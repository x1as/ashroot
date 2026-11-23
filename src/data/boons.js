// Run upgrades ("Дары богов"), picked 1 of 3 after every cleared hall.
// Each aspect is a god's gift that CHANGES THE WEAPON and is SEEN on it:
//   Гидра (poison wounds, venom drips from the blade)   Прометей (fire, the blade burns)
//   Борей (frost, ice crawls over the edge)            Зевс (lightning, sparks run along the weapon)
//   Никта (night: crits, phantom swings, dark wisps)    Бронза (raw stats)   Клятвы Стикса (pacts, real risk)
// Every aspect has: weapon gifts (normal attacks), a CHARGED gift (rides the charged attack), utility, a finisher.
// 3 levels in an aspect -> Резонанс I, 5 -> Резонанс II (rule-changing). `weapon` gifts appear only for that weapon.
export const ASPECTS = {
  blood: { name: 'Гидра', color: '#7bd66b', icon: 'blood' },
  fire: { name: 'Прометей', color: '#ff8f3a', icon: 'fire' },
  frost: { name: 'Борей', color: '#93e2ff', icon: 'frost' },
  storm: { name: 'Зевс', color: '#ffd36b', icon: 'storm' },
  shadow: { name: 'Никта', color: '#b88cff', icon: 'shadow' },
  neutral: { name: 'Бронза', color: '#ece4d0', icon: 'neutral' },
  pact: { name: 'Клятва Стикса', color: '#ff3355', icon: 'pact' },
};

export const RESONANCE = {
  blood: ['Пир Гидры: отмщение лечит вдвое по отравленным', 'Девять голов: отравленные взрываются при смерти, разнося 5 ран яда'],
  fire: ['Украденный огонь: горение перекидывается на соседей', 'Колесница Гелиоса: каждый 8-й удар — огненная нова'],
  frost: ['Слёзы Коцита: замёрзшие при смерти разлетаются ледяными иглами', 'Северный ветер: перекат оставляет морозную волну'],
  storm: ['Цепь Кронида: молнии бьют на 2 цели дальше', 'Гнев Олимпа: идеальный перекат — молния во всех врагов'],
  shadow: ['Дочь Хаоса: после переката удар — гарантированный крит', 'Серп Таната: криты наносят ×3'],
};

export const BOONS = [
  // ---------- ГИДРА ----------
  { id: 'b_rend', aspect: 'blood', name: 'Клыки Гидры', desc: (l) => `Каждый удар накладывает ${l} ${l === 1 ? 'рану' : 'раны'} яда (2 урона в секунду за рану, до 10). С клинка капает яд.` },
  { id: 'b_burst', aspect: 'blood', name: 'Кровавый фонтан', charged: true, desc: (l) => `Усиленная атака взрывает яд в задетых врагах: мгновенно наносит ${(1 + 0.5 * l).toFixed(1)}× весь оставшийся урон яда.` },
  { id: 'b_heads', aspect: 'blood', name: 'Новая голова', desc: (l) => `Убийство отравленного врага: +${3 + l}% урона до конца зала (до +${(3 + l) * 10}%). Отрубишь одну — вырастут две.` },
  { id: 'b_thirst', aspect: 'blood', name: 'Жажда Эмпусы', desc: (l) => `Отмщение (вернуть сердце ударами сразу после потери) быстрее на ${20 * l}% и длится на ${0.5 * l} с дольше.`, stat: (s, l) => { s.rallyEff *= 1 + 0.2 * l; s.rallyTime += 0.5 * l; } },
  { id: 'b_hemo', aspect: 'blood', name: 'Лернейский яд', desc: (l) => `Яд наносит на ${40 * l}% больше урона.` },
  { id: 'b_sacr', aspect: 'blood', name: 'Пир Эриний', desc: (l) => `Каждое ${[0, 15, 12, 9][l]}-е убийство лечит сердце.` },
  // ---------- ПРОМЕТЕЙ ----------
  { id: 'f_ignite', aspect: 'fire', name: 'Пламенный клинок', desc: (l) => `Оружие охвачено огнём: ${[0, 30, 45, 60][l]}% шанс поджечь (6 урона в секунду, 3 с).` },
  { id: 'f_forge', aspect: 'fire', name: 'Горн Гефеста', charged: true, desc: (l) => `Усиленная атака оставляет огненное поле: ${8 + 6 * l} урона в секунду, растёт с зарядом.` },
  { id: 'f_pyre', aspect: 'fire', name: 'Костёр Эты', desc: (l) => `Горящие враги взрываются при смерти: ${12 + 12 * l} урона вокруг.` },
  { id: 'f_cinder', aspect: 'fire', name: 'След Гелиоса', desc: (l) => `Перекат оставляет огненный след: ${6 + 4 * l} урона в секунду.` },
  { id: 'f_heat', aspect: 'fire', name: 'Жар кузни', desc: (l) => `+${15 * l}% урона по горящим.` },
  { id: 'f_phoenix', aspect: 'fire', name: 'Перо феникса', max: 1, desc: () => 'Раз за этаж, оставшись с последним сердцем, герой вспыхивает: взрыв огня и +2 сердца.' },
  // ---------- БОРЕЙ ----------
  { id: 'i_chill', aspect: 'frost', name: 'Ледяная кромка', desc: (l) => `Лезвие покрыто инеем: ${[0, 40, 60, 80][l]}% шанс охладить. 5 стаков — заморозка на 1.2 с.` },
  { id: 'i_spikes', aspect: 'frost', name: 'Сосульки Коцита', charged: true, desc: (l) => `Усиленная атака выпускает ${4 + 4 * l} ледяных игл во все стороны.` },
  { id: 'i_shatter', aspect: 'frost', name: 'Раскол', desc: (l) => `Удар по замёрзшему: +${40 + 40 * l}% урона.` },
  { id: 'i_armor', aspect: 'frost', name: 'Ледяная эгида', desc: (l) => `Потеряв сердце, герой покрывается льдом: следующий удар поглощён (раз в ${14 - 2 * l} с).` },
  { id: 'i_nova', aspect: 'frost', name: 'Ответ Хионы', desc: (l) => `Идеальный перекат замораживает врагов в радиусе ${40 + 15 * l}.` },
  { id: 'i_brittle', aspect: 'frost', name: 'Хрупкость', desc: (l) => `Охлаждённые получают на ${4 * l}% больше урона за стак.` },
  // ---------- ЗЕВС ----------
  { id: 's_arc', aspect: 'storm', name: 'Молния Зевса', desc: (l) => `По оружию бегут искры: каждый 4-й удар — цепная молния на ${1 + l} цели, ${10 + 5 * l} урона.` },
  { id: 's_charged', aspect: 'storm', name: 'Грозовой заряд', charged: true, desc: (l) => `Усиленная атака с зарядом от 50% бьёт молнией по ${1 + 2 * l} врагам: ${20 + 10 * l} урона, растёт с зарядом.` },
  { id: 's_static', aspect: 'storm', name: 'Поступь Гермеса', desc: (l) => `+${8 * l}% скорости бега и восстановления выносливости.`, stat: (s, l) => { s.speed *= 1 + 0.08 * l; s.staRegen *= 1 + 0.08 * l; } },
  { id: 's_overload', aspect: 'storm', name: 'Гнев Кронида', desc: (l) => `Криты бьют током по площади: ${6 + 6 * l} урона.` },
  { id: 's_conduit', aspect: 'storm', name: 'Громоотвод', desc: (l) => `Перекат сквозь врага бьёт током: ${8 + 6 * l} урона.` },
  { id: 's_tempest', aspect: 'storm', name: 'Буря Эола', desc: (l) => `Раз в ${7 - l} с молния в случайного врага: ${24 + 8 * l} урона.` },
  // ---------- НИКТА ----------
  { id: 'h_twin', aspect: 'shadow', name: 'Теневой двойник', desc: (l) => `Каждый 3-й удар повторяет тень оружия: ${40 + 30 * l}% урона.` },
  { id: 'h_eye', aspect: 'shadow', name: 'Глаз Аргуса', desc: (l) => `+${5 * l}% шанса крита.`, stat: (s, l) => { s.crit += 0.05 * l; } },
  { id: 'h_ambush', aspect: 'shadow', name: 'Засада Никты', desc: (l) => `Первый удар по целому врагу — крит и +${25 + 25 * l}% урона.` },
  { id: 'h_veil', aspect: 'shadow', name: 'Покров Эреба', desc: (l) => `Окно идеального переката +${(0.03 * l).toFixed(2)} с, замедление дольше.`, stat: (s, l) => { s.perfectWindow += 0.03 * l; s.slowmo += 0.08 * l; } },
  { id: 'h_exec', aspect: 'shadow', name: 'Серп Таната', desc: (l) => `+${20 + 15 * l}% урона по врагам ниже 30% здоровья.` },
  { id: 'h_echo', aspect: 'shadow', name: 'Голос Эхо', desc: (l) => `Криты с шансом ${20 + 10 * l}% повторяются теневым ударом.` },
  // ---------- БРОНЗА ----------
  { id: 'n_reach', aspect: 'neutral', name: 'Длинная рука', desc: (l) => `Удары достают на ${15 * l}% дальше и шире.`, stat: (s, l) => { s.reach *= 1 + 0.15 * l; } },
  { id: 'n_charge', aspect: 'neutral', name: 'Дыхание титана', desc: (l) => `Заряд копится на ${25 * l}% быстрее.`, stat: (s, l) => { s.chargeRate *= 1 + 0.25 * l; } },
  { id: 'n_power', aspect: 'neutral', name: 'Сила Геракла', desc: (l) => `+${20 * l}% урона усиленной атаки.`, stat: (s, l) => { s.powerMul *= 1 + 0.2 * l; } },
  { id: 'n_might', aspect: 'neutral', name: 'Сила полубога', desc: (l) => `+${10 * l}% урона.`, stat: (s, l) => { s.dmgMul *= 1 + 0.1 * l; } },
  { id: 'n_vigor', aspect: 'neutral', name: 'Амброзия', desc: (l) => `+${l} бронзов${l > 1 ? 'ых щита' : 'ый щит'} (принимает удар вместо сердца, восстанавливается).`, stat: (s, l) => { s.ward += l; } },
  { id: 'n_wind', aspect: 'neutral', name: 'Дыхание Пана', desc: (l) => `+${20 * l} выносливости.`, stat: (s, l) => { s.maxSta += 20 * l; } },
  { id: 'n_haste', aspect: 'neutral', name: 'Крылья Гермеса', desc: (l) => `+${8 * l}% скорости атаки.`, stat: (s, l) => { s.atkSpeed *= 1 + 0.08 * l; } },
  { id: 'n_guard', aspect: 'neutral', name: 'Бронза Гефеста', desc: (l) => `Бронзовые щиты восстанавливаются на ${25 * l}% быстрее.`, stat: (s, l) => { s.wardTime *= 1 - 0.25 * l; } },
  { id: 'n_greed', aspect: 'neutral', name: 'Обол Харона', desc: (l) => `+${25 * l}% пепла.`, stat: (s, l) => { s.ashMul += 0.25 * l; } },
  // ---------- WEAPON GIFTS ----------
  { id: 'c_wide', aspect: 'storm', weapon: 'sword', name: 'Дуга Персея', max: 1, desc: () => 'Дуги ксифоса шире на 40°, финишер выпускает малую волну.' },
  { id: 'c_fourth', aspect: 'shadow', weapon: 'dagger', name: 'Танец махайр', max: 1, desc: () => 'Комбо получает 4-й удар: вихрь 360°.' },
  { id: 'c_venom', aspect: 'blood', weapon: 'dagger', name: 'Клинки в крови Гидры', max: 1, desc: () => 'Каждый удар махайр — ещё 1 рана яда.' },
  { id: 'c_wrath', aspect: 'fire', weapon: 'greatsword', name: 'Ярость Алкида', max: 1, desc: () => '+3% урона за каждый пропущенный удар в зале (до 30%).' },
  { id: 'c_quake', aspect: 'storm', weapon: 'greatsword', name: 'Колебатель Земли', max: 1, desc: () => 'Финишер палицы пускает ударную волну.' },
  { id: 'c_split', aspect: 'storm', weapon: 'staff', name: 'Три лика Гекаты', max: 1, desc: () => 'Снаряд при попадании делится на 2 осколка.' },
  { id: 'c_overheat', aspect: 'fire', weapon: 'staff', name: 'Факел Гекаты', max: 1, desc: () => 'Каждый 5-й снаряд — огромный, ×2.5 урона и взрыв.' },
  { id: 'c_pierce', aspect: 'shadow', weapon: 'bow', name: 'Стрела Филоктета', max: 1, desc: () => 'Все стрелы пробивают ещё одного врага.' },
  { id: 'c_quick', aspect: 'frost', weapon: 'bow', name: 'Рука Аполлона', max: 1, desc: () => 'Каждый 3-й выстрел — сразу три стрелы веером.' },
  { id: 'c_phalanx', aspect: 'storm', weapon: 'spear', name: 'Двойной укол', max: 1, desc: () => 'Каждый укол копья бьёт дважды.' },
  { id: 'c_reflect', aspect: 'frost', weapon: 'aspis', name: 'Отражённая медь', max: 1, desc: () => 'Щит возвращает заблокированные снаряды во врагов.' },
  { id: 'c_labrys', aspect: 'blood', weapon: 'labrys', name: 'Кровь лабиринта', max: 1, desc: () => 'Вращающий финишер лабриса затягивает врагов и накладывает 3 раны яда.' },
  { id: 'c_execute', aspect: 'shadow', weapon: 'pelekys', name: 'Плаха', max: 1, desc: () => 'Порог казни пелекуса выше на 15%, казнь лечит четверть сердца.' },
  { id: 'c_titan', aspect: 'fire', weapon: 'cleaver', name: 'Вес титана', max: 1, desc: () => 'Каждый удар тесака ломает стойку: враг ошеломлён.' },
  // ---------- КЛЯТВЫ СТИКСА ----------
  { id: 'p_glass', aspect: 'pact', pact: true, max: 1, name: 'Пята Ахилла', desc: () => '+50% урона. Максимум 3 сердца.', stat: (s) => { s.dmgMul *= 1.5; s.maxHp = Math.min(s.maxHp, 3); } },
  { id: 'p_blood', aspect: 'pact', pact: true, max: 1, name: 'Печень Прометея', desc: () => 'Атаки и заряд не тратят выносливость. Каждые 20 атак стоят сердце.', stat: (s) => { s.staFree = true; s.hpCost = 1; } },
  { id: 'p_mad', aspect: 'pact', pact: true, max: 1, name: 'Безумие Геры', desc: () => '+25% скорости атаки и бега. Враги быстрее на 20%.', stat: (s) => { s.atkSpeed *= 1.25; s.speed *= 1.25; s.enemySpeed *= 1.2; } },
  { id: 'p_gold', aspect: 'pact', pact: true, max: 1, name: 'Золото Мидаса', desc: () => '+100% пепла и находок. У врагов +25% здоровья.', stat: (s) => { s.ashMul += 1; s.findMul += 1; s.enemyHp *= 1.25; } },
  { id: 'p_vow', aspect: 'pact', pact: true, max: 1, name: 'Чаша Тантала', desc: () => '−1 чаша нектара навсегда. +35% урона.', stat: (s) => { s.flasks -= 1; s.dmgMul *= 1.35; } },
  { id: 'p_last', aspect: 'pact', pact: true, max: 1, name: 'Нить Мойр', desc: () => 'На последнем сердце урон ×2. Лечение −50%.', stat: (s) => { s.healMul *= 0.5; } },
];

export const BOON = Object.fromEntries(BOONS.map((b) => [b.id, { max: 3, ...b }]));
