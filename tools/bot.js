// In-browser soak test: paste/run in the page (?debug). __bot('rogue') plays a whole run headless-fast.
window.__bot = function (cls, maxSimSec = 900, god = true) {
  const G = __G, D = __dbg, inp = D.input;
  const log = { cls, errors: [], rooms: [], simT: 0 };
  document.getElementById('menu').hidden = true;
  const base = { sword: 'w_sword', dagger: 'w_dagger', greatsword: 'w_great', staff: 'w_staff', bow: 'w_bow' }[cls];
  const w = D.makeItem(base, 1, 0, { affixes: [] }); G.save.inv.items.push(w); D.equipItem(G.save.inv, w);
  D.startRun();
  G.godmode = god;
  const dt = 1 / 60;
  let stuck = 0, lastKey = '', roomT = 0, slowRooms = [];
  try {
    for (let i = 0; i < maxSimSec * 60; i++) {
      log.simT += dt; roomT += dt;
      const cards = document.getElementById('cards'), bf = document.getElementById('bonfire'), end = document.getElementById('end');
      if (!end.hidden) { log.end = document.getElementById('end-title').textContent; break; }
      if (!cards.hidden) { const c = cards.querySelector('.card'); c ? c.click() : document.getElementById('btn-rest').click(); continue; }
      if (!bf.hidden) { document.getElementById('bf-rest').click(); continue; }
      if (!document.getElementById('gear').hidden) { document.getElementById('gear-close').click(); continue; }
      if (G.transition) { G.transition.then(); G.transition = null; }
      const key = G.run.floor + ':' + G.run.roomIdx;
      if (key !== lastKey) { if (lastKey) slowRooms.push(lastKey + '=' + roomT.toFixed(0)); log.rooms.push(key + ':' + G.room.plan); lastKey = key; stuck = 0; roomT = 0; }
      const P = G.player; inp.down = {}; inp.stick.active = true;
      const alive = G.enemies.filter((e) => !e.dead && e.spawnT <= 0);
      let tx, ty;
      if (alive.length) {
        alive.sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y));
        const e = alive[0], d = Math.hypot(e.x - P.x, e.y - P.y);
        const ranged = cls === 'staff' || cls === 'bow';
        const want = ranged && D.los(G.room, P.x, P.y - 6, e.x, e.y - 6) ? 70 : 14;
        const dir = d > want ? 1 : ranged ? -1 : 0;
        tx = P.x + (e.x - P.x) * dir; ty = P.y + (e.y - P.y) * dir;
        G.mouseWorld = { x: e.x, y: e.y - 4 };
        if (d < (ranged ? 180 : 34)) { inp.buf.attack = 0.15; inp.down.attack = cls === 'bow' ? i % 50 < 40 : true; }
        if (e.state === 'wind' && d < 40 && Math.random() < 0.08) inp.buf.dodge = 0.15;
        if (Math.random() < 0.01) inp.buf.skill = 0.15;
        if (P.hp < P.s.maxHp * 0.4 && Math.random() < 0.01) inp.buf.flask = 0.15;
      } else {
        const ex = G.room.exits.find((x) => x.open);
        if (ex) { tx = ex.tx * 16 + 16; ty = 8; }
        else if (G.room.bonfire && !G.room.bonfire.used) { tx = G.room.bonfire.x; ty = G.room.bonfire.y; }
        else if (G.room.echo) { tx = G.room.echo.x; ty = G.room.echo.y; }
        else { tx = P.x; ty = P.y; }
      }
      let mx = tx - P.x, my = ty - P.y; const l = Math.hypot(mx, my) || 1;
      // navigate with a flow field toward the target (around pillars and chasms)
      if (l > 3 && (i % 6 === 0 || !log._dir)) {
        const R = G.room, keep = R.flow.slice();
        D.updateFlow(R, tx, ty);
        log._dir = D.flowDir(R, P.x, P.y);
        R.flow.set(keep);
      }
      const dirOK = log._dir && l > 18;
      if (dirOK) { mx = log._dir.x; my = log._dir.y; }
      const ll = Math.hypot(mx, my) || 1;
      inp.stick.dx = l > 3 ? mx / ll : 0; inp.stick.dy = l > 3 ? my / ll : 0;
      const bx = P.x, by = P.y;
      inp.update(dt);
      G.t += dt; D.updateGame(dt);
      if (Math.hypot(P.x - bx, P.y - by) < 0.05 && l > 10) stuck++; else stuck = Math.max(0, stuck - 1);
      if (stuck > 90) { const a = Math.random() * 6.28; inp.stick.dx = Math.cos(a); inp.stick.dy = Math.sin(a); for (let k = 0; k < 25; k++) { inp.update(dt); D.updateGame(dt); } stuck = 0; }
      G.freeze = 0; G.slow = 0;
    }
  } catch (err) { log.errors.push(String((err && err.stack) || err).slice(0, 700)); }
  inp.stick.active = false;
  Object.assign(log, { found: G.run.items.length, mats: JSON.stringify(G.run.mats), floor: G.run.floor, room: G.run.roomIdx, kills: G.run.kills, hits: G.run.hitsTaken, ash: G.run.ash, banked: G.run.banked, picks: G.run.picks, perfects: G.run.perfects, boons: Object.keys(G.run.boons).join(','), aspects: JSON.stringify(G.run.aspects), roomTimes: slowRooms.join(' ') });
  log.rooms = log.rooms.length; delete log._dir;
  return log;
};
