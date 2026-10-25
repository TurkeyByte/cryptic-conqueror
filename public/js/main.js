import { Fighter, PLAYER_MOVES, ASWANG_MOVES, GROUND, overlap } from './fighter.js';
import { Input } from './input.js';
import { AswangBrain } from './brain.js';
import { Observer } from './observer.js';
import { Strategist } from './strategist.js';
import { sfx, unlockAudio, toggleMute } from './audio.js';
import {
  W, H, INTENT_COLORS, drawArena, drawPlayer, drawAswang, drawProjectile, drawShadow,
  drawParticles, drawHud, drawBanner, drawThought, drawControlsHint, drawFog, drawVignette,
} from './render.js';

const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;

const canvas = document.getElementById('game');
const g = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
new ResizeObserver(resize).observe(canvas);
resize();

const input = new Input();
input.attachMouse(canvas);
const player = new Fighter('player', { maxHp: 100, walkSpeed: 250, moves: PLAYER_MOVES });
const aswang = new Fighter('aswang', { maxHp: 120, walkSpeed: 190, moves: ASWANG_MOVES });
const brain = new AswangBrain();
const observer = new Observer();
const strategist = new Strategist({ onPlan: applyPlan });

const game = {
  mode: 'title', // title | intro | fight | roundEnd | over
  paused: false,
  round: 1,
  timer: ROUND_TIME,
  score: { player: 0, aswang: 0 },
  hitstop: 0,
  slowmo: 0,
  shake: 0,
  modeT: 0,
  banner: null,
  thought: null,
  particles: [],
  projectiles: [],
  shownP: 1,
  shownA: 1,
  buffer: null,
  planTrail: [],
  time: 0,
};

// ---------------- Nemotron plan ----------------
function applyPlan(s) {
  observer.closePlan(brain.intent, brain.focus);
  observer.newWindow();
  const changed = s.intent !== brain.intent || s.focus.join() !== brain.focus.join();
  brain.setPlan(s.intent, s.focus);
  game.planTrail.push(s.intent);
  game.lastRead = s.observe;
  game.thought = {
    head: `${changed ? '⟳ ' : '✓ '}${s.intent}${s.focus.length ? ' · ' + s.focus.map((f) => f.replace(/_/g, ' ')).join(' · ') : ''}`,
    taunt: s.taunt ? `“${s.taunt}”` : '',
    color: INTENT_COLORS[s.intent],
    changed,
    t: 3.2,
  };
  if (changed) sfx.adapt();
}

const telemetry = () => observer.telemetry({
  round: game.round, roundTime: game.timer, player, aswang, score: game.score, intent: brain.intent, focus: brain.focus,
});

// ---------------- Match flow ----------------
function startMatch() {
  unlockAudio();
  game.score = { player: 0, aswang: 0 };
  game.round = 1;
  game.planTrail = [];
  game.lastRead = '';
  observer.matchReset();
  brain.setPlan('INSTINCT', []);
  strategist.newMatch();
  for (const id of ['title', 'over', 'pause']) $(id).hidden = true;
  startRound();
}

function startRound() {
  player.reset(300, 1);
  aswang.reset(660, -1);
  brain.reset();
  game.timer = ROUND_TIME;
  game.projectiles = [];
  game.particles = [];
  game.shownP = game.shownA = 1;
  game.mode = 'intro';
  game.modeT = 0;
  game.buffer = null;
  // Show the controls reminder for the first stretch of the first round.
  game.hintT = game.round === 1 ? 20 : 0;
  game.banner = { text: `ROUND ${game.round}`, sub: game.round === 1 ? 'The Aswang is watching how you fight.' : `It remembers. Current mind: ${brain.intent}`, color: '#f2e6d0' };
  sfx.roundStart();
}

