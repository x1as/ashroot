// 5 floors x (5 rooms + bonfire + boss).
// Each floor is one Kishōtenketsu phrase built around its NEW enemies:
//   1 ВСТРЕЧА  (ki)    new enemy alone in a safe open room — learn the pattern
//   2 МЕСТО    (shō)   same enemy + terrain: chasms, bridges, spike rhythm
//   3 ПОВОРОТ  (ten)   twist: mix of attack ranges (melee + ranged + caster)
//   4 РАЗВИЛКА         breather (Interest Curve dip) + route choice: safe / cursed path
//   5 АРЕНА    (ketsu) elite mini-boss arena testing everything
//   КОСТЁР            safe zone, no enemies: rest or sacrifice
//   БОСС              peak
// Interest curve per floor (tension 0..10): 3, 5, 7, 3, 8, 0, 10 — pulsing, never flat.
export const ROOM_PLAN = [
  { id: 'meet', name: 'Встреча', tension: 3, icon: 'seed' },
  { id: 'terrain', name: 'Местность', tension: 5, icon: 'boot' },
  { id: 'twist', name: 'Поворот', tension: 7, icon: 'storm' },
  { id: 'fork', name: 'Развилка', tension: 3, icon: 'dice' },
  { id: 'arena', name: 'Арена', tension: 8, icon: 'star' },
  { id: 'bonfire', name: 'Очаг Гестии', tension: 0, icon: 'fire' },
  { id: 'boss', name: 'Босс', tension: 10, icon: 'pact' },
];

export const FLOORS = [
  {
    name: 'Корни Эреба', sub: 'Глубина I', boss: 'warden',
    fresh: ['husk', 'hound'], pool: ['husk', 'hound'],
    ranged: [], terrain: 'chasm',
    theme: { floor: ['#211b2a', '#272033', '#1c1724'], wall: ['#3a3048', '#2a2236', '#4c405e'], fog: [12, 8, 18], accent: '#ff8f3a', speck: '#3b2f2a' },
  },
  {
    name: 'Стикс', sub: 'Глубина II', boss: 'singer',
    fresh: ['archer', 'bomber'], pool: ['husk', 'hound', 'archer', 'bomber'],
    ranged: ['archer'], terrain: 'spikes',
    theme: { floor: ['#18252a', '#1d2c31', '#142024'], wall: ['#2c4048', '#1f3036', '#3c5660'], fog: [6, 14, 18], accent: '#63e6cf', speck: '#2f8f84' },
  },
  {
    name: 'Флегетон', sub: 'Глубина III', boss: 'smith',
    fresh: ['shield', 'caster'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster'],
    ranged: ['archer', 'caster'], terrain: 'chasm',
    theme: { floor: ['#2a1c18', '#31211c', '#231713'], wall: ['#4a2e24', '#36211a', '#5e3b2d'], fog: [18, 8, 4], accent: '#ff8f3a', speck: '#b5481c' },
  },
  {
    name: 'Коцит', sub: 'Глубина IV', boss: 'widow',
    fresh: ['knight'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster', 'knight'],
    ranged: ['archer', 'caster'], terrain: 'spikes', elites: true,
    theme: { floor: ['#1e2533', '#232b3b', '#191f2b'], wall: ['#34405a', '#262f44', '#475775'], fog: [8, 12, 22], accent: '#93e2ff', speck: '#4b8fc9' },
  },
  {
    name: 'Тартар', sub: 'Глубина V', boss: 'heart',
    fresh: ['sprout'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster', 'knight', 'sprout'],
    ranged: ['archer', 'caster', 'sprout'], terrain: 'both', elites: true,
    theme: { floor: ['#261820', '#2d1c26', '#1f131a'], wall: ['#4a2434', '#371a27', '#5e3044'], fog: [18, 4, 10], accent: '#e0404f', speck: '#8c1c33' },
  },
];

const MELEE = ['husk', 'hound', 'shield', 'knight', 'bomber'];

// Returns waves: [[type, elite?], ...][]. Rooms now hold ~60 s: 3-4 waves that escalate (Interest Curve inside
// the room too: a readable opener, a mixed middle, a heavy last wave). Kishōtenketsu shape per room is kept.
export function composeRoom(floorIdx, roomIdx, opts = {}) {
  const F = FLOORS[floorIdx], f = floorIdx + 1;
  const plan = ROOM_PLAN[roomIdx].id;
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const melee = F.pool.filter((t) => MELEE.includes(t));
  const ranged = F.ranged.length ? F.ranged : ['hound'];
  // new enemies of this floor appear twice as often
  const any = () => (Math.random() < 0.4 ? rnd(F.fresh) : rnd(F.pool));
  const W = (list) => list.map((t) => (Array.isArray(t) ? t : [t, false]));
  const fill = (n, fn) => Array.from({ length: n }, fn);
  const g = Math.floor((f - 1) / 2); // +1 enemy per wave every two floors
  switch (plan) {
    case 'meet': {
      const [a, b] = F.fresh;
      return [W([a]), W([b || a, b || a, rnd(melee)]), W(fill(4 + g, any)), W(fill(4 + g, any).concat([a]))];
    }
    case 'terrain':
      return [W(fill(4 + g, () => rnd(melee))), W(fill(4 + g, any)), W(fill(5 + g, any)), W(fill(5 + g, any))];
    case 'twist':
      return [
        W([rnd(melee), rnd(melee), rnd(ranged), rnd(ranged)]),
        W(fill(3 + g, () => rnd(melee)).concat([rnd(ranged), F.fresh[0]])),
        W(fill(3 + g, () => rnd(ranged)).concat([rnd(melee), rnd(melee)])),
        W(fill(5 + g, any).concat(f >= 3 ? [[rnd(melee), true]] : [])),
      ];
    case 'fork':
      // breather: two light waves before the route choice
      return [W(fill(2 + g, () => rnd(melee))), W(fill(3 + g, any))];
    case 'arena': {
      const w = [W([[F.fresh[0], true], rnd(melee), rnd(ranged)]), W(fill(4 + g, any)), W(fill(4 + g, any).concat([[rnd(F.pool), true]])), W(fill(5 + g, any))];
      if (opts.cursed) { w[1].push([rnd(F.pool), true]); w[3].push([rnd(F.pool), true]); }
      return w;
    }
    default:
      return [];
  }
}
