import { immutable, isoTime, semanticHash } from '../intelligence/shared.mjs';

export function createReconciliationCycle({ plan, cycleNumber, mode, startedProjectionHash, finalProjectionHash, actionOutcomes = [], converged, at } = {}) {
  if (!plan?.planHash || !Number.isInteger(cycleNumber) || cycleNumber < 1) throw new Error('invalid_reconciliation_cycle');
  const core = { schemaVersion: 'vigia.reconciliation-cycle.v1', cycleNumber, mode: String(mode).toUpperCase(), evaluatedAt: isoTime(at, 'reconciliation_cycle_time_required'),
    planHash: plan.planHash, startedProjectionHash, finalProjectionHash, policyDecisionIds: plan.decisions.map((item) => item.decisionId).sort(),
    desiredStateIds: plan.desiredStates.map((item) => item.id).sort(), plannedActionIds: plan.actions.map((item) => item.id).sort(),
    actionOutcomes: structuredClone(actionOutcomes).sort((left, right) => left.actionId.localeCompare(right.actionId)), converged: Boolean(converged) };
  return immutable({ ...core, id: semanticHash('reconciliation-cycle', core) });
}
