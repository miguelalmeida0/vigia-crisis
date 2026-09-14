import { createCanonicalOperationalEvent } from './operational-event.mjs';
import { immutable, isoTime, semanticHash } from '../intelligence/shared.mjs';

export const SOURCE_HEALTH_STATES = Object.freeze(['ACTIVE', 'DEGRADED', 'STALE', 'UNAVAILABLE', 'QUARANTINED', 'COMPROMISED', 'UNKNOWN']);

function definition(input = {}) {
  const sourceId = String(input.sourceId ?? '').trim(), familyId = String(input.familyId ?? '').trim();
  if (!sourceId || !familyId) throw new Error('source_registry_identity_required');
  const staleAfterMs = Number(input.staleAfterMs);
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new Error('source_registry_staleness_required');
  return {
    sourceId, familyId, familyClass: String(input.familyClass ?? '').toUpperCase(), label: String(input.label ?? sourceId),
    provider: String(input.provider ?? input.producerId ?? sourceId), sourceClass: String(input.sourceClass ?? input.familyClass ?? 'OTHER').toUpperCase(),
    producerId: String(input.producerId ?? sourceId), upstreamOrigin: String(input.upstreamOrigin ?? sourceId), upstreamLineage: structuredClone(input.upstreamLineage ?? []),
    capabilities: [...new Set((input.capabilities ?? []).map(String))].sort(), geographicApplicability: structuredClone(input.geographicApplicability ?? null),
    staleAfterMs, initialStatus: String(input.initialStatus ?? 'ACTIVE').toUpperCase(), registeredAt: isoTime(input.registeredAt, 'source_registered_at_required'),
    metadata: structuredClone(input.metadata ?? {})
  };
}

export function createSourceRegistry(definitions = []) {
  const byId = new Map();
  for (const input of definitions) {
    const value = definition(input);
    if (byId.has(value.sourceId)) throw new Error(`duplicate_source_registry_entry:${value.sourceId}`);
    byId.set(value.sourceId, value);
  }
  const sources = [...byId.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  return immutable({ schemaVersion: 'vigia.source-registry.v1', sources, fingerprint: semanticHash('source-registry', sources) });
}

export function createSourceHealthEvent({ sourceId, status, at, reason = '', lastSuccessAt = null, lastFailureAt = null, latencyMs = null, errorCode = null, metrics = {}, sequence = null }, context = {}) {
  const normalized = String(status ?? '').toUpperCase();
  if (!SOURCE_HEALTH_STATES.includes(normalized)) throw new Error('invalid_source_health_status');
  const observedAt = isoTime(at, 'source_health_time_required');
  return createCanonicalOperationalEvent({
    eventType: 'source.health_changed', hazardType: 'operational',
    provider: { adapterId: 'vigia-source-health', adapterVersion: 'vigia-source-health.v1', providerEventId: `${sourceId}:${observedAt}:${normalized}:${sequence ?? ''}` },
    source: { sourceId: 'vigia-source-health', familyId: 'system.source-health', familyClass: 'SYSTEM', producerId: 'vigia-runtime', upstreamOrigin: 'VIGIA source supervision' },
    clocks: { occurredAt: observedAt, observedAt, publishedAt: observedAt, receivedAt: context.receivedAt ?? observedAt, ingestedAt: null, substitutions: {} },
    geometry: null, correlationKeys: [`source:${sourceId}`],
    payload: {
      targetSourceId: String(sourceId), status: normalized, reason: String(reason), lastSuccessAt: lastSuccessAt ? isoTime(lastSuccessAt) : null,
      lastFailureAt: lastFailureAt ? isoTime(lastFailureAt) : null, latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
      errorCode: errorCode ? String(errorCode) : null, metrics: structuredClone(metrics)
    },
    provenance: { strength: 'VERIFIED', upstreamMeasurementId: `source-health:${sourceId}:${observedAt}`, rawPayloadHash: semanticHash('source-health-payload', { sourceId, status: normalized, observedAt, reason, lastSuccessAt, lastFailureAt, latencyMs, errorCode, metrics }) },
    proof: { producer: 'vigia-runtime', synthetic: false }
  });
}

export function sourceHealthProjection(registry, events = [], asOf) {
  const at = isoTime(asOf, 'source_health_as_of_required'), asOfMs = Date.parse(at), latest = new Map();
  for (const event of events) {
    if (event.eventType !== 'source.health_changed' || Date.parse(event.clocks.ingestedAt ?? event.clocks.receivedAt) > asOfMs) continue;
    const target = event.payload.targetSourceId, prior = latest.get(target);
    if (!prior || Date.parse(event.clocks.observedAt ?? event.clocks.occurredAt) > Date.parse(prior.clocks.observedAt ?? prior.clocks.occurredAt)
      || Date.parse(event.clocks.observedAt ?? event.clocks.occurredAt) === Date.parse(prior.clocks.observedAt ?? prior.clocks.occurredAt) && event.id.localeCompare(prior.id) > 0) latest.set(target, event);
  }
  const sources = registry.sources.filter((source) => Date.parse(source.registeredAt) <= asOfMs).map((source) => {
    const health = latest.get(source.sourceId), reference = health?.payload.lastSuccessAt ?? health?.clocks.observedAt ?? source.registeredAt;
    const ageMs = Math.max(0, asOfMs - Date.parse(reference));
    let status = health?.payload.status ?? source.initialStatus;
    if (!['UNAVAILABLE', 'QUARANTINED', 'COMPROMISED'].includes(status) && ageMs > source.staleAfterMs) status = 'STALE';
    return {
      ...source, status, reason: health?.payload.reason ?? 'Registered source baseline.', lastHealthEventId: health?.id ?? null,
      lastSuccessAt: health?.payload.lastSuccessAt ?? null, lastFailureAt: health?.payload.lastFailureAt ?? null,
      latencyMs: health?.payload.latencyMs ?? null, errorCode: health?.payload.errorCode ?? null, ageMs
    };
  });
  return immutable({ schemaVersion: 'vigia.source-health-projection.v1', asOf: at, sources });
}
