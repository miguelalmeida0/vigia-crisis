import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createReadinessProbe, forwardResponse } from '../demo/gateway-io.mjs';
import { verifyOperatorProxyEnvelope } from '../../packages/domain/src/operator-proxy/request-auth.mjs';
const identity = { releaseId: 'test-release', codeStateHash: 'test-code', operationalDataHash: 'test-data', releaseStatementHash: 'test-statement' };
async function serverFor(t, handler) {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 2_000) { const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw new Error('condition_timeout'); await delay(10); } }

test('readiness requires matching release identity and genuinely ready API dependencies', async t => {
  let readyStatus = 200;
  const { origin } = await serverFor(t, (req, res) => req.url.endsWith('/release') ? json(res, 200, { ...identity, process: { servicesReady: true } }) : json(res, readyStatus, { ok: readyStatus === 200 }));
  const check = createReadinessProbe({ backend: origin, identity, headers: () => ({}), ttlMs: 0 });
  assert.equal((await check()).ok, true);
  readyStatus = 503;
  assert.deepEqual((await check()).error, 'api_dependencies_not_ready');
});
test('frontend manifest mismatch cannot pass readiness', async t => {
  const { origin } = await serverFor(t, (req, res) => json(res, 200, { ...identity, releaseId: 'wrong-build', process: { servicesReady: true } }));
  assert.equal((await createReadinessProbe({ backend: origin, identity, headers: () => ({}) })()).error, 'api_console_release_identity_mismatch');
});
test('readiness request concurrency shares one bounded probe', async t => {
  let calls = 0;
  const { origin } = await serverFor(t, (req, res) => { calls++; setTimeout(() => json(res, 200, req.url.endsWith('/release') ? { ...identity, process: { servicesReady: true } } : { ok: true }), 20); });
  const check = createReadinessProbe({ backend: origin, identity, headers: () => ({}) });
  const results = await Promise.all(Array.from({ length: 25 }, () => check()));
  assert.ok(results.every(result => result.ok)); assert.equal(calls, 2);
});
test('unreachable/hanging and oversized readiness responses fail closed', async t => {
  const { origin } = await serverFor(t, () => {});
  const check = createReadinessProbe({ backend: origin, identity, headers: () => ({}), timeoutMs: 50 });
  assert.equal((await check()).error, 'api_readiness_timeout');
  const large = await serverFor(t, (req,res) => json(res, 200, { text: 'x'.repeat(300_000) }));
  assert.equal((await createReadinessProbe({ backend: large.origin, identity, headers: () => ({}) })()).error, 'readiness_response_too_large');
});
test('stream proxy disconnect aborts the actual upstream connection', async t => {
  let closed = 0;
  const upstream = await serverFor(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: hello\n\n');
    const timer = setInterval(() => res.write('data: heartbeat\n\n'), 20);
    res.on('close', () => { clearInterval(timer); closed++; });
  });
  const gateway = await serverFor(t, (req, res) => { forwardResponse({ req, res, target: upstream.origin, headers: {}, stream: true }).catch(() => res.destroy()); });
  const controller = new AbortController();
  const result = await fetch(gateway.origin, { signal: controller.signal });
  const reader = result.body.getReader(); assert.ok((await reader.read()).value.length > 0);
  controller.abort(); await reader.cancel().catch(() => {});
  await until(() => closed === 1);
});
test('streaming proxy honors decoded bytes instead of forwarding gzip Content-Length', async t => {
  const text = JSON.stringify({ value: 'Portugal '.repeat(8_000) }), compressed = gzipSync(text);
  const upstream = await serverFor(t, (req, res) => { res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': compressed.length, 'content-type': 'application/json' }); res.end(compressed); });
  const gateway = await serverFor(t, (req,res) => forwardResponse({ req,res,target:upstream.origin,headers:{} }).catch(() => res.destroy()));
  const response = await fetch(gateway.origin); assert.equal(await response.text(), text);
  assert.equal(response.headers.get('content-encoding'), null);
});
test('streamed response byte budget aborts an over-limit response', async t => {
  const upstream = await serverFor(t, (req,res) => { res.writeHead(200); res.end('x'.repeat(512)); });
  let caught;
  const gateway = await serverFor(t, (req,res) => forwardResponse({ req,res,target:upstream.origin,headers:{},maxBytes:128 }).catch(error => { caught=error;res.destroy(); }));
  await assert.rejects(async () => { const r = await fetch(gateway.origin); await r.text(); });
  await until(() => Boolean(caught)); assert.match(caught.message, /response_too_large/);
});

test('real public gateway preserves signed read-only API, maps, deep links, and false-health prevention', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'vigia-gateway-test-')); t.after(() => rm(fixture, { recursive:true, force:true }));
  await mkdir(path.join(fixture, 'dist'));
  await writeFile(path.join(fixture, 'dist/build-manifest.json'), JSON.stringify(identity));
  await writeFile(path.join(fixture, 'dist/index.html'), '<!doctype html><title>Fixture, not product acceptance</title>');
  const key = 'isolated-test-key-not-a-real-credential-123456';
  let dependencyStatus = 200, upstreamRequests = 0;
  const upstream = await serverFor(t, (req,res) => {
    upstreamRequests++;
    try { verifyOperatorProxyEnvelope({ headers: req.headers, key, method:req.method, path:req.url, releaseId:identity.releaseId }); }
    catch { return json(res, 401, { error: 'signature-invalid' }); }
    if (req.url.endsWith('/release')) return json(res, 200, { ...identity, process: { servicesReady: true } });
    if (req.url.endsWith('/ready')) return json(res, dependencyStatus, { ok:dependencyStatus===200 });
    return json(res, 200, { method:req.method, path:req.url, origin:req.headers.origin, uiProxy:req.headers['x-vigia-ui-proxy'] });
  });
  const reservation = http.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const authority = `127.0.0.1:${port}`, origin = `http://${authority}`;
  const child = spawn(process.execPath, ['infra/public-demo-server.mjs'], { cwd: new URL('../..', import.meta.url), env: { ...process.env, HOST:'127.0.0.1', PORT:String(port), VIGIA_OPERATOR_PACKAGE_ROOT:fixture, VIGIA_OPERATOR_PUBLIC_AUTHORITY:authority, VIGIA_OPERATOR_PUBLIC_SCHEME:'http', VIGIA_OPERATOR_PROXY_KEY:key, VIGIA_BACKEND_URL:upstream.origin }, stdio:['ignore','pipe','pipe'] });
  let listening = false, output=''; child.stdout.on('data',chunk => { output+=chunk; if(output.includes('read-only console')) listening=true; }); child.stderr.on('data',chunk => { output+=chunk; });
  t.after(async () => { child.kill('SIGTERM'); if(child.exitCode===null) await once(child,'exit'); });
  await until(() => listening || child.exitCode!==null); assert.equal(child.exitCode,null,output);
  assert.equal((await fetch(`${origin}/__operator/ready`)).status,200);
  dependencyStatus=503; await delay(1_010);
  const failed=await fetch(`${origin}/__operator/ready`); assert.equal(failed.status,503); assert.equal((await failed.json()).backendVerified,false);
  const response=await fetch(`${origin}/backend/api/v1/basemap/test?z=1`); assert.equal(response.status,200);
  const body=await response.json(); assert.equal(body.uiProxy,'mission-dark-realdata-2.0'); assert.equal(body.origin,origin);
  const before=upstreamRequests;
  assert.equal((await fetch(`${origin}/backend/api/v10/delete`,{method:'POST'})).status,405);
  assert.equal(upstreamRequests,before);
  assert.equal((await fetch(`${origin}/backend/api/v10/release`,{headers:{origin:'https://attacker.invalid'}})).status,403);
  const session=await fetch(`${origin}/backend/api/v10/session`,{method:'POST'}); assert.equal((await session.json()).method,'GET');
  assert.equal((await fetch(`${origin}/incident/example`)).status,200);
  assert.equal((await fetch(`${origin}/assets/missing.js`)).status,404);
  assert.equal((await fetch(`${origin}/`)).headers.get('x-vigia-deployment'),'isolated-demo-synthetic-scenario');
});
