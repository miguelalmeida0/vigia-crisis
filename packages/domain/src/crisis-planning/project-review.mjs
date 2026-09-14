import { semanticHash } from '../intelligence/shared.mjs';
import { optionalInstant } from './contracts.mjs';
import { CURRENT_PLANNING_CONTEXT_MAX_AGE_MS, rows, text } from './projection-helpers.mjs';

const PLANNING_REVIEW_SECTIONS = Object.freeze({
  OPERATIONAL_PERIOD: 'operationalPeriodProposal',
  RESOURCE_RECOMMENDATION: 'resourceOptimizer',
  AUTONOMOUS_REPLAN: 'autonomousReplanning',
  EVACUATION_CORRIDOR: 'evacuationCorridor',
  PROTECTION_TIMELINE: 'protectionTimeline',
  CAP_DRAFT: 'capProtection',
});

const REVIEWABLE_PLANNING_STATES = Object.freeze({
  OPERATIONAL_PERIOD: new Set(['READY_FOR_HUMAN_APPROVAL']),
  RESOURCE_RECOMMENDATION: new Set(['RECOMMENDATIONS_READY_FOR_APPROVAL', 'PARTIAL_RECOMMENDATION']),
  AUTONOMOUS_REPLAN: new Set(['NEW_PLAN_READY_FOR_APPROVAL']),
  EVACUATION_CORRIDOR: new Set(['READY_FOR_AUTHORITY_REVIEW']),
  PROTECTION_TIMELINE: new Set(['ADMITTED_SCENARIO_WINDOWS_AVAILABLE']),
  CAP_DRAFT: new Set([]),
});

function proposalHashFor(section) {
  return text(section?.value?.proposalHash ?? section?.proposalHash ?? section?.value?.projectionHash ?? section?.projectionHash);
}

export function planningReviewBindings({ incidentId, sections, asOf, sourceProjectionHash, compiledAgainstIntentHash }) {
  const expiresAt = new Date(Date.parse(asOf) + CURRENT_PLANNING_CONTEXT_MAX_AGE_MS).toISOString();
  return Object.fromEntries(Object.entries(PLANNING_REVIEW_SECTIONS).map(([proposalType, sectionName]) => {
    const projected = sections[sectionName], proposalHash = proposalHashFor(projected), reviewable = Boolean(proposalHash && REVIEWABLE_PLANNING_STATES[proposalType].has(String(projected?.state ?? '')));
    const version = reviewable ? semanticHash('crisis-planning-proposal-version', {
      incidentId,
      proposalType,
      proposalHash,
      sourceProjectionHash: sourceProjectionHash ?? null,
      compiledAgainstIntentHash: compiledAgainstIntentHash ?? null,
    }) : null;
    return [proposalType, {
      proposalType,
      section: sectionName,
      state: reviewable ? 'CURRENT_REVIEWABLE_PROPOSAL' : 'NO_CURRENT_REVIEWABLE_PROPOSAL',
      sectionState: projected?.state ?? 'UNAVAILABLE',
      proposalHash: reviewable ? proposalHash : null,
      proposalVersion: version,
      generatedAt: asOf,
      expiresAt,
      sourceProjectionHash: sourceProjectionHash ?? null,
      compiledAgainstIntentHash: compiledAgainstIntentHash ?? null,
      reason: reviewable ? null : proposalHash ? `Section state ${projected?.state ?? 'UNAVAILABLE'} is not reviewable.` : 'No proposal hash exists for this section.',
    }];
  }));
}

export function projectPlanningReview(decisions, asOf, inventory = null) {
  const records = rows(decisions)
    .filter((item) => {
      const recordedAt = optionalInstant(item.recordedAt ?? item.receivedAt);
      return !recordedAt || Date.parse(recordedAt) <= Date.parse(asOf);
    })
    .map((item) => structuredClone(item))
    .sort((left, right) => Date.parse(right.recordedAt ?? right.receivedAt ?? 0) - Date.parse(left.recordedAt ?? left.receivedAt ?? 0) || String(left.decisionId ?? '').localeCompare(String(right.decisionId ?? '')));
  return {
    schemaVersion: 'vigia.crisis-planning-review-projection.v1',
    state: records.length ? 'DECISIONS_RECORDED' : 'NO_REVIEW_DECISIONS',
    decisions: records,
    inventory: inventory ?? { total: records.length, returned: records.length, truncated: false },
    approved: records.filter((item) => item.state === 'APPROVED_FOR_PLANNING_ONLY' || item.state === 'APPLIED_TO_CANONICAL_PLAN').length,
    rejected: records.filter((item) => item.state === 'REJECTED').length,
    applied: records.filter((item) => item.mutationsApplied === true).length,
    truthBoundary: 'A recorded review decision is distinct from canonical-plan application. Only a separate authority- and idempotency-gated application receipt may create first-class plan objects.',
  };
}

