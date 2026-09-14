import { immutable, isoTime } from '../../intelligence/shared.mjs';

export function evaluateActionCooldown(action, actionHistory = [], at, config = {}) {
  const evaluatedAt = isoTime(at, 'cooldown_evaluation_time_required'), cooldownMs = Number(config.cooldownMs ?? 30_000);
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0) return immutable({ allowed: false, state: 'COOLDOWN_ACTIVE', retryAt: null, reasons: ['ACTION_COOLDOWN_CONFIG_INVALID'] });
  const prior = actionHistory.filter((item) => item.id === action.id && ['STARTED', 'FAILED', 'CIRCUIT_OPEN', 'BUDGET_EXCEEDED'].includes(item.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!prior || cooldownMs <= 0) return immutable({ allowed: true, state: 'CLEAR', retryAt: null, reasons: [] });
  const retryAt = new Date(Date.parse(prior.updatedAt) + cooldownMs).toISOString(), cooling = evaluatedAt < retryAt;
  return immutable({ allowed: !cooling, state: cooling ? 'COOLDOWN_ACTIVE' : 'CLEAR', retryAt: cooling ? retryAt : null, reasons: cooling ? ['ACTION_COOLDOWN_ACTIVE'] : [] });
}
