import { showSettings, initSettings } from './settings.js';
// DOM overlays: reward cards, bonfire, pause, death / victory.
import { G } from '../game/state.js';
import { ASPECTS, BOON, RESONANCE } from '../data/boons.js';
import { WEAPONS } from '../data/weapons.js';
import { showGear, initGear } from './inventory.js';
import { recompute } from '../game/run.js';
import { renderPanel } from './menu.js';
import { FLOORS } from '../data/floors.js';
import { SPR } from '../art/bank.js';
import { toDataURL } from '../engine/sprite.js';
import { sfx, setMuted, setDrone } from '../engine/audio.js';
import { input } from '../engine/input.js';
import { addBoon, rollOffer, finishVictory } from '../game/run.js';
import { writeSave } from '../game/save.js';
import { openExits } from '../game/world.js';
import { text, ring, banner } from '../engine/fx.js';
import { showMenu } from './menu.js';

const $ = (id) => document.getElementById(id);
const ROMAN = ['', 'I', 'II', 'III'];
const iconCache = {};
const iconURL = (name) => (iconCache[name] ||= toDataURL(SPR.icon[name], 6));

let keyHandler = null;
function bindKeys(fn) { keyHandler = fn; }
addEventListener('keydown', (e) => { if (keyHandler) keyHandler(e); });

function openOverlay(id) { $(id).hidden = false; G.paused = true; input.clear(); document.body.classList.add('overlay'); }
function closeOverlay(id) { $(id).hidden = true; G.paused = false; bindKeys(null); input.clear(); document.body.classList.remove('overlay'); }

function cardHTML(b, i) {
  const r = G.run, cur = r.boons[b.id] || 0, A = ASPECTS[b.aspect];
  const have = r.aspects[b.aspect] || 0;
  const res = b.aspect !== 'neutral' && b.aspect !== 'pact'
    ? `<p class="reso">${A.name} ${have}→${have + 1}${have + 1 === 3 ? ` · <b>Резонанс I</b>: ${RESONANCE[b.aspect][0]}` : have + 1 === 5 ? ` · <b>Резонанс II</b>: ${RESONANCE[b.aspect][1]}` : ` · до резонанса ${have < 3 ? 3 - have - 1 : 5 - have - 1}`}</p>` : '';
  const lvl = (b.max || 3) > 1 ? `<span class="lvl">${cur ? ROMAN[cur] + ' → ' : ''}${ROMAN[cur + 1]}</span>` : '';
  return `<button class="card ${b.pact ? 'pact' : ''} ${b.weapon ? 'clsboon' : ''}" data-i="${i}" style="--c:${A.color};--d:${i * 70}ms">
    <span class="key">${i + 1}</span>
    <img alt="" src="${iconURL(A.icon)}">
    <span class="asp">${b.pact ? 'Пакт · риск' : b.weapon ? `${A.name} · ${WEAPONS[b.weapon].name}` : A.name}</span>
    <h3>${b.name} ${lvl}</h3>
    <p class="d">${b.desc(cur + 1)}</p>
    ${res}
  </button>`;
}

