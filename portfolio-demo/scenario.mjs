import {evaluateMission} from '../packages/domain/src/fieldnet/mission-command.mjs';
import {operationalProjection, causalTransition} from '../packages/domain/src/consequences/operational-consequences.mjs';
import {missionPlan} from '../packages/domain/src/planning/mission-planning.mjs';
import {planOperationalPeriod} from '../packages/domain/src/period/period-planning.mjs';

export const DEMO_LABEL = 'PORTFOLIO DEMO · SYNTHETIC OPERATIONAL SCENARIO';
export const SOURCE_REVISION = 'bc62f62662c8a62affa4e054d1d122d1e1f7f084';
export const DEMO_ACTIONS = Object.freeze(['block-road', 'age-road-information', 'delay-resource', 'reset']);
const START = '2026-09-15T18:20:00.000Z';
const time = minutes => new Date(Date.parse(START) + minutes * 60000).toISOString();
const INCIDENT = 'portfolio-evora';
const FUTURE = time(240);

// Deliberately synthetic scenario geometry, not a road map or safe passage.
const roads = {
  EM527: {type: 'LineString', coordinates: [[-7.91, 38.57], [-7.9, 38.57], [-7.89, 38.57], [-7.88, 38.57]]},
  N114: {type: 'LineString', coordinates: [[-7.93, 38.59], [-7.92, 38.59], [-7.91, 38.59]]}
};
const route = (id, facilityId, name, minutes, road) => ({
  id, facilityId, name, minutes, roads: [road], geometry: structuredClone(roads[road]),
  qualified: true, source: 'PORTFOLIO_SYNTHETIC', calculatedAt: START,
  validUntil: FUTURE, direction: 'FACILITY_TO_INCIDENT', openingConfirmed: false
});

function inputs(state) {
  const at = state.aged ? time(100) : state.blocked ? time(5) : START;
  const sourceValidUntil = state.aged ? time(60) : FUTURE;
  const services = [
    {id: 'emergency_hospital', label: 'healthcare', routes: [
      route('route-health-em527', 'demo-hospital-a', 'Demo hospital A', 12, 'EM527'),
      route('route-health-n114', 'demo-hospital-b', 'Demo hospital B', 24, 'N114')
    ]},
    {id: 'fire_response', label: 'fire response', routes: [
      route('route-fire-em527', 'demo-fire-station', 'Demo fire station', 9, 'EM527')
    ]}
  ];
  const catalog = [{id: 'demo-community', name: 'Évora scenario area', coordinate: [-7.909, 38.571], services}];
  const reports = state.blocked ? [{
    id: 'demo-report-em527', groupId: 'demo-team', incidentId: INCIDENT, lane: 'OPERATIONAL',
    senderId: 'demo-observer', senderName: 'Demo team', type: 'ROAD_BLOCKED',
    coordinate: [-7.895, 38.57], accuracyM: 10, locationName: 'EM527',
    note: 'Synthetic scenario: fallen trees block the road.', facilityId: null,
    observedAt: time(1), receivedAt: time(3), validUntil: time(61), media: []
  }] : [];
  const missions = services.map(service => evaluateMission({
    id: `demo-mission-${service.id}`, groupId: 'demo-team', incidentId: INCIDENT,
    lane: 'OPERATIONAL', objective: `Retain ${service.label} access for the demo community`,
    subjectId: catalog[0].id, subjectName: catalog[0].name, service: service.id,
    startAt: time(-60), endAt: FUTURE, currentRouteId: service.routes[0].id,
    facilityIds: service.routes.map(row => row.facilityId), importantRoads: ['EM527'],
    savedRoutes: service.routes, watchers: []
  }, {routes: service.routes, reports, confirmations: [], restrictions: [],
    sourceValidUntil, notices: [], at}));
  return {at, catalog, missions, reports, confirmations: [], restrictions: [],
    sourceValidUntil, sourceLastCheckedAt: START, incidentId: INCIDENT,
    snapshotId: `demo-${state.blocked ? 'blocked' : 'initial'}-${state.aged ? 'aged' : 'fresh'}`};
}

