import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CRISIS_AUTOPILOT_TRIGGER_TYPES,
  projectCrisisAutopilot,
} from '../src/crisis-autopilot/index.mjs';

const at = '2026-09-04T12:00:00.000Z';
const emptyDecisionPacket = { decisions: { results: [] }, acquisitionPlan: { items: [] } };

test('living incident twin selects historical revisions and excludes records that did not exist at as-of', () => {
  const projection = projectCrisisAutopilot({
    asOf: at,
    incident: {
      id: 'fire:one',
      observations: [
        { id: 'thermal:past', type: 'THERMAL', observedAt: '2026-09-04T11:55:00Z' },
        { id: 'thermal:future', type: 'THERMAL', observedAt: '2026-09-04T12:05:00Z' },
      ],
    },
    incidentTwin: {
      terrain: { revisions: [
        { revision: 1, elevationM: 410, recordedAt: '2026-09-04T11:00:00Z' },
        { revision: 2, elevationM: 999, recordedAt: '2026-09-04T12:10:00Z' },
      ] },
      timeline: [
        { id: 'timeline:past', recordedAt: '2026-09-04T11:30:00Z' },
        { id: 'timeline:future', recordedAt: '2026-09-04T12:30:00Z' },
      ],
    },
    outcomes: [
      { id: 'outcome:past', observedAt: '2026-09-04T11:59:00Z', state: 'PARTIAL' },
      { id: 'outcome:future', observedAt: '2026-09-04T12:01:00Z', state: 'SUCCESS' },
    ],
    triggers: [
      { id: 'trigger:past', type: 'NEW_THERMAL_DETECTION', observedAt: '2026-09-04T11:55:00Z' },
      { id: 'trigger:future', type: 'NEW_THERMAL_DETECTION', observedAt: '2026-09-04T12:05:00Z' },
    ],
    intelligence: { unknowns: [] },
    decisionPacket: emptyDecisionPacket,
  });
  assert.deepEqual(projection.livingTwin.thermal.value.map((item) => item.id), ['thermal:past']);
  assert.equal(projection.livingTwin.terrain.value.elevationM, 410);
  assert.equal(projection.livingTwin.terrain.temporal.historyEvaluated, true);
  assert.deepEqual(projection.livingTwin.timeline.value.map((item) => item.id), ['timeline:past']);
  assert.deepEqual(projection.livingTwin.outcomes.value.map((item) => item.id), ['outcome:past']);
  assert.ok(projection.livingTwin.temporalIntegrity.excludedFutureCount >= 4);
  assert.equal(projection.autopilot.counts.futureTriggersExcluded, 1);
  assert.deepEqual(projection.autopilot.triggers.map((item) => item.triggerId), ['trigger:past']);
});

test('projection is incident-scoped and rejects ungoverned trigger types', () => {
  const base = { asOf: at, incident: { id: 'fire:one' }, intelligence: { unknowns: [] }, decisionPacket: emptyDecisionPacket };
  const projected = projectCrisisAutopilot({ ...base, collectionTasks: [{ id: 'own', incidentId: 'fire:one', state: 'IN_PROGRESS' }, { id: 'other', incidentId: 'fire:other', state: 'IN_PROGRESS' }] });
  assert.deepEqual(projected.autopilot.doingNow[0].backingObjectIds, ['own']);
  assert.throws(() => projectCrisisAutopilot({ ...base, triggers: [{ type: 'MODEL_SAYS_FIRE' }] }), /trigger_type_invalid/);
  assert.ok(CRISIS_AUTOPILOT_TRIGGER_TYPES.includes('FIELD_OBSERVATION'));
  const prefixed = projectCrisisAutopilot({ ...base, incident: { id: 'incident:one' }, collectionTasks: [{ id: 'prefixed', incidentId: 'incident:one', state: 'IN_PROGRESS' }] });
  assert.deepEqual(prefixed.autopilot.doingNow[0].backingObjectIds, ['prefixed']);
  const nested = projectCrisisAutopilot({ ...base, informationRequirements: [{ id: 'requirement:nested', incidentId: 'fire:one', collectionTasks: [{ id: 'task:nested', state: 'SCHEDULED', owner: 'resolver', provider: 'source', nextCheckAt: '2026-09-04T12:10:00Z' }, { id: 'task:accepted', state: 'ACCEPTED' }] }] });
  assert.deepEqual(nested.autopilot.doingNow.map((item) => item.backingObjectIds[0]), ['task:nested']);
});

