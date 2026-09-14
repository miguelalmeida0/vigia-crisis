import { immutable, isoTime, semanticHash, uniqueSorted } from '../../intelligence/shared.mjs';
import { POLICY_KINDS, policyReference } from './policy-model.mjs';

function outcomeFor(policy, facts) {
  const sourceStatus = facts.selectedSource?.status ?? null;
  switch (policy.kind) {
    case POLICY_KINDS.MISSING_INDEPENDENT_CORROBORATION:
      if (!facts.need) return { outcome: 'NOT_APPLICABLE', reasons: ['NO_OPEN_EVIDENCE_NEED'] };
      if (facts.need.eligibility?.applicability?.requirementKind === 'BLOCKING_CONTRADICTION') return { outcome: 'NOT_APPLICABLE', reasons: ['CONTRADICTION_REQUIRES_DEDICATED_WORK'] };
      if (facts.activeRequest) return { outcome: 'CONVERGED', reasons: ['ACQUISITION_ALREADY_ACTIVE'] };
      if (facts.sourceSelection?.state === 'NO_ELIGIBLE_SOURCE') return { outcome: 'BLOCKED', reasons: ['NO_ELIGIBLE_SOURCE'] };
      if (facts.sourceSelection?.state === 'AMBIGUOUS_BEST_SOURCE') return { outcome: 'BLOCKED', reasons: ['AMBIGUOUS_BEST_SOURCE'] };
      return { outcome: 'APPLY', reasons: ['INDEPENDENT_CORROBORATION_MISSING'] };
    case POLICY_KINDS.SOURCE_STALE:
      return sourceStatus === 'STALE' ? { outcome: 'APPLY', reasons: ['SELECTED_SOURCE_STALE'] } : { outcome: 'NOT_APPLICABLE', reasons: ['SELECTED_SOURCE_NOT_STALE'] };
    case POLICY_KINDS.PROVIDER_UNAVAILABLE:
      return ['UNAVAILABLE', 'QUARANTINED', 'COMPROMISED'].includes(sourceStatus)
        ? { outcome: 'APPLY', reasons: [`SELECTED_SOURCE_${sourceStatus}`] } : { outcome: 'NOT_APPLICABLE', reasons: ['SELECTED_PROVIDER_AVAILABLE'] };
    case POLICY_KINDS.BLOCKING_CONTRADICTION:
      if (!facts.blockingContradictions?.length) return { outcome: 'NOT_APPLICABLE', reasons: ['NO_BLOCKING_CONTRADICTION'] };
      return facts.contradictionWork?.status === 'ACTIVE' ? { outcome: 'CONVERGED', reasons: ['CONTRADICTION_WORK_ALREADY_ACTIVE'] }
        : { outcome: 'APPLY', reasons: ['BLOCKING_CONTRADICTION_PRESENT'] };
    case POLICY_KINDS.SATISFIED_WORK_CLOSURE:
      if (facts.resolvedWorkItemIds?.length) return { outcome: 'APPLY', reasons: ['CONTRADICTION_RESOLVED'] };
      if (facts.resolvedRequestIds?.length) return { outcome: 'APPLY', reasons: ['REQUEST_TARGET_EVIDENCE_OBSERVED'] };
      return facts.debtCount === 0 && facts.openRequests?.length ? { outcome: 'APPLY', reasons: ['EVIDENCE_DEBT_RESOLVED'] } : { outcome: 'NOT_APPLICABLE', reasons: ['NO_RESOLVED_WORK_TO_CLOSE'] };
    case POLICY_KINDS.CONSEQUENTIAL_WARNING_GUARD:
      return facts.consequentialIntent ? { outcome: 'AUTHORITY_REQUIRED', reasons: ['CONSEQUENTIAL_ACTION_REQUIRES_AUTHORITY'] } : { outcome: 'NOT_APPLICABLE', reasons: ['NO_CONSEQUENTIAL_INTENT'] };
    default: throw new Error('unsupported_control_policy_kind');
  }
}

