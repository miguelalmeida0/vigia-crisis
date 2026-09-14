import { createHash } from 'node:crypto';

export const EVIDENCE_CLOSURE_STATES = Object.freeze([
  'UNKNOWN_IDENTIFIED', 'PLAN_CREATED', 'OPPORTUNITY_SELECTED', 'WATCH_ARMED',
  'EVIDENCE_ARRIVES', 'ASSOCIATED', 'DOMAIN_RECOMPUTED', 'UNKNOWN_CLOSED', 'UNKNOWN_PRESERVED'
]);

export const EVIDENCE_CLOSURE_RESULTS = Object.freeze([
  'CORROBORATED', 'VALID_OPPORTUNITY_NO_SIGNAL', 'QUALITY_UNUSABLE', 'NO_COVERAGE',
  'AMBIGUOUS', 'SOURCE_FAILURE', 'EXPIRED', 'STILL_UNKNOWN'
]);

const PRESERVING_RESULTS = new Set(['QUALITY_UNUSABLE', 'NO_COVERAGE', 'AMBIGUOUS', 'SOURCE_FAILURE', 'EXPIRED', 'STILL_UNKNOWN']);
const FAMILY_GROUP = Object.freeze({
  viirs: 'POLAR_THERMAL_VIIRS', sentinel3_slstr: 'POLAR_THERMAL_SLSTR',
  sentinel2_msi: 'POLAR_OPTICAL_MSI', field: 'HUMAN_FIELD', drone: 'LOCAL_AERIAL',
  ground_sensor: 'LOCAL_GROUND', domain_expert_review: 'QUALIFIED_HUMAN_REVIEW'
});

function iso(value) {
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) throw new Error('valid_time_required');
  return time.toISOString();
}
function hash(prefix, value) {
  return `${prefix}:${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`;
}
function normalized(value) { return String(value ?? '').trim().toLowerCase().replaceAll('-', '_'); }
export function evidenceFamilyGroup(value) { const family = normalized(value); return FAMILY_GROUP[family] ?? `FAMILY:${family.toUpperCase()}`; }

export function selectIndependentEvidenceFamily(acceptable = [], current = []) {
  const occupied = new Set(current.map(evidenceFamilyGroup));
  return acceptable.map(normalized).find((family) => family && !occupied.has(evidenceFamilyGroup(family))) ?? null;
}

export function createEvidenceClosurePlan(input = {}, { now = new Date(), ttlHours = 12 } = {}) {
  if (!input.subjectId || !input.unknownCode || !input.currentEvidenceVersion) throw new Error('evidence_closure_identity_required');
  const at = iso(input.createdAt ?? now), acceptableEvidenceFamilies = [...new Set((input.acceptableEvidenceFamilies ?? []).map(normalized).filter(Boolean))];
  if (!acceptableEvidenceFamilies.length) throw new Error('acceptable_evidence_family_required');
  const subjectType = String(input.subjectType ?? 'EVENT').toUpperCase();
  const stable = { subjectType, subjectId: String(input.subjectId), unknownCode: String(input.unknownCode), currentEvidenceVersion: String(input.currentEvidenceVersion) };
  const expiresAt = iso(input.expiresAt ?? Date.parse(at) + ttlHours * 3_600_000);
  const deadlineAt = iso(input.deadlineAt ?? Math.min(Date.parse(expiresAt), Date.parse(at) + 3_600_000));
  const preferredNextFamily = normalized(input.preferredNextFamily) || selectIndependentEvidenceFamily(acceptableEvidenceFamilies, input.currentEvidenceFamilies ?? []);
  return Object.freeze({
    id: input.id ?? hash('closure-plan', stable), ...stable,
    unknownDescription: String(input.unknownDescription ?? input.unknownCode),
    closureContract: Object.freeze({
      type: String(input.closureContract?.type ?? 'INDEPENDENT_PHYSICAL_CORROBORATION'),
      closeOn: [...(input.closureContract?.closeOn ?? ['CORROBORATED'])],
      preserveOn: [...(input.closureContract?.preserveOn ?? PRESERVING_RESULTS)],
      qualification: String(input.closureContract?.qualification ?? 'Only attributable evidence satisfying the contract may close this unknown.')
    }),
    acceptableEvidenceFamilies, preferredNextFamily, currentEvidenceFamilies: [...new Set((input.currentEvidenceFamilies ?? []).map(normalized).filter(Boolean))],
    opportunity: input.opportunity ?? null, sourceWatch: input.sourceWatch ?? null,
    lifecycleState: 'PLAN_CREATED', resolutionState: 'OPEN', resultState: null, resultReason: null,
    deadlineAt, expiresAt, createdAt: at, updatedAt: at, closedAt: null,
    audit: [{ state: 'UNKNOWN_IDENTIFIED', at, reasonCode: 'DOMAIN_UNKNOWN_REQUIRES_CLOSURE' }, { state: 'PLAN_CREATED', at, reasonCode: 'CLOSURE_CONTRACT_BOUND' }]
  });
}