test('future scheduled, retrying, and waiting source lifecycles are active machine work with attributable checks', () => {
  const states = ['SCHEDULED', 'RETRYING', 'WAITING_FOR_OPPORTUNITY', 'WAITING_FOR_SCHEDULED_OBSERVATION', 'WAITING_FOR_OBSERVATION'];
  const unknowns = states.map((state, index) => ({ id: `unknown:lifecycle:${index}`, whatIsUnknown: `Source result ${index}`, classification: 'DECISION_BLOCKING' }));
  const collectionTasks = states.map((state, index) => ({
    id: `task:lifecycle:${index}`,
    incidentId: 'fire:one',
    requirementId: unknowns[index].id,
    state,
    ownerId: `resolver:${index}`,
    sourceId: `source:${index}`,
    lastCheckedAt: '2026-09-04T11:55:00.000Z',
    nextCheckAt: `2026-09-04T12:${String(10 + index).padStart(2, '0')}:00.000Z`,
  }));
  const projected = projectCrisisAutopilot({ asOf: at, incident: { id: 'fire:one' }, intelligence: { unknowns }, decisionPacket: emptyDecisionPacket, collectionTasks });
  assert.equal(projected.autopilot.doingNow.length, states.length);
  assert.deepEqual(new Set(projected.autopilot.doingNow.map((item) => item.state)), new Set(states));
  assert.equal(projected.autopilot.doingNow.every((item) => item.lifecycle.classification === 'ACTIVE_SCHEDULE_BOUND' && item.lifecycle.nextCheckTiming === 'FUTURE'), true);
  const machineWork = projected.decisionCompression.machineWork.filter((item) => item.type === 'COLLECTION');
  assert.equal(machineWork.length, states.length);
  assert.equal(machineWork.every((item) => item.owner && item.source && item.lastCheckedAt && item.nextCheckAt && item.lifecycle.activeMachineWork), true);
  assert.equal(projected.uncertaintyBudget.items.every((item) => item.state === 'UNKNOWN_BEING_COLLECTED' && item.activeCollection === true && item.backingWorkLifecycle.activeMachineWork === true), true);
});

test('a pending canonical recompute is visible only when backed by its durable lifecycle receipt', () => {
  const projected = projectCrisisAutopilot({
    asOf: at,
    incident: { id: 'fire:one' },
    intelligence: { unknowns: [] },
    decisionPacket: emptyDecisionPacket,
    collectionTasks: [{
      id: 'recompute:truth', incidentId: 'fire:one', state: 'REFRESH_REQUESTED', actionType: 'RECOMPUTE_INCIDENT_TRUTH',
      owner: 'VIGIA_CANONICAL_PROJECTION_SERVICE', source: 'nasa-firms', lastCheckedAt: at, nextCheckAt: at,
      receipt: { receiptId: 'autopilot-receipt:one' }, unlockCondition: 'A fresh governed projection is materialized.',
    }],
  });
  assert.equal(projected.autopilot.doingNow.length, 1);
  assert.equal(projected.autopilot.doingNow[0].state, 'REFRESH_REQUESTED');
  assert.deepEqual(projected.autopilot.doingNow[0].backingObjectIds, ['recompute:truth']);
  assert.equal(projected.autopilot.doingNow[0].lifecycle.classification, 'ACTIVE_EXECUTION');
  assert.equal(projected.autopilot.doingNow[0].truthEffect, 'WORK_LIFECYCLE_ONLY');
});

