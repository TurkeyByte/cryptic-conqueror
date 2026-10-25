// Deterministic fighter physics, move frame data, and state machine.
// Both the player (via input) and the Aswang (via its brain) drive fighters
// through the same small action API: walk / jump / guard / dash / attack / leapBack.

export const GROUND = 470;
export const LEFT_WALL = 50;
export const RIGHT_WALL = 910;
const GRAVITY = 2400;

// reach: [near, far] in front of the fighter; y: [top, bottom] relative to the feet.
export const PLAYER_MOVES = {
  witik:    { startup: 0.07, active: 0.08, recovery: 0.16, dmg: 5,  reach: [10, 80],  y: [-125, -55], knock: 140, hitstun: 0.3,  blockstun: 0.18, sound: 'swing' },
  redonda:  { startup: 0.17, active: 0.17, recovery: 0.3,  dmg: 11, reach: [-10, 95], y: [-140, -35], knock: 360, hitstun: 0.42, blockstun: 0.26, sound: 'heavySwing' },
  sungkite: { startup: 0.13, active: 0.1,  recovery: 0.38, dmg: 8,  reach: [30, 128], y: [-115, -70], knock: 240, hitstun: 0.34, blockstun: 0.2,  lunge: 560, sound: 'swing' },
  // Low sweep from a crouch: knocks down, and a standing guard can't block it.
  walis:    { startup: 0.1,  active: 0.1,  recovery: 0.32, dmg: 7,  reach: [5, 100],  y: [-45, 5],    knock: 200, hitstun: 0.45, blockstun: 0.2,  low: true, knockdown: true, sound: 'swing' },
  lusob:    { startup: 0.06, active: 0.6,  recovery: 0.12, dmg: 9,  reach: [0, 82],   y: [-85, 15],   knock: 220, hitstun: 0.4,  blockstun: 0.2,  air: true, sound: 'swing' },
};

export const ASWANG_MOVES = {
  claw:   { startup: 0.19, active: 0.1,  recovery: 0.26, dmg: 8,  reach: [10, 92], y: [-150, -45], knock: 200, hitstun: 0.32, blockstun: 0.2, sound: 'heavySwing' },
  pounce: { startup: 0.22, active: 0.28, recovery: 0.46, dmg: 12, reach: [0, 84],  y: [-125, -25], knock: 340, hitstun: 0.45, blockstun: 0.25, lunge: 660, knockdown: true, sound: 'hiss' },
  rising: { startup: 0.07, active: 0.18, recovery: 0.42, dmg: 13, reach: [-20, 100], y: [-280, -50], knock: 220, hitstun: 0.5, blockstun: 0.2, knockdown: true, hop: 520, sound: 'heavySwing' },
  spit:   { startup: 0.28, active: 0.05, recovery: 0.34, dmg: 7,  projectile: true, sound: 'spit' },
  grab:   { startup: 0.13, active: 0.09, recovery: 0.46, dmg: 11, reach: [0, 74],  y: [-130, -20], grab: true, knock: 280, hitstun: 0.6, knockdown: true, sound: 'hiss' },
};

export class Fighter {
  constructor(kind, { maxHp, walkSpeed, moves }) {
    this.kind = kind;
    this.maxHp = maxHp;
    this.walkSpeed = walkSpeed;
    this.moves = moves;
    this.reset(0, 1);
  }

  reset(x, facing) {
    this.x = x;
    this.y = GROUND;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.t = 0;          // time in current state
    this.anim = 0;       // free-running animation clock
    this.move = null;
    this.moveName = '';
    this.hasHit = false;
    this.stun = 0;
    this.inv = 0;
    this.dashCd = 0;
    this.knockdown = false;
    this.walkDir = 0;
    this.events = [];
    this.flash = 0;
    this.trail = [];
  }

  get airborne() { return this.y < GROUND - 0.5; }
  get phase() {
    if (this.state !== 'attack') return '';
    const m = this.move;
    if (this.t < m.startup) return 'startup';
    if (this.t < m.startup + m.active) return 'active';
    return 'recovery';
  }
  // The player's guard is a crouching block, which ducks under high attacks.
  get crouching() {
    if (this.kind !== 'player') return false;
    return this.state === 'guard' || (this.state === 'blockstun' && this.lowBlock) || (this.state === 'attack' && this.moveName === 'walis');
  }
  get free() { return this.state === 'idle' || this.state === 'walk' || this.state === 'guard'; }
  get recovering() { return this.state === 'attack' && this.phase === 'recovery'; }
  get vulnerable() { return this.inv <= 0 && !['down', 'ko', 'getup'].includes(this.state); }

  setState(s) { this.state = s; this.t = 0; }

