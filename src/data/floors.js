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
  { id: 'bonfire', name: 'Костёр', tension: 0, icon: 'fire' },
  { id: 'boss', name: 'Босс', tension: 10, icon: 'pact' },
];

export const FLOORS = [
  {
    name: 'Корни', sub: 'Глубина I', boss: 'warden',
    fresh: ['husk', 'hound'], pool: ['husk', 'hound'],
    ranged: [], terrain: 'chasm',
    theme: { floor: ['#211b2a', '#272033', '#1c1724'], wall: ['#3a3048', '#2a2236', '#4c405e'], fog: [12, 8, 18], accent: '#ff8f3a', speck: '#3b2f2a' },
  },
  {
    name: 'Затопленные склепы', sub: 'Глубина II', boss: 'singer',
    fresh: ['archer', 'bomber'], pool: ['husk', 'hound', 'archer', 'bomber'],
    ranged: ['archer'], terrain: 'spikes',
    theme: { floor: ['#18252a', '#1d2c31', '#142024'], wall: ['#2c4048', '#1f3036', '#3c5660'], fog: [6, 14, 18], accent: '#63e6cf', speck: '#2f8f84' },
  },
  {
    name: 'Пепельная кузня', sub: 'Глубина III', boss: 'smith',
    fresh: ['shield', 'caster'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster'],
    ranged: ['archer', 'caster'], terrain: 'chasm',
    theme: { floor: ['#2a1c18', '#31211c', '#231713'], wall: ['#4a2e24', '#36211a', '#5e3b2d'], fog: [18, 8, 4], accent: '#ff8f3a', speck: '#b5481c' },
  },
  {
    name: 'Ледяной собор', sub: 'Глубина IV', boss: 'widow',
    fresh: ['knight'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster', 'knight'],
    ranged: ['archer', 'caster'], terrain: 'spikes', elites: true,
    theme: { floor: ['#1e2533', '#232b3b', '#191f2b'], wall: ['#34405a', '#262f44', '#475775'], fog: [8, 12, 22], accent: '#93e2ff', speck: '#4b8fc9' },
  },
  {
    name: 'Сердце гнили', sub: 'Глубина V', boss: 'heart',
    fresh: ['sprout'], pool: ['husk', 'hound', 'archer', 'bomber', 'shield', 'caster', 'knight', 'sprout'],
    ranged: ['archer', 'caster', 'sprout'], terrain: 'both', elites: true,
    theme: { floor: ['#261820', '#2d1c26', '#1f131a'], wall: ['#4a2434', '#371a27', '#5e3044'], fog: [18, 4, 10], accent: '#e0404f', speck: '#8c1c33' },
  },
];

const MELEE = ['husk', 'hound', 'shield', 'knight', 'bomber'];

// Returns waves: [[type, elite?], ...][]. Deterministic shape, random fill.
export function composeRoom(floorIdx, roomIdx, opts = {}) {
  const F = FLOORS[floorIdx], f = floorIdx + 1;
  const plan = ROOM_PLAN[roomIdx].id;
  const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const melee = F.pool.filter((t) => MELEE.includes(t));
  const ranged = F.ranged.length ? F.ranged : ['hound'];
  const W = (list) => list.map((t) => (Array.isArray(t) ? t : [t, false]));
  switch (plan) {
    case 'meet': {
      // the new enemy alone first, then the second new enemy with one familiar face
      const [a, b] = F.fresh;
      const w1 = [a];
      const w2 = b ? [b, b] : [a, rnd(melee)];
      if (f >= 3) w2.push(rnd(F.pool));
      return [W(w1), W(w2)];
    }
    case 'terrain': {
      const n = 3 + Math.floor(f / 2);
      const w1 = Array.from({ length: n }, (_, i) => (i < 2 ? F.fresh[i % F.fresh.length] : rnd(melee)));
      const w2 = Array.from({ length: n - 1 }, () => rnd(F.pool));
      return [W(w1), W(w2)];
    }
    case 'twist': {
      // ten: different attack ranges at once — the real test of positioning
      const w1 = [rnd(melee), rnd(melee), rnd(ranged)];
      const w2 = [rnd(ranged), rnd(melee), F.fresh[0]];
      if (f >= 2) w1.push(rnd(ranged));
      if (f >= 3) w2.push(rnd(melee), rnd(ranged));
      if (f >= 4) w2.push([rnd(melee), true]);
      return [W(w1), W(w2)];
    }
    case 'fork': {
      // breather: a small, readable wave before the route choice
      return [W([rnd(melee), rnd(F.pool)].slice(0, f >= 3 ? 2 : 1).concat(f >= 4 ? [rnd(F.pool)] : []))];
    }
    case 'arena': {
      const boss = [F.fresh[0], true];
      const w1 = [boss, rnd(melee)];
      const w2 = [rnd(ranged), rnd(melee), rnd(F.pool)];
      if (f >= 3) w2.push(rnd(F.pool));
      if (opts.cursed) { w2.push([rnd(F.pool), true]); w1.push(rnd(ranged)); }
      return [W(w1), W(w2)];
    }
    default:
      return [];
  }
}
