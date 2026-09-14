import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, catalogFor, em527Scenario, falseRedundancyScenario} from './consequence-fixture.mjs';
import {disjointRoutes, staleRoadScenario} from './consequence-fixture-xi.mjs';
import {operationalConsequences} from '../../src/consequences/operational-consequences.mjs';
import {extractCanonicalInputs} from '../../src/consequences/canonical-inputs.mjs';
import {describeCutSets, minimalCutSets} from '../../src/consequences/dependency-sets.mjs';
import {resilienceQuery} from '../../src/consequences/resilience-query.mjs';
import {asRequirementsResult, operatorWording, verificationNeeds} from '../../src/consequences/verification-need.mjs';
import {factFreshness} from '../../src/consequences/freshness.mjs';
import {compareConsequences, compressDecision} from '../../src/consequences/decision-compression.mjs';
import {nextVerificationTasks} from '../../src/intelligence/collection-tasking.mjs';

const hospitalRoutes = (scenario) => extractCanonicalInputs(scenario).routesByServiceSubject.get('evora-centro::emergency_hospital');

// --- D. COMMON-MODE FAILURE ------------------------------------------------

test('D1 · a road on every stored route is identified as a common-mode dependency', () => {
  const analysis = minimalCutSets(hospitalRoutes(falseRedundancyScenario()));
  assert.equal(analysis.routeCount, 2);
  assert.equal(analysis.smallestCutSize, 1);
  assert.ok(analysis.cuts.every((cut) => cut.commonMode));
  assert.deepEqual(analysis.cuts.map((cut) => cut.roads[0]).sort(), ['EM527', 'N114']);
});

test('D2 · two stored routes do not imply independence', () => {
  const described = describeCutSets(minimalCutSets(hospitalRoutes(falseRedundancyScenario())), {serviceLabel: 'healthcare'});
  assert.match(described.text, /Every stored healthcare option currently depends on EM527 and N114\./);
  assert.doesNotMatch(described.text, /single point of failure/i);
  assert.equal(described.complete, true);
});

test('D3 · genuinely independent routes produce no size-one cut', () => {
  const analysis = minimalCutSets(hospitalRoutes(em527Scenario()));
  assert.notEqual(analysis.smallestCutSize, 1, 'H1 uses EM527, H2 uses N114 — no single road kills both');
});

// --- E. MULTIPLE-DEPENDENCY CUT --------------------------------------------

test('E1 · where no single road removes all support, the engine says so explicitly', () => {
  const analysis = minimalCutSets(hospitalRoutes({catalog: catalogFor(disjointRoutes()), at: AT}));
  assert.equal(analysis.smallestCutSize, 2);
  assert.equal(analysis.reason, 'NO_SINGLE_ROAD_REMOVES_EVERY_ROUTE');
  assert.ok(analysis.cuts.every((cut) => !cut.commonMode));
  assert.deepEqual(analysis.cuts[0].roads.sort(), ['M507', 'N114']);
});

test('E2 · neither dependency alone is claimed to destroy all support', () => {
  const analysis = minimalCutSets(hospitalRoutes({catalog: catalogFor(disjointRoutes()), at: AT}));
  const described = describeCutSets(analysis, {serviceLabel: 'healthcare'});
  assert.match(described.text, /No single road removes every stored healthcare route\. M507 and N114 together would\./);
  assert.ok(!analysis.cuts.some((cut) => cut.size === 1));
});

test('E3 · routes with no recorded road names make the analysis incomplete, not smaller', () => {
  const rows = hospitalRoutes(falseRedundancyScenario());
  const blind = [...rows, {routeId: 'route-unknown', roadKeys: [], route: {}}];
  const analysis = minimalCutSets(blind);
  assert.equal(analysis.analysisComplete, false);
  assert.deepEqual(analysis.routesWithoutRoadNames, ['route-unknown']);
  assert.match(describeCutSets(analysis, {serviceLabel: 'healthcare'}).incompleteNote, /no recorded road names/);
});

// --- F. WHAT STILL WORKS ---------------------------------------------------

