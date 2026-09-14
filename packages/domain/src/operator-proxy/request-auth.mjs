import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const domain = 'vigia-operator-proxy-request-v1';
const emptyHash = createHash('sha256').update(Buffer.alloc(0)).digest('hex');
const text = value => String(value ?? '');
const hashBytes = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(value ?? '')).digest('hex');
const safeEqual = (left, right) => {
  const a = Buffer.from(text(left)); const b = Buffer.from(text(right));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
};

function material({ keyId, releaseId, method, path, timestamp, nonce, bodyHash, intent = '' }) {
  return [domain, keyId, releaseId, text(method).toUpperCase(), path, timestamp, nonce, bodyHash, intent].join('\0');
}

export function operatorProxyBodyHash(bodyBytes = Buffer.alloc(0)) { return hashBytes(bodyBytes); }

export function signOperatorProxyRequest({
  key, keyId = 'operator-console', releaseId, method, path, bodyBytes = Buffer.alloc(0),
  timestamp = Date.now(), nonce = randomBytes(24).toString('base64url'), intent = '',
}) {
  if (text(key).length < 32) throw new Error('operator_proxy_key_invalid');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(text(keyId))) throw new Error('operator_proxy_key_id_invalid');
  if (!text(releaseId) || !text(path).startsWith('/') || text(path).startsWith('//') || text(path).includes('\\')) throw new Error('operator_proxy_target_invalid');
  if (!Number.isInteger(Number(timestamp)) || !/^[A-Za-z0-9_-]{32}$/.test(text(nonce))) throw new Error('operator_proxy_envelope_invalid');
  const bodyHash = hashBytes(bodyBytes), values = { keyId:text(keyId), releaseId:text(releaseId), method:text(method).toUpperCase(), path:text(path), timestamp:text(timestamp), nonce:text(nonce), bodyHash, intent:text(intent) };
  const signature = createHmac('sha256', text(key)).update(material(values)).digest('base64url');
  return {
    'x-vigia-operator-key-id': values.keyId,
    'x-vigia-operator-release-id': values.releaseId,
    'x-vigia-operator-timestamp': values.timestamp,
    'x-vigia-operator-nonce': values.nonce,
    'x-vigia-operator-body-sha256': values.bodyHash,
    'x-vigia-operator-intent': values.intent,
    'x-vigia-operator-signature': signature,
  };
}

export function verifyOperatorProxyEnvelope({ headers = {}, key, method, path, releaseId, now = Date.now(), maximumAgeMs = 60_000 }) {
  if (text(key).length < 32) throw Object.assign(new Error('operator_proxy_unavailable'), { statusCode:503 });
  const value = name => text(headers[name] ?? headers[name.toLowerCase()]);
  const claim = {
    keyId:value('x-vigia-operator-key-id'), releaseId:value('x-vigia-operator-release-id'),
    timestamp:value('x-vigia-operator-timestamp'), nonce:value('x-vigia-operator-nonce'),
    bodyHash:value('x-vigia-operator-body-sha256'), intent:value('x-vigia-operator-intent'),
  };
  const signature = value('x-vigia-operator-signature'), issuedAt = Number(claim.timestamp);
  const rejectEnvelope=(auditReason,details={})=>{throw Object.assign(new Error('operator_proxy_envelope_rejected'),{statusCode:401,operatorProxyAuditReason:auditReason,...details});};
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(claim.keyId)) rejectEnvelope('KEY_ID_INVALID');
  if (claim.releaseId !== text(releaseId)) rejectEnvelope('RELEASE_ID_MISMATCH');
  if (!Number.isInteger(issuedAt)) rejectEnvelope('TIMESTAMP_INVALID');
  const ageMs=Math.abs(Number(now)-issuedAt);
  if (ageMs > maximumAgeMs) rejectEnvelope('TIMESTAMP_OUTSIDE_WINDOW',{operatorProxyAgeMs:ageMs,operatorProxyMaximumAgeMs:maximumAgeMs});
  if (!/^[A-Za-z0-9_-]{32}$/.test(claim.nonce)) rejectEnvelope('NONCE_INVALID');
  if (!/^[a-f0-9]{64}$/.test(claim.bodyHash)) rejectEnvelope('BODY_HASH_INVALID');
  const expected = createHmac('sha256', text(key)).update(material({ ...claim, method:text(method).toUpperCase(), path:text(path) })).digest('base64url');
  if (!safeEqual(signature, expected)) throw Object.assign(new Error('operator_proxy_signature_rejected'), { statusCode:401 });
  return Object.freeze({ ...claim, issuedAt, expiresAt:issuedAt + maximumAgeMs, method:text(method).toUpperCase(), path:text(path) });
}

export function verifyOperatorProxyBody(claim, bodyBytes = Buffer.alloc(0)) {
  if (!safeEqual(claim?.bodyHash, hashBytes(bodyBytes))) throw Object.assign(new Error('operator_proxy_body_rejected'), { statusCode:401 });
  return claim;
}

export const EMPTY_OPERATOR_PROXY_BODY_HASH = emptyHash;
