// Pixel-art style: the whole fight is drawn at a third of the resolution and
// scaled up without smoothing, and the arena is a moonlit village painted in
// code with a small fixed palette. Everything here is original, drawn
// procedurally (no sprite sheets or external images).
import { GROUND } from './fighter.js';

export const PIX = 3;               // screen pixels per art pixel (at 960x540)
const W = 960, H = 540;
const LW = W / PIX, LH = H / PIX;
const PAD = 70;                     // extra width on the parallax layer
const MID = 0.3;                    // parallax: the village follows the camera this much
const BANK = 452;                   // where the far riverbank meets the dirt
const MOON = { x: 660, y: 188, r: 44 };
const TREE = { x: 380 };            // the balete tree, home of the Aswang
const HOLLOW = { x: TREE.x + 6, y: 400 };

const PALETTE = [
  // night sky, darkest to lightest
  '#070b1c', '#0b1128', '#101a38', '#162348', '#1d2e5a', '#263c70', '#324c86',
  // moon
  '#f6efd4', '#ddd3b0', '#bdb28e', '#9c9278', '#f8e2c6', '#e6c2a2', '#c4977e',
  // silhouettes and foliage
  '#060915', '#0a1024', '#0e1630', '#131d3c', '#1a2648', '#22305a', '#2e3e6e', '#3c4f84',
  // water
  '#0d1a3e', '#142654', '#1f3768', '#9ea6b4',
  // wood, thatch, stone
  '#15101a', '#211926', '#2e2432', '#3d3140', '#4b4054', '#625a76', '#2a3050', '#383f64', '#4c5680',
  // warm lights
  '#ffe7a0', '#ffc062', '#ff8f3a', '#d6532a', '#8a3a28', '#6a3c2c',
  // dirt and grass
  '#1a1520', '#231c2a', '#2d2434', '#3a2f40', '#4a3e50', '#152230', '#1e3040', '#2a4252',
];

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PAL = PALETTE.map(hexRgb);

// A canvas at art resolution whose drawing code uses screen (960x540) units.
function makeLayer(w) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w / PIX); c.height = LH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.scale(1 / PIX, 1 / PIX);
  return [c, g];
}

// Snap a layer to hard pixels: alpha becomes on/off and every color moves to
// the nearest palette entry, so shapes drawn with paths read as pixel art.
function crisp(c) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data, cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 120) { d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let p = cache.get(key);
    if (!p) {
      let best = Infinity;
      for (const q of PAL) {
        const e = (q[0] - d[i]) ** 2 * 0.3 + (q[1] - d[i + 1]) ** 2 * 0.59 + (q[2] - d[i + 2]) ** 2 * 0.11;
        if (e < best) { best = e; p = q; }
      }
      cache.set(key, p);
    }
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Per-frame version for the fighters: only hardens edges (alpha on/off) so
// they read as pixel art without touching their colors.
export function crispAlpha(c) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = d[i] < 110 ? 0 : 255;
  g.putImageData(img, 0, 0);
}

