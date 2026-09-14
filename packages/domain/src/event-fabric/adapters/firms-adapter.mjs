import { createCanonicalOperationalEvent } from '../operational-event.mjs';

const VERSION = 'vigia-firms-operational-adapter.v1';
function text(value, code) { const result = String(value ?? '').trim(); if (!result) throw Object.assign(new Error(code), { code: 'INVALID_FIRMS_RECORD', details: [code] }); return result; }
function optionalNumber(value) { if(value===null||value===undefined||String(value).trim()==='')return null;const result=Number(value);return Number.isFinite(result)?result:null; }
function number(value, code) { const result = optionalNumber(value); if (result===null) throw Object.assign(new Error(code), { code: 'INVALID_FIRMS_RECORD', details: [code] }); return result; }
function observedAt(row) {
  const date = text(row.acq_date, 'firms_acq_date_required'), time = text(row.acq_time, 'firms_acq_time_required').padStart(4, '0');
  const value = new Date(`${date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
  if (!Number.isFinite(value.getTime())) throw Object.assign(new Error('invalid_firms_observation_time'), { code: 'INVALID_FIRMS_RECORD', details: ['invalid_firms_observation_time'] });
  return value.toISOString();
}
function satellite(row) { return String(row.satellite ?? 'VIIRS').trim().toUpperCase(); }

export class FirmsOperationalAdapter {
  constructor({ id = 'nasa-firms', sourceId = 'nasa-firms', upstreamOrigin = 'NASA FIRMS VIIRS/MODIS', authority = 'NASA FIRMS', producerId = 'NASA-FIRMS' } = {}) {
    this.id = id; this.version = VERSION; this.sourceId = sourceId; this.upstreamOrigin = upstreamOrigin; this.authority = authority; this.producerId = producerId;
  }
  adaptOne(row, context = {}) {
    const at = observedAt(row), latitude = number(row.latitude, 'firms_latitude_required'), longitude = number(row.longitude, 'firms_longitude_required');
    const instrument = String(row.instrument ?? 'VIIRS').trim().toUpperCase(), platform = satellite(row);
    const measurementId = String(row.measurement_id ?? row.id ?? `${instrument}:${platform}:${at}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`);
    const providerEventId = String(row.id ?? measurementId);
    return createCanonicalOperationalEvent({
      eventType: 'wildfire.thermal_observation', hazardType: 'wildfire', action: context.action ?? 'CREATE', targetEventId: context.targetEventId,
      provider: { adapterId: this.id, adapterVersion: this.version, providerEventId, providerRevision: row.revision ?? null },
      source: { sourceId: this.sourceId, familyId: `physical.${instrument.toLowerCase()}`, familyClass: 'PHYSICAL', producerId: this.producerId, upstreamOrigin: this.upstreamOrigin },
      clocks: { occurredAt: at, observedAt: at, publishedAt: row.published_at ?? null, receivedAt: context.receivedAt, ingestedAt: null, substitutions: { occurredAt: 'observedAt' } },
      geometry: [longitude, latitude], correlationKeys: context.correlationKeys ?? row.correlation_keys,
      subjectRefs: [`measurement:${measurementId}`, `platform:${platform}`], ingestionMetadata: { adapterRecordIndex: context.recordIndex },
      payload: {
        observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING', confidence: row.confidence ?? null,
        frpMw: optionalNumber(row.frp), brightnessK: optionalNumber(row.bright_ti4 ?? row.brightness),
        instrument, platform, dayNight: row.daynight ?? null
      },
      provenance: { strength: 'VERIFIED', upstreamMeasurementId: measurementId, rawPayloadHash: context.rawPayloadHash, rawObjectRef: context.rawObjectRef, authority: this.authority, proofStatus: 'PROVIDER_ATTRIBUTED', chain: [{ producer: this.producerId, platform, instrument }] },
      proof: { parser: this.version, synthetic: false }
    });
  }
}

export const FIRMS_OPERATIONAL_ADAPTER_VERSION = VERSION;
