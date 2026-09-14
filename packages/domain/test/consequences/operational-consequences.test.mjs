import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, OBSERVED_AT, RECEIVED_AT, catalogFor, em527BlockedReport, em527Scenario, evaluatedMissions, falseRedundancyScenario, namedRoadOnlyRoutes} from './consequence-fixture.mjs';
import {operationalConsequences} from '../../src/consequences/operational-consequences.mjs';
import {extractCanonicalInputs, namedRoadKeys} from '../../src/consequences/canonical-inputs.mjs';
import {describeSharedDependency, geometriesShareCorridor, sharedRoadDependencies} from '../../src/consequences/shared-dependency.mjs';
import {comparePriority} from '../../src/consequences/priority-ordering.mjs';

const only = (result) => {
  assert.equal(result.consequences.length, 1, 'the scenario produces exactly one consequence');
  return result.consequences[0];
};
const service = (consequence, id) => consequence.serviceImpacts.find((row) => row.serviceId === id);

// --- A. SHARED ROAD / UNEQUAL CONSEQUENCE ----------------------------------

test('A1 · one road is discovered to affect both healthcare and fire response', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.equal(consequence.affectedServiceCount, 2);
  assert.deepEqual(consequence.roads, [{road: 'EM527', basis: 'CONFIRMED'}]);
  assert.deepEqual(consequence.serviceImpacts.map((row) => row.serviceId).sort(), ['emergency_hospital', 'fire_response']);
});

test('A2 · healthcare retains its 24-minute alternative and fire response retains none', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  const healthcare = service(consequence, 'emergency_hospital');
  const fire = service(consequence, 'fire_response');
  assert.equal(healthcare.remainingOptionCount, 1);
  assert.equal(healthcare.remainingOption.minutes, 24);
  assert.equal(healthcare.remainingOptionState, 'ANOTHER_STORED_ROUTE_RETAINED');
  assert.equal(fire.remainingOptionCount, 0);
  assert.equal(fire.remainingOption, null);
  assert.equal(fire.remainingOptionState, 'NO_OTHER_CURRENT_ROUTE_STORED');
});

test('A3 · fire response is ordered ahead of healthcare, and says which fact decided it', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.deepEqual(consequence.serviceImpacts.map((row) => row.serviceId), ['fire_response', 'emergency_hospital']);
  assert.equal(consequence.serviceImpacts[0].rank, 1);
  const healthcare = consequence.serviceImpacts[1];
  assert.equal(healthcare.decidedBy, 'tier', 'the tier is the factor that separates them');
  assert.match(healthcare.orderingReason, /fire response is shown first because an active mission has no other current route stored/);
  assert.match(healthcare.orderingReason, /another stored route remains/);
});

test('A4 · the explanation states the operational conclusion without a score', () => {
  const {explanation} = only(operationalConsequences(em527Scenario()));
  assert.equal(explanation.headline, 'FIRE RESPONSE ACCESS NEEDS ATTENTION');
  assert.match(explanation.summary, /A field report says EM527 was blocked at 18:21\./);
  assert.match(explanation.summary, /used by fire response and healthcare routes/);
  assert.match(explanation.summary, /Healthcare still has another stored route: 24 min\./);
  assert.match(explanation.summary, /No other current fire response route is stored\./);
  assert.match(explanation.summary, /Look at fire response first\./);
  assert.doesNotMatch(JSON.stringify(explanation), /score|confidence|probab|likelihood|%/i);
});

test('A5 · provenance carries the exact canonical identifiers behind the conclusion', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.deepEqual(consequence.provenance.reportIds, ['report-em527-blocked']);
  assert.deepEqual(consequence.provenance.routeIds, ['route-f1', 'route-h1']);
  assert.deepEqual(consequence.provenance.facilityIds, ['facility-fire-south', 'facility-hospital-central']);
  assert.deepEqual(consequence.provenance.missionIds, ['mission-emergency_hospital', 'mission-fire_response']);
  assert.deepEqual(consequence.provenance.roadRefs, ['EM527']);
  assert.deepEqual(consequence.provenance.restrictionIds, []);
  // Every material statement names the provenance key it was derived from.
  assert.ok(consequence.explanation.facts.every((fact) => fact.text && fact.from));
});