test('a blocked governed collection plan backs its unknown without claiming active collection', () => {
  const requirementId = 'unknown:blocked-governed-plan';
  const projected = projectCrisisAutopilot({
    asOf: at,
    incident: { id: 'fire:one' },
    intelligence: { unknowns: [{ id: requirementId, whatIsUnknown: 'Whether a qualifying independent observation covers the incident', classification: 'DECISION_BLOCKING', strongerClaimBlocked: 'INCIDENT_REVALIDATION' }] },
    decisionPacket: emptyDecisionPacket,
    informationRequirements: [{
      id: requirementId,
      incidentId: 'fire:one',
      question: 'Obtain one incident-matched independent observation.',
      collectionPlan: { id: 'plan:blocked', state: 'ACTIVE' },
      collectionTasks: [{
        id: 'task:blocked-real', state: 'NO_COVERAGE', strategyId: 'GOVERNED_SOURCE_ASSOCIATION', ownerId: 'resolver:source-coverage',
        provider: { id: 'provider:physical', label: 'Governed physical source' }, lastAttempt: '2026-09-04T11:55:00.000Z', nextAttempt: '2026-09-04T12:30:00.000Z',
        receipt: { state: 'NO_QUALIFYING_EVIDENCE', checkedAt: '2026-09-04T11:55:00.000Z' },
      }],
    }],
  });
  const unknown = projected.uncertaintyBudget.items.find((item) => item.id === requirementId);
  assert.equal(unknown.state, 'UNKNOWN_BLOCKING_ACTION');
  assert.equal(unknown.activeCollection, false);
  assert.equal(unknown.backingWorkId, 'task:blocked-real');
  assert.equal(unknown.backingWorkState, 'NO_COVERAGE');
  assert.equal(unknown.owner, 'resolver:source-coverage');
  assert.equal(unknown.source, 'Governed physical source');
  assert.equal(unknown.lastCheckedAt, '2026-09-04T11:55:00.000Z');
  assert.equal(unknown.nextCheckAt, '2026-09-04T12:30:00.000Z');
  assert.equal(unknown.nextStep, 'REVIEW_BLOCKED_GOVERNED_COLLECTION');
  assert.equal(unknown.backingWorkLifecycle.classification, 'BLOCKED_GOVERNED_PLAN');
  assert.equal(unknown.backingWorkLifecycle.activeMachineWork, false);
  assert.deepEqual(projected.autopilot.doingNow, []);
  assert.deepEqual(projected.decisionCompression.machineWork, []);
  assert.deepEqual(projected.autopilot.nextActions.map((item) => item.actionType), ['REVIEW_BLOCKED_GOVERNED_COLLECTION']);
  assert.equal(projected.autopilot.nextActions[0].backingWorkId, 'task:blocked-real');
  assert.equal(projected.autopilot.nextActions[0].canonicalTruthMutation, false);
  assert.equal(projected.autopilot.nextActions[0].consequentialExecution, false);
});

test('expired scheduled work remains governed backing work but is not active machine work', () => {
  const projected = projectCrisisAutopilot({
    asOf: at,
    incident: { id: 'fire:one' },
    intelligence: { unknowns: [{ id: 'unknown:overdue', classification: 'DECISION_BLOCKING' }] },
    decisionPacket: emptyDecisionPacket,
    collectionTasks: [{
      id: 'task:overdue', incidentId: 'fire:one', requirementId: 'unknown:overdue', state: 'SCHEDULED',
      ownerId: 'resolver:one', sourceId: 'source:one', lastCheckedAt: '2026-09-04T11:30:00.000Z', nextCheckAt: '2026-09-04T11:59:00.000Z',
    }],
  });
  const unknown = projected.uncertaintyBudget.items[0];
  assert.equal(unknown.state, 'UNKNOWN_BLOCKING_ACTION');
  assert.equal(unknown.backingWorkId, 'task:overdue');
  assert.equal(unknown.activeCollection, false);
  assert.equal(unknown.backingWorkLifecycle.classification, 'SCHEDULE_DUE_REVIEW');
  assert.equal(unknown.nextStep, 'REVIEW_DUE_COLLECTION_LIFECYCLE');
  assert.equal(projected.autopilot.doingNow.length, 0);
  assert.equal(projected.decisionCompression.machineWork.length, 0);
  assert.deepEqual(projected.autopilot.nextActions.map((item) => item.actionType), ['REVIEW_DUE_COLLECTION_LIFECYCLE']);
  assert.equal(projected.autopilot.nextActions[0].backingWorkId, 'task:overdue');
  assert.equal(projected.autopilot.nextActions[0].canonicalTruthMutation, false);
  assert.equal(projected.autopilot.nextActions[0].consequentialExecution, false);
});
