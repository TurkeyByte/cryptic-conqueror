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
  INSTINCT: '#d9ec9c',
  AGGRESSIVE: '#ff4d4d',
  DEFENSIVE: '#5fa8ff',
  COUNTER: '#ffd23f',
  ZONE: '#7dff9a',
  BAIT: '#ff8bd1',
  PRESSURE: '#ff8a3d',
  RETREAT: '#b9a3ff',
};

// ---------------- Arena ----------------
// The arena is two layers: a still backdrop (sky, moon, far hills, ground)
// and the hut, palms and bamboo, which shift slightly as the fight moves
// (parallax) for a sense of depth.
const PAD = 70;          // extra width on parallax layers so edges never show
const MID = 0.09;        // parallax factor for the hut/palms/bamboo layer
const LANTERN = { x: 395, y: 300 };
const MID_TOP = 95;      // topmost row on the palms/hut/bamboo layer
let layers = null;

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

// Layers are rendered once at the screen's real pixel density, so each frame
// is a straight copy instead of an upscale (much cheaper without a GPU).
let LAYER_SCALE = 1;
function makeLayer(w, h, scale = LAYER_SCALE) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  return [c, g];
}

function buildSky() {
  const [c, g] = makeLayer(W, H);
  const r = rng(7);
  const sky = g.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#070514');
  sky.addColorStop(0.55, '#1b1236');
  sky.addColorStop(1, '#3a1f3f');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,240,${0.2 + r() * 0.6})`;
    const sz = r() < 0.1 ? 2 : 1;
    g.fillRect(r() * W, r() * 300, sz, sz);
  }
  // Blood-tinged full moon with soft craters and a lit rim.
  const mx = 700, my = 110;
  const halo = g.createRadialGradient(mx, my, 30, mx, my, 210);
  halo.addColorStop(0, 'rgba(255,200,170,0.38)');
  halo.addColorStop(1, 'rgba(255,200,170,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  const body = g.createRadialGradient(mx - 14, my - 16, 8, mx, my, 58);
  body.addColorStop(0, '#fff0dc');
  body.addColorStop(0.7, '#f3d6b8');
  body.addColorStop(1, '#d9b292');
  g.fillStyle = body;
  g.beginPath(); g.arc(mx, my, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(20,10,22,0.85)'; g.lineWidth = 3.5;
  g.stroke();
  [[-18, -12, 12], [14, 8, 9], [-6, 20, 7], [20, -20, 6], [-26, 14, 5], [4, -30, 4]].forEach(([dx, dy, rr]) => {
    const cg = g.createRadialGradient(mx + dx + 2, my + dy + 2, 1, mx + dx, my + dy, rr);
    cg.addColorStop(0, 'rgba(190,140,120,0.45)');
    cg.addColorStop(1, 'rgba(190,140,120,0.08)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); g.fill();
  });
  return c;
}

function drawFarHills(g) {
  const w = W + PAD * 2;
  g.save();
  g.translate(-PAD, 0);
  g.fillStyle = '#1a1030';
  g.beginPath(); g.moveTo(0, 330);
  for (let x = 0; x <= w; x += 30) g.lineTo(x, 300 - Math.sin((x - PAD) * 0.008) * 50 - Math.sin((x - PAD) * 0.021) * 22);
  g.lineTo(w, GROUND); g.lineTo(0, GROUND); g.fill();
  // Moonlit ridge line.
  g.strokeStyle = 'rgba(160,120,170,0.18)'; g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x <= w; x += 30) g.lineTo(x, 300 - Math.sin((x - PAD) * 0.008) * 50 - Math.sin((x - PAD) * 0.021) * 22);
  g.stroke();
  g.fillStyle = '#140b24';
  g.beginPath(); g.moveTo(0, 380);
  for (let x = 0; x <= w; x += 24) g.lineTo(x, 360 - Math.sin((x - PAD) * 0.013 + 1) * 30 - Math.sin((x - PAD) * 0.04) * 8);
  g.lineTo(w, GROUND); g.lineTo(0, GROUND); g.fill();
  // Distant treeline silhouettes.
  const r = rng(11);
  g.fillStyle = '#100820';
  for (let x = 0; x < w; x += 9) {
    const base = 372 - Math.sin((x - PAD) * 0.013 + 1) * 30;
    const h = 8 + r() * 16;
    g.beginPath(); g.ellipse(x, base - h / 2 + 6, 7, h / 2 + 3, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function buildMid() {
  const w = W + PAD * 2;
  const [c, g] = makeLayer(w, H);
  const r = rng(3);
  const X = (x) => x + PAD;

  // Coconut palms with ringed trunks and layered fronds.
  const palm = (x0, h, lean) => {
    const x = X(x0);
    const tipX = x + lean, tipY = GROUND - h;
    g.strokeStyle = '#0c0716'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, GROUND); g.quadraticCurveTo(x + lean * 0.5, GROUND - h * 0.6, tipX, tipY); g.stroke();
    g.strokeStyle = 'rgba(60,40,70,0.5)'; g.lineWidth = 1.2;
    for (let t = 0.08; t < 1; t += 0.07) {
      const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + lean * 0.5) + t * t * tipX;
      const py = (1 - t) * (1 - t) * GROUND + 2 * (1 - t) * t * (GROUND - h * 0.6) + t * t * tipY;
      g.beginPath(); g.moveTo(px - 4.5, py); g.lineTo(px + 4.5, py + 1.5); g.stroke();
    }
    g.fillStyle = '#0c0716';
    for (let i = 0; i < 9; i++) {
      const a = (-170 + i * 30) * D;
      const len = 80 + (i % 2) * 18;
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.quadraticCurveTo(tipX + Math.cos(a) * len * 0.6, tipY + Math.sin(a) * 30 - 24, tipX + Math.cos(a) * len, tipY + Math.sin(a) * 40 + 28);
      g.quadraticCurveTo(tipX + Math.cos(a) * len * 0.5, tipY + Math.sin(a) * 22 - 4, tipX, tipY);
      g.fill();
      // Frond leaflets.
      g.strokeStyle = '#0c0716'; g.lineWidth = 1.2;
      for (let k = 2; k < 9; k++) {
        const t = k / 9;
        const fx = tipX + Math.cos(a) * len * t, fy = tipY + (Math.sin(a) * 40 + 28) * t * t - 18 * t * (1 - t);
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + Math.cos(a + 1.2) * 10, fy + 9); g.stroke();
      }
    }
    g.fillStyle = '#1a0f14';
    for (const [dx, dy] of [[-5, 6], [4, 7], [0, 10]]) { g.beginPath(); g.arc(tipX + dx, tipY + dy, 4.5, 0, Math.PI * 2); g.fill(); }
  };
  palm(90, 300, 30);
  palm(860, 270, -40);
  palm(560, 230, 20);

  // Bahay kubo (nipa hut) on bamboo stilts: woven walls, thatched roof, lit window.
  const hx = X(190), hy = GROUND - 70;
  g.fillStyle = '#120a1c';
  g.strokeStyle = '#05020a'; g.lineWidth = 3;
  for (const sx of [0, 50, 110, 160]) { g.fillRect(hx + sx, hy, 8, 70); g.strokeRect(hx + sx, hy, 8, 70); }
  g.strokeStyle = '#0a0612'; g.lineWidth = 2;
  for (const sx of [0, 50, 110, 160]) for (let y = hy + 14; y < GROUND; y += 18) { g.beginPath(); g.moveTo(hx + sx, y); g.lineTo(hx + sx + 8, y); g.stroke(); }
  g.fillStyle = '#1d1226';
  g.fillRect(hx - 10, hy - 70, 190, 72);
  g.strokeStyle = '#05020a'; g.lineWidth = 4;
  g.strokeRect(hx - 10, hy - 70, 190, 72);
  // Sawali (woven bamboo) wall texture.
  for (let yy = hy - 66; yy < hy; yy += 6) {
    for (let xx = hx - 8 + ((yy / 6) % 2) * 6; xx < hx + 178; xx += 12) {
      g.fillStyle = 'rgba(70,45,70,0.35)';
      g.fillRect(xx, yy, 6, 3);
    }
  }
  g.fillStyle = '#160d1f';
  g.fillRect(hx - 14, hy - 2, 198, 6);
  // Thatched roof with layered nipa rows.
  g.fillStyle = '#100818';
  g.beginPath(); g.moveTo(hx - 40, hy - 64); g.lineTo(hx + 85, hy - 150); g.lineTo(hx + 210, hy - 64); g.closePath(); g.fill();
  g.strokeStyle = '#05020a'; g.lineWidth = 4; g.lineJoin = 'round'; g.stroke();
  g.strokeStyle = 'rgba(80,50,60,0.55)'; g.lineWidth = 1;
  for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(hx - 35 + i * 15.5, hy - 66); g.lineTo(hx + 85, hy - 148); g.stroke(); }
  g.strokeStyle = 'rgba(30,18,30,0.9)'; g.lineWidth = 2;
  for (let k = 1; k < 5; k++) {
    const t = k / 5, y = hy - 64 - 86 * t, half = 125 * (1 - t);
    g.beginPath(); g.moveTo(hx + 85 - half, y); g.lineTo(hx + 85 + half, y); g.stroke();
  }
  // Ragged thatch edge.
  g.fillStyle = '#100818';
  for (let xx = hx - 40; xx < hx + 210; xx += 7) { g.beginPath(); g.moveTo(xx, hy - 64); g.lineTo(xx + 3.5, hy - 56 - r() * 4); g.lineTo(xx + 7, hy - 64); g.fill(); }
  // Window with warm light inside.
  const wg = g.createRadialGradient(hx + 120, hy - 35, 2, hx + 120, hy - 35, 70);
  wg.addColorStop(0, 'rgba(255,170,80,0.5)'); wg.addColorStop(1, 'rgba(255,170,80,0)');
  g.fillStyle = wg; g.fillRect(hx + 30, hy - 110, 180, 140);
  const win = g.createLinearGradient(0, hy - 52, 0, hy - 22);
  win.addColorStop(0, '#ffc777'); win.addColorStop(1, '#ff9a3c');
  g.fillStyle = win; g.fillRect(hx + 104, hy - 52, 32, 30);
  g.strokeStyle = '#05020a'; g.lineWidth = 4;
  g.strokeRect(hx + 104, hy - 52, 32, 30);
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(hx + 120, hy - 52); g.lineTo(hx + 120, hy - 22); g.moveTo(hx + 104, hy - 37); g.lineTo(hx + 136, hy - 37); g.stroke();
  // Door and ladder.
  g.fillStyle = '#0d0714'; g.fillRect(hx + 18, hy - 50, 26, 48);
  g.strokeStyle = '#05020a'; g.lineWidth = 3; g.strokeRect(hx + 18, hy - 50, 26, 48);
  g.strokeStyle = '#150c1e'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(hx + 20, hy + 2); g.lineTo(hx + 5, GROUND); g.moveTo(hx + 40, hy + 2); g.lineTo(hx + 25, GROUND); g.stroke();
  g.lineWidth = 2;
  for (let k = 1; k < 4; k++) { const t = k / 4; g.beginPath(); g.moveTo(hx + 20 - 15 * t, hy + 2 + 68 * t); g.lineTo(hx + 40 - 15 * t, hy + 2 + 68 * t); g.stroke(); }

  // Bamboo grove with leaves.
  for (let i = 0; i < 15; i++) {
    const x = X(630 + i * 22 + r() * 10), top = 130 + r() * 120, sway = (r() - 0.5) * 30;
    g.strokeStyle = i % 2 ? '#0f1a14' : '#132219'; g.lineWidth = 7 + (i % 3);
    g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x + sway, top); g.stroke();
    g.strokeStyle = 'rgba(120,160,120,0.12)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - 2, GROUND); g.lineTo(x + sway - 2, top); g.stroke();
    g.strokeStyle = '#08100b'; g.lineWidth = 2;
    for (let y = GROUND - 40; y > top; y -= 38) {
      const t = (GROUND - y) / (GROUND - top), bx = x + sway * t;
      g.beginPath(); g.moveTo(bx - 4.5, y); g.lineTo(bx + 4.5, y); g.stroke();
      if (r() < 0.45) {
        g.fillStyle = '#0b150f';
        const dir = r() < 0.5 ? -1 : 1;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.ellipse(bx + dir * (12 + k * 6), y - 4 + k * 5, 11, 2.6, dir * (0.5 + k * 0.25), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  return c;
}

function drawGround(g) {
  const r = rng(5);
  const gr = g.createLinearGradient(0, GROUND, 0, H);
  gr.addColorStop(0, '#2b1a22'); gr.addColorStop(1, '#120a10');
  g.fillStyle = gr; g.fillRect(0, GROUND, W, H - GROUND);
  // Pebbles and footprints in the packed earth.
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(110,80,90,0.18)';
    g.beginPath(); g.ellipse(r() * W, GROUND + 6 + r() * 64, 1 + r() * 5, 0.6 + r() * 1.4, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = '#140a16'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, GROUND + 1); g.lineTo(W, GROUND + 1); g.stroke();
  g.strokeStyle = '#4a3040'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, GROUND + 4); g.lineTo(W, GROUND + 4); g.stroke();
  g.strokeStyle = '#0d1a10'; g.lineWidth = 1.5;
  for (let i = 0; i < 110; i++) {
    const x = r() * W;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x, GROUND + 1); g.quadraticCurveTo(x + k * 2, GROUND - 5, x + k * 3.5, GROUND - 6 - r() * 7); g.stroke(); }
  }
}

function buildBackdrop() {
  const c = buildSky();
  const g = c.getContext('2d');
  drawFarHills(g);
  drawGround(g);
  return c;
}

// Clouds drift slowly across the sky, sometimes in front of the moon.
let cloudSprite = null;
function cloud() {
  if (!cloudSprite) {
    const [c, g] = makeLayer(260, 90, 1);
    const r = rng(19);
    for (let i = 0; i < 14; i++) {
      const x = 30 + r() * 200, y = 40 + (r() - 0.5) * 30, rr = 18 + r() * 22;
      const cg = g.createRadialGradient(x, y, 2, x, y, rr);
      cg.addColorStop(0, 'rgba(38,26,58,0.55)');
      cg.addColorStop(1, 'rgba(38,26,58,0)');
      g.fillStyle = cg;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    cloudSprite = c;
  }
  return cloudSprite;
}

// Lantern position follows the hut's parallax layer.
function lanternPos(camX = 0) {
  return { x: LANTERN.x - camX * MID, y: LANTERN.y };
}

export function drawArena(g, time, camX = 0) {
  const scale = Math.min(3, Math.max(1, g.canvas.width / W));
  if (!layers || layers.scale !== scale) {
    LAYER_SCALE = scale;
    const [composite, cg] = makeLayer(W, H);
    layers = { scale, backdrop: buildBackdrop(), mid: buildMid(), composite, cg, offset: null };
  }
  // The backdrop and the parallax layer are combined into one cached image,
  // rebuilt only when the parallax offset moves by a whole pixel, so most
  // frames copy a single image.
  const k = scale;
  const offset = Math.round(-PAD - camX * MID);
  if (offset !== layers.offset) {
    const { cg } = layers;
    cg.setTransform(1, 0, 0, 1, 0, 0);
    cg.drawImage(layers.backdrop, 0, 0);
    cg.drawImage(layers.mid, offset * k, 0);
    // The edge vignette is baked in here; fighters stay near the center,
    // where it is fully transparent anyway.
    cg.setTransform(k, 0, 0, k, 0, 0);
    drawVignette(cg);
    layers.offset = offset;
  }
  g.drawImage(layers.composite, 0, 0, W * k, H * k, 0, 0, W, H);
  // Clouds drift over the scene (they're faint, so drawing them over the
  // palm tops is fine).
  g.globalAlpha = 0.9;
  for (let i = 0; i < 3; i++) {
    const x = ((i * 380 + time * (6 + i * 3)) % (W + 300)) - 280;
    g.drawImage(cloud(), x, 60 + i * 38, 300 - i * 40, 100 - i * 14);
  }
  g.globalAlpha = 1;
  drawFireflies(g, time, camX);
  drawLeaves(g, time);
}

// A few leaves tumbling down through the scene.
function drawLeaves(g, time) {
  g.fillStyle = '#1e2c1a';
  for (let i = 0; i < 6; i++) {
    const period = 9 + i * 1.7;
    const t = ((time + i * 3.1) % period) / period;
    const x = ((i * 157 + 60) % W) + Math.sin(t * 12 + i) * 30 - t * 60;
    const y = 60 + t * (GROUND - 50);
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 10 + i) * 1.2);
    g.scale(1, Math.abs(Math.cos(t * 8 + i)) * 0.8 + 0.2);
    g.beginPath(); g.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

function drawFireflies(g, time, camX) {
  for (let i = 0; i < 18; i++) {
    const x = (i * 131 + Math.sin(time * 0.5 + i) * 40 + time * (8 + i % 4)) % W;
    const y = 250 + ((i * 47) % 200) + Math.sin(time * 1.3 + i * 2) * 15;
    const a = 0.35 + 0.35 * Math.sin(time * 3 + i * 1.7);
    g.fillStyle = `rgba(220,255,140,${a})`;
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  // Swaying parol-style capiz lantern hanging from the hut.
  const { x: lx } = lanternPos(camX);
  const ly = LANTERN.y + Math.sin(time * 1.2) * 2;
  g.strokeStyle = '#2a1a22'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(lx - 20, 255); g.lineTo(lx, ly - 12); g.stroke();
  const flick = 0.75 + Math.sin(time * 13) * 0.05 + Math.sin(time * 7) * 0.05;
  const lg = g.createRadialGradient(lx, ly, 2, lx, ly, 130);
  lg.addColorStop(0, `rgba(255,190,110,${0.38 * flick})`); lg.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = lg; g.fillRect(lx - 130, ly - 130, 260, 260);
  // Warm pool of light on the ground beneath it.
  const pg = g.createRadialGradient(lx, GROUND + 6, 4, lx, GROUND + 6, 150);
  pg.addColorStop(0, `rgba(255,170,90,${0.16 * flick})`); pg.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = pg;
  g.save(); g.translate(0, GROUND + 6); g.scale(1, 0.22); g.translate(0, -(GROUND + 6));
  g.fillRect(lx - 150, GROUND - 144, 300, 300);
  g.restore();
  g.fillStyle = `rgba(255,220,160,${flick})`;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    g.lineTo(lx + Math.cos(a) * 12, ly + Math.sin(a) * 12);
    g.lineTo(lx + Math.cos(a2) * 5, ly + Math.sin(a2) * 5);
  }
  g.closePath(); g.fill();
  // Tassels.
  g.strokeStyle = `rgba(255,200,140,${flick * 0.8})`; g.lineWidth = 1.2;
  for (const dx of [-4, 0, 4]) { g.beginPath(); g.moveTo(lx + dx, ly + 10); g.lineTo(lx + dx + Math.sin(time * 2 + dx) * 2, ly + 22); g.stroke(); }
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
function drawVignette(g) {
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
// Cartoon style: everything is bold flat color with a thick ink outline.
const OL = '#140a16';   // outline ink
const OLW = 3.2;        // outline half-width

// A thick round "noodle" (limb, stick, tail) along a polyline, with an ink outline.
function noodleOutline(g, pts, w) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = OL; g.lineWidth = w + OLW * 2;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
}
function noodleFill(g, pts, w, color) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = color; g.lineWidth = w;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
}
function noodle(g, pts, w, color) { noodleOutline(g, pts, w); noodleFill(g, pts, w, color); }

// Fill a shape with an ink outline (the outer half of the stroke shows).
function inked(g, path, color, lw = OLW * 2) {
  path(); g.strokeStyle = OL; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke();
  path(); g.fillStyle = color; g.fill();
}
function ellipsePath(g, x, y, rx, ry, rot = 0) {
  return () => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
}

// Two-segment limb: [start, joint, end].
function joint(x, y, a1, l1, a2, l2) {
  const ex = x + Math.cos(a1) * l1, ey = y + Math.sin(a1) * l1;
  return [[x, y], [ex, ey], [ex + Math.cos(a2) * l2, ey + Math.sin(a2) * l2]];
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
  crouch: { lean: 2, bob: 0, aF1: 0, aF2: -75, sF: -95, aB1: 40, aB2: -65, sB: -60, lF1: 22, lF2: 112, lB1: 158, lB2: 82, rot: 0 },
  walA:   { lean: 0, bob: 0, aF1: 150, aF2: 120, sF: -150, aB1: 160, aB2: 130, sB: -170, lF1: 25, lF2: 112, lB1: 158, lB2: 82, rot: 0 },
  walB:   { lean: 22, bob: 0, aF1: 50, aF2: 60, sF: 15, aB1: 130, aB2: 100, sB: 175, lF1: 8, lF2: 12, lB1: 155, lB2: 85, rot: 0 },
  airA:   { lean: 0, bob: 0, aF1: -80, aF2: -120, sF: -160, aB1: 150, aB2: 110, sB: -140, lF1: 20, lF2: 110, lB1: 70, lB2: 150, rot: 0 },
  airB:   { lean: 22, bob: 0, aF1: 40, aF2: 70, sF: 80, aB1: 160, aB2: 120, sB: -160, lF1: 20, lF2: 100, lB1: 60, lB2: 140, rot: 0 },
};

function playerPose(f) {
  const s = f.state;
  if (s === 'attack') {
    const { ph, k } = progress(f);
    const pairs = { witik: ['witikA', 'witikB'], redonda: ['redA', 'redB'], sungkite: ['sunA', 'sunB'], lusob: ['airA', 'airB'], walis: ['walA', 'walB'] }[f.moveName];
    const [A, B] = pairs.map((n) => P[n]);
    if (ph === 'startup') return lerpPose(P[f.airborne ? 'jump' : f.moveName === 'walis' ? 'crouch' : 'idle'], A, ease(k));
    if (ph === 'recovery' && f.moveName === 'walis') return lerpPose(B, P.crouch, ease(k));
    if (ph === 'active') return lerpPose(A, B, ease(Math.min(1, k * (f.moveName === 'lusob' ? 4 : 1.6))));
    return lerpPose(B, P.idle, ease(k));
  }
  if (s === 'walk') {
    const c = Math.sin(f.anim * 12) * f.walkDir * f.facing;
    return { ...P.idle, lF1: 65 + c * 25, lB1: 118 - c * 25, lF2: 100 + Math.max(0, c) * 20, lB2: 92 + Math.max(0, -c) * 20, bob: Math.abs(c) * -3 };
  }
  if (s === 'jump' || s === 'leap') return P.jump;
  if (s === 'guard' || s === 'blockstun') return P.crouch;
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
  const pts = [[x - Math.cos(ang) * 9, y - Math.sin(ang) * 9], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]];
  noodle(g, pts, 6, '#e3b867');
  g.strokeStyle = '#9c6d2e'; g.lineWidth = 6; g.lineCap = 'butt';
  for (const t of [0.35, 0.68]) {
    const nx = x + Math.cos(ang) * len * t, ny = y + Math.sin(ang) * len * t;
    g.beginPath(); g.moveTo(nx - Math.cos(ang) * 1.2, ny - Math.sin(ang) * 1.2); g.lineTo(nx + Math.cos(ang) * 1.2, ny + Math.sin(ang) * 1.2); g.stroke();
  }
  g.strokeStyle = 'rgba(255,240,200,0.7)'; g.lineWidth = 1.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(pts[0][0] - 1, pts[0][1] - 1.5); g.lineTo(pts[1][0] - 1, pts[1][1] - 1.5); g.stroke();
  return pts[1];
}

function sneaker(g, x, y) {
  inked(g, () => { g.beginPath(); g.roundRect(x - 8, y - 9, 26, 12, [7, 9, 3, 3]); }, '#f4f1ea');
  g.fillStyle = '#d4262f';
  g.fillRect(x - 7, y - 1, 24, 3);
}

// A big round cartoon eye: white with a small pupil looking forward.
function eye(g, x, y, rx, ry, pupilDx, closed) {
  if (closed) {
    g.strokeStyle = OL; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - rx, y + 1); g.quadraticCurveTo(x, y + 3, x + rx, y + 1); g.stroke();
    return;
  }
  inked(g, ellipsePath(g, x, y, rx, ry), '#ffffff', 2.4);
  g.fillStyle = OL;
  g.beginPath(); g.arc(x + pupilDx, y + 0.5, Math.min(rx, ry) * 0.38, 0, Math.PI * 2); g.fill();
}

// Dakila: a modern Filipino Kali fighter, drawn as a bold cartoon. Hoodie,
// jeans and big sneakers, with his heritage in the red putong (headband) and
// a woven bracelet.
export function drawPlayer(g, f, time) {
  const p = smoothPose(f, playerPose(f), time);
  const THIGH = 30, SHIN = 30, TORSO = 40, UA = 22, FA = 20, STICK = 62, HEAD = 19;
  const SKIN = '#b0703f', SKIN_D = '#93582d', HOOD = '#3c63c9', HOOD_D = '#2c4a9c', JEANS = '#29467e', JEANS_D = '#1f3563', RED = '#e0262f';
  g.save();
  g.translate(f.x, f.y);
  g.scale(f.facing, 1);
  g.rotate(p.rot * D);
  // Squash on landing, stretch in the air.
  const sq = f.state === 'land' ? 0.12 : f.airborne && f.state !== 'hurt' ? -0.05 : 0;
  g.scale(1 + sq, 1 - sq);
  const hipY = -footDrop(p, THIGH, SHIN) + p.bob;
  const lean = p.lean * D;
  const nx = Math.sin(lean) * TORSO, ny = hipY - Math.cos(lean) * TORSO;
  const sx = nx - Math.sin(lean) * 5, sy = ny + Math.cos(lean) * 5;
  const hx = nx + Math.sin(lean) * (HEAD + 2), hy = ny - Math.cos(lean) * (HEAD + 2);

  // Back leg, back arm, stick and fist.
  const bl = joint(-3, hipY, p.lB1 * D, THIGH, p.lB2 * D, SHIN);
  noodle(g, bl, 14, JEANS_D);
  sneaker(g, bl[2][0], bl[2][1] + 4);
  const ba = joint(sx - 4, sy, p.aB1 * D, UA, p.aB2 * D, FA);
  noodle(g, ba, 12, HOOD_D);
  const bTip = stick(g, ba[2][0], ba[2][1], p.sB * D, STICK);
  inked(g, ellipsePath(g, ba[2][0], ba[2][1], 6.5, 6.5), SKIN_D);

  // Hoodie body with a cel-shaded back side, pocket and swinging strings.
  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  const body = () => {
    g.beginPath();
    g.moveTo(-17, 6); g.quadraticCurveTo(-20, -TORSO * 0.5, -15, -TORSO + 4);
    g.quadraticCurveTo(0, -TORSO - 8, 15, -TORSO + 4); g.quadraticCurveTo(20, -TORSO * 0.5, 17, 6);
    g.closePath();
  };
  inked(g, body, HOOD);
  g.save(); body(); g.clip();
  g.fillStyle = HOOD_D; g.fillRect(-30, -TORSO - 10, 13, TORSO + 30);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(8, -TORSO, 6, TORSO);
  g.restore();
  g.strokeStyle = OL; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(-9, -2); g.lineTo(-7, -16); g.lineTo(9, -16); g.lineTo(11, -2); g.stroke();
  g.beginPath(); g.moveTo(-16, 2); g.lineTo(16, 2); g.stroke();
  const sw = Math.sin(time * 6) * 1.5 - Math.max(-3, Math.min(3, f.vx * 0.006));
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-4, -TORSO + 3); g.lineTo(-4 + sw, -TORSO + 16); g.moveTo(5, -TORSO + 3); g.lineTo(5 + sw, -TORSO + 16); g.stroke();
  g.restore();

  // Front leg.
  const fl = joint(3, hipY, p.lF1 * D, THIGH, p.lF2 * D, SHIN);
  noodle(g, fl, 14, JEANS);
  sneaker(g, fl[2][0], fl[2][1] + 4);

  // Headband tails flapping behind the head.
  const tw = Math.sin(time * 9) * 5 - Math.min(10, Math.abs(f.vx) * 0.02) - (f.state === 'dash' ? 8 : 0);
  noodle(g, [[hx - 14, hy - 6], [hx - 28, hy - 6 + tw], [hx - 40, hy + 2 - tw]], 5, RED);
  noodle(g, [[hx - 14, hy - 4], [hx - 26, hy + 4 - tw * 0.5], [hx - 34, hy + 14 + tw * 0.6]], 4, RED);

  // Big head with a shaded back, spiky hair, headband and ear.
  inked(g, ellipsePath(g, hx, hy, HEAD, HEAD * 1.02), SKIN);
  g.save(); ellipsePath(g, hx, hy, HEAD, HEAD * 1.02)(); g.clip();
  g.fillStyle = SKIN_D; g.beginPath(); g.arc(hx - 14, hy + 6, 16, 0, Math.PI * 2); g.fill();
  g.restore();
  inked(g, () => {
    g.beginPath();
    g.moveTo(hx - HEAD - 1, hy + 2);
    g.lineTo(hx - HEAD + 1, hy - 10);
    for (const [dx, dy] of [[-14, -26], [-8, -20], [-2, -31], [4, -22], [10, -29], [14, -18], [19, -12]]) g.lineTo(hx + dx, hy + dy);
    g.quadraticCurveTo(hx + 6, hy - 13, hx - 6, hy - 10);
    g.quadraticCurveTo(hx - 12, hy - 4, hx - 13, hy + 4);
    g.closePath();
  }, '#1a1212');
  inked(g, () => { g.beginPath(); g.moveTo(hx - HEAD + 1, hy - 10); g.lineTo(hx + HEAD - 1, hy - 14); g.lineTo(hx + HEAD - 0.5, hy - 8); g.lineTo(hx - HEAD + 0.5, hy - 3); g.closePath(); }, RED);
  inked(g, ellipsePath(g, hx - 5, hy + 4, 4, 5.5), SKIN, 3);

  // Face: two big eyes with small pupils, thick brows, no nose, attitude mouth.
  const hurt = f.state === 'hurt' || f.state === 'down' || f.state === 'ko';
  const blink = (time % 3.4) < 0.1;
  const look = hurt ? -1 : 1.6;
  eye(g, hx + 3, hy + 1, 4.6, 6, look, blink || hurt);
  eye(g, hx + 12, hy + 1, 5.6, 7, look, blink || hurt);
  g.strokeStyle = OL; g.lineWidth = 3.6; g.lineCap = 'round';
  const browY = hurt ? -9 : -7;
  g.beginPath(); g.moveTo(hx - 0.5, hy + browY - 2); g.lineTo(hx + 5.5, hy + browY); g.stroke();
  g.beginPath(); g.moveTo(hx + 8.5, hy + browY + 0.5); g.lineTo(hx + 17, hy + browY - 2.5); g.stroke();
  const striking = f.state === 'attack' && f.phase !== 'recovery';
  if (striking || f.state === 'win') {
    // Battle shout.
    inked(g, () => { g.beginPath(); g.moveTo(hx + 5, hy + 11); g.quadraticCurveTo(hx + 11, hy + 21, hx + 17, hy + 11); g.closePath(); }, '#5a1414', 2.4);
  } else if (hurt) {
    g.strokeStyle = OL; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(hx + 5, hy + 14); g.quadraticCurveTo(hx + 10, hy + 10, hx + 15, hy + 14); g.stroke();
  } else {
    g.strokeStyle = OL; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(hx + 5, hy + 12); g.quadraticCurveTo(hx + 11, hy + 15, hx + 16, hy + 10); g.stroke();
  }

  // Front arm, woven bracelet, stick and fist.
  const fa = joint(sx + 3, sy, p.aF1 * D, UA, p.aF2 * D, FA);
  noodle(g, fa, 12, HOOD);
  const bx = fa[1][0] + (fa[2][0] - fa[1][0]) * 0.75, by = fa[1][1] + (fa[2][1] - fa[1][1]) * 0.75;
  inked(g, ellipsePath(g, bx, by, 6.5, 6.5), '#f0b83a', 3);
  g.fillStyle = RED; g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
  const fTip = stick(g, fa[2][0], fa[2][1], p.sF * D, STICK);
  inked(g, ellipsePath(g, fa[2][0], fa[2][1], 7, 7), SKIN);
  g.restore();

  // Stick motion trails while attacking (world space).
  const k = 1 + sq;
  const toWorld = ([x, y]) => {
    const c = Math.cos(p.rot * D), s = Math.sin(p.rot * D);
    const lx = x * k, ly = y * (1 - sq);
    return [f.x + f.facing * (lx * c - ly * s), f.y + (lx * s + ly * c)];
  };
  if (f.state === 'attack' && f.phase !== 'recovery') f.trail.push([...toWorld(fTip), ...toWorld(bTip), time]);
  f.trail = f.trail.filter((t) => time - t[4] < 0.12);
  if (f.trail.length > 1) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,240,190,0.75)';
    g.lineWidth = 5;
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

// Four long curved talons, inked.
function claws(g, x, y, ang, skin) {
  const talon = (off) => {
    const a = ang + off;
    return [[x, y], [x + Math.cos(a) * 12, y + Math.sin(a) * 12], [x + Math.cos(a + 0.5) * 24, y + Math.sin(a + 0.5) * 24]];
  };
  const offs = [-0.5, -0.12, 0.26, 0.6];
  for (const o of offs) noodleOutline(g, talon(o), 3);
  for (const o of offs) noodleFill(g, talon(o), 3, '#f6efdc');
  inked(g, ellipsePath(g, x, y, 5.5, 5.5), skin, 4);
}
function footClaws(g, x, y) {
  const toe = (dx) => [[x + dx - 6, y - 3], [x + dx + 3, y - 2], [x + dx + 6, y + 1]];
  for (const dx of [2, 8, 14]) noodleOutline(g, toe(dx), 2.5);
  for (const dx of [2, 8, 14]) noodleFill(g, toe(dx), 2.5, '#f6efdc');
}

// The Aswang as a goofy-creepy cartoon: huge head, glowing eyes in the
// current intent's color, a fanged grin, noodly limbs and a tattered robe.
export function drawAswang(g, f, time, eyeColor, aura = 0) {
  const p = smoothPose(f, aswangPose(f), time);
  const THIGH = 36, SHIN = 38, TORSO = 48, UA = 34, FA = 32, HEAD = 21;
  const SKIN = '#9fb487', SKIN_D = '#7a8c66', ROBE = '#3a2450', ROBE_D = '#2a1840', HAIR = '#120a1a';

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
  const sq = f.state === 'land' ? 0.12 : 0;
  g.scale(1 + sq, 1 - sq);
  const hipY = -footDrop(p, THIGH, SHIN) + p.bob;
  const lean = p.lean * D;
  const nx = Math.sin(lean) * TORSO, ny = hipY - Math.cos(lean) * TORSO;
  const sx = nx - Math.sin(lean) * 6, sy = ny + Math.cos(lean) * 6;
  const headA = lean + p.head * D;
  const hx = nx + Math.sin(headA) * (HEAD + 2), hy = ny - Math.cos(headA) * (HEAD + 2);
  const drag = Math.min(60, Math.abs(f.vx) * 0.07);

  // Wild hair mass behind everything.
  inked(g, () => {
    g.beginPath();
    g.moveTo(hx + 8, hy - 18);
    g.bezierCurveTo(hx - 30, hy - 32, hx - 56 - drag, hy + 10, hx - 50 - drag + Math.sin(time * 2.4) * 8, hy + 96);
    for (let i = 0; i < 6; i++) g.lineTo(hx - 50 - drag + i * 7 + Math.sin(time * 3 + i) * 4, hy + 96 - (i % 2) * 14 - i * 4);
    g.bezierCurveTo(hx - 18, hy + 50, hx - 14, hy + 20, hx - 2, hy + 6);
    g.closePath();
  }, HAIR);

  // Back limbs: skinny and knobbly.
  const bl = joint(-3, hipY, p.lB1 * D, THIGH, p.lB2 * D, SHIN);
  noodle(g, bl, 9, SKIN_D);
  inked(g, ellipsePath(g, bl[1][0], bl[1][1], 6, 6), SKIN_D, 4);
  footClaws(g, bl[2][0], bl[2][1]);
  const ba = joint(sx - 4, sy, p.aB1 * D, UA, p.aB2 * D, FA);
  noodle(g, ba, 7, SKIN_D);
  inked(g, ellipsePath(g, ba[1][0], ba[1][1], 5, 5), SKIN_D, 4);
  claws(g, ba[2][0], ba[2][1], p.aB2 * D, SKIN_D);

  // Tattered robe with a shaded back and ribs showing through a torn chest.
  g.save();
  g.translate(0, hipY);
  g.rotate(lean);
  const robe = () => {
    g.beginPath();
    g.moveTo(-15, -TORSO + 6); g.quadraticCurveTo(0, -TORSO - 8, 15, -TORSO + 6);
    g.lineTo(16, 4);
    for (let i = 0; i <= 6; i++) { const x = 16 - i * 5.3; g.lineTo(x - 2.6, 16 + (i % 2) * 9 + Math.sin(time * 3 + i) * 3); g.lineTo(x - 5.3, 4); }
    g.closePath();
  };
  inked(g, robe, ROBE);
  g.save(); robe(); g.clip();
  g.fillStyle = ROBE_D; g.fillRect(-22, -TORSO - 10, 12, TORSO + 40);
  g.restore();
  inked(g, ellipsePath(g, 3, -TORSO + 22, 8, 12, 0.1), SKIN, 4);
  g.strokeStyle = OL; g.lineWidth = 2;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-3, -TORSO + 15 + i * 6); g.quadraticCurveTo(3, -TORSO + 19 + i * 6, 9, -TORSO + 15 + i * 6); g.stroke(); }
  g.restore();

  const fl = joint(3, hipY, p.lF1 * D, THIGH, p.lF2 * D, SHIN);
  noodle(g, fl, 9, SKIN);
  inked(g, ellipsePath(g, fl[1][0], fl[1][1], 6, 6), SKIN, 4);
  footClaws(g, fl[2][0], fl[2][1]);

  // Big head: long jaw, glowing eyes, fanged grin.
  g.save();
  g.translate(hx, hy);
  g.rotate(headA * 0.5);
  const attacking = f.state === 'attack' && f.phase !== 'recovery';
  const hurt = f.state === 'hurt' || f.state === 'down' || f.state === 'ko';
  const jaw = attacking ? 9 : 3;
  inked(g, ellipsePath(g, 2, 2, HEAD * 0.9, HEAD * 1.1, 0.12), SKIN);
  g.save(); ellipsePath(g, 2, 2, HEAD * 0.9, HEAD * 1.1, 0.12)(); g.clip();
  g.fillStyle = SKIN_D; g.beginPath(); g.arc(-14, 8, 16, 0, Math.PI * 2); g.fill();
  g.restore();
  // Hair fringe.
  inked(g, () => { g.beginPath(); g.moveTo(-19, 2); g.quadraticCurveTo(-16, -24, 6, -22); g.lineTo(2, -15); g.lineTo(-4, -19); g.lineTo(-8, -11); g.lineTo(-12, -15); g.lineTo(-14, 0); g.closePath(); }, HAIR);
  // Eyes: soft dark sockets, glowing in the intent color, slit pupils. No ink
  // rings around them, so they read as glowing eyes rather than glasses.
  g.fillStyle = 'rgba(20,10,22,0.55)';
  g.beginPath(); g.ellipse(9.5, -3.5, 8, 6.5, -0.25, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(-2.5, -3.5, 5.5, 5, -0.25, 0, Math.PI * 2); g.fill();
  const flick = 0.85 + 0.15 * Math.sin(time * 9) * Math.sin(time * 3.1);
  g.shadowColor = eyeColor; g.shadowBlur = 14 + aura * 10;
  g.fillStyle = eyeColor;
  if (hurt) {
    g.strokeStyle = eyeColor; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(5, -6); g.lineTo(14, -1); g.moveTo(5, -1); g.lineTo(14, -6); g.stroke();
    g.beginPath(); g.moveTo(-5, -5.5); g.lineTo(0, -1.5); g.moveTo(-5, -1.5); g.lineTo(0, -5.5); g.stroke();
  } else {
    g.beginPath(); g.ellipse(9.5, -3.5, 6, 4.6, -0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(-2.5, -3.5, 3.8, 3.4, -0.25, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  if (!hurt) {
    g.globalAlpha = flick;
    g.fillStyle = '#fffbe8';
    g.beginPath(); g.ellipse(9, -4, 3, 2.2, -0.25, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = OL;
    g.beginPath(); g.ellipse(11, -3.5, 1.3, 3.6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(-1.6, -3.5, 1, 2.7, 0, 0, Math.PI * 2); g.fill();
  }
  // Separate angry brows.
  g.strokeStyle = OL; g.lineWidth = 3.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(3.5, -12); g.lineTo(16, -8.5); g.stroke();
  g.beginPath(); g.moveTo(-7, -9.5); g.lineTo(0.5, -10.5); g.stroke();
  // Wide grin full of fangs.
  inked(g, () => { g.beginPath(); g.moveTo(-6, 9); g.quadraticCurveTo(6, 13, 19, 6); g.quadraticCurveTo(10, 14 + jaw, -4, 12 + jaw * 0.5); g.closePath(); }, '#3a0a14', 3);
  g.fillStyle = '#fff8e8';
  for (let i = 0; i < 6; i++) {
    const tx = -3 + i * 3.6, ty = 9.5 + Math.sin((i / 5) * Math.PI) * 1.5 - (i / 5) * 3.5;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 1.6, ty + 4 + (i % 2) * 1.5); g.lineTo(tx + 3.2, ty); g.fill();
  }
  // Its long tongue lashes out when spitting.
  if (f.state === 'attack' && f.moveName === 'spit') {
    const { ph, k } = progress(f);
    const len = ph === 'startup' ? k * 12 : ph === 'active' ? 38 : 38 * (1 - k);
    noodle(g, [[12, 11], [12 + len * 0.5, 17 + Math.sin(time * 30) * 3], [12 + len, 13]], 4, '#c43a6a');
  }
  g.restore();

  const fa = joint(sx + 3, sy, p.aF1 * D, UA, p.aF2 * D, FA);
  noodle(g, fa, 7, SKIN);
  inked(g, ellipsePath(g, fa[1][0], fa[1][1], 5, 5), SKIN, 4);
  claws(g, fa[2][0], fa[2][1], p.aF2 * D, SKIN);
  g.restore();

  // Claw slash arcs while the attack is active, inked and tinted by the intent.
  if (f.state === 'attack' && f.phase === 'active' && f.moveName !== 'spit') {
    const { k } = progress(f);
    g.save();
    g.translate(f.x, f.y);
    g.scale(f.facing, 1);
    const cy = f.moveName === 'rising' ? -170 : f.moveName === 'pounce' ? -55 : -95;
    const r = f.moveName === 'rising' ? 84 : 66;
    const [a0, a1] = f.moveName === 'rising' ? [60, -100] : [-80, 70];
    const end = lerp(a0, a1, ease(Math.min(1, k * 1.5))) * D;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = hexA('#140a16', 0.8 * (1 - k)); g.lineWidth = 8;
      g.beginPath(); g.arc(25, cy, r - i * 10, a0 * D, end, a1 < a0); g.stroke();
      g.strokeStyle = i === 0 ? `rgba(255,255,255,${0.95 * (1 - k)})` : hexA(eyeColor, 0.85 * (1 - k)); g.lineWidth = 4;
      g.beginPath(); g.arc(25, cy, r - i * 10, a0 * D, end, a1 < a0); g.stroke();
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
  const glow = g.createRadialGradient(pr.x, pr.y, 2, pr.x, pr.y, 28);
  glow.addColorStop(0, 'rgba(180,255,120,0.55)');
  glow.addColorStop(1, 'rgba(60,160,40,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(pr.x, pr.y, 28, 0, Math.PI * 2); g.fill();
  for (let i = 1; i < 4; i++) {
    inked(g, ellipsePath(g, pr.x - pr.vx * 0.024 * i, pr.y + Math.sin(time * 20 + i) * 3, 6 - i * 1.4, 5 - i * 1.2), '#8fe05a', 3);
  }
  const wob = Math.sin(time * 30) * 1.2;
  inked(g, ellipsePath(g, pr.x, pr.y, 10 + wob, 9 - wob), '#b6f26e');
  g.fillStyle = '#e8ffd0';
  g.beginPath(); g.ellipse(pr.x - 3, pr.y - 3, 3.2, 2.2, -0.5, 0, Math.PI * 2); g.fill();
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
      g.strokeStyle = OL; g.lineWidth = 4; g.lineJoin = 'round';
      g.stroke();
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
  g.fillStyle = OL;
  g.beginPath(); g.roundRect(x - 4, y - 4, w + 8, h + 8, 6); g.fill();
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
  const life = th.life || 3.2;
  const a = Math.min(1, th.t * 2, (life - th.t) * 4);
  const x = Math.max(150, Math.min(W - 150, aswang.x));
  const y = aswang.y - 190 - (life - th.t) * 6;
  g.save();
  g.globalAlpha = Math.max(0, a);
  g.textAlign = 'center';
  // Each line: text, font, color, height.
  const lines = [
    [th.head, 'bold 13px system-ui, sans-serif', th.color, 18],
    [th.taunt, 'italic 12px system-ui, sans-serif', '#f2e6d0', 18],
    [th.translation, '11px system-ui, sans-serif', '#a8977f', 15],
  ].filter((l) => l[0]);
  const w = Math.max(...lines.map(([text, font]) => { g.font = font; return g.measureText(text).width; })) + 24;
  const h = lines.reduce((sum, l) => sum + l[3], 0) + 12;
  g.fillStyle = 'rgba(10,6,16,0.85)';
  g.strokeStyle = th.color;
  g.lineWidth = 2;
  g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x, y + 9); g.lineTo(x + 6, y); g.fill();
  let ty = y - h + 2;
  for (const [text, font, color, lh] of lines) {
    ty += lh;
    g.font = font;
    g.fillStyle = color;
    g.fillText(text, x, ty);
  }
  g.restore();
}

// Compact controls reminder along the bottom of the arena.
export function drawControlsHint(g, alpha) {
  const rows = [
    ['MOVE', 'A D  or  ← →'],
    ['JUMP', 'W  ↑  Space'],
    ['CROUCH + BLOCK', 'S  or  ↓'],
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
