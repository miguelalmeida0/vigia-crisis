import {evaluateMission} from '../../src/fieldnet/mission-command.mjs';

// CONTROLLED_TEST fixture for the consequence engine.
//
// These are synthetic coordinates near Évora chosen so that route geometry,
// report proximity and road naming are all checkable by hand. They are not real
// retained operational data and must never be read as such.
//
// The shapes produced here are exactly the shapes the product already passes
// around: `catalog` is missionCatalog() output, and missions are run through the
// real evaluateMission() rather than hand-stated, so the tests exercise the
// product's own mission semantics.

export const AT = '2026-09-14T18:25:00.000Z';
export const OBSERVED_AT = '2026-09-14T18:21:00.000Z';
export const RECEIVED_AT = '2026-09-14T18:23:00.000Z';
const HOUR = 3600000;
const future = (ms = 6 * HOUR) => new Date(Date.parse(AT) + ms).toISOString();

// EM527 runs west to east at latitude 38.5700. Both the hospital and the fire
// route use this stretch, which is the whole point of the scenario.
const EM527 = [[-7.9100, 38.5700], [-7.9000, 38.5700], [-7.8900, 38.5700], [-7.8800, 38.5700]];
// N114 runs at latitude 38.5900, well clear of EM527.
const N114 = [[-7.9300, 38.5900], [-7.9200, 38.5900], [-7.9100, 38.5900]];
const M507 = [[-7.9100, 38.5800], [-7.9000, 38.5800]];
export const REPORT_POINT = [-7.8950, 38.5700];

const line = (...parts) => ({type: 'LineString', coordinates: parts.flat()});

function route({id, facilityId, name, minutes, roads, geometry, qualified = true}) {
  return {id, facilityId, name, minutes, distanceKm: minutes, roads, geometry, qualified,
    source: 'CONTROLLED_TEST', calculatedAt: AT, validUntil: future(), direction: 'FACILITY_TO_INCIDENT', openingConfirmed: true};
}

/** H1 hospital via EM527, H2 hospital alternative clear of EM527, F1 fire via EM527. */
export function em527Routes() {
  return {
    emergency_hospital: [
      route({id: 'route-h1', facilityId: 'facility-hospital-central', name: 'Hospital Central', minutes: 12, roads: ['EM527'], geometry: line(EM527)}),
      route({id: 'route-h2', facilityId: 'facility-hospital-norte', name: 'Hospital Norte', minutes: 24, roads: ['N114'], geometry: line(N114)})
    ],
    fire_response: [
      route({id: 'route-f1', facilityId: 'facility-fire-south', name: 'Fire Station South', minutes: 9, roads: ['EM527'], geometry: line(EM527)})
    ]
  };
}

/** Two hospital routes that both end up on EM527 — stored redundancy that is not redundancy. */
export function falseRedundancyRoutes() {
  return {
    emergency_hospital: [
      route({id: 'route-ha', facilityId: 'facility-hospital-central', name: 'Hospital Central via N114', minutes: 12, roads: ['N114', 'EM527'], geometry: line(N114, EM527)}),
      route({id: 'route-hb', facilityId: 'facility-hospital-central', name: 'Hospital Central via M507', minutes: 19, roads: ['N114', 'M507', 'EM527'], geometry: line(N114, M507, EM527)})
    ],
    fire_response: []
  };
}

/**
 * Two hospital routes that both LIST EM527 but whose retained geometries never
 * come near each other. Proves the engine reports a named-road dependency
 * without claiming the geometry overlaps.
 */
export function namedRoadOnlyRoutes() {
  const northern = [[-7.9100, 38.6400], [-7.9000, 38.6400], [-7.8900, 38.6400]];
  return {
    emergency_hospital: [
      route({id: 'route-na', facilityId: 'facility-hospital-central', name: 'Hospital Central south leg', minutes: 12, roads: ['EM527'], geometry: line(EM527)}),
      route({id: 'route-nb', facilityId: 'facility-hospital-norte', name: 'Hospital Norte north leg', minutes: 21, roads: ['EM527'], geometry: line(northern)})
    ],
    fire_response: []
  };
}

