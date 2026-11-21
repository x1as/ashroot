// Game scene: simulation step + render pipeline.
// Render: world -> low-res buffer (true pixel grid) -> nearest-neighbour upscale with sub-pixel
// camera offset (smooth scrolling) -> crisp screen-space layer (numbers, HUD, banners).
import { G } from './state.js';
import { input } from '../engine/input.js';
import { damp, dist, angTo, TAU, clamp, ease, rand } from '../engine/util.js';
import { drawSprite, pcircle, RES, rp } from '../engine/sprite.js';
import { addItem, addMats } from './items.js';
import { RARITY, RESOURCES, BASES } from '../data/items.js';
import { updateFx, drawParts, drawArcs, drawRings, shakeOffset, burst, shadow, ring, text } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { SPR } from '../art/bank.js';
import { TS, tileAt, solidT, drawSpikes, drawExits, exitHit, T } from './world.js';
import { updatePlayer, drawPlayer } from './player.js';
import { updateEnemy, drawEnemy, drawTelegraph } from './enemy.js';
import { updateBoss, drawBoss, drawBossTele } from './boss.js';
import { hitEnemy, hurtPlayer, updateDelayed, enemyBlast, killEnemy, lv, chillE } from './combat.js';
import { updateRoom, takeExit } from './run.js';
import { drawHUD } from '../ui/hud.js';
import { FLOORS } from '../data/floors.js';

let buf, bg, light, lg, lightSpr;
const PAD = 2; // buffer pixels of margin for sub-pixel camera scrolling
export function initScene() {
  buf = document.createElement('canvas'); bg = buf.getContext('2d', { alpha: false });
  light = document.createElement('canvas'); lg = light.getContext('2d');
  // one pre-rendered radial light, stamped with drawImage: no per-frame gradient objects, no GC stalls
  lightSpr = document.createElement('canvas'); lightSpr.width = lightSpr.height = 64;
  const l = lightSpr.getContext('2d'), gr = l.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  l.fillStyle = gr; l.fillRect(0, 0, 64, 64);
}
export function resizeBuffers() {
  const v = G.view;
  buf.width = Math.ceil(v.w * RES) + PAD * 2; buf.height = Math.ceil(v.h * RES) + PAD * 2;
  light.width = Math.ceil(buf.width / 4); light.height = Math.ceil(buf.height / 4);
}

// ---------------- update ----------------
export function updateGame(dt) {
  const P = G.player, R = G.room;
  if (G.transition) return;
  updatePlayer(P, dt);
  for (const e of G.enemies) e.isBoss ? updateBoss(e, dt) : updateEnemy(e, dt);
  updateProjectiles(dt);
  updateHazards(dt);
  updateZones(dt);
  updatePickups(dt);
  updateDelayed(dt);
  updateFx(dt);
  updateRoom(dt);
  // safety net: nothing may ever leave the room
  const out = (e) => e.x < 0 || e.y < 0 || e.x > R.w * TS || e.y > R.h * TS;
  if (out(P)) { P.x = P.lastSafe.x; P.y = P.lastSafe.y; P.vx = P.vy = 0; }
  for (const e of G.enemies) if (!e.dead && out(e)) { e.x = R.w * TS / 2; e.y = R.h * TS / 2; }
  const ex = exitHit(R, P.x, P.y);
  if (ex && !P.dead) takeExit(ex);
}

