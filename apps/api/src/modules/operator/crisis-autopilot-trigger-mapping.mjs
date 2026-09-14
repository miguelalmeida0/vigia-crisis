import { canonicalIncidentId } from '../../../../../packages/domain/src/authorization.mjs';
import {
  CRISIS_AUTOPILOT_ACTIONS_BY_TRIGGER,
} from '../../../../../packages/domain/src/crisis-autopilot/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';

const SAFE_RECOMPUTE_PREFIXES = Object.freeze(['RECOMPUTE_', 'RANK_']);
const CONSEQUENTIAL_ACTIONS = new Set([
  'REPLAN_OPERATIONS', 'PREPARE_PROTECTION_ACTION_FOR_AUTHORITY_REVIEW',
  'CREATE_OR_UPDATE_AUTHORITY_REVIEW_ITEM',
]);
const OPERATIONAL_EVENT_TRIGGER_TYPES = Object.freeze({
  'wildfire.thermal_observation': 'NEW_THERMAL_DETECTION',
  'wildfire.official_alert': 'NEW_OFFICIAL_REPORT',
  'wildfire.official_alert_cancelled': 'NEW_OFFICIAL_REPORT',
  'wildfire.official_report': 'NEW_OFFICIAL_REPORT',
  'wildfire.official_observation': 'NEW_OFFICIAL_REPORT',
  'wildfire.public_report': 'NEW_FIELD_REPORT',
  'wildfire.field_observation': 'FIELD_OBSERVATION',
  'wildfire.causal_source_family_added': 'NEW_CAUSAL_SOURCE_FAMILY',
  'wildfire.weather_context': 'WEATHER_CHANGED',
  'wildfire.weather_changed': 'WEATHER_CHANGED',
  'wildfire.derived_perimeter': 'GEOMETRY_CHANGED',
  'wildfire.geometry_changed': 'GEOMETRY_CHANGED',
  'wildfire.priority_changed': 'PRIORITY_CHANGED',
  'wildfire.source_conflict': 'SOURCE_CONFLICT',
  'wildfire.road_closure': 'ROAD_CLOSURE',
  'wildfire.resource_acknowledged': 'RESOURCE_ACKNOWLEDGED',
  'wildfire.protection_threshold_reached': 'PROTECTION_THRESHOLD_REACHED',
});

export function requiredCoordinatorText(value, code) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 512) throw Object.assign(new Error(code), { statusCode: 400 });
  return result;
}

export function canonicalRevision(event = {}) {
  return String(event.revision ?? event.provider?.providerRevision ?? event.payloadHash ?? event.fingerprint ?? event.id ?? '').trim() || null;
}

export function sourceReference(event = {}) {
  return event.sourceReference ?? event.source?.sourceId ?? event.provider?.adapterId ?? event.provider?.providerEventId ?? null;
}

function incidentIdsForEvent(event = {}) {
  const values = [event.incidentId, event.correlationId, ...(Array.isArray(event.correlationKeys) ? event.correlationKeys.filter((value) => String(value).startsWith('incident:')) : [])];
  return [...new Set(values.map(canonicalIncidentId).filter(Boolean))].sort();
}

export function crisisAutopilotTriggerTypeForOperationalEvent(event = {}) {
  const type = String(event.eventType ?? '').toLowerCase();
  if (OPERATIONAL_EVENT_TRIGGER_TYPES[type]) return OPERATIONAL_EVENT_TRIGGER_TYPES[type];
  if (type === 'source.health_changed' && /DEGRADED|STALE|UNAVAILABLE|QUARANTINED|COMPROMISED/u.test(String(event.payload?.status ?? '').toUpperCase())) return 'PROVIDER_FAILURE';
  return null;
}

export function canonicalAutopilotTriggersForOperationalEvent(event = {}) {
  const triggerType = crisisAutopilotTriggerTypeForOperationalEvent(event);
  const eventId = String(event.id ?? event.eventId ?? '').trim(), revision = canonicalRevision(event);
  if (!triggerType || !eventId || !revision) return [];
  return incidentIdsForEvent(event).map((incidentId) => ({
    incidentId, eventId, revision, triggerType,
    observedAt: event.clocks?.observedAt ?? event.clocks?.occurredAt ?? event.observedAt ?? event.at ?? null,
    sourceReference: sourceReference(event),
  }));
}

export function actionClass(actionType) {
  if (actionType === 'CREATE_OR_UPDATE_INFORMATION_REQUIREMENT') return 'INFORMATION_REQUIREMENT';
  if (actionType === 'CREATE_OR_UPDATE_COLLECTION_TASK') return 'COLLECTION_TASK';
  if (SAFE_RECOMPUTE_PREFIXES.some((prefix) => actionType.startsWith(prefix))) return 'RECOMPUTE';
  return CONSEQUENTIAL_ACTIONS.has(actionType) || /PROTECTION|AUTHORITY|ASSIGNMENT|DISPATCH|WARNING/u.test(actionType)
    ? 'AUTHORITY_GATED_PROPOSAL' : 'UNSUPPORTED_PROPOSAL';
}

export function normalizedActions(trigger, proposedActions = []) {
  const baseline = (CRISIS_AUTOPILOT_ACTIONS_BY_TRIGGER[trigger.triggerType] ?? []).map((actionType) => ({ actionType, causeType: trigger.triggerType, causeId: trigger.eventId, incidentId: trigger.incidentId }));
  const rows = [...baseline, ...(Array.isArray(proposedActions) ? proposedActions : [])]
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ ...item, actionType: String(item.actionType ?? '').trim().toUpperCase() }))
    .filter((item) => item.actionType && canonicalIncidentId(item.incidentId ?? trigger.incidentId) === trigger.incidentId);
  return [...new Map(rows.map((item) => [semanticHash('crisis-autopilot-coordinator-action', {
    actionType: item.actionType, incidentId: trigger.incidentId, causeId: item.causeId ?? trigger.eventId,
    candidateId: item.candidateId ?? null, unknownId: item.unknownId ?? null,
  }), item])).values()];
}

export function verifiedTriggerFromResolved(requested, resolved) {
  const event = resolved?.event ?? resolved;
  if (!event || typeof event !== 'object') throw Object.assign(new Error('crisis_autopilot_canonical_event_not_found'), { statusCode: 404 });
  const eventId = String(event.id ?? event.eventId ?? '').trim(), revision = canonicalRevision(event);
  const triggerType = String(event.triggerType ?? crisisAutopilotTriggerTypeForOperationalEvent(event) ?? '').toUpperCase();
  const incidentIds = event.incidentId ? [canonicalIncidentId(event.incidentId)] : incidentIdsForEvent(event);
  if (eventId !== requested.eventId || revision !== requested.revision || triggerType !== requested.triggerType || !incidentIds.includes(requested.incidentId)) {
    throw Object.assign(new Error('crisis_autopilot_canonical_trigger_binding_mismatch'), { statusCode: 409, details: { requested: { incidentId: requested.incidentId, eventId: requested.eventId, revision: requested.revision, triggerType: requested.triggerType } } });
  }
  return event;
}
