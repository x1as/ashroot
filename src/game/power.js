// Charged attacks ("усиленная атака"): hold attack to pour stamina into the weapon, release to unleash it.
// Power p = stamina spent / max stamina (0..1). Damage ~ x1.5 at a sip, ~x7 at a full bar (x powerMul); range grows ~2.6x.
// Every weapon type has its own technique and a full bar adds a finale. God gifts ride on top of every technique:
//   Гидра: detonates poison (b_burst)   Прометей: leaves a fire field (f_forge)   Борей: ice needles (i_spikes)
//   Зевс: lightning strikes (s_charged)  Ares' capstone: full bar -> rage.
// Returns optional { rec, move, spin } so the hero can keep moving through long techniques.
import { G } from './state.js';
import { WEAPONS } from '../data/weapons.js';
import { dist, angTo, angDiff, rand, TAU, clamp } from '../engine/util.js';
import { burst, ring, smear, shake, hitstop, flash, banner, text, slowmo, part } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { hitEnemy, later, lv, dotScale, shards, bolt } from './combat.js';
import { hitProp } from './props.js';

const mult = (p, s) => (1.5 + 5.5 * Math.pow(p, 1.3)) * s.powerMul;
const reach = (p) => 1 + 1.6 * p;
const alive = () => G.enemies.filter((e) => !e.dead && e.spawnT <= 0);

// player AoE; o.set makes each enemy take it once; every power hit is flagged (Hydra's fountain reads it)
function aoe(P, x, y, r, dmg, o = {}) {
  for (const e of G.enemies) {
    if (e.dead || e.spawnT > 0 || dist(x, y, e.x, e.y) >= r + e.r) continue;
    if (o.set) { if (o.set.has(e)) continue; o.set.add(e); }
    if (o.cone !== undefined && Math.abs(angDiff(o.cone, angTo(P.x, P.y, e.x, e.y))) > (o.half || 1)) continue;
    hitEnemy(e, dmg, { fx: o.fx ?? x, fy: o.fy ?? y, knock: o.knock ?? 90, heavy: true, poiseMul: o.poise ?? 2, shieldBreak: o.shieldBreak ?? true, type: o.type, power: true, stun: o.stun, execute: o.execute, venom: o.venom });
  }
  for (const pr of G.room.props || []) if (!pr.dead && dist(x, y, pr.x, pr.y) < r) hitProp(pr);
}
function pull(x, y, r, k) {
  for (const e of G.enemies) if (!e.dead && !e.isBoss && e.spawnT <= 0) { const d = dist(x, y, e.x, e.y); if (d < r && d > 6) { const a = angTo(e.x, e.y, x, y); e.kx += Math.cos(a) * k; e.ky += Math.sin(a) * k; } }
}

