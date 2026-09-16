// Public read-only gateway for the ISOLATED VIGIA PORTFOLIO DEMO.
//
// This is a sibling of infra/public-live-server.mjs (the production public
// gateway), not a modification of it. Behaviourally identical (same proxy
// allowlist, same CSP, same read-only enforcement, same same-origin checks)
// except every disclaimer is unambiguous that this deployment serves a
// synthetic, labelled exercise scenario against an isolated database, never
// real incidents or production truth.

import http from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';

const packageRoot = resolve(process.env.VIGIA_OPERATOR_PACKAGE_ROOT || 'apps/operator-console');
const root = resolve(packageRoot, process.env.VIGIA_OPERATOR_STATIC_ROOT || 'dist');
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4191);
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
const scheme = String(process.env.VIGIA_OPERATOR_PUBLIC_SCHEME || 'https').trim();
const proxyKey = String(process.env.VIGIA_OPERATOR_PROXY_KEY || '').trim();
const backendUrl = new URL(process.env.VIGIA_BACKEND_URL || 'http://127.0.0.1:4178');

if (!root.startsWith(`${packageRoot}/`) && root !== packageRoot) throw new Error('public_demo_static_root_invalid');
if (!/^[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(authority)) throw new Error('public_demo_authority_invalid');
if (!['http', 'https'].includes(scheme)) throw new Error('public_demo_scheme_invalid');
if (proxyKey.length < 32) throw new Error('public_demo_proxy_key_invalid');
if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password || backendUrl.pathname !== '/') throw new Error('public_demo_backend_url_invalid');

const consoleOrigin = `${scheme}://${authority}`;
const backend = backendUrl.origin;
const buildIdentity = JSON.parse(readFileSync(join(root, 'build-manifest.json'), 'utf8'));
if (!buildIdentity?.releaseId || !buildIdentity?.codeStateHash || !buildIdentity?.operationalDataHash) throw new Error('public_demo_build_identity_invalid');

const DEMO_DISCLAIMER = 'DEMO / SYNTHETIC SCENARIO. This deployment runs against an isolated demo database seeded with one clearly labelled, fictional exercise incident. It is not connected to production, contains no real incidents, and has no operational authority. See VIGIA live (production) for the real system.';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.woff2': 'font/woff2'
};
const consoleCsp = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'";
const maxProxyResponseBytes = 32_000_000;

function securityHeaders(res, { document = false } = {}) {
  if (document) res.setHeader('Content-Security-Policy', consoleCsp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-VIGIA-Deployment', 'isolated-demo-synthetic-scenario');
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
    // Required by assertLocalVisualizationRequest() (route-security-policy.mjs)
    // for basemap/imagery tile routes. apps/operator-console/server.mjs — the
    // production console proxy this gateway parallels — has always sent this;
    // its absence here made every proxied basemap tile request 403 permanently.
    'x-vigia-ui-proxy': 'mission-dark-realdata-2.0',
    ...signOperatorProxyRequest({
      key: proxyKey,
      keyId: 'public-portfolio-demo-read',
      releaseId: buildIdentity.releaseId,
      method,
      path,
      intent: 'portfolio_demo_read_only'
    })
  };
}

async function proxyBuffered(req, res, upstreamPath, { forceGet = false } = {}) {
  if (!upstreamPath.startsWith('/') || upstreamPath.startsWith('//') || upstreamPath.includes('\\')) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  const target = new URL(`.${upstreamPath}`, `${backend}/`);
  if (target.origin !== backend) return writeJson(res, 400, { error: 'public_demo_target_invalid' });
  const method = forceGet ? 'GET' : String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) return writeJson(res, 405, { error: 'public_demo_read_only', message: 'This isolated VIGIA demo deployment is read-only.' }, { allow: 'GET, HEAD, OPTIONS' });
  const upstreamRequestPath = `${target.pathname}${target.search}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
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
    console.error(JSON.stringify({ level: 'error', component: 'public_demo_gateway', event: 'proxy_failed', path: upstreamRequestPath, error: String(error?.message ?? error).slice(0, 180) }));
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
      ok: true, frontend: 'operator-console', publicDemo: true, isolatedDemo: true, backendPowered: true, readOnly: true,
      disclaimer: DEMO_DISCLAIMER,
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
    if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only', message: 'This isolated VIGIA demo deployment is read-only.' }, { allow: 'GET, HEAD, OPTIONS' });
    const upstreamPath = `${url.pathname.slice('/backend'.length)}${url.search}`;
    if (/\/stream$/.test(url.pathname)) return proxyStream(req, res, upstreamPath);
    return proxyBuffered(req, res, upstreamPath);
  }

  if (!['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error: 'public_demo_read_only' }, { allow: 'GET, HEAD' });
  const raw = decodeURIComponent(url.pathname), safe = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  let file = join(root, safe === '/' ? 'index.html' : safe);
  if (!file.startsWith(root)) return writeJson(res, 400, { error: 'public_demo_path_invalid' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const metadata = statSync(file), isDocument = extname(file) === '.html';
  securityHeaders(res, { document: isDocument });
  const etag = `W/"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}"`;
  res.setHeader('Cache-Control', isDocument ? 'no-store' : 'public, max-age=0, must-revalidate');
  if (!isDocument) { res.setHeader('ETag', etag); if (req.headers['if-none-match'] === etag) { res.writeHead(304); return res.end(); } }
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  if (req.method === 'HEAD') { res.setHeader('Content-Length', String(metadata.size)); return res.end(); }
  createReadStream(file).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
}

const server = http.createServer((req, res) => { handle(req, res).catch(error => writeJson(res, error instanceof URIError ? 400 : 500, { error: 'public_demo_request_failed' })); });
server.maxConnections = 128; server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxRequestsPerSocket = 100;
server.listen(port, host, () => console.log(`VIGIA ISOLATED DEMO (synthetic scenario) read-only console on ${host}:${port} for ${consoleOrigin}`));
const shutdown = () => server.close(() => process.exit(0)); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
