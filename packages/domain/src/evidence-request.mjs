const TRANSITIONS = Object.freeze({
  requested: new Set(['acknowledged', 'cancelled']),
  acknowledged: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['submitted', 'cancelled']),
  submitted: new Set(['accepted', 'rejected']),
  accepted: new Set([]),
  rejected: new Set(['in_progress']),
  cancelled: new Set([])
});

export function createEvidenceRequest(input) {
  if (!input?.id || !input?.targetId || !input?.ownerId || !input?.dueAt) throw new Error('invalid_evidence_request');
  const acknowledgementDueAt = String(input.acknowledgementDueAt ?? input.dueAt);
  const observationDueAt = String(input.observationDueAt ?? input.dueAt);
  if (![input.createdAt, acknowledgementDueAt, observationDueAt].every((value) => Number.isFinite(Date.parse(value)))) throw new Error('invalid_evidence_request');
  return {
    id: String(input.id),
    targetType: String(input.targetType ?? 'inspection'),
    targetId: String(input.targetId),
    title: String(input.title ?? 'Field evidence request').slice(0, 180),
    coordinate: input.coordinate ?? null,
    ownerId: String(input.ownerId),
    requestedBy: String(input.requestedBy),
    priority: String(input.priority ?? 'high'),
    dueAt: String(input.dueAt),
    acknowledgementDueAt,
    observationDueAt,
    scheduledObservationAt: input.scheduledObservationAt ? String(input.scheduledObservationAt) : null,
    serviceLevelPolicyId: input.serviceLevelPolicyId ? String(input.serviceLevelPolicyId) : null,
    scheduleCommitment: input.scheduleCommitment ? structuredClone(input.scheduleCommitment) : null,
    requirements: (input.requirements ?? []).map(String).slice(0, 12),
    evidenceNeedId: input.evidenceNeedId ? String(input.evidenceNeedId) : null,
    missingQuantity: input.missingQuantity ? String(input.missingQuantity) : null,
    requestedMethodId: input.requestedMethodId ? String(input.requestedMethodId) : null,
    state: 'requested',
    createdAt: String(input.createdAt),
    updatedAt: String(input.createdAt),
    acknowledgedAt: null,
    submittedAt: null,
    resolvedAt: null,
    evidencePackageId: null,
    review: null,
    escalation: null,
    history: [{ state: 'requested', at: String(input.createdAt), actorId: String(input.requestedBy), note: 'Evidence request created.' }]
  };
}

export function evidenceRequestServiceLevel(request, { now = new Date() } = {}) {
  const nowMs = now.getTime(), acknowledgementMs = Date.parse(request?.acknowledgementDueAt ?? ''), observationMs = Date.parse(request?.observationDueAt ?? '');
  const acknowledged = Boolean(request?.acknowledgedAt) || ['acknowledged', 'in_progress', 'submitted', 'accepted', 'rejected'].includes(request?.state);
  const observed = Boolean(request?.submittedAt) || ['submitted', 'accepted', 'rejected'].includes(request?.state);
  const acknowledgementBreached = !acknowledged && Number.isFinite(acknowledgementMs) && nowMs > acknowledgementMs;
  const observationBreached = !observed && Number.isFinite(observationMs) && nowMs > observationMs;
  return {
    state: acknowledgementBreached ? 'ACKNOWLEDGEMENT_BREACHED' : observationBreached ? 'OBSERVATION_BREACHED' : observed ? 'OBSERVATION_RECEIVED' : acknowledged ? 'ACKNOWLEDGED_ON_TRACK' : 'AWAITING_ACKNOWLEDGEMENT',
    acknowledgementBreached, observationBreached, acknowledgementDueAt: request?.acknowledgementDueAt ?? null, observationDueAt: request?.observationDueAt ?? null
  };
}

export function transitionEvidenceRequest(request, nextState, context = {}) {
  const allowed = TRANSITIONS[request?.state];
  if (!allowed?.has(nextState)) throw new Error('invalid_evidence_request_transition');
  const at = String(context.at ?? new Date().toISOString());
  const next = {
    ...request,
    state: nextState,
    updatedAt: at,
    history: [...(request.history ?? []), { state: nextState, at, actorId: String(context.actorId ?? 'unknown'), note: String(context.note ?? '') }]
  };
  if (nextState === 'acknowledged') next.acknowledgedAt = at;
  if (nextState === 'submitted') {
    if (!context.evidencePackageId) throw new Error('evidence_package_required');
    next.submittedAt = at;
    next.evidencePackageId = String(context.evidencePackageId);
  }
  if (nextState === 'accepted' || nextState === 'rejected' || nextState === 'cancelled') {
    next.resolvedAt = at;
    next.review = context.review ?? next.review;
  }
  return next;
}