function updateProjectiles(dt) {
  const R = G.room, P = G.player;
  for (const p of G.projs) {
    p.life -= dt;
    if (p.homing && p.owner === 'player') {
      let best = null, bd = 110;
      for (const e of G.enemies) { if (e.dead || e.spawnT > 0 || p.hit.has(e)) continue; const d = dist(p.x, p.y, e.x, e.y - 5); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const a = Math.atan2(p.vy, p.vx), want = angTo(p.x, p.y, best.x, best.y - 5);
        let d = want - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        const na = a + clamp(d, -p.homing * dt, p.homing * dt), sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (solidT(tileAt(R, p.x, p.y + 5))) {
      p.life = 0; burst(p.x, p.y, 4, p.color, 40);
      if (p.big) nova(p);
      continue;
    }
    if (p.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || e.spawnT > 0 || p.hit.has(e)) continue;
        if (dist(p.x, p.y, e.x, e.y - 5) > e.r + p.r + 2) continue;
        p.hit.add(e);
        hitEnemy(e, p.dmg, { type: p.type, knock: p.kind === 'arrow' ? (p.full ? 70 : 25) : 30, fx: p.x - p.vx * 0.05, fy: p.y - p.vy * 0.05, shieldBreak: p.shieldBreak, critBonus: p.critBonus, forceCrit: p.forceCrit, noProc: p.noProc });
        if (p.big) nova(p);
        if (p.split && !p.child) for (const s of [-0.6, 0.6]) { const a = Math.atan2(p.vy, p.vx) + s; G.projs.push({ ...p, child: true, hit: new Set(p.hit), vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, dmg: p.dmg * 0.4, life: 0.35, r: 2, big: false, homing: 0, pierce: 0 }); }
        if (p.pierce > 0) p.pierce--; else { p.life = 0; break; }
      }
    } else {
      if (P.state !== 'dead' && dist(p.x, p.y, P.x, P.y - 5) < p.r + 4) {
        const hit = hurtPlayer(p.dmg, p.x - p.vx * 0.1, p.y - p.vy * 0.1);
        if (hit || P.inv > 0) p.life = 0;
      }
    }
    if (Math.random() < (p.owner === 'player' ? 0.5 : 0.15) && p.kind !== 'arrow' && p.kind !== 'bonearrow') G.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.2, max: 0.2, size: 1, color: p.color, drag: 0, grav: 0, z: 0, vz: 0 });
  }
  G.projs = G.projs.filter((p) => p.life > 0);
  if (G.projs.length > 220) G.projs.splice(0, G.projs.length - 220);
}
function nova(p) {
  G.hazards.push({ kind: 'circle', x: p.x, y: p.y, r: 26, t: 0, wind: 0.01, dmg: p.dmg * 0.6 * G.player.s.dmgMul, owner: 'player', color: '#b88cff', type: 'arcane' });
  p.big = false;
}

function updateHazards(dt) {
  const P = G.player;
  for (const h of G.hazards) {
    h.t += dt;
    if (!h.done && h.t >= h.wind) {
      h.done = true; h.doneT = 0;
      if (h.visualOnly) continue;
      if (h.owner === 'enemy') {
        if (h.kind === 'circle') {
          if (h.spike) { burst(h.x, h.y, 6, '#ece4d0', 50, { grav: 40 }); sfx.spike(); }
          else enemyBlast(h.x, h.y, h.r, h.dmg, h.color, h.hurtsEnemies);
          if (h.spike && dist(h.x, h.y, P.x, P.y) < h.r + 3) hurtPlayer(h.dmg, h.x, h.y);
        }
      } else {
        ring(h.x, h.y, 2, h.r, 0.3, h.color, 2); burst(h.x, h.y, 14, h.color, h.r * 2);
        for (const e of G.enemies) if (!e.dead && dist(h.x, h.y, e.x, e.y) < h.r + e.r) hitEnemy(e, h.dmg / (G.player.s.dmgMul || 1), { type: h.type, fx: h.x, fy: h.y, knock: 70, noProc: true });
      }
    }
    if (h.done) h.doneT += dt;
  }
  G.hazards = G.hazards.filter((h) => !h.done || h.doneT < 0.25);
}
function updateZones(dt) {
  for (const z of G.zones) {
    z.t += dt; z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.33;
      for (const e of G.enemies) if (!e.dead && dist(z.x, z.y, e.x, e.y) < z.r + e.r) hitEnemy(e, z.dps * 0.33, { dot: true, type: z.type });
    }
    if (Math.random() < dt * 6) G.parts.push({ x: z.x + rand(-3, 3), y: z.y, vx: 0, vy: -20, life: 0.4, max: 0.4, size: 1, color: z.color, drag: 1, grav: 0, z: 0, vz: 0, glow: true });
  }
  G.zones = G.zones.filter((z) => z.t < z.life);
}
function updatePickups(dt) {
  const P = G.player, S = G.room.state;
  for (const p of G.pickups) {
    p.t += dt;
    const d = dist(p.x, p.y, P.x, P.y - 4);
    const magnet = S.cleared || d < 40;
    if (p.t > 0.4 && magnet) {
      const a = angTo(p.x, p.y, P.x, P.y - 4), sp = 60 + p.t * 220;
      p.vx = damp(p.vx, Math.cos(a) * sp, 8, dt); p.vy = damp(p.vy, Math.sin(a) * sp, 8, dt);
    } else { p.vx *= Math.exp(-5 * dt); p.vy *= Math.exp(-5 * dt); }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (d < 6 && p.t > 0.4) {
      p.dead = true;
      if (p.kind === 'ash') { G.run.ash += p.v * P.s.ashMul; sfx.ash(); }
      else if (p.kind === 'mat') {
        addMats(G.save.inv, { [p.id]: p.n }); G.run.mats[p.id] = (G.run.mats[p.id] || 0) + p.n;
        text(P.x, P.y - 22, `+${p.n} ${RESOURCES[p.id].name}`, RESOURCES[p.id].color); sfx.ash();
      } else if (p.kind === 'item') {
        const ok = addItem(G.save.inv, p.item, P.s.bag);
        if (ok) G.run.items.push(p.item);
        text(P.x, P.y - 28, ok ? p.item.name : 'инвентарь полон', RARITY[p.item.rarity].color, true);
        ring(P.x, P.y - 6, 3, 22, 0.4, RARITY[p.item.rarity].color, 2); sfx.pick();
      }
    }
  }
  G.pickups = G.pickups.filter((p) => !p.dead);
  G.run.ash = Math.round(G.run.ash * 100) / 100;
}

