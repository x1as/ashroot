// TOUGH-BUT-FAIR CONTRACT (checked by tools/balance.mjs):
//  - every attack = wind (telegraph, >= 0.40s) -> act (hit frames) -> rec (punish window, >= 0.55s)
//  - no random damage: an enemy hit always deals exactly dmg * floor scale
//  - last COUNTER_WINDOW seconds of a windup flash white: hitting the enemy then = "КОНТР"
//    (interrupt + stagger + bonus), a parry that needs no extra button on mobile.
//  - at most ATTACK_TOKENS enemies may wind up at the same time (no unreadable pile-ups).
export const COUNTER_WINDOW = 0.18;
export const ATTACK_TOKENS = 2;
export const MIN_TELEGRAPH = 0.4;
export const MIN_PUNISH = 0.55;

// Traits (non-transitive, rock-paper-scissors instead of HP inflation):
//  armor  — flat reduction per hit (kills many-small-hits builds, barely touches heavy hits)
//  shield — frontal 130° block of slash/pierce; broken by guardBreak (warrior), arcane, or a flank
//  resist — % cut of one damage type
//  blink  — teleports away from melee (punishes slow melee, rewarded by range/pierce)
//  inflict — status put on the hero by the hit: stun (hoplite bash), slow (curses, frost, arrows), bleed (claws), burn (Hydra spawn)
export const ENEMIES = {
  husk: {
    name: 'Неупокоенный', hp: 58, dmg: 18, speed: 50, inflict: { kind: 'bleed', t: 3 }, r: 6, poise: 25, ash: 3, mass: 1,
    ai: 'melee', atk: { kind: 'arc', range: 22, arc: 100, wind: 0.6, act: 0.12, rec: 0.62, lunge: 12, cd: 0.7 },
    lore: 'Медленный. Широкий замах — уходи за спину.',
  },
  hound: {
    name: 'Пёс Гекаты', hp: 30, dmg: 12, speed: 112, inflict: { kind: 'bleed', t: 2.5 }, r: 5, poise: 10, ash: 2, mass: 0.6,
    ai: 'lunger', atk: { kind: 'lunge', range: 78, wind: 0.45, act: 0.26, rec: 0.7, dash: 290, cd: 0.85 },
    lore: 'Прыгает по прямой. После прыжка беззащитен.',
  },
  archer: {
    name: 'Спарт-лучник', hp: 36, dmg: 14, speed: 56, inflict: { kind: 'slow', t: 1.2 }, r: 5, poise: 15, ash: 3, mass: 0.8,
    resist: { pierce: 0.5 },
    ai: 'ranged', keep: 110, atk: { kind: 'shoot', range: 200, wind: 0.7, act: 0.05, rec: 0.8, speed: 190, cd: 1.0 },
    lore: 'Стрелы проходят сквозь рёбра: −50% от пронзающего урона.',
  },
  bomber: {
    name: 'Отпрыск Гидры', hp: 20, dmg: 30, speed: 82, inflict: { kind: 'burn', t: 3 }, r: 6, poise: 5, ash: 2, mass: 0.8,
    ai: 'bomber', atk: { kind: 'explode', range: 28, wind: 0.8, act: 0.1, rec: 0, r: 36, cd: 0 },
    deathBlast: 0.45,
    lore: 'Взрывается и при смерти. Бей издалека.',
  },
  shield: {
    name: 'Гоплит Тартара', hp: 66, dmg: 21, speed: 42, inflict: { kind: 'stun', t: 0.55 }, r: 7, poise: 60, ash: 5, mass: 2,
    armor: 6, shield: true,
    ai: 'melee', atk: { kind: 'arc', range: 26, arc: 90, wind: 0.62, act: 0.12, rec: 0.75, lunge: 18, cd: 0.95 },
    lore: 'Щит спереди, броня 6. Обойди, пробей тяжёлым, чарами или натянутой стрелой.',
  },
  caster: {
    name: 'Ламия', hp: 38, dmg: 20, speed: 46, inflict: { kind: 'slow', t: 1.8 }, r: 5, poise: 12, ash: 4, mass: 0.7,
    resist: { arcane: 0.5 }, blink: 55,
    ai: 'caster', keep: 120, atk: { kind: 'cast', range: 220, wind: 0.42, act: 0.9, rec: 1.0, r: 30, cd: 1.9 },
    lore: 'Круг под ногами взрывается через 1 с. Телепортируется от ближнего боя.',
  },
  knight: {
    name: 'Страж Коцита', hp: 92, dmg: 19, speed: 54, inflict: { kind: 'slow', t: 1.4 }, r: 7, poise: 70, ash: 7, mass: 2,
    armor: 4,
    ai: 'melee', atk: { kind: 'combo', hits: 3, range: 26, arc: 110, wind: 0.5, act: 0.1, gap: 0.28, rec: 0.8, lunge: 16, cd: 1.15 },
    lore: 'Серия из трёх ударов. Окно после третьего.',
  },
  sprout: {
    name: 'Отросток Тифона', hp: 46, dmg: 13, speed: 0, r: 6, poise: 999, ash: 3, mass: 99,
    ai: 'turret', atk: { kind: 'radial', range: 999, wind: 0.55, act: 0.05, rec: 1.5, n: 10, speed: 110, cd: 0.5 },
    lore: 'Стоит на месте и стреляет кольцом.',
  },
};

// Elite affixes change behaviour, not just numbers.
export const AFFIXES = {
  swift: { name: 'Крылатый', color: '#93e2ff', speed: 1.35, wind: 0.85 },
  brute: { name: 'Титанический', color: '#ff8f3a', hp: 1.7, poise: 2, size: 1.25, dmg: 1.15 },
  volatile: { name: 'Гидрий', color: '#b4ec5f', deathBlast: 0.6 },
};

// Floor scaling is deliberately mild; difficulty grows through composition (floors.js).
// Steeper since the rework: each depth expects a stronger hero (tree + better gear), not just better play.
export const SCALE = {
  hp: (f) => 1 + 0.6 * (f - 1),
  dmg: (f) => 1 + 0.24 * (f - 1),
  armor: (f) => Math.floor((f - 1) / 2),
  elite: { hp: 2.2, dmg: 1.2, ash: 4 },
};

// Matchup matrix the sim prints: >1 = class has the edge.
export const MATCHUPS_NOTE = 'see tools/balance.mjs';
