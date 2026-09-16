import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CrisisAutopilotCoordinator,
  canonicalAutopilotTriggersForOperationalEvent,
  crisisAutopilotTriggerTypeForOperationalEvent,
} from '../src/modules/operator/crisis-autopilot-coordinator.mjs';

const now = new Date('2026-09-04T12:00:00.000Z');
const event = {
  id: 'operational-event:thermal-one',
  eventType: 'wildfire.thermal_observation',
  provider: { adapterId: 'nasa-firms', providerRevision: 'revision-7' },
  source: { sourceId: 'nasa-firms' },
  clocks: { observedAt: '2026-09-04T11:59:00.000Z' },
  correlationKeys: ['incident:one'],
  payloadHash: 'payload-hash-one',
};

function repository() {
  let state = {};
  return {
    snapshot: () => structuredClone(state),
    mutate: async (mutator) => { state = await mutator(structuredClone(state)); return structuredClone(state); },
  };
}

test('coordinator consumes one canonical trigger exactly once and persists only safe lifecycle work', async () => {
  const store = repository();
  let refreshes = 0;
  let invalidations = 0;
  const coordinator = new CrisisAutopilotCoordinator({
    repository: store,
    canonicalEventResolver: async ({ eventId }) => eventId === event.id ? event : null,
    clock: () => now,
    projectionRefresher: async () => ({ projectionHash: `canonical-governed-operator-twin:sha256:${'a'.repeat(64)}` }),
  });
  coordinator.setProjectionRefresher(async () => { refreshes += 1; return { projectionHash: `canonical-governed-operator-twin:sha256:${'a'.repeat(64)}` }; });
  coordinator.setProjectionInvalidator(async () => { invalidations += 1; });
  const [trigger] = canonicalAutopilotTriggersForOperationalEvent(event);
  const proposedActions = [
    { actionType: 'CREATE_OR_UPDATE_INFORMATION_REQUIREMENT', incidentId: 'incident:one', causeId: 'unknown:thermal-confirmation', unknownId: 'unknown:thermal-confirmation', question: 'Is the thermal observation attributable to an active wildfire?', unlockCondition: 'Accepted attributable evidence resolves the linked unknown.' },
    { actionType: 'CREATE_OR_UPDATE_COLLECTION_TASK', incidentId: 'incident:one', causeId: 'candidate:independent-source', candidateId: 'candidate:independent-source', question: 'Acquire an independent source family.', source: 'canonical-source-resolution-router' },
    { actionType: 'REPLAN_OPERATIONS', incidentId: 'incident:one', causeId: event.id },
  ];
  const first = await coordinator.consume(trigger, { proposedActions });
  assert.equal(first.state, 'APPLIED');
  assert.equal(first.canonicalProjection.state, 'REFRESHED');
  assert.equal(first.safeMutationCount, 4);
  assert.equal(first.authorityGatedCount, 1);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 1);
  const snapshot = coordinator.snapshot('incident:one');
  assert.equal(snapshot.informationRequirements.length, 1);
  assert.equal(snapshot.collectionTasks.length, 1);
  assert.equal(snapshot.recomputeActions.length, 2);
  assert.equal(snapshot.recomputeActions.every((item) => item.state === 'COMPLETED'), true);
  assert.equal(snapshot.authorityProposals.length, 1);
  assert.equal(snapshot.authorityProposals[0].mutationsExecuted, false);
  assert.equal(snapshot.collectionTasks[0].state, 'REQUESTED');
  assert.equal(snapshot.collectionTasks[0].owner, 'VIGIA_SOURCE_RESOLUTION_SCHEDULER');
  assert.equal(snapshot.collectionTasks[0].nextCheckAt, '2026-09-04T12:05:00.000Z');
  assert.equal(snapshot.collectionTasks[0].escalation.state, 'NOT_DUE');

  const replay = await coordinator.consume(trigger, { proposedActions });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 1);
  assert.equal(coordinator.snapshot('incident:one').receipts.length, 1);
});

test('coordinator rejects forged revision, incident, and trigger type before mutation', async () => {
  const store = repository(), coordinator = new CrisisAutopilotCoordinator({ repository: store, canonicalEventResolver: async () => event, clock: () => now });
  const [trigger] = canonicalAutopilotTriggersForOperationalEvent(event);
  for (const forged of [
    { ...trigger, revision: 'revision-forged' },
    { ...trigger, incidentId: 'incident:other' },
    { ...trigger, triggerType: 'NEW_OFFICIAL_REPORT' },
  ]) await assert.rejects(() => coordinator.consume(forged), (error) => error.statusCode === 409 && error.message === 'crisis_autopilot_canonical_trigger_binding_mismatch');
  assert.equal(coordinator.snapshot().receipts.length, 0);
});

