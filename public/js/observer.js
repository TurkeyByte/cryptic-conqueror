// Collects combat observations about the player and condenses them into the
// compact telemetry summary that is sent to Nemotron.

const PLAYER_MOVES = ['witik', 'redonda', 'sungkite', 'lusob'];
const ASWANG_MOVES = ['claw', 'pounce', 'rising', 'spit', 'grab'];

function emptyWindow() {
  const zero = (keys) => Object.fromEntries(keys.map((k) => [k, 0]));
  return {
    seconds: 0,
    jumps: 0,
    dashes: 0,
    dashesToward: 0,
    guardSeconds: 0,
    attacks: zero(PLAYER_MOVES),
    playerHits: zero(PLAYER_MOVES),
    playerWhiffs: zero(PLAYER_MOVES),
    playerBlocked: zero(PLAYER_MOVES),
    aswangHits: zero(ASWANG_MOVES),
    aswangWhiffs: zero(ASWANG_MOVES),
    aswangBlocked: zero(ASWANG_MOVES),
    dmgToPlayer: 0,
    dmgToAswang: 0,
    close: 0, mid: 0, far: 0,
    advancing: 0, retreating: 0, still: 0,
    cornered: 0,
  };
}

const r2 = (x) => Math.round(x * 100) / 100;

export class Observer {
  constructor() {
    this.matchReset();
  }

  matchReset() {
    this.w = emptyWindow();
    this.match = emptyWindow();
    this.history = [];
  }

  // Start a fresh observation window (called after each Nemotron decision).
  newWindow() {
    this.w = emptyWindow();
  }

  each(fn) { fn(this.w); fn(this.match); }

  tick(dt, player, aswang) {
    const dist = Math.abs(player.x - aswang.x);
    const toward = Math.sign(aswang.x - player.x);
    this.each((w) => {
      w.seconds += dt;
      if (player.state === 'guard') w.guardSeconds += dt;
      if (dist < 110) w.close += dt; else if (dist < 260) w.mid += dt; else w.far += dt;
      const v = Math.sign(player.vx) * (Math.abs(player.vx) > 20 ? 1 : 0);
      if (v === 0) w.still += dt; else if (v === toward) w.advancing += dt; else w.retreating += dt;
      if (player.x < 130 || player.x > 830) w.cornered += dt;
    });
  }

  // Fighter events from this frame.
  playerEvent(e) {
    this.each((w) => {
      if (e.type === 'jump') w.jumps++;
      if (e.type === 'dash') { w.dashes++; if (e.toward) w.dashesToward++; }
      if (e.type === 'attack' && e.move in w.attacks) w.attacks[e.move]++;
      if (e.type === 'whiff' && e.move in w.playerWhiffs) w.playerWhiffs[e.move]++;
    });
  }

  aswangEvent(e) {
    this.each((w) => {
      if (e.type === 'whiff' && e.move in w.aswangWhiffs) w.aswangWhiffs[e.move]++;
    });
  }

  // Resolved contact: who hit whom with what.
  contact(attacker, move, result, dmg = 0) {
    this.each((w) => {
      if (attacker === 'player') {
        if (result === 'hit') { w.playerHits[move] = (w.playerHits[move] || 0) + 1; w.dmgToAswang += dmg; }
        else w.playerBlocked[move] = (w.playerBlocked[move] || 0) + 1;
      } else {
        if (result === 'hit') { w.aswangHits[move] = (w.aswangHits[move] || 0) + 1; w.dmgToPlayer += dmg; }
        else w.aswangBlocked[move] = (w.aswangBlocked[move] || 0) + 1;
      }
    });
  }

  // Record how the plan that just ended performed, so Nemotron can judge it.
  closePlan(intent, focus) {
    const w = this.w;
    this.history.push({ intent, focus, dmgDealt: w.dmgToPlayer, dmgTaken: w.dmgToAswang, seconds: Math.round(w.seconds) });
    if (this.history.length > 4) this.history.shift();
  }

  summarize(w) {
    const s = Math.max(w.seconds, 0.01);
    const nonzero = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
    return {
      seconds: Math.round(w.seconds),
      jumps: w.jumps,
      jumpAttacks: w.attacks.lusob,
      dashes: w.dashes,
      dashesTowardAswang: w.dashesToward,
      guardPct: Math.round((w.guardSeconds / s) * 100),
      attacksUsed: nonzero(w.attacks),
      playerHitsLanded: nonzero(w.playerHits),
      playerWhiffs: nonzero(w.playerWhiffs),
      playerAttacksBlocked: nonzero(w.playerBlocked),
      aswangHitsLanded: nonzero(w.aswangHits),
      aswangWhiffs: nonzero(w.aswangWhiffs),
      aswangAttacksBlocked: nonzero(w.aswangBlocked),
      damageToPlayer: w.dmgToPlayer,
      damageToAswang: w.dmgToAswang,
      rangePct: { close: Math.round((w.close / s) * 100), mid: Math.round((w.mid / s) * 100), far: Math.round((w.far / s) * 100) },
      movementPct: { advancing: Math.round((w.advancing / s) * 100), retreating: Math.round((w.retreating / s) * 100), still: Math.round((w.still / s) * 100) },
      corneredPct: Math.round((w.cornered / s) * 100),
    };
  }

  telemetry({ round, roundTime, player, aswang, score, intent, focus }) {
    return {
      round,
      roundTimeLeft: Math.round(roundTime),
      roundsWon: score,
      hp: { player: r2(player.hp / player.maxHp), aswang: r2(aswang.hp / aswang.maxHp) },
      currentPlan: { intent, focus },
      recent: this.summarize(this.w),
      wholeMatch: this.summarize(this.match),
      pastPlans: this.history,
    };
  }
}
