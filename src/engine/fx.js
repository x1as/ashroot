// Juice: particles, smear arcs, rings, floating numbers, shake, hit-stop, slow-mo, flashes.
import { G } from '../game/state.js';
import { rand, TAU, ease, noise1 } from './util.js';
import { pcircle, rp } from './sprite.js';

export function shake(amount) { G.cam.trauma = Math.min(1, G.cam.trauma + amount); }
export function kick(dx, dy, s = 3) { const l = Math.hypot(dx, dy) || 1; G.cam.kick.x += (dx / l) * s; G.cam.kick.y += (dy / l) * s; }
export function hitstop(t) { G.freeze = Math.max(G.freeze, t); }
export function slowmo(t, scale = 0.3) { G.slow = Math.max(G.slow, t); G.slowScale = scale; }
export function flash(color, a = 0.5) { G.flash.color = color; G.flash.a = Math.max(G.flash.a, a); }

// p: {x,y,vx,vy,life,size,color,drag,grav,glow,z,vz}
export function part(p) {
  p.max = p.life; p.drag ??= 3; p.grav ??= 0; p.size ??= 1; p.z ??= 0; p.vz ??= 0;
  G.parts.push(p);
  if (G.parts.length > 900) G.parts.splice(0, G.parts.length - 900);
  return p;
}
export function burst(x, y, n, color, speed = 60, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = o.ang !== undefined ? o.ang + rand(-o.spread, o.spread) : rand(TAU);
    const s = rand(speed * 0.3, speed);
    part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, o.life || 0.6), color, size: o.size || (Math.random() < 0.35 ? 2.5 : 1.5), drag: o.drag ?? 4, grav: o.grav ?? 0, glow: o.glow, vz: o.vz ? rand(o.vz * 0.5, o.vz) : 0 });
  }
}
// sprite dissolve: every pixel of the sprite flies off — enemies "crumble to ash"
export function dissolve(spr, x, y, flip, dirX = 0, dirY = 0, tintCol) {
  const step = spr.pixels.length > 300 ? 2 : 1;
  for (let i = 0; i < spr.pixels.length; i += step) {
    const px = spr.pixels[i];
    const lx = (flip ? spr.w - 1 - px.x : px.x) - spr.ox, ly = px.y - spr.oy;
    const a = Math.atan2(ly, lx) + rand(-0.6, 0.6);
    const s = rand(10, 55);
    part({ x: x + lx, y: y + ly, vx: Math.cos(a) * s + dirX * 60, vy: Math.sin(a) * s + dirY * 60 - 10, life: rand(0.5, 1.3), color: tintCol || px.c, size: 1, drag: 2.2, grav: -8, fade: true });
  }
}
export function ring(x, y, r0, r1, life, color, th = 1) { G.rings.push({ x, y, r0, r1, t: 0, life, color, th }); }
export function smear(x, y, a0, a1, r0, r1, life, color) { G.arcs.push({ x, y, a0, a1, r0, r1, t: 0, life, color }); }
// thrust: a tapered beam shooting out along `ang`
export function beam(x, y, ang, len, w, life, color) { G.arcs.push({ kind: 'beam', x, y, ang, len, w, t: 0, life, color }); }
// stab / bash: a filled wedge
export function cone(x, y, ang, half, len, life, color) { G.arcs.push({ kind: 'cone', x, y, ang, half, len, t: 0, life, color }); }
// overhead blow landing: a flash disc on the ground
export function slam(x, y, r, life, color) { G.arcs.push({ kind: 'slam', x, y, r, t: 0, life, color }); }
export function text(x, y, txt, color = '#ece4d0', big = false, key = null) {
  // hits on the same target within 0.4 s merge into one growing number instead of a cloud of digits
  if (key && typeof txt === 'number') {
    const prev = G.texts.find((t) => t.key === key && t.t < 0.4);
    if (prev) { prev.val += txt; prev.txt = String(Math.round(prev.val)); prev.t = 0.02; prev.x = x; prev.y = y; prev.big = prev.big || big; prev.color = big ? color : prev.color; prev.pop = 1; return; }
  }
  G.texts.push({ x: x + rand(-2, 2), y, txt: typeof txt === 'number' ? String(Math.round(txt)) : String(txt), val: typeof txt === 'number' ? txt : 0, key, color, t: 0, life: big ? 1.1 : 0.85, big, vx: rand(-8, 8), pop: 1 });
  if (G.texts.length > 60) G.texts.shift();
}
export function banner(title, sub = '', color = '#ece4d0', life = 2.4) { G.banner = { title, sub, color, t: 0, life }; }

