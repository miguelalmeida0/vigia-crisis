import { immutable, isoTime, requiredText, semanticHash, stableStringify, uniqueSorted } from '../intelligence/shared.mjs';

export const OPERATIONAL_EVENT_SCHEMA = 'vigia.operational-event.v1';
export const EVENT_ACTIONS = Object.freeze(['CREATE', 'UPDATE', 'CORRECT', 'SUPERSEDE', 'CANCEL']);
export const SOURCE_FAMILY_CLASSES = Object.freeze(['REPORT', 'PHYSICAL', 'OFFICIAL', 'HUMAN', 'CONTEXT', 'SYSTEM']);

function nullableTime(value, field, errors) {
  if (value === null || value === undefined || value === '') return null;
  try { return isoTime(value, `invalid_${field}`); } catch { errors.push(`invalid_${field}`); return null; }
}

function pointGeometry(value, errors) {
  if (value === null || value === undefined) return null;
  const geometry = Array.isArray(value) ? { type: 'Point', coordinates: value } : value;
  const coordinate = geometry?.type === 'Point' ? geometry.coordinates : null;
  if (!Array.isArray(coordinate) || coordinate.length !== 2 || !coordinate.map(Number).every(Number.isFinite)) {
    errors.push('invalid_point_geometry'); return null;
  }
  const [longitude, latitude] = coordinate.map(Number);
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    errors.push('invalid_point_geometry'); return null;
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function normalizeCore(input, errors) {
  const action = String(input.action ?? 'CREATE').toUpperCase();
  if (!EVENT_ACTIONS.includes(action)) errors.push('invalid_event_action');
  const familyClass = String(input.source?.familyClass ?? '').toUpperCase();
  if (!SOURCE_FAMILY_CLASSES.includes(familyClass)) errors.push('invalid_source_family_class');
  const clocks = input.clocks ?? {}, correlationKeys = uniqueSorted(input.correlationKeys), payload = structuredClone(input.payload ?? {});
  const normalized = {
    schemaVersion: input.schemaVersion ?? OPERATIONAL_EVENT_SCHEMA,
    eventType: String(input.eventType ?? '').trim(), hazardType: String(input.hazardType ?? '').trim().toLowerCase(),
    action, targetEventId: input.targetEventId ? String(input.targetEventId) : null,
    provider: {
      adapterId: String(input.provider?.adapterId ?? '').trim(), adapterVersion: String(input.provider?.adapterVersion ?? '').trim(),
      providerEventId: String(input.provider?.providerEventId ?? '').trim(), providerRevision: input.provider?.providerRevision == null ? null : String(input.provider.providerRevision)
    },
    source: {
      sourceId: String(input.source?.sourceId ?? '').trim(), familyId: String(input.source?.familyId ?? '').trim(), familyClass,
      producerId: String(input.source?.producerId ?? '').trim(), upstreamOrigin: String(input.source?.upstreamOrigin ?? '').trim()
    },
    clocks: {
      occurredAt: nullableTime(clocks.occurredAt, 'occurred_at', errors), observedAt: nullableTime(clocks.observedAt, 'observed_at', errors),
      publishedAt: nullableTime(clocks.publishedAt, 'published_at', errors), receivedAt: nullableTime(clocks.receivedAt, 'received_at', errors),
      ingestedAt: nullableTime(clocks.ingestedAt, 'ingested_at', errors), substitutions: structuredClone(clocks.substitutions ?? {})
    },
    geometry: pointGeometry(input.geometry, errors), correlationKeys,
    correlationId: input.correlationId ? String(input.correlationId) : correlationKeys.find((key) => key.startsWith('incident:')) ?? null,
    causationId: input.causationId ? String(input.causationId) : input.targetEventId ? String(input.targetEventId) : null,
    subjectRefs: uniqueSorted(input.subjectRefs), payload, payloadHash: semanticHash('payload', payload),
    provenance: {
      strength: String(input.provenance?.strength ?? 'ATTRIBUTED').toUpperCase(),
      upstreamMeasurementId: input.provenance?.upstreamMeasurementId ? String(input.provenance.upstreamMeasurementId) : null,
      derivedFromEventIds: uniqueSorted(input.provenance?.derivedFromEventIds), rawPayloadHash: String(input.provenance?.rawPayloadHash ?? ''),
      rawObjectRef: input.provenance?.rawObjectRef ? String(input.provenance.rawObjectRef) : null,
      rawContentType: String(input.provenance?.rawContentType ?? 'application/json'), authority: input.provenance?.authority ? String(input.provenance.authority) : null,
      proofStatus: String(input.provenance?.proofStatus ?? 'UNVERIFIED').toUpperCase(), deviceAttestationId: input.provenance?.deviceAttestationId ? String(input.provenance.deviceAttestationId) : null,
      revocationStatus: String(input.provenance?.revocationStatus ?? 'UNKNOWN').toUpperCase(), chain: structuredClone(input.provenance?.chain ?? [])
    },
    proof: structuredClone(input.proof ?? {}), trust: input.trust ? structuredClone(input.trust) : null,
    ingestionMetadata: structuredClone(input.ingestionMetadata ?? {})
  };
  if (normalized.schemaVersion !== OPERATIONAL_EVENT_SCHEMA) errors.push('unsupported_operational_event_schema');
  for (const [field, value] of [['event_type', normalized.eventType], ['hazard_type', normalized.hazardType], ['adapter_id', normalized.provider.adapterId],
    ['adapter_version', normalized.provider.adapterVersion], ['provider_event_id', normalized.provider.providerEventId], ['source_id', normalized.source.sourceId],
    ['source_family_id', normalized.source.familyId], ['producer_id', normalized.source.producerId], ['upstream_origin', normalized.source.upstreamOrigin]]) if (!value) errors.push(`${field}_required`);
  if (action !== 'CREATE' && !normalized.targetEventId) errors.push('amendment_target_required');
  if (!normalized.clocks.observedAt && !normalized.clocks.occurredAt) errors.push('occurred_or_observed_time_required');
  if (!normalized.clocks.receivedAt) errors.push('received_at_required');
  if (!normalized.provenance.rawPayloadHash) errors.push('raw_payload_hash_required');
  if (Buffer.byteLength(stableStringify(payload)) > 256 * 1024) errors.push('canonical_payload_too_large');
  if (payload.observationState && !['OBSERVED_POSITIVE', 'OBSERVED_NEGATIVE', 'OBSERVED_UNDETERMINED', 'NOT_OBSERVED'].includes(String(payload.observationState).toUpperCase())) errors.push('invalid_observation_state');
  if (payload.stance && !['SUPPORTING', 'CONTRADICTING', 'IRRELEVANT'].includes(String(payload.stance).toUpperCase())) errors.push('invalid_evidence_stance');
  return normalized;
}

export function validateCanonicalOperationalEvent(input = {}) {
  const errors = []; const normalized = normalizeCore(input, errors);
  if (input.id && String(input.id) !== operationalEventId(normalized)) errors.push('operational_event_id_mismatch');
  return immutable({ valid: errors.length === 0, errors: uniqueSorted(errors), normalized });
}

export function operationalEventId(input = {}) {
  const identity = {
    schemaVersion: input.schemaVersion ?? OPERATIONAL_EVENT_SCHEMA, adapterId: input.provider?.adapterId,
    providerEventId: input.provider?.providerEventId, providerRevision: input.provider?.providerRevision ?? null,
    action: input.action ?? 'CREATE', targetEventId: input.targetEventId ?? null,
    payloadHash: input.payloadHash ?? semanticHash('payload', input.payload ?? {}), geometry: input.geometry ?? null
  };
  return semanticHash('operational-event', identity);
}

export function operationalEventBindingHash(event = {}) {
  return semanticHash('operational-event-binding', {
    id: event.id, schemaVersion: event.schemaVersion, eventType: event.eventType, hazardType: event.hazardType, action: event.action,
    targetEventId: event.targetEventId, provider: event.provider, source: event.source,
    clocks: { occurredAt: event.clocks?.occurredAt ?? null, observedAt: event.clocks?.observedAt ?? null, publishedAt: event.clocks?.publishedAt ?? null, substitutions: event.clocks?.substitutions ?? {} },
    geometry: event.geometry, correlationKeys: event.correlationKeys, correlationId: event.correlationId, causationId: event.causationId,
    subjectRefs: event.subjectRefs, payloadHash: event.payloadHash, provenance: event.provenance, proof: event.proof, trust: event.trust ?? null
  });
}

export function operationalEventStatementHash(event = {}) {
  const provenance = structuredClone(event.provenance ?? {}); delete provenance.proofStatus; delete provenance.revocationStatus;
  return semanticHash('operational-event-statement', {
    id: event.id ?? operationalEventId(event), schemaVersion: event.schemaVersion, eventType: event.eventType, hazardType: event.hazardType,
    action: event.action, targetEventId: event.targetEventId, provider: event.provider, source: event.source,
    clocks: { occurredAt: event.clocks?.occurredAt ?? null, observedAt: event.clocks?.observedAt ?? null, publishedAt: event.clocks?.publishedAt ?? null,
      substitutions: event.clocks?.substitutions ?? {} }, geometry: event.geometry, correlationKeys: event.correlationKeys,
    correlationId: event.correlationId, causationId: event.causationId, subjectRefs: event.subjectRefs,
    payloadHash: event.payloadHash ?? semanticHash('payload', event.payload ?? {}), provenance
  });
}

export function bindOperationalEventTrust(event, trust) {
  const value = structuredClone(event); delete value.fingerprint; value.trust = structuredClone(trust);
  return createCanonicalOperationalEvent(value);
}

export function createCanonicalOperationalEvent(input = {}) {
  const result = validateCanonicalOperationalEvent(input);
  if (!result.valid) throw Object.assign(new Error(`invalid_operational_event:${result.errors.join('|')}`), { code: 'INVALID_OPERATIONAL_EVENT', details: result.errors });
  const event = { ...result.normalized, id: operationalEventId(result.normalized) };
  return immutable({ ...event, fingerprint: semanticHash('operational-event-record', event) });
}

export function commitOperationalEvent(event, ingestedAt) {
  const value = structuredClone(event); value.clocks.ingestedAt = isoTime(ingestedAt, 'ingested_at_required');
  delete value.fingerprint; return createCanonicalOperationalEvent(value);
}

export function canonicalEventEqual(left, right) { return stableStringify(left) === stableStringify(right); }
