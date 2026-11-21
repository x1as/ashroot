// Run flow: floors -> rooms (Kishōtenketsu plan) -> rewards -> bonfire -> boss -> next floor.
import { G, resetWorld } from './state.js';
import { FLOORS, ROOM_PLAN, composeRoom } from '../data/floors.js';
import { BOONS, BOON, ASPECTS } from '../data/boons.js';
import { computeStats } from './stats.js';
import { createPlayer, applyLoadout, gearLook } from './player.js';
import { createEnemy } from './enemy.js';
import { createBoss } from './boss.js';
import { makeRoom, spawnPoint, openExits, updateFlow, TS } from './world.js';
import { banner, ring, burst, text, slowmo, flash, shake } from '../engine/fx.js';
import { sfx, setDrone } from '../engine/audio.js';
import { writeSave } from './save.js';
import { input } from '../engine/input.js';
import { weighted, rand, shuffle } from '../engine/util.js';
import { later } from './combat.js';
import { emit } from './events.js';

const DRONES = [55, 49, 41, 61, 36.7];

export const runStats = (boons = {}) => computeStats(G.save.nodes, G.save.inv.equip, G.save.inv.items, boons);

export function startRun() {
  const save = G.save;
  const stats = runStats();
  G.run = {
    wk: stats.wk, floor: 1, roomIdx: 0, boons: {}, aspects: { ...stats.gearAspects }, ash: 0, banked: 0, kills: 0, hitsTaken: 0, perfects: 0,
    time: 0, rerolls: stats.rerolls, cursed: false, roomHits: 0, lastStandUsed: false, unstoppableUsed: false, picks: 0,
    mats: {}, items: [],
  };
  G.player = createPlayer(stats, gearLook(save.inv), 0, 0);
  save.stats.runs++; writeSave(save);
  emit('runStart', { weapon: stats.wk });
  for (const id of stats.startWith) addBoon(id, true);
  if (stats.startBoon) addBoon(rollOffer(1)[0].id, true);
  G.mode = 'game';
  enterRoom(0);
}

export function recompute() {
  const P = G.player, r = G.run;
  const oldMax = P.s.maxHp;
  const s = runStats(r.boons);
  applyLoadout(P, s, gearLook(G.save.inv));
  r.wk = s.wk;
  // aspects = infused gear + boon levels (re-derived, so swapping gear mid-run stays consistent)
  const asp = { ...s.gearAspects };
  for (const id in r.boons) { const b = BOON[id]; if (b.aspect !== 'neutral' && b.aspect !== 'pact') asp[b.aspect] = (asp[b.aspect] || 0) + r.boons[id]; }
  r.aspects = asp;
  if (P.s.maxHp > oldMax) P.hp += P.s.maxHp - oldMax;
  P.hp = Math.min(P.hp, P.s.maxHp);
  P.sta = Math.min(P.sta, P.s.maxSta);
}

export function addBoon(id, silent) {
  const r = G.run, b = BOON[id];
  const before = r.aspects[b.aspect] || 0;
  r.boons[id] = (r.boons[id] || 0) + 1;
  emit('boonPick', { id, aspect: b.aspect });
  r.picks++;
  const P = G.player;
  if (id === 'p_vow') P.flasks = Math.max(0, P.flasks - 1);
  recompute();
  const after = r.aspects[b.aspect] || 0;
  if (!silent) {
    sfx.pick();
    const A = ASPECTS[b.aspect];
    const sh = G.player.s.resoShift || 0, t1 = 3 - sh, t2 = 5 - sh;
    if ((before < t1 && after >= t1) || (before < t2 && after >= t2)) {
      emit('resonance', { aspect: b.aspect, tier: after >= t2 ? 2 : 1 });
      banner(`Резонанс ${after >= t2 ? 'II' : 'I'}: ${A.name}`, (after >= t2 ? RESO_TXT[b.aspect][1] : RESO_TXT[b.aspect][0]), A.color, 3);
      flash(A.color, 0.3); slowmo(0.4, 0.4);
    }
  }
}
import { RESONANCE as RESO_TXT } from '../data/boons.js';

export function rollOffer(n) {
  const r = G.run;
  const allowPact = !(r.floor === 1 && r.roomIdx < 2);
  const pool = BOONS.filter((b) => (!b.weapon || b.weapon === r.wk) && (r.boons[b.id] || 0) < (b.max || 3) && (allowPact || !b.pact));
  const out = [];
  let pacts = 0;
  while (out.length < n && pool.length) {
    const b = weighted(pool, (x) => {
      let w = 1;
      if ((r.aspects[x.aspect] || 0) > 0) w += 1.4;           // steer toward synergy
      if (x.pact) w = pacts ? 0 : 0.45;
      if (x.weapon) w = 0.8;
      if (x.aspect === 'neutral') w = 0.8;
      return w;
    });
    if (b.pact) pacts++;
    out.push(b); pool.splice(pool.indexOf(b), 1);
  }
  return out;
}