// ---------------- camera ----------------
export function updateCamera(rdt) {
  const P = G.player, R = G.room, v = G.view;
  if (!P || !R) return;
  const look = 16;
  let tx = P.x + Math.cos(P.face) * look, ty = P.y - 8 + Math.sin(P.face) * look * 0.7;
  if (G.boss && !G.boss.dead) { tx = tx * 0.8 + G.boss.x * 0.2; ty = ty * 0.8 + G.boss.y * 0.2; }
  const W = R.w * TS, H = R.h * TS;
  tx = W <= v.w ? W / 2 : clamp(tx, v.w / 2, W - v.w / 2);
  ty = H <= v.h - 8 ? H / 2 : clamp(ty, v.h / 2 - 8, H - v.h / 2 + 4);
  G.cam.x = damp(G.cam.x, tx, 7, rdt); G.cam.y = damp(G.cam.y, ty, 7, rdt);
}
export function screenToWorld(sx, sy) {
  const v = G.view;
  return { x: G.cam.x - v.w / 2 + sx / v.scale * v.dpr, y: G.cam.y - v.h / 2 + sy / v.scale * v.dpr };
}
export function worldToScreen(x, y) {
  const v = G.view, so = G.shakeO || { x: 0, y: 0 };
  return { x: ((x - (G.cam.x + so.x) + v.w / 2) * v.scale) / v.dpr, y: ((y - (G.cam.y + so.y) + v.h / 2) * v.scale) / v.dpr };
}

