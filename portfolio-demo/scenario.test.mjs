import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoSession, DEMO_ACTIONS, DEMO_LABEL} from './scenario.mjs';

// Runtime timings are measurements, not deterministic decision output.
const decisions = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'generationMs' ? undefined : item));

test('EM527 changes both services; only healthcare retains another route', () => {
  const session = createDemoSession();
  assert.equal(session.snapshot().current.consequences.total, 0);
  const snapshot = session.apply('block-road');
  assert.equal(snapshot.current.consequences.total, 1);
  const [fire, health] = snapshot.current.consequences.consequences[0].serviceImpacts;
  assert.equal(fire.serviceId, 'fire_response');
  assert.equal(fire.remainingOptionCount, 0);
  assert.equal(health.serviceId, 'emergency_hospital');
  assert.equal(health.remainingOptionCount, 1);
  assert.equal(health.remainingOption.minutes, 24);
  assert.ok(snapshot.transition.missionTransitions.every(row => row.relation === 'CAUSED'));
  assert.equal(snapshot.planning.counts.feasible, 0);
});

test('expired information becomes unknown, not an assertion that the road reopened', () => {
  const session = createDemoSession();
  session.apply('block-road');
  const snapshot = session.apply('age-road-information');
  assert.ok(snapshot.current.missions.every(row => row.state === 'UNKNOWN'));
  assert.ok(snapshot.current.consequences.consequences.every(row => row.state === 'NEEDS_RECHECK'));
  assert.equal(snapshot.planning.counts.feasible, 0);
  assert.ok(snapshot.planning.counts.unknown > 0);
});

test('resource delay is evaluated by XIII without pretending road changes alter its schedule', () => {
  const session = createDemoSession();
  const initial = session.snapshot();
  const blocked = session.apply('block-road');
  assert.deepEqual(decisions(blocked.period), decisions(initial.period));
  const delayed = session.apply('delay-resource');
  assert.notDeepEqual(decisions(delayed.period.schedules), decisions(initial.period.schedules));
  assert.deepEqual(delayed.period.perturbations, [{kind: 'RESOURCE_DELAYED', subjectId: 'demo-engine-8', delayMinutes: 60}]);
  for (const result of [delayed.planning, delayed.period]) {
    assert.equal(result.advisory, true);
    assert.equal(result.dispatched, false);
    assert.equal(result.operationalWrites, 0);
    assert.equal(result.modelUsed, false);
  }
});

test('sessions are independent and reset restores all decision inputs', () => {
  const a = createDemoSession();
  const b = createDemoSession();
  const initial = decisions(a.snapshot());
  a.apply('block-road');
  a.apply('age-road-information');
  a.apply('delay-resource');
  assert.deepEqual(decisions(b.snapshot()), initial);
  assert.deepEqual(decisions(a.apply('reset')), initial);
});

test('mutating returned snapshots cannot mutate scenario state or geometry', () => {
  const session = createDemoSession();
  const snapshot = session.snapshot();
  snapshot.facts.catalog[0].services[0].routes[0].geometry.coordinates[0][0] = 99;
  snapshot.state.blocked = true;
  snapshot.facts.missions.length = 0;
  const next = session.snapshot();
  assert.equal(next.state.blocked, false);
  assert.equal(next.facts.missions.length, 2);
  assert.equal(next.facts.catalog[0].services[0].routes[0].geometry.coordinates[0][0], -7.91);
});

test('unknown commands cannot dispatch, inject data, or change the session', () => {
  const session = createDemoSession();
  const initial = decisions(session.snapshot());
  for (const action of ['dispatch', '__proto__', '../backend', null, {kind: 'block-road'}]) {
    assert.throws(() => session.apply(action), /Unknown demo action/);
    assert.deepEqual(decisions(session.snapshot()), initial);
  }
});

test('all pairs of supported actions preserve the synthetic and no-write boundary', () => {
  for (const first of DEMO_ACTIONS) for (const second of DEMO_ACTIONS) {
    const a = createDemoSession();
    const b = createDemoSession();
    a.apply(first);
    b.apply(first);
    const snapshot = a.apply(second);
    assert.deepEqual(decisions(snapshot), decisions(b.apply(second)));
    assert.equal(snapshot.synthetic, true);
    assert.equal(snapshot.label, DEMO_LABEL);
    assert.equal(snapshot.planning.operationalWrites, 0);
    assert.equal(snapshot.period.operationalWrites, 0);
    assert.ok(snapshot.facts.reports.every(row => row.senderName === 'Demo team'));
  }
});
