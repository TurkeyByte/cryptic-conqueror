// The Aswang's moment-to-moment AI. Fully deterministic game code: it reacts to
// what it sees using a tuning profile. Nemotron only chooses WHICH profile
// (intent) and which counter-measures (focus) are active; it never presses buttons.

// Per-decision probabilities and spacing for each tactical intent.
const BASE = {
  think: 0.24,      // seconds between decisions (reaction time)
  prefDist: 130,    // spacing it tries to hold
  antiAir: 0.12,    // chance to answer a jump-in with the rising claw
  punish: 0.25,     // chance to punish a whiffed attack
  punishDash: 0.1,
  grab: 0.08,       // chance to grab a guarding player
  guard: 0.15,      // chance to guard when the player starts an attack
  attack: 0.35,     // chance to attack when in range during neutral
  pounce: 0.3,
  spit: 0.2,
  leapBack: 0.05,
  feint: 0,
  walkSpeed: 1,
};

export const PROFILES = {
  INSTINCT:   {},
  AGGRESSIVE: { prefDist: 80, attack: 0.6, pounce: 0.5, guard: 0.05, think: 0.19, walkSpeed: 1.2 },
  DEFENSIVE:  { prefDist: 200, guard: 0.55, attack: 0.15, punish: 0.6, leapBack: 0.15, spit: 0.3 },
  COUNTER:    { prefDist: 145, guard: 0.45, punish: 0.75, antiAir: 0.4, punishDash: 0.4, attack: 0.15 },
  ZONE:       { prefDist: 330, spit: 0.65, leapBack: 0.4, attack: 0.2, pounce: 0.1 },
  BAIT:       { prefDist: 160, feint: 0.55, punish: 0.85, attack: 0.15, guard: 0.3 },
  PRESSURE:   { prefDist: 72, attack: 0.55, grab: 0.35, think: 0.17, pounce: 0.25, guard: 0.1, walkSpeed: 1.15 },
  RETREAT:    { prefDist: 320, leapBack: 0.5, guard: 0.45, spit: 0.35, attack: 0.1 },
};

const FOCUS = {
  ANTI_AIR:       (p) => { p.antiAir = Math.max(p.antiAir, 0.88); },
  PUNISH_WHIFF:   (p) => { p.punish = Math.max(p.punish, 0.9); },
  PUNISH_DASH:    (p) => { p.punishDash = Math.max(p.punishDash, 0.8); },
  GRAB_GUARD:     (p) => { p.grab = Math.max(p.grab, 0.75); },
  KEEP_DISTANCE:  (p) => { p.prefDist = Math.max(p.prefDist + 100, 260); p.leapBack = Math.max(p.leapBack, 0.35); p.spit = Math.max(p.spit, 0.4); },
  CLOSE_DISTANCE: (p) => { p.prefDist = Math.min(p.prefDist, 75); p.pounce = Math.max(p.pounce, 0.55); },
  GUARD_MORE:     (p) => { p.guard = Math.max(p.guard, 0.7); },
};

export function buildProfile(intent, focus = []) {
  const p = { ...BASE, ...(PROFILES[intent] || {}) };
  for (const f of focus) FOCUS[f]?.(p);
  return p;
}

export class AswangBrain {
  constructor() {
    this.setPlan('INSTINCT', []);
    this.reset();
  }

  reset() {
    this.clock = 0;
    this.guardT = 0;
    this.spitCd = 0;
    this.feintT = 0;
    this.riposte = false;
    this.wander = 0;
    this.attackCd = 0;
  }

  setPlan(intent, focus) {
    this.intent = intent;
    this.focus = focus;
    this.p = buildProfile(intent, focus);
  }

  // Blocking a hit while countering sets up an immediate riposte.
  onBlocked() {
    this.riposte = this.intent === 'COUNTER' || this.intent === 'DEFENSIVE';
    this.guardT = 0;
  }

