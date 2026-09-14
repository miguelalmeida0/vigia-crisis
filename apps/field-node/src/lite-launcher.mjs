import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldRequest } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const secret=(name)=>{const direct=process.env[name];if(direct)return direct;const file=process.env[`${name}_FILE`];if(!file)return'';try{return readFileSync(file,'utf8').trim();}catch{return'';}};
const controlSocket = process.env.FIELDNET_CONTROL_SOCKET ? path.resolve(root, process.env.FIELDNET_CONTROL_SOCKET) : null;
const controlKey = secret('FIELDNET_CONTROL_KEY');
const controlKeyId = process.env.FIELDNET_CONTROL_KEY_ID ?? 'field-operator';
const incidentIds = String(process.env.FIELDNET_CONTROL_INCIDENT_SCOPES ?? '').split(',').map((item) => item.trim()).filter(Boolean);
const incidentId = incidentIds.length === 1 && incidentIds[0] !== '*' ? incidentIds[0] : null;
const deviceId = String(process.env.FIELDNET_LITE_DEVICE_ID ?? '').trim();
const listenHost = '127.0.0.1';
const listenPort = Math.max(0, Number(process.env.FIELDNET_LITE_PORT ?? 0));
const maxBodyBytes = Math.max(64 * 1024, Number(process.env.FIELDNET_LITE_PROXY_MAX_BODY_BYTES ?? 1024 * 1024));

if (!controlSocket || controlKey.length < 32 || !incidentId || !deviceId || /\s|@/.test(deviceId)) throw new Error('fieldnet_lite_launcher_configuration_required');

const launchToken = randomBytes(32).toString('base64url');
const gateToken = randomBytes(32).toString('base64url');
const gateHash = sha256(`fieldnet-lite-launcher:${gateToken}`);
let launchClaimed = false;

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return index > 0 ? [item.slice(0, index), decodeURIComponent(item.slice(index + 1))] : [item, ''];
  }));
}

function equal(left, right) {
  const a = Buffer.from(String(left ?? ''));
  const b = Buffer.from(String(right ?? ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function controlRequest({ method = 'GET', pathname, body = null, headers = {} }) {
  const payload = body === null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: controlSocket,
      path: pathname,
      method,
      headers: { host: 'fieldnode.local', ...headers, ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}) }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.once('error', reject);
    request.end(payload);
  });
}

async function bootstrap() {
  const pathname = '/api/fieldnet/ui-sessions';
  const body = { incidentId, deviceId };
  const signed = signFieldRequest({ method: 'POST', path: pathname, keyId: controlKeyId, key: controlKey, body });
  const result = await controlRequest({ method: 'POST', pathname, body, headers: signed });
  if (result.status !== 201 || !result.headers['set-cookie']?.[0]) throw new Error(`fieldnet_lite_session_bootstrap_failed:${result.status}:${result.body.toString('utf8').slice(0, 300)}`);
  return result.headers['set-cookie'][0];
}

function browserGateAllowed(request) {
  const candidate = parseCookies(request.headers.cookie).vigia_fieldnet_launcher;
  return candidate && equal(sha256(`fieldnet-lite-launcher:${candidate}`), gateHash);
}

async function requestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw Object.assign(new Error('fieldnet_lite_proxy_body_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fieldnet-lite.local');
    if (!launchClaimed && request.method === 'GET' && url.pathname === '/fieldnet-lite/' && equal(url.searchParams.get('launch'), launchToken)) {
      const sessionCookie = await bootstrap();
      launchClaimed = true;
      response.writeHead(303, {
        location: '/fieldnet-lite/',
        'cache-control': 'no-store',
        'set-cookie': [sessionCookie, `vigia_fieldnet_launcher=${encodeURIComponent(gateToken)}; HttpOnly; SameSite=Strict; Path=/`]
      });
      response.end();
      return;
    }
    if (!browserGateAllowed(request)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('FieldNet Lite requires its one-time authorized launch URL.');
      return;
    }
    if (url.pathname === '/') {
      response.writeHead(302, { location: '/fieldnet-lite/', 'cache-control': 'no-store' });
      response.end();
      return;
    }
    if (!url.pathname.startsWith('/fieldnet-lite/') && !url.pathname.startsWith('/api/fieldnet/')) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      response.end('Not found');
      return;
    }
    const payload = ['GET', 'HEAD'].includes(request.method) ? Buffer.alloc(0) : await requestBody(request);
    const forwardedHeaders = {};
    for (const name of ['accept', 'accept-language', 'content-type', 'cookie', 'if-none-match', 'x-vigia-field-csrf']) if (request.headers[name]) forwardedHeaders[name] = request.headers[name];
    if (payload.length) forwardedHeaders['content-length'] = payload.length;
    const upstream = await new Promise((resolve, reject) => {
      const call = http.request({ socketPath: controlSocket, path: `${url.pathname}${url.search}`, method: request.method, headers: { host: 'fieldnode.local', ...forwardedHeaders } }, (result) => resolve(result));
      call.once('error', reject);
      call.end(payload);
    });
    const headers = {};
    for (const name of ['content-type', 'content-length', 'cache-control', 'content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy', 'location', 'set-cookie']) if (upstream.headers[name]) headers[name] = upstream.headers[name];
    response.writeHead(upstream.statusCode ?? 502, headers);
    upstream.pipe(response);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    response.writeHead(error.statusCode ?? 502, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ error: error.message ?? 'fieldnet_lite_launcher_error' }));
  }
});

server.maxConnections = 16;
server.headersTimeout = 10_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 5_000;
server.listen(listenPort, listenHost, () => {
  const address = server.address();
  process.stdout.write(`${JSON.stringify({
    event: 'FIELDNET_LITE_READY',
    url: `http://${listenHost}:${address.port}/fieldnet-lite/?launch=${encodeURIComponent(launchToken)}`,
    incidentId,
    deviceId,
    controlTransport: 'UNIX_SOCKET_SIGNED_BOOTSTRAP',
    controlKeyExposedToBrowser: false
  })}\n`);
});

const close = () => server.close(() => process.exit(0));
process.on('SIGINT', close);
process.on('SIGTERM', close);
