import { createHash } from 'node:crypto';
import { createEvidenceRequest, evidenceRequestServiceLevel, transitionEvidenceRequest } from '../../../../../packages/domain/src/evidence-request.mjs';
import { EVIDENCE_NEED_STATES } from '../../../../../packages/domain/src/evidence-need.mjs';
import { acquisitionServiceLevel } from '../events/event-action-plan.mjs';

export const ACTIVE_REQUEST_STATES = new Set(['requested', 'acknowledged', 'in_progress', 'submitted']);
export const targetId = (eventId) => `event:${eventId}`;
export const evidenceNeedId = (event) => `evidence-need:${createHash('sha256').update(`${event.id}:${event.actionNeed.kind}`).digest('hex').slice(0, 18)}`;
const unmeasured = () => ({ state: 'UNMEASURED', value: null });

export function candidateMethods(event) {
  const options = (event.observationPlan?.options ?? []).map((option) => ({
    id: String(option.id), label: String(option.label ?? option.id), kind: String(option.kind ?? 'UNKNOWN'), methodType: String(option.methodType ?? option.type ?? 'unknown'),
    availability: String(option.availability ?? 'UNKNOWN'), ownerId: option.ownerId ?? null,
    informationGain: option.informationGain ?? unmeasured(), latency: option.latency ?? unmeasured(), reliability: option.reliability ?? unmeasured(), cost: option.cost ?? unmeasured(),
    scheduledAt: option.scheduledAt ?? null, commitment: option.commitment ?? null,
    note: option.limitation ?? 'No validated information-gain, reliability or cost estimate is available.'
  }));
  if (!options.some((item) => item.availability === 'MANUAL_REQUEST')) options.push({
    id: 'manual-field-dispatch', label: 'Manual field inspection', kind: 'MANUAL', methodType: 'field_unit', availability: 'MANUAL_REQUEST', ownerId: null,
    informationGain: unmeasured(), latency: unmeasured(), reliability: unmeasured(), cost: unmeasured(), scheduledAt: null, commitment: null,
    note: 'Availability remains unknown until the assigned field owner acknowledges.'
  });
  return options;
}

export function rankingFor(event, methods) {
  return event.observationPlan?.ranking ?? {
    state: 'PARTIAL_INFORMATION_GAIN_UNMEASURED', basis: ['confirmed_availability'],
    missingDimensions: ['validated_information_gain', 'measured_reliability', 'comparable_cost']
  };
}

export function actorById(state, id) { return (state.actors ?? []).find((actor) => actor.id === id) ?? null; }
export function escalationActor(state) { return (state.actors ?? []).find((actor) => actor.role === 'supervisor') ?? null; }
export function fieldActor(state) { return (state.actors ?? []).find((actor) => actor.role === 'field_inspector') ?? null; }

export function selectMethod(state, methods) {
  const available = methods.find((item) => item.availability === 'AVAILABLE_NOW' && actorById(state, item.ownerId));
  if (available) return { method: available, owner: actorById(state, available.ownerId) };
  const scheduled = methods.find((item) => item.availability === 'SCHEDULED_CONFIRMED' && actorById(state, item.ownerId) && item.commitment);
  if (scheduled) return { method: scheduled, owner: actorById(state, scheduled.ownerId) };
  const field = fieldActor(state); if (field) return { method: methods.find((item) => item.availability === 'MANUAL_REQUEST'), owner: field };
  return { method: methods.find((item) => item.availability === 'MANUAL_REQUEST') ?? null, owner: escalationActor(state) };
}

export function serviceLevelPolicy(event, method, now) {
  const priority = String(event.actionPlan?.priority ?? event.priority?.band ?? 'elevated');
  const configured=event.actionPlan?.serviceLevel??acquisitionServiceLevel(priority);
  const scheduledMs = Date.parse(method?.scheduledAt ?? '');
  const observationDueAt = Number.isFinite(scheduledMs) ? new Date(scheduledMs + configured.observationMinutes * 60_000).toISOString() : new Date(now.getTime() + configured.observationMinutes * 60_000).toISOString();
  return { ...configured, acknowledgementDueAt: new Date(now.getTime() + configured.acknowledgementMinutes * 60_000).toISOString(), observationDueAt };
}

