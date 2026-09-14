import { isoTime, requiredText, semanticHash } from '../intelligence/shared.mjs';

export const CRISIS_REPLAN_TRIGGER_TYPES = Object.freeze([
  'ROAD_CLOSURE',
  'WEATHER_CHANGED',
  'RESOURCE_REJECTED_TASK',
  'RESOURCE_UNAVAILABLE',
  'PRIORITY_CHANGED',
  'AUTHORITY_DENIED',
  'FIELD_REPORT_CONTRADICTS_PLAN',
]);

export const PROTECTION_TIMELINE_WINDOWS_MINUTES = Object.freeze([15, 30, 60, 120]);

export const PROTECTION_MESSAGE_FIELDS = Object.freeze([
  'whatHappened',
  'where',
  'whoIsAffected',
  'whatToDo',
  'whatNotToDo',
  'when',
  'authority',
  'nextUpdate',
]);

export const PROTECTION_LANGUAGES = Object.freeze(['pt', 'en', 'es', 'de']);

export const CAP_PROTECTION_STATES = Object.freeze([
  'DRAFT',
  'VALIDATED',
  'AUTHORITY_REVIEW',
  'APPROVED',
  'EXERCISE_SENT',
  'RECEIPT_RECORDED',
  'UPDATED',
  'SUPERSEDED',
  'CANCELLED',
  'EXPIRED',
]);

const CAP_ACTIONS = Object.freeze({
  DRAFT: Object.freeze({ VALIDATE: 'VALIDATED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  VALIDATED: Object.freeze({ AUTHORITY_REVIEW: 'AUTHORITY_REVIEW', UPDATE: 'UPDATED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  AUTHORITY_REVIEW: Object.freeze({ APPROVE: 'APPROVED', UPDATE: 'UPDATED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  APPROVED: Object.freeze({ EXERCISE_SEND: 'EXERCISE_SENT', UPDATE: 'UPDATED', SUPERSEDE: 'SUPERSEDED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  EXERCISE_SENT: Object.freeze({ RECEIPT: 'RECEIPT_RECORDED', UPDATE: 'UPDATED', SUPERSEDE: 'SUPERSEDED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  RECEIPT_RECORDED: Object.freeze({ UPDATE: 'UPDATED', SUPERSEDE: 'SUPERSEDED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  UPDATED: Object.freeze({ VALIDATE: 'VALIDATED', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' }),
  SUPERSEDED: Object.freeze({}),
  CANCELLED: Object.freeze({}),
  EXPIRED: Object.freeze({}),
});

export function requiredPlanningClock(value) {
  return isoTime(value, 'crisis_planning_projection_time_required');
}

export function requiredPlanningIncidentId(incident = {}) {
  return requiredText(incident.id ?? incident.incidentId, 'crisis_planning_incident_id_required');
}

export function optionalInstant(value) {
  if (!Number.isFinite(Date.parse(value ?? ''))) return null;
  return new Date(value).toISOString();
}

export function normalizedSource(value = {}) {
  const source = value?.provenance ?? value?.source ?? {};
  const sourceId = String(
    (typeof source === 'string' ? source : null)
    ?? source.id ?? source.sourceId ?? source.provider ?? source.name
    ?? value.sourceId ?? value.provider ?? '',
  ).trim() || null;
  const reference = String(
    source.reference ?? source.sourceReference ?? source.url ?? source.datasetId
    ?? source.sourceRecordId ?? source.archiveSha256
    ?? value.sourceReference ?? value.evidenceReference ?? value.sourceRecordId
    ?? (typeof value.id === 'string' ? value.id : null) ?? '',
  ).trim() || null;
  return {
    sourceId,
    reference,
    attributable: Boolean(sourceId && reference),
  };
}

export function normalizedCoordinate(value) {
  const candidate = Array.isArray(value)
    ? value
    : value?.coordinate ?? value?.coordinates ?? value?.location?.coordinate
      ?? (value?.location?.geometry?.type === 'Point' ? value.location.geometry.coordinates : null)
      ?? (value?.geometry?.type === 'Point' ? value.geometry.coordinates : null);
  if (!Array.isArray(candidate) || candidate.length < 2) return null;
  const longitude = Number(candidate[0]);
  const latitude = Number(candidate[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

export function distanceKm(left, right) {
  const a = normalizedCoordinate(left);
  const b = normalizedCoordinate(right);
  if (!a || !b) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(b[1] - a[1]);
  const dLon = radians(b[0] - a[0]);
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round((6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))) * 1000) / 1000;
}

export function stablePlanningId(prefix, value) {
  return semanticHash(prefix, value);
}

export function applyCapProtectionTransition(currentState, event = {}) {
  const current = String(currentState ?? '').toUpperCase();
  if (!CAP_PROTECTION_STATES.includes(current)) throw new Error(`cap_protection_state_invalid:${current || 'missing'}`);
  const action = String(event.action ?? event.type ?? '').trim().toUpperCase().replaceAll(' ', '_');
  if (action === 'LIVE_SEND' || action === 'SEND') throw new Error('cap_protection_live_send_not_supported');
  const next = CAP_ACTIONS[current]?.[action];
  if (!next) throw new Error(`cap_protection_transition_invalid:${current}:${action || 'missing'}`);
  const actor = String(event.actorId ?? event.actor ?? '').trim();
  const reference = String(event.reference ?? event.evidenceReference ?? event.receiptReference ?? '').trim();
  const at = optionalInstant(event.at ?? event.occurredAt);
  if (!actor) throw new Error('cap_protection_transition_actor_required');
  if (!reference) throw new Error('cap_protection_transition_reference_required');
  if (!at) throw new Error('cap_protection_transition_time_required');
  if (action === 'VALIDATE' && !String(event.validationReference ?? reference).trim()) throw new Error('cap_protection_validation_reference_required');
  if (action === 'APPROVE') {
    if (!String(event.authorityId ?? '').trim()) throw new Error('cap_protection_authority_required');
    if (event.authorized !== true) throw new Error('cap_protection_authorization_proof_required');
  }
  if (action === 'EXERCISE_SEND' && String(event.mode ?? '').toUpperCase() !== 'EXERCISE') throw new Error('cap_protection_exercise_send_mode_required');
  if (action === 'RECEIPT' && !String(event.receiptReference ?? '').trim()) throw new Error('cap_protection_receipt_reference_required');
  return {
    previousState: current,
    action,
    nextState: next,
    actorId: actor,
    at,
    reference,
    authorityId: String(event.authorityId ?? '').trim() || null,
    exercise: action === 'EXERCISE_SEND' || event.mode === 'EXERCISE',
    consequentialExecution: action === 'EXERCISE_SEND',
  };
}
