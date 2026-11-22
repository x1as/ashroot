// Settings overlay: test codes typed by the player, and a full progress reset (two-step confirm).
// Codes (case-insensitive, Latin or Russian):
//   OLYMPUS / ОЛИМП  — everything: full tree, 50 000 ash, 999 of every resource, every item (divine +10, titanic weapons, all relics)
//   ASHES / ПЕПЕЛ    — +10 000 ash          TREE / ДРЕВО   — every tree node maxed
//   FORGE / КУЗНЯ    — 999 of every resource ARMORY / АРСЕНАЛ — every item type, divine +10 (+ titanic weapons, all relics)
//   GOD / БОГ        — immortality on/off (saved)
import { G } from '../game/state.js';
import { TREE } from '../data/tree.js';
import { BASES, RESOURCES, RELICS } from '../data/items.js';
import { makeItem } from '../game/items.js';
import { writeSave, wipeSave } from '../game/save.js';
import { sfx } from '../engine/audio.js';

const $ = (id) => document.getElementById(id);
let back = null, wipeArmed = 0;

function maxTree(save) { for (const n of TREE) save.nodes[n.id] = n.max; }
function giveRes(save, n) { for (const k in RESOURCES) save.inv.mats[k] = (save.inv.mats[k] || 0) + n; }
function armory(save) {
  const inv = save.inv;
  inv.codex ||= {};
  const add = (it) => { inv.items.push(it); const ck = it.base === 'x_relic' ? 'relic_' + it.relic : it.base; inv.codex[ck] = Math.max(inv.codex[ck] ?? -1, it.rarity); };
  for (const id in BASES) {
    const b = BASES[id];
    if (b.kind === 'relic') { for (const r in RELICS) add(makeItem(id, 5, 3, { relic: r })); continue; }
    const d = makeItem(id, 5, 3); d.up = 10; add(d);
    if (b.slot === 'weapon') { const t = makeItem(id, 5, 2); t.up = 5; add(t); }
  }
  save.cheatBag = Math.max(save.cheatBag || 0, inv.items.length + 60);
  return inv.items.length;
}

const CODES = {
  OLYMPUS: (s) => { maxTree(s); s.ash += 50000; giveRes(s, 999); armory(s); return 'Олимп открыт: всё древо, 50 000 пепла, 999 каждого ресурса и все предметы в сумке.'; },
  ASHES: (s) => { s.ash += 10000; return '+10 000 пепла.'; },
  TREE: (s) => { maxTree(s); return 'Древо изучено полностью: все оружия открыты.'; },
  FORGE: (s) => { giveRes(s, 999); return '+999 каждого ресурса.'; },
  ARMORY: (s) => { armory(s); return 'Все предметы добавлены: божественные +10, титанические оружия, все реликвии.'; },
  GOD: (s) => { s.cheatGod = !s.cheatGod; G.godmode = s.cheatGod; return s.cheatGod ? 'Бессмертие включено.' : 'Бессмертие выключено.'; },
};
const ALIAS = { 'ОЛИМП': 'OLYMPUS', 'ПЕПЕЛ': 'ASHES', 'ДРЕВО': 'TREE', 'КУЗНЯ': 'FORGE', 'АРСЕНАЛ': 'ARMORY', 'БОГ': 'GOD' };

export function applyCode(raw) {
  const k = String(raw || '').trim().toUpperCase();
  const fn = CODES[ALIAS[k] || k];
  if (!fn) return { ok: false, msg: 'Такого кода нет.' };
  const msg = fn(G.save);
  writeSave(G.save);
  return { ok: true, msg };
}

export function showSettings(onClose) {
  back = onClose || null;
  wipeArmed = 0;
  $('btn-wipe').textContent = 'Сбросить весь прогресс';
  $('cheat-out').textContent = '';
  $('settings').hidden = false; G.paused = true; document.body.classList.add('overlay');
  $('cheat').focus(); setTimeout(() => $('cheat').focus(), 30);
}
function hideSettings() {
  $('settings').hidden = true;
  if (back) back(); else { G.paused = false; document.body.classList.remove('overlay'); }
}

export function initSettings() {
  $('cheat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = applyCode($('cheat').value);
    $('cheat-out').textContent = r.msg; $('cheat-out').className = r.ok ? 'good' : 'bad';
    if (r.ok) { $('cheat').value = ''; sfx.pick(); G.ui?.refreshMenu?.(); } else sfx.block();
  });
  // keys typed in the field must not drive the hero
  $('cheat').addEventListener('keydown', (e) => e.stopPropagation());
  $('settings-close').onclick = hideSettings;
  $('btn-wipe').onclick = () => {
    if (Date.now() - wipeArmed > 4000) {
      wipeArmed = Date.now(); $('btn-wipe').textContent = 'Точно? Всё удалится. Нажми ещё раз'; sfx.block();
      setTimeout(() => { if (Date.now() - wipeArmed >= 4000) $('btn-wipe').textContent = 'Сбросить весь прогресс'; }, 4100);
      return;
    }
    wipeSave();
    location.reload();
  };
  if (G.save.cheatGod) G.godmode = true;
}
