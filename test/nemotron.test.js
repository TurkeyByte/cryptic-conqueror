import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStrategy, callNemotron, buildMessages, BadRequest } from '../lib/nemotron.js';
import { strategy } from '../lib/handler.js';

const good = { observe: 'Player jumps a lot.', adapt: 'Anti-air every jump.', intent: 'COUNTER', focus: ['ANTI_AIR'], taunt: 'Lipad ka pa?' };

test('parses a clean JSON reply', () => {
  assert.deepEqual(parseStrategy(JSON.stringify(good)), good);
});

test('strips think blocks, markdown fences and surrounding text', () => {
  const raw = '<think>long hidden reasoning {"intent":"ZONE"}</think>\nHere you go:\n```json\n' + JSON.stringify(good) + '\n```';
  assert.equal(parseStrategy(raw).intent, 'COUNTER');
});

test('normalizes intent case and focus spelling, drops unknown focus, caps at two', () => {
  const s = parseStrategy(JSON.stringify({ ...good, intent: 'bait', focus: ['punish whiff', 'anti-air', 'FLY', 'GUARD_MORE'] }));
  assert.equal(s.intent, 'BAIT');
  assert.deepEqual(s.focus, ['PUNISH_WHIFF', 'ANTI_AIR']);
});

test('rejects unknown intents and missing text', () => {
  assert.throws(() => parseStrategy(JSON.stringify({ ...good, intent: 'TELEPORT' })), /unknown intent/);
  assert.throws(() => parseStrategy(JSON.stringify({ ...good, observe: '' })), /missing/);
  assert.throws(() => parseStrategy('no json here'), /no JSON/);
});

test('truncates long text and strips control characters', () => {
  const s = parseStrategy(JSON.stringify({ ...good, observe: 'a\u0007b'.repeat(200) }));
  assert.ok(s.observe.length <= 110);
  assert.ok(!/\u0007/.test(s.observe));
});

test('refuses oversized telemetry', () => {
  assert.throws(() => buildMessages({ junk: 'x'.repeat(7000) }), BadRequest);
});

test('callNemotron sends an OpenAI-compatible request and retries without chat_template_kwargs on 400', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body, auth: init.headers.Authorization });
    if (body.chat_template_kwargs) return new Response('bad param', { status: 400 });
    return Response.json({ model: body.model, choices: [{ message: { content: JSON.stringify(good) } }] });
  };
  const out = await callNemotron({ telemetry: { a: 1 }, apiKey: 'k', model: 'nvidia/test', baseUrl: 'https://example.test/v1/', fetchImpl });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(seen[0].auth, 'Bearer k');
  assert.equal(seen[0].body.model, 'nvidia/test');
  assert.equal(seen[1].body.chat_template_kwargs, undefined);
  assert.equal(out.strategy.intent, 'COUNTER');
});

test('handler reports offline without a key and surfaces upstream errors', async () => {
  const off = await strategy({ telemetry: {} }, 'c1', {});
  assert.equal(off.status, 503);
  assert.equal(off.json.offline, true);
  const fail = await strategy({ telemetry: {} }, 'c2', { NEBIUS_API_KEY: 'k' }, async () => new Response('nope', { status: 401 }));
  assert.equal(fail.status, 502);
  assert.match(fail.json.error, /401/);
  const bad = await strategy({}, 'c3', { NEBIUS_API_KEY: 'k' });
  assert.equal(bad.status, 400);
});