const fmtH = (h) => (Math.round(h * 4) / 4).toString().replace('.', ',');
export const ui = {
  showCards({ title, offer, canRest, picksLeft, onDone }) {
    const P = G.player, r = G.run;
    let left = picksLeft;
    const render = (list) => {
      $('cards-title').textContent = left > 1 ? `${title} · осталось ${left}` : title;
      $('cards-list').innerHTML = list.map(cardHTML).join('');
      $('cards-list').style.setProperty('--n', list.length);
      const rest = $('btn-rest'), reroll = $('btn-reroll');
      rest.hidden = !canRest;
      rest.textContent = `Отдохнуть вместо дара: +2 сердца (сейчас ${fmtH(P.hp)} из ${P.s.maxHp})`;
      reroll.hidden = r.rerolls <= 0;
      reroll.textContent = `Перебросить (${r.rerolls})`;
      for (const el of $('cards-list').querySelectorAll('.card')) el.onclick = () => choose(list[+el.dataset.i]);
    };
    let current = offer;
    const finish = () => { closeOverlay('cards'); onDone?.(); };
    const choose = (b) => {
      addBoon(b.id);
      text(P.x, P.y - 26, b.name, ASPECTS[b.aspect].color, true);
      ring(P.x, P.y - 6, 3, 24, 0.4, ASPECTS[b.aspect].color, 2);
      left--;
      if (left > 0) { current = rollOffer(P.s.cards); render(current); return; }
      finish();
    };
    $('btn-rest').onclick = () => { P.hp = Math.min(P.s.maxHp, P.hp + 2); sfx.flask(); text(P.x, P.y - 26, 'отдых', '#b4ec5f', true); left--; if (left > 0) { current = rollOffer(P.s.cards); render(current); } else finish(); };
    $('btn-reroll').onclick = () => { if (r.rerolls <= 0) return; r.rerolls--; sfx.ui(); current = rollOffer(P.s.cards); render(current); };
    render(current);
    openOverlay('cards');
    bindKeys((e) => { const k = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code]; if (k !== undefined && current[k]) choose(current[k]); });
  },

  showBonfire() {
    const P = G.player;
    $('bonfire').hidden = false;
    openOverlay('bonfire');
    const done = () => { closeOverlay('bonfire'); { openExits(G.room); sfx.door(); } };
    $('bf-rest').onclick = () => {
      P.hp = Math.min(P.s.maxHp, P.hp + 3); P.flasks = Math.min(P.s.flasks, P.flasks + 1);
      sfx.flask(); text(P.x, P.y - 26, '+3 ♥, +1 нектар', '#b4ec5f', true); done();
    };
    $('bf-forge').onclick = () => { $('bonfire').hidden = true; showGear({ forge: true, tab: 'forge', onClose: () => { $('bonfire').hidden = false; G.paused = true; document.body.classList.add('overlay'); } }); };
    $('bf-sac').onclick = () => {
      closeOverlay('bonfire');
      ui.showCards({ title: 'Жертва: дар без отдыха', offer: rollOffer(P.s.cards + 1), canRest: false, picksLeft: 1, onDone: () => { openExits(G.room); sfx.door(); } });
    };
    $('bf-hp').textContent = `Сердца ${fmtH(P.hp)} из ${P.s.maxHp} · нектар ${P.flasks} из ${P.s.flasks}`;
    bindKeys((e) => { if (e.code === 'Digit1') $('bf-rest').click(); if (e.code === 'Digit2') $('bf-sac').click(); });
  },

  showEnd(win) {
    const r = G.run, save = G.save, F = FLOORS[r.floor - 1];
    if (win) finishVictory();
    const el = $('end');
    el.classList.toggle('win', win);
    $('end-title').textContent = win ? 'Сад Гесперид спасён' : 'Ты пал';
    const mins = Math.floor(r.time / 60), secs = Math.floor(r.time % 60);
    const lines = [
      ['Глубина', `${F.sub} · ${F.name}`], ['Время', `${mins}:${String(secs).padStart(2, '0')}`], ['Убито', r.kills],
      ['Идеальных перекатов', r.perfects], ['Пропущено ударов', r.hitsTaken], ['Даров', r.picks],
      ['Пепел в древо', win ? r.banked : `${r.banked} + ${r.deathKeep || 0}`],
    ];
    if (!win && save.echo) lines.push(['Твоя тень', `${save.echo.ash} пепла ждут на глубине ${save.echo.floor}`]);
    $('end-stats').innerHTML = lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    openOverlay('end');
    setDrone(0);
    $('end-again').onclick = () => { closeOverlay('end'); showMenu(); };
    bindKeys((e) => { if (e.code === 'Enter' || e.code === 'Space') $('end-again').click(); });
  },

  togglePause() {
    if (G.mode !== 'game' || !$('cards').hidden || !$('bonfire').hidden || !$('end').hidden || !$('gear').hidden || G.real - (G.gearClosedAt || -9) < 0.25) return;
    if ($('pause').hidden) {
      openOverlay('pause');
      const r = G.run;
      $('pause-boons').innerHTML = Object.entries(r.boons).map(([id, l]) => { const b = BOON[id], A = ASPECTS[b.aspect]; return `<li style="--c:${A.color}"><img alt="" src="${iconURL(A.icon)}"><b>${b.name}</b> ${b.max > 1 ? ROMAN[l] : ''}<span>${b.desc(l)}</span></li>`; }).join('') || '<li class="empty">Даров пока нет</li>';
      $('btn-mute').textContent = save().muted ? 'Звук: выкл' : 'Звук: вкл';
    } else closeOverlay('pause');
  },
};
const save = () => G.save;

export function initScreens() {
  initSettings();
  $('btn-resume').onclick = () => ui.togglePause();
  $('btn-abandon').onclick = () => { closeOverlay('pause'); G.player.hp = 0; G.player.die(); };
  $('btn-mute').onclick = () => { const s = save(); s.muted = !s.muted; setMuted(s.muted); writeSave(s); $('btn-mute').textContent = s.muted ? 'Звук: выкл' : 'Звук: вкл'; };
  $('btn-pause').onclick = () => ui.togglePause();
  $('btn-settings-pause').onclick = () => { $('pause').hidden = true; showSettings(() => { $('pause').hidden = false; }); };
  $('btn-gear-pause').onclick = () => { closeOverlay('pause'); showGear({ forge: false, onClose: () => {} }); };
  initGear();
  ui.showGear = showGear;
  G.onGearChanged = () => { G.gearClosedAt = G.real; if (G.run && G.player) recompute(); else if (G.mode === 'menu') renderPanel(); };
  G.ui = ui;
}
