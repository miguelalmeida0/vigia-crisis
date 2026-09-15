// Binds Render's external $PORT immediately, before migration, seeding, or
// the real API have run, and reports 503/not-ready with live bootstrap
// progress until the real backend is genuinely ready. This exists because
// Render kills a web service that never opens its assigned port within its
// port-scan window ("Port scan timeout reached, no open ports detected") —
// the previous render-demo-start.mjs sequence (migrate -> seed -> start API
// -> wait ready -> only then bind $PORT) let a slow or stuck bootstrap step
// get the whole deploy killed before the operator ever saw why.
//
// This is a real readiness state machine, not a fake always-200 health
// endpoint: every response reflects the actual current phase, and 503 is
// returned for every request (including /__operator/ready) until the caller
// explicitly marks bootstrap complete. The orchestrator (render-demo-start.mjs)
// is expected to stop() this server and start the real public-demo-server.mjs
// on the same port once the backend is truly ready.

import http from 'node:http';

export function startBootstrapGateway({ host = '0.0.0.0', port }) {
  if (!port) throw new Error('demo_bootstrap_gateway_port_required');
  const startedAt = Date.now();
  const state = { phase: 'starting', phaseHistory: [], lastError: null };

  function setPhase(phase, details = {}) {
    const at = new Date().toISOString();
    state.phase = phase;
    state.phaseHistory.push({ phase, at, ...details });
    if (state.phaseHistory.length > 200) state.phaseHistory.splice(0, state.phaseHistory.length - 200);
  }
  function fail(error) {
    state.lastError = String(error?.message ?? error).slice(0, 500);
    setPhase('failed', { error: state.lastError });
  }

  function body() {
    return {
      ok: false,
      isolatedDemo: true,
      bootstrapping: true,
      disclaimer: 'DEMO / SYNTHETIC SCENARIO. This deployment is still starting (migrating, seeding, or waiting on the backend). It is not connected to production.',
      phase: state.phase,
      elapsedMs: Date.now() - startedAt,
      lastError: state.lastError,
      phaseHistory: state.phaseHistory.slice(-20)
    };
  }

  const server = http.createServer((req, res) => {
    const payload = Buffer.from(JSON.stringify(body()));
    res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'content-length': payload.length, 'cache-control': 'no-store', 'x-vigia-deployment': 'isolated-demo-bootstrapping' });
    res.end(req.method === 'HEAD' ? undefined : payload);
  });
  server.maxConnections = 64;

  return {
    server,
    setPhase,
    fail,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve());
    }),
    stop: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
