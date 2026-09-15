// Multi-incident contention, mutual aid, capacity and coupled requirements.
// Cases A-F live in period-feasibility.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PERIOD_END, PERIOD_START, T, TRANSIT, aidUnit4, canaviais, engine12, engine8, group, period, scenario, waterUnit} from './period-fixture.mjs';
import {planOperationalPeriod} from '../../src/period/period-planning.mjs';
import {assignmentWindow, sequentialTransition} from '../../src/period/assignment-window.mjs';
import {operationalPeriod} from '../../src/period/operational-period.mjs';
import {validateSchedule} from '../../src/period/global-validation.mjs';

const plan = (overrides) => planOperationalPeriod(scenario(overrides));
const best = (result) => result.schedules[0];
const assignmentFor = (schedule, groupId) => schedule.assignments.find((row) => row.groupId === groupId);

// --- G. MULTI-INCIDENT CONTENTION ------------------------------------------

test('G1 · two incidents drawing on one pool are both represented, with no opaque severity ranking', () => {
  const result = plan();
  const schedule = best(result);
  assert.equal(result.counts.incidents, 2);
  assert.deepEqual([...new Set(schedule.assignments.map((row) => row.incidentId))].sort(), ['incident-a', 'incident-b']);
  // Nothing anywhere ranks one incident above another by a score.
  assert.doesNotMatch(JSON.stringify(result), /severity|priorityScore|"score"|urgencyRank/i);
});

// --- H. MUTUAL AID ---------------------------------------------------------

test('H1 · requested but unconfirmed aid is not counted as available', () => {
  const two = period({requirementGroups: [group({slots: [{capability: 'structural_fire', quantity: 2}]})]});
  const schedule = best(planOperationalPeriod({period: two, resources: [engine8(), aidUnit4()]}));
  const aid = schedule.assignments.find((row) => row.resourceId === 'aid-4');
  assert.ok(aid, 'it remains a candidate rather than being ruled out');
  assert.equal(aid.mutualAid.usable, false);
  assert.equal(aid.mutualAid.state, 'REQUESTED');
  assert.match(aid.mutualAid.reason, /has been requested from Montemor district but is not confirmed, so it is not counted as available/);
  assert.ok(schedule.unknownCount > 0, 'the plan is not presented as confirmed');
});

test('H2 · confirmed aid is usable and stops being an unknown', () => {
  const two = period({requirementGroups: [group({slots: [{capability: 'structural_fire', quantity: 2}]})]});
  const schedule = best(planOperationalPeriod({period: two, resources: [engine8(), aidUnit4({mutualAid: {state: 'CONFIRMED', provider: 'Montemor district'}})]}));
  const aid = schedule.assignments.find((row) => row.resourceId === 'aid-4');
  assert.equal(aid.mutualAid.usable, true);
  assert.equal(schedule.globalState, 'GLOBALLY_FEASIBLE');
});

test('H3 · a reserve count never rests on unconfirmed aid', () => {
  const guarded = period({reservePolicies: [{id: 'r', capability: 'structural_fire', zoneId: 'zone-a', zoneName: 'Zone A', minimumAvailable: 1}]});
  const result = planOperationalPeriod({period: guarded, resources: [engine8(), aidUnit4()]});
  assert.ok(result.schedules.some((row) => row.reserveFindings.length),
    'unconfirmed aid does not hold the reserve open');
});

// --- I. AGGREGATE CAPACITY -------------------------------------------------

test('I1 · insufficient aggregate capacity across assigned units is reported by dimension', () => {
  const thirsty = period({requirementGroups: [group({aggregateCapacity: {water_litres: 5000}})]});
  const schedule = best(planOperationalPeriod({period: thirsty, resources: [engine8()]}));
  const shortfall = schedule.violations.find((row) => row.kind === 'AGGREGATE_CAPACITY');
  assert.equal(shortfall.text, 'Louredo requires 5000 water_litres; the assigned units provide 2000.');
  assert.equal(schedule.globalState, 'GLOBALLY_INFEASIBLE');
});

test('I2 · an unretained capacity dimension is UNKNOWN, not zero', () => {
  const thirsty = period({requirementGroups: [group({aggregateCapacity: {foam_litres: 100}})]});
  const schedule = best(planOperationalPeriod({period: thirsty, resources: [engine8()]}));
  const row = schedule.violations.find((item) => item.kind === 'AGGREGATE_CAPACITY');
  assert.equal(row.state, 'UNKNOWN');
  assert.match(row.text, /foam_litres capacity is not retained for every unit/);
  assert.equal(schedule.globalState, 'UNKNOWN');
});

// --- J. COUPLED REQUIREMENT ------------------------------------------------

test('J1 · a downstream operation with no supported prerequisite is infeasible', () => {
  const coupled = period({requirementGroups: [
    group({id: 'g-reception', subjectName: 'Reception', slots: [{capability: 'reception_capacity', quantity: 1}]}),
    canaviais({requiresSupportedFirst: ['g-reception']})]});
  const schedule = best(planOperationalPeriod({period: coupled, resources: [engine8()]}));
  const violation = schedule.violations.find((row) => row.kind === 'COUPLED_REQUIREMENT');
  assert.ok(violation, 'the coupling is enforced');
  // Engine 8 has no reception_capacity record, so the prerequisite is not
  // established and the downstream operation is unresolved rather than approved.
  assert.equal(violation.state, 'UNKNOWN');
  assert.match(violation.text, /cannot begin before g-reception is supported, and the unit assigned to it has no established capability/);
  assert.equal(schedule.globalState, 'UNKNOWN');
  // With nothing at all on the prerequisite, it is infeasible outright.
  const bare = best(planOperationalPeriod({period: period({requirementGroups: [canaviais({requiresSupportedFirst: ['g-reception']})]}), resources: [engine8()]}));
  const hard = bare.violations.find((row) => row.kind === 'COUPLED_REQUIREMENT');
  assert.equal(hard.state, 'INFEASIBLE');
  assert.match(hard.text, /no unit is assigned to it/);
});
