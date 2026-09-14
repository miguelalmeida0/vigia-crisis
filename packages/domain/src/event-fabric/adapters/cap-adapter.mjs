import { createCanonicalOperationalEvent } from '../operational-event.mjs';

const VERSION = 'vigia-cap-operational-adapter.v1';
function required(value, code) { const text = String(value ?? '').trim(); if (!text) throw Object.assign(new Error(code), { code: 'INVALID_CAP_ALERT', details: [code] }); return text; }
function instant(value, code) { const time = new Date(value); if (!Number.isFinite(time.getTime())) throw Object.assign(new Error(code), { code: 'INVALID_CAP_ALERT', details: [code] }); return time.toISOString(); }
function coordinate(alert) {
  const direct = alert.coordinate ?? alert.info?.area?.coordinate;
  if (Array.isArray(direct)) return direct.map(Number);
  const circle = String(alert.info?.area?.circle ?? '').trim().split(/[ ,]+/).map(Number);
  if (circle.length >= 2 && circle.slice(0, 2).every(Number.isFinite)) return [circle[1], circle[0]];
  throw Object.assign(new Error('cap_area_coordinate_required'), { code: 'INVALID_CAP_ALERT', details: ['cap_area_coordinate_required'] });
}
function action(msgType) { return ({ ALERT: 'CREATE', UPDATE: 'UPDATE', CANCEL: 'CANCEL' })[String(msgType).toUpperCase()] ?? 'CREATE'; }

export class CapOperationalAdapter {
  constructor({ id = 'cap', sourceId = 'cap-authority', producerId = 'civil-protection-authority', upstreamOrigin = 'OASIS CAP feed' } = {}) {
    this.id = id; this.version = VERSION; this.sourceId = sourceId; this.producerId = producerId; this.upstreamOrigin = upstreamOrigin;
  }
  adaptOne(alert, context = {}) {
    const identifier = required(alert.identifier, 'cap_identifier_required'), sent = instant(alert.sent, 'cap_sent_time_required');
    const status = String(alert.status ?? 'Actual').toUpperCase();
    if (status !== 'ACTUAL' && !context.allowExercises) throw Object.assign(new Error('cap_non_actual_alert_rejected'), { code: 'CAP_NON_ACTUAL', details: ['cap_non_actual_alert_rejected'] });
    const eventCode = String(alert.info?.eventCode ?? alert.info?.event ?? 'wildfire'), kind = String(alert.info?.category ?? 'wildfire').toLowerCase();
    const relation = action(alert.msgType), targetEventId = context.targetEventId ?? alert.targetEventId ?? null;
    const effective = alert.info?.onset ?? alert.info?.effective ?? sent;
    return createCanonicalOperationalEvent({
      eventType: relation === 'CANCEL' ? 'wildfire.official_alert_cancelled' : 'wildfire.official_alert', hazardType: kind.includes('fire') ? 'wildfire' : kind,
      action: relation, targetEventId,
      provider: { adapterId: this.id, adapterVersion: this.version, providerEventId: identifier, providerRevision: alert.sent },
      source: { sourceId: this.sourceId, familyId: 'official.cap-alert', familyClass: 'OFFICIAL', producerId: this.producerId, upstreamOrigin: this.upstreamOrigin },
      clocks: { occurredAt: effective, observedAt: effective, publishedAt: sent, receivedAt: context.receivedAt, ingestedAt: null, substitutions: { observedAt: 'CAP effective/onset' } },
      geometry: coordinate(alert), correlationKeys: context.correlationKeys ?? alert.correlationKeys,
      subjectRefs: [`cap-alert:${identifier}`, `event-code:${eventCode}`], ingestionMetadata: { adapterRecordIndex: context.recordIndex },
      payload: {
        observationState: alert.info?.observationState ?? 'OBSERVED_POSITIVE', stance: alert.info?.stance ?? 'SUPPORTING', eventCode,
        headline: alert.info?.headline ?? null, urgency: alert.info?.urgency ?? null, severity: alert.info?.severity ?? null, certainty: alert.info?.certainty ?? null,
        effective: alert.info?.effective ?? null, onset: alert.info?.onset ?? null, expires: alert.info?.expires ?? null,
        references: structuredClone(alert.references ?? []), area: structuredClone(alert.info?.area ?? null),
        opportunity: alert.info?.opportunity ?? { state: 'VALID', reason: 'Official alerting authority observation.' }, resolvesEventIds: alert.info?.resolvesEventIds ?? []
      },
      provenance: { strength: 'CHAIN_OF_CUSTODY', upstreamMeasurementId: `cap:${this.producerId}:${identifier}`, rawPayloadHash: context.rawPayloadHash, rawObjectRef: context.rawObjectRef, authority: alert.sender ?? this.producerId, proofStatus: 'PROVIDER_ATTRIBUTED', chain: [{ standard: 'OASIS-CAP', sender: alert.sender ?? this.producerId }] },
      proof: { parser: this.version, status, scope: alert.scope ?? null, synthetic: false }
    });
  }
}

export const CAP_OPERATIONAL_ADAPTER_VERSION = VERSION;