test('F1 · under EM527 unavailable, healthcare retains its 24-minute option and fire response does not', () => {
  const scenario = em527Scenario({reports: []});
  const result = resilienceQuery({...scenario, assumptions: [{kind: 'ROAD_UNAVAILABLE', subjectId: 'EM527'}]});
  const healthcare = result.services.find((row) => row.serviceId === 'emergency_hospital');
  const fire = result.services.find((row) => row.serviceId === 'fire_response');
  assert.equal(healthcare.state, 'DEGRADED');
  assert.equal(healthcare.bestRetainedOption.minutes, 24);
  assert.equal(fire.state, 'NO_RETAINED_OPTION');
  assert.equal(fire.retainedOptions.length, 0);
});

test('F2 · the scenario is labelled and operational records are untouched', () => {
  const scenario = em527Scenario({reports: []});
  const before = JSON.stringify(scenario);
  const result = resilienceQuery({...scenario, assumptions: [{kind: 'ROAD_UNAVAILABLE', subjectId: 'EM527'}]});
  assert.equal(result.universe, 'SCENARIO');
  assert.equal(result.observed, false);
  assert.equal(result.operationalWrites, 0);
  assert.match(result.assumptionText, /^Under this assumption: EM527 becomes unavailable\.$/);
  assert.match(result.boundary, /no operational record, mission or history was changed/);
  assert.equal(JSON.stringify(scenario), before, 'the input records are not mutated');
});

test('F3 · a stale-source assumption makes support uncertain, never unavailable', () => {
  const scenario = em527Scenario({reports: []});
  const result = resilienceQuery({...scenario, assumptions: [{kind: 'SOURCE_STALE', subjectId: 'EM527'}]});
  const fire = result.services.find((row) => row.serviceId === 'fire_response');
  assert.equal(fire.state, 'SUPPORT_UNCERTAIN');
  assert.equal(fire.lostOptions.length, 0, 'stale information removes certainty, not the route');
  assert.equal(fire.uncertainOptions.length, 1);
});

test('F4 · an unknown assumption kind is refused rather than guessed', () => {
  const scenario = em527Scenario({reports: []});
  assert.throws(() => resilienceQuery({...scenario, assumptions: [{kind: 'MAKE_SAFE', subjectId: 'EM527'}]}), /assumption_kind_unknown/);
  assert.throws(() => resilienceQuery({...scenario, assumptions: []}), /assumption_required/);
});

// --- H. INTELLIGENCE VIII CONNECTION ---------------------------------------

const needsFor = (scenario) => {
  const consequence = operationalConsequences(em527Scenario()).consequences[0];
  const freshness = new Map([['EM527', factFreshness({factId: 'road-information:EM527', kind: 'ROAD_INFORMATION',
    lastCheckedAt: scenario.sourceLastCheckedAt, validUntil: scenario.sourceValidUntil}, scenario.at)]]);
  return verificationNeeds(consequence, {freshnessByRoad: freshness, at: scenario.at});
};

test('H1 · a critical stale road dependency emits an existing Intelligence VIII requirement', () => {
  const needs = needsFor(staleRoadScenario());
  assert.equal(needs.length, 1);
  const need = needs[0];
  assert.equal(need.schemaVersion, 'vigia.information-requirement.v1', 'the existing contract, not a new one');
  assert.equal(need.requirementClass, 'ROAD_INFORMATION', 'an existing requirement class');
  assert.match(need.id, /^requirement:[0-9a-f]+$/, 'built with the existing requirementId');
  assert.equal(need.question, 'Is EM527 usable now?');
  assert.equal(need.retainedAlternative.state, 'NO_RETAINED_ALTERNATIVE');
  assert.equal(need.lifecycle.state, 'OPEN');
  assert.ok(need.dependentOutputs.includes('SHARED_ROAD_DEPENDENCY'));
});

test('H2 · the existing collection tasking consumes it unmodified', () => {
  const scenario = staleRoadScenario();
  const tasks = nextVerificationTasks(asRequirementsResult(needsFor(scenario), {incidentId: 'controlled-incident', at: scenario.at}));
  assert.equal(tasks.tasks.length, 1);
  assert.equal(tasks.tasks[0].requirementClass, 'ROAD_INFORMATION');
  assert.equal(tasks.tasks[0].factors.noRetainedAlternative, true);
  assert.equal(tasks.tasks[0].factors.sourceFreshnessUrgency, 'STALE');
  assert.ok(tasks.tasks[0].reasons.length, 'the existing tasking produced its own reasons');
});

