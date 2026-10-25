// The monster's memory of this player across matches. Stored only in this
// browser (localStorage), never on the server. After each match we keep a
// compact summary of the player's habits and which plans worked; the next
// match sends that to Nemotron so the Aswang opens with a plan made for them.

const KEY = 'cc_memory_v1';
const MAX_MATCHES = 8;

const per = (n, seconds) => Math.round((n / Math.max(seconds, 1)) * 60 * 10) / 10;

// Condense one finished match into the habits worth remembering.
export function summarizeMatch({ match, plans, result, level, lastRead }) {
  const s = Math.max(match.seconds, 1);
  const attacks = Object.entries(match.attacks).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const whiffs = Object.values(match.playerWhiffs).reduce((a, b) => a + b, 0);
  const scored = plans.filter((p) => p.intent !== 'INSTINCT').map((p) => ({ intent: p.intent, focus: p.focus, net: p.dmgDealt - p.dmgTaken }));
  scored.sort((a, b) => b.net - a.net);
  return {
    at: Date.now(),
    level,
    result,
    habits: {
      jumpAttacksPerMin: per(match.attacks.lusob, s),
      sweepsPerMin: per(match.attacks.walis || 0, s),
      dashesPerMin: per(match.dashes, s),
      whiffsPerMin: per(whiffs, s),
      crouchGuardPct: Math.round((match.guardSeconds / s) * 100),
      closeRangePct: Math.round((match.close / s) * 100),
      favoriteAttack: attacks[0]?.[0] || null,
    },
    bestPlan: scored[0] || null,
    lastRead: lastRead || '',
  };
}

export class Memory {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.matches = [];
    // Running totals, kept even after old match summaries roll off, so the
    // monster's level (which grows with the player's wins) never drops.
    this.wins = 0;
    this.losses = 0;
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(this.storage?.getItem(KEY) || 'null');
      if (!Array.isArray(data?.matches)) return;
      this.matches = data.matches.slice(-MAX_MATCHES);
      this.wins = Number.isInteger(data.wins) ? data.wins : this.matches.filter((m) => m.result === 'player').length;
      this.losses = Number.isInteger(data.losses) ? data.losses : this.matches.filter((m) => m.result === 'aswang').length;
    } catch {}
  }

  save() {
    try { this.storage?.setItem(KEY, JSON.stringify({ matches: this.matches, wins: this.wins, losses: this.losses })); } catch {}
  }

  record(summary) {
    this.matches.push(summary);
    if (this.matches.length > MAX_MATCHES) this.matches.shift();
    if (summary.result === 'player') this.wins++;
    else if (summary.result === 'aswang') this.losses++;
    this.save();
  }

  forget() {
    this.matches = [];
    this.wins = this.losses = 0;
    try { this.storage?.removeItem(KEY); } catch {}
  }

  get count() { return this.wins + this.losses; }
  get playerWins() { return this.wins; }

  // What Nemotron gets: averaged recent habits and the plans that worked best.
  forTelemetry() {
    if (!this.matches.length) return null;
    const recent = this.matches.slice(-5);
    const avg = (k) => Math.round((recent.reduce((a, m) => a + (m.habits[k] || 0), 0) / recent.length) * 10) / 10;
    const favorites = {};
    for (const m of recent) if (m.habits.favoriteAttack) favorites[m.habits.favoriteAttack] = (favorites[m.habits.favoriteAttack] || 0) + 1;
    const plans = recent.map((m) => m.bestPlan).filter(Boolean).sort((a, b) => b.net - a.net).slice(0, 2);
    return {
      matchesPlayed: this.count,
      playerWins: this.wins,
      aswangWins: this.losses,
      habits: {
        jumpAttacksPerMin: avg('jumpAttacksPerMin'),
        sweepsPerMin: avg('sweepsPerMin'),
        dashesPerMin: avg('dashesPerMin'),
        whiffsPerMin: avg('whiffsPerMin'),
        crouchGuardPct: avg('crouchGuardPct'),
        closeRangePct: avg('closeRangePct'),
        favoriteAttack: Object.entries(favorites).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      },
      plansThatWorked: plans,
      lastRead: this.matches.at(-1).lastRead,
    };
  }
}
