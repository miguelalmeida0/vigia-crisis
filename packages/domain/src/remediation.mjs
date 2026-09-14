const TRANSITIONS = Object.freeze({
  queued: new Set(['assigned', 'cancelled']),
  assigned: new Set(['in_progress', 'cancelled']),
  in_progress: new Set(['awaiting_reobservation', 'cancelled']),
  awaiting_reobservation: new Set(['verified', 'in_progress']),
  verified: new Set(['closed']),
  closed: new Set([]),
  cancelled: new Set([])
});

export function createRemediation(input) {
  if (!input?.id || !input?.hazardId || !input?.ownerId) throw new Error('invalid_remediation');
  const createdAt = String(input.createdAt ?? new Date().toISOString());
  return {
    id: String(input.id), hazardId: String(input.hazardId), title: String(input.title ?? 'Remediate verified hazard').slice(0, 180),
    ownerId: String(input.ownerId), priority: String(input.priority ?? 'high'), dueAt: String(input.dueAt ?? createdAt), coordinate: input.coordinate ?? null,
    recommendation: String(input.recommendation ?? '').slice(0, 1200), state: 'queued', createdAt, updatedAt: createdAt,
    completionEvidencePackageId: null, reobservationId: null,
    history: [{ state: 'queued', at: createdAt, actorId: String(input.createdBy ?? 'unknown'), note: 'Remediation created.' }]
  };
}

export function transitionRemediation(item, nextState, context = {}) {
  if (!TRANSITIONS[item?.state]?.has(nextState)) throw new Error('invalid_remediation_transition');
  const at = String(context.at ?? new Date().toISOString());
  if (nextState === 'awaiting_reobservation' && !context.completionEvidencePackageId) throw new Error('completion_evidence_required');
  if (nextState === 'verified' && !context.reobservationId) throw new Error('reobservation_required');
  const next = { ...item, state: nextState, updatedAt: at, history: [...(item.history ?? []), { state: nextState, at, actorId: String(context.actorId ?? 'unknown'), note: String(context.note ?? '') }] };
  if (context.ownerId) next.ownerId = String(context.ownerId);
  if (context.completionEvidencePackageId) next.completionEvidencePackageId = String(context.completionEvidencePackageId);
  if (context.reobservationId) next.reobservationId = String(context.reobservationId);
  if (nextState === 'closed') next.closedAt = at;
  return next;
}
