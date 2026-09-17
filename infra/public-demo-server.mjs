// Public, read-only gateway for the isolated synthetic portfolio exercise.
// The production gateway infra/public-live-server.mjs is deliberately separate.
import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';
import { RequestGate } from '../apps/api/src/shared/request-gate.mjs';
import { createReadinessProbe, forwardResponse } from './demo/gateway-io.mjs';

const packageRoot = resolve(process.env.VIGIA_OPERATOR_PACKAGE_ROOT || 'apps/operator-console');
const root = resolve(packageRoot, process.env.VIGIA_OPERATOR_STATIC_ROOT || 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4191);
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
const scheme = String(process.env.VIGIA_OPERATOR_PUBLIC_SCHEME || 'https').trim();
const proxyKey = String(process.env.VIGIA_OPERATOR_PROXY_KEY || '').trim();
const backendUrl = new URL(process.env.VIGIA_BACKEND_URL || 'http://127.0.0.1:4178');
if (!root.startsWith(`${packageRoot}${sep}`) && root !== packageRoot) throw new Error('public_demo_static_root_invalid');
if (!/^[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(authority)) throw new Error('public_demo_authority_invalid');
if (!['http', 'https'].includes(scheme)) throw new Error('public_demo_scheme_invalid');
if (proxyKey.length < 32) throw new Error('public_demo_proxy_key_invalid');
if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password || backendUrl.pathname !== '/') throw new Error('public_demo_backend_url_invalid');
const consoleOrigin = `${scheme}://${authority}`, backend = backendUrl.origin;
const buildIdentity = JSON.parse(readFileSync(join(root, 'build-manifest.json'), 'utf8'));
if (!buildIdentity?.releaseId || !buildIdentity?.codeStateHash || !buildIdentity?.operationalDataHash) throw new Error('public_demo_build_identity_invalid');
const DEMO_DISCLAIMER = 'DEMO / SYNTHETIC SCENARIO. This deployment runs against an isolated demo database seeded with one clearly labelled, fictional exercise incident. It is not connected to production, contains no real incidents, and has no operational authority. See VIGIA live (production) for the real system.';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.woff2': 'font/woff2'
};
const consoleCsp = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'";
const basemapGate = new RequestGate({ maxConcurrent: 16, maxConcurrentPerClient: 8, maxRequestsPerWindow: 600, windowMs: 60_000 });
const streamGate = new RequestGate({ maxConcurrent: 8, maxConcurrentPerClient: 4, maxRequestsPerWindow: 120, windowMs: 60_000 });
function securityHeaders(res, { document = false } = {}) {
  if (document) res.setHeader('Content-Security-Policy', consoleCsp);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('X-VIGIA-Deployment', 'isolated-demo-synthetic-scenario');
}
function writeJson(res, status, payload, extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) { res.destroy(); return; }
  securityHeaders(res);
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store', ...extra }); res.end(body);
}
function sameOriginRequest(req) {
  const origin = String(req.headers.origin || ''), fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return (!origin || origin === consoleOrigin) && (!fetchSite || ['same-origin', 'none'].includes(fetchSite));
}
function signedHeaders(method, path, req = { headers: {} }) {
  return {
    accept: String(req.headers.accept || 'application/json'), origin: consoleOrigin, 'sec-fetch-site': 'same-origin',
    'x-vigia-ui-proxy': 'mission-dark-realdata-2.0',
    ...signOperatorProxyRequest({ key: proxyKey, keyId: 'public-portfolio-demo-read', releaseId: buildIdentity.releaseId, method, path, intent: 'portfolio_demo_read_only' })
  };
}
const checkReadiness = createReadinessProbe({ backend, identity: buildIdentity, headers: path => signedHeaders('GET', path) });
async function proxy(req, res, upstreamPath, { forceGet = false, stream = false, timeoutMs = 25_000 } = {}) {
  if (!upstreamPath.startsWith('/') || upstreamPath.startsWith('//') || upstreamPath.includes('\\')) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  const target = new URL(`.${upstreamPath}`, `${backend}/`);
  if (target.origin !== backend) return writeJson(res, 400, { error: 'public_demo_target_invalid' });
  const method = forceGet ? 'GET' : String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return writeJson(res, 405, { error: 'public_demo_read_only' }, { allow: 'GET, HEAD, OPTIONS' });
  const headers = signedHeaders(method, `${target.pathname}${target.search}`, req);
  for (const name of ['if-none-match', 'if-modified-since', 'user-agent']) if (req.headers[name]) headers[name] = String(req.headers[name]);
  try { await forwardResponse({ req, res, target, headers, method, stream, timeoutMs }); }
  catch (error) {
    if (res.destroyed) return;
    console.error(JSON.stringify({ level: 'error', component: 'public_demo_gateway', event: 'proxy_failed', path: target.pathname, error: String(error?.message ?? error).slice(0, 180) }));
    writeJson(res, 502, { error: 'public_demo_backend_unavailable' });
  }
}
async function handle(req, res) {
  securityHeaders(res);
  if (String(req.headers.host || '') !== authority) return writeJson(res, 421, { error: 'public_demo_authority_rejected' });
  const url = new URL(req.url || '/', consoleOrigin);
  if (url.pathname === '/__operator/ready') {
    if (req.method !== 'GET') return writeJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    const readiness = await checkReadiness();
    return writeJson(res, readiness.ok ? 200 : 503, {
      ...readiness, frontend: 'operator-console', publicDemo: true, isolatedDemo: true, backendPowered: true, readOnly: true,
      disclaimer: DEMO_DISCLAIMER, operationalRuntimeCertified: false,
      releaseId: buildIdentity.releaseId, codeStateHash: buildIdentity.codeStateHash, operationalDataHash: buildIdentity.operationalDataHash,
      releaseStatementHash: buildIdentity.releaseStatementHash, sourceHash: buildIdentity.operatorSourceHash, assetDigest: buildIdentity.assetDigest
    });
  }
  if (url.pathname === '/backend/__health') return proxy(req, res, '/api/v10/health', { forceGet: true });
  if (url.pathname === '/backend/__ready') return proxy(req, res, '/api/v10/ready', { forceGet: true });
  if (url.pathname === '/backend/__release') return proxy(req, res, '/api/v10/release', { forceGet: true });
  if (url.pathname.startsWith('/backend/')) {
    if (!sameOriginRequest(req)) return writeJson(res, 403, { error: 'public_demo_origin_rejected' });
    if (req.method === 'OPTIONS') { res.writeHead(204, { allow: 'GET, HEAD, OPTIONS' }); return res.end(); }
    if (url.pathname === '/backend/api/v10/session' && req.method === 'POST') return proxy(req, res, '/api/v10/session', { forceGet: true });
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only' }, { allow: 'GET, HEAD, OPTIONS' });
    const upstreamPath = `${url.pathname.slice('/backend'.length)}${url.search}`, clientKey = req.socket?.remoteAddress ?? 'unknown';
    if (/\/stream$/.test(url.pathname)) return streamGate.run(clientKey, () => proxy(req, res, upstreamPath, { stream: true }));
    if (url.pathname.startsWith('/backend/api/v1/basemap/')) return basemapGate.run(clientKey, () => proxy(req, res, upstreamPath, { timeoutMs: 6_000 }));
    return proxy(req, res, upstreamPath);
  }
  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only' }, { allow: 'GET, HEAD' });
  const raw = decodeURIComponent(url.pathname), safe = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, safe === '/' ? 'index.html' : safe);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (extname(safe) || safe.startsWith('/assets/')) return writeJson(res, 404, { error: 'public_demo_asset_not_found' });
    file = join(root, 'index.html');
  }
  const metadata = statSync(file), isDocument = extname(file) === '.html';
  securityHeaders(res, { document: isDocument });
  const etag = `W/"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}"`;
  res.setHeader('Cache-Control', isDocument ? 'no-store' : 'public, max-age=0, must-revalidate');
  if (!isDocument) { res.setHeader('ETag', etag); if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); } }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') { res.setHeader('Content-Length', String(metadata.size)); return res.end(); }
  createReadStream(file).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
}
const server = http.createServer((req, res) => { handle(req, res).catch(error => writeJson(res, error instanceof URIError ? 400 : error.statusCode ?? 500, { error: 'public_demo_request_failed' })); });
server.maxConnections = 128; server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxRequestsPerSocket = 100;
server.listen(port, host, () => console.log(`VIGIA ISOLATED DEMO (synthetic scenario) read-only console on ${host}:${port} for ${consoleOrigin}`));
const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 2_500).unref(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
