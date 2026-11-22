// Sound, rebuilt: no square/saw "beeps", no background drone.
//  - a plucked LYRE (Karplus–Strong string synthesis, Dorian mode) for rewards, UI and fate moments
//  - soft, low, filtered impacts and air for combat (thumps and whooshes, never tones)
// Everything is quiet by default and passes through a gentle compressor so nothing spikes.
let ac = null, master = null, comp = null, noiseBuf = null;
export const audio = { muted: false, vol: 0.32 };
const NOTES = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33]; // D dorian
const strings = new Map();

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = audio.muted ? 0 : audio.vol;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setMuted(m) { audio.muted = m; if (master) master.gain.value = m ? 0 : audio.vol; }

// Karplus–Strong: a noise burst through a damped delay line = a plucked gut string
function lyreBuffer(freq) {
  const k = Math.round(freq);
  if (strings.has(k)) return strings.get(k);
  const sr = ac.sampleRate, len = Math.floor(sr * 1.6), N = Math.max(2, Math.floor(sr / freq));
  const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0), ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * 0.5;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const nxt = (idx + 1) % N;
    const v = 0.4985 * (ring[idx] + ring[nxt]);
    out[i] = ring[idx]; ring[idx] = v; idx = nxt;
  }
  strings.set(k, buf);
  return buf;
}
function pluck(freq, vol = 0.25, delay = 0, bright = 2400) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = lyreBuffer(freq);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright;
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + 1.6);
}
const note = (i) => NOTES[Math.max(0, Math.min(NOTES.length - 1, i))];

function noise(dur, vol, type, f0, f1, q = 0.8, delay = 0, attack = 0.004) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
// a deep body thump: sine dropping in pitch (felt more than heard)
function thump(f0, f1, dur, vol, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}

const last = {};
const throttle = (k, ms) => { const n = performance.now(); if (last[k] && n - last[k] < ms) return true; last[k] = n; return false; };

export const sfx = {
  swing: (heavy) => noise(heavy ? 0.26 : 0.16, heavy ? 0.16 : 0.09, 'bandpass', heavy ? 700 : 1500, heavy ? 260 : 600, 1.1, 0, 0.03),
  hit: (crit) => { if (throttle('hit', 45)) return; thump(110, 55, 0.12, 0.35); noise(0.07, 0.12, 'lowpass', 1800, 300); if (crit) pluck(note(11), 0.12, 0, 3200); },
  block: () => { if (throttle('block', 60)) return; noise(0.06, 0.12, 'bandpass', 2600, 1800, 3); thump(240, 180, 0.06, 0.1); },
  hurt: () => { thump(90, 40, 0.22, 0.45); noise(0.18, 0.14, 'lowpass', 900, 150); },
  dodge: () => noise(0.2, 0.07, 'bandpass', 500, 1400, 0.7, 0, 0.04),
  perfect: () => { pluck(note(7), 0.22); pluck(note(9), 0.18, 0.05); pluck(note(11), 0.16, 0.1); },
  counter: () => { thump(150, 60, 0.14, 0.35); pluck(note(12), 0.2, 0.02, 3600); },
  shoot: () => { if (throttle('shoot', 50)) return; noise(0.08, 0.06, 'highpass', 2500, 1200); },
  bow: (p) => { noise(0.08 + p * 0.06, 0.08, 'bandpass', 900 + p * 500, 400, 2); if (p >= 1) pluck(note(4), 0.08); },
  magic: () => { if (throttle('mag', 60)) return; pluck(note(9 + ((Math.random() * 3) | 0)), 0.07, 0, 1800); noise(0.14, 0.04, 'bandpass', 1200, 3000, 1.5); },
  enemyShot: () => { if (throttle('es', 90)) return; noise(0.07, 0.035, 'bandpass', 700, 400, 1.2); },
  boom: () => { thump(70, 30, 0.45, 0.5); noise(0.5, 0.22, 'lowpass', 900, 60, 0.7, 0, 0.01); },
  kill: () => { if (throttle('kill', 60)) return; noise(0.22, 0.08, 'lowpass', 1200, 120); },
  ash: () => { if (throttle('ash', 70)) return; pluck(note(10 + ((Math.random() * 5) | 0)), 0.04, 0, 2600); },
  flask: () => { pluck(note(3), 0.14); pluck(note(5), 0.12, 0.12); pluck(note(7), 0.12, 0.24); },
  telegraph: () => {},
  roar: () => { noise(1.1, 0.2, 'lowpass', 300, 90, 0.7, 0, 0.25); thump(60, 35, 0.9, 0.3); },
  ui: () => { if (throttle('ui', 40)) return; pluck(note(7), 0.07, 0, 2200); },
  pick: () => { pluck(note(4), 0.16); pluck(note(7), 0.14, 0.09); pluck(note(11), 0.14, 0.18); },
  door: () => { pluck(note(0), 0.16, 0, 1500); pluck(note(4), 0.12, 0.15, 1500); noise(0.6, 0.05, 'lowpass', 500, 200, 0.7, 0, 0.2); },
  death: () => { [9, 7, 5, 4, 2, 0].forEach((n, i) => pluck(note(n), 0.16, i * 0.32, 1400)); thump(70, 30, 1.2, 0.35); },
  spike: () => { if (throttle('spk', 120)) return; noise(0.06, 0.05, 'highpass', 3000, 1800); },
  fall: () => noise(0.6, 0.12, 'bandpass', 900, 150, 0.8, 0, 0.05),
};

// background drone removed on purpose: the rooms are silent except for what happens in them
export function setDrone() {}
