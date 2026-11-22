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

// weapon metal follows the item's rarity (mortal iron, heroic bronze, titanic steel, divine gold)
const WPAL = [
  { s: '#bdb6a6', S: '#8d8473', T: '#5c5446', Y: '#8a7c68', w: '#e8e2d2' },
  { s: '#f0d9a0', S: '#c8924a', T: '#7a5126', Y: '#7fb2ff', w: '#fff3d0' },
  { s: '#c9d2e8', S: '#7d86a8', T: '#3b3f5c', Y: '#c9a6ff', w: '#f0f4ff' },
  { s: '#fff6c8', S: '#ffd36b', T: '#b8862e', Y: '#ffffff', w: '#ffffff' },
];
const wcache = new Map();
export function weaponSprite(key, rarity = 0) {
  const k = key + '|' + rarity;
  if (!wcache.has(k)) {
    const spr = bake(WEAPON[key], { pal: WPAL[rarity], accent: HERO.accent });
    spr.glow = rarity >= 2 ? tint(spr, rarity === 3 ? '#ffd36b' : '#b88cff') : null;
    wcache.set(k, spr);
  }
  return wcache.get(k);
}

// silhouette of a weapon in a god's colour (aspect aura drawn behind the blade)
const tcache = new Map();
export function weaponTint(key, rarity, color) {
  const k = key + '|' + rarity + '|' + color;
  if (!tcache.has(k)) tcache.set(k, tint(weaponSprite(key, rarity), color));
  return tcache.get(k);
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
