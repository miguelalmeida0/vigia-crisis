import { createCanonicalOperationalEvent } from '../operational-event.mjs';

const VERSION = 'vigia-fieldnet-operational-adapter.v1';
function required(value, code) { const text = String(value ?? '').trim(); if (!text) throw Object.assign(new Error(code), { code: 'INVALID_FIELDNET_RECORD', details: [code] }); return text; }
function instant(value) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw Object.assign(new Error('fieldnet_observed_at_invalid'), { code: 'INVALID_FIELDNET_RECORD', details: ['fieldnet_observed_at_invalid'] }); return date.toISOString(); }
function coordinate(record) {
  const value = record.coordinate ?? record.location?.coordinates;
  if (!Array.isArray(value) || value.length !== 2 || !value.map(Number).every(Number.isFinite)) throw Object.assign(new Error('fieldnet_coordinate_required'), { code: 'INVALID_FIELDNET_RECORD', details: ['fieldnet_coordinate_required'] });
  return value.map(Number);
}

export class FieldNetOperationalAdapter {
  constructor({ id = 'fieldnet', upstreamOrigin = 'VIGIA FieldNet' } = {}) { this.id = id; this.version = VERSION; this.upstreamOrigin = upstreamOrigin; }
  adaptOne(record, context = {}) {
    const observationId = required(record.observationId ?? record.id, 'fieldnet_observation_id_required');
    const deviceId = required(record.deviceId ?? record.reporterId, 'fieldnet_device_or_reporter_required'), observedAt = instant(record.observedAt);
    const kind = String(record.kind ?? 'sensor').toLowerCase(), report = kind === 'human_report';
    const familyId = String(record.sourceFamilyId ?? (report ? 'report.fieldnet-human' : `physical.fieldnet-${record.sensorClass ?? 'generic'}`));
    const action = String(context.action ?? record.action ?? 'CREATE').toUpperCase();
    return createCanonicalOperationalEvent({
      eventType: report ? 'wildfire.public_report' : 'wildfire.field_observation', hazardType: String(record.hazardType ?? 'wildfire'),
      action, targetEventId: context.targetEventId ?? record.targetEventId,
      provider: { adapterId: this.id, adapterVersion: this.version, providerEventId: observationId, providerRevision: record.revision ?? null },
      source: { sourceId: `fieldnet:${deviceId}`, familyId, familyClass: report ? 'REPORT' : 'PHYSICAL', producerId: deviceId, upstreamOrigin: this.upstreamOrigin },
      clocks: { occurredAt: record.occurredAt ?? observedAt, observedAt, publishedAt: record.publishedAt ?? null, receivedAt: context.receivedAt, ingestedAt: null, substitutions: record.occurredAt ? {} : { occurredAt: 'observedAt' } },
      geometry: coordinate(record), correlationKeys: context.correlationKeys ?? record.correlationKeys,
      subjectRefs: [`observation:${observationId}`, `${report ? 'reporter' : 'device'}:${deviceId}`], ingestionMetadata: { adapterRecordIndex: context.recordIndex },
      payload: {
        observationState: String(record.observationState ?? 'OBSERVED_POSITIVE').toUpperCase(), stance: String(record.stance ?? 'SUPPORTING').toUpperCase(),
        measurement: structuredClone(record.measurement ?? null), confidence: record.confidence ?? null,
        opportunity: structuredClone(record.opportunity ?? { state: 'VALID', reason: report ? 'Attributable human report.' : 'Sensor was operational at observation time.' }),
        materiality: record.materiality ?? 'MATERIAL', resolvesEventIds: record.resolvesEventIds ?? []
      },
      provenance: {
        strength: String(record.provenanceStrength ?? (report ? 'ATTRIBUTED' : 'VERIFIED')).toUpperCase(),
        upstreamMeasurementId: String(record.upstreamMeasurementId ?? `${deviceId}:${observationId}`), derivedFromEventIds: record.derivedFromEventIds,
        rawPayloadHash: context.rawPayloadHash, rawObjectRef: context.rawObjectRef, authority: deviceId,
        proofStatus: record.signatureVerified ? 'SIGNATURE_VERIFIED' : 'UNVERIFIED', deviceAttestationId: record.deviceAttestationId,
        revocationStatus: record.revocationStatus ?? 'UNKNOWN', chain: [{ network: this.upstreamOrigin, deviceId, signatureId: record.signatureId ?? null }]
      },
      proof: { parser: this.version, signatureVerified: Boolean(record.signatureVerified), synthetic: false }
    });
  }
}

export const FIELDNET_OPERATIONAL_ADAPTER_VERSION = VERSION;
