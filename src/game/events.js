// Game event bus. Gameplay code only EMITS facts; stats and achievements LISTEN.
// Adding an achievement later never touches combat code.
//
// Events and payloads:
//   runStart   { cls }
//   runEnd     { win, cls, floor, time, kills, hitsTaken, perfects, picks, pacts }
//   kill       { type, elite, boss }
//   bossKill   { id, floor, time, hitsTaken, cls }
//   roomClear  { floor, plan, time, courage }
//   perfect    {}            counter  { type }
//   boonPick   { id, aspect } resonance { aspect, tier }
//   nodeBuy    { id, rank }   echo     { ash }
const handlers = {};
export function on(evt, fn) { (handlers[evt] ||= []).push(fn); return () => { handlers[evt] = handlers[evt].filter((f) => f !== fn); }; }
export function emit(evt, data = {}) {
  for (const fn of handlers[evt] || []) {
    try { fn(data, evt); } catch (e) { console.error('[events]', evt, e); }
  }
  for (const fn of handlers['*'] || []) {
    try { fn(data, evt); } catch (e) { console.error('[events]', evt, e); }
  }
}
