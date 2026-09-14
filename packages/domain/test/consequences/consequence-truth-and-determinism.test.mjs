// Consequence engine, cases C-F: field-report truth boundary, mission impact,
// determinism and missing data. Cases A (shared road) and B (false redundancy)
// live in operational-consequences.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, OBSERVED_AT, RECEIVED_AT, catalogFor, em527BlockedReport, em527Scenario, evaluatedMissions, falseRedundancyScenario, namedRoadOnlyRoutes} from './consequence-fixture.mjs';
import {operationalConsequences} from '../../src/consequences/operational-consequences.mjs';
import {extractCanonicalInputs, namedRoadKeys} from '../../src/consequences/canonical-inputs.mjs';
import {describeSharedDependency, geometriesShareCorridor, sharedRoadDependencies} from '../../src/consequences/shared-dependency.mjs';
import {comparePriority} from '../../src/consequences/priority-ordering.mjs';
import * as boundingBox from '../../src/consequences/canonical-inputs.mjs';

const only = (result) => {
  assert.equal(result.consequences.length, 1, 'the scenario produces exactly one consequence');
  return result.consequences[0];
};
const service = (consequence, id) => consequence.serviceImpacts.find((row) => row.serviceId === id);

// --- C. FIELD REPORT TRUTH BOUNDARY ----------------------------------------

test('C1 · a field report is reported, never converted into an official closure', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.equal(consequence.kind, 'FIELD_REPORT');
  assert.equal(consequence.authority, 'FIELD_OBSERVATION');
  assert.equal(consequence.establishesOfficialClosure, false);
  // Scan the fields that make claims. truthBoundary is excluded on purpose: it
  // is the sentence that DENIES closure, and must be free to say the word.
  const {truthBoundary, ...claims} = consequence.explanation;
  const text = JSON.stringify(claims);
  assert.match(text, /A field report says/);
  assert.doesNotMatch(text, /officially closed|official closure|is closed|confirmed closed|road is closed/i);
  assert.match(truthBoundary, /not an official restriction/);
  assert.match(truthBoundary, /VIGIA has not established that the road is closed/);
});

test('C2 · observation time and received time stay separate', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.equal(consequence.observedAt, OBSERVED_AT);
  assert.equal(consequence.receivedAt, RECEIVED_AT);
  assert.notEqual(consequence.observedAt, consequence.receivedAt);
  // The operator-facing sentence quotes the observation time, not ingestion.
  assert.match(consequence.explanation.whatChanged, /at 18:21/);
});

test('C3 · an unconfirmed report is flagged as needing a second responder', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.equal(consequence.trigger.verification, 'UNCONFIRMED');
  assert.ok(consequence.explanation.whatNeedsChecking.some((row) => /not been confirmed by a second responder/.test(row)));
});

test('C4 · an official restriction is allowed the wording a field report is not', () => {
  const scenario = em527Scenario({reports: []});
  const restriction = {id: 'ip-road:1', roadRef: 'EM527', state: 'CLOSED', admitted: true,
    admissionRule: 'OFFICIAL_IP_PUBLISHED_OCCURRENCE', geometry: {type: 'Point', coordinates: [-7.895, 38.57]},
    direction: 'ambos', observedAt: OBSERVED_AT, ingestedAt: RECEIVED_AT, validUntil: '2026-09-15T00:00:00.000Z'};
  const consequence = only(operationalConsequences({...scenario, restrictions: [restriction],
    missions: evaluatedMissions({catalog: scenario.catalog, restrictions: [restriction], sourceValidUntil: scenario.sourceValidUntil})}));
  assert.equal(consequence.kind, 'OFFICIAL_RESTRICTION');
  assert.equal(consequence.establishesOfficialClosure, true);
  assert.match(consequence.explanation.whatChanged, /A published restriction closes EM527\./);
  assert.deepEqual(consequence.provenance.restrictionIds, ['ip-road:1']);
  assert.deepEqual(consequence.provenance.reportIds, []);
});