function endRound(winner, reason) {
  game.mode = 'roundEnd';
  game.modeT = 0;
  if (winner) game.score[winner]++;
  const w = winner === 'player' ? player : winner === 'aswang' ? aswang : null;
  if (w && w.hp > 0) w.setState('win');
  game.slowmo = reason === 'ko' ? 0.9 : 0;
  if (reason === 'ko') { game.flash = 0.35; game.zoom = 0.07; }
  game.banner = reason === 'ko'
    ? { text: 'K.O.', sub: winner === 'player' ? 'Dakila stands.' : 'The Aswang feeds tonight…', color: winner === 'player' ? '#e0b040' : '#8fd16a' }
    : { text: 'TIME', sub: winner ? (winner === 'player' ? 'Dakila takes the round.' : 'The Aswang takes the round.') : 'Draw.', color: '#f2e6d0' };
  if (winner === 'player') sfx.win(); else sfx.lose();
  // Let Nemotron review the finished round so it can adapt before the next one.
  if (Math.max(game.score.player, game.score.aswang) < ROUNDS_TO_WIN) strategist.requestNow(telemetry());
}

function endMatch() {
  game.mode = 'over';
  const won = game.score.player > game.score.aswang;
  $('over-title').textContent = won ? 'PANALO!' : 'TALO…';
  $('over-title').className = won ? 'win' : 'lose';
  $('over-sub').textContent = won ? 'You held the line until dawn. (Victory!)' : 'The Aswang learned your ways. (Defeat.)';
  const trail = game.planTrail.length ? ['INSTINCT', ...game.planTrail] : [];
  const compact = trail.filter((t, i) => i === 0 || t !== trail[i - 1]);
  $('over-trail').textContent = compact.length > 1
    ? compact.join(' → ')
    : strategist.status === 'offline' ? 'Nemotron was offline: the Aswang fought on instinct only.' : 'No strategy changes this match.';
  $('over-plans').textContent = String(game.planTrail.length);
  $('over-read').textContent = game.lastRead || '—';
  $('over').hidden = false;
}

// ---------------- Effects ----------------
function sparks(x, y, color, n = 12, speed = 380) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    game.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.3, life: 0.3, color });
  }
  game.particles.push({ kind: 'ring', x, y, r: 40, t: 0.25, life: 0.25, color });
  game.particles.push({ kind: 'star', x, y, vx: 0, vy: 0, r: n > 12 ? 46 : 30, rot: Math.random(), t: 0.13, life: 0.13, color: '#fffbe8' });
}
function dust(x, n = 6) {
  for (let i = 0; i < n; i++) {
    game.particles.push({ kind: 'dot', x: x + (Math.random() - 0.5) * 30, y: GROUND - 2, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 60, t: 0.5, life: 0.5, r: 4 + Math.random() * 4, color: 'rgba(120,90,90,0.6)' });
  }
}

// ---------------- Combat ----------------
function resolve(att, def, who) {
  const hb = att.hitbox();
  if (!hb || !def.vulnerable) return;
  if (!overlap(hb, def.hurtbox())) return;
  const m = att.move;
  if (m.grab && def.airborne) return;
  att.hasHit = true;
  const dir = att.facing;
  const px = def.x - dir * 14;
  const py = Math.max(def.y - 110, Math.min(def.y - 30, hb.y + hb.h / 2));
  const blocking = (def.state === 'guard' || def.state === 'blockstun') && !def.airborne && def.facing === -dir && !m.grab;
  if (blocking) {
    def.blockHit(m, dir);
    att.vx = -dir * 90;
    game.hitstop = 0.04;
    sparks(px, py, '#cfe8ff', 6, 220);
    sfx.block();
    observer.contact(who, att.moveName, 'blocked');
    if (def === aswang) brain.onBlocked();
    return;
  }
  const wasAir = def.airborne;
  def.takeHit(m, dir, wasAir);
  game.hitstop = m.dmg >= 11 ? 0.11 : 0.07;
  game.shake = m.dmg >= 11 ? 0.25 : 0.12;
  game.zoom = m.dmg >= 11 ? 0.045 : 0.02;
  if (m.dmg >= 11) game.flash = 0.12;
  sparks(px, py, who === 'player' ? '#ffe39a' : '#ff6a6a', m.dmg >= 11 ? 18 : 11);
  (who === 'player' ? sfx.stickHit : sfx.clawHit)();
  observer.contact(who, att.moveName, 'hit', m.dmg);
}

