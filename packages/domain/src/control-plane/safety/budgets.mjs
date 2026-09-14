import { immutable } from '../../intelligence/shared.mjs';

export function createActionBudget(input = {}) {
  const normalize = (value, fallback) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
  return immutable({ schemaVersion: 'vigia.action-budget.v1', maximumActionsPerCycle: normalize(input.maximumActionsPerCycle, 20),
    maximumActionsPerIncident: normalize(input.maximumActionsPerIncident, 8), maximumAttemptsPerAction: normalize(input.maximumAttemptsPerAction, 3),
    maximumActionsPerProvider: normalize(input.maximumActionsPerProvider, 4) });
}

export function evaluateActionBudget(action, budget, context = {}) {
  if (budget?.schemaVersion !== 'vigia.action-budget.v1' || !['maximumActionsPerCycle', 'maximumActionsPerIncident', 'maximumAttemptsPerAction', 'maximumActionsPerProvider']
    .every((key) => Number.isInteger(budget[key]) && budget[key] >= 0)) return immutable({ allowed: false, state: 'BUDGET_EXCEEDED', reasons: ['ACTION_BUDGET_STATE_INVALID'] });
  const cycleActions = context.cycleActions ?? [], historicalActions = context.historicalActions ?? [];
  const providerId = action.target?.sourceId ?? action.target?.providerId ?? null;
  const perIncident = historicalActions.filter((item) => item.incidentId === action.incidentId && item.status === 'STARTED').length;
  const perProvider = providerId ? cycleActions.filter((item) => (item.target?.sourceId ?? item.target?.providerId) === providerId && item.status === 'STARTED').length : 0;
  const reasons = [];
  if (cycleActions.filter((item) => item.status === 'STARTED').length >= budget.maximumActionsPerCycle) reasons.push('CYCLE_ACTION_BUDGET_EXHAUSTED');
  if (perIncident >= budget.maximumActionsPerIncident) reasons.push('INCIDENT_ACTION_BUDGET_EXHAUSTED');
  if (action.attempt >= budget.maximumAttemptsPerAction) reasons.push('ACTION_ATTEMPT_BUDGET_EXHAUSTED');
  if (providerId && perProvider >= budget.maximumActionsPerProvider) reasons.push('PROVIDER_ACTION_BUDGET_EXHAUSTED');
  return immutable({ allowed: reasons.length === 0, state: reasons.length ? 'BUDGET_EXCEEDED' : 'WITHIN_BUDGET', reasons });
}