test('C5 · road identity is read from the record, never guessed from prose', () => {
  assert.deepEqual(namedRoadKeys('EM527'), ['EM527']);
  assert.deepEqual(namedRoadKeys('EN 527 near the bridge'), ['N527']);
  assert.deepEqual(namedRoadKeys('the bridge on the river road'), [], 'no road reference is invented from prose');
});

// --- D. MISSION IMPACT -----------------------------------------------------

test('D1 · mission state is read from the mission engine, not recomputed here', () => {
  const scenario = em527Scenario();
  const fireMission = scenario.missions.find((row) => row.service === 'fire_response');
  assert.equal(fireMission.state, 'PROBLEM', 'the product mission rules produce PROBLEM');
  const impact = service(only(operationalConsequences(scenario)), 'fire_response').missionImpacts[0];
  assert.equal(impact.state, fireMission.state);
  assert.equal(impact.reason, fireMission.reason);
  assert.equal(impact.missionId, 'mission-fire_response');
  assert.equal(impact.primaryAffected, true);
  assert.equal(impact.flaggedByMissionEngine, true, 'the mission engine independently linked this report');
});

test('D2 · the mission reason references the canonical dependency', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  const impact = service(consequence, 'fire_response').missionImpacts[0];
  assert.match(impact.reason, /Road blocked at EM527/);
  assert.match(impact.reason, /fire response route uses this location/);
});

test('D3 · with no report, no mission is in trouble and no consequence is produced', () => {
  const result = operationalConsequences(em527Scenario({reports: []}));
  assert.equal(result.total, 0);
  assert.ok(em527Scenario({reports: []}).missions.every((row) => row.state === 'GOOD'));
});

// --- E. DETERMINISM --------------------------------------------------------

test('E1 · the same canonical input produces byte-identical output', () => {
  const first = operationalConsequences(em527Scenario());
  const second = operationalConsequences(em527Scenario());
  const strip = (result) => JSON.stringify({...result, generationMs: null});
  assert.equal(strip(first), strip(second));
});

test('E2 · consequence ids are stable across runs and derived from the facts', () => {
  const ids = () => operationalConsequences(em527Scenario()).consequences.map((row) => row.id);
  assert.deepEqual(ids(), ids());
  assert.match(ids()[0], /^consequence:[0-9a-f]+$/);
});

test('E3 · input order does not change the result', () => {
  const scenario = em527Scenario();
  const reversed = {...scenario, catalog: [{...scenario.catalog[0], services: [...scenario.catalog[0].services].reverse()}], missions: [...scenario.missions].reverse()};
  const strip = (result) => JSON.stringify(result.consequences.map((row) => ({id: row.id, tier: row.tier, order: row.serviceImpacts.map((s) => s.serviceId)})));
  assert.equal(strip(operationalConsequences(reversed)), strip(operationalConsequences(scenario)));
});

test('E4 · the comparator is a total order — no pair is mutually preceding', () => {
  const rows = [
    {id: 'a', tier: 'ACTIVE_MISSION_NO_REMAINING_OPTION', remainingOptionCount: 0, affectedServiceCount: 2, affectedMissionCount: 1, observedAt: AT},
    {id: 'b', tier: 'ACTIVE_MISSION_ALTERNATIVE_RETAINED', remainingOptionCount: 1, affectedServiceCount: 2, affectedMissionCount: 1, observedAt: AT},
    {id: 'c', tier: 'ACTIVE_MISSION_ALTERNATIVE_RETAINED', remainingOptionCount: 1, affectedServiceCount: 1, affectedMissionCount: 1, observedAt: AT}
  ];
  // `|| 0` normalises JS signed zero so that -0 and 0 compare as one value.
  const order = (left, right) => comparePriority(left, right).order || 0;
  for (const left of rows) for (const right of rows) {
    assert.equal(order(left, right), -order(right, left) || 0, `${left.id} vs ${right.id} must be antisymmetric`);
    if (left.id === right.id) assert.equal(order(left, right), 0);
  }
  // Transitivity: a precedes b precedes c, so a must precede c.
  assert.ok(order(rows[0], rows[1]) < 0 && order(rows[1], rows[2]) < 0 && order(rows[0], rows[2]) < 0);
});

// --- F. MISSING DATA -------------------------------------------------------