function updateProjectiles(dt) {
  for (const pr of game.projectiles) {
    pr.x += pr.vx * dt;
    pr.life -= dt;
    const box = { x: pr.x - 10, y: pr.y - 10, w: 20, h: 20 };
    if (player.vulnerable && overlap(box, player.hurtbox())) {
      pr.life = 0;
      const dir = Math.sign(pr.vx);
      const m = ASWANG_MOVES.spit;
      const hitM = { ...m, knock: 160, hitstun: 0.3, blockstun: 0.18 };
      if ((player.state === 'guard' || player.state === 'blockstun') && player.facing === -dir) {
        player.blockHit(hitM, dir);
        sparks(pr.x, pr.y, '#d8ff9a', 6, 200);
        sfx.block();
        observer.contact('aswang', 'spit', 'blocked');
      } else {
        player.takeHit(hitM, dir, player.airborne);
        game.hitstop = 0.06;
        game.shake = 0.12;
        sparks(pr.x, pr.y, '#b6ff6a', 14);
        sfx.clawHit();
        observer.contact('aswang', 'spit', 'hit', m.dmg);
      }
    }
  }
  game.projectiles = game.projectiles.filter((p) => p.life > 0 && p.x > -40 && p.x < W + 40);
}

function handleEvents(f, isPlayer) {
  for (const e of f.events) {
    if (isPlayer) observer.playerEvent(e); else observer.aswangEvent(e);
    if (e.type === 'sound') sfx[e.name]?.();
    if (e.type === 'jump' && isPlayer) sfx.jump();
    if (e.type === 'dash') { sfx.dash(); dust(f.x, 5); }
    if (e.type === 'land') dust(f.x, 5);
    if (e.type === 'down') { sfx.thud(); dust(f.x, 10); game.shake = Math.max(game.shake, 0.15); }
    if (e.type === 'projectile') {
      game.projectiles.push({ x: f.x + f.facing * 40, y: f.y - 100, vx: f.facing * 400, life: 3 });
    }
  }
  f.events.length = 0;
}

// ---------------- Player control ----------------
function controlPlayer() {
  const s = input.state, p = input.pressed;
  // Buffer button presses briefly so inputs during recovery aren't lost.
  for (const a of ['dash', 'jump', 'light', 'heavy', 'thrust']) if (p[a]) game.buffer = { a, t: 0.14 };
  const dir = (s.right ? 1 : 0) - (s.left ? 1 : 0);
  const b = game.buffer;
  if (b) {
    let done = false;
    const air = player.state === 'jump';
    if (b.a === 'dash') done = player.dash(dir || -player.facing);
    else if (b.a === 'jump') done = player.jump(dir);
    else if (air) done = player.attack('lusob');
    else done = player.attack({ light: 'witik', heavy: 'redonda', thrust: 'sungkite' }[b.a]);
    if (done) game.buffer = null;
  }
  player.guard(s.guard);
  player.walk(s.guard ? 0 : dir);
}

function faceEachOther() {
  const d = Math.sign(aswang.x - player.x) || 1;
  if (player.free && !player.airborne) player.facing = d;
  if (aswang.free && !aswang.airborne) aswang.facing = -d;
}

function separate() {
  if (player.state === 'ko' || aswang.state === 'ko') return;
  const dx = aswang.x - player.x;
  const min = 46;
  if (Math.abs(dx) < min && Math.abs(player.y - aswang.y) < 90) {
    const push = (min - Math.abs(dx)) / 2;
    const s = Math.sign(dx) || 1;
    player.x -= s * push;
    aswang.x += s * push;
  }
}

