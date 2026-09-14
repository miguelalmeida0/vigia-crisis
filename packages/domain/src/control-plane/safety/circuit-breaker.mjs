import { immutable, isoTime } from '../../intelligence/shared.mjs';

export function evaluateCircuitBreaker(action, actions = [], at, config = {}) {
  const evaluatedAt = isoTime(at, 'circuit_evaluation_time_required'), threshold = Number(config.failureThreshold ?? 3), resetAfterMs = Number(config.resetAfterMs ?? 300_000);
  if (!Number.isInteger(threshold) || threshold < 1 || !Number.isFinite(resetAfterMs) || resetAfterMs < 0) return immutable({ allowed: false, state: 'OPEN', key: null,
    failureCount: 0, retryAt: null, reasons: ['CIRCUIT_BREAKER_CONFIG_INVALID'] });
  const key = action.target?.sourceId ?? action.target?.providerId ?? action.type;
  const relevant = actions.filter((item) => (item.target?.sourceId ?? item.target?.providerId ?? item.type) === key).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const lastSuccess = relevant.find((item) => item.status === 'SUCCEEDED')?.updatedAt ?? null;
  const failures = relevant.filter((item) => item.status === 'FAILED' && (!lastSuccess || item.updatedAt > lastSuccess));
  const lastFailure = failures[0]?.updatedAt ?? null, elapsed = lastFailure ? Date.parse(evaluatedAt) - Date.parse(lastFailure) : Number.MAX_SAFE_INTEGER;
  const open = failures.length >= threshold && elapsed < resetAfterMs;
  return immutable({ allowed: !open, state: open ? 'OPEN' : failures.length >= threshold ? 'HALF_OPEN' : 'CLOSED', key, failureCount: failures.length,
    retryAt: open ? new Date(Date.parse(lastFailure) + resetAfterMs).toISOString() : null, reasons: open ? ['FAILURE_THRESHOLD_REACHED'] : [] });
}
