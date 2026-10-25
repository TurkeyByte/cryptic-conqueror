// Vercel serverless entry point. Locally, server.js serves the same handler.
import { strategy, health } from '../lib/handler.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const out = health();
    return res.status(out.status).json(out.json);
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const clientId = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  const out = await strategy(body, clientId);
  res.status(out.status).json(out.json);
}
