import http from 'node:http';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const packageRoot = resolve(process.env.VIGIA_OPERATOR_PACKAGE_ROOT || '/opt/vigia/apps/operator-console');
const root = resolve(packageRoot, process.env.VIGIA_OPERATOR_STATIC_ROOT || 'dist');
if (!root.startsWith(`${packageRoot}/`) && root !== packageRoot) throw new Error('public_operator_static_root_invalid');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4190);
const authority = String(process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
const scheme = String(process.env.VIGIA_OPERATOR_PUBLIC_SCHEME || 'https').trim();
if (!/^[A-Za-z0-9.-]+(?::\d{2,5})?$/.test(authority)) throw new Error('public_operator_authority_invalid');
if (!['http', 'https'].includes(scheme)) throw new Error('public_operator_scheme_invalid');
const consoleOrigin = `${scheme}://${authority}`;

const backendUrl = new URL(process.env.VIGIA_BACKEND_URL || 'http://api:4177');
if (!['http:', 'https:'].includes(backendUrl.protocol) || backendUrl.username || backendUrl.password || backendUrl.pathname !== '/') throw new Error('public_operator_backend_url_invalid');
const backend = backendUrl.origin;

const buildIdentity = (() => {
  try { return JSON.parse(readFileSync(join(root, 'build-manifest.json'), 'utf8')); }
  catch { return null; }
})();
if (!buildIdentity) throw new Error('public_operator_build_identity_missing');

const expectedReleaseId = String(process.env.VIGIA_RELEASE_ID || '').trim();
const expectedOperationalDataHash = String(process.env.VIGIA_OPERATIONAL_DATA_HASH || '').trim();
const expectedStatementHash = String(process.env.VIGIA_APPROVED_RELEASE_STATEMENT_SHA256 || '').trim();
if (!expectedReleaseId || buildIdentity.releaseId !== expectedReleaseId || buildIdentity.operationalDataHash !== expectedOperationalDataHash || buildIdentity.releaseStatementHash !== expectedStatementHash) throw new Error('public_operator_release_identity_mismatch');

const portugalBoundaryPath = resolve(process.env.VIGIA_PORTUGAL_BOUNDARY_PATH || '/opt/vigia/data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json');
const boundaryBytes = readFileSync(portugalBoundaryPath);
if (boundaryBytes.length > 8 * 1024 * 1024 || `sha256:${createHash('sha256').update(boundaryBytes).digest('hex')}` !== buildIdentity?.boundary?.sha256 || boundaryBytes.length !== buildIdentity?.boundary?.bytes) throw new Error('public_operator_boundary_identity_mismatch');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.tif': 'image/tiff', '.tiff': 'image/tiff'
};
const consoleCsp = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; media-src 'self' blob:; worker-src 'self'; manifest-src 'self'";
const maxProxyResponseBytes = 32_000_000;

function securityHeaders(res, { document = false } = {}) {
  if (document) res.setHeader('Content-Security-Policy', consoleCsp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
}
function writeJson(res, status, payload, extra = {}) {
  securityHeaders(res);
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'content-length':body.length, 'cache-control':'no-store', ...extra });
  res.end(body);
}
function sameOriginRequest(req) {
  const origin = String(req.headers.origin || '');
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return (!origin || origin === consoleOrigin) && (!fetchSite || ['same-origin', 'none'].includes(fetchSite));
}
async function proxyRead(req, res, upstreamPath, { forceGet = false } = {}) {
  if (!upstreamPath.startsWith('/') || upstreamPath.startsWith('//') || upstreamPath.includes('\\')) return writeJson(res, 400, { error:'public_demo_path_invalid' });
  const target = new URL(`.${upstreamPath}`, `${backend}/`);
  if (target.origin !== backend) return writeJson(res, 400, { error:'public_demo_target_invalid' });
  const method = forceGet ? 'GET' : String(req.method || 'GET').toUpperCase();
  if (!['GET','HEAD','OPTIONS'].includes(method)) return writeJson(res, 405, { error:'public_demo_read_only', message:'This public VIGIA deployment is read-only.' }, { allow:'GET, HEAD, OPTIONS' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const headers = { accept:String(req.headers.accept || 'application/json'), origin:consoleOrigin, 'sec-fetch-site':'same-origin', 'x-vigia-public-demo':'1' };
    for (const name of ['if-none-match', 'if-modified-since', 'user-agent']) if (req.headers[name]) headers[name] = req.headers[name];
    const response = await fetch(target, { method, headers, redirect:'manual', signal:controller.signal });
    const chunks = []; let total = 0;
    if (response.body) for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk); total += bytes.length;
      if (total > maxProxyResponseBytes) throw new Error('public_demo_response_too_large');
      chunks.push(bytes);
    }
    const out = Buffer.concat(chunks, total), copy = {};
    for (const name of ['content-type','cache-control','etag','last-modified','x-vigia-provider','x-vigia-acquired-at','x-vigia-last-good-at','x-vigia-source-state','x-vigia-provenance','x-vigia-correlation-id','x-vigia-release-id']) {
      const value = response.headers.get(name); if (value) copy[name] = value;
    }
    copy['content-length'] = String(out.length);
    securityHeaders(res); res.writeHead(response.status, copy); if (method === 'HEAD') res.end(); else res.end(out);
  } catch {
    writeJson(res, 502, { error:'public_demo_backend_unavailable' });
  } finally { clearTimeout(timer); }
}