export function enterRoom(idx) {
  const r = G.run, F = FLOORS[r.floor - 1], plan = ROOM_PLAN[idx];
  r.roomIdx = idx;
  resetWorld();
  G.tokens = 0; G.delayed = [];
  const R = makeRoom(plan.id, F.theme, F.terrain);
  G.room = R;
  const P = G.player;
  P.x = R.entry.x; P.y = R.entry.y; P.vx = 0; P.vy = -40; P.setState('move'); P.face = -Math.PI / 2;
  P.lastSafe = { x: P.x, y: P.y };
  P.arcaneUp = P.s.arcaneShield;
  for (const c of P.cloth) { c.x = c.px = P.x; c.y = c.py = P.y - 8; }
  G.cam.x = P.x; G.cam.y = P.y - 30;
  r.roomHits = 0;
  R.state = { waves: [], wave: -1, t: 0, cleared: false, rewardShown: false, timer: 0 };
  if (plan.id === 'boss') {
    const b = createBoss(F.boss, R.w * TS / 2, 6 * TS);
    G.enemies.push(b); G.boss = b;
    setDrone(DRONES[r.floor - 1] * 0.75);
  } else {
    G.boss = null;
    if (idx === 0) setDrone(DRONES[r.floor - 1]);
  }
  if (plan.id === 'bonfire') {
    R.bonfire = { x: R.w * TS / 2, y: R.h * TS / 2 + 4, used: false };
    R.state.cleared = true;
  } else if (plan.id !== 'boss') {
    R.state.waves = composeRoom(r.floor - 1, idx, { cursed: r.cursed && plan.id === 'arena' });
  }
  // souls-like echo: your lost ash waits where you fell (first room of that floor)
  const echo = G.save.echo;
  if (echo && echo.floor === r.floor && idx === 0) R.echo = { x: R.w * TS / 2 + 30, y: R.h * TS / 2, ash: echo.ash };
  banner(idx === 0 ? F.name : plan.name, idx === 0 ? `${F.sub} · ${plan.name}` : `${F.sub} · зал ${idx + 1}`, F.theme.accent, 1.8);
  updateFlow(R, P.x, P.y);
}

