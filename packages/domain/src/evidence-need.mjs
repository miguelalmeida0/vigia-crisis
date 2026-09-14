export const EVIDENCE_NEED_STATES = Object.freeze({
  REQUEST_ACTIVE: 'REQUEST_ACTIVE',
  WAITING_FOR_SCHEDULED_OBSERVATION: 'WAITING_FOR_SCHEDULED_OBSERVATION',
  WAITING_FOR_OBSERVATION: 'WAITING_FOR_OBSERVATION',
  MANUAL_ESCALATION_REQUIRED: 'MANUAL_ESCALATION_REQUIRED',
  FIELD_CAPACITY_NOT_CONFIGURED: 'FIELD_CAPACITY_NOT_CONFIGURED',
  NO_AVAILABLE_OBSERVATION: 'NO_AVAILABLE_OBSERVATION',
  RESOLVED: 'RESOLVED'
});

const VALID_STATES = new Set(Object.values(EVIDENCE_NEED_STATES));
const dimension = (value) => ({
  state: String(value?.state ?? 'UNMEASURED'),
  value: value?.value ?? null,
  ...(value?.source ? { source: String(value.source) } : {})
});

function method(value) {
  if (!value?.id || !value?.label) throw new Error('invalid_evidence_method');
  return {
    id: String(value.id),
    label: String(value.label).slice(0, 180),
    kind: String(value.kind ?? 'UNKNOWN'),
    methodType: String(value.methodType ?? 'unknown'),
    availability: String(value.availability ?? 'unknown'),
    ownerId: value.ownerId ? String(value.ownerId) : null,
    informationGain: dimension(value.informationGain),
    latency: dimension(value.latency),
    reliability: dimension(value.reliability),
    cost: dimension(value.cost),
    scheduledAt: value.scheduledAt ? String(value.scheduledAt) : null,
    commitment: value.commitment ? structuredClone(value.commitment) : null,
    note: value.note ? String(value.note).slice(0, 800) : value.limitation ? String(value.limitation).slice(0, 800) : null
  };
}

export function createEvidenceNeed(input) {
  if (!input?.id || !input?.subjectId || !input?.missingQuantity || !VALID_STATES.has(input?.state)) throw new Error('invalid_evidence_need');
  const createdAt = String(input.createdAt ?? '');
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('invalid_evidence_need');
  return {
    schemaVersion: 'vigia.evidence-need.v2',
    id: String(input.id),
    subjectType: String(input.subjectType ?? 'fire_event'),
    subjectId: String(input.subjectId),
    missingQuantity: String(input.missingQuantity),
    reason: String(input.reason ?? '').slice(0, 1000),
    whyItMatters: String(input.whyItMatters ?? '').slice(0, 1000),
    contract: input.contract ? { id: String(input.contract.id), version: String(input.contract.version) } : null,
    evidenceDebtItemId: input.evidenceDebtItemId ? String(input.evidenceDebtItemId) : null,
    eligibility: input.eligibility ? structuredClone(input.eligibility) : null,
    candidateMethods: (input.candidateMethods ?? []).map(method).slice(0, 12),
    ranking: {
      state: String(input.ranking?.state ?? 'UNAVAILABLE'),
      basis: (input.ranking?.basis ?? []).map(String).slice(0, 8),
      missingDimensions: (input.ranking?.missingDimensions ?? []).map(String).slice(0, 8)
    },
    state: input.state,
    ownerId: input.ownerId ? String(input.ownerId) : null,
    evidenceRequestId: input.evidenceRequestId ? String(input.evidenceRequestId) : null,
    selectedMethodId: input.selectedMethodId ? String(input.selectedMethodId) : null,
    nextObservationAt: input.nextObservationAt ? String(input.nextObservationAt) : null,
    serviceLevel: input.serviceLevel ? structuredClone(input.serviceLevel) : null,
    escalationReason: input.escalationReason ? String(input.escalationReason) : null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: input.state === EVIDENCE_NEED_STATES.RESOLVED ? createdAt : null,
    history: [{ state: input.state, at: createdAt, reason: String(input.reason ?? '').slice(0, 1000) }]
  };
}

export function transitionEvidenceNeed(need, state, context = {}) {
  if (!need?.id || !VALID_STATES.has(state)) throw new Error('invalid_evidence_need_transition');
  const at = String(context.at ?? new Date().toISOString());
  if (!Number.isFinite(Date.parse(at))) throw new Error('invalid_evidence_need_transition');
  if (need.state === state && !context.force) return need;
  return {
    ...need,
    state,
    ownerId: context.ownerId === undefined ? need.ownerId : context.ownerId,
    evidenceRequestId: context.evidenceRequestId === undefined ? need.evidenceRequestId : context.evidenceRequestId,
    selectedMethodId: context.selectedMethodId === undefined ? need.selectedMethodId : context.selectedMethodId,
    nextObservationAt: context.nextObservationAt === undefined ? need.nextObservationAt : context.nextObservationAt,
    serviceLevel: context.serviceLevel === undefined ? need.serviceLevel : structuredClone(context.serviceLevel),
    escalationReason: context.escalationReason === undefined ? need.escalationReason : context.escalationReason,
    updatedAt: at,
    resolvedAt: state === EVIDENCE_NEED_STATES.RESOLVED ? at : null,
    history: [...(need.history ?? []), { state, at, reason: String(context.reason ?? '') }]
  };
}
