// CONTROLLED_TEST scenarios for VIGIA XI — causal resilience and decision
// intelligence. Builds on the VIGIA X fixture rather than restating it.
import {AT, OBSERVED_AT, RECEIVED_AT, REPORT_POINT, catalogFor, em527Routes, evaluatedMissions} from './consequence-fixture.mjs';

const line = (...parts) => ({type: 'LineString', coordinates: parts.flat()});
const future = (ms = 6 * 3600000) => new Date(Date.parse(AT) + ms).toISOString();
const route = ({id, facilityId, name, minutes, roads, geometry, qualified = true}) => ({
  id, facilityId, name, minutes, distanceKm: minutes, roads, geometry, qualified,
  source: 'CONTROLLED_TEST', calculatedAt: AT, validUntil: future(), direction: 'FACILITY_TO_INCIDENT', openingConfirmed: true
});

export {AT, OBSERVED_AT, RECEIVED_AT};

export const EARLIER_AT = '2026-09-14T18:10:00.000Z';

/**
 * Two healthcare routes with NO road in common, so no single road removes both.
 * Only the pair {N114, M507} is a cut. Used to prove the engine does not claim
 * either dependency alone destroys all support.
 */
export function disjointRoutes() {
  const north = [[-7.9300, 38.5900], [-7.9100, 38.5900]];
  const south = [[-7.9300, 38.5500], [-7.9100, 38.5500]];
  return {
    emergency_hospital: [
      route({id: 'route-da', facilityId: 'facility-hospital-central', name: 'Hospital Central north', minutes: 14, roads: ['N114'], geometry: line(north)}),
      route({id: 'route-db', facilityId: 'facility-hospital-norte', name: 'Hospital Norte south', minutes: 18, roads: ['M507'], geometry: line(south)})
    ],
    fire_response: []
  };
}

/** A second responder independently confirming Ana's report. */
export function confirmation(overrides = {}) {
  return {
    id: 'confirmation-1', groupId: 'group-1', incidentId: 'controlled-incident', lane: 'OPERATIONAL',
    senderId: 'responder-bruno', senderName: 'Bruno', reportId: 'report-em527-blocked',
    answer: 'CONFIRM', observedAt: '2026-09-14T18:24:00.000Z', receivedAt: '2026-09-14T18:24:30.000Z',
    ...overrides
  };
}

/** An admitted official restriction closing EM527. */
export function officialRestriction(overrides = {}) {
  return {
    id: 'ip-road:em527', roadRef: 'EM527', state: 'CLOSED', admitted: true,
    admissionRule: 'OFFICIAL_IP_PUBLISHED_OCCURRENCE',
    geometry: {type: 'Point', coordinates: REPORT_POINT}, direction: 'ambos',
    observedAt: OBSERVED_AT, ingestedAt: RECEIVED_AT, knownAt: RECEIVED_AT,
    validUntil: '2026-09-15T00:00:00.000Z', ...overrides
  };
}

/**
 * The EM527 scenario with road information that has already expired, and no
 * field report. Nothing says the road is blocked; the information supporting
 * the only fire-response route has simply aged out.
 */
export function staleRoadScenario({at = AT} = {}) {
  const catalog = catalogFor(em527Routes());
  // Last checked 2h 18m before AT, and already past its validity window.
  const sourceLastCheckedAt = new Date(Date.parse(at) - (138 * 60000)).toISOString();
  const sourceValidUntil = new Date(Date.parse(at) - (18 * 60000)).toISOString();
  return {
    catalog, reports: [], confirmations: [], restrictions: [],
    sourceValidUntil, sourceLastCheckedAt, at,
    incidentId: 'controlled-incident', snapshotId: 'snapshot-stale',
    missions: evaluatedMissions({catalog, sourceValidUntil, at})
  };
}

/** A weather record nothing operational depends on. */
export function unusedWeatherFact(at = AT) {
  return {
    factId: 'weather:evora-station', kind: 'WEATHER', subjectId: 'evora-station', roadRef: null,
    lastCheckedAt: new Date(Date.parse(at) - (200 * 60000)).toISOString(),
    validUntil: new Date(Date.parse(at) - (80 * 60000)).toISOString()
  };
}