// ---------------- Main update ----------------
function update(dt) {
  game.time += dt;
  input.update();
  game.thought && (game.thought.t -= dt);
  game.shake = Math.max(0, game.shake - dt);
  game.zoom = Math.max(0, (game.zoom || 0) - dt * 0.2);
  game.flash = Math.max(0, (game.flash || 0) - dt);
  recordGhosts(player, dt);
  recordGhosts(aswang, dt);
  for (const p of game.particles) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
  game.particles = game.particles.filter((p) => p.t > 0);
  game.shownP = Math.max(player.hp / player.maxHp, game.shownP - dt * 0.35);
  game.shownA = Math.max(aswang.hp / aswang.maxHp, game.shownA - dt * 0.35);

  if (game.mode === 'title' || game.mode === 'over') {
    // Idle animation behind menus.
    player.update(dt); aswang.update(dt);
    player.events.length = aswang.events.length = 0;
    return;
  }

  game.modeT += dt;
  if (game.mode === 'intro') {
    faceEachOther();
    player.update(dt); aswang.update(dt);
    player.events.length = aswang.events.length = 0;
    if (game.modeT > 1.6) {
      game.mode = 'fight';
      game.banner = { text: 'LABAN!', sub: '', color: '#e0b040', t: 0.7 };
      game.modeT = 0;
    }
    return;
  }

  if (game.hitstop > 0) { game.hitstop -= dt; return; }
  if (game.slowmo > 0) { game.slowmo -= dt; dt *= 0.35; }

  if (game.mode === 'fight') {
    if (game.banner && (game.banner.t -= dt) <= 0) game.banner = null;
    game.timer = Math.max(0, game.timer - dt);
    game.hintT = Math.max(0, game.hintT - dt);
    if (game.buffer && (game.buffer.t -= dt) <= 0) game.buffer = null;
    controlPlayer();
    faceEachOther();
    brain.update(dt, aswang, player, game.projectiles);
  } else {
    player.walk(0); aswang.walk(0);
    player.guard(false); aswang.guard(false);
  }

  player.update(dt);
  aswang.update(dt);
  separate();
  if (game.mode === 'fight') {
    resolve(player, aswang, 'player');
    resolve(aswang, player, 'aswang');
    updateProjectiles(dt);
  }
  handleEvents(player, true);
  handleEvents(aswang, false);

  if (game.mode === 'fight') {
    observer.tick(dt, player, aswang);
    strategist.tick(dt, telemetry);
    if (player.hp <= 0 || aswang.hp <= 0) {
      endRound(player.hp > 0 ? 'player' : aswang.hp > 0 ? 'aswang' : null, 'ko');
    } else if (game.timer <= 0) {
      const pf = player.hp / player.maxHp, af = aswang.hp / aswang.maxHp;
      endRound(pf > af ? 'player' : af > pf ? 'aswang' : null, 'time');
    }
  } else if (game.mode === 'roundEnd' && game.modeT > 3) {
    if (Math.max(game.score.player, game.score.aswang) >= ROUNDS_TO_WIN) endMatch();
    else { game.round++; startRound(); }
  }
}

// ---------------- Draw ----------------
// Afterimages for fast movement: dashes, lunges, leaps.
function recordGhosts(f, dt) {
  f.ghosts = (f.ghosts || []).filter((gh) => (gh.t -= dt) > 0);
  const fast = f.state === 'dash' || f.state === 'leap' || (f.state === 'attack' && f.move?.lunge && f.phase !== 'startup');
  if (fast) f.ghosts.push({ x: f.x, y: f.y, t: 0.16 });
}

// Fighters normally draw straight to the canvas. Only while one is flashing
// from a hit or leaving afterimages is it drawn to a small layer around it,
// which is then tinted white and/or stamped at its recent positions.
const BOX = { left: 230, up: 340, w: 460, h: 380 };
const layer = document.createElement('canvas');
const lg = layer.getContext('2d');
function drawFighter(f, paint) {
  if (!(f.flash > 0) && !f.ghosts?.length) { paint(g); return; }
  const sx = Math.min(canvas.width / W, 2);
  const lw = Math.ceil(BOX.w * sx), lh = Math.ceil(BOX.h * sx);
  if (layer.width !== lw || layer.height !== lh) { layer.width = lw; layer.height = lh; }
  const rx = f.x - BOX.left, ry = f.y - BOX.up;
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.clearRect(0, 0, lw, lh);
  lg.setTransform(sx, 0, 0, sx, -rx * sx, -ry * sx);
  paint(lg);
  if (f.flash > 0) {
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = 'source-atop';
    lg.fillStyle = `rgba(255,255,255,${Math.min(0.75, f.flash * 6)})`;
    lg.fillRect(0, 0, lw, lh);
    lg.globalCompositeOperation = 'source-over';
  }
  for (const gh of f.ghosts || []) {
    g.globalAlpha = (gh.t / 0.16) * 0.28;
    g.drawImage(layer, gh.x - BOX.left, gh.y - BOX.up, BOX.w, BOX.h);
  }
  g.globalAlpha = 1;
  g.drawImage(layer, rx, ry, BOX.w, BOX.h);
}

