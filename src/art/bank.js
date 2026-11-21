// Bakes every sprite once at boot (hero looks lazily, cached). Frame sets are DERIVED from frame one
// so they never drift; all canvases are Scale2x (see engine/sprite.js).
import { bake, tint } from '../engine/sprite.js';
import { HEAD, TORSO, LEGS, LEGMAP, KNIGHT_BODY, WEAPON, ENEMY_ART, BOSS_ART, ICON } from './pixels.js';
import { HERO } from '../data/weapons.js';

export const SPR = { weapon: {}, enemy: {}, boss: {}, icon: {}, ghost: null };

const SPROUT = [
  '....G..g....', '...gG.Gg....', '....GgG.....', '..vZZZZZv...', '.vZzrrrzZv..',
  'vZzrkykrzZv.', 'vZzrrrrrzZv.', '.vZZzzzZZv..', 'NnNvvvvvNnN.',
];

export const ELEMENT_ACCENT = {
  blood: ['#e0404f', '#8c1c33'], fire: ['#ff8f3a', '#b5481c'], frost: ['#93e2ff', '#4b8fc9'],
  storm: ['#ffd36b', '#b88a2e'], shadow: ['#b88cff', '#6a44c2'],
};

// look = { helm, chest, boots: 'none'|'light'|'medium'|'heavy', element }
const heroCache = new Map();
export function heroFrames(look = {}) {
  const key = `${look.helm || 'none'}|${look.chest || 'none'}|${look.boots || 'none'}|${look.element || ''}`;
  if (heroCache.has(key)) return heroCache.get(key);
  const accent = look.element ? ELEMENT_ACCENT[look.element] : HERO.accent;
  const body = [...HEAD[look.helm || 'none'], ...TORSO[look.chest || 'none']];
  const map = LEGMAP[look.boots || 'none'];
  const breathe = ['............', ...body.slice(0, 7), ...body.slice(8)]; // upper body sinks 1px
  const f = (b, l) => bake([...b, ...l], { map, accent });
  const fr = { idle: [f(body, LEGS.stand), f(breathe, LEGS.stand)], run: LEGS.run.map((l, i) => f(i === 1 ? breathe : body, l)), accent };
  fr.ghost = tint(fr.idle[0], '#b8aa90');
  heroCache.set(key, fr);
  return fr;
}

export function bakeAll() {
  for (const [k, rows] of Object.entries(WEAPON)) SPR.weapon[k] = bake(rows, { accent: HERO.accent });
  for (const [el, acc] of Object.entries({ none: HERO.accent, ...ELEMENT_ACCENT })) SPR.weapon['arrow_' + el] = bake(WEAPON.arrow, { accent: acc });
  for (const [k, rows] of Object.entries(ENEMY_ART)) SPR.enemy[k] = bake(rows);
  SPR.enemy.knight = bake([...KNIGHT_BODY, ...LEGS.stand], { map: { T: 'F', S: 'f', s: 'w', x: 'r', X: 'R', n: 'F', N: 'T', y: 'f', b: 'f', L: 'F', B: 'T' } });
  SPR.enemy.sprout = bake(SPROUT);
  for (const [k, rows] of Object.entries(BOSS_ART)) SPR.boss[k] = bake(rows);
  for (const [k, rows] of Object.entries(ICON)) SPR.icon[k] = bake(rows);
  SPR.ghost = heroFrames({}).ghost;
  return SPR;
}
