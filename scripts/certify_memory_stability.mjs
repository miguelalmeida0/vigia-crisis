// Sustained-runtime memory/DB-pool stability proof for apps/api/src/server.mjs.
//
// Root-caused live incident: the API process was hitting a 256MB old-space
// ceiling and OOM-crashing on Render's free tier after several minutes of
// otherwise-normal traffic, alongside "Query read timeout" /
// "Connection terminated due to connection timeout" errors from
// world_knowledge_worker/operational_refresh/runtime_refresh. This script
// reproduces the shape of that live workload locally, under the same
// --max-old-space-size=256 ceiling, against the real seeded demo scenario
// (never synthetic/bypassed state), and proves the fixes hold: the runtime's
// own `runtime_telemetry` log line (apps/api/src/application/create-runtime.mjs)
// is sampled every 15s for the whole run, so this is not "one request works" —
// it is a real time series showing whether heap/pool telemetry plateaus or
// grows unboundedly under 15 minutes of sustained, repeated traffic exercising
// every route family named in the incident report.
//
// Usage: node scripts/certify_memory_stability.mjs [--minutes=15]
//
// Requires local PostGIS (node scripts/db_up.mjs) already READY.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDbDoctor } from './db_doctor.mjs';
import { resolveLocalDatabaseUrl } from './local_database_secret.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minutesArg = process.argv.find((arg) => arg.startsWith('--minutes='));
const durationMs = Math.round(Number(minutesArg ? minutesArg.split('=')[1] : 15) * 60_000);
const outputFile = path.resolve(process.env.VIGIA_MEMORY_STABILITY_FILE || path.join(root, 'data/validation/operations/memory-stability-proof.json'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const operatorToken = randomBytes(32).toString('base64url');

// A prior 15-minute run's parent process exited without ever reaching its
// `finally` block (the child's V8 OOM abort appears to have taken the whole
// process tree with it under a backgrounded run), losing every measurement
// collected before the crash even though they were sitting safely in memory.
// `persist()` is synchronous and called after every new telemetry sample and
// workload-progress tick, not just at the end, so the on-disk proof file is
// never more than one tick stale. A `process.on('exit', ...)` hook makes one
// final synchronous attempt regardless of how the process is ending.
let result = { schemaVersion: 'vigia.memory-stability-proof.v1', startedAt: new Date().toISOString(), durationMs, state: 'RUNNING' };
mkdirSync(path.dirname(outputFile), { recursive: true });
function persist() {
  try { writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8'); } catch { /* best-effort; never let persistence itself crash the run */ }
}
process.on('exit', persist);
// Isolated per-run state directory. Without this, the server falls back to
// data/runtime/*.json (VIGIA_STATE_FILE's default) — the SAME files a normal
// local `npm run dev` accumulates real external-provider data into over
// weeks of use. A first attempt at this script ran against those defaults
// and multi-megabyte pre-existing source-cache.json/event-projections files
// (accumulated by unrelated local dev sessions) made the reproduction
// unrepresentative of a fresh deployment's actual footprint.
const stateFile = path.join(root, '.tmp', 'certify-memory-stability', `${Date.now()}`, 'production-v1.json');

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (v) => { stdout += v; process.stdout.write(v); });
    child.stderr.on('data', (v) => { stderr += v; process.stderr.write(v); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr.slice(-500)}`)));
  });
}

function spawnServer(databaseUrl) {
  const telemetry = [];
  const child = spawn(process.execPath, ['--max-old-space-size=256', 'apps/api/src/server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '0', HOST: '127.0.0.1', OPEN_BROWSER: '0', NODE_ENV: 'development',
      VIGIA_RUNTIME_PROFILE: 'local_shadow', VIGIA_LOCAL_OPERATOR_AUTOLOGIN: '1', VIGIA_OPERATOR_TOKEN: operatorToken,
      VIGIA_OPERATOR_INCIDENT_SCOPES: '*',
      VIGIA_DATABASE_URL: databaseUrl,
      VIGIA_STATE_FILE: stateFile,
      // Real production cadence, not a stretched-out test interval — the whole
      // point is to reproduce the live tick/lock/pool contention pattern.
      REFRESH_MS: '30000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // Bounded: only used to find the listening port before the workload starts
  // and for diagnostics on failure. Unbounded accumulation of 15 minutes of
  // request logs would make the harness itself the thing growing without
  // bound, defeating the point of a stability proof.
  let output = '';
  createInterface({ input: child.stdout }).on('line', (line) => {
    output = `${output}${line}\n`.slice(-100_000);
    process.stdout.write(`${line}\n`);
    try {
      const event = JSON.parse(line);
      if (event.component === 'runtime_telemetry') {
        telemetry.push({ tMs: Date.now(), ...event });
        result.memoryTimeline = telemetry.map((t) => ({ atMs: t.tMs, rssBytes: t.memory.rssBytes, heapUsedBytes: t.memory.heapUsedBytes, heapTotalBytes: t.memory.heapTotalBytes, externalBytes: t.memory.externalBytes, arrayBuffersBytes: t.memory.arrayBuffersBytes, pool: t.pool }));
        persist();
      }
    } catch { /* not every line is JSON */ }
  });
  child.stderr.on('data', (v) => process.stderr.write(v));
  return { child, telemetry, getOutput: () => output };
}

async function serverUrl(runtime) {
  for (let i = 0; i < 200; i += 1) {
    const match = runtime.getOutput().match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) return `http://127.0.0.1:${match[1]}`;
    if (runtime.child.exitCode !== null) throw new Error(`server_exited_before_listening:${runtime.child.exitCode}`);
    await wait(50);
  }
  throw new Error('server_listener_timeout');
}

async function requestJson(url, endpoint, { timeoutMs = 8_000 } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(`${url}${endpoint}`, { headers: { authorization: `Bearer ${operatorToken}` }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, durationMs: Number((performance.now() - started).toFixed(1)), bytes: Buffer.byteLength(text), body };
  } catch (error) {
    return { status: 0, durationMs: Number((performance.now() - started).toFixed(1)), bytes: 0, error: String(error?.message ?? error) };
  }
}

async function waitReady(url, { timeoutMs = 150_000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const release = await requestJson(url, '/api/v10/release');
    last = release;
    if (release.status === 200 && release.body?.process?.servicesReady === true) return release.body;
    if (release.body?.process?.startup?.state === 'failed') throw new Error('api_services_startup_failed');
    await wait(1_000);
  }
  throw new Error(`server_not_ready_within_${timeoutMs}ms:${JSON.stringify(last)}`);
}

// --- preflight ---------------------------------------------------------
const databaseUrl = await resolveLocalDatabaseUrl();
const preflight = await runDbDoctor({ databaseUrl });
if (preflight.classification !== 'READY') throw new Error(`memory_stability_preflight_${preflight.classification}: run "node scripts/db_up.mjs" first`);

await mkdir(path.dirname(stateFile), { recursive: true });
console.log(JSON.stringify({ level: 'info', component: 'certify_memory_stability', event: 'seeding_demo_scenario', stateFile }));
await run(process.execPath, ['scripts/seed_demo_portfolio_scenario.mjs'], { VIGIA_DATABASE_URL: databaseUrl, VIGIA_UNIVERSE: 'production', VIGIA_RUNTIME_PROFILE: 'production', VIGIA_DEMO_CONFIRM: 'SYNTHETIC_DEMO_ONLY', VIGIA_STATE_FILE: stateFile });

console.log(JSON.stringify({ level: 'info', component: 'certify_memory_stability', event: 'starting_server', maxOldSpaceMb: 256, durationMinutes: durationMs / 60_000 }));
const runtime = spawnServer(databaseUrl);
persist();
try {
  const url = await serverUrl(runtime);
  await waitReady(url);

  const overview = await requestJson(url, '/api/v10/operator/command-overview');
  const rows = overview.body?.data?.incidents?.value?.incidents ?? [];
  const incidentId = rows.map((r) => r.incident?.id ?? r.incidentId ?? r.id).find(Boolean);
  console.log(JSON.stringify({ level: 'info', component: 'certify_memory_stability', event: 'workload_incident_resolved', incidentId: incidentId ?? null }));

  const endpoints = [
    '/api/v10/health',
    '/api/v10/session',
    '/api/v10/operator/command-overview',
    '/api/v10/operator/incidents',
    ...(incidentId ? [
      `/api/v10/operator/incidents/${encodeURIComponent(incidentId)}`,
      `/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/intelligence`,
      `/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/evidence-debt`,
      `/api/v10/operator/incidents/${encodeURIComponent(incidentId)}/operations`,
      `/api/v10/operator/map-context/${encodeURIComponent(incidentId)}`
    ] : []),
    '/api/v10/operations/status',
    '/api/v10/operations/roster',
    '/api/v1/basemap/imagery/6/31/24',
    '/api/v1/basemap/labels/6/31/24'
  ];

  const requestLog = { total: 0, byStatus: {}, errors: 0 };
  const started = Date.now();
  let cycle = 0;
  let crashed = false;
  while (Date.now() - started < durationMs) {
    if (runtime.child.exitCode !== null || runtime.child.signalCode !== null) { crashed = true; break; }
    cycle += 1;
    const batch = await Promise.all(endpoints.map((endpoint) => requestJson(url, endpoint)));
    for (const response of batch) {
      requestLog.total += 1;
      const key = String(response.status || 'network_error');
      requestLog.byStatus[key] = (requestLog.byStatus[key] ?? 0) + 1;
      if (!response.status || response.status >= 500) requestLog.errors += 1;
    }
    result.workload = { endpoints, cycles: cycle, elapsedMs: Date.now() - started, ...requestLog };
    if (cycle % 5 === 0) persist();
    if (cycle % 20 === 0) console.log(JSON.stringify({ level: 'info', component: 'certify_memory_stability', event: 'workload_progress', cycle, elapsedMs: Date.now() - started, requestLog }));
    await wait(3_000);
  }
  if (crashed) throw Object.assign(new Error(`server_crashed_during_workload:exitCode=${runtime.child.exitCode}:signal=${runtime.child.signalCode}`), { requestLog, cycle, elapsedMs: Date.now() - started });

  // --- analysis ----------------------------------------------------------
  const samples = runtime.telemetry.map((t) => ({ atMs: t.tMs - started, rssBytes: t.memory.rssBytes, heapUsedBytes: t.memory.heapUsedBytes, heapTotalBytes: t.memory.heapTotalBytes, externalBytes: t.memory.externalBytes, arrayBuffersBytes: t.memory.arrayBuffersBytes, pool: t.pool }));
  const checkpointAt = (targetMs) => samples.reduce((best, s) => (best === null || Math.abs(s.atMs - targetMs) < Math.abs(best.atMs - targetMs)) ? s : best, null);
  const checkpoints = { start: checkpointAt(0), '1min': checkpointAt(60_000), '5min': checkpointAt(300_000), '10min': checkpointAt(600_000), '15min': checkpointAt(900_000) };

  const half = Math.floor(samples.length / 2);
  const firstHalfAvg = samples.slice(0, Math.max(half, 1)).reduce((sum, s) => sum + s.heapUsedBytes, 0) / Math.max(half, 1);
  const secondHalfAvg = samples.slice(half).reduce((sum, s) => sum + s.heapUsedBytes, 0) / Math.max(samples.length - half, 1);
  const growthRatio = firstHalfAvg > 0 ? secondHalfAvg / firstHalfAvg : null;
  const maxHeapUsed = Math.max(...samples.map((s) => s.heapUsedBytes), 0);
  const plateaued = growthRatio !== null && growthRatio < 1.15 && maxHeapUsed < 256 * 1024 * 1024 * 0.95;

  Object.assign(result, {
    finishedAt: new Date().toISOString(),
    state: 'PASS',
    workload: { endpoints, cycles: cycle, ...requestLog },
    memoryTimeline: samples,
    checkpoints,
    analysis: { firstHalfAvgHeapUsedBytes: Math.round(firstHalfAvg), secondHalfAvgHeapUsedBytes: Math.round(secondHalfAvg), growthRatio, maxHeapUsedBytes: maxHeapUsed, plateaued }
  });
  if (!plateaued) { result.state = 'FAIL'; process.exitCode = 1; }
} catch (error) {
  // result.memoryTimeline already holds every sample collected up to the
  // failure (kept current by the telemetry line listener's persist() calls);
  // this only records the failure reason and a best-effort analysis on top
  // of whatever was measured — it never discards prior samples.
  const failureSamples = result.memoryTimeline ?? [];
  const maxHeapUsed = Math.max(...failureSamples.map((s) => s.heapUsedBytes ?? 0), 0);
  Object.assign(result, {
    finishedAt: new Date().toISOString(), state: 'FAIL', error: String(error?.message ?? error),
    analysis: { maxHeapUsedBytes: maxHeapUsed, finalHeapUsedBytes: failureSamples.at(-1)?.heapUsedBytes ?? null, sampleCount: failureSamples.length, plateaued: false }
  });
  process.exitCode = 1;
} finally {
  runtime.child.kill('SIGTERM');
  await new Promise((resolve) => { runtime.child.once('exit', resolve); setTimeout(resolve, 3_000).unref?.(); });
  persist();
  console.log(JSON.stringify({ level: 'info', component: 'certify_memory_stability', event: 'done', state: result.state, output: outputFile, checkpoints: result.checkpoints, analysis: result.analysis }));
}