  // Called every frame.
  update(dt, me, foe, projectiles) {
    const p = this.p;
    this.clock -= dt;
    this.spitCd = Math.max(0, this.spitCd - dt);
    this.feintT = Math.max(0, this.feintT - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    me.walkSpeed = 190 * p.walkSpeed;

    if (this.guardT > 0) {
      this.guardT -= dt;
      if (this.guardT <= 0) me.guard(false);
    }

    // Riposte: after blocking a hit, strike back as soon as blockstun ends.
    if (this.riposte && me.free) {
      this.riposte = false;
      if (Math.abs(foe.x - me.x) < 100) { me.attack('claw'); return; }
    }

    if (me.state === 'attack' && me.t < dt * 1.5) {
      // Breathe between attacks so it can't chain claws endlessly; aggressive intents breathe less.
      this.attackCd = 0.3 + (1 - p.attack) * 0.6;
    }
    if (!me.free || this.clock > 0) return;
    this.clock = p.think * (0.75 + Math.random() * 0.5);

    const dist = Math.abs(foe.x - me.x);
    const toward = Math.sign(foe.x - me.x) || me.facing;
    const roll = (chance) => Math.random() < chance;
    const fp = foe.phase;

    // 1. Jump-in: the rising claw beats aerial attacks.
    if (foe.airborne && foe.state !== 'hurt' && dist < 175) {
      if (roll(p.antiAir)) { me.guard(false); me.attack('rising'); return; }
    }
    // 2. Punish a missed attack while the player recovers.
    if ((foe.recovering || foe.state === 'land') && dist < 190) {
      if (roll(p.punish)) { me.guard(false); me.attack(dist < 95 ? 'claw' : 'pounce'); return; }
    }
    // 3. Punish a dash.
    if (foe.state === 'dash' && dist < 220) {
      if (roll(p.punishDash)) { me.guard(false); me.attack(dist < 95 ? 'claw' : 'pounce'); return; }
    }
    // 4. Grab a turtling player.
    if (foe.state === 'guard' && dist < 80) {
      if (roll(p.grab)) { me.guard(false); me.attack('grab'); return; }
    }
    // 5. Guard against an incoming attack.
    if (foe.state === 'attack' && fp === 'startup' && dist < 150 && !foe.move?.air) {
      if (roll(p.guard)) { me.walk(0); me.guard(true); this.guardT = 0.45; return; }
    }
    // 6. Leap away when crowded.
    if (dist < 90 && roll(p.leapBack)) { me.leapBack(); return; }

    // 7. Neutral game: hold preferred spacing, attack when it makes sense.
    if (this.feintT > 0) {
      // Retreat half of a feint: back out of range to draw a whiff.
      me.walk(-toward);
      return;
    }
    const want = p.prefDist;
    if (p.feint > 0 && dist < want + 40 && dist > 95 && roll(p.feint)) {
      me.walk(toward);
      this.feintT = 0.22;
      this.clock = 0.18;
      return;
    }
    const ready = this.attackCd <= 0;
    if (ready && dist < 95 && roll(p.attack)) { me.attack(roll(p.grab * 0.5) ? 'grab' : 'claw'); return; }
    if (ready && dist >= 140 && dist < 300 && roll(p.attack * p.pounce * 1.6)) { me.attack('pounce'); return; }
    if (ready && dist >= 200 && this.spitCd <= 0 && roll(p.spit)) {
      me.attack('spit');
      this.spitCd = 1.1;
      return;
    }
    if (dist > want + 30) me.walk(toward);
    else if (dist < want - 30) me.walk(-toward);
    else {
      // Pace within the comfort band so it never looks frozen.
      this.wander = this.wander || (Math.random() < 0.5 ? -1 : 1);
      if (Math.random() < 0.3) this.wander = -this.wander;
      me.walk(Math.random() < 0.6 ? this.wander : 0);
    }
  }
}
