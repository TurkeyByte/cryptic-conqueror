// All art is drawn procedurally in code (original; no sprite sheets or external images).
import { GROUND } from './fighter.js';

export const W = 960;
export const H = 540;

const D = Math.PI / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const ease = (k) => k * k * (3 - 2 * k);

function lerpPose(a, b, k) {
  const out = {};
  for (const key in a) out[key] = lerp(a[key], b[key] ?? a[key], k);
  return out;
}

// Ease each fighter's drawn pose toward its target so state changes blend
// instead of snapping. Attacks blend faster so strikes stay snappy.
function smoothPose(f, target, time) {
  const dt = f._poseT === undefined ? 1 : Math.max(0, time - f._poseT);
  f._poseT = time;
  if (!f._pose || dt > 0.1) {
    f._pose = { ...target };
    return f._pose;
  }
  const k = 1 - Math.exp(-(f.state === 'attack' ? 45 : 18) * dt);
  for (const key in target) f._pose[key] = lerp(f._pose[key] ?? target[key], target[key], k);
  return f._pose;
}

export const INTENT_COLORS = {
  INSTINCT: '#9fb7a0',
  AGGRESSIVE: '#ff4d4d',
  DEFENSIVE: '#5fa8ff',
  COUNTER: '#ffd23f',
  ZONE: '#7dff9a',
  BAIT: '#ff8bd1',
  PRESSURE: '#ff8a3d',
  RETREAT: '#b9a3ff',
};

