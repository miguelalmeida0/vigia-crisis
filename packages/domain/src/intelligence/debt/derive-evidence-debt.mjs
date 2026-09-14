import { createEvidenceNeed, EVIDENCE_NEED_STATES } from '../../evidence-need.mjs';
import { createEvidenceDebtItem } from '../../validation/evidence-debt.mjs';
import { immutable, semanticHash, uniqueSorted } from '../shared.mjs';

function eligibilityFor({ claim, contract, requirement, qualifyingEvidence }) {
  return {
    requiredSourceFamilyClasses: uniqueSorted(requirement.expected?.familyClasses ?? contract.allowedFamilyClasses),
    requiredSourceFamilyIds: uniqueSorted(requirement.expected?.sourceFamilyIds ?? []),
    prohibitedCausalLineages: uniqueSorted(qualifyingEvidence.flatMap((item) => item.causalLineage.causalKeys)),
    geometry: structuredClone(claim.location), timeWindow: structuredClone(claim.validTime),
    freshnessWindowMs: contract.freshness.maxAgeMs,
    minimumProvenanceStrength: contract.minimumProvenanceStrength,
    observationOpportunity: { requiredForNegative: contract.observationOpportunity.requiredForNegative },
    applicability: { claimType: claim.claimType, requirementKind: requirement.kind },
    sourceHealth: { requiredStatuses: ['ACTIVE'] }
  };
}

export function deriveContractEvidenceDebt({ claim, contract, unmetRequirements = [], qualifyingEvidence = [], evaluatedAt }) {
  const records = unmetRequirements.map((requirement) => {
    const debtItemId = semanticHash('evidence-debt-item', { claimId: claim.id, contractId: contract.id, contractVersion: contract.version, requirementId: requirement.id });
    const contradiction = requirement.kind === 'BLOCKING_CONTRADICTION';
    const target = contradiction ? 1 : Number(requirement.expected?.minimum ?? 1);
    const current = contradiction ? 0 : Math.min(target, Number(requirement.actual?.count ?? 0));
    const eligibility = eligibilityFor({ claim, contract, requirement, qualifyingEvidence });
    const debtItem = createEvidenceDebtItem({
      id: debtItemId, subject: `claim:${claim.id}`, quantity_question: requirement.id,
      current_state: 'OPEN', why_unknown: requirement.reason, why_it_matters: requirement.whyItMatters,
      decision_blocked: `Satisfaction of ${contract.id}@${contract.version} for ${claim.id}.`,
      measurement_method: 'deterministic_causal_evidence_contract_evaluation',
      evidence_required: ['contract-compatible source family', 'independent causal lineage', 'fresh temporal and spatial context', 'minimum provenance', 'valid observation opportunity for negative evidence'],
      acceptable_reference_authority: [...eligibility.requiredSourceFamilyClasses, ...eligibility.requiredSourceFamilyIds],
      current_denominator: current, target_denominator: target, system_resolvable: !contradiction,
      human_required: contradiction, field_required: false, next_opportunity: null,
      watch_state: 'NOT_ARMED', owner_class: 'INTELLIGENCE_FOUNDATION',
      closure_contract: `${contract.id}@${contract.version}#${contract.fingerprint}`, created_at: evaluatedAt, updated_at: evaluatedAt,
      provenance: { derivation: 'evidence_contract', requirementId: requirement.id, evaluationTime: evaluatedAt }
    });
    const need = createEvidenceNeed({
      id: semanticHash('evidence-need', { debtItemId }),
      subjectType: 'claim', subjectId: claim.id, missingQuantity: requirement.id,
      reason: requirement.reason, whyItMatters: requirement.whyItMatters,
      contract: { id: contract.id, version: contract.version }, evidenceDebtItemId: debtItemId, eligibility,
      state: EVIDENCE_NEED_STATES.WAITING_FOR_OBSERVATION,
      candidateMethods: [],
      ranking: { state: 'UNAVAILABLE_UNTIL_SOURCE_CATALOG', basis: ['contract_fit', 'causal_independence', 'freshness', 'spatial_compatibility', 'temporal_compatibility', 'provenance', 'observation_opportunity'], missingDimensions: ['source_health', 'availability', 'latency', 'reliability', 'cost'] },
      createdAt: evaluatedAt
    });
    return { debtItem, need };
  }).sort((left, right) => left.need.missingQuantity.localeCompare(right.need.missingQuantity));
  const needs = records.map((item) => item.need), items = records.map((item) => item.debtItem);
  return immutable({
    schemaVersion: 'vigia.contract-evidence-debt.v1', subjectType: 'claim', subjectId: claim.id,
    contract: { id: contract.id, version: contract.version }, evaluatedAt,
    state: needs.length ? 'OPEN' : 'RESOLVED', count: needs.length, items, needs,
    derivation: 'Canonical Evidence Debt items and Evidence Needs are derived together from unmet versioned Evidence Contract requirements.'
  });
}