function resources() {
  return [
    {id: 'demo-engine-8', name: 'Demo Engine 8', resourceType: 'FIRE_APPLIANCE', originFacilityId: 'demo-station-north', structural: true},
    {id: 'demo-engine-12', name: 'Demo Engine 12', resourceType: 'FIRE_APPLIANCE', originFacilityId: 'demo-station-south', structural: true},
    {id: 'demo-ambulance', name: 'Demo Ambulance', resourceType: 'AMBULANCE', originFacilityId: 'demo-station-south', structural: false}
  ].map(({structural, ...row}) => ({...row, zoneId: 'demo-zone',
    capabilities: {structural_fire: {value: structural, validUntil: FUTURE}},
    status: 'IN_SERVICE', location: [-7.92, 38.59], locationObservedAt: START,
    availability: {from: START, until: FUTURE}, existingAssignments: [], capacity: 4
  }));
}

function plans(state, facts) {
  const requirements = [{id: 'demo-fire-requirement', missionId: 'demo-mission-fire_response',
    subjectId: 'demo-community', subjectName: 'Évora scenario area', serviceId: 'fire_response',
    capabilityNeeded: 'structural_fire', destinationFacilityId: 'demo-community',
    destinationName: 'Demo community', earliestStart: START, requiredBy: time(20),
    durationMinutes: 25, routeIds: ['route-fire-em527']}];
  const assumptions = state.aged ? [{kind: 'SOURCE_STALE', subjectId: 'EM527'}]
    : state.blocked ? [{kind: 'ROAD_UNAVAILABLE', subjectId: 'EM527'}] : [];
  const planning = missionPlan({resources: resources(), requirements,
    routes: facts.catalog[0].services.flatMap(service => service.routes),
    facilityStatus: new Map([['demo-community', 'AVAILABLE']]),
    sourceValidUntil: facts.sourceValidUntil, sourceLastCheckedAt: START,
    at: facts.at, incidentId: INCIDENT, assumptions});
  const groups = [
    {id: 'demo-group-a', incidentId: INCIDENT, subjectId: 'demo-community', subjectName: 'Évora scenario area', destinationFacilityId: 'demo-community', requiredBy: time(20)},
    {id: 'demo-group-b', incidentId: 'portfolio-canaviais', subjectId: 'demo-canaviais', subjectName: 'Canaviais scenario area', destinationFacilityId: 'demo-canaviais', requiredBy: time(50)}
  ].map(row => ({...row, destinationName: row.subjectName, earliestStart: START,
    durationMinutes: 25, slots: [{capability: 'structural_fire', quantity: 1}]}));
  const period = planOperationalPeriod({period: {
    id: 'demo-evening-period', startsAt: START, endsAt: FUTURE,
    incidents: [INCIDENT, 'portfolio-canaviais'], requirementGroups: groups, reservePolicies: [],
    transitMinutes: new Map([
      ['demo-station-north->demo-community', 10], ['demo-station-south->demo-community', 12],
      ['demo-station-north->demo-canaviais', 14], ['demo-station-south->demo-canaviais', 8],
      ['demo-community->demo-canaviais', 12], ['demo-canaviais->demo-community', 12]
    ])
  }, resources: resources(), perturbations: state.delayed
    ? [{kind: 'RESOURCE_DELAYED', subjectId: 'demo-engine-8', delayMinutes: 60}] : []});
  return {planning, period};
}

/** No shared state, browser persistence, network calls or operational mutations. */
export function createDemoSession() {
  let state = {blocked: false, aged: false, delayed: false};
  let previous = null;
  const calculate = () => {
    const facts = inputs(state);
    const current = operationalProjection(facts);
    return {label: DEMO_LABEL, sourceRevision: SOURCE_REVISION, synthetic: true,
      state: {...state}, facts, current, ...plans(state, facts),
      transition: previous ? causalTransition({previous, current}) : null};
  };
  return Object.freeze({
    snapshot: () => structuredClone(calculate()),
    apply(action) {
      if (!DEMO_ACTIONS.includes(action)) throw new TypeError('Unknown demo action');
      if (action === 'reset') {
        state = {blocked: false, aged: false, delayed: false};
        previous = null;
      } else {
        previous = calculate().current;
        if (action === 'block-road') state.blocked = true;
        if (action === 'age-road-information') state.aged = true;
        if (action === 'delay-resource') state.delayed = true;
      }
      return structuredClone(calculate());
    }
  });
}