// ---------------- render ----------------
export function renderGame(ctx) {
  const v = G.view, R = G.room, P = G.player;
  const so = shakeOffset(); G.shakeO = so;
  const cx = G.cam.x + so.x - v.w / 2, cy = G.cam.y + so.y - v.h / 2;
  // camera in BUFFER pixels (RES per world unit); the fraction is applied when upscaling = smooth scroll
  const bx = cx * RES, by = cy * RES;
  const ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy;
  const g = bg;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#05030a'; g.fillRect(0, 0, buf.width, buf.height);
  g.setTransform(RES, 0, 0, RES, -ix + PAD, -iy + PAD);
  g.imageSmoothingEnabled = false;
  g.drawImage(R.bg, 0, 0, R.pw, R.ph);
  drawSpikes(g, R, G.t);
  // zones & hazards (ground layer)
  for (const z of G.zones) { g.globalAlpha = 0.35 * (1 - z.t / z.life); g.fillStyle = z.color; pcircle(g, z.x, z.y, z.r, z.r * 0.6); }
  g.globalAlpha = 1;
  for (const h of G.hazards) drawHazard(g, h);
  for (const e of G.enemies) e.isBoss ? drawBossTele(g, e) : drawTelegraph(g, e);
  // bonfire / echo
  if (R.bonfire) drawBonfire(g, R.bonfire);
  if (R.echo) drawEcho(g, R.echo);
  // pickups
  for (const p of G.pickups) drawPickup(g, p);
  // y-sorted actors
  const actors = [...G.enemies.filter((e) => !e.dead), P];
  actors.sort((a, b) => a.y - b.y);
  for (const a of actors) {
    if (a === P) { if (P.state !== 'fall') shadow(g, P.x, P.y, 4); drawPlayer(g, P); }
    else if (a.isBoss) drawBoss(g, a);
    else drawEnemy(g, a);
  }
  // projectiles
  for (const p of G.projs) drawProj(g, p);
  drawArcs(g); drawRings(g); drawParts(g);
  g.drawImage(R.ov, 0, 0, R.pw, R.ph);
  drawExits(g, R, G.t);
  // lighting
  drawLight(g, ix, iy);
  // blit
  ctx.imageSmoothingEnabled = false;
  const k = v.scale / RES; // device pixels per buffer pixel (integer)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(buf, Math.round(-(fx + PAD) * k), Math.round(-(fy + PAD) * k), buf.width * k, buf.height * k);
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  drawScreenLayer(ctx);
}

function drawHazard(g, h) {
  const k = Math.min(1, h.t / h.wind);
  g.fillStyle = h.color; g.strokeStyle = h.color;
  if (h.done) {
    if (h.spike) { const a = 1 - h.doneT / 0.25; g.globalAlpha = a; g.fillStyle = '#ece4d0'; for (let i = 0; i < 5; i++) { const ang = (i / 5) * TAU; g.fillRect(Math.round(h.x + Math.cos(ang) * 4), Math.round(h.y + Math.sin(ang) * 3) - 5, 1, 6); } g.globalAlpha = 1; }
    return;
  }
  if (h.kind === 'circle') {
    // closing-in timer: inner disc grows until it meets the edge = impact. Readable at a glance.
    g.globalAlpha = 0.14; pcircle(g, h.x, h.y, h.r, h.r * 0.7);
    g.globalAlpha = 0.25 + 0.35 * k; pcircle(g, h.x, h.y, h.r * ease.inQuad(k), h.r * 0.7 * ease.inQuad(k));
    g.globalAlpha = 0.85; g.lineWidth = 1; g.beginPath(); g.ellipse(Math.round(h.x), Math.round(h.y), h.r, h.r * 0.7, 0, 0, TAU); g.stroke();
    if (h.fall) { g.globalAlpha = 0.8; g.fillStyle = h.color; g.fillRect(Math.round(h.x) - 1, Math.round(h.y - 60 * (1 - k)) - 3, 3, 5); }
  } else if (h.kind === 'line') {
    g.save(); g.translate(h.x, h.y); g.rotate(h.ang);
    g.globalAlpha = 0.14; g.fillRect(0, -h.w / 2, h.len, h.w);
    g.globalAlpha = 0.3 + 0.3 * k; g.fillRect(0, -h.w / 2, h.len * ease.inQuad(k), h.w);
    g.globalAlpha = 0.8; g.fillRect(0, -h.w / 2, h.len, 1); g.fillRect(0, h.w / 2 - 1, h.len, 1);
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawProj(g, p) {
  const a = Math.atan2(p.vy, p.vx);
  if (p.kind === 'arrow' || p.kind === 'bonearrow') {
    const spr = p.kind === 'arrow' ? SPR.weapon['arrow_' + (G.player.s.element || 'none')] : SPR.weapon.bonearrow;
    g.save(); g.translate(rp(p.x), rp(p.y)); g.rotate(a); g.drawImage(spr.c, -spr.w + 2, -spr.h / 2, spr.w, spr.h); g.restore();
    if (p.full) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(p.x - Math.cos(a) * 6), Math.round(p.y - Math.sin(a) * 6), 1, 1); }
    return;
  }
  if (p.kind === 'wave') { g.globalAlpha = 0.7; g.fillStyle = p.color; g.save(); g.translate(p.x, p.y); g.rotate(a); g.fillRect(-2, -8, 4, 16); g.restore(); g.globalAlpha = 1; return; }
  const r = Math.max(1, Math.round(p.r));
  g.fillStyle = '#08060d'; pcircle(g, p.x, p.y, r + 1);
  g.fillStyle = p.color; pcircle(g, p.x, p.y, r);
  g.fillStyle = '#ffffff'; g.fillRect(Math.round(p.x) - (r > 2 ? 1 : 0), Math.round(p.y) - (r > 2 ? 1 : 0), r > 2 ? 2 : 1, r > 2 ? 2 : 1);
}

