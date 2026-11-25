// Settings overlay: promo codes and a full progress reset (two-step confirm).
// Codes are stored only as hashes: neither the source nor the published bundle reveals them.
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

const REWARDS = {
  all: (s) => { maxTree(s); s.ash += 50000; giveRes(s, 999); armory(s); return 'Олимп открыт: всё древо, 50 000 пепла, 999 каждого ресурса и все предметы в сумке.'; },
  ash: (s) => { s.ash += 10000; return '+10 000 пепла.'; },
  tree: (s) => { maxTree(s); return 'Древо изучено полностью: все оружия открыты.'; },
  res: (s) => { giveRes(s, 999); return '+999 каждого ресурса.'; },
  items: (s) => { armory(s); return 'Все предметы добавлены: божественные +10, титанические оружия, все реликвии.'; },
  god: (s) => { s.cheatGod = !s.cheatGod; G.godmode = s.cheatGod; return s.cheatGod ? 'Бессмертие включено.' : 'Бессмертие выключено.'; },
};
// cyrb53 hash of the upper-cased code (Latin and Russian spellings) -> reward
const HASHES = {
  '1xxu1qi472d': 'all', vibrdynd42: 'all', '16clbay9hy5': 'ash', '1cq291hcv0s': 'ash', frntw2evi3: 'tree', g5m7glgzi3: 'tree',
  '2it5hnrp3h': 'res', '2emshkw6yn': 'res', '1djy4ba7h20': 'items', v0hjpcsgs4: 'items', '5at5dz468a': 'god', caqbb4qujl: 'god',
};
const cyrb53 = (str, seed = 1808) => { let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed; for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36); };

export function applyCode(raw) {
  const fn = REWARDS[HASHES[cyrb53(String(raw || '').trim().toUpperCase())]];
  if (!fn) return { ok: false, msg: 'Промокод не подошёл.' };
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
