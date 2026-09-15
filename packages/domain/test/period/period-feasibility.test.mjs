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

// --- A. SEQUENTIAL ASSIGNMENT ----------------------------------------------

test('A1 · one unit serves two missions when release plus transit allows it', () => {
  const result = planOperationalPeriod({period: period(), resources: [engine8()]});
  const schedule = best(result);
  assert.equal(schedule.assignments.length, 2, 'Engine 8 covers both');
  const louredo = assignmentFor(schedule, 'g-louredo');
  const later = assignmentFor(schedule, 'g-canaviais');
  assert.equal(louredo.window.releaseAt.slice(11, 16), '18:35');
  assert.equal(later.window.departureAt.slice(11, 16), '18:35', 'the second departs on release of the first');
  assert.equal(later.window.arrivalAt.slice(11, 16), '18:47');
  assert.equal(schedule.globalState, 'GLOBALLY_FEASIBLE');
});

test('A2 · the window derives every step, not just an arrival', () => {
  const window = assignmentFor(best(plan()), 'g-louredo').window;
  assert.equal(window.departureAt.slice(11, 16), '18:00');
  assert.equal(window.travelMinutes, 10);
  assert.equal(window.arrivalAt.slice(11, 16), '18:10');
  assert.equal(window.serviceDurationMinutes, 25);
  assert.equal(window.releaseAt.slice(11, 16), '18:35');
  assert.equal(window.nextAvailableAt, window.releaseAt);
  assert.equal(window.releaseEstablished, true);
});

// --- B. IMPOSSIBLE SEQUENCE ------------------------------------------------

test('B1 · release plus transit missing the next deadline is infeasible, and says the arithmetic', () => {
  // Louredo is filled first (earlier deadline). Engine 8 is released 18:35 and
  // Canaviais is 12 min away, so the earliest possible arrival is 18:47.
  const tight = period({requirementGroups: [group(), canaviais({requiredBy: T.t1845})]});
  const result = planOperationalPeriod({period: tight, resources: [engine8()]});
  const schedule = best(result);
  assert.notEqual(schedule.globalState, 'GLOBALLY_FEASIBLE');
  // Nothing is assigned to Canaviais, because no unit could make it. The
  // shortfall carries the arithmetic that explains why.
  const violation = schedule.violations.find((row) => row.kind === 'MULTI_RESOURCE_SHORTFALL');
  assert.ok(violation, 'the impossible sequence is reported');
  assert.equal(violation.nearestMiss.nearestResourceName, 'Engine 8');
  assert.match(schedule.violations.map((row) => row.text).join(' '), /Engine 8 would arrive 18:47, after the required 18:45\./);
});

test('B2 · sequentialTransition answers in three states, never assuming the unit makes it', () => {
  const canonical = operationalPeriod(period());
  const previous = assignmentFor(best(plan()), 'g-louredo').window;
  const feasible = sequentialTransition({previous, previousGroup: group(), nextGroup: canaviais(), period: canonical});
  assert.equal(feasible.state, 'FEASIBLE');
  assert.equal(feasible.transitMinutes, 12);
  const impossible = sequentialTransition({previous, previousGroup: group(), nextGroup: canaviais({requiredBy: T.t1840}), period: canonical});
  assert.equal(impossible.state, 'INFEASIBLE');
  // No retained transit at all is UNKNOWN, not infeasible.
  const unknown = sequentialTransition({previous, previousGroup: group(), nextGroup: canaviais({destinationFacilityId: 'fac-nowhere'}), period: canonical});
  assert.equal(unknown.state, 'UNKNOWN');
  assert.match(unknown.reason, /No retained travel time between/);
});

// --- C / P. GLOBAL FEASIBILITY · locally fine, collectively impossible ------

test('C1 · two individually feasible assignments that double-book one unit are globally infeasible', () => {
  const canonical = operationalPeriod(period());
  const window = (groupId, from, until) => ({groupId, resourceId: 'engine-8', resourceName: 'Engine 8',
    state: 'FEASIBLE', departureAt: from, arrivalAt: from, serviceStartAt: from, releaseAt: until,
    nextAvailableAt: until, releaseEstablished: true, travelMinutes: 10, missesDeadline: false, reason: '', needsChecking: []});
  const assignments = [
    {groupId: 'g-louredo', slotId: 'a', subjectName: 'Louredo', resourceId: 'engine-8', resourceName: 'Engine 8', window: window('g-louredo', T.t1820, T.t1850)},
    {groupId: 'g-canaviais', slotId: 'b', subjectName: 'Canaviais', resourceId: 'engine-8', resourceName: 'Engine 8', window: window('g-canaviais', T.t1830, T.t1900)}
  ];
  const result = validateSchedule({assignments, period: canonical, resourcesById: new Map([['engine-8', engine8()]])});
  assert.equal(result.state, 'GLOBALLY_INFEASIBLE');
  const clash = result.violations.find((row) => row.kind === 'DOUBLE_BOOKING');
  assert.match(clash.text, /Engine 8 is committed to Louredo and Canaviais at the same time, from 18:30 to 18:50\./);
  // The distinction this whole layer exists for.
  assert.equal(result.locallyFeasibleButGloballyNot, true);
  assert.ok(assignments.every((row) => row.window.state === 'FEASIBLE'), 'each assignment passed on its own');
});

