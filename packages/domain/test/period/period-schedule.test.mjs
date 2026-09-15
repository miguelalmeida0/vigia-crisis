import test from 'node:test';
import assert from 'node:assert/strict';
import {PERIOD_START, T, canaviais, engine12, engine8, group, period, scenario} from './period-fixture.mjs';
import {planOperationalPeriod} from '../../src/period/period-planning.mjs';
import {delayCascade, minimalScheduleRepair} from '../../src/period/schedule-repair.mjs';
import {operationalPeriod} from '../../src/period/operational-period.mjs';
import {compareSchedules} from '../../src/period/schedule-generation.mjs';

const plan = (overrides) => planOperationalPeriod(scenario(overrides));
const best = (result) => result.schedules[0];
const soloPeriod = () => planOperationalPeriod({period: period(), resources: [engine8()]});

// --- K. DELAY CASCADE ------------------------------------------------------

test('K1 · a delay propagates along the unit’s own chain and names what it breaks', () => {
  const result = soloPeriod();
  const schedule = best(result);
  const cascade = delayCascade({schedule, period: operationalPeriod(period()), resourceId: 'engine-8', delayMinutes: 15});
  assert.equal(cascade.steps.length, 2);
  // Louredo still holds; Canaviais slips past its deadline.
  assert.equal(cascade.steps[0].state, 'FEASIBLE');
  assert.equal(cascade.steps[1].state, 'INFEASIBLE');
  assert.match(cascade.steps[1].text, /Canaviais would be reached 19:02 instead of 18:47, after its 19:00 deadline\./);
  assert.match(cascade.summary, /A 15-minute delay to Engine 8 would make Canaviais infeasible\./);
  assert.deepEqual(cascade.requirementsLost.map((row) => row.subjectName), ['Canaviais']);
});

test('K2 · the cascade claims only release-to-travel dependencies, never temporal adjacency', () => {
  const result = plan();
  const cascade = delayCascade({schedule: best(result), period: operationalPeriod(period()), resourceId: 'engine-8', delayMinutes: 15});
  // Engine 12 carries Canaviais in this schedule, so it is NOT in Engine 8's chain.
  assert.ok(cascade.steps.every((row) => row.groupId === 'g-louredo'));
  assert.ok(cascade.steps.every((row) => row.relation === 'CAUSED'));
  assert.match(cascade.truthBoundary, /Assignments carried by other units are not claimed to be affected/);
});

// --- L. STALE RELEASE ------------------------------------------------------

test('L1 · an unretained service duration leaves the release unknown and blocks reuse', () => {
  const noDuration = period({requirementGroups: [group({durationMinutes: null}), canaviais()]});
  const schedule = best(planOperationalPeriod({period: noDuration, resources: [engine8()]}));
  const louredo = schedule.assignments.find((row) => row.groupId === 'g-louredo');
  assert.equal(louredo.window.state, 'UNKNOWN');
  assert.equal(louredo.window.releaseAt, null, 'no release time is invented');
  assert.equal(louredo.window.releaseEstablished, false);
  assert.match(louredo.window.reason, /No service duration is retained for Louredo, so Engine 8’s release time is not established\./);
  assert.equal(schedule.globalState, 'UNKNOWN', 'unknown never collapses into feasible');
  // Engine 8 is not reused on an unestablished release, and the resulting
  // shortfall stays UNKNOWN rather than being reported as proven infeasibility.
  assert.equal(schedule.assignments.length, 1, 'the unit is not silently reused');
  const shortfall = schedule.violations.find((row) => row.kind === 'MULTI_RESOURCE_SHORTFALL');
  assert.equal(shortfall.state, 'UNKNOWN');
  assert.match(shortfall.text, /no established release time from an earlier assignment/);
});

// --- M. NO RETAINED TRANSIT ------------------------------------------------

test('M1 · a destination with no retained travel time is UNKNOWN, never assumed reachable', () => {
  const unreachable = period({requirementGroups: [group({destinationFacilityId: 'fac-nowhere'})]});
  const schedule = best(planOperationalPeriod({period: unreachable, resources: [engine8()]}));
  const assignment = schedule.assignments[0];
  assert.equal(assignment.window.state, 'UNKNOWN');
  assert.equal(assignment.window.arrivalAt, null);
  assert.match(assignment.window.reason, /No retained travel time to Louredo is held for Engine 8\./);
  assert.equal(schedule.globalState, 'UNKNOWN');
});