export function updateFx(dt) {
  for (const p of G.parts) {
    p.life -= dt;
    const k = Math.exp(-p.drag * dt);
    p.vx *= k; p.vy *= k; p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vz) { p.z += p.vz * dt; p.vz -= 260 * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.35; if (Math.abs(p.vz) < 15) p.vz = 0; } }
  }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const a of G.arcs) a.t += dt;
  G.arcs = G.arcs.filter((a) => a.t < a.life);
  for (const r of G.rings) r.t += dt;
  G.rings = G.rings.filter((r) => r.t < r.life);
  for (const t of G.texts) { t.t += dt; t.x += t.vx * dt; t.vx *= 0.9; }
  G.texts = G.texts.filter((t) => t.t < t.life);
}
export function updateRealFx(rdt) {
  G.cam.trauma = Math.max(0, G.cam.trauma - rdt * 1.6);
  G.cam.kick.x *= Math.exp(-14 * rdt); G.cam.kick.y *= Math.exp(-14 * rdt);
  G.flash.a = Math.max(0, G.flash.a - rdt * 3);
  G.vign = Math.max(0, G.vign - rdt * 1.5);
  if (G.banner) { G.banner.t += rdt; if (G.banner.t > G.banner.life) G.banner = null; }
}
export function shakeOffset() {
  const tr = G.cam.trauma * G.cam.trauma, s = 7 * tr, t = G.real * 28;
  return { x: noise1(t) * s + G.cam.kick.x, y: noise1(t + 77) * s + G.cam.kick.y };
}

// ---- drawing (low-res world buffer) ----
export function drawParts(g) {
  for (const p of G.parts) {
    const t = p.life / p.max;
    g.globalAlpha = p.fade ? Math.min(1, t * 1.6) : Math.min(1, t * 3);
    g.fillStyle = p.color;
    const s = p.size;
    g.fillRect(rp(p.x - s / 2), rp(p.y - s / 2 - p.z), s, s);
  }
  g.globalAlpha = 1;
}
export function drawArcs(g) {
  for (const a of G.arcs) {
    const k = a.t / a.life;
    if (a.kind) { drawShape(g, a, k); continue; }
    const e = ease.outQuart(Math.min(1, k * 1.6));
    const end = a.a0 + (a.a1 - a.a0) * e;
    const start = a.a0 + (a.a1 - a.a0) * Math.max(0, (k - 0.15) * 1.4);
    g.globalAlpha = 1 - k;
    g.fillStyle = a.color;
    g.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i++) { const ang = start + (end - start) * (i / steps); g.lineTo(a.x + Math.cos(ang) * a.r1, a.y + Math.sin(ang) * a.r1); }
    for (let i = steps; i >= 0; i--) {
      // crescent: inner edge bulges toward the middle, thin at both tips
      const ang = start + (end - start) * (i / steps);
      const rr = a.r1 - (a.r1 - a.r0) * Math.sin((i / steps) * Math.PI);
      g.lineTo(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr);
    }
    g.fill();
  }
  g.globalAlpha = 1;
}
function drawShape(g, a, k) {
  g.globalAlpha = 1 - k; g.fillStyle = a.color; g.beginPath();
  if (a.kind === 'beam') {
    const c = Math.cos(a.ang), s = Math.sin(a.ang), nx = -s, ny = c;
    const L = a.len * ease.outQuart(Math.min(1, k * 2.4)), s0 = a.len * Math.max(0, (k - 0.35) * 1.3), w = (a.w / 2) * (1 - 0.5 * k);
    g.moveTo(a.x + c * s0 + nx * w * 0.35, a.y + s * s0 + ny * w * 0.35);
    g.lineTo(a.x + c * L * 0.72 + nx * w, a.y + s * L * 0.72 + ny * w);
    g.lineTo(a.x + c * L, a.y + s * L);
    g.lineTo(a.x + c * L * 0.72 - nx * w, a.y + s * L * 0.72 - ny * w);
    g.lineTo(a.x + c * s0 - nx * w * 0.35, a.y + s * s0 - ny * w * 0.35);
  } else if (a.kind === 'cone') {
    const L = a.len * (0.45 + 0.55 * ease.outQuart(Math.min(1, k * 2.4))), r0 = a.len * 0.12;
    g.moveTo(a.x + Math.cos(a.ang) * r0, a.y + Math.sin(a.ang) * r0);
    for (let i = 0; i <= 10; i++) { const t = a.ang - a.half + (2 * a.half * i) / 10; g.lineTo(a.x + Math.cos(t) * L, a.y + Math.sin(t) * L); }
  } else {
    g.globalAlpha = (1 - k) * 0.55;
    g.ellipse(a.x, a.y, a.r * (0.7 + 0.3 * ease.outCubic(k)), a.r * (0.7 + 0.3 * ease.outCubic(k)) * 0.6, 0, 0, TAU);
  }
  g.fill();
}
export function drawRings(g) {
  for (const r of G.rings) {
    const k = r.t / r.life, rr = r.r0 + (r.r1 - r.r0) * ease.outCubic(k);
    g.globalAlpha = 1 - k; g.strokeStyle = r.color; g.lineWidth = r.th * 0.75;
    g.beginPath(); g.arc(rp(r.x), rp(r.y), rr, 0, TAU); g.stroke();
  }
  g.globalAlpha = 1;
}
export function shadow(g, x, y, r) {
  g.fillStyle = 'rgba(5,3,10,0.45)';
  pcircle(g, x, y, r, Math.max(1, r * 0.45));
}
