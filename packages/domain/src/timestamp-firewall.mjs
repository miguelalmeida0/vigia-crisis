const MIN_YEAR = 2000;
const FUTURE_SKEW_MS = 10 * 60_000;

export function inspectTimestamp(value, { now = new Date() } = {}) {
  if (value === null || value === undefined || value === '' || value === 0) return { valid: false, value: null, reason: 'missing' };
  const ms = typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(ms)) return { valid: false, value: null, reason: 'invalid' };
  const date = new Date(ms);
  if (date.getUTCFullYear() < MIN_YEAR) return { valid: false, value: null, reason: 'implausibly_old' };
  if (ms > now.getTime() + FUTURE_SKEW_MS) return { valid: false, value: date.toISOString(), reason: 'future' };
  return { valid: true, value: date.toISOString(), reason: null, ageSeconds: Math.max(0, Math.round((now.getTime() - ms) / 1000)) };
}

export function safeTimestamp(value, options) {
  const result = inspectTimestamp(value, options);
  return result.valid ? result.value : null;
}
