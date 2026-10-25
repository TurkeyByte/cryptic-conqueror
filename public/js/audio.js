// All sound is synthesized at runtime with WebAudio: no recorded or licensed audio.
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  try { ac().resume(); } catch {}
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
  if (muted) return;
  try {
    const c = ac();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}

function noise(dur, { vol = 0.3, freq = 2000, q = 1, type = 'bandpass', sweep = 0 } = {}) {
  if (muted) return;
  try {
    const c = ac();
    const t = c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  } catch {}
}

// Pentatonic gong figure in the spirit of kulintang (original, synthesized).
function gong(freq, delay, vol = 0.22) {
  tone(freq, 1.2, { type: 'sine', vol, delay });
  tone(freq * 2.76, 0.5, { type: 'sine', vol: vol * 0.3, delay });
}

export const sfx = {
  swing: () => noise(0.12, { vol: 0.18, freq: 1800, sweep: 0.4, q: 0.8 }),
  heavySwing: () => noise(0.25, { vol: 0.22, freq: 900, sweep: 2.5, q: 0.7 }),
  stickHit: () => { tone(1200, 0.06, { type: 'square', vol: 0.12 }); noise(0.08, { vol: 0.35, freq: 3000, q: 2 }); tone(140, 0.15, { type: 'sine', vol: 0.4, slide: 0.5 }); },
  clawHit: () => { noise(0.18, { vol: 0.4, freq: 600, q: 0.6, sweep: 0.3 }); tone(90, 0.2, { type: 'triangle', vol: 0.4, slide: 0.6 }); },
  block: () => { tone(700, 0.05, { type: 'square', vol: 0.1 }); noise(0.05, { vol: 0.25, freq: 5000, q: 3 }); },
  hiss: () => noise(0.4, { vol: 0.2, freq: 4000, q: 0.5, type: 'highpass' }),
  spit: () => { noise(0.2, { vol: 0.2, freq: 500, sweep: 3 }); tone(220, 0.2, { type: 'sawtooth', vol: 0.08, slide: 1.8 }); },
  jump: () => tone(300, 0.1, { type: 'sine', vol: 0.12, slide: 1.6 }),
  dash: () => noise(0.15, { vol: 0.15, freq: 1200, sweep: 0.5 }),
  thud: () => tone(70, 0.3, { type: 'sine', vol: 0.5, slide: 0.5 }),
  adapt: () => { tone(220, 0.5, { type: 'sawtooth', vol: 0.05, slide: 0.5 }); tone(330, 0.6, { type: 'sine', vol: 0.12, slide: 0.7, delay: 0.05 }); },
  roundStart: () => [392, 440, 523, 587, 523].forEach((f, i) => gong(f, i * 0.16)),
  win: () => [523, 587, 659, 784, 880, 1046].forEach((f, i) => gong(f, i * 0.13, 0.18)),
  lose: () => [392, 349, 311, 262].forEach((f, i) => gong(f, i * 0.28, 0.2)),
};
