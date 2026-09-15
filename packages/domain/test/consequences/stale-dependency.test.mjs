// Stale-dependency consequences: expiry raises its own trigger, with no report
// and no restriction involved. Cases A-C, G and J live in causal-resilience.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {em527Scenario} from './consequence-fixture.mjs';
import {staleRoadScenario} from './consequence-fixture-xi.mjs';

// --- M. STALE DEPENDENCY RAISES ITS OWN CONSEQUENCE ------------------------

test('M1 · expired road information produces a consequence with no report involved', async () => {
  const {operationalConsequences} = await import('../../src/consequences/operational-consequences.mjs');
  const scenario = staleRoadScenario();
  assert.equal(scenario.reports.length, 0, 'nothing was reported');
  const result = operationalConsequences(scenario);
  const em527 = result.consequences.find((row) => row.roads[0].road === 'EM527');
  assert.equal(em527.kind, 'STALE_DEPENDENCY');
  assert.equal(em527.authority, 'NO_CURRENT_INFORMATION');
  assert.equal(em527.establishesOfficialClosure, false);
  assert.equal(em527.trigger.reportId, null);
  assert.equal(em527.trigger.restrictionId, null);
});

test('M2 · the sole-support road outranks one whose service keeps an alternative', () => {
  return import('../../src/consequences/operational-consequences.mjs').then(({operationalConsequences}) => {
    const result = operationalConsequences(staleRoadScenario());
    assert.deepEqual(result.consequences.map((row) => row.roads[0].road), ['EM527', 'N114']);
    assert.equal(result.consequences[0].tier, 'ACTIVE_MISSION_NO_REMAINING_OPTION');
    assert.equal(result.consequences[1].tier, 'UNRESOLVED_OR_STALE_DEPENDENCY');
  });
});

test('M3 · the stale consequence claims neither blocked nor open, in any field', async () => {
  const {operationalConsequences} = await import('../../src/consequences/operational-consequences.mjs');
  const em527 = operationalConsequences(staleRoadScenario()).consequences[0];
  const {truthBoundary, ...claims} = em527.explanation;
  assert.equal(em527.explanation.headline, 'EM527 NEEDS CHECKING');
  assert.match(claims.whatChanged, /last checked 2h 18m ago and can no longer support a conclusion/);
  assert.doesNotMatch(JSON.stringify(claims), /blocked|closed|is open|passable|clear/i);
  assert.match(truthBoundary, /does not mean the road is blocked and does not mean it is open/);
  // No phantom observation: nothing was observed here.
  assert.ok(!em527.explanation.whatNeedsChecking.some((row) => /This observation is older/.test(row)));
  assert.ok(em527.explanation.whatNeedsChecking.some((row) => /Confirm EM527 before relying on this route/.test(row)));
});

test('M4 · roads nothing active depends on raise no stale consequence', async () => {
  const {operationalConsequences} = await import('../../src/consequences/operational-consequences.mjs');
  const scenario = staleRoadScenario();
  const result = operationalConsequences({...scenario, missions: []});
  assert.equal(result.total, 0, 'expiry with no dependent objective is not an operational event');
});

test('M5 · the pipeline emits Intelligence VIII needs itself, correctly classified', async () => {
  const {operationalConsequences} = await import('../../src/consequences/operational-consequences.mjs');
  const {nextVerificationTasks} = await import('../../src/intelligence/collection-tasking.mjs');
  const result = operationalConsequences(staleRoadScenario());
  assert.deepEqual(result.verificationNeeds.map((row) => row.subject.id), ['EM527', 'N114']);
  assert.equal(result.verificationNeeds[0].stalenessClass, 'CRITICAL_SOLE_SUPPORT');
  assert.equal(result.verificationNeeds[0].retainedAlternative.state, 'NO_RETAINED_ALTERNATIVE');
  assert.equal(result.verificationNeeds[1].retainedAlternative.state, 'RETAINED_ALTERNATIVE');
  // Still the existing contract, consumed by the existing tasking unmodified.
  const tasks = nextVerificationTasks({requirements: result.verificationNeeds});
  assert.equal(tasks.tasks[0].factors.noRetainedAlternative, true);
  assert.equal(tasks.tasks[0].factors.sourceFreshnessUrgency, 'STALE');
});

test('M6 · current road information raises nothing, so the path stays quiet when it should', async () => {
  const {operationalConsequences} = await import('../../src/consequences/operational-consequences.mjs');
  assert.equal(operationalConsequences(em527Scenario({reports: []})).total, 0);
  assert.equal(operationalConsequences(em527Scenario()).consequences.every((row) => row.kind === 'FIELD_REPORT'), true);
});
