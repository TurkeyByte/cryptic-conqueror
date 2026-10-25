// Shared request handling for the local server (server.js) and the Vercel function (api/strategy.js).
import { callNemotron, BadRequest, DEFAULT_BASE_URL, DEFAULT_MODEL } from './nemotron.js';

export function aiConfig(env = process.env) {
  return {
    apiKey: env.NEBIUS_API_KEY || '',
    model: env.NEMOTRON_MODEL || DEFAULT_MODEL,
    baseUrl: env.NEBIUS_BASE_URL || DEFAULT_BASE_URL,
  };
}

export function health(env = process.env) {
  const { apiKey, model } = aiConfig(env);
  return { status: 200, json: { ai: apiKey ? 'configured' : 'missing_key', model, provider: 'Nebius Token Factory' } };
}

// Basic per-client throttle so a public demo key can't be drained by one visitor.
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
function throttled(clientId) {
  const now = Date.now();
  const entry = hits.get(clientId);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(clientId, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  entry.n++;
  return entry.n > MAX_PER_WINDOW;
}

export async function strategy(body, clientId = 'anon', env = process.env, fetchImpl = fetch) {
  const { apiKey, model, baseUrl } = aiConfig(env);
  if (!apiKey) {
    return { status: 503, json: { error: 'NEBIUS_API_KEY is not set on the server', offline: true } };
  }
  if (throttled(clientId)) return { status: 429, json: { error: 'too many requests, slow down' } };
  const telemetry = body && typeof body === 'object' ? body.telemetry : null;
  if (!telemetry || typeof telemetry !== 'object') return { status: 400, json: { error: 'missing telemetry' } };
  try {
    const result = await callNemotron({ telemetry, apiKey, model, baseUrl, fetchImpl });
    return { status: 200, json: result };
  } catch (err) {
    if (err instanceof BadRequest) return { status: 400, json: { error: err.message } };
    const message = err?.name === 'TimeoutError' ? 'Nemotron request timed out' : String(err?.message || err);
    console.error('[nemotron]', message);
    return { status: 502, json: { error: message } };
  }
}
