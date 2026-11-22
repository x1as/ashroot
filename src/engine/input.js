// Unified input: keyboard + mouse, or touch (floating joystick + 4 buttons).
// Presses are BUFFERED for 0.15s so a dodge pressed a hair early still happens (feels fair).
const BUFFER = 0.15;
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyJ: 'attack', KeyK: 'dodge',
  KeyQ: 'flask', KeyR: 'flask', Escape: 'pause', KeyP: 'pause', Enter: 'confirm', KeyF: 'interact', KeyI: 'inv', Tab: 'inv',
  Digit1: 'c1', Digit2: 'c2', Digit3: 'c3', Digit4: 'c4',
};

export const input = {
  down: {}, buf: {}, move: { x: 0, y: 0 }, mouse: { x: 0, y: 0, moved: 0, inside: false },
  touch: false, stick: null, aimLock: null,
  pressed(a) { if (this.buf[a] > 0) { this.buf[a] = 0; return true; } return false; },
  peek(a) { return this.buf[a] > 0; },
  held(a) { return !!this.down[a]; },
  clear() { this.buf = {}; this.down = {}; },
  update(dt) {
    for (const k in this.buf) this.buf[k] -= dt;
    let x = 0, y = 0;
    if (this.down.left) x -= 1; if (this.down.right) x += 1;
    if (this.down.up) y -= 1; if (this.down.down) y += 1;
    if (this.stick && this.stick.active) { x = this.stick.dx; y = this.stick.dy; }
    const l = Math.hypot(x, y);
    this.move.x = l > 1 ? x / l : x; this.move.y = l > 1 ? y / l : y;
    this.mouse.moved -= dt;
  },
};

function press(a) { input.down[a] = true; input.buf[a] = BUFFER; }
function release(a) { input.down[a] = false; }

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) press(a);
  });
  addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) release(a); });
  addEventListener('blur', () => input.clear());
  canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.moved = 3; input.mouse.inside = true; });
  canvas.addEventListener('mousedown', (e) => {
    if (input.touch) return;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.moved = 3;
    if (e.button === 0) press('attack');
    if (e.button === 2) press('dodge');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) release('attack'); if (e.button === 2) release('dodge'); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- touch ----
  const ui = document.getElementById('touch');
  const stickEl = document.getElementById('stick'), knob = document.getElementById('knob');
  const S = (input.stick = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 });
  const R = 46;
  const enableTouch = () => { if (!input.touch) { input.touch = true; document.body.classList.add('is-touch'); } };
  addEventListener('touchstart', enableTouch, { passive: true, capture: true });
  const zone = document.getElementById('stickzone');
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    S.active = true; S.id = t.identifier; S.ox = t.clientX; S.oy = t.clientY; S.dx = S.dy = 0;
    stickEl.style.transform = `translate(${S.ox - 60}px, ${S.oy - 60}px)`;
    stickEl.classList.add('on'); knob.style.transform = 'translate(0px,0px)';
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== S.id) continue;
      let dx = t.clientX - S.ox, dy = t.clientY - S.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      S.dx = dx / R; S.dy = dy / R;
      const dead = Math.hypot(S.dx, S.dy) < 0.18;
      if (dead) { S.dx = 0; S.dy = 0; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === S.id) { S.active = false; S.dx = S.dy = 0; stickEl.classList.remove('on'); }
  };
  zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  for (const btn of ui.querySelectorAll('[data-act]')) {
    const a = btn.dataset.act;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(a); btn.classList.add('down'); }, { passive: false });
    const up = (e) => { e.preventDefault(); release(a); btn.classList.remove('down'); };
    btn.addEventListener('touchend', up, { passive: false }); btn.addEventListener('touchcancel', up, { passive: false });
  }
}
