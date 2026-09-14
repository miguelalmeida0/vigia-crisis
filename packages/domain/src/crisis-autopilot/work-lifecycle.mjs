import { isoTime, requiredText } from '../intelligence/shared.mjs';

export const ACTIVE_WORK_STATES = Object.freeze([
  'OPEN', 'REQUEST_ACTIVE', 'REQUESTED', 'ACKNOWLEDGED', 'IN_PROGRESS',
  'SELECTED', 'SCHEDULED', 'WAITING_FOR_OPPORTUNITY',
  'WAITING_FOR_SCHEDULED_OBSERVATION', 'WAITING_FOR_OBSERVATION',
  'WAITING_FOR_RETRY', 'RETRYING', 'RETRY_SCHEDULED', 'POLL_SCHEDULED',
  'REFRESH_REQUESTED', 'REFRESHING', 'ESCALATED', 'ASSIGNED',
]);

export const SCHEDULE_BOUND_WORK_STATES = Object.freeze([
  'SCHEDULED', 'WAITING_FOR_OPPORTUNITY', 'WAITING_FOR_SCHEDULED_OBSERVATION',
  'WAITING_FOR_OBSERVATION', 'WAITING_FOR_RETRY', 'RETRYING',
  'RETRY_SCHEDULED', 'POLL_SCHEDULED',
]);

export const BLOCKED_COLLECTION_WORK_STATES = Object.freeze([
  'AUTH_REQUIRED', 'BLOCKED_AUTHORITY', 'BUDGET_BLOCKED', 'CAUSAL_DUPLICATE',
  'CREDENTIALS_REQUIRED', 'ESCALATED_CIRCUIT_OPEN', 'FIELD_CAPACITY_NOT_CONFIGURED',
  'NO_AVAILABLE_OBSERVATION', 'NO_COVERAGE', 'NO_ASSOCIATED_OBSERVATION',
  'NO_ELIGIBLE_ASSET_CONFIGURED', 'NO_QUALIFYING_EVIDENCE',
  'NO_VALID_OBSERVATION_OPPORTUNITY', 'OUTSIDE_COVERAGE', 'PARTNER_REQUIRED',
  'RIGHTS_BLOCKED', 'SOURCE_DEGRADED', 'SOURCE_UNAVAILABLE_TERMINAL',
]);

export const CLOSED_WORK_STATES = Object.freeze([
  'RESOLVED', 'CLOSED', 'CANCELLED', 'COMPLETED', 'SUCCEEDED', 'SUPERSEDED',
  'ACCEPTED', 'FAILED_TERMINAL', 'REJECTED_TERMINAL',
]);

export const UNOBTAINABLE_STATES = Object.freeze([
  'NO_AVAILABLE_OBSERVATION', 'FIELD_CAPACITY_NOT_CONFIGURED',
  'NO_ELIGIBLE_ASSET_CONFIGURED', 'RIGHTS_BLOCKED', 'PARTNER_REQUIRED',
  'CREDENTIALS_REQUIRED', 'OUTSIDE_COVERAGE', 'NO_VALID_OBSERVATION_OPPORTUNITY',
  'SOURCE_UNAVAILABLE_TERMINAL',
]);

const ACTIVE = new Set(ACTIVE_WORK_STATES);
const SCHEDULE_BOUND = new Set(SCHEDULE_BOUND_WORK_STATES);
const BLOCKED = new Set(BLOCKED_COLLECTION_WORK_STATES);
const CLOSED = new Set(CLOSED_WORK_STATES);
const UNOBTAINABLE = new Set(UNOBTAINABLE_STATES);

export function stateOf(value = {}) {
  return String(value?.state ?? value?.status ?? value?.lifecycleState ?? 'UNKNOWN').trim().toUpperCase();
}

export function validInstant(value) {
  return Number.isFinite(Date.parse(value ?? '')) ? new Date(value).toISOString() : null;
}

export function requiredProjectionClock(value) {
  return isoTime(value, 'crisis_autopilot_projection_time_required');
}

export function requiredIncidentId(incident = {}) {
  return requiredText(incident.id ?? incident.incidentId, 'crisis_autopilot_incident_id_required');
}

export function objectId(value = {}) {
  return String(value?.id ?? value?.taskId ?? value?.requestId ?? value?.decisionId ?? value?.candidateId ?? '').trim() || null;
}

export function incidentBinding(value = {}) {
  return String(value?.incidentId ?? value?.subjectId ?? value?.targetId ?? value?.eventId ?? '').replace(/^incident:/, '');
}

