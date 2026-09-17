import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const identityKeys = ['releaseId', 'codeStateHash', 'operationalDataHash', 'releaseStatementHash'];
const demoRequiredChecks = new Set([
  'demo_identities',
  'authenticated_operator_boundary',
  'operator_state_persistence',
  'event_state_persistence',
  'postgres_physical_truth',
  'postgres_live_operations',
  'audit_chain',
  'geo_proof_persistence'
]);
const demoInactiveOperationalChecks = new Set([
  // The portfolio deployment is deliberately a SHADOW/synthetic exercise, so
  // it must not pretend to satisfy production fixture-purity.
  'production_synthetic_observations',
  // Recurring acquisition/operational workers are deliberately disabled on
  // the bounded recruiter-facing read plane. Their continuously-refreshing
  // production invariants are certified separately before full-runtime use.
  'unknown_to_work_invariant',
  'physical_source_families',
  // createRuntime() deliberately skips refreshOperationalState() for the
  // bounded demo. That function is where ScientificRuntimeService.refresh()
  // runs. Requiring it here would make an intentionally inactive subsystem a
  // permanent false-negative. The persisted geo-proof store remains required;
  // live raster execution belongs to full operational-runtime certification.
  'scientific_runtime'
]);

async function readBoundedJson(response, maxBytes) {
  let total = 0;
  const chunks = [];
  if (response.body) for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('readiness_response_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8'));
}

function boundedDemoEnvironment() {
  return process.env.VIGIA_DEMO_CONFIRM === 'SYNTHETIC_DEMO_ONLY'
    && process.env.VIGIA_DEMO_DATABASE_MODE === 'ephemeral_local_postgis';
}

export function assessDependencyReadiness(status, body, { profile = 'operational' } = {}) {
  if (status === 200 && body?.ready !== false && body?.ok !== false) {
    return { ok: true, productionReady: body?.ready !== false, waivedChecks: [] };
  }
  if (profile !== 'bounded_demo') return { ok: false, error: 'api_dependencies_not_ready' };
  if (body?.schemaVersion !== 'vigia.public-operational-readiness.v1' || !Array.isArray(body.checks)) {
    return { ok: false, error: 'api_demo_readiness_contract_invalid' };
  }
  const byId = new Map(body.checks.map(check => [check?.id, check]));
  const missingOrFailedRequired = [...demoRequiredChecks].filter(id => byId.get(id)?.ok !== true);
  if (missingOrFailedRequired.length) {
    return { ok: false, error: 'api_demo_required_dependency_not_ready', failedChecks: missingOrFailedRequired };
  }
  const unexpectedBlockingFailures = body.checks
    .filter(check => check?.blocking !== false && check?.ok !== true && !demoInactiveOperationalChecks.has(check?.id))
    .map(check => check.id)
    .filter(Boolean);
  if (unexpectedBlockingFailures.length) {
    return { ok: false, error: 'api_demo_unexpected_blocking_failure', failedChecks: unexpectedBlockingFailures };
  }
  const waivedChecks = body.checks
    .filter(check => demoInactiveOperationalChecks.has(check?.id) && check?.ok !== true)
    .map(check => check.id);
  return { ok: true, productionReady: false, boundedReadPlaneReady: true, waivedChecks };
}

// One in-flight probe and one small cached result. Never accumulate responses,
// and never mark frontend-only availability as backend readiness. The isolated
// synthetic demo has its own deliberately narrower dependency gate; production
// /api/v10/ready remains strict and unchanged.
export function createReadinessProbe({ backend, identity, headers, timeoutMs = 3_000, ttlMs = 1_000, clock = Date.now, profile = null }) {
  const readinessProfile = profile ?? (boundedDemoEnvironment() ? 'bounded_demo' : 'operational');
  let pending = null, cached = null, expiresAt = 0;
  async function probe() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const path = '/api/v10/release';
      const release = await fetch(new URL(path, backend), { headers: headers(path), signal: controller.signal, redirect: 'manual' });
      if (release.status !== 200) { await release.body?.cancel(); throw new Error('api_release_unavailable'); }
      const body = await readBoundedJson(release, 256_000);
      if (!identityKeys.every(key => Boolean(identity[key]) && body[key] === identity[key])) throw new Error('api_console_release_identity_mismatch');
      if (body.process?.servicesReady !== true || body.process?.startup?.state === 'failed') throw new Error('api_services_not_ready');
      const readyPath = '/api/v10/ready';
      const ready = await fetch(new URL(readyPath, backend), { headers: headers(readyPath), signal: controller.signal, redirect: 'manual' });
      const readyBody = await readBoundedJson(ready, 256_000);
      const assessment = assessDependencyReadiness(ready.status, readyBody, { profile: readinessProfile });
      if (!assessment.ok) {
        const failure = new Error(assessment.error);
        failure.failedChecks = assessment.failedChecks;
        throw failure;
      }
      return {
        ok: true,
        backendVerified: true,
        readinessProfile,
        productionReady: assessment.productionReady,
        boundedReadPlaneReady: assessment.boundedReadPlaneReady === true,
        waivedChecks: assessment.waivedChecks,
        checkedAt: new Date(clock()).toISOString()
      };
    } catch (error) {
      return { ok: false, backendVerified: false,
        error: controller.signal.aborted ? 'api_readiness_timeout' : String(error.message ?? error).slice(0, 160),
        failedChecks: Array.isArray(error.failedChecks) ? error.failedChecks.slice(0, 16) : undefined,
        checkedAt: new Date(clock()).toISOString() };
    } finally { clearTimeout(timer); }
  }
  return () => {
    if (cached && clock() < expiresAt) return Promise.resolve(cached);
    if (!pending) pending = probe().then(result => { cached = result; expiresAt = clock() + (result.ok ? ttlMs : Math.min(ttlMs, 250)); return result; }).finally(() => { pending = null; });
    return pending;
  };
}

export async function forwardResponse({ req, res, target, headers, method = 'GET', stream = false, timeoutMs = 25_000, maxBytes = 32_000_000 }) {
  const controller = new AbortController();
  const disconnected = () => controller.abort();
  res.once('close', disconnected);
  let timer = setTimeout(() => controller.abort(), stream ? 6_000 : timeoutMs);
  try {
    const upstream = await fetch(target, { method, headers, signal: controller.signal, redirect: 'manual' });
    if (stream) { clearTimeout(timer); timer = null; }
    const copy = {};
    for (const name of ['content-type','cache-control','etag','last-modified','x-vigia-provider','x-vigia-acquired-at','x-vigia-last-good-at','x-vigia-source-state','x-vigia-provenance','x-vigia-correlation-id','x-vigia-release-id']) {
      const value = upstream.headers.get(name); if (value) copy[name] = value;
    }
    if (stream) Object.assign(copy, { 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
    // fetch may decompress a response. Do not forward its encoded Content-
    // Length/Content-Encoding, or buffer the whole document just to count it.
    res.writeHead(upstream.status, copy);
    if (!upstream.body || method === 'HEAD') { await upstream.body?.cancel(); res.end(); return; }
    let received = 0;
    const limit = new Transform({ transform(chunk, encoding, callback) {
      received += chunk.length;
      if (!stream && received > maxBytes) callback(new Error('public_demo_response_too_large'));
      else callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(upstream.body), limit, res, { signal: controller.signal });
  } finally {
    if (timer) clearTimeout(timer);
    res.removeListener('close', disconnected);
    controller.abort();
  }
}
