// CONTROLLED_TEST fixture for VIGIA XIII operational-period planning.
//
// Times are chosen so every sequence is checkable by hand. Not real data.

export const PERIOD_START = '2026-09-15T18:00:00.000Z';
export const PERIOD_END = '2026-09-15T22:00:00.000Z';
const at = (minutes) => new Date(Date.parse(PERIOD_START) + minutes * 60000).toISOString();

export const T = {t1800: at(0), t1810: at(10), t1820: at(20), t1830: at(30), t1835: at(35),
  t1840: at(40), t1845: at(45), t1850: at(50), t1900: at(60), t1920: at(80), t1950: at(110), t2000: at(120)};

const cap = (value, validUntil = PERIOD_END) => ({value, validUntil});

/** Retained point-to-point transit times. Absent pairs stay absent. */
export const TRANSIT = () => new Map([
  ['station-north->fac-louredo', 10], ['station-north->fac-canaviais', 14],
  ['station-south->fac-louredo', 12], ['station-south->fac-canaviais', 8],
  ['fac-louredo->fac-canaviais', 12], ['fac-canaviais->fac-louredo', 12],
  ['station-north->fac-zona-a', 9], ['station-south->fac-zona-a', 11]
]);

export const engine8 = (overrides = {}) => ({
  id: 'engine-8', name: 'Engine 8', resourceType: 'FIRE_APPLIANCE', zoneId: 'zone-a',
  capabilities: {structural_fire: cap(true)}, status: 'IN_SERVICE',
  location: [-7.92, 38.59], locationObservedAt: PERIOD_START,
  availability: {from: PERIOD_START, until: PERIOD_END}, existingAssignments: [],
  capacity: 4, capacityByDimension: {water_litres: 2000, crew: 4}, originFacilityId: 'station-north', ...overrides
});

export const engine12 = (overrides = {}) => ({
  id: 'engine-12', name: 'Engine 12', resourceType: 'FIRE_APPLIANCE', zoneId: 'zone-a',
  capabilities: {structural_fire: cap(true)}, status: 'IN_SERVICE',
  location: [-7.90, 38.57], locationObservedAt: PERIOD_START,
  availability: {from: PERIOD_START, until: PERIOD_END}, existingAssignments: [],
  capacity: 4, capacityByDimension: {water_litres: 1500, crew: 4}, originFacilityId: 'station-south', ...overrides
});

/** Mutual aid: requested from a neighbouring district, not confirmed. */
export const aidUnit4 = (overrides = {}) => ({
  id: 'aid-4', name: 'Mutual Aid Unit 4', resourceType: 'FIRE_APPLIANCE', zoneId: 'zone-a',
  capabilities: {structural_fire: cap(true)}, status: 'IN_SERVICE',
  location: [-7.95, 38.60], locationObservedAt: PERIOD_START,
  availability: {from: PERIOD_START, until: PERIOD_END}, existingAssignments: [],
  capacity: 4, originFacilityId: 'station-north',
  mutualAid: {state: 'REQUESTED', provider: 'Montemor district'}, ...overrides
});

export const waterUnit = (overrides = {}) => ({
  id: 'water-2', name: 'Water Support 2', resourceType: 'WATER_SUPPORT', zoneId: 'zone-a',
  capabilities: {water_support: cap(true)}, status: 'IN_SERVICE',
  location: [-7.91, 38.58], locationObservedAt: PERIOD_START,
  availability: {from: PERIOD_START, until: PERIOD_END}, existingAssignments: [],
  capacity: 1, capacityByDimension: {water_litres: 8000}, originFacilityId: 'station-north', ...overrides
});

export const group = (overrides = {}) => ({
  id: 'g-louredo', incidentId: 'incident-a', subjectId: 'louredo', subjectName: 'Louredo',
  destinationFacilityId: 'fac-louredo', destinationName: 'Louredo',
  earliestStart: PERIOD_START, requiredBy: T.t1840, durationMinutes: 25,
  slots: [{capability: 'structural_fire', quantity: 1}], ...overrides
});

export const canaviais = (overrides = {}) => group({
  id: 'g-canaviais', incidentId: 'incident-b', subjectId: 'canaviais', subjectName: 'Canaviais',
  destinationFacilityId: 'fac-canaviais', destinationName: 'Canaviais',
  requiredBy: T.t1900, durationMinutes: 20, ...overrides
});

export function period(overrides = {}) {
  return {
    id: 'period-2026-09-15-evening', startsAt: PERIOD_START, endsAt: PERIOD_END,
    incidents: ['incident-a', 'incident-b'],
    requirementGroups: [group(), canaviais()],
    reservePolicies: [],
    transitMinutes: TRANSIT(),
    ...overrides
  };
}

/** Two incidents, two engines, enough time for sequential reuse. */
export const scenario = (overrides = {}) => ({period: period(), resources: [engine8(), engine12()], ...overrides});