export function workOwner(value = {}) {
  const owner = value?.ownerId ?? value?.owner ?? value?.assigneeId ?? value?.assignment?.owner
    ?? value?.ownerPolicy?.automationOwner ?? value?.ownerPolicy?.owner ?? value?.lifecycle?.owner ?? null;
  return owner && typeof owner === 'object' ? owner.label ?? owner.name ?? owner.id ?? null : owner;
}

export function workSource(value = {}) {
  const source = value?.sourceId ?? value?.sourceFamily ?? value?.provider ?? value?.eligibleSource
    ?? value?.sourceDependency ?? value?.selectedSourceId ?? value?.selectedSourceLabels?.[0] ?? null;
  return source && typeof source === 'object' ? source.label ?? source.name ?? source.id ?? null : source;
}

export function workNextCheck(value = {}) {
  return validInstant(value?.nextCheckAt ?? value?.nextAttempt ?? value?.nextAttemptAt ?? value?.retryAt
    ?? value?.nextObservationAt ?? value?.scheduledObservationAt ?? value?.scheduledFor ?? value?.observationDueAt ?? value?.dueAt);
}

export function workLastCheck(value = {}) {
  return validInstant(value?.lastCheckedAt ?? value?.lastCheckAt ?? value?.lastAttempt ?? value?.lastAttemptAt
    ?? value?.updatedAt ?? value?.acknowledgedAt ?? value?.createdAt);
}

export function terminalReason(value = {}) {
  return value?.terminalReason ?? value?.escalationReason ?? value?.reason ?? value?.blockerReason ?? null;
}

export function isActiveWork(value, { asOf = null } = {}) {
  const state = stateOf(value);
  if (!ACTIVE.has(state)) return false;
  if (!SCHEDULE_BOUND.has(state) || asOf === null || asOf === undefined) return true;
  const nextCheckAt = workNextCheck(value), projectionAt = validInstant(asOf);
  return Boolean(nextCheckAt && projectionAt && Date.parse(nextCheckAt) > Date.parse(projectionAt));
}

export function isClosedWork(value) {
  return CLOSED.has(stateOf(value));
}

export function isUnobtainable(value) {
  return UNOBTAINABLE.has(stateOf(value)) || value?.terminal === true || value?.exhausted === true;
}

export function collectionWorkLifecycle(value = {}, { asOf = null } = {}) {
  const state = stateOf(value), nextCheckAt = workNextCheck(value), projectionAt = validInstant(asOf);
  const nextCheckTiming = !nextCheckAt || !projectionAt ? 'UNKNOWN'
    : Date.parse(nextCheckAt) > Date.parse(projectionAt) ? 'FUTURE' : 'DUE';
  const scheduleBound = SCHEDULE_BOUND.has(state), activeMachineWork = isActiveWork(value, { asOf });
  const terminal = isClosedWork(value), blocked = BLOCKED.has(state)
    || Boolean(value?.blockerReason ?? value?.blockingReason)
    || (Array.isArray(value?.blockingConditions) && value.blockingConditions.length > 0);
  let classification = 'UNCLASSIFIED';
  if (terminal) classification = 'TERMINAL';
  else if (blocked) classification = 'BLOCKED_GOVERNED_PLAN';
  else if (activeMachineWork) classification = scheduleBound ? 'ACTIVE_SCHEDULE_BOUND' : 'ACTIVE_EXECUTION';
  else if (scheduleBound && nextCheckTiming === 'DUE') classification = 'SCHEDULE_DUE_REVIEW';
  else if (scheduleBound) classification = 'SCHEDULE_NOT_ACTIONABLE';
  else if (['OPEN', 'SELECTED', 'ELIGIBLE', 'COLLECTION_PLANNED', 'PLANNED'].includes(state)) classification = 'GOVERNED_PLAN';
  return { state, classification, activeMachineWork, scheduleBound, nextCheckAt, nextCheckTiming, terminal, blocked };
}

export function isGovernedCollectionWork(value = {}) {
  if (!objectId(value) || stateOf(value) === 'UNKNOWN') return false;
  return Boolean(value.requirementId || value.evidenceNeedId || value.unknownId || value.collectionPlanId
    || value.strategyId || value.requestedMethodId || value.sourceOpportunityId || value.acquisitionId
    || value.receipt || value.lifecycle || workOwner(value) || workSource(value) || workNextCheck(value));
}