export function unleash(P, p) {
  p = clamp(p, 0.05, 1);
  const full = p >= 0.97, s = P.s, col = P.auraCol || P.accent[0], a = P.face, M = mult(p, s);
  const W = WEAPONS[P.wk];
  shake(0.25 + 0.75 * p); hitstop(0.05 + 0.08 * p); flash(col, 0.1 + 0.25 * p);
  if (full) { slowmo(0.35, 0.35); banner(W.power.name, '', col, 1.1); }
  let out = null;
  switch (P.wk) {
    case 'sword': {
      // Perseus' sickle: crescents of light (divine Harpe: two more)
      const n = (p < 0.5 ? 1 : p < 0.97 ? 3 : 5) + (s.leg.w_sword ? 2 : 0), R = 14 + 18 * p;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.28;
        G.projs.push({ owner: 'player', kind: 'crescent', x: P.x + Math.cos(aa) * 10, y: P.y - 6 + Math.sin(aa) * 10, vx: Math.cos(aa) * 280, vy: Math.sin(aa) * 280, r: R, dmg: 22 * M, type: 'slash', life: 0.45 + 0.45 * p, pierce: 99, hit: new Set(), color: col, knock: 80, shieldBreak: true, power: true });
      }
      smear(P.x, P.y - 5, a - Math.PI, a + Math.PI, 20, 30 * reach(p), 0.3, col);
      aoe(P, P.x, P.y, 26 * reach(p), 18 * M);
      if (full) { ring(P.x, P.y, 6, 120, 0.6, '#ffffff', 3); aoe(P, P.x, P.y, 70, 30 * M); }
      sfx.swing(true);
      break;
    }
    case 'dagger': {
      // shadow dance: a storm of cuts around the hero, then a crossing finale
      const n = Math.round(3 + 9 * p), R = 34 * reach(p);
      for (let i = 0; i < n; i++) later(i * 0.055, () => {
        const aa = rand(TAU);
        smear(P.x, P.y - 5, aa - 0.9, aa + 0.9, R * 0.5, R, 0.14, i % 2 ? col : '#ffffff');
        P.afterimg.push({ x: P.x + Math.cos(aa) * 10, y: P.y + Math.sin(aa) * 6, t: 0, flip: Math.cos(aa) < 0 });
        aoe(P, P.x, P.y, R, 9 * (1 + 2.2 * p) * s.powerMul, { knock: 20, poise: 0.6, shieldBreak: false });
        sfx.swing(false);
      });
      if (full) later(n * 0.055 + 0.08, () => {
        smear(P.x, P.y - 5, a + 0.78 - 0.9, a + 0.78 + 0.9, 20, 80, 0.35, '#ffffff');
        smear(P.x, P.y - 5, a - 0.78 - 0.9, a - 0.78 + 0.9, 20, 80, 0.35, col);
        aoe(P, P.x, P.y, 80, 45 * M); shake(0.6); sfx.counter();
      });
      out = { rec: n * 0.055 + 0.25, move: 0.9 };
      break;
    }
    case 'greatsword': {
      // wrath of Heracles: slam + rolling shockwaves (divine club: always stuns 2 s)
      const R = 34 * reach(p), stun = s.leg.w_great ? 2 : p > 0.5 ? 0.8 : undefined;
      ring(P.x, P.y, 4, R, 0.35, col, 3); burst(P.x, P.y, 40, '#8a7c68', 160, { grav: 80, size: 2.5 });
      aoe(P, P.x, P.y, R, 40 * M, { knock: 160, poise: 4, stun });
      const waves = p < 0.5 ? 1 : p < 0.97 ? 2 : 3;
      for (let w = 1; w <= waves; w++) later(0.15 * w, () => { const rr = R * (1 + 0.45 * w); ring(P.x, P.y, rr * 0.7, rr, 0.35, col, 2); aoe(P, P.x, P.y, rr, 18 * M, { knock: 80 }); shake(0.3); });
      if (full) for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * TAU + a;
        for (let i = 1; i <= 7; i++) later(0.05 * i, () => {
          const x = P.x + Math.cos(aa) * i * 16, y = P.y + Math.sin(aa) * i * 16;
          burst(x, y, 6, '#ff8f3a', 60, { grav: 60 }); aoe(P, x, y, 14, 14 * M, { knock: 40 });
        });
      }
      sfx.boom();
      break;
    }
    case 'staff': {
      // Hecate's comets on the nearest enemies, then a nova
      const n = 1 + Math.floor(p * 7) + (s.leg.w_staff ? 3 : 0);
      const targets = alive().sort((x, y) => dist(P.x, P.y, x.x, x.y) - dist(P.x, P.y, y.x, y.y));
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const x = t ? t.x + rand(-6, 6) : P.x + Math.cos(a) * 60 + rand(-30, 30), y = t ? t.y + rand(-6, 6) : P.y + Math.sin(a) * 60 + rand(-20, 20);
        G.hazards.push({ kind: 'circle', x, y, r: 22 + 18 * p, t: 0, wind: 0.32 + i * 0.07, dmg: 30 * M * s.dmgMul, owner: 'player', color: P.aura ? col : '#b88cff', type: 'arcane', fall: true, power: true });
      }
      ring(P.x, P.y - 8, 2, 24, 0.4, '#b88cff', 2);
      if (full) later(0.25, () => { ring(P.x, P.y, 4, 100, 0.5, '#b88cff', 3); aoe(P, P.x, P.y, 100, 25 * M, { type: 'arcane' }); });
      sfx.magic();
      break;
    }
    case 'bow': {
      // Apollo's arrow: a piercing sunbeam; full bar: a fan of five and a sun flare
      const shots = p < 0.5 ? [0] : p < 0.97 ? [-0.12, 0, 0.12] : [-0.36, -0.18, 0, 0.18, 0.36];
      for (const off of shots) {
        const aa = a + off;
        G.projs.push({ owner: 'player', kind: 'sunbeam', x: P.x + Math.cos(aa) * 8, y: P.y - 6 + Math.sin(aa) * 8, vx: Math.cos(aa) * 620, vy: Math.sin(aa) * 620, r: 4 + 4 * p, dmg: (off === 0 ? 30 : 18) * M, type: 'pierce', life: 0.55, pierce: 99, hit: new Set(), color: '#ffd36b', shieldBreak: true, critBonus: 0.2, flare: full && off === 0, power: true });
      }
      sfx.bow(1);
      break;
    }
    case 'spear': {
      // Achilles' spear: thrown spears pierce everything and come back; full bar: spears rain from the sky
      const n = p < 0.5 ? 1 : p < 0.97 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.16;
        G.projs.push({ owner: 'player', kind: 'spear', x: P.x + Math.cos(aa) * 8, y: P.y - 6 + Math.sin(aa) * 8, vx: Math.cos(aa) * 460, vy: Math.sin(aa) * 460, r: 5, dmg: 24 * M, type: 'pierce', life: 2.5, pierce: 99, hit: new Set(), color: col, shieldBreak: true, knock: 70, ret: true, out: 0.22 + 0.25 * p, power: true });
      }
      if (full) {
        const ts = alive();
        for (let i = 0; i < 12; i++) {
          const t = ts.length ? ts[i % ts.length] : null;
          const x = t ? t.x + rand(-10, 10) : P.x + rand(-80, 80), y = t ? t.y + rand(-10, 10) : P.y + rand(-60, 60);
          G.hazards.push({ kind: 'circle', x, y, r: 14, t: 0, wind: 0.3 + i * 0.05, dmg: 20 * M * s.dmgMul, owner: 'player', color: '#ece4d0', type: 'pierce', fall: true, power: true });
        }
      }
      sfx.bow(1); sfx.swing(true);
      out = { rec: 0.25 };
      break;
    }
    case 'aspis': {
      // phalanx: a bronze wave from the shield stuns everything in front, the shield becomes a barrier
      const R = 40 * reach(p);
      smear(P.x, P.y - 5, a - 1.1, a + 1.1, 8, R, 0.3, '#f0d9a0');
      smear(P.x, P.y - 5, a - 0.9, a + 0.9, R * 0.6, R + 4, 0.22, col);
      for (let i = 1; i <= 4; i++) later(0.04 * i, () => ring(P.x + Math.cos(a) * i * R * 0.22, P.y + Math.sin(a) * i * R * 0.22, 2, 10 + i * 4, 0.25, '#f0d9a0', 2));
      aoe(P, P.x, P.y, R, 20 * M, { cone: a, half: 1.1, knock: 220, poise: 4, stun: 0.8 + 1.4 * p });
      P.frostShield = Math.max(P.frostShield, Math.round(10 + 40 * p));
      text(P.x, P.y - 26, 'барьер ' + P.frostShield, '#f0d9a0');
      if (full) { P.iframe = 2.5; P.domeT = 2.5; ring(P.x, P.y - 6, 4, 26, 0.5, '#ffd36b', 3); }
      sfx.block(); sfx.boom();
      break;
    }
    case 'labrys': {
      // Minos' whirl: the hero spins and keeps walking; each turn cuts everything around; full bar pulls enemies in
      const dur = 0.6 + 1.6 * p, turns = Math.floor(dur / 0.22), R = 34 * (1 + 0.5 * p);
      for (let i = 0; i < turns; i++) later(i * 0.22, () => {
        if (P.dead) return;
        const aa = P.face + i * 2.1;
        smear(P.x, P.y - 5, aa, aa + TAU * 0.9, R * 0.45, R, 0.2, i % 2 ? col : '#e8e2d2');
        if (full) { pull(P.x, P.y, R * 2.4, 110); ring(P.x, P.y, R * 2.2, R * 2.4, 0.2, col, 1); }
        aoe(P, P.x, P.y, R, 12 * (1 + 2.4 * p) * s.powerMul, { knock: full ? 10 : 50, poise: 1.2, venom: 1 });
        sfx.swing(true);
      });
      out = { rec: dur, move: 0.75, spin: dur };
      break;
    }
    case 'pelekys': {
      // execution: the axe splits the ground forward; low-health enemies die outright; full bar: the crack erupts 3 times
      const segs = 4 + Math.round(8 * p), exe = 0.25 + 0.15 * p + (s.leg.w_pelekys ? 0.1 : 0) + (lv('c_execute') ? 0.15 : 0);
      const erupt = (k) => {
        const set = new Set();
        for (let i = 1; i <= segs; i++) later(0.035 * i + k * 0.35, () => {
          const x = P.x + Math.cos(a) * i * 14, y = P.y + Math.sin(a) * i * 14;
          burst(x, y, 8, k ? '#ff8f3a' : '#5c4a3a', 80, { grav: 100, size: 2 }); ring(x, y, 2, 12, 0.25, k ? '#ff8f3a' : '#8a7c68', 2);
          aoe(P, x, y, 16, (k ? 18 : 34) * M, { set, knock: 60, poise: 3, execute: exe, fx: P.x, fy: P.y });
          if (i === 1) { shake(0.4); sfx.boom(); }
        });
      };
      erupt(0);
      if (full) { erupt(1); erupt(2); }
      smear(P.x, P.y - 5, a - 0.6, a + 0.6, 10, 46, 0.3, '#3b2a22');
      break;
    }
    case 'cleaver': {
      // the titan falls: giant whirls in a row and a ground slam; full bar: five whirls and an earthquake
      const n = p < 0.5 ? 1 : p < 0.97 ? 3 : 5, R = 42 * reach(p) * 0.8;
      for (let i = 0; i < n; i++) later(i * 0.2, () => {
        if (P.dead) return;
        const aa = P.face + i * 1.7;
        smear(P.x, P.y - 5, aa, aa + TAU, R * 0.25, R, 0.3, '#2a2530');
        smear(P.x, P.y - 5, aa, aa + TAU, R * 0.6, R + 2, 0.22, col);
        aoe(P, P.x, P.y, R, 20 * M, { knock: 140, poise: 3 });
        shake(0.35); sfx.swing(true);
      });
      later(n * 0.2, () => {
        ring(P.x, P.y, 6, R * 1.3, 0.45, '#b8aa90', 3); burst(P.x, P.y, 50, '#6b5f52', 180, { grav: 90, size: 2.5 });
        aoe(P, P.x, P.y, R * 1.3, 30 * M, { knock: 200, poise: 5, stun: 1 });
        shake(0.8); sfx.boom();
        if (full) for (let w = 1; w <= 3; w++) later(0.18 * w, () => {
          const rr = R * (1.3 + 0.7 * w); ring(P.x, P.y, rr - 8, rr, 0.4, col, 3);
          aoe(P, P.x, P.y, rr, 15 * M, { knock: 60, stun: 1 }); shake(0.5);
        });
      });
      out = { rec: n * 0.2 + 0.35, move: 0.35, spin: n * 0.2 };
      break;
    }
  }
  riders(P, p, full);
  return out;
}