test('A6 · the unaffected alternative route is not reported as affected', () => {
  const consequence = only(operationalConsequences(em527Scenario()));
  assert.ok(!consequence.provenance.routeIds.includes('route-h2'), 'H2 does not touch EM527 and must not be linked');
  assert.equal(service(consequence, 'emergency_hospital').affectedRoutes.length, 1);
});

// --- B. FALSE REDUNDANCY ---------------------------------------------------

test('B1 · two stored routes over the same road are not reported as redundancy', () => {
  const scenario = falseRedundancyScenario();
  const rows = extractCanonicalInputs(scenario).routesByServiceSubject.get('evora-centro::emergency_hospital');
  const analysis = sharedRoadDependencies(rows);
  assert.equal(analysis.routeCount, 2, 'two routes do exist');
  assert.equal(analysis.independent, false, 'but they are not independent');
  assert.equal(analysis.reason, 'SHARED_ROAD_ON_EVERY_STORED_ROUTE');
  assert.deepEqual(analysis.blockingRoads, ['EM527', 'N114']);
});

test('B2 · the statement names every road both routes depend on', () => {
  const scenario = falseRedundancyScenario();
  const rows = extractCanonicalInputs(scenario).routesByServiceSubject.get('evora-centro::emergency_hospital');
  const described = describeSharedDependency(sharedRoadDependencies(rows));
  assert.equal(described.text, '2 stored routes are available, but both use EM527 and N114.');
  assert.equal(described.basis, 'GEOMETRY_CONFIRMED');
  assert.equal(described.qualifier, null);
});

test('B3 · a named-road overlap is NOT reported as a geometric one', () => {
  const catalog = catalogFor(namedRoadOnlyRoutes());
  const rows = extractCanonicalInputs({catalog, at: AT}).routesByServiceSubject.get('evora-centro::emergency_hospital');
  const analysis = sharedRoadDependencies(rows);
  assert.equal(analysis.independent, false);
  assert.equal(analysis.dependencies[0].basis, 'NAMED_ROAD', 'the geometries never meet, so only the name is shared');
  const described = describeSharedDependency(analysis);
  assert.match(described.text, /both still depend on EM527/);
  assert.match(described.qualifier, /Shared by road name\. The retained geometry does not establish that they use the same stretch\./);
  assert.doesNotMatch(described.text, /geometry/i);
});

test('B4 · genuinely independent stored routes are not reported as a shared dependency', () => {
  const rows = extractCanonicalInputs(em527Scenario()).routesByServiceSubject.get('evora-centro::emergency_hospital');
  const analysis = sharedRoadDependencies(rows);
  assert.equal(analysis.independent, true);
  assert.equal(analysis.reason, 'NO_ROAD_COMMON_TO_EVERY_STORED_ROUTE');
  assert.equal(describeSharedDependency(analysis), null);
});

test('B5 · a single crossing point is not a shared corridor, and absent geometry never agrees', () => {
  const west = {type: 'LineString', coordinates: [[-7.91, 38.57], [-7.88, 38.57]]};
  const crossing = {type: 'LineString', coordinates: [[-7.895, 38.55], [-7.895, 38.59]]};
  assert.equal(geometriesShareCorridor(west, crossing), false, 'crossing is not sharing');
  assert.equal(geometriesShareCorridor(west, {type: 'LineString', coordinates: [[-7.91, 38.5701], [-7.88, 38.5701]]}), true);
  assert.equal(geometriesShareCorridor(west, null), false, 'missing geometry is never read as agreement');
  assert.equal(geometriesShareCorridor(west, undefined), false);
});