function draw() {
  g.save();
  if (game.shake > 0) g.translate((Math.random() - 0.5) * game.shake * 40, (Math.random() - 0.5) * game.shake * 30);
  if (game.zoom > 0) {
    // Camera punch-in on big hits, centered between the fighters.
    const cx = (player.x + aswang.x) / 2, cy = GROUND - 90;
    g.translate(cx, cy);
    g.scale(1 + game.zoom, 1 + game.zoom);
    g.translate(-cx, -cy);
  }
  drawArena(g, game.time);
  drawShadow(g, player);
  drawShadow(g, aswang);
  const eye = INTENT_COLORS[brain.intent];
  const aura = game.thought?.changed ? Math.max(0, (game.thought.t - 1.8) / 1.4) : 0;
  const paintA = (c) => drawAswang(c, aswang, game.time, eye, aura);
  const paintP = (c) => drawPlayer(c, player, game.time);
  // Draw whoever is attacking on top.
  if (aswang.state === 'attack') { drawFighter(player, paintP); drawFighter(aswang, paintA); }
  else { drawFighter(aswang, paintA); drawFighter(player, paintP); }
  for (const pr of game.projectiles) drawProjectile(g, pr, game.time);
  drawFog(g, game.time);
  drawParticles(g, game.particles);
  g.restore();
  drawVignette(g);
  if (game.flash > 0) {
    g.fillStyle = `rgba(255,245,230,${Math.min(0.5, game.flash * 1.6)})`;
    g.fillRect(0, 0, W, H);
  }

  if (game.mode !== 'title') {
    drawHud(g, { player, aswang, shownP: game.shownP, shownA: game.shownA, round: game.round, timer: game.timer, score: game.score, intent: brain.intent, focus: brain.focus });
    if (game.mode === 'fight') drawThought(g, aswang, game.thought);
    if ((game.mode === 'intro' || game.mode === 'fight') && game.hintT > 0) drawControlsHint(g, Math.min(1, game.hintT / 2));
  }
  if (game.banner && (game.mode === 'intro' || game.mode === 'fight' || game.mode === 'roundEnd')) {
    const a = game.mode === 'fight' ? Math.min(1, game.banner.t * 3) : Math.min(1, game.modeT * 4);
    drawBanner(g, game.banner.text, game.banner.sub, a, game.banner.color);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!game.paused) update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------------- UI wiring ----------------
function setPaused(p) {
  if (!['intro', 'fight', 'roundEnd'].includes(game.mode)) return;
  game.paused = p;
  $('pause').hidden = !p;
}

$('start').addEventListener('click', startMatch);
$('rematch').addEventListener('click', startMatch);
$('resume').addEventListener('click', () => setPaused(false));
$('quit').addEventListener('click', () => { setPaused(false); game.mode = 'title'; $('title').hidden = false; });
$('mute').addEventListener('click', () => { $('mute').textContent = toggleMute() ? '🔇 Sound off' : '🔊 Sound on'; });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!game.paused);
  if (e.code === 'KeyM') $('mute').click();
  if (e.code === 'Enter' && (game.mode === 'title' || game.mode === 'over')) startMatch();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// Title screen idle pose.
player.reset(300, 1);
aswang.reset(660, -1);
strategist.checkHealth().then((s) => {
  $('title-ai').textContent = s === 'ready'
    ? `Nemotron linked (${strategist.model}). The Aswang will study you.`
    : 'Nemotron offline (no API key on the server). The Aswang will fight on instinct only.';
  $('title-ai').dataset.state = s;
});
requestAnimationFrame(frame);

// Exposed for automated smoke tests only; has no effect on gameplay.
window.__bantay = { game, player, aswang, brain, observer, strategist };