async function handle(req, res) {
  securityHeaders(res);
  if (String(req.headers.host || '') !== authority) return writeJson(res, 421, { error:'public_demo_authority_rejected' });
  const url = new URL(req.url || '/', consoleOrigin);

  if (url.pathname === '/__operator/ready') {
    if (req.method !== 'GET') return writeJson(res, 405, { error:'method_not_allowed' }, { allow:'GET' });
    return writeJson(res, 200, {
      ok:true, frontend:'operator-console', version:'public-demo-1', publicDemo:true, readOnly:true,
      disclaimer:'Research / portfolio system. Read-only. Not an operational emergency service.',
      releaseId:buildIdentity.releaseId, codeStateHash:buildIdentity.codeStateHash, operationalDataHash:buildIdentity.operationalDataHash,
      releaseStatementHash:buildIdentity.releaseStatementHash, sourceHash:buildIdentity.operatorSourceHash, assetDigest:buildIdentity.assetDigest
    });
  }

  if (url.pathname === '/__operator/portugal-boundary') {
    if (req.method !== 'GET') return writeJson(res, 405, { error:'method_not_allowed' }, { allow:'GET' });
    const metadata = statSync(portugalBoundaryPath);
    securityHeaders(res); res.writeHead(200, { 'content-type':'application/json; charset=utf-8', 'content-length':metadata.size, 'cache-control':'public, max-age=86400', 'x-vigia-content-sha256':buildIdentity.boundary.sha256 });
    createReadStream(portugalBoundaryPath).pipe(res); return;
  }

  if (url.pathname === '/backend/__health') return proxyRead(req, res, '/api/v10/health', { forceGet:true });

  if (url.pathname.startsWith('/backend/')) {
    if (!sameOriginRequest(req)) return writeJson(res, 403, { error:'public_demo_origin_rejected' });
    if (req.method === 'OPTIONS') { securityHeaders(res); res.writeHead(204, { allow:'GET, HEAD, OPTIONS' }); res.end(); return; }
    // The canonical console POSTs here to create an operator session. Public-demo mode maps only
    // this bootstrap call to the API's existing unsigned public GET session and blocks all other writes.
    if (url.pathname === '/backend/api/v10/session' && req.method === 'POST') return proxyRead(req, res, '/api/v10/session', { forceGet:true });
    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error:'public_demo_read_only', message:'This public VIGIA deployment is read-only.' }, { allow:'GET, HEAD, OPTIONS' });
    if (/\/stream$/.test(url.pathname)) return writeJson(res, 404, { error:'public_demo_stream_disabled' });
    return proxyRead(req, res, `${url.pathname.slice('/backend'.length)}${url.search}`);
  }

  if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) return writeJson(res, 405, { error:'public_demo_read_only' }, { allow:'GET, HEAD' });
  const raw = decodeURIComponent(url.pathname), safe = normalize(raw).replace(/^(\.\.(\/|\\|$))+/, '');
  let path = join(root, safe === '/' ? 'index.html' : safe);
  if (!path.startsWith(root)) return writeJson(res, 400, { error:'public_demo_path_invalid' });
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(root, 'index.html');
  const assetStat = statSync(path), isDocument = extname(path) === '.html';
  securityHeaders(res, { document:isDocument });
  const etag = `W/\"${assetStat.size.toString(16)}-${Math.trunc(assetStat.mtimeMs).toString(16)}\"`;
  res.setHeader('Cache-Control', isDocument ? 'no-store' : 'public, max-age=0, must-revalidate');
  if (!isDocument) { res.setHeader('ETag', etag); if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; } }
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  if (req.method === 'HEAD') { res.setHeader('Content-Length', String(assetStat.size)); res.end(); return; }
  createReadStream(path).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end(); }).pipe(res);
}

const server = http.createServer((req,res) => { handle(req,res).catch((error) => writeJson(res, error instanceof URIError ? 400 : 500, { error:'public_demo_request_failed' })); });
server.maxConnections = 128; server.headersTimeout = 10_000; server.requestTimeout = 30_000; server.keepAliveTimeout = 5_000; server.maxRequestsPerSocket = 100;
server.listen(port, host, () => console.log(`VIGIA public read-only demo running on ${host}:${port} for ${consoleOrigin}`));
const shutdown = () => server.close(() => process.exit(0)); process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
