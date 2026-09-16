import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';
import { RequestGate } from '../apps/api/src/shared/request-gate.mjs';

const packageRoot = resolve(process.env.VIGIA_OPERATOR_PACKAGE_ROOT || 'apps/operator-console');
const root = resolve(packageRoot, process.env.VIGIA_OPERATOR_STATIC_ROOT || 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4190);
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
const scheme = String(process.env.VIGIA_OPERATOR_PUBLIC_SCHEME || 'https').trim();
const proxyKey = String(process.env.VIGIA_OPERATOR_PROXY_KEY || '').trim();
const backendUrl = new URL(process.env.VIGIA_BACKEND_URL || 'http://127.0.0.1:4177');

if (!root.startsWith(`${packageRoot}/`) && root !== packageRoot) throw new Error('public_operator_static_root_invalid');
if (!/^[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(authority)) throw new Error('public_operator_authority_invalid');
if (!['http', 'https'].includes(scheme)) throw new Error('public_operator_scheme_invalid');
if (proxyKey.length < 32) throw new Error('public_operator_proxy_key_invalid');
if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password || backendUrl.pathname !== '/') throw new Error('public_operator_backend_url_invalid');

const consoleOrigin = `${scheme}://${authority}`;
const backend = backendUrl.origin;
const buildIdentity = JSON.parse(readFileSync(join(root, 'build-manifest.json'), 'utf8'));
if (!buildIdentity?.releaseId || !buildIdentity?.codeStateHash || !buildIdentity?.operationalDataHash) throw new Error('public_operator_build_identity_invalid');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.woff2': 'font/woff2'
};
const consoleCsp = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'";
const maxProxyResponseBytes = 32_000_000;
// A map viewport pan/zoom can burst dozens of concurrent tile requests. This
// gateway used to forward every one of them with no concurrency ceiling of
// its own and a 25s timeout (5.5x the backend's own 4.5s upstream tile
// timeout), so during any backend slowdown those requests piled up here,
// each holding an open socket and buffered response for up to 25s — adding
// gateway-side memory/socket pressure on top of whatever was already
// degrading the backend, and only then surfacing to the browser as a 503 or
// abort. Gate tile requests so a burst fails fast instead of queuing.
const basemapGate = new RequestGate({ maxConcurrent: 16, maxConcurrentPerClient: 8, maxRequestsPerWindow: 600, windowMs: 60_000 });
const basemapUpstreamTimeoutMs = 6_000;