function drawBonfire(g, b) {
  const x = Math.round(b.x), y = Math.round(b.y);
  g.fillStyle = '#4a3d33'; g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 4, y - 3, 8, 2);
  g.fillStyle = '#8189a0'; g.fillRect(x - 1, y - 16, 2, 14); g.fillRect(x - 3, y - 14, 6, 1); // sword in the ashes
  if (!b.used) for (let i = 0; i < 3; i++) G.parts.push({ x: x + rand(-4, 4), y: y - 2, vx: rand(-4, 4), vy: -rand(20, 40), life: rand(0.3, 0.7), max: 0.7, size: 1, color: Math.random() < 0.5 ? '#ff8f3a' : '#ffd36b', drag: 1, grav: 0, z: 0, vz: 0, glow: true });
  if (!b.used) { g.fillStyle = '#ffd36b'; g.globalAlpha = 0.5 + 0.3 * Math.sin(G.real * 9); g.fillRect(x - 2, y - 5, 4, 3); g.globalAlpha = 1; }
}
function drawEcho(g, e) {
  const bob = Math.sin(G.real * 2) * 2;
  g.globalAlpha = 0.55 + 0.2 * Math.sin(G.real * 3);
  const gs = SPR.ghost; g.drawImage(gs, rp(e.x - 7), rp(e.y - 18 + bob), gs.width / RES, gs.height / RES);
  g.globalAlpha = 1;
  if (Math.random() < 0.2) G.parts.push({ x: e.x + rand(-5, 5), y: e.y, vx: 0, vy: -15, life: 0.8, max: 0.8, size: 1, color: '#ece4d0', drag: 1, grav: 0, z: 0, vz: 0, glow: true });
}