test('F1 · a service with no stored alternative says so; a service with no objective does not', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.equal(service(consequence, 'fire_response').remainingOptionState, 'NO_OTHER_CURRENT_ROUTE_STORED');
  // Reception has no routes at all, so it is never reached and never claimed about.
  assert.equal(service(consequence, 'designated_reception'), undefined);
});

test('F2 · a service reached with no watched objective claims nothing either way', () => {
  const scenario = em527Scenario();
  const consequence = only(operationalConsequences({...scenario, missions: scenario.missions.filter((row) => row.service !== 'fire_response')}));
  const fire = service(consequence, 'fire_response');
  assert.equal(fire.remainingOptionState, 'NO_WATCHED_OBJECTIVE_FOR_THIS_SERVICE');
  assert.equal(fire.remainingOptionCount, null, 'absence of an objective is not an absence of routes');
  assert.match(consequence.explanation.summary, /No objective is being watched for fire response/);
});

test('F3 · absent data never becomes safe, open, zero or unaffected', () => {
  const scenario = em527Scenario();
  const consequence = only(operationalConsequences({...scenario, missions: []}));
  const text = JSON.stringify(consequence);
  assert.doesNotMatch(text, /"safe"|is open|unaffected|no impact|all clear/i);
  assert.ok(consequence.serviceImpacts.every((row) => row.remainingOptionCount === null));
});

test('F4 · a single stored route is never analysed as redundancy', () => {
  const rows = extractCanonicalInputs(em527Scenario()).routesByServiceSubject.get('evora-centro::fire_response');
  const analysis = sharedRoadDependencies(rows);
  assert.equal(analysis.independent, null, 'one route is neither independent nor dependent');
  assert.equal(analysis.reason, 'ONLY_ONE_ROUTE_STORED');
  assert.equal(describeSharedDependency(analysis), null);
});

test('F5 · an expired observation is marked for recheck rather than trusted or dropped', () => {
  const late = '2026-09-14T19:40:00.000Z';
  const scenario = em527Scenario({at: late});
  const consequence = only(operationalConsequences(scenario));
  assert.equal(consequence.expired, true);
  assert.equal(consequence.state, 'NEEDS_RECHECK');
  assert.ok(consequence.explanation.whatNeedsChecking.some((row) => /needs a new check/.test(row)));
});

test('F6 · no model is involved and none can be', () => {
  const result = operationalConsequences(em527Scenario());
  assert.equal(result.origin, 'DETERMINISTIC_DERIVATION');
  assert.equal(result.modelUsed, false);
});

// --- G. THE BOUNDING-BOX PREFILTER MUST NOT CHANGE ANY RESULT --------------

test('G1 · the prefilter never excludes a route the geometric test would match', () => {
  const {routeBoundingBox, withinBoundingBox} = boundingBox;
  const geometry = {type: 'LineString', coordinates: [[-7.91, 38.57], [-7.88, 38.57]]};
  const box = routeBoundingBox(geometry);
  // A point 90 m north is inside matching tolerance, so it must survive the filter.
  assert.equal(withinBoundingBox([-7.895, 38.57 + 90 / 110540], box), true);
  // A point 10 km away cannot match and is correctly skipped.
  assert.equal(withinBoundingBox([-7.895, 38.66], box), false);
  // No geometry is never treated as a match.
  assert.equal(routeBoundingBox(null), null);
  assert.equal(withinBoundingBox([-7.895, 38.57], null), false);
});

test('G2 · a facility-matched report still links when its coordinate is nowhere near the route', () => {
  const scenario = em527Scenario();
  const distant = {...scenario.reports[0], id: 'report-facility', coordinate: [-8.9, 39.9],
    locationName: 'Hospital Central', facilityId: 'facility-hospital-central'};
  const consequence = operationalConsequences({...scenario, reports: [distant]}).consequences[0];
  // The geometric prefilter excludes it, but the facility basis does not depend
  // on geometry and must still establish the link.
  const link = consequence.serviceImpacts.flatMap((row) => row.affectedRoutes).find((row) => row.routeId === 'route-h1');
  assert.equal(link.basis, 'FACILITY_MATCH');
});
