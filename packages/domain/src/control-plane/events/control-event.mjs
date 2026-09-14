import { createCanonicalOperationalEvent } from '../../event-fabric/operational-event.mjs';
import { isoTime, semanticHash } from '../../intelligence/shared.mjs';

const CONTROL_TYPES = new Set(['POLICY_DECISION', 'DESIRED_STATE', 'ACTION', 'ACQUISITION_REQUEST', 'WORK_ITEM', 'RECEIPT', 'RECONCILIATION_CYCLE']);

export function createControlPlaneEvent({ controlType, record, incidentId, at, causationId = null, sequence = null } = {}) {
  const type = String(controlType ?? '').toUpperCase();
  if (!CONTROL_TYPES.has(type) || !record) throw new Error('invalid_control_plane_event');
  const observedAt = isoTime(at, 'control_event_time_required'), recordKey = record.id ?? record.decisionId;
  const payloadKey = ({ POLICY_DECISION: 'decision', DESIRED_STATE: 'desiredState', ACTION: 'action', ACQUISITION_REQUEST: 'request', WORK_ITEM: 'workItem', RECEIPT: 'receipt', RECONCILIATION_CYCLE: 'cycle' })[type];
  const payload = { controlType: type, [payloadKey]: structuredClone(record) };
  const revision = semanticHash('control-plane-record-revision', record);
  return createCanonicalOperationalEvent({
    eventType: `control.${type.toLowerCase()}`, hazardType: 'control-plane', action: 'CREATE',
    provider: { adapterId: 'vigia-control-plane', adapterVersion: 'vigia-control-plane.v1', providerEventId: `${type}:${recordKey}:${revision}:${sequence ?? ''}` },
    source: { sourceId: 'vigia-control-plane', familyId: 'system.control-plane', familyClass: 'SYSTEM', producerId: 'vigia-control-runtime', upstreamOrigin: 'VIGIA deterministic control plane' },
    clocks: { occurredAt: observedAt, observedAt, publishedAt: observedAt, receivedAt: observedAt, ingestedAt: null, substitutions: {} },
    geometry: null, correlationKeys: [`incident:${incidentId}`], correlationId: `incident:${incidentId}`, causationId,
    subjectRefs: [`incident:${incidentId}`], payload,
    provenance: { strength: 'VERIFIED', upstreamMeasurementId: `control:${type}:${recordKey}`,
      rawPayloadHash: semanticHash('control-plane-record', payload), proofStatus: 'VERIFIED', authority: 'vigia-control-runtime' },
    proof: { type: 'DETERMINISTIC_INTERNAL_CONTROL_RECORD', bindingHash: semanticHash('control-plane-proof', { type, recordKey, payload }) }
  });
}