export function updateRoom(dt) {
  const R = G.room, S = R.state, r = G.run, P = G.player;
  r.time += dt;
  S.t += dt;
  R.flowT -= dt;
  if (R.flowT <= 0) { R.flowT = 0.2; updateFlow(R, P.x, P.y); }
  const alive = G.enemies.filter((e) => !e.dead);
  if (!S.cleared && R.plan !== 'boss') {
    S.timer += dt;
    const nextReady = S.wave < 0 ? S.t > 0.7 : alive.length <= (S.wave === 0 ? 1 : 0) && S.wave < S.waves.length - 1;
    if (nextReady && S.wave < S.waves.length - 1) {
      S.wave++;
      for (const [type, elite] of S.waves[S.wave]) {
        const p = spawnPoint(R, P.x, P.y, 100);
        G.enemies.push(createEnemy(type, p.x, p.y, { elite, dmgMul: r.cursed && R.plan === 'arena' ? 1.25 : 1 }));
      }
    } else if (S.wave === S.waves.length - 1 && alive.length === 0) {
      S.cleared = true; onCleared();
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead || false);
  if (S.cleared && !S.rewardShown && S.clearT !== undefined) {
    S.clearT -= dt;
    if (S.clearT <= 0) { S.rewardShown = true; showReward(); }
  }
  // echo pickup
  if (R.echo && Math.hypot(P.x - R.echo.x, P.y - R.echo.y) < 10) {
    r.ash += R.echo.ash; text(P.x, P.y - 26, `+${R.echo.ash} пепла`, '#ece4d0', true);
    banner('Тень поглощена', `ты вернул ${R.echo.ash} пепла`, '#ece4d0', 1.8);
    ring(R.echo.x, R.echo.y, 3, 40, 0.6, '#ece4d0', 2); sfx.pick();
    emit('echo', { ash: R.echo.ash });
    G.save.echo = null; writeSave(G.save); R.echo = null;
  }
  // bonfire
  if (R.bonfire && !R.bonfire.used && Math.hypot(P.x - R.bonfire.x, P.y - R.bonfire.y) < 22) {
    R.bonfire.used = true; G.ui.showBonfire();
  }
}

function onCleared() {
  const R = G.room, S = R.state, r = G.run;
  S.clearT = 0.9;
  const par = 20 + r.floor * 6 + (R.plan === 'arena' ? 15 : 0);
  emit('roomClear', { floor: r.floor, plan: R.plan, time: S.timer, courage: S.timer < par && R.plan !== 'fork' });
  if (S.timer < par && R.plan !== 'fork') {
    const bonus = Math.round(4 + r.floor * 2);
    r.ash += bonus; banner('ЧИСТО', `кураж: ${Math.round(S.timer)} с < ${par} с · +${bonus} пепла`, '#ffd36b', 1.6);
  } else banner('ЧИСТО', '', '#ece4d0', 1.2);
  sfx.door();
}

function showReward() {
  const r = G.run, R = G.room;
  const n = G.player.s.cards;
  const double = R.plan === 'arena' && r.cursed;
  G.ui.showCards({
    title: double ? 'Дар Немезиды · 1 из 2' : 'Дар богов',
    offer: rollOffer(n), canRest: true, picksLeft: double ? 2 : 1,
    onDone: () => { openExits(R); sfx.door(); },
  });
}

export function onBossDeath(b) {
  const r = G.run, P = G.player;
  slowmo(1.4, 0.2); flash('#ffffff', 0.5); shake(1);
  banner(r.floor === 5 ? 'ТРИНАДЦАТЫЙ ПОДВИГ' : 'ПОДВИГ СОВЕРШЁН', b.def.myth || b.def.name, b.def.color, 3.4);
  // bank everything: the boss is the souls-like checkpoint
  emit('bossKill', { id: b.type, floor: r.floor, time: r.time, hitsTaken: G.run.roomHits || 0, weapon: r.wk });
  G.save.ash += r.ash; G.save.stats.ashEarned += r.ash; r.banked += r.ash; r.ash = 0;
  G.save.stats.bestFloor = Math.max(G.save.stats.bestFloor, r.floor);
  writeSave(G.save);
  P.flasks = P.s.flasks; P.hp = Math.min(P.s.maxHp, P.hp + P.s.maxHp * 0.3);
  r.unstoppableUsed = false;
  G.boss = null;
  const R = G.room;
  R.state.cleared = true; R.state.rewardShown = true;
  later(1.2, () => {
    if (r.floor === 5) { G.ui.showEnd(true); return; }
    G.ui.showCards({ title: 'Дар за подвиг', offer: rollOffer(P.s.cards), canRest: false, picksLeft: 1, onDone: () => { openExits(R); sfx.door(); } });
  });
}

export function takeExit(ex) {
  const r = G.run;
  if (G.room.plan === 'fork') r.cursed = ex.kind === 'cursed';
  input.clear();
  writeSave(G.save); // loot picked up in the room is kept
  G.transition = { t: 0, dir: 1, then: () => {
    if (G.room.plan === 'boss') {
      r.floor++; r.cursed = false;
      G.player.flasks = G.player.s.flasks;
      enterRoom(0);
    } else enterRoom(r.roomIdx + 1);
  } };
}

export function onPlayerDeath() {
  const r = G.run, save = G.save;
  slowmo(1.5, 0.15); sfx.death(); shake(0.6);
  // half the unbanked ash settles into the tree, half becomes your echo on this floor
  const keep = Math.floor(r.ash * G.player.s.deathKeep);
  save.ash += keep;
  save.echo = r.ash - keep > 0 ? { floor: r.floor, ash: r.ash - keep } : save.echo;
  save.stats.deaths++; save.stats.kills += r.kills;
  save.stats.bestFloor = Math.max(save.stats.bestFloor, r.floor);
  r.deathKeep = keep; save.stats.ashEarned += keep;
  emit('runEnd', runSummary(false));
  writeSave(save);
  later(1.1, () => G.ui.showEnd(false));
}

export function finishVictory() {
  const save = G.save, r = G.run;
  save.stats.wins++; save.stats.kills += r.kills; save.echo = null;
  emit('runEnd', runSummary(true));
  writeSave(save);
}
function runSummary(win) {
  const r = G.run;
  return { win, weapon: r.wk, floor: r.floor, time: r.time, kills: r.kills, hitsTaken: r.hitsTaken, perfects: r.perfects, picks: r.picks, pacts: Object.keys(r.boons).filter((id) => id.startsWith('p_')).length };
}
