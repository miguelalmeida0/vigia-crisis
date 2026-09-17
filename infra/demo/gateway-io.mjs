import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const identityKeys = ['releaseId', 'codeStateHash', 'operationalDataHash', 'releaseStatementHash'];

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

// One in-flight probe and one small cached result. Never accumulate responses,
// and never mark frontend-only availability as backend readiness.
export function createReadinessProbe({ backend, identity, headers, timeoutMs = 3_000, ttlMs = 1_000, clock = Date.now }) {
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
      // The API owns the actual dependency/readiness checks. A cached release
      // manifest alone is not enough, especially when the database is blocked.
      const readyBody = await readBoundedJson(ready, 256_000);
      if (ready.status !== 200 || readyBody?.ok === false || readyBody?.ready === false) throw new Error('api_dependencies_not_ready');
      return { ok: true, backendVerified: true, checkedAt: new Date(clock()).toISOString() };
    } catch (error) {
      return { ok: false, backendVerified: false,
        error: controller.signal.aborted ? 'api_readiness_timeout' : String(error.message ?? error).slice(0, 160),
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