export function evaluateControlPolicy({ policy, facts = {}, evaluatedAt }) {
  const at = isoTime(evaluatedAt, 'policy_evaluation_time_required'), result = outcomeFor(policy, facts);
  const factBinding = {
    incidentId: facts.incidentId ?? null, needId: facts.need?.id ?? null, sourceSelectionFingerprint: facts.sourceSelection?.fingerprint ?? null,
    sourceSelectionState: facts.sourceSelection?.state ?? null, requirementKind: facts.need?.eligibility?.applicability?.requirementKind ?? null,
    selectedSourceId: facts.selectedSource?.sourceId ?? null, selectedSourceStatus: facts.selectedSource?.status ?? null,
    activeRequestId: facts.activeRequest?.id ?? null, debtCount: facts.debtCount ?? null,
    blockingContradictionIds: (facts.blockingContradictions ?? []).map((item) => item.id ?? semanticHash('contradiction', item)).sort(),
    contradictionWorkId: facts.contradictionWork?.id ?? null, contradictionWorkStatus: facts.contradictionWork?.status ?? null,
    openRequestIds: (facts.openRequests ?? []).map((item) => item.id).sort(),
    resolvedRequestIds: (facts.resolvedRequestIds ?? []).slice().sort(), resolvedWorkItemIds: (facts.resolvedWorkItemIds ?? []).slice().sort(),
    consequentialIntent: Boolean(facts.consequentialIntent)
  };
  const core = { schemaVersion: 'vigia.control-policy-decision.v1', policy: policyReference(policy), evaluatedAt: at,
    subjectType: facts.subjectType ?? (facts.need ? 'EVIDENCE_NEED' : 'INCIDENT'), subjectId: facts.subjectId ?? facts.need?.id ?? facts.incidentId ?? 'global',
    outcome: result.outcome, reasons: uniqueSorted(result.reasons), factBinding,
    proposedAction: result.outcome === 'APPLY' || result.outcome === 'AUTHORITY_REQUIRED' ? structuredClone(policy.actionTemplate) : null };
  return immutable({ ...core, decisionId: semanticHash('control-policy-decision', core) });
}

export function verifyRecordedPolicyDecision(decision, policy) {
  if (!decision?.factBinding || !policy || decision.policy.fingerprint !== policy.fingerprint) return immutable({ valid: false, reason: 'POLICY_FINGERPRINT_UNAVAILABLE' });
  const binding = decision.factBinding, facts = {
    incidentId: binding.incidentId, subjectType: decision.subjectType, subjectId: decision.subjectId,
    need: binding.needId ? { id: binding.needId, eligibility: { applicability: { requirementKind: binding.requirementKind } } } : null,
    sourceSelection: binding.sourceSelectionFingerprint ? { fingerprint: binding.sourceSelectionFingerprint, state: binding.sourceSelectionState, selectedSourceId: binding.selectedSourceId } : null,
    selectedSource: binding.selectedSourceId ? { sourceId: binding.selectedSourceId, status: binding.selectedSourceStatus } : null,
    activeRequest: binding.activeRequestId ? { id: binding.activeRequestId } : null, debtCount: binding.debtCount,
    blockingContradictions: binding.blockingContradictionIds.map((id) => ({ id })),
    contradictionWork: binding.contradictionWorkId ? { id: binding.contradictionWorkId, status: binding.contradictionWorkStatus } : null,
    openRequests: binding.openRequestIds.map((id) => ({ id })), resolvedRequestIds: binding.resolvedRequestIds,
    resolvedWorkItemIds: binding.resolvedWorkItemIds, consequentialIntent: binding.consequentialIntent
  };
  const replayed = evaluateControlPolicy({ policy, facts, evaluatedAt: decision.evaluatedAt });
  return immutable({ valid: replayed.decisionId === decision.decisionId, recordedDecisionId: decision.decisionId, replayedDecisionId: replayed.decisionId,
    recordedOutcome: decision.outcome, replayedOutcome: replayed.outcome });
}

export function comparePolicyVersions({ leftPolicy, rightPolicy, facts, evaluatedAt }) {
  const left = evaluateControlPolicy({ policy: leftPolicy, facts, evaluatedAt }), right = evaluateControlPolicy({ policy: rightPolicy, facts, evaluatedAt });
  const changed = left.outcome !== right.outcome || semanticHash('proposed-action', left.proposedAction) !== semanticHash('proposed-action', right.proposedAction);
  return immutable({ schemaVersion: 'vigia.policy-comparison.v1', evaluatedAt: left.evaluatedAt, left, right, changed,
    comparisonId: semanticHash('policy-comparison', { left, right, changed }) });
}
