import test from 'node:test';
import assert from 'node:assert/strict';
import {AT, DEADLINE_1840, ambulance4, canaviaisRequirement, engine12, engine20, engine33, engine8,
  louredoRequirement, planningScenario, staleAccessScenario} from './planning-fixture.mjs';
import {missionPlan} from '../../src/planning/mission-planning.mjs';
import {narrowCandidates, candidatesForRequirement} from '../../src/planning/feasibility.mjs';

const plan = (overrides) => missionPlan(planningScenario(overrides));
const forReq = (result, requirementId) => result.candidates[requirementId];
const of = (result, requirementId, resourceId) => forReq(result, requirementId).find((row) => row.resourceId === resourceId);

// --- A. CAPABILITY MISMATCH · nearest is not qualified ----------------------

test('A1 · the nearest resource is rejected when its retained capabilities exclude the requirement', () => {
  const result = plan();
  const ambulance = of(result, 'req-canaviais', 'ambulance-4');
  assert.equal(ambulance.state, 'INFEASIBLE');
  assert.equal(ambulance.decisiveConstraint.kind, 'CAPABILITY');
  assert.equal(ambulance.decisiveConstraint.reason, 'Retained capabilities for Ambulance 4 do not include structural_fire.');
  // Ambulance 4 sits closest to the EM527 destination and is still ruled out.
  assert.ok(!result.options.some((option) => option.assignments.some((row) => row.resourceId === 'ambulance-4')));
});

// --- N. UNKNOWN CAPABILITY · absence of a record is not a capability --------

test('N1 · a resource with no capability record is UNKNOWN, never treated as capable', () => {
  const engine = of(plan(), 'req-louredo', 'engine-20');
  assert.equal(engine.state, 'UNKNOWN');
  assert.equal(engine.decisiveConstraint.kind, 'CAPABILITY');
  assert.match(engine.decisiveConstraint.reason, /No retained record establishes whether Engine 20 has structural_fire/);
  assert.notEqual(engine.state, 'FEASIBLE');
  assert.notEqual(engine.state, 'INFEASIBLE');
  assert.ok(engine.whatWouldNeedToChange.some((row) => /A current capability record for Engine 20/.test(row.change)));
});

test('N2 · an expired capability record reverts to UNKNOWN, not to ABSENT', () => {
  const expired = engine8({capabilities: {structural_fire: {value: true, validUntil: '2026-09-15T10:00:00.000Z'}}});
  const result = plan({resources: [expired]});
  const engine = of(result, 'req-louredo', 'engine-8');
  assert.equal(engine.state, 'UNKNOWN');
  assert.match(engine.decisiveConstraint.reason, /passed its validity window, so its current capability is not established/);
});

// --- B. DEADLINE -----------------------------------------------------------

test('B1 · a resource that cannot arrive before the deadline is infeasible, one that can is feasible', () => {
  const slowOnly = louredoRequirement({id: 'req-slow', routeIds: ['route-slow']});
  const result = plan({requirements: [slowOnly, canaviaisRequirement()]});
  const slow = of(result, 'req-slow', 'engine-8');
  assert.equal(slow.state, 'INFEASIBLE');
  assert.equal(slow.decisiveConstraint.kind, 'TRAVEL_TIME');
  assert.match(slow.decisiveConstraint.reason, /is after the required 18:40/);
  assert.equal(of(result, 'req-canaviais', 'engine-8').state, 'FEASIBLE');
});

test('B2 · a feasible arrival quotes the calculated time and the route it used', () => {
  const engine = of(plan(), 'req-canaviais', 'engine-8');
  assert.equal(engine.state, 'FEASIBLE');
  assert.equal(engine.travelMinutes, 9);
  assert.match(engine.constraints.find((row) => row.kind === 'TRAVEL_TIME').reason, /Calculated arrival 18:29 using the retained route, before 18:40/);
  assert.equal(engine.access.routeId, 'route-canaviais-em527');
});

