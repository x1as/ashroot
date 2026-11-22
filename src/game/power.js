// Charged attacks ("усиленная атака"): hold attack to pour stamina into the weapon, release to unleash it.
// Power p = stamina spent / max stamina (0..1). Damage ~ x1.5 at a sip, ~x7 at a full bar; range grows ~2.6x.
// Every weapon type has its own technique; a full bar adds a finale on top.
import { G } from './state.js';
import { dist, angTo, angDiff, rand, TAU, clamp } from '../engine/util.js';
import { burst, ring, smear, shake, hitstop, flash, banner, text, slowmo } from '../engine/fx.js';
import { sfx } from '../engine/audio.js';
import { hitEnemy, later } from './combat.js';
import { hitProp } from './props.js';

export const POWER_INFO = {
  sword: { name: 'Серп Персея', desc: 'Полумесяцы-волны рассекают всё на пути. Полная шкала: пять волн и кольцо.' },
  dagger: { name: 'Танец теней', desc: 'Вихрь из 3–12 ударов вокруг героя. Полная шкала: финальный крест.' },
  greatsword: { name: 'Гнев Геракла', desc: 'Удар о землю и расходящиеся волны. Полная шкала: трещины во все стороны.' },
  staff: { name: 'Кометы Гекаты', desc: 'С неба падают 1–8 комет на ближайших врагов. Полная шкала: нова вокруг.' },
  bow: { name: 'Стрела Аполлона', desc: 'Солнечная стрела пробивает всех. Полная шкала: веер и вспышка солнца.' },
};

const mult = (p) => 1.5 + 5.5 * Math.pow(p, 1.3);
const reach = (p) => 1 + 1.6 * p;

function aoe(P, x, y, r, dmg, o = {}) {
  for (const e of G.enemies) if (!e.dead && e.spawnT <= 0 && dist(x, y, e.x, e.y) < r + e.r) hitEnemy(e, dmg, { fx: x, fy: y, knock: o.knock ?? 90, heavy: true, poiseMul: o.poise ?? 2, shieldBreak: o.shieldBreak ?? true, type: o.type });
  for (const pr of G.room.props || []) if (!pr.dead && dist(x, y, pr.x, pr.y) < r) hitProp(pr);
}