export function createRequestForNeed({ needId, event, owner, method, now }) {
  const policy = serviceLevelPolicy(event, method, now);
  const requestId = `evidence-request:need:${createHash('sha256').update(needId).digest('hex').slice(0, 18)}`;
  let request = createEvidenceRequest({
    id: requestId, targetType: 'fire_event', targetId: targetId(event.id), title: `Acquire evidence · ${event.label ?? event.id}`,
    coordinate: event.coordinate ?? null, ownerId: owner.id, requestedBy: 'system', priority: event.priority?.level ?? event.actionPlan?.priority ?? 'high',
    dueAt: policy.observationDueAt, acknowledgementDueAt: policy.acknowledgementDueAt, observationDueAt: policy.observationDueAt,
    scheduledObservationAt: method?.scheduledAt ?? null, serviceLevelPolicyId: policy.id, scheduleCommitment: method?.commitment ?? null,
    requirements: [`Resolve missing quantity: ${event.actionNeed.kind}`, 'Provide attributable observation time, location, observer and provenance.', 'Report GPS accuracy or explicitly mark location as assignment-derived.', 'Do not infer fire confirmation from assignment completion alone.'],
    evidenceNeedId: needId, missingQuantity: event.actionNeed.kind, requestedMethodId: method?.id ?? 'manual-field-dispatch', createdAt: now.toISOString()
  });
  if (method?.availability === 'SCHEDULED_CONFIRMED') request = transitionEvidenceRequest(request, 'acknowledged', { actorId: owner.id, at: now.toISOString(), note: `Confirmed schedule commitment ${method.commitment.id}.` });
  return request;
}

export function needDisposition({ request, method, owner, now }) {
  if (!owner || !request) return { state: method?.availability==='MANUAL_REQUEST'?EVIDENCE_NEED_STATES.FIELD_CAPACITY_NOT_CONFIGURED:EVIDENCE_NEED_STATES.NO_AVAILABLE_OBSERVATION, serviceLevel: null, escalationReason: method?.availability==='MANUAL_REQUEST'?'field_capacity_not_configured':'no_available_observation_method' };
  const serviceLevel = evidenceRequestServiceLevel(request, { now });
  if (!ACTIVE_REQUEST_STATES.has(request.state)) return { state: EVIDENCE_NEED_STATES.MANUAL_ESCALATION_REQUIRED, serviceLevel, escalationReason: `terminal_request_${request.state}_without_resolution` };
  if (serviceLevel.acknowledgementBreached || serviceLevel.observationBreached) return { state: EVIDENCE_NEED_STATES.MANUAL_ESCALATION_REQUIRED, serviceLevel, escalationReason: serviceLevel.acknowledgementBreached ? 'acknowledgement_sla_breached' : 'observation_sla_breached' };
  if (method?.availability === 'SCHEDULED_CONFIRMED') return { state: EVIDENCE_NEED_STATES.WAITING_FOR_SCHEDULED_OBSERVATION, serviceLevel, escalationReason: null };
  if (method?.availability === 'MANUAL_REQUEST' && owner.role !== 'field_inspector') return { state: EVIDENCE_NEED_STATES.FIELD_CAPACITY_NOT_CONFIGURED, serviceLevel, escalationReason: 'field_capacity_not_configured' };
  return { state: EVIDENCE_NEED_STATES.REQUEST_ACTIVE, serviceLevel, escalationReason: null };
}

export function acceptedObservation(request, evidencePackage) {
  const locationSource = evidencePackage.provenance?.locationSource ?? (evidencePackage.accuracyMeters == null ? 'unknown' : 'device_gps');
  const flags = [];
  if (!evidencePackage.coordinate) flags.push('coordinate_missing');
  if (evidencePackage.accuracyMeters == null) flags.push('gps_accuracy_missing');
  if (locationSource !== 'device_gps') flags.push('location_not_device_verified');
  return { id: `field-evidence:${evidencePackage.id}`, type: 'field', source: 'Accepted VIGIA field evidence', sourceFamily: 'field_evidence', independenceGroup: `field_observer:${evidencePackage.observerId}`, sensorId: evidencePackage.observerId, classification: evidencePackage.observations?.[0] ?? 'field_observation', coordinate: evidencePackage.coordinate ?? request.coordinate ?? null, at: evidencePackage.capturedAt, receivedAt: evidencePackage.receivedAt, confidence: null, geolocationUncertaintyM: evidencePackage.accuracyMeters ?? null, qualityFlags: flags, evidenceUrl: evidencePackage.attachments?.[0]?.url ?? null, metadata: { evidenceRequestId: request.id, evidencePackageId: evidencePackage.id, checksum: evidencePackage.checksum, locationSource, negativeEvidenceEligible: locationSource === 'device_gps' } };
}

export function eligibleForEventGraph(evidencePackage) {
  const coordinate = evidencePackage?.coordinate, accuracy = Number(evidencePackage?.accuracyMeters);
  return evidencePackage?.provenance?.locationSource === 'device_gps' && Array.isArray(coordinate) && coordinate.length === 2 && coordinate.every(Number.isFinite)
    && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100 && Number.isFinite(Date.parse(evidencePackage?.capturedAt))
    && (evidencePackage?.observations ?? []).some((item) => String(item).trim());
}