// Ordered-dither a vertical run of palette colors into an ImageData.
function ditherBand(img, x0, x1, y0, y1, colors) {
  const d = img.data, n = colors.length - 1;
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * n;
    const i = Math.floor(t), f = t - i;
    for (let x = x0; x < x1; x++) {
      const col = colors[Math.min(n, i + (f > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
      const o = (y * img.width + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
}

function blob(g, x, y, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
}

// ---------------- Still backdrop: sky, moon, hills, river, dirt ----------------
function buildBackdrop() {
  const [c, g] = makeLayer(W);
  const img = g.createImageData(LW, LH);
  const sky = ['#070b1c', '#0b1128', '#101a38', '#162348', '#1d2e5a', '#263c70'].map(hexRgb);
  ditherBand(img, 0, LW, 0, Math.round(380 / PIX), sky);
  // Moon halo: dither the sky one step lighter in rings around the moon.
  const d = img.data, mx = MOON.x / PIX, my = MOON.y / PIX;
  for (let y = 0; y < 380 / PIX; y++) for (let x = 0; x < LW; x++) {
    const r = Math.hypot(x - mx, y - my) * PIX;
    const k = 1 - (r - MOON.r) / 90;
    if (k <= 0 || k > 1.2) continue;
    if (k > BAYER[(y & 3) * 4 + (x & 3)] * 1.6) {
      const o = (y * LW + x) * 4;
      const lift = k > 0.75 ? PAL[6] : PAL[5];
      d[o] = lift[0]; d[o + 1] = lift[1]; d[o + 2] = lift[2];
    }
  }
  g.putImageData(img, 0, 0);

  const r = rng(41);
  // Stars.
  for (let i = 0; i < 90; i++) {
    g.fillStyle = r() < 0.2 ? '#f6efd4' : '#324c86';
    g.fillRect(Math.round(r() * LW) * PIX, Math.round(r() * 95) * PIX, PIX, PIX);
  }
  // Full moon with craters and a shaded lower-left edge.
  blob(g, MOON.x, MOON.y, MOON.r, MOON.r, '#e6c2a2');
  blob(g, MOON.x + 6, MOON.y - 6, MOON.r - 6, MOON.r - 6, '#f8e2c6');
  for (const [dx, dy, rr] of [[-16, -10, 11], [14, 12, 8], [-4, 22, 6], [20, -18, 6], [-24, 14, 5], [2, -26, 4], [26, 4, 4]]) {
    blob(g, MOON.x + dx, MOON.y + dy, rr, rr, '#c4977e');
    blob(g, MOON.x + dx + 2, MOON.y + dy + 2, rr * 0.55, rr * 0.55, '#e6c2a2');
  }

  // Two ranges of far mountains and a jungle treeline.
  const ridge = (base, amp, f1, f2, color, edge) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 400);
    for (let x = 0; x <= W; x += 12) g.lineTo(x, base - Math.sin(x * f1) * amp - Math.sin(x * f2 + 2) * amp * 0.4);
    g.lineTo(W, 400); g.fill();
    if (edge) {
      g.fillStyle = edge;
      for (let x = 0; x <= W; x += PIX) {
        const y = base - Math.sin(x * f1) * amp - Math.sin(x * f2 + 2) * amp * 0.4;
        const slope = Math.cos(x * f1) * f1 * amp;
        if (slope > 0.2) g.fillRect(x, y, PIX, PIX);
      }
    }
  };
  ridge(300, 46, 0.007, 0.023, '#131d3c', '#22305a');
  ridge(342, 26, 0.012, 0.041, '#0e1630', '#1a2648');
  g.fillStyle = '#0a1024';
  for (let x = -10; x < W + 10; x += 14) blob(g, x, 372 - r() * 10, 10 + r() * 6, 12 + r() * 8, '#0a1024');
  g.fillRect(0, 372, W, 20);

  // The river behind the village.
  const wimg = g.getImageData(0, 0, LW, LH);
  ditherBand(wimg, 0, LW, Math.round(388 / PIX), Math.round(BANK / PIX), ['#142654', '#0d1a3e'].map(hexRgb));
  g.putImageData(wimg, 0, 0);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.6 ? '#142654' : '#1f3768';
    g.fillRect(Math.round(r() * LW) * PIX, Math.round((392 + r() * 56) / PIX) * PIX, PIX * (2 + Math.floor(r() * 6)), PIX);
  }
  // Moon's reflection, wider toward the near bank.
  for (let y = 392; y < BANK - 2; y += PIX * 2) {
    const t = (y - 392) / (BANK - 392);
    const w = 8 + t * 24 + r() * 8;
    g.fillStyle = t < 0.4 ? (r() < 0.5 ? '#9ea6b4' : '#ddd3b0') : (r() < 0.6 ? '#1f3768' : '#9ea6b4');
    g.fillRect(MOON.x - w / 2 + (r() - 0.5) * 10, y, w, PIX);
  }

  // Near dirt: dithered from the moonlit bank down to dark earth.
  const gimg = g.getImageData(0, 0, LW, LH);
  ditherBand(gimg, 0, LW, Math.round(BANK / PIX), LH, ['#3a2f40', '#2d2434', '#231c2a', '#1a1520'].map(hexRgb));
  g.putImageData(gimg, 0, 0);
  // Bank edge with grass tufts, stones, puddles and scuffs.
  g.fillStyle = '#152230';
  g.fillRect(0, BANK - PIX, W, PIX * 2);
  for (let x = 0; x < W; x += PIX * 2) {
    const h = 1 + Math.floor(r() * 3);
    g.fillStyle = r() < 0.3 ? '#2a4252' : '#1e3040';
    g.fillRect(x, BANK - h * PIX, PIX, h * PIX);
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = BANK + 6 + r() * 80;
    g.fillStyle = r() < 0.5 ? '#4a3e50' : '#1a1520';
    g.fillRect(x, y, PIX * (1 + Math.floor(r() * 3)), PIX);
  }
  for (const [px, py, pw] of [[110, 500, 60], [520, 515, 80], [780, 492, 46]]) {
    blob(g, px, py, pw / 2, 6, '#142654');
    g.fillStyle = '#324c86';
    g.fillRect(px - pw / 4, py - 3, pw / 3, PIX);
  }
  return crisp(c);
}

// ---------------- Parallax village: balete tree, huts, chapel, palm ----------------
function buildVillage() {
  const w = W + PAD * 2;
  const [c, g] = makeLayer(w);
  const X = (x) => x + PAD;
  const r = rng(77);

  // The old balete tree: a twisted mass of strangler-fig trunks under a wide
  // canopy, with a few hanging roots. Moonlight comes from the right.
  const tx = X(TREE.x), cy = 150;
  // Shadowed underside first, then leaf clumps lit along their upper right.
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    blob(g, tx + Math.cos(a) * 160 * d, cy + 20 + Math.sin(a) * 40 * d, 30 + r() * 20, 18 + r() * 10, '#0a1024');
  }
  // Higher clumps first, so each lower clump's lit top edge overlaps the one above.
  const clumps = [];
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    clumps.push({ x: tx + Math.cos(a) * 175 * d, y: cy + Math.sin(a) * 52 * d, rx: 18 + r() * 12, ry: 10 + r() * 6 });
  }
  clumps.sort((p, q) => p.y - q.y);
  for (const { x, y, rx, ry } of clumps) {
    blob(g, x + 3, y - 4, rx, ry, x > tx - 60 ? '#3c4f84' : '#22305a');
    blob(g, x - 1, y + 1, rx, ry, '#131d3c');
  }
  for (let i = 0; i < 200; i++) {
    const a = -Math.PI * 0.5 + (r() - 0.35) * Math.PI * 0.95, d = 0.6 + r() * 0.42;
    g.fillStyle = r() < 0.6 ? '#2e3e6e' : '#3c4f84';
    g.fillRect(tx + Math.cos(a) * 180 * d + 10, cy + Math.sin(a) * 60 * d, PIX * (1 + Math.floor(r() * 2)), PIX);
  }
  // Hanging aerial roots.
  for (let i = 0; i < 16; i++) {
    const x = tx - 150 + r() * 300, top = cy + 30 + r() * 20, len = 40 + r() * (Math.abs(x - tx) < 90 ? 160 : 90);
    g.strokeStyle = r() < 0.6 ? '#0e1630' : '#1a2648'; g.lineWidth = PIX;
    g.beginPath(); g.moveTo(x, top);
    g.quadraticCurveTo(x + (r() - 0.5) * 16, top + len / 2, x + (r() - 0.5) * 10, top + len); g.stroke();
  }
  // Trunk strands, flaring into buttress roots at the base.
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const top = tx - 32 + t * 64, base = tx - 80 + t * 160 + (r() - 0.5) * 16;
    g.strokeStyle = ['#0e1630', '#131d3c', '#1a2648'][i % 3]; g.lineWidth = 12 + r() * 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(top, cy + 30);
    g.bezierCurveTo(top + (r() - 0.5) * 30, 270, top + (base - top) * 0.2, 410, base, BANK + 4); g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const t = i / 5, base = tx - 60 + t * 150;
    g.strokeStyle = '#2e3e6e'; g.lineWidth = PIX;
    g.beginPath(); g.moveTo(tx - 14 + t * 50, cy + 36);
    g.bezierCurveTo(tx - 8 + t * 50, 270, tx - 14 + t * 50 + (base - tx + 14 - t * 50) * 0.2, 410, base + 4, BANK); g.stroke();
  }
  // The dark hollow between the roots, where something lives.
  g.fillStyle = '#060915';
  g.beginPath(); g.moveTo(HOLLOW.x + PAD - 20, BANK); g.lineTo(HOLLOW.x + PAD - 20, HOLLOW.y);
  g.quadraticCurveTo(HOLLOW.x + PAD, HOLLOW.y - 34, HOLLOW.x + PAD + 20, HOLLOW.y); g.lineTo(HOLLOW.x + PAD + 20, BANK); g.fill();

  // Bahay kubo on stilts in the river, with lit windows and reflections.
  const hut = (x0, s, flip) => {
    const x = X(x0), floor = 404 - 10 * s;
    const bw = 120 * s, bh = 52 * s;
    g.fillStyle = '#15101a';
    for (let k = 0; k < 5; k++) g.fillRect(x + 6 + k * (bw - 18) / 4, floor, 6, BANK - floor - 10);
    g.fillStyle = '#211926'; g.fillRect(x - 6, floor - 4, bw + 12, 8);
    g.fillStyle = '#2e2432'; g.fillRect(x, floor - bh, bw, bh);
    for (let yy = floor - bh + 4; yy < floor - 4; yy += PIX * 2) for (let xx = x + ((yy / PIX) % 4 ? 0 : PIX); xx < x + bw - PIX; xx += PIX * 4) {
      g.fillStyle = '#3d3140'; g.fillRect(xx, yy, PIX * 2, PIX);
    }
    g.fillStyle = '#211926'; g.fillRect(x + bw - 8, floor - bh, 8, bh);
    // Thatch roof: dark left slope, moonlit right slope, ragged eave.
    const peakX = x + bw / 2, peakY = floor - bh - 62 * s;
    g.fillStyle = '#3d3140';
    g.beginPath(); g.moveTo(x - 24 * s, floor - bh + 10); g.lineTo(peakX, peakY); g.lineTo(peakX, floor - bh + 10); g.fill();
    g.fillStyle = '#625a76';
    g.beginPath(); g.moveTo(peakX, peakY); g.lineTo(x + bw + 24 * s, floor - bh + 10); g.lineTo(peakX, floor - bh + 10); g.fill();
    g.fillStyle = '#4b4054';
    for (let k = 1; k < 4; k++) {
      const t = k / 4, y = peakY + (floor - bh + 10 - peakY) * t, half = (bw / 2 + 24 * s) * t;
      g.fillRect(peakX - half, y, half * 2, PIX);
    }
    for (let xx = x - 24 * s; xx < x + bw + 24 * s; xx += PIX * 2) {
      g.fillStyle = xx > peakX ? '#4b4054' : '#211926';
      g.fillRect(xx, floor - bh + 10, PIX, PIX * (1 + Math.floor(r() * 3)));
    }
    // Lit window with a cross frame, and its broken reflection below.
    const wx = flip ? x + 18 * s : x + bw - 46 * s, wy = floor - bh + 14 * s;
    g.fillStyle = '#ff8f3a'; g.fillRect(wx, wy, 26 * s, 22 * s);
    g.fillStyle = '#ffc062'; g.fillRect(wx + PIX, wy + PIX, 26 * s - PIX * 2, 22 * s - PIX * 2);
    g.fillStyle = '#15101a';
    g.fillRect(wx + 13 * s - 2, wy, PIX, 22 * s); g.fillRect(wx, wy + 11 * s - 2, 26 * s, PIX);
    for (let y = floor + 14; y < BANK - 6; y += PIX * 3) {
      g.fillStyle = y < floor + 30 ? '#ff8f3a' : '#8a3a28';
      g.fillRect(wx + (r() - 0.5) * 8, y, 26 * s * (0.4 + r() * 0.5), PIX);
    }
  };
  hut(560, 1, false);
  hut(700, 0.8, true);

  // A small stone kapilya (village chapel) with a cross and a warm doorway.
  const kx = X(30), kb = BANK - 4;
  g.fillStyle = '#2a3050'; g.fillRect(kx, kb - 110, 110, 110);
  g.fillStyle = '#383f64'; g.fillRect(kx + 80, kb - 110, 30, 110);
  for (let y = kb - 104; y < kb; y += PIX * 4) for (let x = kx + ((y / PIX) % 8 < 4 ? 0 : 9); x < kx + 108; x += 18) {
    g.fillStyle = x > kx + 80 ? '#4c5680' : '#211926'; g.fillRect(x, y, 14, PIX);
  }
  g.fillStyle = '#211926';
  g.beginPath(); g.moveTo(kx - 12, kb - 108); g.lineTo(kx + 55, kb - 168); g.lineTo(kx + 122, kb - 108); g.fill();
  g.fillStyle = '#383f64';
  g.beginPath(); g.moveTo(kx + 55, kb - 168); g.lineTo(kx + 122, kb - 108); g.lineTo(kx + 55, kb - 108); g.fill();
  g.fillStyle = '#4c5680'; g.fillRect(kx + 51, kb - 204, 8, 40); g.fillRect(kx + 40, kb - 192, 30, 7);
  g.fillStyle = '#6a3c2c'; g.fillRect(kx + 36, kb - 66, 36, 66);
  blob(g, kx + 54, kb - 66, 18, 14, '#6a3c2c');
  g.fillStyle = '#d6532a'; g.fillRect(kx + 42, kb - 60, 24, 60);
  blob(g, kx + 54, kb - 34, 8, 12, '#ffc062');

  // A leaning coconut palm between the tree and the huts.
  const px = X(500), tipX = px + 46, tipY = 150;
  g.strokeStyle = '#0e1630'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(px, BANK); g.quadraticCurveTo(px + 6, 260, tipX, tipY); g.stroke();
  for (let t = 0.1; t < 0.95; t += 0.08) {
    const x = (1 - t) * (1 - t) * px + 2 * (1 - t) * t * (px + 6) + t * t * tipX;
    const y = (1 - t) * (1 - t) * BANK + 2 * (1 - t) * t * 260 + t * t * tipY;
    g.fillStyle = '#22305a'; g.fillRect(x + 1, y, PIX, PIX);
  }
  for (let i = 0; i < 8; i++) {
    const a = (-175 + i * 28) * Math.PI / 180, len = 80 + (i % 2) * 16;
    g.fillStyle = '#0e1630';
    g.beginPath(); g.moveTo(tipX, tipY);
    g.quadraticCurveTo(tipX + Math.cos(a) * len * 0.6, tipY + Math.sin(a) * 30 - 22, tipX + Math.cos(a) * len, tipY + Math.sin(a) * 40 + 30);
    g.quadraticCurveTo(tipX + Math.cos(a) * len * 0.5, tipY + Math.sin(a) * 20 - 2, tipX, tipY); g.fill();
    if (Math.cos(a) > 0) {
      g.fillStyle = '#22305a';
      for (let k = 3; k < 9; k++) {
        const t = k / 9;
        g.fillRect(tipX + Math.cos(a) * len * t, tipY + (Math.sin(a) * 40 + 30) * t * t - 16 * t * (1 - t) - PIX, PIX * 2, PIX);
      }
    }
  }

  // Old wooden grave crosses near the path at both ends.
  for (const [cx, h] of [[150, 46], [190, 34], [830, 40], [880, 52]]) {
    const x = X(cx);
    g.fillStyle = '#211926'; g.fillRect(x, BANK - h, 7, h);
    g.fillRect(x - 10, BANK - h + 10, 27, 6);
    g.fillStyle = '#3d3140'; g.fillRect(x + 4, BANK - h, PIX, h);
    g.fillStyle = '#231c2a'; g.fillRect(x - 12, BANK - 4, 31, 6);
  }
  return crisp(c);
}