export function selectClosureOpportunity(plan, opportunities = [], { at = new Date() } = {}) {
  const now = Date.parse(iso(at));
  const ranked = opportunities.filter((item) => normalized(item.sourceFamily) === plan.preferredNextFamily && Date.parse(item.expiresAt) > now)
    .sort((left, right) => {
      const rank = { CONFIRMED_PROVIDER_PRODUCT: 0, PREDICTED_ORBITAL_PASS: 1, FIELD_CAPACITY: 2, EXPECTED_CADENCE: 3, UNKNOWN: 4 };
      return (rank[left.opportunityType] ?? 9) - (rank[right.opportunityType] ?? 9) || Date.parse(left.windowStart ?? left.createdAt) - Date.parse(right.windowStart ?? right.createdAt);
    });
  return ranked[0] ?? null;
}

export function armEvidenceWatch(plan, opportunity, { at = new Date() } = {}) {
  if (!opportunity || normalized(opportunity.sourceFamily) !== plan.preferredNextFamily) throw new Error('independent_opportunity_required');
  const armedAt = iso(at), watchUntil = iso(opportunity.expiresAt ?? plan.expiresAt);
  const watch = Object.freeze({
    id: hash('source-watch', { planId: plan.id, family: plan.preferredNextFamily, opportunityId: opportunity.id }),
    planId: plan.id, sourceFamily: plan.preferredNextFamily, opportunityId: opportunity.id,
    state: 'ARMED', armedAt, watchFrom: opportunity.windowStart ?? armedAt, watchUntil, satisfiedAt: null,
    authority: opportunity.authority, opportunityType: opportunity.opportunityType
  });
  return Object.freeze({ ...plan, opportunity, sourceWatch: watch, lifecycleState: 'WATCH_ARMED', updatedAt: armedAt,
    audit: [...plan.audit, { state: 'OPPORTUNITY_SELECTED', at: armedAt, reasonCode: opportunity.opportunityType }, { state: 'WATCH_ARMED', at: armedAt, reasonCode: 'INDEPENDENT_SOURCE_WATCH' }] });
}

export function normalizeClosureResult(value, event = {}) {
  const requested = String(value?.resultState ?? value?.result_state ?? '').toUpperCase();
  if (EVIDENCE_CLOSURE_RESULTS.includes(requested)) return requested;
  if (requested === 'VALID_OPPORTUNITY_NO_DETECTION') return 'VALID_OPPORTUNITY_NO_SIGNAL';
  if (requested === 'EVIDENCE_ACQUIRED') return Number(event.physicalSourceProfile?.familyCount ?? 0) >= 2 ? 'CORROBORATED' : 'AMBIGUOUS';
  return null;
}

export function resolveEvidenceClosure(plan, { result, event = {}, evidenceVersion = null, at = new Date() } = {}) {
  const resultState = normalizeClosureResult(result, event);
  if (!resultState) return plan;
  const resolvedAt = iso(at), closeAllowed = plan.closureContract.closeOn.includes(resultState);
  const expertAccepted = plan.closureContract.type === 'QUALIFIED_EXPERT_REVIEW' && resultState === 'CORROBORATED' && result?.actorRole === 'PREVENTION_REVIEWER';
  const canClose = closeAllowed && (plan.closureContract.type !== 'QUALIFIED_EXPERT_REVIEW' || expertAccepted);
  const resolutionState = canClose ? 'CLOSED' : 'PRESERVED', finalState = canClose ? 'UNKNOWN_CLOSED' : 'UNKNOWN_PRESERVED';
  const associated = Boolean(result?.attributableObservationId ?? result?.attributable_observation_id ?? result?.reviewId);
  const lifecycle = ['EVIDENCE_ARRIVES', ...(associated ? ['ASSOCIATED'] : []), 'DOMAIN_RECOMPUTED', finalState];
  const reason = String(result?.reasonCode ?? result?.reason_code ?? (canClose ? 'CLOSURE_CONTRACT_SATISFIED' : 'CLOSURE_CONTRACT_NOT_SATISFIED'));
  // currentEvidenceVersion is part of the plan's stable identity and the
  // database uniqueness contract. Preserve it when later evidence resolves
  // the plan; record that evidence separately instead of mutating identity.
  return Object.freeze({ ...plan, resolutionEvidenceVersion:String(evidenceVersion ?? plan.currentEvidenceVersion), lifecycleState: finalState, resolutionState,
    resultState, resultReason: reason, updatedAt: resolvedAt, closedAt: canClose ? resolvedAt : null,
    sourceWatch: plan.sourceWatch ? { ...plan.sourceWatch, state: associated ? 'SATISFIED' : resultState === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED', satisfiedAt: associated ? resolvedAt : null } : null,
    audit: [...plan.audit, ...lifecycle.map((state) => ({ state, at: resolvedAt, reasonCode: reason }))] });
}
