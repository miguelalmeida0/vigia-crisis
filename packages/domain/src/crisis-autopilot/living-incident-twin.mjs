import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { projectCanonicalValueAsOf } from './as-of-projection.mjs';

function section(value, source, freshness = 'UNKNOWN', asOf) {
  if (value === undefined || value === null) return { state: 'UNAVAILABLE', value: null, source, freshness: 'UNAVAILABLE', reason: 'NOT_PRESENT_IN_CANONICAL_INPUT' };
  const { value: projectedValue, ...temporal } = projectCanonicalValueAsOf(value, asOf);
  if (projectedValue === undefined) return { state: 'UNAVAILABLE_AT_AS_OF', value: null, source, freshness: 'UNAVAILABLE', reason: 'NO_CANONICAL_VALUE_EXISTED_AT_PROJECTION_TIME', temporal };
  if (Array.isArray(projectedValue) && projectedValue.length === 0) return { state: 'NO_RECORDS', value: [], source, freshness, reason: temporal.excludedFutureCount ? 'ONLY_FUTURE_RECORDS_WERE_EXCLUDED' : 'CANONICAL_INPUT_CONTAINS_NO_RECORDS', temporal };
  return { state: 'AVAILABLE', value: projectedValue, source, freshness, reason: null, temporal };
}

function observationsByType(incident, pattern) {
  return (incident.observations ?? incident.evidence ?? [])
    .filter((item) => pattern.test(String(item.type ?? item.kind ?? item.observationType ?? item.sourceFamily ?? '')));
}

export function projectLivingIncidentTwin({ incident, incidentTwin = {}, intelligence, decisionPacket, informationRequirements, collectionWork, assignments, resources, protection, postconditions, outcomes, nearMisses, preventionRecommendations, contexts, asOf }) {
  const canonical = { ...incident, ...incidentTwin };
  const thermal = canonical.thermal ?? observationsByType(canonical, /THERMAL|VIIRS|MODIS|FIRMS/i);
  const sourceFamilies = canonical.sourceFamilies ?? intelligence?.situation?.why?.independentPhysicalFamilies;
  const bind = (value, source, freshness = 'UNKNOWN') => section(value, source, freshness, asOf);
  const twin = {
    schemaVersion: 'vigia.living-incident-twin-projection.v1',
    incidentId: String(incident.id ?? incident.incidentId),
    asOf,
    mode: intelligence?.mode ?? canonical.mode ?? 'LIVE',
    asOfCapable: true,
    bindings: {
      canonicalIncidentId: String(incident.id ?? incident.incidentId),
      incidentRevision: canonical.revision ?? canonical.version ?? null,
      intelligenceSnapshotVersion: intelligence?.snapshotVersion ?? null,
      intelligenceProjectionHash: intelligence?.projectionHash ?? null,
      decisionPacketFingerprint: decisionPacket?.replayFingerprint ?? null,
      operationalTwinProjectionHash: canonical.operationalTwinProjectionHash ?? canonical.projectionHash ?? null,
    },
    identity: bind({ id: String(incident.id ?? incident.incidentId), label: canonical.label ?? canonical.name ?? null, aliases: canonical.aliases ?? [] }, 'CANONICAL_INCIDENT'),
    truth: bind({ classification: canonical.operationalTruth?.classification ?? canonical.truthState ?? null, situation: intelligence?.situation ?? null, verification: canonical.verification ?? null }, 'CANONICAL_INCIDENT_AND_INTELLIGENCE', intelligence?.situation?.freshness ?? canonical.freshness ?? 'UNKNOWN'),
    location: bind(canonical.location ?? canonical.coordinate ?? canonical.geometry?.centroid, 'CANONICAL_INCIDENT'),
    thermal: bind(thermal, 'CANONICAL_OBSERVATIONS', canonical.physicalState?.freshness ?? intelligence?.situation?.freshness ?? 'UNKNOWN'),
    terrain: bind(canonical.terrain ?? contexts.terrain, 'GOVERNED_CONTEXT'),
    weather: bind(canonical.weather ?? contexts.weather, 'GOVERNED_CONTEXT'),
    smoke: bind(canonical.smoke ?? contexts.smoke, 'GOVERNED_CONTEXT'),
    roads: bind(canonical.roads ?? contexts.roads, 'GOVERNED_CONTEXT'),
    communities: bind(canonical.communities ?? contexts.communities, 'GOVERNED_CONTEXT'),
    population: bind(canonical.population ?? contexts.population, 'GOVERNED_CONTEXT'),
    hospitals: bind(canonical.hospitals ?? contexts.hospitals, 'GOVERNED_RESPONSE_CONTEXT'),
    fireStations: bind(canonical.fireStations ?? contexts.fireStations, 'GOVERNED_RESPONSE_CONTEXT'),
    criticalInfrastructure: bind(canonical.criticalInfrastructure ?? contexts.criticalInfrastructure, 'GOVERNED_CONTEXT'),
    geometry: bind(canonical.observedGeometry ?? canonical.geometry, 'CANONICAL_INCIDENT_GEOMETRY', canonical.geometryFreshness ?? 'UNKNOWN'),
    sourceFamilies: bind(sourceFamilies, 'CANONICAL_EVIDENCE_LINEAGE'),
    uncertainties: bind(intelligence?.unknowns ?? [], 'CANONICAL_INTELLIGENCE'),
    collection: bind({ informationRequirements, work: collectionWork }, 'CANONICAL_REQUIREMENT_AND_COLLECTION_STORES'),
    decisions: bind(decisionPacket?.decisions?.results ?? [], 'DECISION_FOUNDRY'),
    assignments: bind(assignments, 'INCIDENT_COMMAND'),
    resources: bind(resources, 'INCIDENT_COMMAND'),
    protection: bind(protection, 'PROTECTION_WORKFLOW'),
    timeline: bind(canonical.timeline ?? canonical.history ?? [], 'CANONICAL_INCIDENT'),
    postconditions: bind(postconditions, 'OUTCOME_LEDGER'),
    outcomes: bind(outcomes, 'OUTCOME_LEDGER'),
    nearMisses: bind(nearMisses, 'CANONICAL_INCIDENT_LEARNING'),
    prevention: bind(preventionRecommendations, 'CANONICAL_PREVENTION_RECOMMENDATIONS'),
    truthBoundary: 'This is an as-of projection over canonical inputs. An unavailable section means no canonical value was supplied; it never means absence or zero. Context remains distinct from evidence, and recommendations remain distinct from authority or execution.',
  };
  const temporalSections = Object.values(twin).filter((value) => value?.temporal);
  twin.temporalIntegrity = {
    state: temporalSections.some((item) => item.temporal.excludedFutureCount) ? 'FUTURE_VALUES_EXCLUDED' : 'AS_OF_BOUNDARY_ENFORCED',
    excludedFutureCount: temporalSections.reduce((sum, item) => sum + item.temporal.excludedFutureCount, 0),
    historicalSectionsEvaluated: temporalSections.filter((item) => item.temporal.historyEvaluated).length,
    qualification: 'Section values are selected from revisions available at the projection clock; future-known and future-observed records are excluded.',
  };
  return immutable({ ...twin, projectionHash: semanticHash('living-incident-twin-projection', twin) });
}