// --- D. MULTI-RESOURCE REQUIREMENT -----------------------------------------

test('D1 · a requirement for two appliances with one qualified unit is a shortfall, not a silent single assignment', () => {
  const two = period({requirementGroups: [group({slots: [{capability: 'structural_fire', quantity: 2}]})]});
  const schedule = best(planOperationalPeriod({period: two, resources: [engine8()]}));
  assert.equal(schedule.assignments.length, 1);
  assert.equal(schedule.globalState, 'GLOBALLY_INFEASIBLE');
  const shortfall = schedule.violations.find((row) => row.kind === 'MULTI_RESOURCE_SHORTFALL');
  assert.match(shortfall.text, /^Louredo requires 2 units; 1 qualified unit is assigned\./);
  // The shortfall explains itself rather than only counting.
  assert.match(shortfall.text, /No further retained unit with structural_fire is available/);
});

test('D2 · two appliances available fills both slots as distinct units', () => {
  const two = period({requirementGroups: [group({slots: [{capability: 'structural_fire', quantity: 2}]})]});
  const schedule = best(planOperationalPeriod({period: two, resources: [engine8(), engine12()]}));
  assert.equal(schedule.assignments.length, 2);
  assert.equal(new Set(schedule.assignments.map((row) => row.resourceId)).size, 2, 'two distinct units, not one counted twice');
  assert.equal(schedule.globalState, 'GLOBALLY_FEASIBLE');
});

// --- E. SYNCHRONIZED ARRIVAL -----------------------------------------------

test('E1 · units required together but arriving far apart breach co-arrival', () => {
  const synced = period({requirementGroups: [group({
    slots: [{capability: 'structural_fire', quantity: 1}, {capability: 'water_support', quantity: 1}],
    coArrivalWithinMinutes: 5})],
    transitMinutes: new Map([...TRANSIT(), ['station-north->fac-louredo', 10], ['station-south->fac-louredo', 40]])});
  const result = planOperationalPeriod({period: synced, resources: [engine8(), waterUnit({originFacilityId: 'station-south'})]});
  // The schedule that actually fields both units is the one co-arrival applies to.
  const schedule = result.schedules.find((row) => row.assignments.length === 2);
  assert.ok(schedule, 'a schedule fielding both units is generated');
  const breach = schedule.violations.find((row) => row.kind === 'CO_ARRIVAL');
  assert.ok(breach, 'the spread is reported');
  assert.match(breach.text, /requires its units within 5 min of each other; the retained arrivals span 30 min/);
  assert.equal(schedule.globalState, 'GLOBALLY_INFEASIBLE');
});

// --- F. RESERVE ------------------------------------------------------------

test('F1 · a plan consuming the last reserve says so in those words', () => {
  const guarded = period({reservePolicies: [{id: 'res-zone-a', capability: 'structural_fire', zoneId: 'zone-a', zoneName: 'Zone A', minimumAvailable: 1}]});
  const result = planOperationalPeriod({period: guarded, resources: [engine8(), engine12()]});
  const consuming = result.schedules.find((row) => row.reserveFindings.length);
  assert.ok(consuming, 'the schedule committing both engines is generated');
  const reserve = consuming.reserveFindings[0];
  assert.equal(reserve.available, 0);
  assert.match(reserve.text, /would consume the last retained structural fire reserve for Zone A/);
  // And the reserve-preserving schedule is preferred, with that as the reason.
  assert.equal(result.schedules[0].reserveFindings.length, 0);
  assert.ok(result.schedules[0].rank === 1);
});

test('F2 · an advisory breach reports without blocking; a blocking policy makes the plan infeasible', () => {
  const advisory = period({reservePolicies: [{id: 'r', capability: 'structural_fire', zoneId: 'zone-a', zoneName: 'Zone A', minimumAvailable: 1, enforcement: 'ADVISORY'}]});
  const lenient = planOperationalPeriod({period: advisory, resources: [engine8(), engine12()]});
  const breaching = lenient.schedules.find((row) => row.reserveFindings.length);
  assert.equal(breaching.globalState, 'GLOBALLY_FEASIBLE', 'an advisory breach reports without blocking');
  const blocking = period({reservePolicies: [{id: 'r', capability: 'structural_fire', zoneId: 'zone-a', zoneName: 'Zone A', minimumAvailable: 1, enforcement: 'BLOCKING'}]});
  const strict = planOperationalPeriod({period: blocking, resources: [engine8(), engine12()]})
    .schedules.find((row) => row.reserveFindings.length);
  assert.equal(strict.globalState, 'GLOBALLY_INFEASIBLE');
  assert.ok(strict.violations.some((row) => row.kind === 'RESERVE'));
});
