import {buildSituation} from '../../../packages/domain/src/intelligence/situation-model.mjs';

// Controlled fixture for VIGIA Intelligence VIII. Every value here is invented
// for testing and is explicitly CONTROLLED_TEST; none of it is presented as, or
// derived from, an observed operational fact.
//
// Shape of the world it describes:
//   Hospital A   verified emergency department, 14 min, retained route
//   Hospital X   capability UNRESOLVED, closer (9 min), retained route  <- the candidate
//   Hospital Z   capability UNRESOLVED, closest (6 min), NO retained route
//   Fire A       verified fire response, 11 min, retained route
//   Reception R  officially designated, activation UNCONFIRMED
//   4 settlements, each routed to every facility

export const AT = '2026-09-13T10:00:00.000Z';
const VALID_UNTIL = '2026-09-13T10:30:00.000Z';
const CAPABILITY_UNTIL = '2026-09-14T10:00:00.000Z';

const resolved = (field, at = AT) => ({[field]: {state: 'RESOLVED'}});
const provenanceFor = (field, at = AT) => ({[field]: [{factId: `fact:${field}`, provider: 'CONTROLLED_TEST', authority: 'GOVERNMENT', url: 'https://www.sns.gov.pt/controlled-test', retrievedAt: at, validUntil: CAPABILITY_UNTIL}]});

