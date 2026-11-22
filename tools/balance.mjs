// Balance simulator: `npm run balance`. Reads the SAME data files the game uses.
// Checks the tough-but-fair contract and prints TTK / hits-to-die / boss duration / matchup matrix.
import { WEAPONS as CLASSES, WEAPON_ORDER as CLASS_ORDER, rawDps, hitList } from '../src/data/weapons.js';
import { BASES } from '../src/data/items.js';
import { ENEMIES, SCALE, MIN_TELEGRAPH, MIN_PUNISH } from '../src/data/enemies.js';
import { BOSSES, BOSS_ORDER } from '../src/data/bosses.js';
import { TREE } from '../src/data/tree.js';
import { computeStats as cs } from '../src/game/stats.js';

// one hero: a 'class' here is a weapon type, worn with the starter light set (common, +0)
const baseOf = (wk) => Object.keys(BASES).find((k) => BASES[k].kind === wk);
const item = (base, rarity = 0, ilvl = 1, up = 0) => ({ base, slot: BASES[base].slot, rarity, ilvl, up, affixes: [], infuse: null });
const computeStats = (wk, meta = {}, g = null) => g
  ? cs(meta, { weapon: item(baseOf(wk), g.r, g.ilvl, g.up), helm: item('h_medium', g.r, g.ilvl, g.up), chest: item('c_medium', g.r, g.ilvl, g.up), gloves: item('g_medium', g.r, g.ilvl, g.up), boots: item('b_light', g.r, g.ilvl, g.up) })
  : cs(meta, { weapon: item(baseOf(wk)), helm: item('h_light'), chest: item('c_light') });
// PROGRESSION CONTRACT: the hero expected at each depth (share of the tree bought, gear rarity / level / forge upgrades).
// A fresh hero must be GATED from depth 3 on: you have to grow in every system to go deeper.
const EXPECT = [null,
  { tree: 0, gear: { r: 0, ilvl: 1, up: 0 } },
  { tree: 0.2, gear: { r: 1, ilvl: 2, up: 2 } },
  { tree: 0.4, gear: { r: 1, ilvl: 3, up: 4 } },
  { tree: 0.65, gear: { r: 2, ilvl: 4, up: 6 } },
  { tree: 0.8, gear: { r: 2, ilvl: 5, up: 7 } },
];
const metaFrac = (t) => Object.fromEntries(TREE.map((n) => [n.id, Math.round(n.max * t)]));
const expected = (cls, f) => computeStats(cls, metaFrac(EXPECT[f].tree), EXPECT[f].gear);

const UPTIME = 0.45;        // share of a fight you can actually attack (rest = dodging/positioning)
const PICK_POWER = 1.05;    // average offensive value of one run upgrade (multiplicative)
const TARGET = { ttk: [0.2, 5.5], htd: [3, 14], boss: [35, 130] };
const PICKS = (f) => 3 * (f - 1); // offensive boons that matter by the start of depth f
const warn = [];
const flag = (ok, msg) => { if (!ok) warn.push(msg); return ok ? '' : ' !'; };

const metaFull = Object.fromEntries(TREE.map((n) => [n.id, n.max]));
const metaHalf = Object.fromEntries(TREE.map((n) => [n.id, Math.ceil(n.max / 2)]));