// --- D / L. PROTECTED COMMITMENT · never silently broken -------------------

test('D1 · a protected commitment makes an otherwise capable resource infeasible', () => {
  const engine = of(plan(), 'req-canaviais', 'engine-12');
  assert.equal(engine.state, 'INFEASIBLE');
  assert.equal(engine.decisiveConstraint.kind, 'PROTECTED_COMMITMENT');
  assert.match(engine.decisiveConstraint.reason, /committed to Louredo through this window and that assignment is protected/);
  assert.ok(engine.whatWouldNeedToChange.some((row) => /commander releasing Engine 12/.test(row.change)));
});

test('L1 · the geographically closer resource loses to the valid one when it is protected', () => {
  const result = plan();
  // Engine 12 sits on EM527, closer to Canaviais than Engine 8.
  assert.equal(of(result, 'req-canaviais', 'engine-12').state, 'INFEASIBLE');
  assert.ok(result.options.every((option) => !option.assignments.some((row) => row.resourceId === 'engine-12')),
    'a protected resource is never silently selected');
  assert.ok(result.options[0].assignments.some((row) => row.resourceId === 'engine-8'));
  assert.equal(result.options[0].protectedViolations, 0);
});

test('L2 · a commitment whose preemption rule is unrecorded is UNKNOWN, not assumed either way', () => {
  const unrecorded = engine8({existingAssignments: [{requirementId: 'req-other', subjectName: 'Other', from: AT, until: DEADLINE_1840, protected: null}]});
  const engine = of(plan({resources: [unrecorded]}), 'req-canaviais', 'engine-8');
  assert.equal(engine.state, 'UNKNOWN');
  assert.equal(engine.decisiveConstraint.kind, 'CURRENT_ASSIGNMENT');
  assert.match(engine.decisiveConstraint.reason, /whether it may be reassigned is not recorded/);
});

test('L3 · a reassignable commitment is feasible but records what it would displace', () => {
  const reassignable = engine8({existingAssignments: [{requirementId: 'req-other', subjectName: 'Other', from: AT, until: DEADLINE_1840, protected: false}]});
  const engine = of(plan({resources: [reassignable]}), 'req-canaviais', 'engine-8');
  assert.equal(engine.state, 'FEASIBLE');
  assert.equal(engine.displacesAssignments.length, 1);
  assert.equal(engine.displacesAssignments[0].subjectName, 'Other');
});

// --- E. STALE RESOURCE LOCATION · no invented ETA --------------------------