// --- N. MINIMAL SCHEDULE REPAIR --------------------------------------------

test('N1 · only the lost unit’s assignments and its downstream chain need reconsideration', () => {
  const schedule = best(soloPeriod());
  const repair = minimalScheduleRepair(schedule, {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'});
  assert.equal(repair.directlyAffected.length, 2);
  assert.equal(repair.downstreamDependent.length, 1, 'the second assignment depends on the first’s release');
  assert.equal(repair.downstreamDependent[0].relation, 'CAUSED');
  assert.deepEqual(repair.requirementsAtRisk.sort(), ['g-canaviais', 'g-louredo']);
  assert.match(repair.text, /Only Engine 8's 2 assignments and 1 downstream commitment require reconsideration/);
});

test('N2 · assignments carried by other units are untouched', () => {
  const schedule = best(plan());
  const repair = minimalScheduleRepair(schedule, {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-8'});
  assert.equal(repair.directlyAffected.length, 1);
  assert.ok(repair.untouchedSlotIds.length >= 1, 'Engine 12’s assignment is left alone');
  assert.match(repair.text, /Only Engine 8's assignment.*require[s]? reconsideration/);
  assert.doesNotMatch(repair.text, /engine-\d/, 'operator text uses the unit name, not the raw id');
});

test('N3 · a change nothing depends on requires no reconsideration', () => {
  const repair = minimalScheduleRepair(best(plan()), {kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-99'});
  assert.deepEqual(repair.directlyAffected, []);
  assert.match(repair.text, /No assignment in this schedule depends on engine-99/); // unknown id has no name to use
});

// --- O. WHAT-IF ------------------------------------------------------------

test('O1 · a perturbation is labelled, writes nothing, and mutates no input', () => {
  const input = scenario();
  const before = JSON.stringify(input);
  const result = planOperationalPeriod({...input, perturbations: [{kind: 'RESOURCE_UNAVAILABLE', subjectId: 'engine-12'}]});
  assert.equal(result.universe, 'SCENARIO');
  assert.equal(result.operationalWrites, 0);
  assert.equal(result.dispatched, false);
  assert.match(result.perturbationText, /^Under this assumption: engine-12 is unavailable\.$/);
  assert.equal(JSON.stringify(input), before, 'the caller’s records are untouched');
});

test('O2 · an unknown perturbation kind is refused rather than guessed', () => {
  assert.throws(() => planOperationalPeriod({...scenario(), perturbations: [{kind: 'MAKE_SAFE', subjectId: 'x'}]}), /perturbation_kind_unknown/);
});

// --- P. GLOBAL FEASIBILITY -------------------------------------------------

test('P1 · the period verdict is one of three states, with a stated reason', () => {
  const result = plan();
  assert.ok(['GLOBALLY_FEASIBLE', 'GLOBALLY_INFEASIBLE', 'UNKNOWN'].includes(result.globalState));
  assert.equal(result.globalState, 'GLOBALLY_FEASIBLE');
  assert.equal(best(result).violations.length, 0);
});

// --- Q. DETERMINISM --------------------------------------------------------

test('Q1 · the same canonical input produces byte-identical period plans', () => {
  const strip = (row) => JSON.stringify({...row, generationMs: null});
  assert.equal(strip(plan()), strip(plan()));
});

test('Q2 · input order does not change the schedules', () => {
  const input = scenario();
  const reversed = {period: {...input.period, requirementGroups: [...input.period.requirementGroups].reverse()},
    resources: [...input.resources].reverse()};
  const key = (result) => JSON.stringify(result.schedules.map((row) => ({id: row.id, rank: row.rank,
    assignments: row.assignments.map((a) => `${a.slotId}=${a.resourceId}`)})));
  assert.equal(key(planOperationalPeriod(reversed)), key(planOperationalPeriod(input)));
});
