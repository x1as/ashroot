// Single-player save in the browser (localStorage). Robust by design:
//  - versioned schema + migrations (old saves keep working after updates)
//  - every write goes to MAIN and BACKUP keys; a corrupted main falls back to the backup
//  - every access guarded: private mode / blocked storage still plays (progress just isn't kept)
import { newInventory } from './items.js';
import { TREE_BY_ID, nodeCost } from '../data/tree.js';

export const SAVE_VERSION = 3;
const KEY = 'ashroot.save.v1';       // key name kept for compatibility with existing saves
const BACKUP = 'ashroot.save.backup';

const fresh = () => ({
  version: SAVE_VERSION,
  ash: 0, nodes: {}, echo: null, muted: false, seenHelp: false,
  inv: newInventory(), // { items, mats, equip }
  stats: { runs: 0, wins: 0, bestFloor: 0, kills: 0, deaths: 0, perfects: 0, counters: 0, bossKills: {}, bestTime: 0, ashEarned: 0 },
  achievements: {}, // id -> unlock timestamp (filled by game/achievements.js)
  createdAt: Date.now(), updatedAt: Date.now(),
});

// each step upgrades a save from version N to N+1
const MIGRATIONS = {
  1: (s) => { s.stats = { ...fresh().stats, ...(s.stats || {}) }; s.achievements = s.achievements || {}; s.createdAt = s.createdAt || Date.now(); return s; },
  // v3: classes removed, tree rebuilt -> full respec (all spent ash refunded), starter inventory
  2: (s) => {
    let refund = 0;
    for (const [id, r] of Object.entries(s.nodes || {})) for (let k = 0; k < r; k++) refund += TREE_BY_ID[id] ? nodeCost(TREE_BY_ID[id], k) : 60;
    s.ash = (s.ash || 0) + refund; s.nodes = {}; s.respecRefund = refund;
    delete s.cls;
    if (s.echo) delete s.echo.cls;
    s.inv = newInventory();
    return s;
  },
};

function migrate(s) {
  let v = s.version || 1;
  while (v < SAVE_VERSION) { s = MIGRATIONS[v](s); v++; }
  s.version = SAVE_VERSION;
  const base = fresh();
  return { ...base, ...s, stats: { ...base.stats, ...s.stats }, inv: s.inv || base.inv };
}

function read(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function loadSave() {
  const s = read(KEY) || read(BACKUP);
  return s ? migrate(s) : fresh();
}
export function writeSave(s) {
  s.updatedAt = Date.now();
  try {
    const raw = JSON.stringify(s);
    localStorage.setItem(KEY, raw);
    localStorage.setItem(BACKUP, raw);
  } catch { /* storage unavailable */ }
}
export function wipeSave() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP); } catch { /* ignore */ }
  return fresh();
}
// manual backup between devices/browsers: a copyable string
export const exportSave = (s) => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
export function importSave(str) {
  const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
  if (typeof s !== 'object' || s === null || typeof s.ash !== 'number') throw new Error('bad save');
  return migrate(s);
}
