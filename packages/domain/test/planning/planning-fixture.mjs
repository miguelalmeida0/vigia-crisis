// CONTROLLED_TEST fixture for VIGIA XII planning.
//
// Synthetic resources and requirements near Évora, chosen so every constraint
// outcome is checkable by hand. Not real operational data.

export const AT = '2026-09-15T18:20:00.000Z';
const iso = (offsetMinutes) => new Date(Date.parse(AT) + offsetMinutes * 60000).toISOString();

export const FUTURE = iso(6 * 60);
export const DEADLINE_1840 = iso(20);   // 18:40
export const DEADLINE_1830 = iso(10);   // 18:30

const EM527 = {type: 'LineString', coordinates: [[-7.9100, 38.5700], [-7.8800, 38.5700]]};
const N114 = {type: 'LineString', coordinates: [[-7.9300, 38.5900], [-7.9100, 38.5900]]};

/** Retained routes, in the shape the catalog already produces. */
export const ROUTES = Object.freeze([
  {id: 'route-louredo-n114', facilityId: 'fac-louredo', name: 'Louredo via N114', minutes: 14, roads: ['N114'], geometry: N114, calculatedAt: AT, validUntil: FUTURE, qualified: true},
  {id: 'route-louredo-em527', facilityId: 'fac-louredo', name: 'Louredo via EM527', minutes: 11, roads: ['EM527'], geometry: EM527, calculatedAt: AT, validUntil: FUTURE, qualified: true},
  {id: 'route-canaviais-em527', facilityId: 'fac-canaviais', name: 'Canaviais via EM527', minutes: 9, roads: ['EM527'], geometry: EM527, calculatedAt: AT, validUntil: FUTURE, qualified: true},
  {id: 'route-slow', facilityId: 'fac-louredo', name: 'Louredo long way', minutes: 45, roads: ['N114'], geometry: N114, calculatedAt: AT, validUntil: FUTURE, qualified: true}
]);

const capability = (value, {validUntil = FUTURE, factId = null} = {}) => ({value, validUntil, factId});

/** Engine 8: structural fire capable, free, close. The straightforward option. */
export const engine8 = (overrides = {}) => ({
  id: 'engine-8', name: 'Engine 8', resourceType: 'FIRE_APPLIANCE',
  capabilities: {structural_fire: capability(true, {factId: 'cap:engine-8:structural'})},
  status: 'IN_SERVICE', location: [-7.9200, 38.5900], locationObservedAt: iso(-5),
  availability: {from: iso(-120), until: iso(240)}, existingAssignments: [], capacity: 4,
  originFacilityId: 'station-north', ...overrides
});

/** Engine 12: also capable, but protected-committed to Louredo. */
export const engine12 = (overrides = {}) => ({
  id: 'engine-12', name: 'Engine 12', resourceType: 'FIRE_APPLIANCE',
  capabilities: {structural_fire: capability(true, {factId: 'cap:engine-12:structural'})},
  status: 'IN_SERVICE', location: [-7.9000, 38.5700], locationObservedAt: iso(-3),
  availability: {from: iso(-120), until: iso(240)},
  existingAssignments: [{requirementId: 'req-louredo', subjectName: 'Louredo', from: iso(-30), until: iso(120), protected: true}],
  capacity: 4, originFacilityId: 'station-south', ...overrides
});

/** Ambulance 4: nearest to everything, but NOT a fire appliance. */
export const ambulance4 = (overrides = {}) => ({
  id: 'ambulance-4', name: 'Ambulance 4', resourceType: 'AMBULANCE',
  capabilities: {structural_fire: capability(false, {factId: 'cap:amb-4:structural'}), patient_transport: capability(true)},
  status: 'IN_SERVICE', location: [-7.8950, 38.5700], locationObservedAt: iso(-2),
  availability: {from: iso(-120), until: iso(240)}, existingAssignments: [], capacity: 2,
  originFacilityId: 'station-south', ...overrides
});

/** Engine 20: no capability record at all. Must never be treated as capable. */
export const engine20 = (overrides = {}) => ({
  id: 'engine-20', name: 'Engine 20', resourceType: 'FIRE_APPLIANCE',
  capabilities: {}, status: 'IN_SERVICE', location: [-7.9100, 38.5800], locationObservedAt: iso(-4),
  availability: {from: iso(-120), until: iso(240)}, existingAssignments: [], capacity: 4, ...overrides
});

/** Engine 33: capable, but its location has not been checked in hours. */
export const engine33 = (overrides = {}) => ({
  id: 'engine-33', name: 'Engine 33', resourceType: 'FIRE_APPLIANCE',
  capabilities: {structural_fire: capability(true)}, status: 'IN_SERVICE',
  location: [-7.9400, 38.6000], locationObservedAt: iso(-200), locationValidUntil: iso(-80),
  availability: {from: iso(-300), until: iso(240)}, existingAssignments: [], capacity: 4, ...overrides
});

export const louredoRequirement = (overrides = {}) => ({
  id: 'req-louredo', missionId: 'mission-louredo-fire', subjectId: 'louredo', subjectName: 'Louredo',
  serviceId: 'fire_response', capabilityNeeded: 'structural_fire',
  destinationFacilityId: 'fac-louredo', destinationName: 'Louredo',
  earliestStart: AT, requiredBy: DEADLINE_1840, durationMinutes: 60,
  // EM527 first: it is the faster retained route, so it is the primary and
  // N114 is the alternative fallen back to when EM527 is unavailable.
  routeIds: ['route-louredo-em527', 'route-louredo-n114'], ...overrides
});

export const canaviaisRequirement = (overrides = {}) => ({
  id: 'req-canaviais', missionId: 'mission-canaviais-fire', subjectId: 'canaviais', subjectName: 'Canaviais',
  serviceId: 'fire_response', capabilityNeeded: 'structural_fire',
  destinationFacilityId: 'fac-canaviais', destinationName: 'Canaviais',
  earliestStart: AT, requiredBy: DEADLINE_1840, durationMinutes: 60,
  routeIds: ['route-canaviais-em527'], ...overrides
});

/** The standard scenario: two communities, four resources, one real conflict. */
export function planningScenario(overrides = {}) {
  return {
    resources: [engine8(), engine12(), ambulance4(), engine20()],
    requirements: [louredoRequirement(), canaviaisRequirement()],
    routes: [...ROUTES],
    // Destination facility status is retained for both communities, so
    // FACILITY_STATUS is settled rather than swamping every candidate.
    facilityStatus: new Map([['fac-louredo', 'AVAILABLE'], ['fac-canaviais', 'AVAILABLE']]),
    sourceValidUntil: FUTURE,
    sourceLastCheckedAt: iso(-20),
    at: AT,
    incidentId: 'controlled-incident',
    ...overrides
  };
}

/** Road information already expired — only route access becomes UNKNOWN. */
export function staleAccessScenario(overrides = {}) {
  return planningScenario({sourceValidUntil: iso(-18), sourceLastCheckedAt: iso(-138), ...overrides});
}