// god gifts that change EVERY charged attack
function riders(P, p, full) {
  const s = P.s, ds = dotScale();
  if (lv('f_forge')) {
    const fx = P.x + Math.cos(P.face) * 18, fy = P.y + Math.sin(P.face) * 18, r = 18 + 30 * p;
    G.zones.push({ x: fx, y: fy, r, t: 0, life: 2.5 + 1.5 * p, dps: (8 + 6 * lv('f_forge')) * (1 + p) * ds, type: 'fire', color: '#ff8f3a', tick: 0 });
    ring(fx, fy, 2, r, 0.4, '#ff8f3a', 2);
  }
  if (lv('i_spikes')) shards(P.x, P.y, 4 + 4 * lv('i_spikes'), (8 + 10 * p) * ds);
  if (lv('s_charged') && p >= 0.5) {
    const ts = alive().sort((x, y) => dist(P.x, P.y, x.x, x.y) - dist(P.x, P.y, y.x, y.y)).slice(0, 1 + 2 * lv('s_charged'));
    ts.forEach((e, i) => later(0.06 * i, () => { if (e.dead) return; bolt(e.x, e.y - 100, e.x, e.y - 4); hitEnemy(e, (20 + 10 * lv('s_charged')) * (1 + p) * ds, { type: 'shock', noProc: true, fx: e.x, fy: e.y - 10, power: true }); }));
  }
  if (full && s.aresRage) {
    P.rageT = 4; text(P.x, P.y - 34, 'ЯРОСТЬ АРЕСА', '#ff3355', true);
    for (let i = 0; i < 16; i++) part({ x: P.x, y: P.y - 6, vx: rand(-80, 80), vy: rand(-80, 80), life: 0.4, color: '#ff3355', size: 1, drag: 3, glow: true });
  }
}
export { angTo, angDiff, text };