  // ---- Action API ----
  walk(dir) {
    if (!this.free || this.airborne) return;
    this.walkDir = dir;
    if (this.state === 'guard') return;
    this.state = dir ? 'walk' : 'idle';
  }
  guard(on) {
    if (on && this.free && !this.airborne) { if (this.state !== 'guard') this.setState('guard'); }
    else if (!on && this.state === 'guard') this.setState('idle');
  }
  jump(dir = 0) {
    if (!this.free || this.airborne) return false;
    this.vy = -820;
    this.vx = dir * this.walkSpeed * 1.05;
    this.setState('jump');
    this.events.push({ type: 'jump' });
    return true;
  }
  leapBack() {
    if (!this.free || this.airborne) return false;
    this.vy = -620;
    this.vx = -this.facing * 430;
    this.setState('leap');
    this.events.push({ type: 'leap' });
    return true;
  }
  dash(dir) {
    if (!this.free || this.airborne || this.dashCd > 0) return false;
    this.vx = dir * 640;
    this.inv = 0.17;
    this.dashCd = 0.6;
    this.setState('dash');
    this.events.push({ type: 'dash', toward: dir === this.facing });
    return true;
  }
  attack(name) {
    const m = this.moves[name];
    if (!m) return false;
    const inAir = this.state === 'jump' || this.state === 'leap';
    if (m.air ? !inAir : (!this.free || this.airborne)) return false;
    this.move = m;
    this.moveName = name;
    this.hasHit = false;
    this.setState('attack');
    if (!m.air) this.vx = 0;
    this.events.push({ type: 'attack', move: name, air: !!m.air });
    return true;
  }

  hitbox() {
    if (this.state !== 'attack' || this.phase !== 'active' || this.hasHit || !this.move.reach) return null;
    const [n, f] = this.move.reach;
    const [top, bot] = this.move.y;
    const x1 = this.x + this.facing * n;
    const x2 = this.x + this.facing * f;
    return { x: Math.min(x1, x2), y: this.y + top, w: Math.abs(x2 - x1), h: bot - top };
  }

  hurtbox() {
    const h = this.state === 'down' || this.state === 'ko' ? 40 : this.crouching ? 78 : this.state === 'guard' ? 105 : 118;
    return { x: this.x - 24, y: this.y - h, w: 48, h };
  }

  takeHit(m, dir, wasAirborne) {
    this.hp = Math.max(0, this.hp - m.dmg);
    this.flash = 0.12;
    this.facing = -dir;
    this.vx = dir * m.knock;
    this.knockdown = !!m.knockdown || wasAirborne || this.hp <= 0;
    if (this.knockdown) this.vy = -380;
    this.stun = m.hitstun;
    this.move = null;
    this.setState(this.hp <= 0 ? 'ko' : 'hurt');
  }

  blockHit(m, dir) {
    this.lowBlock = this.state === 'guard';
    this.stun = m.blockstun;
    this.vx = dir * m.knock * 0.55;
    this.setState('blockstun');
  }

  update(dt) {
    this.anim += dt;
    this.t += dt;
    this.inv = Math.max(0, this.inv - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.flash = Math.max(0, this.flash - dt);

    switch (this.state) {
      case 'idle':
      case 'walk':
        this.vx = this.walkDir * this.walkSpeed;
        break;
      case 'guard':
        this.vx = 0;
        break;
      case 'dash':
        this.vx *= Math.pow(0.02, dt);
        if (this.t > 0.24) this.setState('idle');
        break;
      case 'attack': {
        const m = this.move;
        const ph = this.phase;
        if (ph === 'active' && this.t - dt < m.startup) {
          if (m.sound) this.events.push({ type: 'sound', name: m.sound });
          if (m.projectile) this.events.push({ type: 'projectile', move: this.moveName });
          if (m.lunge) this.vx = this.facing * m.lunge;
          if (m.hop) this.vy = -m.hop;
        }
        if (m.lunge && ph !== 'startup') this.vx *= Math.pow(0.01, dt);
        if (m.air) {
          // Air attacks stay active until landing, then a short landing recovery.
          if (!this.airborne && this.t > m.startup) {
            if (!this.hasHit) this.events.push({ type: 'whiff', move: this.moveName });
            this.move = null;
            this.setState('land');
          }
          break;
        }
        if (!this.airborne && !m.lunge) this.vx *= Math.pow(0.001, dt);
        if (this.t >= m.startup + m.active + m.recovery) {
          if (!this.hasHit) this.events.push({ type: 'whiff', move: this.moveName });
          this.move = null;
          this.setState(this.airborne ? 'jump' : 'idle');
        }
        break;
      }
      case 'land':
        this.vx = 0;
        if (this.t > 0.12) this.setState('idle');
        break;
      case 'hurt':
      case 'blockstun':
        this.vx *= Math.pow(0.02, dt);
        if (this.t >= this.stun && !(this.knockdown && this.state === 'hurt' && this.airborne)) {
          if (this.state === 'hurt' && this.knockdown) { this.setState('down'); this.events.push({ type: 'down' }); }
          else this.setState('idle');
        }
        break;
      case 'down':
        this.vx *= Math.pow(0.001, dt);
        if (this.t > 0.6) { this.setState('getup'); this.inv = 0.4; }
        break;
      case 'getup':
        if (this.t > 0.32) { this.setState('idle'); this.knockdown = false; }
        break;
      case 'ko':
        this.vx *= Math.pow(0.05, dt);
        break;
    }

    // Physics.
    if (this.airborne || this.vy < 0) this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y >= GROUND) {
      if (this.vy > 300) this.events.push({ type: 'land' });
      this.y = GROUND;
      this.vy = 0;
      if (this.state === 'jump' || this.state === 'leap') { this.vx = 0; this.setState('land'); }
    }
    if (this.x < LEFT_WALL) { this.x = LEFT_WALL; if (this.vx < 0) this.vx = 0; }
    if (this.x > RIGHT_WALL) { this.x = RIGHT_WALL; if (this.vx > 0) this.vx = 0; }
  }
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