// effective damage of one hit vs an enemy's traits
function hitVs(cls, dmg, e, f, fromFront = 0.5) {
  const c = CLASSES[cls];
  let d = dmg;
  const armor = (e.armor || 0) + (e.armor ? SCALE.armor(f) : 0);
  if (!c.ignoreArmor) d = Math.max(d * 0.15, d - armor);
  const res = e.resist?.[c.dmgType] || 0;
  d *= 1 - res;
  const shieldBreak = c.guardBreak || (c.arrow && dmg >= c.arrow.chargedDmg);
  if (e.shield && !c.ignoreArmor && !shieldBreak) {
    const front = cls === 'dagger' ? 0.3 : fromFront; // rogue flanks
    d *= 1 - front * 0.85;
  }
  if (cls === 'dagger' && e.shield) d *= 1 + c.backstab * 0.7;
  return d;
}
function dpsVs(cls, e, f, stats, picks) {
  const c = CLASSES[cls];
  const hits = hitList(c);
  const ratio = hits.reduce((s, h) => s + hitVs(cls, h, e, f), 0) / hits.reduce((s, h) => s + h, 0);
  const crit = 1 + stats.crit * (stats.critMul - 1);
  const chase = chaseMul(cls, e);
  // poise: if one hit breaks the enemy's stance it loses attacks -> more uptime (stagger-lock)
  const maxHit = Math.max(...hits) * c.poiseDmg;
  const stagger = e.poise && maxHit >= e.poise ? 1.25 : 1;
  const exe = c.execute && !e.boss ? 1 / (1 - c.execute * 0.6) : 1; // executions skip the last slice of HP
  const bleed = c.bleedOnHit ? 1.12 : 1;
  return rawDps(c) * ratio * crit * stagger * stats.dmgMul * Math.pow(PICK_POWER, picks) * chase * exe * bleed;
}
// time lost chasing / gained by reach: heavy weapons lose to blinkers and lungers, the dory and machairai punish them
const HEAVY = ['greatsword', 'pelekys', 'cleaver'];
function chaseMul(cls, e) {
  const c = CLASSES[cls];
  let k = 1;
  if (e.blink && c.combo) k *= HEAVY.includes(cls) ? 0.55 : cls === 'spear' ? 1.05 : 0.8;
  if (e.ai === 'lunger') k *= HEAVY.includes(cls) ? 0.8 : cls === 'dagger' || cls === 'spear' ? 1.2 : cls === 'sword' ? 1.25 : cls === 'staff' || cls === 'bow' ? 0.85 : 1;
  if (e.ai === 'ranged') k *= cls === 'spear' || cls === 'dagger' ? 1.15 : cls === 'aspis' ? 1.2 : HEAVY.includes(cls) ? 0.85 : 1;
  if (e.ai === 'caster' && cls === 'aspis') k *= 1.15;
  return k;
}

function line(cells, w = 9) { return cells.map((c, i) => (i === 0 ? String(c).padEnd(18) : String(c).padStart(w))).join(''); }

console.log('\n=== CONTRACT: telegraph >= %ss, punish window >= %ss ===', MIN_TELEGRAPH, MIN_PUNISH);
for (const [id, e] of Object.entries(ENEMIES)) {
  const a = e.atk;
  const okW = a.wind >= MIN_TELEGRAPH, okR = a.kind === 'explode' || a.rec >= MIN_PUNISH;
  console.log(line([id, `wind ${a.wind}`, `act ${a.act}`, `rec ${a.rec}`], 11) + flag(okW && okR, `${id}: telegraph/punish below contract`));
}
for (const id of BOSS_ORDER) {
  const b = BOSSES[id];
  for (const [mv, , p] of [...b.moves, ...b.p2]) {
    if (p.wind !== undefined && p.wind * 0.85 < MIN_TELEGRAPH) warn.push(`${id}.${mv}: phase-2 telegraph ${(p.wind * 0.85).toFixed(2)} < min`);
    if (p.rec !== undefined && mv !== 'summon' && p.rec * 0.85 < MIN_PUNISH) warn.push(`${id}.${mv}: phase-2 punish ${(p.rec * 0.85).toFixed(2)} < min`);
  }
}
// slowest class must be able to punish: warrior opener must fit inside the shortest punish window
const warOpen = CLASSES.greatsword.combo[0].wind + CLASSES.greatsword.combo[0].act;
console.log(`warrior opener ${warOpen.toFixed(2)}s vs min punish ${MIN_PUNISH}s` + flag(warOpen <= MIN_PUNISH, 'warrior opener longer than min punish window'));

