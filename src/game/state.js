// Single shared game context. Modules read/write G instead of threading params everywhere.
export const G = {
  t: 0,             // game time (scaled)
  real: 0,          // real time
  freeze: 0,        // hit-stop seconds (sim paused, render continues)
  slow: 0,          // slow-mo remaining (real seconds)
  slowScale: 0.3,
  save: null,
  run: null,        // current run (game/run.js)
  room: null,       // current room (game/world.js)
  player: null,
  enemies: [], projs: [], hazards: [], pickups: [], zones: [],
  parts: [], texts: [], arcs: [], rings: [], lights: [],
  cam: { x: 0, y: 0, trauma: 0, kick: { x: 0, y: 0 } },
  flash: { a: 0, color: '#fff' },
  vign: 0,          // red damage vignette
  view: { w: 320, h: 180, scale: 3, cw: 960, ch: 540 },
  debug: false,
  banner: null,     // big centred title (boss names, "ЧИСТО", ...)
  paused: false,
  mode: 'menu',     // menu | game
};

export function resetWorld() {
  G.enemies = []; G.projs = []; G.hazards = []; G.pickups = []; G.zones = [];
  G.parts = []; G.texts = []; G.arcs = []; G.rings = [];
}