export function facilities({confirmHospitalX = false, activateReception = false, staleHospitalA = false} = {}) {
  return [
    {
      id: 'h-a', canonicalName: 'Hospital A', canonicalType: 'hospital', coordinate: [-7.880, 38.700],
      fields: resolved('capabilities.emergencyDepartment'), capabilities: {emergencyDepartment: true},
      contact: {phone: '+351 200 000 001'}, resolutionState: 'RESOLVED',
      provenance: staleHospitalA
        ? {'capabilities.emergencyDepartment': [{factId: 'fact:stale', provider: 'CONTROLLED_TEST', authority: 'GOVERNMENT', url: 'https://www.sns.gov.pt/controlled-test', retrievedAt: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-02T00:00:00.000Z'}]}
        : provenanceFor('capabilities.emergencyDepartment')
    },
    {
      id: 'h-x', canonicalName: 'Hospital X', canonicalType: 'hospital', coordinate: [-7.855, 38.700],
      fields: confirmHospitalX ? resolved('capabilities.emergencyDepartment') : {}, capabilities: confirmHospitalX ? {emergencyDepartment: true} : {},
      contact: {phone: '+351 200 000 002'}, resolutionState: 'RESOLVED',
      provenance: confirmHospitalX ? provenanceFor('capabilities.emergencyDepartment') : {}
    },
    {
      id: 'h-z', canonicalName: 'Hospital Z', canonicalType: 'hospital', coordinate: [-7.845, 38.700],
      fields: {}, capabilities: {}, contact: {phone: '+351 200 000 003'}, resolutionState: 'RESOLVED', provenance: {}
    },
    {
      id: 'f-a', canonicalName: 'Fire A', canonicalType: 'fire_station', coordinate: [-7.870, 38.700],
      fields: resolved('capabilities.fireResponse'), capabilities: {fireResponse: true},
      contact: {phone: '+351 200 000 004'}, resolutionState: 'RESOLVED', provenance: provenanceFor('capabilities.fireResponse')
    },
    {
      id: 'r-1', canonicalName: 'Reception R', canonicalType: 'temporary_reception_center', coordinate: [-7.865, 38.702],
      fields: {'designation.kind': {state: 'RESOLVED'}, ...(activateReception ? resolved('activation.state') : {})},
      designation: {kind: 'ZCAP', authority: 'MUNICIPAL'},
      activation: activateReception ? {state: 'ACTIVATED'} : null,
      contact: {phone: '+351 200 000 005'}, resolutionState: 'RESOLVED',
      provenance: {
        'designation.kind': [{factId: 'fact:designation', provider: 'CONTROLLED_TEST', authority: 'MUNICIPAL', url: 'https://www.cm-evora.pt/controlled-test', retrievedAt: AT, validUntil: CAPABILITY_UNTIL}],
        ...(activateReception ? {'activation.state': [{factId: 'fact:activation', provider: 'CONTROLLED_TEST', authority: 'MUNICIPAL', url: 'https://www.cm-evora.pt/controlled-test', retrievedAt: AT, validFrom: AT, validUntil: VALID_UNTIL}]} : {})
      }
    }
  ];
}

// Hospital Z deliberately has no route: confirming its capability must NOT
// invent one, and the preview has to say so.
const ROUTE_SPECS = [
  {facilityId: 'h-a', minutes: 22, km: 12.4, road: 'N114'},
  {facilityId: 'h-x', minutes: 9, km: 5.1, road: 'EM527'},
  {facilityId: 'f-a', minutes: 11, km: 6.2, road: 'N114'},
  {facilityId: 'r-1', minutes: 7, km: 3.8, road: 'EM527'}
];

export function settlements(count = 4) {
  return Array.from({length: count}, (_, index) => ({
    id: `c-${index + 1}`, name: `Community ${index + 1}`, kind: 'settlement',
    coordinate: [-7.820 - index * 0.004, 38.700], municipality: 'Évora', source: 'CONTROLLED_TEST',
    population: {value: 40 + index * 10, authority: 'INE', referenceYear: 2021, sourceUrl: 'https://mapas.ine.pt/controlled-test', retrievedAt: AT, geographicUnit: 'SETTLEMENT'}
  }));
}

export function controlledSituation(options = {}) {
  const rows = facilities(options);
  const places = settlements(options.communityCount ?? 4);
  const routes = ROUTE_SPECS.map((spec) => ({
    id: `route-${spec.facilityId}`, facilityId: spec.facilityId, direction: 'FACILITY_TO_INCIDENT',
    calculatedAt: AT, validUntil: VALID_UNTIL, travelTimeMinutes: spec.minutes, distanceKm: spec.km,
    geometry: {type: 'LineString', coordinates: [rows.find((row) => row.id === spec.facilityId).coordinate, [-7.800, 38.700]]},
    roads: [{ref: spec.road}], source: 'CONTROLLED_TEST_ROUTER'
  }));
  const communityRoutes = places.flatMap((place) => routes.map((route) => ({
    ...route, id: `community-${place.id}-${route.facilityId}`, settlementId: place.id, direction: 'FACILITY_TO_SETTLEMENT'
  })));
  return buildSituation({
    incident: {id: 'controlled-incident', name: 'Controlled incident', coordinate: [-7.800, 38.700], district: 'Évora'},
    facilities: rows, routes, places, communityRoutes,
    roadCoverage: {connected: true, state: 'PARTIAL', checkedAt: AT, validUntil: VALID_UNTIL, coveredRoads: ['N114'], source: 'CONTROLLED_TEST'},
    sources: options.sources ?? []
  }, {at: options.at ?? AT, universe: 'CONTROLLED_TEST'});
}

export function approvedSourceRecords() {
  return [
    {id: 'src-sns', url: 'https://www.sns.gov.pt/controlled-test', provider: 'SNS', authority: 'GOVERNMENT', adapter: 'ULS_CONTACT_TABLE', format: 'HTML', entityIds: ['h-x', 'h-a'], predicates: ['capabilities.emergencyDepartment', 'contact.phone'], lastSuccessfulFetch: AT, pollIntervalMs: 86_400_000, operationalAdmission: true, status: 'OK'},
    {id: 'src-municipal', url: 'https://www.cm-evora.pt/controlled-test', provider: 'Câmara Municipal de Évora', authority: 'MUNICIPAL', adapter: 'EVORA_EMERGENCY_PLAN', format: 'PDF', entityIds: ['r-1'], predicates: ['activation.state', 'designation.kind'], lastSuccessfulFetch: '2026-09-10T00:00:00.000Z', pollIntervalMs: 86_400_000, status: 'OK'},
    {id: 'src-unwatched', url: 'https://www.psp.pt/controlled-test', provider: 'PSP', authority: 'GOVERNMENT', adapter: 'MP_CONTACT_DIRECTORY', format: 'HTML', entityIds: ['h-x'], predicates: ['contact.phone'], watch: false, status: 'OK'}
  ];
}
