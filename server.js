// Zero-dependency local server: serves the game from ./public and the Nemotron
// strategy endpoint at /api/strategy. Run with `npm start`.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strategy, health } from './lib/handler.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');

// Minimal .env loader so local setup needs no extra packages. Real env vars win.
const envFile = path.join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function send(res, status, json) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(json));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/strategy') {
    if (req.method === 'GET') {
      const out = health();
      return send(res, out.status, out.json);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16_000) return send(res, 413, { error: 'body too large' });
    }
    let body = null;
    try { body = JSON.parse(raw); } catch {}
    const out = await strategy(body, req.socket.remoteAddress || 'anon');
    return send(res, out.status, out.json);
  }

  const rel = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(publicDir + path.sep)) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  const h = health().json;
  console.log(`Bantay running at http://localhost:${port}`);
  console.log(`Nemotron: ${h.ai === 'configured' ? `ready (${h.model})` : 'NEBIUS_API_KEY not set — the Aswang will fight on instinct only'}`);
});