test('operational event mapping ignores unscoped or unsupported events', () => {
  const expected = {
    'wildfire.thermal_observation': 'NEW_THERMAL_DETECTION',
    'wildfire.official_alert': 'NEW_OFFICIAL_REPORT',
    'wildfire.official_alert_cancelled': 'NEW_OFFICIAL_REPORT',
    'wildfire.official_observation': 'NEW_OFFICIAL_REPORT',
    'wildfire.public_report': 'NEW_FIELD_REPORT',
    'wildfire.field_observation': 'FIELD_OBSERVATION',
    'wildfire.causal_source_family_added': 'NEW_CAUSAL_SOURCE_FAMILY',
    'wildfire.weather_context': 'WEATHER_CHANGED',
    'wildfire.geometry_changed': 'GEOMETRY_CHANGED',
    'wildfire.priority_changed': 'PRIORITY_CHANGED',
    'wildfire.source_conflict': 'SOURCE_CONFLICT',
    'wildfire.road_closure': 'ROAD_CLOSURE',
    'wildfire.resource_acknowledged': 'RESOURCE_ACKNOWLEDGED',
    'wildfire.protection_threshold_reached': 'PROTECTION_THRESHOLD_REACHED',
  };
  for (const [eventType, triggerType] of Object.entries(expected)) assert.equal(crisisAutopilotTriggerTypeForOperationalEvent({ eventType }), triggerType);
  assert.deepEqual(canonicalAutopilotTriggersForOperationalEvent({ ...event, correlationKeys: [] }), []);
  assert.deepEqual(canonicalAutopilotTriggersForOperationalEvent({ ...event, eventType: 'wildfire.compatibility_incident_projection' }), []);
});

test('projection refresh failure is durable, schedule-bound, and succeeds after restart without duplicating work', async () => {
  const store = repository();
  let current = new Date(now), refreshes = 0;
  const resolver = async () => event;
  const firstProcess = new CrisisAutopilotCoordinator({
    repository: store, canonicalEventResolver: resolver, clock: () => current, retryBaseMs: 1_000,
    projectionRefresher: async () => { refreshes += 1; throw new Error('injected_projection_failure'); },
  });
  const [trigger] = canonicalAutopilotTriggersForOperationalEvent(event);
  const failed = await firstProcess.consume(trigger);
  assert.equal(failed.state, 'PERSISTED_REFRESH_PENDING');
  assert.equal(failed.canonicalProjection.attemptCount, 1);
  assert.equal(failed.canonicalProjection.reason, 'injected_projection_failure');
  assert.equal(failed.canonicalProjection.nextRetryAt, '2026-09-04T12:00:01.000Z');
  const early = await firstProcess.consume(trigger);
  assert.equal(early.idempotentReplay, true);
  assert.equal(early.canonicalProjection.attemptCount, 1);
  assert.equal(refreshes, 1);

  current = new Date('2026-09-04T12:00:02.000Z');
  const restarted = new CrisisAutopilotCoordinator({
    repository: store, canonicalEventResolver: resolver, clock: () => current, retryBaseMs: 1_000,
    projectionRefresher: async () => { refreshes += 1; return { projectionHash: `canonical-governed-operator-twin:sha256:${'b'.repeat(64)}` }; },
  });
  const retry = await restarted.retryPending();
  assert.equal(retry.attempted, 1);
  const applied = restarted.snapshot('incident:one').receipts[0];
  assert.equal(applied.state, 'APPLIED');
  assert.equal(applied.canonicalProjection.attemptCount, 2);
  assert.equal(applied.notification.state, 'DELIVERED');
  assert.equal(restarted.snapshot('incident:one').recomputeActions.every((item) => item.state === 'COMPLETED'), true);
  assert.equal(restarted.snapshot('incident:one').receipts.length, 1);
  assert.equal(refreshes, 2);
});

