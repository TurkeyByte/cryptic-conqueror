// Client side of the Nemotron loop: every few seconds of combat, send the
// observer's telemetry to /api/strategy (which calls Nemotron on Nebius Token
// Factory) and hand the returned plan to the Aswang's brain. Also drives the
// on-screen "Aswang Mind" panel.

// Seconds of fighting before the first plan, and between plans. A tougher
// monster (higher level) replans more often.
const cadenceFor = (t) => ({ first: 5 - 2 * t, every: 8 - 3 * t });
const RETRY_S = 6;
const CLIENT_TIMEOUT_MS = 20000;

const $ = (id) => document.getElementById(id);

export class Strategist {
  constructor({ onPlan }) {
    this.onPlan = onPlan;
    this.status = 'checking'; // checking | ready | thinking | offline | error
    this.model = '';
    this.calls = 0;
    this.ok = 0;
    this.latencies = [];
    this.matchId = 0;
    this.inflight = false;
    this.cadence = cadenceFor(0);
    this.timer = this.cadence.first;
    this.log = [];
    this.lastTelemetry = null;
  }

  async checkHealth() {
    try {
      const res = await fetch('/api/strategy', { cache: 'no-store' });
      const j = await res.json();
      this.model = j.model || '';
      this.setStatus(j.ai === 'configured' ? 'ready' : 'offline', j.ai === 'configured' ? '' : 'Server has no NEBIUS_API_KEY. The Aswang fights on instinct only.');
    } catch {
      this.setStatus('offline', 'AI endpoint unreachable. The Aswang fights on instinct only.');
    }
    return this.status;
  }

  setToughness(t) {
    this.cadence = cadenceFor(t);
  }

  newMatch() {
    this.matchId++;
    this.timer = this.cadence.first;
    this.inflight = false;
    this.log = [];
    this.renderLog();
    this.showPlan({ intent: 'INSTINCT', focus: [], observe: 'Watching Dakila…', adapt: 'No plan yet: fighting on raw instinct.' });
    if (this.status === 'error' || this.status === 'thinking') this.setStatus('ready');
  }

  // Called once per frame while the round is live.
  tick(dt, getTelemetry) {
    $('ai-next').style.width = this.status === 'offline' ? '0%' : `${Math.max(0, Math.min(100, (1 - this.timer / this.cadence.every) * 100))}%`;
    if (this.inflight || this.status === 'offline' || this.status === 'checking') return;
    this.timer -= dt;
    if (this.timer <= 0) this.request(getTelemetry());
  }

  // Ask immediately (e.g. between rounds), regardless of the timer.
  requestNow(telemetry) {
    if (this.status === 'offline' || this.status === 'checking') return;
    // If a request is already out, ask again as soon as it returns.
    if (this.inflight) { this.timer = 0; return; }
    this.request(telemetry);
  }

  async request(telemetry) {
    const match = this.matchId;
    this.inflight = true;
    this.calls++;
    this.lastTelemetry = telemetry;
    $('ai-telemetry').textContent = JSON.stringify(telemetry, null, 1);
    this.setStatus('thinking');
    const t0 = performance.now();
    try {
      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telemetry }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const j = await res.json().catch(() => ({}));
      if (match !== this.matchId) return;
      if (res.status === 503 && j.offline) {
        this.setStatus('offline', j.error);
        return;
      }
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const ms = Math.round(performance.now() - t0);
      this.ok++;
      this.latencies.push(ms);
      if (this.latencies.length > 20) this.latencies.shift();
      if (j.model) this.model = j.model;
      this.setStatus('ready');
      this.timer = this.cadence.every;
      this.onPlan(j.strategy, ms);
      this.showPlan(j.strategy);
      this.pushLog(j.strategy, ms, telemetry);
    } catch (err) {
      if (match !== this.matchId) return;
      this.setStatus('error', err?.name === 'TimeoutError' ? 'Nemotron timed out; keeping current plan.' : `${err.message || err}; keeping current plan.`);
      this.timer = RETRY_S;
    } finally {
      if (match === this.matchId) this.inflight = false;
      this.renderStats();
    }
  }

  setStatus(status, note = '') {
    this.status = status;
    const el = $('ai-status');
    const labels = { checking: 'CONNECTING', ready: 'LINKED', thinking: 'ANALYZING…', offline: 'OFFLINE', error: 'RETRYING' };
    el.textContent = labels[status];
    el.dataset.state = status;
    $('ai-note').textContent = note;
    $('ai-note').hidden = !note;
    this.renderStats();
  }

  renderStats() {
    $('ai-model').textContent = this.model || '—';
    const avg = this.latencies.length ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) : null;
    const last = this.latencies.at(-1);
    $('ai-latency').textContent = last ? `${(last / 1000).toFixed(2)}s (avg ${(avg / 1000).toFixed(2)}s)` : '—';
    $('ai-calls').textContent = `${this.ok}/${this.calls}`;
  }

  showPlan(s) {
    $('ai-observe').textContent = s.observe;
    $('ai-adapt').textContent = s.adapt;
    const intent = $('ai-intent');
    intent.textContent = s.intent;
    intent.dataset.intent = s.intent;
    const focus = $('ai-focus');
    focus.innerHTML = '';
    for (const f of s.focus) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = f.replace(/_/g, ' ');
      focus.append(chip);
    }
    const panel = $('ai-panel');
    panel.classList.remove('pulse');
    void panel.offsetWidth;
    panel.classList.add('pulse');
  }

  pushLog(s, ms, telemetry) {
    this.log.unshift({ round: telemetry.round, t: telemetry.roundTimeLeft, intent: s.intent, focus: s.focus, ms });
    if (this.log.length > 6) this.log.pop();
    this.renderLog();
  }

  renderLog() {
    const ul = $('ai-log');
    ul.innerHTML = '';
    for (const e of this.log) {
      const li = document.createElement('li');
      li.textContent = `R${e.round} · ${e.t}s  ${e.intent}${e.focus.length ? ' + ' + e.focus.join(', ').replace(/_/g, ' ') : ''}`;
      ul.append(li);
    }
    $('ai-log-empty').hidden = this.log.length > 0;
  }
}
