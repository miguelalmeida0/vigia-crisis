import { readFileSync } from 'node:fs';
import path from 'node:path';
import { signFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

export function createFieldNodeJsonResponder({ maxResponseBytes, fieldPrincipalKey }) {
  return (response, status, value, headers = {}) => {
    const body = JSON.stringify(value);
    if (Buffer.byteLength(body) > maxResponseBytes) throw Object.assign(new Error('fieldnet_response_capacity_exceeded'), { statusCode: 507 });
    const principal = response.vigiaFieldPrincipal;
    const key = fieldPrincipalKey(principal?.keyId);
    const signed = principal && key ? signFieldResponse({ keyId: principal.keyId, key, requestNonce: principal.requestNonce, requestBodyHash: principal.requestBodyHash, body: value }) : {};
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...response.corsHeaders, ...signed, ...headers });
    response.end(body);
  };
}

export function createFieldNodeUiAssetServer({ uiRoot }) {
  const assets = new Map([
    ['/fieldnet-lite/', { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-store' }],
    ['/fieldnet-lite/index.html', { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-store' }],
    ['/fieldnet-lite/app.css', { file: 'app.css', type: 'text/css; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/app.js', { file: 'app.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/core.js', { file: 'core.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/report.js', { file: 'report.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/tasks.js', { file: 'tasks.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/task-evidence.js', { file: 'task-evidence.js', type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
    ['/fieldnet-lite/service-worker.js', { file: 'service-worker.js', type: 'text/javascript; charset=utf-8', cache: 'no-cache' }],
    ['/fieldnet-lite/manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json; charset=utf-8', cache: 'public, max-age=300' }]
  ]);
  return (response, pathname) => {
    const asset = assets.get(pathname);
    if (!asset) return false;
    const payload = readFileSync(path.join(uiRoot, asset.file));
    response.writeHead(200, {
      'content-type': asset.type,
      'content-length': payload.length,
      'cache-control': asset.cache,
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'geolocation=(self), camera=(self), microphone=(self)',
      'cross-origin-opener-policy': 'same-origin'
    });
    response.end(payload);
    return true;
  };
}

export function fieldNodeCorsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin) return {};
  let localOrigin = false;
  try {
    const parsed = new URL(origin);
    localOrigin = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  } catch {
    localOrigin = false;
  }
  if (!localOrigin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-vigia-field-key-id, x-vigia-field-timestamp, x-vigia-field-nonce, x-vigia-field-body-sha256, x-vigia-field-signature',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

export function createFieldNodeBodyReader({ bodyTimeoutMs, maxBodyBytes }) {
  return async (request) => {
    if (request.vigiaBody !== undefined) return request.vigiaBody;
    const chunks = [];
    let bytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      request.destroy(new Error('request_body_timeout'));
    }, bodyTimeoutMs);
    timer.unref?.();
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maxBodyBytes) throw Object.assign(new Error('request_body_too_large'), { statusCode: 413 });
        chunks.push(chunk);
      }
    } catch (error) {
      if (timedOut) throw Object.assign(new Error('request_body_timeout'), { statusCode: 408 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!chunks.length) return request.vigiaBody = {};
    try {
      return request.vigiaBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw Object.assign(new Error('invalid_json_body'), { statusCode: 400 });
    }
  };
}