test('canonical resolution failure creates a durable retry lifecycle and later binds the exact event revision', async () => {
  const store = repository();
  let current = new Date(now), resolverReady = false;
  const firstProcess = new CrisisAutopilotCoordinator({
    repository: store, clock: () => current, retryBaseMs: 1_000,
    canonicalEventResolver: async () => { if (!resolverReady) throw new Error('canonical_store_temporarily_unavailable'); return event; },
    projectionRefresher: async () => ({ projectionHash: `canonical-governed-operator-twin:sha256:${'c'.repeat(64)}` }),
  });
  const result = await firstProcess.consumeOperationalEvent(event);
  assert.equal(result[0].state, 'RETRY_SCHEDULED');
  assert.equal(firstProcess.snapshot('incident:one').coordinationFailures[0].reason, 'canonical_store_temporarily_unavailable');
  assert.equal(firstProcess.snapshot('incident:one').receipts.length, 0);

  current = new Date('2026-09-04T12:00:02.000Z'); resolverReady = true;
  const restarted = new CrisisAutopilotCoordinator({
    repository: store, clock: () => current, retryBaseMs: 1_000,
    canonicalEventResolver: async () => event,
    projectionRefresher: async () => ({ projectionHash: `canonical-governed-operator-twin:sha256:${'c'.repeat(64)}` }),
  });
  await restarted.retryPending();
  const snapshot = restarted.snapshot('incident:one');
  assert.equal(snapshot.coordinationFailures.length, 0);
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].eventId, event.id);
  assert.equal(snapshot.receipts[0].revision, 'revision-7');
  assert.equal(snapshot.receipts[0].state, 'APPLIED');
});

test('notification failure never repeats projection work and retains a separately retryable delivery receipt', async () => {
  const store = repository();
  let current = new Date(now), refreshes = 0, invalidations = 0, changes = 0;
  const coordinator = new CrisisAutopilotCoordinator({
    repository: store, canonicalEventResolver: async () => event, clock: () => current, retryBaseMs: 1_000,
    projectionRefresher: async () => { refreshes += 1; return { projectionHash: `canonical-governed-operator-twin:sha256:${'d'.repeat(64)}` }; },
    projectionInvalidator: async () => { invalidations += 1; if (invalidations === 1) throw new Error('invalidation_temporarily_failed'); },
    onChanged: async () => { changes += 1; },
  });
  const [trigger] = canonicalAutopilotTriggersForOperationalEvent(event), first = await coordinator.consume(trigger);
  assert.equal(first.state, 'APPLIED_NOTIFICATION_PENDING');
  assert.equal(first.canonicalProjection.state, 'REFRESHED');
  assert.equal(first.notification.reason, 'invalidation_temporarily_failed');
  current = new Date('2026-09-04T12:00:02.000Z');
  await coordinator.retryPending();
  const complete = coordinator.snapshot('incident:one').receipts[0];
  assert.equal(complete.state, 'APPLIED');
  assert.equal(complete.notification.attemptCount, 2);
  assert.equal(refreshes, 1);
  assert.equal(invalidations, 2);
  assert.equal(changes, 1);
});

test('one retry pass rebuilds the canonical projection once for multiple pending receipts', async () => {
  const store = repository();
  let current = new Date(now), refreshes = 0;
  const secondEvent = {
    ...event,
    id: 'operational-event:thermal-two',
    provider: { ...event.provider, providerRevision: 'revision-8' },
    payloadHash: 'payload-hash-two',
  };
  const events = new Map([[event.id, event], [secondEvent.id, secondEvent]]);
  const coordinator = new CrisisAutopilotCoordinator({
    repository: store,
    canonicalEventResolver: async ({ eventId }) => events.get(eventId) ?? null,
    clock: () => current,
    retryBaseMs: 1_000,
    projectionRefresher: async () => { refreshes += 1; throw new Error('injected_projection_failure'); },
  });

  for (const sourceEvent of [event, secondEvent]) {
    const [trigger] = canonicalAutopilotTriggersForOperationalEvent(sourceEvent);
    const failed = await coordinator.consume(trigger);
    assert.equal(failed.state, 'PERSISTED_REFRESH_PENDING');
  }
  assert.equal(refreshes, 2);

  current = new Date('2026-09-04T12:00:02.000Z');
  coordinator.setProjectionRefresher(async () => {
    refreshes += 1;
    return { projectionHash: `canonical-governed-operator-twin:sha256:${'e'.repeat(64)}` };
  });
  const retry = await coordinator.retryPending();
  assert.equal(retry.attempted, 2);
  assert.equal(refreshes, 3);
  const snapshot = coordinator.snapshot('incident:one');
  assert.equal(snapshot.receipts.length, 2);
  assert.equal(snapshot.receipts.every((item) => item.state === 'APPLIED'), true);
  assert.equal(snapshot.receipts.every((item) => item.canonicalProjection.state === 'REFRESHED'), true);
  assert.equal(snapshot.receipts.every((item) => item.notification.state === 'DELIVERED'), true);
});