export function catalogFor(routesByService, {subjectId = 'evora-centro', subjectName = 'Évora Centro'} = {}) {
  return [{
    id: subjectId,
    name: subjectName,
    coordinate: [-7.9090, 38.5710],
    services: [
      {id: 'emergency_hospital', label: 'emergency healthcare', routes: routesByService.emergency_hospital ?? []},
      {id: 'fire_response', label: 'fire response', routes: routesByService.fire_response ?? []},
      {id: 'designated_reception', label: 'reception', routes: routesByService.designated_reception ?? []}
    ]
  }];
}

/** A governed field report placing EM527 blocked, observed before it was received. */
export function em527BlockedReport(overrides = {}) {
  return {
    id: 'report-em527-blocked',
    groupId: 'group-1',
    incidentId: 'controlled-incident',
    lane: 'OPERATIONAL',
    senderId: 'responder-ana',
    senderName: 'Ana',
    type: 'ROAD_BLOCKED',
    coordinate: REPORT_POINT,
    accuracyM: 10,
    locationName: 'EM527',
    note: 'Road blocked by fallen trees.',
    facilityId: null,
    observedAt: OBSERVED_AT,
    receivedAt: RECEIVED_AT,
    validUntil: new Date(Date.parse(OBSERVED_AT) + HOUR).toISOString(),
    media: [],
    ...overrides
  };
}

export function missionRecord({id, service, currentRouteId, routes, objective, subjectId = 'evora-centro', subjectName = 'Évora Centro'}) {
  return {
    id, groupId: 'group-1', incidentId: 'controlled-incident', lane: 'OPERATIONAL',
    objective, subjectId, subjectName, service,
    startAt: '2026-09-14T17:00:00.000Z', endAt: future(12 * HOUR),
    currentRouteId, facilityIds: routes.map((row) => row.facilityId),
    importantRoads: [...new Set(routes.flatMap((row) => row.roads))],
    savedRoutes: routes, watchers: ['responder-ana']
  };
}

/**
 * Runs the product's real mission evaluator over the fixture, returning exactly
 * what the team service would hold.
 */
export function evaluatedMissions({catalog, reports = [], confirmations = [], restrictions = [], sourceValidUntil = future(), at = AT}) {
  const subject = catalog[0];
  const missions = [];
  for (const service of subject.services) {
    if (!service.routes.length) continue;
    const mission = missionRecord({
      id: `mission-${service.id}`,
      service: service.id,
      currentRouteId: service.routes[0].id,
      routes: service.routes,
      objective: `Keep ${subject.name} connected to ${service.label}`,
      subjectId: subject.id,
      subjectName: subject.name
    });
    missions.push(evaluateMission(mission, {routes: service.routes, reports, confirmations, restrictions, sourceValidUntil, notices: [], at}));
  }
  return missions;
}

/** The complete EM527 controlled scenario, ready to hand to the engine. */
export function em527Scenario({at = AT, reports = [em527BlockedReport()], confirmations = [], restrictions = []} = {}) {
  const catalog = catalogFor(em527Routes());
  return {catalog, reports, confirmations, restrictions, sourceValidUntil: future(), at,
    incidentId: 'controlled-incident', snapshotId: 'snapshot-controlled-1',
    missions: evaluatedMissions({catalog, reports, confirmations, restrictions, at})};
}

export function falseRedundancyScenario({at = AT, reports = [], confirmations = [], restrictions = []} = {}) {
  const catalog = catalogFor(falseRedundancyRoutes());
  return {catalog, reports, confirmations, restrictions, sourceValidUntil: future(), at,
    incidentId: 'controlled-incident', snapshotId: 'snapshot-controlled-2',
    missions: evaluatedMissions({catalog, reports, confirmations, restrictions, at})};
}
