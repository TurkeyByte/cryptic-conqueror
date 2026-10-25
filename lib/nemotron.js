// Nemotron strategist: turns a summary of the player's fighting habits into a
// tactical plan for the Aswang, via NVIDIA Nemotron on Nebius Token Factory.
//
// Nemotron never drives frames or individual attacks. It returns a small,
// validated plan (intent + focus) that the deterministic game AI then executes.

export const INTENTS = ['AGGRESSIVE', 'DEFENSIVE', 'COUNTER', 'ZONE', 'BAIT', 'PRESSURE', 'RETREAT'];

export const FOCUSES = [
  'ANTI_AIR',       // swat jumping attacks with the rising claw
  'PUNISH_WHIFF',   // strike during the player's recovery after a missed attack
  'PUNISH_DASH',    // react to the player's evasive dash
  'GRAB_GUARD',     // use the unblockable grab against a player who guards a lot
  'KEEP_DISTANCE',  // stay far, spit bile, leap away
  'CLOSE_DISTANCE', // pounce in and stay close
  'GUARD_MORE',     // block more often when the player attacks
];

export const DEFAULT_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
export const DEFAULT_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';

const MAX_TELEMETRY_CHARS = 6000;

export const SYSTEM_PROMPT = `/no_think
You are the tactical mind of an Aswang, a shapeshifting creature from Philippine folklore, fighting a Kali (Filipino martial arts) warrior in a 2D fighting game.
Every few seconds you receive telemetry about the player's recent behaviour. Choose the Aswang's strategy for the next few seconds so it exploits the player's habits.

Player moves: witik (fast short stick strike), redonda (slow heavy spinning strike), sungkite (long lunging thrust, long recovery), jump attacks (lusob), walis (low sweep from a crouch: knocks down, the Aswang's standing guard cannot block it, punishable if it misses), dash (evasive, briefly invulnerable), crouch guard (hold down: blocks everything except grabs, including bile spit).
Aswang moves: claw (close), pounce (long lunge), rising claw (anti-air, beats jump attacks), bile spit (projectile), grab (unblockable, beats guard, whiffs on jumpers), guard, leap back.

Intents:
AGGRESSIVE: attack often, pounce in.
DEFENSIVE: hang back, guard, punish mistakes.
COUNTER: wait for the player to commit, then punish.
ZONE: keep far away, spit bile.
BAIT: feint at the edge of the player's range to draw out whiffs, then punish.
PRESSURE: stay close, chain claws and grabs.
RETREAT: back off and reset when losing badly.

Focus options (pick 0-2): ${FOCUSES.join(', ')}.

Use the telemetry. Name the player's most exploitable habit and pick the counter. If your current plan's result was poor, change it.

Reply with ONLY a JSON object, no markdown, no extra text:
{"observe": "<=90 chars, the player's key habit, from the data", "adapt": "<=90 chars, what the Aswang will change", "intent": "<one intent>", "focus": ["<focus>"], "taunt": "<=60 chars, a short spooky PG line the Aswang says, Taglish ok", "taunt_en": "the taunt translated to plain English, or empty if the taunt is already English"}`;

export function buildMessages(telemetry) {
  const json = JSON.stringify(telemetry);
  if (json.length > MAX_TELEMETRY_CHARS) throw new BadRequest('telemetry too large');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Telemetry:\n${json}` },
  ];
}

export class BadRequest extends Error {}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  // Strip control characters and collapse whitespace; the text is shown in the game UI.
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

// Parse and validate the model's reply. Throws if it isn't a usable plan.
export function parseStrategy(raw) {
  if (typeof raw !== 'string') throw new Error('empty model reply');
  const text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model reply');
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('model reply was not valid JSON');
  }
  const intent = String(obj.intent ?? '').toUpperCase().trim();
  if (!INTENTS.includes(intent)) throw new Error(`model chose unknown intent "${cleanText(String(obj.intent), 30)}"`);
  const focusIn = Array.isArray(obj.focus) ? obj.focus : obj.focus ? [obj.focus] : [];
  const focus = [...new Set(focusIn.map((f) => String(f).toUpperCase().trim().replace(/[\s-]+/g, '_')))]
    .filter((f) => FOCUSES.includes(f))
    .slice(0, 2);
  const observe = cleanText(obj.observe, 110);
  const adapt = cleanText(obj.adapt, 110);
  if (!observe || !adapt) throw new Error('model reply missing observe/adapt');
  const taunt = cleanText(obj.taunt, 70);
  let tauntEn = cleanText(obj.taunt_en, 80);
  if (!taunt || tauntEn.toLowerCase() === taunt.toLowerCase()) tauntEn = '';
  return { intent, focus, observe, adapt, taunt, tauntEn };
}

async function post(url, apiKey, body, fetchImpl, timeoutMs) {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function callNemotron({
  telemetry,
  apiKey,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 15000,
}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const body = {
    model,
    messages: buildMessages(telemetry),
    temperature: 0.4,
    max_tokens: 400,
    // Nemotron 3 reasons by default; a tactical call every few seconds needs a fast, direct answer.
    chat_template_kwargs: { enable_thinking: false },
  };
  const t0 = Date.now();
  let res = await post(url, apiKey, body, fetchImpl, timeoutMs);
  if (res.status === 400 || res.status === 422) {
    // Some deployments reject chat_template_kwargs; retry once with the plain OpenAI schema.
    delete body.chat_template_kwargs;
    res = await post(url, apiKey, body, fetchImpl, timeoutMs);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Token Factory HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message ?? {};
  const strategy = parseStrategy(msg.content || msg.reasoning_content || '');
  return {
    strategy,
    model: data.model || model,
    latencyMs: Date.now() - t0,
    usage: data.usage ?? null,
  };
}
