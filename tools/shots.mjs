// npm run shots: stage scenes in the real game and capture them with headless Chrome (DevTools protocol,
// no extra packages). Needs the dev server (npm run dev) on :5173. Output: docs/shots/*.png at 2560x1440
// (viewport 1280x720, device pixel ratio 2), plus docs/og.png (1200x630 link preview) and public/ icons.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const BASE = process.env.SHOTS_URL || 'http://localhost:5173/';
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome']
  .find((p) => p && fs.existsSync(p));
if (!CHROME) throw new Error('Chrome or Edge not found (set CHROME=...)');
const PORT = 9333;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ashroot-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1280,720', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=2', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0;
const pending = new Map();
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
}
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed');
  return r.result?.result?.value;
}
async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
}
async function open(url) {
  await send('Page.navigate', { url });
  await sleep(2500);
  await js(`for (let i = 0; i < 40 && !window.__G; i++) await new Promise(r => setTimeout(r, 100)); return !!window.__G;`);
}

// shared page helpers: a mid-game hero with good gear, run a room for some simulated seconds
const PRE = `
  const G = __G, D = __dbg, I = D.input;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const gear = (weapon, rarity = 3) => {
    const inv = G.save.inv;
    for (const b of [weapon, 'h_heavy', 'c_medium', 'g_medium', 'b_light', 'a_amulet', 'r_ring']) { const it = D.makeItem(b, 4, b === weapon ? rarity : 2); it.up = 6; inv.items.push(it); D.equipItem(inv, it); }
    for (const id of ['k_might', 't_root', 'v_regen']) G.save.nodes[id] = 2;
  };
  const start = (floor, room) => {
    document.getElementById('menu').hidden = true; document.body.classList.remove('in-menu');
    D.startRun(); G.godmode = true; G.run.floor = floor; D.enterRoom(room);
  };
  const aim = () => { const P = G.player, e = G.enemies.filter(x => !x.dead && x.spawnT <= 0).sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0]; if (e) G.mouseWorld = { x: e.x, y: e.y - 4 }; return e; };
  // hold the hero in the middle of the room and let the waves come to him (camera stays centred)
  const hold = (sec) => { const R = G.room; for (let i = 0; i < sec * 60; i++) { const P = G.player; P.x = R.w * 8; P.y = R.h * 8 + 8; P.vx = P.vy = 0; I.down = {}; aim(); D.tick(1 / 60); } };
  const snapCam = () => { const P = G.player; G.cam.x = P.x; G.cam.y = P.y - 10; };
  // walk toward the crowd for n seconds so they surround the hero
  const gather = (sec) => { for (let i = 0; i < sec * 60; i++) { const P = G.player, e = aim(); I.down = {}; if (e) { const dx = e.x - P.x, dy = e.y - P.y, l = Math.hypot(dx, dy) || 1; I.stick.active = true; I.stick.dx = l > 26 ? dx / l : 0; I.stick.dy = l > 26 ? dy / l : 0; } D.tick(1 / 60); } I.stick.dx = I.stick.dy = 0; };
`;

await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });

const ONLY_COVER = process.argv.includes('cover'); // `npm run shots -- cover` re-renders only docs/og.png
if (!ONLY_COVER) {
// 1. combat: Minos' whirl wrapped in Prometheus' fire, depth III
await open(BASE + '?debug');
await js(`${PRE} localStorage.clear(); gear('w_labrys'); start(3, 2);
  G.run.boons.f_ignite = 3; G.run.boons.f_forge = 2; G.run.boons.b_rend = 2; G.run.aspects.fire = 5; G.run.aspects.blood = 2;
  hold(17); aim();
  I.down.attack = true; I.buf.attack = 0.15; for (let i = 0; i < 132; i++) { const P = G.player; P.vx = P.vy = 0; D.tick(1 / 60); } I.down.attack = false; D.tick(0.5); snapCam(); G.paused = true; await wait(500);`);
await shot('docs/shots/combat.png');

// 2. the dory's beam thrusts against Bront, depth III boss
await open(BASE + '?debug');
await js(`${PRE} localStorage.clear(); gear('w_spear'); start(3, 6);
  G.run.boons.s_arc = 3; G.run.aspects.storm = 4; D.tick(3.2); gather(1.2); aim();
  I.buf.attack = 0.15; D.tick(0.16); snapCam(); G.paused = true; await wait(500);`);
await shot('docs/shots/boss.png');

// 3. the treasury with a divine weapon selected
await open(BASE + '?debug');
await js(`${PRE} localStorage.clear(); gear('w_cleaver');
  const inv = G.save.inv;
  ['w_spear', 'w_labrys', 'w_aspis', 'w_bow', 'h_medium', 'c_heavy', 'g_light', 'b_heavy', 'x_relic', 'w_dagger', 'c_light', 'w_staff', 'h_light', 'b_medium', 'g_heavy', 'w_pelekys'].forEach((b, i) => { const it = D.makeItem(b, 2 + (i % 4), [3, 2, 1, 0][i % 4]); if (i % 3 === 0) it.up = 3; it.isNew = i % 5 === 0; inv.items.push(it); });
  G.save.ash = 4820; inv.mats = { bone: 64, resin: 18, shard: 7, heart: 2, e_fire: 5 };
  G.ui.showGear({ forge: false }); await wait(500);
  const pick = [...document.querySelectorAll('#gear .tile')].find(t => { const it = inv.items.find(i => i.uid === t.dataset.uid); return it.base === 'w_spear'; }); pick.click(); await wait(900);`);
await shot('docs/shots/treasury.png');

// 4. the Tree of the Hesperides menu, half grown
await open(BASE);
await js(`const G = __G; for (const n of ['t_root', 't_flask', 't_bark', 'k_might', 'k_labrys', 'k_power', 'k_crit', 'v_regen', 'v_dagger', 'v_charge', 'g_cap', 'f_aspis', 'g_armor', 'r_rally', 'm_staff', 'r_reroll']) G.save.nodes[n] = 1; G.save.nodes.k_might = 4; G.save.ash = 1240; location.hash = ''; return true;`);
await js(`localStorage.setItem('ashroot.save.v1', JSON.stringify(__G.save)); location.reload(); return true;`).catch(() => {});
await sleep(3000);
await shot('docs/shots/tree.png');

}

// 5. link preview cover (1200x630) from the combat shot + title
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///' + path.join(root, 'tools/cover.html').replace(/\\/g, '/') });
await sleep(2500);
await shot('docs/og.png');

ws.close(); chrome.kill();
await sleep(800); try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
