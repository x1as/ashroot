// Boot + main loop. Variable dt (clamped) for smoothness on 60/120/144 Hz; slow-mo and
// hit-stop scale only the simulation, never the camera or UI.
import { G } from './game/state.js';
import { bakeAll } from './art/bank.js';
import { input, initInput } from './engine/input.js';
import { initAudio, setMuted } from './engine/audio.js';
import { updateRealFx } from './engine/fx.js';
import { loadSave, writeSave } from './game/save.js';
import { initScene, resizeBuffers, updateGame, updateCamera, renderGame, screenToWorld } from './game/scene.js';
import { initMenu, showMenu, renderMenu, updateMenu, resizeMenu } from './ui/menu.js';
import { initScreens, ui } from './ui/screens.js';
import { initAchievements } from './game/achievements.js';
import { onPlayerDeath, onBossDeath, enterRoom, startRun } from './game/run.js';
import { killEnemy } from './game/combat.js';
import { openExits, updateFlow, flowDir, los } from './game/world.js';
import { ROOM_PLAN } from './data/floors.js';
import { RES } from './engine/sprite.js';
import { makeItem, equipItem } from './game/items.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const cw = window.innerWidth, ch = window.innerHeight;
  // full device resolution up to 2K (2560 px on the long side) — sharper on big screens, capped for speed
  const dpr = Math.min(window.devicePixelRatio || 1, 3, Math.max(1, 2560 / Math.max(cw, ch, 1)));
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  // k = device pixels per buffer pixel (integer = crisp), RES buffer pixels per world unit (Scale2x art)
  const k = Math.max(1, Math.round(Math.min(cw * dpr, ch * dpr) / (250 * RES)));
  const scale = k * RES;
  Object.assign(G.view, { cw, ch, dpr, scale, k, w: Math.ceil((cw * dpr) / scale), h: Math.ceil((ch * dpr) / scale) });
  const probe = getComputedStyle(document.getElementById('safe'));
  G.safe = { t: parseFloat(probe.paddingTop) || 0, r: parseFloat(probe.paddingRight) || 0, b: parseFloat(probe.paddingBottom) || 0, l: parseFloat(probe.paddingLeft) || 0 };
  resizeBuffers();
  resizeMenu();
}

function boot() {
  G.debug = /[?&]debug/.test(location.search);
  G.save = loadSave();
  // older saves kept fractional ash (ash multipliers): whole numbers only from now on
  G.save.ash = Math.round(G.save.ash || 0); if (G.save.echo) G.save.echo.ash = Math.round(G.save.echo.ash);
  for (const k in G.save.inv.mats) G.save.inv.mats[k] = Math.round(G.save.inv.mats[k]);
  setMuted(G.save.muted);
  bakeAll();
  initInput(canvas);
  initScene();
  initMenu(canvas);
  initScreens();
  initAchievements();
  G.onPlayerDeath = onPlayerDeath;
  G.onBossDeath = onBossDeath;
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
  addEventListener('pointerdown', initAudio, { once: false });
  addEventListener('keydown', initAudio);
  resize();
  showMenu();
  window.__G = G; // inspection hook for testing
  if (G.debug) installDebug();
  requestAnimationFrame(frame);
}

let last = performance.now();
function frame(now, manual) {
  const rdt = manual ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
  if (!manual) last = now;
  G.real += rdt;
  input.update(rdt);
  if (input.pressed('pause')) ui.togglePause();
  if (input.pressed('inv') && G.mode === 'game' && !G.paused && G.real - (G.gearClosedAt || -9) > 0.25) ui.showGear({ forge: false });
  if (G.mode === 'menu') {
    updateMenu(rdt);
    renderMenu(ctx);
  } else if (G.room) {
    if (G.transition) {
      const T = G.transition;
      T.t += rdt;
      if (T.dir > 0 && T.t >= 0.35) { T.then(); T.dir = -1; T.t = 0; }
      else if (T.dir < 0 && T.t >= 0.45) G.transition = null;
    }
    let dt = rdt;
    if (G.slow > 0) { G.slow -= rdt; dt *= G.slowScale; }
    if (G.freeze > 0) { G.freeze -= rdt; dt = 0; }
    G.mouseWorld = screenToWorld(input.mouse.x, input.mouse.y);
    if (!G.paused && dt > 0) { G.t += dt; updateGame(dt); }
    updateRealFx(rdt);
    updateCamera(rdt);
    renderGame(ctx);
  }
  if (!manual) requestAnimationFrame(frame);
}

function installDebug() {
  addEventListener('keydown', (e) => {
    if (G.mode !== 'game') return;
    if (e.code === 'KeyN') { for (const en of G.enemies) if (!en.dead) { en.hp = 0; killEnemy(en); } if (G.room.state) G.room.state.wave = G.room.state.waves.length - 1; }
    if (e.code === 'KeyH') { G.player.hp = G.player.s.maxHp; G.player.ward = G.player.s.ward; }
    if (e.code === 'KeyG') { G.save.ash += 500; writeSave(G.save); }
    if (e.code === 'KeyB') { enterRoom(ROOM_PLAN.length - 1); }
    if (e.code === 'KeyO') { openExits(G.room); }
    if (e.code === 'KeyI') { G.godmode = !G.godmode; }
  });
}
window.__dbg = { makeItem, equipItem, tick: (sec) => { for (let i = 0; i < sec * 60; i++) frame(0, true); }, enterRoom, startRun, openExits, killEnemy, input, updateGame, ui, updateFlow, flowDir, los };

// wait for the pixel font (max 1.5 s, then boot with the fallback)
const fontReady = document.fonts?.load ? Promise.all([document.fonts.load('16px "PT Sans"'), document.fonts.load('700 16px "PT Sans"'), document.fonts.load('16px "Forum"')]).catch(() => {}) : Promise.resolve();
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(boot);
