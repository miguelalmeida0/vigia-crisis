import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, canaviaisRequirement, engine20, engine8, louredoRequirement, planningScenario} from './planning-fixture.mjs';
import {missionPlan} from '../../src/planning/mission-planning.mjs';
import {minimalReplanSet, planDifference} from '../../src/planning/replan.mjs';

const plan = (overrides) => missionPlan(planningScenario(overrides));

// --- C. CONTENTION ---------------------------------------------------------

test('C1 · one resource wanted by two overlapping requirements is named as contention', () => {
  const contention = plan().contention.find((row) => row.resourceId === 'engine-8');
  assert.ok(contention, 'Engine 8 is the only confirmed option for both');
  assert.deepEqual(contention.competingRequirementIds, ['req-canaviais', 'req-louredo']);
  assert.equal(contention.text, 'Engine 8 could support Canaviais or Louredo, but not all of them across overlapping windows.');
  assert.equal(contention.pairs[0].windowsOverlap, true);
});

test('C2 · VIGIA does not pick the winner', () => {
  const contention = plan().contention.find((row) => row.resourceId === 'engine-8');
  assert.equal(contention.resolution, 'COMMANDER_DECISION_REQUIRED');
  assert.ok(!('winner' in contention) && !('chosen' in contention));
  // The alternatives each requirement would still have are stated instead.
  assert.ok(contention.alternativesByRequirement['req-louredo'].some((row) => row.resourceId === 'engine-20'));
});

test('C3 · requirements whose windows do not overlap are not reported as competing', () => {
  const later = canaviaisRequirement({earliestStart: '2026-09-15T22:00:00.000Z', requiredBy: '2026-09-15T23:00:00.000Z'});
  assert.equal(plan({requirements: [louredoRequirement(), later]}).contention.length, 0);
});

// --- O. MULTIPLE MISSIONS AND RESOURCES · bounded generation ---------------

test('O1 · options are generated, bounded, and each states what it costs', () => {
  const result = plan();
  assert.ok(result.options.length >= 2);
  assert.ok(result.options.every((option) => option.advisory === true));
  for (const option of result.options) {
    assert.ok(Array.isArray(option.assignments));
    assert.ok(Array.isArray(option.requirementsUnsupported));
    assert.ok(Array.isArray(option.consequences));
    assert.ok('protectedViolations' in option && 'unknownCount' in option);
  }
  assert.match(result.optionBoundary, /advisory alternatives|Every distinct option/);
});

test('O2 · no option double-books one resource onto two requirements', () => {
  for (const option of plan().options) {
    const used = option.assignments.map((row) => row.resourceId);
    assert.equal(new Set(used).size, used.length, `${option.label} assigns a resource twice`);
  }
});

