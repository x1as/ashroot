// Lifetime stats + achievements engine. Listens to game/events.js, persists into the save.
// To add an achievement: append one object to ACHIEVEMENTS. Nothing else changes.
//   { id, name, desc, on: '<event>', test: (payload, save) => boolean }
import { on } from './events.js';
import { writeSave } from './save.js';
import { G } from './state.js';
import { banner } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';

export const ACHIEVEMENTS = [
  // Examples of the format (disabled until the achievements screen ships):
  // { id: 'first_boss', name: 'Первый узел', desc: 'Убить Стража Корней', on: 'bossKill', test: (e) => e.id === 'warden' },
  // { id: 'untouched', name: 'Нетронутый', desc: 'Убить босса, не пропустив ни удара', on: 'bossKill', test: (e) => e.hitsTaken === 0 },
];

export function unlocked(id) { return !!G.save?.achievements?.[id]; }

export function initAchievements() {
  // lifetime stats (useful for achievements like "1000 kills")
  on('perfect', () => { G.save.stats.perfects++; });
  on('counter', () => { G.save.stats.counters++; });
  on('bossKill', (e) => {
    const s = G.save.stats;
    s.bossKills[e.id] = (s.bossKills[e.id] || 0) + 1;
  });
  on('runEnd', (e) => { if (e.win && (!G.save.stats.bestTime || e.time < G.save.stats.bestTime)) G.save.stats.bestTime = Math.round(e.time); writeSave(G.save); });
  // achievements
  on('*', (payload, evt) => {
    for (const a of ACHIEVEMENTS) {
      if (a.on !== evt || unlocked(a.id)) continue;
      if (!a.test(payload, G.save)) continue;
      G.save.achievements[a.id] = Date.now();
      writeSave(G.save);
      banner('Достижение', a.name, '#ffd36b', 2.4);
      sfx.pick();
    }
  });
}
