import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const audience = 'vigia-operator-console';
const schemaVersion = 1;
const maximumLifetimeSeconds = 120;

const encode = value => Buffer.from(value).toString('base64url');
const sign = (secret, payload) => createHmac('sha256', secret)
  .update(`operator-console-one-time-admission-v1\0${payload}`)
  .digest('base64url');

function equalText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function createOneTimeAdmission(secret, {
  now = Date.now(),
  lifetimeSeconds = 60,
  nonce = randomBytes(24).toString('hex'),
} = {}) {
  if (String(secret).length < 32) throw new Error('operator_admission_secret_invalid');
  if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 10 || lifetimeSeconds > maximumLifetimeSeconds) throw new Error('operator_admission_lifetime_invalid');
  if (!/^[a-f0-9]{48}$/.test(nonce)) throw new Error('operator_admission_nonce_invalid');
  const issuedAt = Math.floor(now / 1000);
  const payload = encode(JSON.stringify({ v: schemaVersion, aud: audience, nonce, iat: issuedAt, exp: issuedAt + lifetimeSeconds }));
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyOneTimeAdmission(token, secret, {
  now = Date.now(),
  usedNonces = null,
} = {}) {
  if (String(secret).length < 32 || typeof token !== 'string' || token.length > 2048) throw new Error('operator_admission_rejected');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !equalText(signature, sign(secret, payload))) throw new Error('operator_admission_rejected');
  let claim;
  try { claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new Error('operator_admission_rejected'); }
  const nowSeconds = Math.floor(now / 1000);
  if (claim?.v !== schemaVersion || claim?.aud !== audience || !/^[a-f0-9]{48}$/.test(claim?.nonce ?? '')) throw new Error('operator_admission_rejected');
  if (!Number.isInteger(claim.iat) || !Number.isInteger(claim.exp) || claim.exp <= claim.iat || claim.exp - claim.iat > maximumLifetimeSeconds) throw new Error('operator_admission_rejected');
  if (claim.iat > nowSeconds + 5 || claim.exp < nowSeconds) throw new Error('operator_admission_expired');
  if (usedNonces?.has(claim.nonce)) throw new Error('operator_admission_replayed');
  usedNonces?.add(claim.nonce);
  return claim;
}