function securityHeaders(res, { document = false } = {}) {
  if (document) res.setHeader('Content-Security-Policy', consoleCsp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function writeJson(res, status, payload, extra = {}) {
  securityHeaders(res);
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store', ...extra });
  res.end(body);
}

function sameOriginRequest(req) {
  const origin = String(req.headers.origin || '');
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return (!origin || origin === consoleOrigin) && (!fetchSite || ['same-origin', 'none'].includes(fetchSite));
}

function signedHeaders(method, path, req) {
  return {
    accept: String(req.headers.accept || 'application/json'),
    origin: consoleOrigin,
    'sec-fetch-site': 'same-origin',
    ...signOperatorProxyRequest({
      key: proxyKey,
      keyId: 'public-portfolio-read',
      releaseId: buildIdentity.releaseId,
      method,
      path,
      intent: 'portfolio_read_only'
    })
  };
}

async function proxyBuffered(req, res, upstreamPath, { forceGet = false, timeoutMs = 25_000 } = {}) {
  if (!upstreamPath.startsWith('/') || upstreamPath.startsWith('//') || upstreamPath.includes('\\')) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  const target = new URL(`.${upstreamPath}`, `${backend}/`);
  if (target.origin !== backend) return writeJson(res, 400, { error: 'public_demo_target_invalid' });
  const method = forceGet ? 'GET' : String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return writeJson(res, 405, { error: 'public_demo_read_only', message: 'This public VIGIA deployment is read-only.' }, { allow: 'GET, HEAD, OPTIONS' });
  const upstreamRequestPath = `${target.pathname}${target.search}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = signedHeaders(method, upstreamRequestPath, req);
    for (const name of ['if-none-match', 'if-modified-since', 'user-agent']) if (req.headers[name]) headers[name] = String(req.headers[name]);
    const response = await fetch(target, { method, headers, redirect: 'manual', signal: controller.signal });
    const chunks = []; let total = 0;
    if (response.body) for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk); total += bytes.length;
      if (total > maxProxyResponseBytes) throw new Error('public_demo_response_too_large');
      chunks.push(bytes);
    }
    const out = Buffer.concat(chunks, total), copy = {};
    for (const name of ['content-type', 'cache-control', 'etag', 'last-modified', 'x-vigia-provider', 'x-vigia-acquired-at', 'x-vigia-last-good-at', 'x-vigia-source-state', 'x-vigia-provenance', 'x-vigia-correlation-id', 'x-vigia-release-id']) {
      const value = response.headers.get(name); if (value) copy[name] = value;
    }
    copy['content-length'] = String(out.length);
    securityHeaders(res); res.writeHead(response.status, copy); if (method === 'HEAD') res.end(); else res.end(out);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', component: 'public_gateway', event: 'proxy_failed', path: upstreamRequestPath, error: String(error?.message ?? error).slice(0, 180) }));
    writeJson(res, 502, { error: 'public_demo_backend_unavailable' });
  } finally { clearTimeout(timer); }
}

async function proxyStream(req, res, upstreamPath) {
  const target = new URL(`.${upstreamPath}`, `${backend}/`);
  const upstreamRequestPath = `${target.pathname}${target.search}`;
  try {
    const response = await fetch(target, { method: 'GET', headers: signedHeaders('GET', upstreamRequestPath, req), redirect: 'manual' });
    securityHeaders(res);
    res.writeHead(response.status, {
      'content-type': response.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    if (!response.body) return res.end();
    const abort = () => response.body?.cancel?.().catch?.(() => undefined);
    req.once('close', abort);
    for await (const chunk of response.body) {
      if (res.destroyed) break;
      if (!res.write(Buffer.from(chunk))) await new Promise(resolve => res.once('drain', resolve));
    }
    if (!res.destroyed) res.end();
  } catch {
    if (!res.headersSent) writeJson(res, 502, { error: 'public_demo_backend_unavailable' }); else res.destroy();
  }
}

async function handle(req, res) {
  securityHeaders(res);
  if (String(req.headers.host || '') !== authority) return writeJson(res, 421, { error: 'public_demo_authority_rejected' });
  const url = new URL(req.url || '/', consoleOrigin);

  if (url.pathname === '/__operator/ready') {
    if (req.method !== 'GET') return writeJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
    return writeJson(res, 200, {
      ok: true, frontend: 'operator-console', publicDemo: true, backendPowered: true, readOnly: true,
      disclaimer: 'Portfolio system. Read-only gateway. Not an operational emergency service.',
      releaseId: buildIdentity.releaseId, codeStateHash: buildIdentity.codeStateHash, operationalDataHash: buildIdentity.operationalDataHash,
      releaseStatementHash: buildIdentity.releaseStatementHash, sourceHash: buildIdentity.operatorSourceHash, assetDigest: buildIdentity.assetDigest
    });
  }

  if (url.pathname === '/backend/__health') return proxyBuffered(req, res, '/api/v10/health', { forceGet: true });
  if (url.pathname === '/backend/__ready') return proxyBuffered(req, res, '/api/v10/ready', { forceGet: true });
  if (url.pathname === '/backend/__release') return proxyBuffered(req, res, '/api/v10/release', { forceGet: true });

  if (url.pathname.startsWith('/backend/')) {
    if (!sameOriginRequest(req)) return writeJson(res, 403, { error: 'public_demo_origin_rejected' });
    if (req.method === 'OPTIONS') { securityHeaders(res); res.writeHead(204, { allow: 'GET, HEAD, OPTIONS' }); return res.end(); }
    if (url.pathname === '/backend/api/v10/session' && req.method === 'POST') return proxyBuffered(req, res, '/api/v10/session', { forceGet: true });
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only', message: 'This public VIGIA deployment is read-only.' }, { allow: 'GET, HEAD, OPTIONS' });
    const upstreamPath = `${url.pathname.slice('/backend'.length)}${url.search}`;
    if (/\/stream$/.test(url.pathname)) return proxyStream(req, res, upstreamPath);
    if (url.pathname.startsWith('/backend/api/v1/basemap/')) {
      const clientKey = req.socket?.remoteAddress ?? 'unknown';
      try { return await basemapGate.run(clientKey, () => proxyBuffered(req, res, upstreamPath, { timeoutMs: basemapUpstreamTimeoutMs })); }
      catch (error) { return writeJson(res, error?.statusCode ?? 503, { error: error?.message ?? 'public_live_basemap_capacity_exhausted' }); }
    }
    return proxyBuffered(req, res, upstreamPath);
  }

  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only' }, { allow: 'GET, HEAD' });
  const raw = decodeURIComponent(url.pathname), safe = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(root)) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const metadata = statSync(file), isDocument = extname(file) === '.html';
  securityHeaders(res, { document: isDocument });
  const etag = `W/\"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}\"`;
  res.setHeader('Cache-Control', isDocument ? 'no-store' : 'public, max-age=0, must-revalidate');
  if (!isDocument) { res.setHeader('ETag', etag); if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); } }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') { res.setHeader('Content-Length', String(metadata.size)); return res.end(); }
  createReadStream(file).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
}

const server = http.createServer((req, res) => { handle(req, res).catch(error => writeJson(res, error instanceof URIError ? 400 : 500, { error: 'public_demo_request_failed' })); });
server.maxConnections = 128; server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxRequestsPerSocket = 100;
server.listen(port, host, () => console.log(`VIGIA backend-powered read-only console on ${host}:${port} for ${consoleOrigin}`));
const shutdown = () => server.close(() => process.exit(0)); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
