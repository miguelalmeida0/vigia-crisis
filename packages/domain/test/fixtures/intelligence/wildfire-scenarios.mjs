import {
  createClaim, createEvidence, createEvidenceGraph, createIncident, createObservation,
  createSource, createSourceFamily, WILDFIRE_DETECTION_CONTRACT_V1
} from '../../../src/intelligence/index.mjs';

export const WILDFIRE_EVALUATION_TIME = '2026-08-24T12:30:00.000Z';

const family = (id, familyClass, label = id) => createSourceFamily({ id, familyClass, label });
const source = (id, familyId, kind, upstreamSourceIds = [], status = 'ACTIVE') => createSource({ id, familyId, kind, upstreamSourceIds, status, label: id });
const observation = (id, sourceId, state, observedAt, options = {}) => createObservation({
  id, sourceId, state, observedAt, location: options.location ?? { coordinate: [-8, 40] },
  opportunity: options.opportunity ?? { state: 'VALID' },
  upstreamMeasurementId: options.upstreamMeasurementId,
  derivedFromObservationIds: options.derivedFromObservationIds
});
const evidence = (id, observationId, stance = 'SUPPORTING', options = {}) => createEvidence({
  id, claimId: 'claim:wildfire:1', observationId, stance,
  provenanceStrength: options.provenanceStrength ?? 'VERIFIED',
  materiality: options.materiality ?? 'MATERIAL', contradictionStatus: options.contradictionStatus
});

export function wildfireComponents() {
  const incident = createIncident({ id: 'incident:wildfire:1', incidentType: 'wildfire', openedAt: '2026-08-24T12:00:00Z', location: { coordinate: [-8, 40] }, claimIds: ['claim:wildfire:1'] });
  const claim = createClaim({
    id: 'claim:wildfire:1', incidentId: incident.id, claimType: 'wildfire.presence',
    proposition: 'A wildfire is present within the claim location and time window.',
    location: { coordinate: [-8, 40] }, validTime: { from: '2026-08-24T12:00:00Z', to: '2026-08-24T13:00:00Z' },
    contract: { id: WILDFIRE_DETECTION_CONTRACT_V1.id, version: WILDFIRE_DETECTION_CONTRACT_V1.version }
  });
  const sourceFamilies = [
    family('public-report', 'REPORT'), family('viirs', 'PHYSICAL'), family('geostationary-thermal', 'PHYSICAL'),
    family('ground-optical', 'PHYSICAL'), family('official-warning', 'OFFICIAL')
  ];
  const sources = [
    source('social-publisher', 'public-report', 'PUBLISHER'),
    source('viirs-sensor', 'viirs', 'SENSOR'),
    source('api-a', 'viirs', 'ENDPOINT', ['viirs-sensor']),
    source('api-b', 'viirs', 'ENDPOINT', ['viirs-sensor']),
    source('website-c', 'viirs', 'PUBLISHER', ['api-a']),
    source('geo-sensor', 'geostationary-thermal', 'SENSOR'),
    source('ground-camera', 'ground-optical', 'SENSOR'),
    source('official-system', 'official-warning', 'OFFICIAL_SYSTEM'),
    source('compromised-camera', 'ground-optical', 'SENSOR', [], 'COMPROMISED')
  ];
  const observations = [
    observation('obs:report', 'social-publisher', 'OBSERVED_POSITIVE', '2026-08-24T12:10:00Z', { upstreamMeasurementId: 'public-post-1' }),
    observation('obs:viirs-root', 'viirs-sensor', 'OBSERVED_POSITIVE', '2026-08-24T12:15:00Z', { upstreamMeasurementId: 'viirs-measurement-x' }),
    observation('obs:api-a', 'api-a', 'OBSERVED_POSITIVE', '2026-08-24T12:16:00Z', { derivedFromObservationIds: ['obs:viirs-root'] }),
    observation('obs:api-b', 'api-b', 'OBSERVED_POSITIVE', '2026-08-24T12:17:00Z', { derivedFromObservationIds: ['obs:viirs-root'] }),
    observation('obs:website-c', 'website-c', 'OBSERVED_POSITIVE', '2026-08-24T12:18:00Z', { derivedFromObservationIds: ['obs:api-a'] }),
    observation('obs:geo', 'geo-sensor', 'OBSERVED_POSITIVE', '2026-08-24T12:20:00Z', { upstreamMeasurementId: 'geo-measurement-1' }),
    observation('obs:official', 'official-system', 'OBSERVED_POSITIVE', '2026-08-24T12:25:00Z', { upstreamMeasurementId: 'official-warning-1' }),
    observation('obs:ground-negative', 'ground-camera', 'OBSERVED_NEGATIVE', '2026-08-24T12:22:00Z', { upstreamMeasurementId: 'ground-image-1' }),
    observation('obs:no-opportunity', 'ground-camera', 'NOT_OBSERVED', '2026-08-24T12:22:00Z', { opportunity: { state: 'INVALID', reason: 'Dense cloud obscured the location.' }, upstreamMeasurementId: 'ground-pass-2' }),
    observation('obs:compromised', 'compromised-camera', 'OBSERVED_POSITIVE', '2026-08-24T12:21:00Z', { upstreamMeasurementId: 'compromised-image-1' })
  ];
  const evidenceByKey = {
    report: evidence('ev:report', 'obs:report'), viirs: evidence('ev:viirs', 'obs:viirs-root'),
    apiA: evidence('ev:api-a', 'obs:api-a'), apiB: evidence('ev:api-b', 'obs:api-b'), websiteC: evidence('ev:website-c', 'obs:website-c'),
    geo: evidence('ev:geo', 'obs:geo'), official: evidence('ev:official', 'obs:official'),
    contradiction: evidence('ev:ground-negative', 'obs:ground-negative', 'CONTRADICTING'),
    noOpportunity: evidence('ev:no-opportunity', 'obs:no-opportunity', 'CONTRADICTING'),
    compromised: evidence('ev:compromised', 'obs:compromised')
  };
  return { incident, claim, contract: WILDFIRE_DETECTION_CONTRACT_V1, sourceFamilies, sources, observations, evidenceByKey };
}

const SCENARIOS = Object.freeze({
  weakReport: ['report'], singlePhysical: ['report', 'viirs'], duplicateTrap: ['report', 'apiA', 'apiB', 'websiteC'],
  genuineCorroboration: ['report', 'viirs', 'geo'], officialCorroboration: ['report', 'viirs', 'geo', 'official'],
  contradiction: ['report', 'viirs', 'geo', 'official', 'contradiction'], noObservationOpportunity: ['report', 'viirs', 'noOpportunity']
});

export function wildfireScenario(name) {
  const components = wildfireComponents(), keys = SCENARIOS[name];
  if (!keys) throw new Error(`unknown_wildfire_scenario:${name}`);
  const evidenceRows = keys.map((key) => components.evidenceByKey[key]);
  return { ...components, evidenceGraph: createEvidenceGraph({ sourceFamilies: components.sourceFamilies, sources: components.sources, observations: components.observations, evidence: evidenceRows }), evaluationTime: WILDFIRE_EVALUATION_TIME };
}
