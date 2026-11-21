// Procedural WebAudio SFX — zero asset files. Starts on first user gesture.
let ac = null, master = null, noiseBuf = null, drone = null;
export const audio = { muted: false, vol: 0.5 };

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = audio.muted ? 0 : audio.vol;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
}
export function setMuted(m) {
  audio.muted = m;
  if (master) master.gain.value = m ? 0 : audio.vol;
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function tone(type, f0, f1, dur, vol = 0.3, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, fType, f0, f1, q = 1, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = fType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const last = {};
function throttle(k, ms) { const n = performance.now(); if (last[k] && n - last[k] < ms) return true; last[k] = n; return false; }

export const sfx = {
  swing: (heavy) => noise(heavy ? 0.22 : 0.12, heavy ? 0.25 : 0.15, 'bandpass', heavy ? 900 : 2200, heavy ? 300 : 900, 1.5),
  hit: (crit) => { if (throttle('hit', 35)) return; noise(0.08, 0.35, 'lowpass', 3000, 400); tone('square', crit ? 520 : 220, 60, 0.09, crit ? 0.18 : 0.12); },
  block: () => { tone('square', 900, 700, 0.08, 0.12); noise(0.05, 0.2, 'highpass', 4000, 2000); },
  hurt: () => { tone('sawtooth', 180, 50, 0.25, 0.25); noise(0.15, 0.3, 'lowpass', 1200, 200); },
  dodge: () => noise(0.18, 0.12, 'bandpass', 600, 1800, 0.8),
  perfect: () => { tone('sine', 1320, 1320, 0.5, 0.2); tone('sine', 1980, 1980, 0.6, 0.12, 0.03); },
  counter: () => { tone('square', 660, 1320, 0.12, 0.15); tone('sine', 990, 990, 0.35, 0.15, 0.05); },
  shoot: () => { if (throttle('shoot', 40)) return; tone('triangle', 900, 300, 0.08, 0.1); },
  bow: (p) => noise(0.1 + p * 0.1, 0.2, 'bandpass', 1400 + p * 800, 500, 2),
  magic: () => { tone('sine', 600, 1200, 0.12, 0.12); tone('triangle', 300, 900, 0.15, 0.06); },
  enemyShot: () => { if (throttle('es', 60)) return; tone('square', 300, 200, 0.07, 0.05); },
  boom: () => { noise(0.45, 0.45, 'lowpass', 1800, 60); tone('sine', 120, 30, 0.4, 0.35); },
  kill: () => { if (throttle('kill', 50)) return; noise(0.25, 0.2, 'lowpass', 1500, 100); tone('triangle', 300, 80, 0.2, 0.1); },
  ash: () => { if (throttle('ash', 45)) return; tone('sine', 1200 + Math.random() * 400, 1800, 0.07, 0.05); },
  flask: () => { tone('sine', 400, 800, 0.4, 0.12); tone('sine', 600, 1200, 0.5, 0.08, 0.1); },
  telegraph: () => { if (throttle('tel', 90)) return; tone('square', 140, 140, 0.05, 0.035); },
  roar: () => { tone('sawtooth', 90, 40, 1.2, 0.3); noise(1.0, 0.25, 'lowpass', 600, 80); },
  ui: () => tone('square', 660, 880, 0.05, 0.06),
  pick: () => { tone('square', 523, 523, 0.08, 0.08); tone('square', 784, 784, 0.12, 0.08, 0.08); tone('square', 1046, 1046, 0.2, 0.08, 0.16); },
  door: () => { tone('sine', 220, 440, 0.6, 0.12); noise(0.5, 0.1, 'bandpass', 400, 1200); },
  death: () => { tone('sawtooth', 220, 30, 2.0, 0.25); tone('sine', 110, 40, 2.4, 0.3); },
  spike: () => { if (throttle('spk', 80)) return; noise(0.08, 0.15, 'highpass', 3000, 1500); },
  fall: () => tone('sine', 600, 60, 0.6, 0.2),
};

// Low ambient drone per floor — mood without assets.
export function setDrone(freq) {
  if (!ac) return;
  if (drone) { const d = drone; d.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.5); setTimeout(() => d.o.forEach((o) => o.stop()), 2500); drone = null; }
  if (!freq) return;
  const g = ac.createGain(); g.gain.value = 0.0001; g.connect(master);
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.connect(g);
  const o = [freq, freq * 1.498, freq * 0.5].map((fr, i) => {
    const x = ac.createOscillator(); x.type = i === 2 ? 'sine' : 'sawtooth'; x.frequency.value = fr; x.detune.value = (i - 1) * 7;
    x.connect(f); x.start(); return x;
  });
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 180;
  lfo.connect(lg); lg.connect(f.frequency); lfo.start(); o.push(lfo);
  g.gain.setTargetAtTime(0.045, ac.currentTime, 1.5);
  drone = { g, o };
}