test('H3 · operator wording carries no collection jargon', () => {
  const wording = operatorWording(needsFor(staleRoadScenario())[0]);
  assert.equal(wording.label, 'Needs checking');
  assert.equal(wording.action, 'Confirm EM527');
  const text = JSON.stringify(wording);
  assert.doesNotMatch(text, /epistemic|information requirement|coverage classification|requirementClass/i);
});

test('H4 · a road nothing active depends on raises no verification need', () => {
  const scenario = em527Scenario();
  const consequence = operationalConsequences({...scenario, missions: []}).consequences[0];
  assert.deepEqual(verificationNeeds(consequence, {at: scenario.at}), []);
});

// --- I. PRIORITY EXPLANATION -----------------------------------------------

test('I1 · the engine can state every factor separating two impacts, not just the decisive one', () => {
  const consequence = operationalConsequences(em527Scenario()).consequences[0];
  const [fire, healthcare] = consequence.serviceImpacts;
  const rationale = compareConsequences(fire, healthcare);
  assert.equal(rationale.ahead, fire.id);
  assert.equal(rationale.decidedBy, 'tier');
  assert.ok(rationale.differences.length >= 2, 'tier and remaining options both differ');
  assert.ok(rationale.differences.some((row) => row.factor === 'remainingOptionCount' && /no other current route is stored/.test(row.ahead)));
  assert.match(rationale.text, /is shown above/);
  assert.doesNotMatch(rationale.text, /score|\d+%/i);
});

// --- DECISION COMPRESSION --------------------------------------------------

test('K1 · fifteen downstream facts compress to one directive and its reason', () => {
  const compressed = compressDecision(operationalConsequences(em527Scenario()));
  assert.equal(compressed.directive, 'FIRE RESPONSE FIRST');
  assert.equal(compressed.text, 'Fire response loses its only retained route. Healthcare retains a 24-minute alternative.');
  // Reconstructable from the consequence objects, with nothing summarised away.
  assert.deepEqual(compressed.provenance.reportIds, ['report-em527-blocked']);
  assert.deepEqual(compressed.provenance.missionIds, ['mission-emergency_hospital', 'mission-fire_response']);
});

test('K2 · with nothing derived, the directive is absent rather than invented', () => {
  const compressed = compressDecision(operationalConsequences(em527Scenario({reports: []})));
  assert.equal(compressed.directive, null);
  assert.equal(compressed.state, 'NOTHING_DERIVED');
  assert.equal(compressed.text, 'No reported change currently affects a watched route.');
});

// --- L. SPATIAL INDEX MUST NOT CHANGE ANY RESULT ---------------------------

test('L1 · indexed lookup and a full scan produce identical relationships', async () => {
  const {buildOperationalRelationships} = await import('../../src/consequences/operational-relationships.mjs');
  const scenario = em527Scenario();
  const links = (relationships) => JSON.stringify(relationships.triggers
    .map((trigger) => [trigger.triggerId, trigger.routeLinks.map((link) => [link.routeId, link.basis])]));
  const indexed = buildOperationalRelationships(extractCanonicalInputs(scenario));
  const unindexed = extractCanonicalInputs(scenario);
  delete unindexed.spatial;                       // forces the full-scan path
  assert.equal(links(indexed), links(buildOperationalRelationships(unindexed)));
});

test('L2 · the index never gates the non-geometric bases', async () => {
  const {buildOperationalRelationships} = await import('../../src/consequences/operational-relationships.mjs');
  const scenario = em527Scenario();
  // A report whose coordinate is in no route's cell, but which names a facility.
  const distant = {...scenario.reports[0], id: 'report-far', coordinate: [-8.9, 39.9],
    locationName: 'Hospital Central', facilityId: 'facility-hospital-central'};
  const relationships = buildOperationalRelationships(extractCanonicalInputs({...scenario, reports: [distant]}));
  const link = relationships.triggers[0].routeLinks.find((row) => row.routeId === 'route-h1');
  assert.equal(link.basis, 'FACILITY_MATCH', 'a facility link survives being outside every spatial cell');
});