test('O3 · identical allocations are one option, whatever produced them', () => {
  const ids = plan().options.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('O4 · an unsupported requirement is stated as a consequence of the option', () => {
  // Only one qualified resource, two requirements: one must go without.
  const result = plan({resources: [engine8()]});
  const costly = result.options.find((option) => option.unsupportedCount > 0);
  assert.ok(costly, 'with one engine and two communities, some option leaves one unsupported');
  assert.match(costly.consequences[0], /would have no assigned structural_fire resource/);
});

// --- §16. ORDERING WITHOUT SCORES -----------------------------------------

test('P1 · ordering is explained by a named factor, never by a score', () => {
  const result = plan({resources: [engine8()]});
  const ranked = result.options.find((row) => row.rank === 2);
  if (ranked) {
    assert.ok(ranked.comparedWithAbove.decidedBy, 'the deciding factor is named');
    assert.match(ranked.comparedWithAbove.text, /is shown first because|are equivalent on every ordering factor/);
  }
  assert.doesNotMatch(JSON.stringify(result.options), /"score"|priorityScore|confidence|\d+%/i);
});

test('P2 · an option preserving protected commitments outranks one that breaks them', async () => {
  const {compareOptions} = await import('../../src/planning/assignment-options.mjs');
  const clean = {id: 'a', label: 'A', protectedViolations: 0, deadlinesMissed: 0, unsupportedCount: 1, unknownCount: 0, displacedCount: 0, totalTravelMinutes: 40};
  const breaks = {id: 'b', label: 'B', protectedViolations: 1, deadlinesMissed: 0, unsupportedCount: 0, unknownCount: 0, displacedCount: 0, totalTravelMinutes: 10};
  const decision = compareOptions(clean, breaks);
  assert.ok(decision.order < 0, 'preserving protected commitments beats being faster and more complete');
  assert.equal(decision.factor, 'protectedViolations');
  assert.match(decision.aheadBecause, /preserves every protected commitment/);
});

// --- I. RESOURCE LOSS · minimal replan ------------------------------------

test('I1 · only the assignments depending on the lost resource need reconsideration', () => {
  // For the isolation to be real, engine-8 must be DEFINITIVELY ruled out of the
  // third requirement. An unrecorded capability would leave it an UNKNOWN
  // candidate there, and losing it would then genuinely matter.
  const scenario = planningScenario({
    resources: [engine8({capabilities: {structural_fire: {value: true, validUntil: '2026-09-16T00:00:00.000Z'}, patient_transport: {value: false, validUntil: '2026-09-16T00:00:00.000Z'}}}),
      ...planningScenario().resources.slice(1)],
    requirements: [louredoRequirement(), canaviaisRequirement(),
      louredoRequirement({id: 'req-isolated', subjectId: 'isolated', subjectName: 'Isolated', capabilityNeeded: 'patient_transport'})]});
  const result = missionPlan(scenario);
  const replan = minimalReplanSet(result, {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'});
  assert.deepEqual(replan.directlyAffectedRequirementIds, ['req-canaviais', 'req-louredo']);
  // req-isolated HAD engine-8 among its candidates, but had already ruled it
  // out, so losing it changes nothing there. That is a different fact from
  // never having considered it, and the engine keeps the two apart.
  assert.deepEqual(replan.consideredButUnaffected, ['req-isolated']);
  assert.ok(!replan.directlyAffectedRequirementIds.includes('req-isolated'), 'it needs no reconsideration');
  assert.match(replan.text, /Only the assignments depending on engine-8 need reconsideration/);
});

test('I2 · resources newly carrying the demand are named', () => {
  const replan = minimalReplanSet(plan(), {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'});
  assert.ok(replan.resourcesNewlyContended.includes('engine-20'));
  assert.equal(replan.requirementsLosingAllOptions.length, 0, 'Engine 20 remains as an unconfirmed option');
});

test('I3 · a change nothing depended on requires no reconsideration', () => {
  const replan = minimalReplanSet(plan(), {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-99'});
  assert.deepEqual(replan.directlyAffectedRequirementIds, []);
  assert.match(replan.text, /No assignment in this plan depended on engine-99/);
});

// --- J. WHAT-IF · isolated from operational truth -------------------------

test('J1 · a scenario is labelled, writes nothing, and mutates no input record', () => {
  const scenario = planningScenario();
  const before = JSON.stringify(scenario);
  const result = missionPlan({...scenario, assumptions: [{kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'}]});
  assert.equal(result.universe, 'SCENARIO');
  assert.equal(result.operationalWrites, 0);
  assert.equal(result.dispatched, false);
  assert.match(result.assumptionText, /^Under this assumption: engine-8 is unavailable\.$/);
  assert.match(result.boundary, /no operational record was changed/);
  assert.equal(JSON.stringify(scenario), before, 'the caller’s records are untouched');
});

test('J2 · under the assumption, the affected requirement has no confirmed option', () => {
  const result = missionPlan({...planningScenario(), assumptions: [{kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'}]});
  assert.ok(!Object.values(result.candidates).flat().some((row) => row.resourceId === 'engine-8'));
  const canaviais = result.unsupportedRequirements.find((row) => row.requirementId === 'req-canaviais');
  assert.equal(canaviais.state, 'NO_CONFIRMED_OPTION', 'Engine 20 is still unknown, not qualified');
});

test('J3 · an unknown assumption kind is refused rather than guessed', () => {
  assert.throws(() => missionPlan({...planningScenario(), assumptions: [{kind: 'MAKE_SAFE', subjectId: 'x'}]}), /assumption_kind_unknown/);
});

// --- K. PLAN DIFFERENCE ----------------------------------------------------

test('K1 · a plan change is attributed only to the constraint that proves it', () => {
  const previous = plan();
  const current = missionPlan({...planningScenario(), assumptions: [{kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'}]});
  const diff = planDifference({previous, current, change: {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'}});
  const caused = diff.candidateChanges.filter((row) => row.relation === 'CAUSED');
  assert.ok(caused.length, 'Engine 8 disappearing is a proven cause for its own candidates');
  assert.ok(caused.every((row) => row.resourceId === 'engine-8'));
  assert.match(diff.whyItChanged[0], /The plan changed because engine-8 became unavailable\./);
});

test('K2 · previously feasible becoming unknown is retained as knowledge loss', () => {
  const previous = plan();
  const current = missionPlan(planningScenario({sourceValidUntil: '2026-09-15T18:02:00.000Z', sourceLastCheckedAt: '2026-09-15T16:02:00.000Z'}));
  const diff = planDifference({previous, current, change: {kind: 'SOURCE_STALE', subjectId: 'EM527'}});
  const loss = diff.knowledgeLosses.find((row) => row.resourceId === 'engine-8');
  assert.ok(loss, 'Engine 8 was feasible and is now unknown');
  assert.equal(loss.previousState, 'FEASIBLE');
  assert.equal(loss.currentState, 'UNKNOWN');
  assert.match(loss.knowledgeLoss.text, /previously feasible\. Its current feasibility is unknown and needs checking/);
});

// --- M. DETERMINISM --------------------------------------------------------

test('M1 · the same canonical input produces byte-identical plans', () => {
  const strip = (row) => JSON.stringify({...row, generationMs: null});
  assert.equal(strip(plan()), strip(plan()));
});

test('M2 · input order does not change the plan', () => {
  const scenario = planningScenario();
  const reversed = {...scenario, resources: [...scenario.resources].reverse(), requirements: [...scenario.requirements].reverse()};
  const key = (result) => JSON.stringify(result.options.map((row) => ({id: row.id, rank: row.rank, assignments: row.assignments.map((a) => `${a.requirementId}=${a.resourceId}`)})));
  assert.equal(key(missionPlan(reversed)), key(missionPlan(scenario)));
});

// --- §23. HUMAN AUTHORITY BOUNDARY ----------------------------------------

test('Q1 · the planner proposes and never acts', () => {
  const result = plan();
  assert.equal(result.advisory, true);
  assert.equal(result.dispatched, false);
  assert.equal(result.operationalWrites, 0);
  assert.equal(result.modelUsed, false);
  assert.match(result.boundary, /VIGIA proposes; a commander decides/);
  assert.doesNotMatch(JSON.stringify(result), /"approved"|dispatchedAt|"ordered":true/i);
});

// --- C4-C5. CONTENTION AT SCALE · bounded, and honest about what it bounds --

test('C4 · many competing requirements report bounded pairs and say so', () => {
  const requirements = Array.from({length: 20}, (unused, index) =>
    louredoRequirement({id: `q${index}`, subjectId: `s${index}`, subjectName: `S${index}`}));
  const result = missionPlan(planningScenario({resources: [engine8()], requirements}));
  const contention = result.contention.find((row) => row.resourceId === 'engine-8');
  assert.equal(contention.competingRequirementIds.length, 20, 'every competing requirement is named');
  assert.ok(contention.pairs.length <= 24, 'pair reporting is bounded');
  assert.equal(contention.pairsTruncated, true);
  assert.match(contention.text, /and 16 more, but not all of them across overlapping windows/);
});

test('C5 · a requirement with an unstated window is unestablished competition, not dropped', () => {
  const vague = canaviaisRequirement({earliestStart: null, requiredBy: null});
  const contention = missionPlan(planningScenario({resources: [engine8()], requirements: [louredoRequirement(), vague]}))
    .contention.find((row) => row.resourceId === 'engine-8');
  assert.ok(contention, 'the conflict is still surfaced');
  assert.equal(contention.pairs[0].windowsOverlap, null);
  assert.equal(contention.pairs[0].established, false, 'not asserted as competing, not hidden either');
});