function drawLight(g, ix, iy) {
  const R = G.room, P = G.player, F = FLOORS[G.run.floor - 1];
  const [fr, fg, fb] = F.theme.fog;
  const L = lg, W = light.width, H = light.height;
  L.globalCompositeOperation = 'source-over'; L.globalAlpha = 1;
  L.fillStyle = `rgba(${fr},${fg},${fb},0.64)`; L.fillRect(0, 0, W, H);
  L.globalCompositeOperation = 'destination-out';
  const q = 4; // the light canvas is 1/4 of the buffer
  const hole = (x, y, r, a = 1) => {
    const X = (x * RES - ix + PAD) / q, Y = (y * RES - iy + PAD) / q, RR = (r * RES) / q / 2;
    if (X < -RR || Y < -RR || X > W + RR || Y > H + RR) return;
    L.globalAlpha = a; L.drawImage(lightSpr, X - RR, Y - RR, RR * 2, RR * 2);
  };
  hole(P.x, P.y - 6, 200, 1);
  for (const t of R.torches) hole(t.x, t.y + 8, 70 + Math.sin(G.real * 9 + t.x) * 4, 0.8);
  for (const ex of R.exits) if (ex.open) hole(ex.x, ex.y + 4, 60, 0.9);
  if (R.bonfire) hole(R.bonfire.x, R.bonfire.y, 120, 1);
  let n = 0;
  for (const p of G.projs) { if (n++ > 40) break; hole(p.x, p.y, 24, 0.6); }
  for (const h of G.hazards) if (!h.done && h.owner === 'enemy') hole(h.x, h.y, h.r * 1.6, 0.5);
  for (const e of G.enemies) if (e.isBoss && !e.dead) hole(e.x, e.y - 10, 80, 0.6);
  for (const p of G.pickups) if (p.kind === 'item') hole(p.x, p.y - 6, 40, 0.8);
  L.globalAlpha = 1;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
  g.drawImage(light, 0, 0, W * q, H * q);
  g.restore();
  g.imageSmoothingEnabled = false;
  // additive glow for fire / magic (world transform)
  g.globalCompositeOperation = 'lighter';
  for (const t of R.torches) { g.globalAlpha = 0.5; g.fillStyle = F.theme.accent; pcircle(g, t.x, t.y, 3 + Math.sin(G.real * 12 + t.x)); }
  g.globalAlpha = 0.35;
  for (const p of G.parts) if (p.glow) { g.fillStyle = p.color; g.fillRect(rp(p.x - 1), rp(p.y - 1), 2, 2); }
  g.globalAlpha = 0.25;
  n = 0;
  for (const p of G.projs) { if (n++ > 60) break; g.fillStyle = p.color; g.fillRect(rp(p.x - 3), rp(p.y - 3), 6, 6); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // torches on top
  for (const t of R.torches) {
    const fl = Math.sin(G.real * 14 + t.x) > 0 ? 0.5 : 0;
    g.fillStyle = '#4a3d33'; g.fillRect(t.x - 1, t.y + 1, 2, 3);
    g.fillStyle = F.theme.accent; g.fillRect(t.x - 1, t.y - 2 - fl, 2, 3 + fl);
    g.fillStyle = '#ffd36b'; g.fillRect(t.x - 0.5, t.y - 1, 1, 1.5);
  }
}

function drawPickup(g, p) {
  const bob = Math.sin(G.real * 5 + p.x) * 0.75;
  if (p.kind === 'ash') {
    const tw = Math.sin(G.real * 10 + p.x) > 0;
    g.fillStyle = tw ? '#ece4d0' : '#9b8fb3'; g.fillRect(rp(p.x - 0.5), rp(p.y - 1), 1, 1.5);
    g.fillStyle = 'rgba(236,228,208,0.35)'; g.fillRect(rp(p.x - 1.5), rp(p.y - 0.5), 3, 0.5);
  } else if (p.kind === 'mat') {
    const c = RESOURCES[p.id].color;
    g.fillStyle = '#08060d'; pcircle(g, p.x, p.y - 1 + bob, 2);
    g.fillStyle = c; pcircle(g, p.x, p.y - 1 + bob, 1.5);
    g.fillStyle = '#ffffff'; g.fillRect(rp(p.x - 0.5), rp(p.y - 2 + bob), 0.5, 0.5);
  } else {
    // dropped item: rarity-coloured light beam + its icon
    const col = RARITY[p.item.rarity].color, ico = SPR.icon[BASES[p.item.base].icon];
    g.globalAlpha = 0.25 + 0.15 * Math.sin(G.real * 4); g.fillStyle = col;
    g.fillRect(rp(p.x - 1.5), rp(p.y - 26), 3, 24); g.fillRect(rp(p.x - 0.5), rp(p.y - 40), 1, 38);
    g.globalAlpha = 1;
    g.fillStyle = col; pcircle(g, p.x, p.y, 5, 2);
    g.drawImage(ico.c, rp(p.x - ico.w / 2), rp(p.y - ico.h - 3 + bob), ico.w, ico.h);
  }
}

function drawScreenLayer(ctx) {
  const v = G.view;
  // floating combat numbers (crisp text at screen res)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const k = t.t / t.life;
    const s = worldToScreen(t.x, t.y - ease.outCubic(k) * 12);
    const pop = t.big ? 1 + 0.6 * (1 - ease.outBack(Math.min(1, k * 4))) : 1;
    const size = Math.round((t.big ? 18 : 13) * pop * Math.min(1.4, v.scale / 4 + 0.4));
    ctx.font = `${size}px "Tiny5", ui-monospace, monospace`;
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    ctx.fillStyle = '#08060d'; ctx.fillText(t.txt, s.x + 2, s.y + 2);
    ctx.fillStyle = t.color; ctx.fillText(t.txt, s.x, s.y);
  }
  ctx.globalAlpha = 1;
  drawHUD(ctx, worldToScreen);
}
