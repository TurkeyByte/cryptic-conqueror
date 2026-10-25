import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory, summarizeMatch } from '../public/js/memory.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const match = {
  seconds: 120,
  attacks: { witik: 10, redonda: 2, sungkite: 0, lusob: 24, walis: 4 },
  playerWhiffs: { witik: 3, lusob: 6 },
  dashes: 6,
  guardSeconds: 30,
  close: 60,
};
const plans = [
  { intent: 'INSTINCT', focus: [], dmgDealt: 0, dmgTaken: 30 },
  { intent: 'COUNTER', focus: ['ANTI_AIR'], dmgDealt: 40, dmgTaken: 10 },
  { intent: 'BAIT', focus: ['PUNISH_WHIFF'], dmgDealt: 12, dmgTaken: 20 },
];

test('summarizes a match into per-minute habits and its best plan', () => {
  const s = summarizeMatch({ match, plans, result: 'player', level: 1, lastRead: 'Jumps a lot.' });
  assert.equal(s.habits.jumpAttacksPerMin, 12);
  assert.equal(s.habits.whiffsPerMin, 4.5);
  assert.equal(s.habits.crouchGuardPct, 25);
  assert.equal(s.habits.favoriteAttack, 'lusob');
  assert.deepEqual(s.bestPlan, { intent: 'COUNTER', focus: ['ANTI_AIR'], net: 30 });
});

test('persists across instances, caps history, and can forget', () => {
  const storage = fakeStorage();
  const m = new Memory(storage);
  assert.equal(m.forTelemetry(), null);
  for (let i = 0; i < 10; i++) m.record(summarizeMatch({ match, plans, result: i % 2 ? 'player' : 'aswang', level: 1, lastRead: `read ${i}` }));
  const again = new Memory(storage);
  assert.equal(again.matches.length, 8);
  // Totals outlive the 8 kept summaries, so wins (and the monster's level) never drop.
  assert.equal(again.count, 10);
  assert.equal(again.playerWins, 5);
  const t = again.forTelemetry();
  assert.equal(t.matchesPlayed, 10);
  assert.equal(t.playerWins + t.aswangWins, 10);
  assert.equal(t.habits.favoriteAttack, 'lusob');
  assert.equal(t.plansThatWorked[0].intent, 'COUNTER');
  assert.equal(t.lastRead, 'read 9');
  again.forget();
  assert.equal(new Memory(storage).count, 0);
});

test('survives corrupt or missing storage', () => {
  const storage = fakeStorage();
  storage.setItem('cc_memory_v1', '{not json');
  assert.equal(new Memory(storage).count, 0);
  const none = new Memory(undefined);
  none.record(summarizeMatch({ match, plans, result: 'player', level: 1 }));
  assert.equal(none.count, 1);
});
