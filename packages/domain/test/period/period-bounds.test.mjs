// Bounded search, plan comparison, future capacity gaps, safety boundary and
// prune safety. Cases K-Q live in period-schedule.test.mjs.
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

// --- R. BOUNDED SEARCH -----------------------------------------------------

test('R1 · the search boundary is explicit and deterministic', () => {
  const result = plan();
  assert.match(result.searchBoundary, /bounded at \d+ deterministic candidates/);
  assert.match(result.searchBoundary, /not a search of every possible allocation/);
  assert.match(result.searchBoundary, /no candidate was discarded for looking less attractive/);
  assert.ok(result.schedules.length <= 5);
});

test('R2 · lowering the bound lowers the count and flags it', () => {
  const result = planOperationalPeriod({...scenario(), maxSchedules: 1});
  assert.equal(result.schedules.length, 1);
  assert.equal(result.bounded, true);
});

// --- S. PLAN COMPARISON ----------------------------------------------------

test('S1 · schedules are ordered by named factors with an explicit explanation', () => {
  const guarded = period({reservePolicies: [{id: 'r', capability: 'structural_fire', zoneId: 'zone-a', zoneName: 'Zone A', minimumAvailable: 1}]});
  const result = planOperationalPeriod({period: guarded, resources: [engine8(), engine12()]});
  const second = result.schedules.find((row) => row.rank === 2);
  assert.ok(second.comparedWithAbove.decidedBy, 'the deciding factor is named');
  assert.match(second.comparedWithAbove.text, /is shown before|are equivalent on every ordering factor/);
  assert.doesNotMatch(JSON.stringify(result.schedules), /"score"|priorityScore|confidence|\d+%/i);
});

test('S2 · reserve and protected commitments outrank travel time', () => {
  const preserving = {id: 'a', label: 'A', globalRank: 0, protectedViolations: 0, hardDeadlinesUnsupported: 0, reserveBreaches: 0, unsupportedGroups: 0, unknownCount: 0, totalTravelMinutes: 90};
  const faster = {id: 'b', label: 'B', globalRank: 0, protectedViolations: 0, hardDeadlinesUnsupported: 0, reserveBreaches: 1, unsupportedGroups: 0, unknownCount: 0, totalTravelMinutes: 10};
  const decision = compareSchedules(preserving, faster);
  assert.ok(decision.order < 0, 'keeping reserve beats being faster');
  assert.equal(decision.factor, 'reserveBreaches');
  assert.match(decision.aheadBecause, /maintains required reserve/);
});

// --- T. FUTURE CAPACITY GAP ------------------------------------------------

test('T1 · a future interval with no uncommitted capability is identified, without predicting an event', () => {
  const result = plan();
  const gap = result.futureCapacityGaps[0];
  assert.ok(gap, 'both engines committed from 18:00 leaves no uncommitted unit');
  assert.equal(gap.capability, 'structural_fire');
  assert.match(gap.text, /the retained plan has no uncommitted structural fire resource/);
  assert.match(gap.consequence, /would have no retained qualified resource/);
  // It describes the plan, not the future.
  assert.match(result.gapBoundary, /not a forecast/);
  assert.doesNotMatch(JSON.stringify(result.futureCapacityGaps), /likely|probably|expected to|will occur/i);
});

// --- SAFETY BOUNDARY -------------------------------------------------------

test('U1 · the period planner proposes and never acts', () => {
  const result = plan();
  assert.equal(result.advisory, true);
  assert.equal(result.dispatched, false);
  assert.equal(result.operationalWrites, 0);
  assert.equal(result.modelUsed, false);
  assert.match(result.boundary, /VIGIA proposes; a commander decides/);
  assert.doesNotMatch(JSON.stringify(result), /"approved"|dispatchedAt|"ordered":true|commandApproved/i);
});

test('U2 · the period is bounded, and an unbounded one is refused', () => {
  const result = plan();
  assert.equal(result.startsAt, PERIOD_START);
  assert.ok(result.endsAt);
  assert.throws(() => planOperationalPeriod({period: {id: 'p', startsAt: PERIOD_START}, resources: []}), /period_bounds_required/);
  assert.throws(() => planOperationalPeriod({period: {id: 'p', startsAt: T.t1900, endsAt: T.t1800}, resources: []}), /period_end_must_follow_start/);
});

// --- V. PRUNE SAFETY -------------------------------------------------------

test('V1 · the availability prune never removes a unit that could have qualified', () => {
  // A unit free only after the deadline cannot arrive before it; pruning it is
  // exactly what full evaluation concludes.
  const late = engine12({availability: {from: T.t1900, until: '2026-09-15T22:00:00.000Z'}});
  const result = planOperationalPeriod({period: period({requirementGroups: [group()]}), resources: [late]});
  const schedule = best(result);
  assert.equal(schedule.assignments.length, 0);
  const shortfall = schedule.violations.find((row) => row.kind === 'MULTI_RESOURCE_SHORTFALL');
  assert.ok(shortfall, 'the shortfall is still reported rather than the unit vanishing silently');
  // A unit free before the deadline is kept and assigned.
  const early = engine12({availability: {from: PERIOD_START, until: '2026-09-15T22:00:00.000Z'}});
  assert.equal(best(planOperationalPeriod({period: period({requirementGroups: [group()]}), resources: [early]})).assignments.length, 1);
});
