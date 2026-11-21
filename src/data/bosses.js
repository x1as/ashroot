// Bosses: movesets built from shared primitives (game/boss.js). Every move has
// wind (telegraph) / act / rec (punish window). Phase 2 at 50% HP adds moves and speeds up,
// but never shortens a telegraph below MIN_TELEGRAPH.
// Each boss tests what its floor taught (Kishōtenketsu "ketsu").
export const BOSSES = {
  warden: {
    name: 'Страж Корней', title: 'Первый узел', floor: 1, sprite: 'warden', color: '#ff8f3a',
    hp: 1700, r: 13, speed: 34, poise: 260,
    tests: 'чтение замаха и уход вбок',
    moves: [
      ['slam', 3, { r: 46, dmg: 24, wind: 0.85, rec: 0.9 }],
      ['charge', 2, { dmg: 20, wind: 0.7, speed: 230, dur: 0.6, rec: 1.0 }],
      ['spikes', 2, { count: 8, step: 18, r: 11, dmg: 16, wind: 0.6, rec: 0.8 }],
    ],
    p2: [
      ['summon', 1, { type: 'husk', n: 2, rec: 0.8 }],
      ['spikes', 2, { count: 10, step: 18, r: 11, dmg: 16, wind: 0.55, rec: 0.7, fan: 3 }],
    ],
  },
  singer: {
    name: 'Утопленная Певчая', title: 'Голос склепа', floor: 2, sprite: 'singer', color: '#63e6cf',
    hp: 2300, r: 11, speed: 40, poise: 220,
    tests: 'дистанция: стрелки + прыгуны',
    moves: [
      ['ring', 3, { n: 16, speed: 85, dmg: 13, waves: 2, gap: 0.5, wind: 0.7, rec: 0.9 }],
      ['volley', 2, { n: 5, spread: 0.6, speed: 150, dmg: 13, bursts: 3, gap: 0.35, wind: 0.6, rec: 0.8 }],
      ['blink', 2, { r: 38, dmg: 22, wind: 0.75, rec: 0.9 }],
    ],
    p2: [
      ['summon', 1, { type: 'hound', n: 2, rec: 0.8 }],
      ['spiral', 2, { dur: 2.4, rate: 0.11, arms: 3, speed: 90, dmg: 12, wind: 0.7, rec: 1.0 }],
    ],
  },
  smith: {
    name: 'Кузнец Пепла', title: 'Горн без огня', floor: 3, sprite: 'smith', color: '#ff8f3a',
    hp: 3200, r: 14, speed: 38, poise: 320, armor: 3,
    tests: 'броня и тяжёлые серии',
    moves: [
      ['combo', 3, { hits: 3, range: 34, arc: 140, dmg: 22, wind: 0.6, gap: 0.38, rec: 1.0 }],
      ['slam', 2, { r: 56, dmg: 28, wind: 0.95, rec: 1.0, embers: 8 }],
      ['rain', 2, { count: 7, r: 18, dmg: 18, wind: 1.0, spread: 70, rec: 0.8 }],
    ],
    p2: [
      ['charge', 2, { dmg: 24, wind: 0.65, speed: 250, dur: 0.6, rec: 0.9, trail: true }],
      ['ring', 1, { n: 20, speed: 80, dmg: 14, waves: 3, gap: 0.45, wind: 0.7, rec: 1.0 }],
    ],
  },
  widow: {
    name: 'Ледяная Вдова', title: 'Белая паутина', floor: 4, sprite: 'widow', color: '#93e2ff',
    hp: 4300, r: 13, speed: 52, poise: 280,
    tests: 'идеальные перекаты под серии',
    moves: [
      ['blink', 2, { r: 40, dmg: 26, wind: 0.7, rec: 0.8 }],
      ['combo', 2, { hits: 4, range: 30, arc: 120, dmg: 20, wind: 0.5, gap: 0.3, rec: 0.9 }],
      ['volley', 2, { n: 7, spread: 0.9, speed: 165, dmg: 15, bursts: 2, gap: 0.4, wind: 0.6, rec: 0.8 }],
      ['spikes', 1, { count: 9, step: 17, r: 10, dmg: 18, wind: 0.55, rec: 0.7, fan: 3 }],
    ],
    p2: [
      ['spiral', 2, { dur: 2.6, rate: 0.09, arms: 4, speed: 95, dmg: 14, wind: 0.65, rec: 1.0 }],
      ['rain', 1, { count: 9, r: 16, dmg: 20, wind: 0.9, spread: 80, rec: 0.8 }],
    ],
  },
  heart: {
    name: 'Сердце Древа', title: 'Гниль, что пустила корни', floor: 5, sprite: 'heart', color: '#e0404f',
    hp: 6200, r: 15, speed: 0, poise: 9999, stationary: true,
    tests: 'всё сразу',
    moves: [
      ['spiral', 2, { dur: 3.0, rate: 0.1, arms: 4, speed: 85, dmg: 14, wind: 0.7, rec: 1.0 }],
      ['ring', 2, { n: 22, speed: 80, dmg: 15, waves: 3, gap: 0.5, wind: 0.7, rec: 0.9 }],
      ['spikes', 2, { count: 12, step: 17, r: 11, dmg: 18, wind: 0.6, rec: 0.7, fan: 5 }],
      ['summon', 1, { type: 'sprout', n: 2, rec: 0.6 }],
      ['rain', 2, { count: 10, r: 17, dmg: 20, wind: 1.0, spread: 90, rec: 0.8 }],
    ],
    p2: [
      ['summon', 1, { type: 'bomber', n: 3, rec: 0.6 }],
      ['volley', 2, { n: 9, spread: 1.2, speed: 150, dmg: 15, bursts: 3, gap: 0.35, wind: 0.6, rec: 0.8 }],
    ],
  },
};
export const BOSS_ORDER = ['warden', 'singer', 'smith', 'widow', 'heart'];