export function unleash(P, p) {
  p = clamp(p, 0.05, 1);
  const full = p >= 0.97, s = P.s, col = P.accent[0], a = P.face;
  shake(0.25 + 0.75 * p); hitstop(0.05 + 0.08 * p); flash(col, 0.1 + 0.25 * p);
  if (full) { slowmo(0.35, 0.35); banner(POWER_INFO[P.wk].name, '', col, 1.1); }
  switch (P.wk) {
    case 'sword': {
      const n = p < 0.5 ? 1 : p < 0.97 ? 3 : 5, R = 14 + 18 * p;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.32;
        G.projs.push({ owner: 'player', kind: 'crescent', x: P.x + Math.cos(aa) * 10, y: P.y - 6 + Math.sin(aa) * 10, vx: Math.cos(aa) * 280, vy: Math.sin(aa) * 280, r: R, dmg: 22 * mult(p), type: 'slash', life: 0.45 + 0.45 * p, pierce: 99, hit: new Set(), color: col, knock: 80, shieldBreak: true });
      }
      smear(P.x, P.y - 5, a - Math.PI, a + Math.PI, 20, 30 * reach(p), 0.3, col);
      aoe(P, P.x, P.y, 26 * reach(p), 18 * mult(p));
      if (full) { ring(P.x, P.y, 6, 120, 0.6, '#ffffff', 3); aoe(P, P.x, P.y, 70, 30 * mult(p)); }
      sfx.swing(true);
      break;
    }
    case 'dagger': {
      const n = Math.round(3 + 9 * p), R = 34 * reach(p);
      for (let i = 0; i < n; i++) later(i * 0.055, () => {
        const aa = rand(TAU);
        smear(P.x, P.y - 5, aa - 0.9, aa + 0.9, R * 0.5, R, 0.14, i % 2 ? col : '#ffffff');
        P.afterimg.push({ x: P.x + Math.cos(aa) * 10, y: P.y + Math.sin(aa) * 6, t: 0, flip: Math.cos(aa) < 0 });
        aoe(P, P.x, P.y, R, 9 * (1 + 2.2 * p), { knock: 20, poise: 0.6, shieldBreak: false });
        sfx.swing(false);
      });
      if (full) later(n * 0.055 + 0.08, () => {
        smear(P.x, P.y - 5, a + 0.78 - 0.9, a + 0.78 + 0.9, 20, 80, 0.35, '#ffffff');
        smear(P.x, P.y - 5, a - 0.78 - 0.9, a - 0.78 + 0.9, 20, 80, 0.35, col);
        aoe(P, P.x, P.y, 80, 45 * mult(p)); shake(0.6); sfx.counter();
      });
      break;
    }
    case 'greatsword': {
      const R = 34 * reach(p);
      ring(P.x, P.y, 4, R, 0.35, col, 3); burst(P.x, P.y, 40, '#8a7c68', 160, { grav: 80, size: 2.5 });
      aoe(P, P.x, P.y, R, 40 * mult(p), { knock: 160, poise: 4 });
      const waves = p < 0.5 ? 1 : p < 0.97 ? 2 : 3;
      for (let w = 1; w <= waves; w++) later(0.15 * w, () => { const rr = R * (1 + 0.45 * w); ring(P.x, P.y, rr * 0.7, rr, 0.35, col, 2); aoe(P, P.x, P.y, rr, 18 * mult(p), { knock: 80 }); shake(0.3); });
      if (full) for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * TAU + a;
        for (let i = 1; i <= 7; i++) later(0.05 * i, () => {
          const x = P.x + Math.cos(aa) * i * 16, y = P.y + Math.sin(aa) * i * 16;
          burst(x, y, 6, '#ff8f3a', 60, { grav: 60 }); aoe(P, x, y, 14, 14 * mult(p), { knock: 40 });
        });
      }
      sfx.boom();
      break;
    }
    case 'staff': {
      const n = 1 + Math.floor(p * 7);
      const targets = G.enemies.filter((e) => !e.dead && e.spawnT <= 0).sort((x, y) => dist(P.x, P.y, x.x, x.y) - dist(P.x, P.y, y.x, y.y));
      for (let i = 0; i < n; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const x = t ? t.x + rand(-6, 6) : P.x + Math.cos(a) * 60 + rand(-30, 30), y = t ? t.y + rand(-6, 6) : P.y + Math.sin(a) * 60 + rand(-20, 20);
        G.hazards.push({ kind: 'circle', x, y, r: 22 + 18 * p, t: 0, wind: 0.32 + i * 0.07, dmg: 30 * mult(p) * s.dmgMul, owner: 'player', color: '#b88cff', type: 'arcane', fall: true });
      }
      ring(P.x, P.y - 8, 2, 24, 0.4, '#b88cff', 2);
      if (full) later(0.25, () => { ring(P.x, P.y, 4, 100, 0.5, '#b88cff', 3); aoe(P, P.x, P.y, 100, 25 * mult(p), { type: 'arcane' }); });
      sfx.magic();
      break;
    }
    case 'bow': {
      const shots = p < 0.5 ? [0] : p < 0.97 ? [-0.12, 0, 0.12] : [-0.36, -0.18, 0, 0.18, 0.36];
      for (const off of shots) {
        const aa = a + off;
        G.projs.push({ owner: 'player', kind: 'sunbeam', x: P.x + Math.cos(aa) * 8, y: P.y - 6 + Math.sin(aa) * 8, vx: Math.cos(aa) * 620, vy: Math.sin(aa) * 620, r: 4 + 4 * p, dmg: (off === 0 ? 30 : 18) * mult(p), type: 'pierce', life: 0.55, pierce: 99, hit: new Set(), color: '#ffd36b', shieldBreak: true, critBonus: 0.2, flare: full && off === 0 });
      }
      sfx.bow(1);
      break;
    }
  }
}
export { angTo, angDiff, text };
