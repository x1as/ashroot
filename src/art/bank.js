// Bakes every sprite once at boot. Frame sets are DERIVED from frame one (body) so they never drift.
import { bake, tint } from '../engine/sprite.js';
import { BODY, LEGS, ROBE, LEGMAP, WEAPON, ENEMY_ART, BOSS_ART, ICON } from './pixels.js';
import { CLASSES } from '../data/classes.js';

export const SPR = { hero: {}, weapon: {}, enemy: {}, boss: {}, icon: {}, ghost: {} };

const SPROUT = [
  '....G..g....',
  '...gG.Gg....',
  '....GgG.....',
  '..vZZZZZv...',
  '.vZzrrrzZv..',
  'vZzrkykrzZv.',
  'vZzrrrrrzZv.',
  '.vZZzzzZZv..',
  'NnNvvvvvNnN.',
];

function heroFrames(cls) {
  const body = BODY[cls];
  const legs = cls === 'mage' ? ROBE : LEGS;
  const map = LEGMAP[cls];
  const accent = CLASSES[cls].accent;
  const breathe = ['............', ...body.slice(0, 7), ...body.slice(8)]; // upper body sinks 1px
  const f = (b, l) => bake([...b, ...l], { map, accent });
  return {
    idle: [f(body, legs.stand), f(breathe, legs.stand)],
    run: legs.run.map((l, i) => f(i === 1 ? breathe : body, l)),
  };
}

export function bakeAll() {
  for (const cls of Object.keys(BODY)) {
    SPR.hero[cls] = heroFrames(cls);
    SPR.ghost[cls] = tint(SPR.hero[cls].idle[0], '#b8aa90');
  }
  for (const [k, rows] of Object.entries(WEAPON)) SPR.weapon[k] = bake(rows, { accent: ['#ece4d0', '#b8aa90'] });
  for (const cls of Object.keys(CLASSES)) SPR.weapon['arrow_' + cls] = bake(WEAPON.arrow, { accent: CLASSES[cls].accent });
  for (const [k, rows] of Object.entries(ENEMY_ART)) SPR.enemy[k] = bake(rows);
  // the Ice Knight is a fallen warrior: same frame-one body, frost palette
  SPR.enemy.knight = bake([...BODY.warrior, ...LEGS.stand], { map: { T: 'F', S: 'f', s: 'w', x: 'r', X: 'R', n: 'F', N: 'T', y: 'f', b: 'f', L: 'F', B: 'T' } });
  SPR.enemy.sprout = bake(SPROUT);
  for (const [k, rows] of Object.entries(BOSS_ART)) SPR.boss[k] = bake(rows);
  for (const [k, rows] of Object.entries(ICON)) SPR.icon[k] = bake(rows);
  // white-silhouette versions are built inside bake() (hit flash)
  return SPR;
}

// enemy walk: procedural 2-step waddle (squash) — enemies have one frame, motion comes from easing
export function enemySprite(type) { return SPR.enemy[type]; }