// ---------------- Arena ----------------
let bg = null;
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function buildBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(7);

  // Night sky.
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#070514');
  sky.addColorStop(0.55, '#1b1236');
  sky.addColorStop(1, '#3a1f3f');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,240,${0.2 + r() * 0.6})`;
    const s = r() < 0.1 ? 2 : 1;
    g.fillRect(r() * W, r() * 300, s, s);
  }

  // Blood-tinged full moon.
  const mx = 700, my = 110;
  const halo = g.createRadialGradient(mx, my, 30, mx, my, 190);
  halo.addColorStop(0, 'rgba(255,200,170,0.35)');
  halo.addColorStop(1, 'rgba(255,200,170,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f6dcc0';
  g.beginPath(); g.arc(mx, my, 56, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(200,150,130,0.35)';
  [[-18, -12, 12], [14, 8, 9], [-6, 20, 7], [20, -20, 6]].forEach(([dx, dy, rr]) => { g.beginPath(); g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); g.fill(); });

  // Distant mountains.
  g.fillStyle = '#1a1030';
  g.beginPath(); g.moveTo(0, 330);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, 300 - Math.sin(x * 0.008) * 50 - Math.sin(x * 0.021) * 22);
  g.lineTo(W, GROUND); g.lineTo(0, GROUND); g.fill();
  g.fillStyle = '#140b24';
  g.beginPath(); g.moveTo(0, 380);
  for (let x = 0; x <= W; x += 30) g.lineTo(x, 360 - Math.sin(x * 0.013 + 1) * 30 - Math.sin(x * 0.04) * 8);
  g.lineTo(W, GROUND); g.lineTo(0, GROUND); g.fill();

  // Coconut palms.
  const palm = (x, h, lean) => {
    g.strokeStyle = '#0c0716'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, GROUND);
    g.quadraticCurveTo(x + lean * 0.5, GROUND - h * 0.6, x + lean, GROUND - h); g.stroke();
    g.fillStyle = '#0c0716';
    for (let i = 0; i < 7; i++) {
      const a = (-160 + i * 40) * D;
      g.beginPath();
      g.moveTo(x + lean, GROUND - h);
      g.quadraticCurveTo(x + lean + Math.cos(a) * 50, GROUND - h + Math.sin(a) * 30 - 20, x + lean + Math.cos(a) * 85, GROUND - h + Math.sin(a) * 40 + 25);
      g.quadraticCurveTo(x + lean + Math.cos(a) * 45, GROUND - h + Math.sin(a) * 25 - 5, x + lean, GROUND - h);
      g.fill();
    }
  };
  palm(90, 300, 30);
  palm(860, 270, -40);
  palm(560, 230, 20);

  // Bahay kubo (nipa hut) on stilts.
  const hx = 190, hy = GROUND - 70;
  g.fillStyle = '#120a1c';
  for (const sx of [0, 50, 110, 160]) g.fillRect(hx + sx, hy, 8, 70);
  g.fillStyle = '#1d1226';
  g.fillRect(hx - 10, hy - 70, 190, 72);
  g.fillStyle = '#100818';
  g.beginPath(); g.moveTo(hx - 40, hy - 64); g.lineTo(hx + 85, hy - 150); g.lineTo(hx + 210, hy - 64); g.fill();
  g.strokeStyle = 'rgba(80,50,60,0.6)'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(hx - 30 + i * 20, hy - 66); g.lineTo(hx + 85, hy - 148); g.stroke(); }
  // Window glow (lantern inside).
  const wg = g.createRadialGradient(hx + 120, hy - 35, 2, hx + 120, hy - 35, 60);
  wg.addColorStop(0, 'rgba(255,170,80,0.5)'); wg.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = wg; g.fillRect(hx + 40, hy - 100, 160, 120);
  g.fillStyle = '#ffb35a'; g.fillRect(hx + 104, hy - 52, 32, 30);
  g.strokeStyle = '#2a1520'; g.lineWidth = 3;
  g.strokeRect(hx + 104, hy - 52, 32, 30);
  g.beginPath(); g.moveTo(hx + 120, hy - 52); g.lineTo(hx + 120, hy - 22); g.stroke();
  // Ladder.
  g.strokeStyle = '#150c1e'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(hx + 20, hy + 2); g.lineTo(hx + 5, GROUND); g.moveTo(hx + 40, hy + 2); g.lineTo(hx + 25, GROUND); g.stroke();

  // Bamboo grove, right side.
  for (let i = 0; i < 14; i++) {
    const x = 640 + i * 22 + r() * 10, top = 140 + r() * 120;
    g.strokeStyle = i % 2 ? '#0f1a14' : '#132219'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + (r() - 0.5) * 30, top); g.stroke();
    g.strokeStyle = '#08100b'; g.lineWidth = 2;
    for (let y = GROUND - 40; y > top; y -= 38) { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke(); }
  }

  // Ground: packed earth with a lantern-lit pool.
  const gr = g.createLinearGradient(0, GROUND, 0, H);
  gr.addColorStop(0, '#2b1a22'); gr.addColorStop(1, '#120a10');
  g.fillStyle = gr; g.fillRect(0, GROUND, W, H - GROUND);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 60; i++) g.fillRect(r() * W, GROUND + 6 + r() * 60, 2 + r() * 10, 1);
  g.strokeStyle = '#3d2630'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, GROUND); g.lineTo(W, GROUND); g.stroke();
  // Grass tufts.
  g.strokeStyle = '#0d1a10'; g.lineWidth = 1.5;
  for (let i = 0; i < 80; i++) {
    const x = r() * W;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x, GROUND + 1); g.lineTo(x + k * 3, GROUND - 6 - r() * 6); g.stroke(); }
  }
  return c;
}

function drawFireflies(g, time) {
  for (let i = 0; i < 18; i++) {
    const x = (i * 131 + Math.sin(time * 0.5 + i) * 40 + time * (8 + i % 4)) % W;
    const y = 250 + ((i * 47) % 200) + Math.sin(time * 1.3 + i * 2) * 15;
    const a = 0.35 + 0.35 * Math.sin(time * 3 + i * 1.7);
    g.fillStyle = `rgba(220,255,140,${a})`;
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  // Swaying capiz lantern hanging from the hut.
  const lx = 395, ly = 300 + Math.sin(time * 1.2) * 2;
  g.strokeStyle = '#2a1a22'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(375, 255); g.lineTo(lx, ly - 12); g.stroke();
  const flick = 0.75 + Math.sin(time * 13) * 0.05 + Math.sin(time * 7) * 0.05;
  const lg = g.createRadialGradient(lx, ly, 2, lx, ly, 120);
  lg.addColorStop(0, `rgba(255,190,110,${0.35 * flick})`); lg.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = lg; g.fillRect(lx - 120, ly - 120, 240, 240);
  g.fillStyle = `rgba(255,220,160,${flick})`;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    g.lineTo(lx + Math.cos(a) * 12, ly + Math.sin(a) * 12);
    g.lineTo(lx + Math.cos(a2) * 5, ly + Math.sin(a2) * 5);
  }
  g.closePath(); g.fill();
}

export function drawArena(g, time) {
  if (!bg) bg = buildBackground();
  g.drawImage(bg, 0, 0);
  drawFireflies(g, time);
}

// Low drifting ground fog, drawn in front of the fighters' feet.
let fogSprite = null;
export function drawFog(g, time) {
  if (!fogSprite) {
    fogSprite = document.createElement('canvas');
    fogSprite.width = 256; fogSprite.height = 64;
    const fg = fogSprite.getContext('2d');
    const gr = fg.createRadialGradient(128, 32, 4, 128, 32, 128);
    gr.addColorStop(0, 'rgba(190,170,215,0.55)');
    gr.addColorStop(1, 'rgba(190,170,215,0)');
    fg.fillStyle = gr;
    fg.setTransform(1, 0, 0, 0.25, 0, 24);
    fg.fillRect(0, 0, 256, 256);
  }
  g.save();
  for (let i = 0; i < 7; i++) {
    const speed = 10 + (i % 3) * 6;
    const x = ((i * 173 + time * speed) % (W + 400)) - 200;
    g.globalAlpha = 0.18 + 0.08 * Math.sin(time * 0.7 + i);
    g.drawImage(fogSprite, x - 160, GROUND - 34 + (i % 2) * 14, 420, 70);
  }
  g.restore();
}

// Pre-rendered at low resolution; it is a smooth gradient, so upscaling is invisible.
let vignette = null;
export function drawVignette(g) {
  if (!vignette) {
    vignette = document.createElement('canvas');
    vignette.width = W / 4; vignette.height = H / 4;
    const vg = vignette.getContext('2d');
    vg.scale(0.25, 0.25);
    const gr = vg.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.68);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, W, H);
  }
  g.drawImage(vignette, 0, 0, W, H);
}

// ---------------- Skeleton helpers ----------------
function limb(g, x, y, a1, l1, a2, l2, w1, w2, color) {
  const ex = x + Math.cos(a1) * l1, ey = y + Math.sin(a1) * l1;
  const hx = ex + Math.cos(a2) * l2, hy = ey + Math.sin(a2) * l2;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = w1;
  g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
  g.lineWidth = w2;
  g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
  return [hx, hy, ex, ey];
}

// Hip-relative foot positions so the lowest foot sits on the ground.
function footDrop(p, thigh, shin) {
  const f = (a1, a2) => Math.sin(a1 * D) * thigh + Math.sin(a2 * D) * shin;
  return Math.max(f(p.lB1, p.lB2), f(p.lF1, p.lF2));
}

function progress(f) {
  const m = f.move;
  if (!m) return { ph: '', k: 0 };
  if (f.t < m.startup) return { ph: 'startup', k: f.t / m.startup };
  if (f.t < m.startup + m.active) return { ph: 'active', k: (f.t - m.startup) / m.active };
  return { ph: 'recovery', k: clamp01((f.t - m.startup - m.active) / m.recovery) };
}

// ---------------- Player: Dakila, a modern Filipino Kali fighter ----------------
// Angles in degrees, absolute, facing right: 0 = forward, 90 = down, -90 = up.
const P = {
  idle:   { lean: 6, bob: 0, aF1: 40, aF2: -40, sF: -70, aB1: 120, aB2: 60, sB: -125, lF1: 65, lF2: 100, lB1: 118, lB2: 92, rot: 0 },
  guard:  { lean: -4, bob: 4, aF1: 10, aF2: -80, sF: -95, aB1: 50, aB2: -70, sB: -60, lF1: 62, lF2: 105, lB1: 120, lB2: 98, rot: 0 },
  jump:   { lean: 10, bob: 0, aF1: -30, aF2: -80, sF: -110, aB1: 150, aB2: 100, sB: -150, lF1: 20, lF2: 110, lB1: 70, lB2: 150, rot: 0 },
  hurt:   { lean: -25, bob: 0, aF1: 140, aF2: 170, sF: 160, aB1: 200, aB2: 230, sB: 200, lF1: 60, lF2: 90, lB1: 110, lB2: 95, rot: 0 },
  down:   { lean: -20, bob: 0, aF1: 160, aF2: 180, sF: 190, aB1: 120, aB2: 140, sB: 150, lF1: 80, lF2: 90, lB1: 100, lB2: 95, rot: -84 },
  dash:   { lean: 28, bob: 6, aF1: 70, aF2: 40, sF: -10, aB1: 150, aB2: 120, sB: -170, lF1: 35, lF2: 95, lB1: 150, lB2: 120, rot: 0 },
  win:    { lean: -4, bob: 0, aF1: -60, aF2: -95, sF: -60, aB1: -120, aB2: -85, sB: -120, lF1: 75, lF2: 95, lB1: 108, lB2: 90, rot: 0 },
  witikA: { lean: 4, bob: 0, aF1: -60, aF2: -130, sF: -160, aB1: 120, aB2: 70, sB: -110, lF1: 60, lF2: 100, lB1: 120, lB2: 92, rot: 0 },
  witikB: { lean: 16, bob: 2, aF1: 10, aF2: 15, sF: 40, aB1: 130, aB2: 80, sB: -120, lF1: 52, lF2: 100, lB1: 125, lB2: 95, rot: 0 },
  redA:   { lean: -6, bob: 2, aF1: 170, aF2: 200, sF: -170, aB1: 150, aB2: 190, sB: -150, lF1: 62, lF2: 100, lB1: 122, lB2: 95, rot: 0 },
  redB:   { lean: 18, bob: 4, aF1: 20, aF2: 10, sF: 60, aB1: 40, aB2: 30, sB: 110, lF1: 48, lF2: 100, lB1: 130, lB2: 95, rot: 0 },
  sunA:   { lean: 0, bob: 4, aF1: 120, aF2: 10, sF: 0, aB1: 170, aB2: 120, sB: -150, lF1: 62, lF2: 100, lB1: 118, lB2: 92, rot: 0 },
  sunB:   { lean: 30, bob: 12, aF1: 5, aF2: 0, sF: 0, aB1: 170, aB2: 160, sB: 170, lF1: 30, lF2: 100, lB1: 150, lB2: 140, rot: 0 },
  airA:   { lean: 0, bob: 0, aF1: -80, aF2: -120, sF: -160, aB1: 150, aB2: 110, sB: -140, lF1: 20, lF2: 110, lB1: 70, lB2: 150, rot: 0 },
  airB:   { lean: 22, bob: 0, aF1: 40, aF2: 70, sF: 80, aB1: 160, aB2: 120, sB: -160, lF1: 20, lF2: 100, lB1: 60, lB2: 140, rot: 0 },
};

function playerPose(f) {
  const s = f.state;
  if (s === 'attack') {
    const { ph, k } = progress(f);
    const pairs = { witik: ['witikA', 'witikB'], redonda: ['redA', 'redB'], sungkite: ['sunA', 'sunB'], lusob: ['airA', 'airB'] }[f.moveName];
    const [A, B] = pairs.map((n) => P[n]);
    if (ph === 'startup') return lerpPose(P[f.airborne ? 'jump' : 'idle'], A, ease(k));
    if (ph === 'active') return lerpPose(A, B, ease(Math.min(1, k * (f.moveName === 'lusob' ? 4 : 1.6))));
    return lerpPose(B, P.idle, ease(k));
  }
  if (s === 'walk') {
    const c = Math.sin(f.anim * 12) * f.walkDir * f.facing;
    return { ...P.idle, lF1: 65 + c * 25, lB1: 118 - c * 25, lF2: 100 + Math.max(0, c) * 20, lB2: 92 + Math.max(0, -c) * 20, bob: Math.abs(c) * -3 };
  }
  if (s === 'jump' || s === 'leap') return P.jump;
  if (s === 'guard' || s === 'blockstun') return P.guard;
  if (s === 'hurt') return f.knockdown && f.airborne ? lerpPose(P.hurt, P.down, clamp01(f.t * 3)) : P.hurt;
  if (s === 'down' || s === 'ko') return P.down;
  if (s === 'getup') return lerpPose(P.down, P.idle, ease(clamp01(f.t / 0.32)));
  if (s === 'dash') return P.dash;
  if (s === 'win') return lerpPose(P.idle, P.win, ease(clamp01(f.t * 3)));
  if (s === 'land') return lerpPose({ ...P.idle, bob: 10 }, P.idle, f.t / 0.12);
  // Idle: breathing and a slow kali "weave" of the sticks.
  const b = Math.sin(f.anim * 3);
  return { ...P.idle, bob: b * 1.5, sF: P.idle.sF + b * 12, sB: P.idle.sB - b * 10, aF2: P.idle.aF2 + b * 6 };
}

function stick(g, x, y, ang, len) {
  const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
  g.lineCap = 'round';
  g.strokeStyle = '#3b2412'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(x - Math.cos(ang) * 8, y - Math.sin(ang) * 8); g.lineTo(ex, ey); g.stroke();
  g.strokeStyle = '#d9b26a'; g.lineWidth = 4.5;
  g.beginPath(); g.moveTo(x - Math.cos(ang) * 7, y - Math.sin(ang) * 7); g.lineTo(ex, ey); g.stroke();
  // Rattan node rings.
  g.strokeStyle = '#7a5428'; g.lineWidth = 5;
  for (const t of [0.35, 0.7]) {
    const nx = x + Math.cos(ang) * len * t, ny = y + Math.sin(ang) * len * t;
    g.beginPath(); g.moveTo(nx - Math.cos(ang) * 1, ny - Math.sin(ang) * 1); g.lineTo(nx + Math.cos(ang) * 1, ny + Math.sin(ang) * 1); g.stroke();
  }
  return [ex, ey];
}

function sneaker(g, x, y) {
  g.fillStyle = '#e9e6df';
  g.beginPath(); g.roundRect(x - 6, y - 5, 18, 8, 3); g.fill();
  g.fillStyle = '#b3202a';
  g.fillRect(x - 6, y + 1, 18, 2);
}

// Dakila: a modern Filipino Kali fighter. Hoodie, jeans and sneakers, with his
// heritage in the red putong (headband) and a woven bracelet.
export function drawPlayer(g, f, time) {
  const p = smoothPose(f, playerPose(f), time);
  const THIGH = 34, SHIN = 34, TORSO = 52, UA = 25, FA = 23, STICK = 64;
  const SKIN = '#9a6038', HAIR = '#120c0a';
  const HOOD = '#30364a', HOOD_D = '#242939', JEANS = '#3d5f8f', JEANS_D = '#2e4a72', RED = '#c4242f';
  g.save();
  g.translate(f.x, f.y);
  g.scale(f.facing, 1);
  g.rotate(p.rot * D);
  const hipY = -footDrop(p, THIGH, SHIN) + p.bob;
  const lean = p.lean * D;
  const nx = Math.sin(lean) * TORSO, ny = hipY - Math.cos(lean) * TORSO;
  const sx = nx - Math.sin(lean) * 6, sy = ny + Math.cos(lean) * 6;
  const hdx = nx + Math.sin(lean) * 12, hdy = ny - Math.cos(lean) * 12;

  // Back limbs.
  const [blx, bly] = limb(g, -3, hipY, p.lB1 * D, THIGH, p.lB2 * D, SHIN, 15, 12, JEANS_D);
  sneaker(g, blx, bly);
  const [bhx, bhy] = limb(g, sx - 4, sy, p.aB1 * D, UA, p.aB2 * D, FA, 12, 10, HOOD_D);
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(bhx, bhy, 4.5, 0, Math.PI * 2); g.fill();
  const bTip = stick(g, bhx, bhy, p.sB * D, STICK);

  // Hood bunched behind the neck.
  g.fillStyle = HOOD_D;
  g.beginPath(); g.ellipse(nx - 9, ny + 2, 11, 8, -0.4, 0, Math.PI * 2); g.fill();

  // Hoodie body with pocket and drawstrings.
  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  g.fillStyle = HOOD;
  g.beginPath();
  g.moveTo(-15, 4); g.lineTo(15, 4); g.lineTo(17, -TORSO + 10); g.quadraticCurveTo(0, -TORSO - 5, -17, -TORSO + 10); g.closePath();
  g.fill();
  g.fillStyle = HOOD_D;
  g.fillRect(-15, -1, 30, 5);
  g.strokeStyle = HOOD_D; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-9, -6); g.lineTo(-7, -20); g.lineTo(9, -20); g.lineTo(11, -6); g.stroke();
  g.strokeStyle = '#d8d2c6'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(-3, -TORSO + 6); g.lineTo(-4, -TORSO + 18); g.moveTo(4, -TORSO + 6); g.lineTo(5, -TORSO + 18); g.stroke();
  g.restore();

  // Front leg.
  const [flx, fly] = limb(g, 3, hipY, p.lF1 * D, THIGH, p.lF2 * D, SHIN, 15, 12, JEANS);
  sneaker(g, flx, fly);

  // Head: short modern cut, red putong with a trailing tail.
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(hdx, hdy, 12, 0, Math.PI * 2); g.fill();
  g.fillStyle = HAIR;
  g.beginPath(); g.arc(hdx - 1, hdy - 4, 12.5, Math.PI, Math.PI * 1.9); g.fill();
  g.fillRect(hdx - 11, hdy - 8, 6, 6);
  g.fillStyle = RED;
  g.fillRect(hdx - 12, hdy - 7, 24, 5);
  g.strokeStyle = RED; g.lineWidth = 3;
  const tw = Math.sin(time * 8) * 4 - (f.state === 'dash' ? 8 : 0);
  g.beginPath(); g.moveTo(hdx - 11, hdy - 5); g.quadraticCurveTo(hdx - 22, hdy - 4 + tw, hdx - 30, hdy + 4 - tw); g.stroke();
  g.fillStyle = '#fff';
  g.fillRect(hdx + 5, hdy - 1, 3, 2);
  g.strokeStyle = HAIR; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(hdx + 3, hdy - 4); g.lineTo(hdx + 9, hdy - 3.5); g.stroke();

  // Front arm, woven bracelet, stick.
  const [fhx, fhy, fex, fey] = limb(g, sx + 3, sy, p.aF1 * D, UA, p.aF2 * D, FA, 12, 10, HOOD);
  g.fillStyle = SKIN;
  g.beginPath(); g.arc(fhx, fhy, 4.5, 0, Math.PI * 2); g.fill();
  const dx = (fhx - fex) * 0.06, dy = (fhy - fey) * 0.06;
  const bx = fex + (fhx - fex) * 0.8, by = fey + (fhy - fey) * 0.8;
  g.lineCap = 'butt';
  g.strokeStyle = '#e0b040'; g.lineWidth = 11;
  g.beginPath(); g.moveTo(bx - dx, by - dy); g.lineTo(bx + dx, by + dy); g.stroke();
  g.strokeStyle = RED; g.setLineDash([2, 2]);
  g.beginPath(); g.moveTo(bx - dx, by - dy); g.lineTo(bx + dx, by + dy); g.stroke();
  g.setLineDash([]);
  g.lineCap = 'round';
  const fTip = stick(g, fhx, fhy, p.sF * D, STICK);
  g.restore();

  // Stick motion trails while attacking (world space).
  const toWorld = ([x, y]) => {
    const c = Math.cos(p.rot * D), s = Math.sin(p.rot * D);
    return [f.x + f.facing * (x * c - y * s), f.y + (x * s + y * c)];
  };
  if (f.state === 'attack' && f.phase !== 'recovery') f.trail.push([...toWorld(fTip), ...toWorld(bTip), time]);
  f.trail = f.trail.filter((t) => time - t[4] < 0.12);
  if (f.trail.length > 1) {
    g.strokeStyle = 'rgba(255,230,170,0.5)';
    g.lineWidth = 3;
    g.beginPath();
    f.trail.forEach((t, i) => (i ? g.lineTo(t[0], t[1]) : g.moveTo(t[0], t[1])));
    g.stroke();
  }
}

// ---------------- The Aswang ----------------
const A = {
  idle:   { lean: 34, bob: 0, aF1: 75, aF2: 105, aB1: 105, aB2: 115, lF1: 55, lF2: 115, lB1: 125, lB2: 80, head: 20, rot: 0 },
  guard:  { lean: 10, bob: 8, aF1: -10, aF2: -110, aB1: 20, aB2: -100, lF1: 60, lF2: 110, lB1: 125, lB2: 85, head: 25, rot: 0 },
  clawA:  { lean: 20, bob: 0, aF1: -110, aF2: -70, aB1: 120, aB2: 100, lF1: 55, lF2: 110, lB1: 128, lB2: 80, head: 0, rot: 0 },
  clawB:  { lean: 50, bob: 6, aF1: 40, aF2: 80, aB1: 140, aB2: 120, lF1: 40, lF2: 110, lB1: 140, lB2: 90, head: 30, rot: 0 },
  pouA:   { lean: 65, bob: 22, aF1: 110, aF2: 70, aB1: 120, aB2: 80, lF1: 30, lF2: 140, lB1: 120, lB2: 60, head: 0, rot: 0 },
  pouB:   { lean: 80, bob: 10, aF1: 0, aF2: 10, aB1: 10, aB2: 20, lF1: 150, lF2: 170, lB1: 165, lB2: 185, head: -20, rot: 0 },
  risA:   { lean: 40, bob: 24, aF1: 120, aF2: 80, aB1: 130, aB2: 90, lF1: 40, lF2: 130, lB1: 120, lB2: 60, head: 20, rot: 0 },
  risB:   { lean: -10, bob: 0, aF1: -85, aF2: -95, aB1: 140, aB2: 120, lF1: 80, lF2: 95, lB1: 110, lB2: 90, head: -30, rot: 0 },
  spitA:  { lean: 10, bob: 0, aF1: 140, aF2: 120, aB1: 150, aB2: 130, lF1: 55, lF2: 110, lB1: 125, lB2: 85, head: -25, rot: 0 },
  spitB:  { lean: 40, bob: 4, aF1: 130, aF2: 110, aB1: 150, aB2: 130, lF1: 50, lF2: 110, lB1: 128, lB2: 85, head: 25, rot: 0 },
  grabA:  { lean: 40, bob: 6, aF1: 10, aF2: -10, aB1: 0, aB2: 10, lF1: 50, lF2: 110, lB1: 130, lB2: 85, head: 10, rot: 0 },
  grabB:  { lean: 50, bob: 6, aF1: 0, aF2: 60, aB1: -10, aB2: 70, lF1: 45, lF2: 110, lB1: 135, lB2: 85, head: 20, rot: 0 },
  hurt:   { lean: -10, bob: 0, aF1: 160, aF2: 200, aB1: 200, aB2: 240, lF1: 60, lF2: 95, lB1: 115, lB2: 90, head: -40, rot: 0 },
  down:   { lean: -20, bob: 0, aF1: 170, aF2: 180, aB1: 120, aB2: 150, lF1: 80, lF2: 90, lB1: 100, lB2: 95, head: -20, rot: -84 },
  jump:   { lean: 40, bob: 0, aF1: 60, aF2: 120, aB1: 90, aB2: 140, lF1: 10, lF2: 120, lB1: 60, lB2: 150, head: 10, rot: 0 },
  win:    { lean: -15, bob: 0, aF1: -110, aF2: -80, aB1: -70, aB2: -100, lF1: 70, lF2: 100, lB1: 115, lB2: 85, head: -40, rot: 0 },
};

function aswangPose(f) {
  const s = f.state;
  if (s === 'attack') {
    const { ph, k } = progress(f);
    const [a, b] = { claw: ['clawA', 'clawB'], pounce: ['pouA', 'pouB'], rising: ['risA', 'risB'], spit: ['spitA', 'spitB'], grab: ['grabA', 'grabB'] }[f.moveName].map((n) => A[n]);
    if (ph === 'startup') return lerpPose(A.idle, a, ease(k));
    if (ph === 'active') return lerpPose(a, b, ease(Math.min(1, k * 2)));
    return lerpPose(b, A.idle, ease(k));
  }
  if (s === 'walk') {
    const c = Math.sin(f.anim * 9);
    return { ...A.idle, lF1: 55 + c * 22, lB1: 125 - c * 22, aF1: 75 - c * 15, aB1: 105 + c * 15, bob: Math.abs(c) * -4 };
  }
  if (s === 'guard' || s === 'blockstun') return A.guard;
  if (s === 'jump' || s === 'leap') return A.jump;
  if (s === 'hurt') return f.knockdown && f.airborne ? lerpPose(A.hurt, A.down, clamp01(f.t * 3)) : A.hurt;
  if (s === 'down' || s === 'ko') return A.down;
  if (s === 'getup') return lerpPose(A.down, A.idle, ease(clamp01(f.t / 0.32)));
  if (s === 'win') return lerpPose(A.idle, A.win, ease(clamp01(f.t * 3)));
  if (s === 'land') return { ...A.idle, bob: 10 };
  const b = Math.sin(f.anim * 2.4);
  return { ...A.idle, bob: b * 3, aF2: A.idle.aF2 + b * 10, aB2: A.idle.aB2 - b * 8, head: A.idle.head + b * 5 };
}

function clawHand(g, x, y, ang, color = '#ece4d2') {
  g.strokeStyle = color; g.lineWidth = 2.4; g.lineCap = 'round';
  for (const off of [-0.5, -0.15, 0.2, 0.55]) {
    const a = ang + off;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * 13, y + Math.sin(a) * 13, x + Math.cos(a + 0.45) * 25, y + Math.sin(a + 0.45) * 25);
    g.stroke();
  }
}

// A limb with knobbly, bony joints.
function boneLimb(g, x, y, a1, l1, a2, l2, w1, w2, color, knob) {
  const r = limb(g, x, y, a1, l1, a2, l2, w1, w2, color);
  g.fillStyle = knob;
  g.beginPath(); g.arc(r[2], r[3], w1 * 0.62, 0, Math.PI * 2); g.fill();
  return r;
}

function clawFoot(g, x, y) {
  g.strokeStyle = '#d9d0bd'; g.lineWidth = 2; g.lineCap = 'round';
  for (const dx of [4, 9, 14]) {
    g.beginPath(); g.moveTo(x + dx - 6, y - 2); g.quadraticCurveTo(x + dx + 2, y - 3, x + dx + 4, y + 1); g.stroke();
  }
}

export function drawAswang(g, f, time, eyeColor, aura = 0) {
  const p = smoothPose(f, aswangPose(f), time);
  const THIGH = 38, SHIN = 40, TORSO = 56, UA = 36, FA = 34;
  const SKIN = '#7f8c79', SKIN_D = '#59654f', KNOB = '#97a38f', ROBE = '#221830', ROBE_D = '#0f0a16';

  // Aura that flares in the intent color when Nemotron hands it a new plan.
  if (aura > 0) {
    const pulse = 0.75 + 0.25 * Math.sin(time * 14);
    const r = 130 + (1 - Math.min(1, aura)) * 50;
    const ag = g.createRadialGradient(f.x, f.y - 80, 10, f.x, f.y - 80, r);
    ag.addColorStop(0, hexA(eyeColor, 0.6 * Math.min(1, aura) * pulse));
    ag.addColorStop(0.55, hexA(eyeColor, 0.22 * Math.min(1, aura) * pulse));
    ag.addColorStop(1, hexA(eyeColor, 0));
    g.fillStyle = ag;
    g.fillRect(f.x - r, f.y - 80 - r, r * 2, r * 2);
  }
  // Creeping shadow-smoke at its feet.
  for (let i = 0; i < 4; i++) {
    const sx0 = f.x + Math.sin(time * 1.3 + i * 1.7) * 26 - 30 + i * 18;
    g.drawImage(smokeSprite(), sx0 - 30, f.y - 34, 60, 60);
  }

  g.save();
  g.translate(f.x, f.y);
  g.scale(f.facing, 1);
  g.rotate(p.rot * D);
  const hipY = -footDrop(p, THIGH, SHIN) + p.bob;
  const lean = p.lean * D;
  const nx = Math.sin(lean) * TORSO, ny = hipY - Math.cos(lean) * TORSO;
  const sx = nx - Math.sin(lean) * 8, sy = ny + Math.cos(lean) * 8;
  const headA = lean + p.head * D;
  const hdx = nx + Math.sin(headA) * 13, hdy = ny - Math.cos(headA) * 13;
  const drag = Math.min(70, Math.abs(f.vx) * 0.08);

  // Mane: a dark mass of hair streaming behind, then loose strands.
  g.fillStyle = '#040208';
  g.beginPath();
  g.moveTo(hdx + 4, hdy - 14);
  g.bezierCurveTo(hdx - 30, hdy - 20, hdx - 50 - drag, hdy + 30, hdx - 46 - drag + Math.sin(time * 2) * 8, hdy + 95);
  g.bezierCurveTo(hdx - 30, hdy + 70, hdx - 16, hdy + 30, hdx - 4, hdy + 8);
  g.closePath();
  g.fill();
  g.strokeStyle = '#05030a'; g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const sway = Math.sin(time * 2.2 + i * 0.6) * 12 - drag;
    g.lineWidth = 3.6 - i * 0.18;
    g.beginPath();
    g.moveTo(hdx - 2, hdy - 10 + i * 0.8);
    g.bezierCurveTo(hdx - 28, hdy + 6 + i * 3, hdx - 42 + sway, hdy + 46 + i * 4, hdx - 54 + sway * 1.4 + (i % 3) * 6, hdy + 84 + i * 5);
    g.stroke();
  }

  const [blx, bly] = boneLimb(g, -3, hipY, p.lB1 * D, THIGH, p.lB2 * D, SHIN, 10, 7, SKIN_D, SKIN_D);
  clawFoot(g, blx, bly);
  const [bhx, bhy] = boneLimb(g, sx - 4, sy, p.aB1 * D, UA, p.aB2 * D, FA, 7, 5, SKIN_D, SKIN_D);
  clawHand(g, bhx, bhy, p.aB2 * D, '#c9c0ad');

  // Torso in a tattered robe, with ribs showing through a torn chest.
  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  const rg = g.createLinearGradient(0, -TORSO, 0, 10);
  rg.addColorStop(0, ROBE); rg.addColorStop(1, ROBE_D);
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(-14, 8); g.lineTo(14, 8); g.lineTo(13, -TORSO + 8); g.quadraticCurveTo(0, -TORSO - 6, -15, -TORSO + 8); g.closePath();
  g.fill();
  g.fillStyle = ROBE_D;
  for (let i = 0; i < 7; i++) {
    const x = -15 + i * 4.6, j = Math.sin(time * 3 + i * 1.3) * 4 + drag * 0.1;
    g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 2.3 - j * 0.3, 24 + j + (i % 3) * 7); g.lineTo(x + 4.6, 6); g.fill();
  }
  g.fillStyle = SKIN_D;
  g.beginPath(); g.ellipse(2, -TORSO + 26, 8, 13, 0.1, 0, Math.PI * 2); g.fill();
  g.strokeStyle = KNOB; g.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-5, -TORSO + 17 + i * 6); g.quadraticCurveTo(2, -TORSO + 21 + i * 6, 9, -TORSO + 17 + i * 6); g.stroke(); }
  g.restore();

  const [flx, fly] = boneLimb(g, 3, hipY, p.lF1 * D, THIGH, p.lF2 * D, SHIN, 10, 7, SKIN, KNOB);
  clawFoot(g, flx, fly);

  // Head: long gaunt skull, sunken sockets, glowing eyes in the intent color.
  const attacking = f.state === 'attack' && f.phase !== 'recovery';
  g.save();
  g.translate(hdx, hdy);
  g.rotate(headA * 0.5);
  g.fillStyle = SKIN;
  g.beginPath(); g.ellipse(1, 1, 11, 15, 0.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = SKIN_D;
  g.beginPath(); g.ellipse(2, 6, 6, 4, 0, 0, Math.PI * 2); g.fill();             // hollow cheek
  g.fillStyle = '#05030a';
  g.beginPath(); g.ellipse(-3, -7, 13, 10, -0.3, Math.PI, Math.PI * 2.1); g.fill(); // hairline
  g.fillStyle = '#1a1420';
  g.beginPath(); g.ellipse(6, -1.5, 4.6, 3.4, -0.2, 0, Math.PI * 2); g.fill();    // sockets
  g.beginPath(); g.ellipse(-1, -1.5, 3.6, 2.8, -0.2, 0, Math.PI * 2); g.fill();
  const flicker = 0.8 + 0.2 * Math.sin(time * 9) * Math.sin(time * 3.1);
  g.shadowColor = eyeColor; g.shadowBlur = 18 + aura * 10;
  g.globalAlpha = flicker;
  g.fillStyle = eyeColor;
  g.beginPath(); g.ellipse(6, -1.5, 3, 1.8, -0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(-1, -1.5, 2.2, 1.4, -0.2, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  g.strokeStyle = '#2a2230'; g.lineWidth = 2;                                      // brow ridge
  g.beginPath(); g.moveTo(-4, -5.5); g.lineTo(10, -4.5); g.stroke();
  // Jaw drops open while attacking; four fangs.
  const jaw = attacking ? 5 : 1.5;
  g.fillStyle = '#1a0606';
  g.beginPath(); g.moveTo(0, 8); g.lineTo(12, 7); g.lineTo(11, 8 + jaw); g.lineTo(1, 9 + jaw * 0.6); g.closePath(); g.fill();
  g.fillStyle = '#efe6d6';
  for (const fx of [2, 5, 8, 10.5]) {
    g.beginPath(); g.moveTo(fx, 7.6); g.lineTo(fx + 1, 11 + (fx === 5 || fx === 10.5 ? 2 : 0)); g.lineTo(fx + 2, 7.4); g.fill();
  }
  // The aswang's long tongue lashes out when spitting.
  if (f.state === 'attack' && f.moveName === 'spit') {
    const { ph, k } = progress(f);
    const len = ph === 'startup' ? k * 10 : ph === 'active' ? 34 : 34 * (1 - k);
    g.strokeStyle = '#8a2a4a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(9, 9); g.quadraticCurveTo(9 + len * 0.5, 14 + Math.sin(time * 30) * 3, 9 + len, 11); g.stroke();
  }
  g.restore();

  const [fhx, fhy] = boneLimb(g, sx + 3, sy, p.aF1 * D, UA, p.aF2 * D, FA, 7, 5, SKIN, KNOB);
  clawHand(g, fhx, fhy, p.aF2 * D);
  g.restore();

  // Claw slash arcs while the attack is active, tinted by the current intent.
  if (f.state === 'attack' && f.phase === 'active' && f.moveName !== 'spit') {
    const { k } = progress(f);
    g.save();
    g.translate(f.x, f.y);
    g.scale(f.facing, 1);
    const cy = f.moveName === 'rising' ? -170 : f.moveName === 'pounce' ? -55 : -95;
    const r = f.moveName === 'rising' ? 84 : 66;
    const [a0, a1] = f.moveName === 'rising' ? [60, -100] : [-80, 70];
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = i === 0 ? `rgba(255,255,255,${0.85 * (1 - k)})` : hexA(eyeColor, 0.55 * (1 - k));
      g.lineWidth = i === 0 ? 4 : 2.5;
      g.beginPath();
      g.arc(25, cy, r - i * 8, a0 * D, lerp(a0, a1, ease(Math.min(1, k * 1.5))) * D, a1 < a0);
      g.stroke();
    }
    g.restore();
  }
}

let smoke = null;
function smokeSprite() {
  if (!smoke) {
    smoke = document.createElement('canvas');
    smoke.width = smoke.height = 64;
    const sg = smoke.getContext('2d');
    const gr = sg.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(10,4,16,0.55)');
    gr.addColorStop(1, 'rgba(10,4,16,0)');
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
  }
  return smoke;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

// ---------------- Projectiles, effects, HUD ----------------
export function drawProjectile(g, pr, time) {
  const glow = g.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, 26);
  glow.addColorStop(0, 'rgba(180,255,120,0.9)');
  glow.addColorStop(1, 'rgba(60,160,40,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(pr.x, pr.y, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8ff9a';
  g.beginPath(); g.arc(pr.x + Math.sin(time * 40) * 1.5, pr.y, 8, 0, Math.PI * 2); g.fill();
  for (let i = 1; i < 5; i++) {
    g.fillStyle = `rgba(150,230,90,${0.4 - i * 0.08})`;
    g.beginPath(); g.arc(pr.x - pr.vx * 0.02 * i, pr.y + Math.sin(time * 20 + i) * 3, 7 - i, 0, Math.PI * 2); g.fill();
  }
}

export function drawShadow(g, f) {
  const h = Math.max(0, GROUND - f.y);
  const s = Math.max(0.3, 1 - h / 300);
  g.fillStyle = `rgba(0,0,0,${0.45 * s})`;
  g.beginPath(); g.ellipse(f.x, GROUND + 3, 34 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
}

export function drawParticles(g, parts) {
  for (const p of parts) {
    g.globalAlpha = Math.max(0, p.t / p.life);
    if (p.kind === 'spark') {
      g.strokeStyle = p.color; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
    } else if (p.kind === 'star') {
      const r = p.r * (0.4 + 0.6 * (p.t / p.life));
      g.fillStyle = p.color;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + p.rot;
        const rr = i % 2 ? r * 0.22 : r;
        g.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    } else if (p.kind === 'ring') {
      g.strokeStyle = p.color; g.lineWidth = 3;
      g.beginPath(); g.arc(p.x, p.y, (1 - p.t / p.life) * p.r, 0, Math.PI * 2); g.stroke();
    } else {
      g.fillStyle = p.color;
      g.beginPath(); g.arc(p.x, p.y, p.r * (p.t / p.life + 0.3), 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
}

function bar(g, x, y, w, h, frac, shown, color, flip) {
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.fillStyle = '#3a0d14';
  g.fillRect(x, y, w, h);
  // Lagging white "damage" segment.
  g.fillStyle = '#f2e6d0';
  const sw = w * shown;
  g.fillRect(flip ? x + w - sw : x, y, sw, h);
  g.fillStyle = color;
  const fw = w * frac;
  g.fillRect(flip ? x + w - fw : x, y, fw, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y, w, h / 3);
}

export function drawHud(g, { player, aswang, shownP, shownA, round, timer, score, intent, focus }) {
  const bw = 360;
  bar(g, 30, 26, bw, 18, player.hp / player.maxHp, shownP, '#e0b040', true);
  bar(g, W - 30 - bw, 26, bw, 18, aswang.hp / aswang.maxHp, shownA, '#8fd16a', false);
  g.font = 'bold 14px system-ui, sans-serif';
  g.fillStyle = '#f2e6d0';
  g.textAlign = 'left';
  g.fillText('DAKILA · Kali', 30, 62);
  g.textAlign = 'right';
  g.fillText('ASWANG', W - 30, 62);
  // Round pips.
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i < score.player ? '#e0b040' : 'rgba(255,255,255,0.15)';
    g.beginPath(); g.arc(30 + bw - 10 - i * 18, 62, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = i < score.aswang ? '#8fd16a' : 'rgba(255,255,255,0.15)';
    g.beginPath(); g.arc(W - 30 - bw + 10 + i * 18, 62, 6, 0, Math.PI * 2); g.fill();
  }
  // Timer.
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(W / 2 - 34, 14, 68, 46);
  g.fillStyle = timer <= 10 ? '#ff6b6b' : '#f2e6d0';
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText(String(Math.ceil(timer)), W / 2, 48);
  g.font = 'bold 10px system-ui, sans-serif';
  g.fillStyle = '#c9b8a0';
  g.fillText(`ROUND ${round}`, W / 2, 74);

  // Intent tag under the Aswang's bar, so the adaptation is visible in-arena too.
  const c = INTENT_COLORS[intent] || '#fff';
  const label = `MIND: ${intent}${focus.length ? ' · ' + focus.map((f) => f.replace(/_/g, ' ')).join(' · ') : ''}`;
  g.font = 'bold 11px system-ui, sans-serif';
  g.textAlign = 'right';
  const tw = g.measureText(label).width;
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(W - 30 - tw - 12, 72, tw + 12, 18);
  g.fillStyle = c;
  g.fillText(label, W - 36, 85);
}

export function drawBanner(g, text, sub, alpha, color = '#f2e6d0') {
  g.save();
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, H / 2 - 70, W, sub ? 120 : 100);
  g.font = 'bold 64px system-ui, sans-serif';
  g.fillStyle = color;
  g.shadowColor = color; g.shadowBlur = 24;
  g.fillText(text, W / 2, H / 2);
  g.shadowBlur = 0;
  if (sub) {
    g.font = 'bold 18px system-ui, sans-serif';
    g.fillStyle = '#c9b8a0';
    g.fillText(sub, W / 2, H / 2 + 34);
  }
  g.restore();
}

// Floating callout above the Aswang when Nemotron changes its plan.
export function drawThought(g, aswang, th) {
  if (!th || th.t <= 0) return;
  const a = Math.min(1, th.t * 2, (3.2 - th.t) * 4);
  const x = Math.max(140, Math.min(W - 140, aswang.x));
  const y = aswang.y - 190 - (3.2 - th.t) * 6;
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.font = 'bold 13px system-ui, sans-serif';
  g.textAlign = 'center';
  const lines = [th.head, th.taunt].filter(Boolean);
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 24;
  const h = lines.length * 18 + 12;
  g.fillStyle = 'rgba(10,6,16,0.85)';
  g.strokeStyle = th.color;
  g.lineWidth = 2;
  g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x, y + 9); g.lineTo(x + 6, y); g.fill();
  g.fillStyle = th.color;
  g.fillText(lines[0], x, y - h + 20);
  if (lines[1]) {
    g.font = 'italic 12px system-ui, sans-serif';
    g.fillStyle = '#f2e6d0';
    g.fillText(lines[1], x, y - h + 38);
  }
  g.restore();
}

// Compact controls reminder along the bottom of the arena.
export function drawControlsHint(g, alpha) {
  const rows = [
    ['MOVE', 'A D  or  ← →'],
    ['JUMP', 'W  ↑  Space'],
    ['BLOCK', 'S  or  ↓'],
    ['ATTACK', 'Click / Right-click   J K L   Z X C'],
    ['DASH', 'Shift'],
  ];
  g.save();
  g.globalAlpha = alpha;
  g.font = 'bold 11px system-ui, sans-serif';
  const gap = 22;
  const widths = rows.map(([k, v]) => {
    g.font = 'bold 10px system-ui, sans-serif';
    const kw = g.measureText(k).width;
    g.font = '12px system-ui, sans-serif';
    return kw + 6 + g.measureText(v).width;
  });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (rows.length - 1) + 32;
  let x = (W - total) / 2;
  const y = H - 34;
  g.fillStyle = 'rgba(8,5,12,0.78)';
  g.strokeStyle = 'rgba(224,176,64,0.35)';
  g.lineWidth = 1;
  g.beginPath(); g.roundRect(x, y - 16, total, 28, 8); g.fill(); g.stroke();
  x += 16;
  g.textAlign = 'left';
  rows.forEach(([k, v], i) => {
    g.font = 'bold 10px system-ui, sans-serif';
    g.fillStyle = '#e0b040';
    g.fillText(k, x, y + 2);
    const kw = g.measureText(k).width;
    g.font = '12px system-ui, sans-serif';
    g.fillStyle = '#f2e6d0';
    g.fillText(v, x + kw + 6, y + 2);
    x += widths[i] + gap;
  });
  g.restore();
}