for (const label of ['EXPECTED', 'FRESH']) {
  const st = (cls, f) => (label === 'EXPECTED' ? expected(cls, f) : computeStats(cls));
  console.log(`\n=== ${label} hero: TTK seconds (start of depth, ${UPTIME * 100}% uptime) ===`);
  for (const f of [1, 3, 5]) {
    console.log(`-- depth ${f}` + (label === 'EXPECTED' ? `  (tree ${EXPECT[f].tree * 100}%, gear r${EXPECT[f].gear.r} +${EXPECT[f].gear.up})` : ''));
    console.log(line(['enemy', ...CLASS_ORDER]));
    for (const [id, e] of Object.entries(ENEMIES)) {
      const cells = [id];
      for (const cls of CLASS_ORDER) {
        const ttk = e.hp * SCALE.hp(f) / (dpsVs(cls, e, f, st(cls, f), PICKS(f)) * UPTIME);
        cells.push(ttk.toFixed(2) + (label === 'EXPECTED' ? flag(ttk >= TARGET.ttk[0] && ttk <= TARGET.ttk[1] * (e.shield ? 1.6 : 1), `${label} d${f} ${cls} vs ${id}: TTK ${ttk.toFixed(1)}s`) : ''));
      }
      console.log(line(cells));
    }
  }
  console.log(`\n=== ${label} hero: hits to die (enemy hit = exact dmg, no RNG) ===`);
  console.log(line(['depth', ...CLASS_ORDER]));
  for (const f of [1, 2, 3, 4, 5]) {
    const avgDmg = Object.values(ENEMIES).reduce((a, e) => a + e.dmg, 0) / Object.keys(ENEMIES).length * SCALE.dmg(f);
    const cells = [`d${f} avg ${avgDmg.toFixed(1)}`];
    let sum = 0;
    for (const cls of CLASS_ORDER) {
      const s2 = st(cls, f);
      const htd = (s2.maxHp + 8 * (f - 1)) / (avgDmg * s2.dmgTaken);
      sum += htd;
      cells.push(htd.toFixed(1) + (label === 'EXPECTED' ? flag(htd >= TARGET.htd[0] && htd <= TARGET.htd[1], `${label} d${f} ${cls}: ${htd.toFixed(1)} hits to die`) : ''));
    }
    if (label === 'FRESH' && f >= 3) flag(sum / CLASS_ORDER.length < (f === 3 ? 4.6 : 4.2), `fresh hero not gated at depth ${f}: ${(sum / CLASS_ORDER.length).toFixed(1)} hits to die`);
    console.log(line(cells));
  }
  if (label === 'FRESH') continue;
  console.log(`\n=== ${label} hero: boss fight length, seconds ===`);
  console.log(line(['boss', ...CLASS_ORDER]));
  for (const id of BOSS_ORDER) {
    const b = BOSSES[id];
    const BM = 1.15 + 0.15 * b.floor;
    const cells = [`${id} ${Math.round(b.hp * BM)}`];
    for (const cls of CLASS_ORDER) {
      const t = b.hp * BM / (dpsVs(cls, { armor: b.armor, hp: b.hp, boss: true }, b.floor, st(cls, b.floor), PICKS(b.floor) + 3) * UPTIME);
      cells.push(t.toFixed(0) + flag(t >= TARGET.boss[0] && t <= TARGET.boss[1], `${label} ${id} vs ${cls}: ${t.toFixed(0)}s`));
    }
    console.log(line(cells));
  }
}

console.log('\n=== MATCHUP MATRIX (floor 3, fresh): class DPS vs enemy / class average. >1.15 = edge, <0.85 = struggle ===');
console.log(line(['enemy', ...CLASS_ORDER]));
const edges = Object.fromEntries(CLASS_ORDER.map((c) => [c, { good: 0, bad: 0 }]));
for (const [id, e] of Object.entries(ENEMIES)) {
  const vals = CLASS_ORDER.map((cls) => dpsVs(cls, e, 3, computeStats(cls), 10) / rawDps(CLASSES[cls]));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  console.log(line([id, ...vals.map((v, i) => {
    const r = v / avg;
    if (r > 1.15) edges[CLASS_ORDER[i]].good++;
    if (r < 0.85) edges[CLASS_ORDER[i]].bad++;
    return (r > 1.15 ? '+' : r < 0.85 ? '-' : ' ') + r.toFixed(2);
  })]));
}
for (const cls of CLASS_ORDER) {
  const { good, bad } = edges[cls];
  console.log(`${cls.padEnd(8)} edges ${good}, struggles ${bad}` + flag(good >= 1 && bad >= 1, `${cls}: not part of the rock-paper-scissors (good ${good}, bad ${bad})`));
}

console.log('\n=== RAW DPS ===');
for (const cls of CLASS_ORDER) { const st = computeStats(cls); console.log(cls.padEnd(11), 'dps', (rawDps(CLASSES[cls]) * st.dmgMul).toFixed(1), 'hp', st.maxHp, 'sta', st.maxSta, 'armor', st.armor.toFixed(1), 'roll', st.roll); }

console.log(warn.length ? `\n${warn.length} WARNINGS:\n - ` + warn.join('\n - ') : '\nALL CHECKS PASSED');
process.exitCode = warn.length ? 1 : 0;