// Drifting pixel cloud bands.
let cloudSprite = null;
function cloud() {
  if (cloudSprite) return cloudSprite;
  const c = document.createElement('canvas');
  c.width = 110; c.height = 20;
  const g = c.getContext('2d');
  const r = rng(9);
  for (let i = 0; i < 9; i++) {
    const x = 12 + r() * 86, y = 10 + (r() - 0.5) * 6, rx = 8 + r() * 14;
    blob(g, x, y, rx, 4 + r() * 3, '#1d2e5a');
    blob(g, x + 2, y - 2, rx * 0.7, 2 + r() * 2, '#263c70');
  }
  cloudSprite = crisp(c);
  return cloudSprite;
}

let layers = null;

// camShift: how far the camera has panned from center (screen px).
export function drawPixelArena(g, time, camShift = 0) {
  if (!layers) layers = { backdrop: buildBackdrop(), village: buildVillage() };
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(layers.backdrop, 0, 0, W, H);
  // Clouds drift behind the village, sometimes across the moon.
  for (let i = 0; i < 3; i++) {
    const x = Math.round((((i * 410 + time * (5 + i * 2)) % (W + 400)) - 360) / PIX) * PIX;
    g.drawImage(cloud(), x, 50 + i * 42, 110 * PIX, 20 * PIX);
  }
  // The village layer moves by whole art pixels as the camera pans.
  const offset = Math.round((-PAD + camShift * MID) / PIX);
  g.drawImage(layers.village, offset * PIX, 0, layers.village.width * PIX, H);
  g.imageSmoothingEnabled = smooth;
  const vx = offset * PIX + PAD;   // village layer x shift in screen px

  const px = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(Math.round(x / PIX) * PIX, Math.round(y / PIX) * PIX, w, h); };
  // Twinkling stars.
  const tw = rng(5);
  for (let i = 0; i < 14; i++) {
    const x = tw() * W, y = tw() * 270, ph = tw() * 6;
    if (Math.sin(time * 2.2 + ph * 3) > 0.6) px(x, y, PIX, PIX, '#f6efd4');
  }
  // Moon shimmer on the river.
  for (let i = 0; i < 6; i++) {
    const y = 396 + i * 9, w = 10 + ((time * 7 + i * 13) % 24);
    px(MOON.x - w / 2 + Math.sin(time * 1.7 + i) * 14, y, Math.round(w / PIX) * PIX, PIX, i % 2 ? '#f6efd4' : '#9ea6b4');
  }
  // Two bats crossing the sky now and then.
  for (let i = 0; i < 2; i++) {
    const period = 13 + i * 5, t = ((time + i * 6) % period) / period;
    if (t > 0.45) continue;
    const bx = W + 40 - (t / 0.45) * (W + 80), by = 90 + i * 60 + Math.sin(t * 40) * 8;
    const up = Math.sin(time * 18 + i) > 0;
    px(bx, by, PIX * 2, PIX, '#060915');
    px(bx - PIX * 2, by + (up ? -PIX : PIX), PIX * 2, PIX, '#060915');
    px(bx + PIX * 2, by + (up ? -PIX : PIX), PIX * 2, PIX, '#060915');
  }
  // Something in the balete hollow blinks.
  const blink = (time % 7) < 0.15 || ((time + 3.4) % 11) < 0.12;
  if (!blink) {
    const hx = HOLLOW.x + vx, hy = HOLLOW.y + 4;
    px(hx - 8, hy, PIX, PIX, '#d6532a');
    px(hx + 4, hy, PIX, PIX, '#d6532a');
  }
  // Torches on posts and candles at the graves.
  const flame = (x, y, s, seed) => {
    const f = Math.sin(time * 11 + seed) * 0.5 + Math.sin(time * 17 + seed * 2) * 0.5;
    const h = Math.round((3 + f) * s);
    const glow = g.createRadialGradient(x, y - 6, 2, x, y - 6, 60 * s);
    glow.addColorStop(0, 'rgba(255,160,70,0.28)'); glow.addColorStop(1, 'rgba(255,160,70,0)');
    g.fillStyle = glow; g.fillRect(x - 60 * s, y - 66 * s, 120 * s, 120 * s);
    px(x - PIX, y - h * PIX, PIX * 2, h * PIX, '#d6532a');
    px(x - PIX, y - (h - 1) * PIX, PIX * 2, (h - 1) * PIX, '#ff8f3a');
    px(x - (f > 0 ? 0 : PIX), y - (h - 2) * PIX, PIX, Math.max(1, h - 2) * PIX, '#ffe7a0');
  };
  for (const [tx, seed] of [[260, 1], [700, 4]]) {
    px(tx - 3, BANK - 80, PIX * 2, 84, '#211926');
    px(tx - 9, BANK - 86, PIX * 6, PIX * 2, '#3d3140');
    flame(tx, BANK - 86, 2.4, seed);
  }
  for (const [cx, seed] of [[166, 2], [206, 7], [846, 3], [898, 5]]) {
    const x = cx + vx - PAD + 3;
    px(x, BANK - 8, PIX, PIX * 2, '#ddd3b0');
    flame(x + 1, BANK - 8, 0.8, seed);
  }
  // Fireflies.
  for (let i = 0; i < 14; i++) {
    const x = (i * 137 + Math.sin(time * 0.5 + i) * 40 + time * (6 + i % 4)) % W;
    const y = 250 + ((i * 53) % 190) + Math.sin(time * 1.3 + i * 2) * 15;
    if (Math.sin(time * 3 + i * 1.7) > -0.2) px(x, y, PIX, PIX, '#ffe7a0');
  }
}