test('E1 · a stale resource location yields UNKNOWN and no arrival time', () => {
  const engine = of(plan({resources: [engine33()]}), 'req-canaviais', 'engine-33');
  assert.equal(engine.state, 'UNKNOWN');
  assert.equal(engine.decisiveConstraint.kind, 'TRAVEL_TIME');
  assert.match(engine.decisiveConstraint.reason, /Engine 33's location needs checking, so arrival cannot be calculated/);
  assert.equal(engine.arrival, null, 'no ETA is invented from a stale position');
});

// --- F. STALE ROAD ACCESS --------------------------------------------------

test('F1 · expired road information makes access UNKNOWN, never infeasible', () => {
  const result = missionPlan(staleAccessScenario());
  const engine = of(result, 'req-canaviais', 'engine-8');
  assert.equal(engine.state, 'UNKNOWN');
  assert.equal(engine.access.state, 'ROUTE_STALE');
  assert.equal(engine.access.age, '2h 18m');
  const access = engine.constraints.find((row) => row.kind === 'ACCESS');
  assert.equal(access.state, 'UNKNOWN');
  assert.match(access.reason, /depends on road information that needs checking \(last checked 2h 18m ago\)/);
  assert.notEqual(engine.state, 'INFEASIBLE');
});

test('F2 · no blocked or open claim is fabricated from expiry', () => {
  const engine = of(missionPlan(staleAccessScenario()), 'req-canaviais', 'engine-8');
  const text = JSON.stringify(engine.constraints.filter((row) => row.kind === 'ACCESS'));
  assert.doesNotMatch(text, /blocked|closed|is open|passable/i);
  assert.ok(engine.needsChecking.length);
});

// --- G. ALTERNATIVE ROUTE --------------------------------------------------

test('G1 · when the primary road is unavailable the retained alternative is used', () => {
  const result = missionPlan({...planningScenario(), assumptions: [{kind: 'ROAD_UNAVAILABLE', subjectId: 'EM527'}]});
  const louredo = of(result, 'req-louredo', 'engine-8');
  assert.equal(louredo.state, 'FEASIBLE');
  assert.equal(louredo.access.routeId, 'route-louredo-n114', 'falls back to the N114 route');
  assert.equal(louredo.access.usedAlternative, true);
  assert.equal(louredo.travelMinutes, 14);
  // Canaviais has only the EM527 route, so it is eliminated rather than degraded.
  const canaviais = of(result, 'req-canaviais', 'engine-8');
  assert.equal(canaviais.state, 'INFEASIBLE');
  assert.equal(canaviais.access.state, 'ROUTE_ELIMINATED');
});

// --- H. SHARED ACCESS ------------------------------------------------------

test('H1 · two separate resources routed over one road are surfaced as a shared dependency', () => {
  const shared = plan().sharedAccess;
  assert.ok(shared.shared.some((row) => row.road === 'EM527' && row.resourceCount >= 2));
  assert.ok(shared.text.some((row) => /Engine 20 and Engine 8 both depend on EM527/.test(row)));
  // Operator text uses names; raw identifiers stay in provenance only.
  assert.doesNotMatch(shared.text.join(' '), /engine-\d|ambulance-\d/);
});

// --- §20. PREFILTER SAFETY -------------------------------------------------

test('S1 · narrowing discards only definite infeasibility, never an unknown', () => {
  const resources = [engine8(), engine12(), ambulance4(), engine20(), engine33()];
  const context = {at: AT, routes: planningScenario().routes, sourceValidUntil: planningScenario().sourceValidUntil,
    sourceLastCheckedAt: planningScenario().sourceLastCheckedAt, facilityStatus: planningScenario().facilityStatus};
  const {kept, discarded, rule} = narrowCandidates(resources, louredoRequirement(), context);
  assert.equal(rule, 'DISCARD_ONLY_ON_DEFINITE_INFEASIBILITY');
  assert.ok(kept.some((row) => row.id === 'engine-20'), 'unknown capability is kept, not narrowed away');
  assert.ok(kept.some((row) => row.id === 'engine-33'), 'unknown location is kept');
  assert.deepEqual(discarded.map((row) => row.resourceId), ['ambulance-4']);
});

test('S2 · narrowing never changes a candidate outcome — proven against exhaustive evaluation', async () => {
  const {evaluateCandidate} = await import('../../src/planning/feasibility.mjs');
  const scenario = planningScenario();
  const resources = [engine8(), engine12(), ambulance4(), engine20(), engine33()];
  const context = {at: AT, routes: scenario.routes, sourceValidUntil: scenario.sourceValidUntil,
    sourceLastCheckedAt: scenario.sourceLastCheckedAt, facilityStatus: scenario.facilityStatus,
    satisfiedRequirementIds: new Set(), assignedRequirementIds: new Set()};
  const requirement = louredoRequirement();
  const narrowed = new Map(candidatesForRequirement(resources.map((row) => ({...row, capabilities: row.capabilities})), requirement, context)
    .map((row) => [row.resourceId, row.state]));
  for (const resource of resources) {
    const exhaustive = evaluateCandidate({...resource, name: resource.name, capacity: resource.capacity ?? null,
      existingAssignments: resource.existingAssignments ?? [], capabilities: resource.capabilities}, requirement, context);
    assert.equal(narrowed.get(resource.id), exhaustive.state, `${resource.id}: narrowed and exhaustive must agree`);
  }
});
