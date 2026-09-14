import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createActionBudget, createAuthorityContext, createControlPlaneEvent, createControlPlaneReplay, createPolicyVersion, createWildfireControlPolicies,
  planControlCycle, transitionControlAction, verifyControlPlaneReplay
} from '../../../packages/domain/src/control-plane/index.mjs';
import { createCanonicalOperationalEvent, createSourceRegistry } from '../../../packages/domain/src/event-fabric/index.mjs';
import { ControlPlaneService } from '../src/modules/intelligence/control-plane-service.mjs';
import { ExternalControlExecutorPort } from '../src/modules/intelligence/external-control-executor-port.mjs';
import { InternalControlExecutor } from '../src/modules/intelligence/internal-control-executor.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';

const raw = 'raw:control-plane-test', incidentId = 'incident:policy-demo';
function registry() {
  const common = { staleAfterMs: 21_600_000, registeredAt: '2026-08-24T12:00:00Z', capabilities: ['FAMILY_CLASS_QUORUM'],
    geographicApplicability: { bbox: [-9, 39, -7, 41] } };
  return createSourceRegistry([
    { ...common, sourceId: 'reporter:1', familyId: 'report.human', familyClass: 'REPORT', metadata: { priority: 1, provenanceStrength: 'ATTRIBUTED' } },
    { ...common, sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL', metadata: { priority: 1, reliability: 0.98, cost: 2, provenanceStrength: 'VERIFIED' } },
    { ...common, sourceId: 'sensor:thermal', familyId: 'physical.thermal', familyClass: 'PHYSICAL', metadata: { priority: 2, reliability: 0.96, cost: 1, provenanceStrength: 'VERIFIED' } },
    { ...common, sourceId: 'sensor:radar', familyId: 'physical.radar', familyClass: 'PHYSICAL', metadata: { priority: 3, reliability: 0.9, cost: 3, provenanceStrength: 'VERIFIED' } },
    { ...common, sourceId: 'authority:cap', familyId: 'official.cap', familyClass: 'OFFICIAL', metadata: { priority: 1, provenanceStrength: 'VERIFIED' } }
  ]);
}
function observation({ id, sourceId = 'reporter:1', familyId = 'report.human', familyClass = 'REPORT', at = '2026-08-24T12:00:00Z', stance = 'SUPPORTING', state = 'OBSERVED_POSITIVE', resolvesEventIds = [] }) {
  return createCanonicalOperationalEvent({ eventType: 'wildfire.observation', hazardType: 'wildfire', provider: { adapterId: 'policy-fixture', adapterVersion: '1', providerEventId: id },
    source: { sourceId, familyId, familyClass, producerId: sourceId, upstreamOrigin: `fixture:${sourceId}` },
    clocks: { occurredAt: at, observedAt: at, publishedAt: at, receivedAt: at, ingestedAt: null }, geometry: [-8, 40], correlationKeys: [incidentId],
    payload: { observationState: state, stance, materiality: 'MATERIAL', opportunity: { state: 'VALID' }, resolvesEventIds },
    provenance: { strength: familyClass === 'REPORT' ? 'ATTRIBUTED' : 'VERIFIED', upstreamMeasurementId: id, rawPayloadHash: raw } });
}
function authority() { return createAuthorityContext({ principalId: 'runtime:controller', grantedCapabilities: ['control:evidence-acquisition', 'control:reversible', 'control:contradiction-work'], validFrom: '2026-08-24T00:00:00Z', authorityRef: 'test-runtime-authority' }); }
async function harness() {
  const journal = new MemoryOperationalEventJournal(), intelligence = new OperationalIntelligenceService({ journal, sourceRegistry: registry(), clock: () => new Date('2026-08-24T12:02:00Z') });
  await intelligence.ingestOperationalEvent(observation({ id: 'report' }), { ingestedAt: '2026-08-24T12:01:00Z', project: false });
  return { journal, intelligence, control: new ControlPlaneService({ intelligenceService: intelligence, policies: createWildfireControlPolicies() }) };
}

test('flagship wildfire controller acquires bounded evidence, holds consequential work, and converges idempotently', async () => {
  const { intelligence, control } = await harness(), at = '2026-08-24T12:02:00Z';
  const first = await control.reconcile({ asOf: at, authority: authority(), consequentialIntentByIncident: { [incidentId]: true } });
  assert.equal(first.state, 'CONVERGED');
  const twin = await intelligence.getTwinAsOf(at), active = twin.controlPlane.acquisitionRequests.filter((item) => item.status === 'ACTIVE');
  assert.deepEqual(active.map((item) => item.sourceId).sort(), ['authority:cap', 'sensor:optical']);
  assert.equal(twin.controlPlane.actions.filter((item) => item.status === 'SUCCEEDED').length, 2);
  assert.equal(twin.controlPlane.actions.filter((item) => item.status === 'AUTHORITY_REQUIRED').length, 1);
  assert.equal(twin.controlPlane.receipts.length, 3); assert.equal(twin.incidents[0].activeEventIds.length, 1);
  const controlEvents = (await intelligence.getOperationalEvents({ asOf: at })).filter((item) => item.hazardType === 'control-plane');
  assert.equal(controlEvents.every((item) => item.source.familyClass === 'SYSTEM' && !item.payload.stance && !item.payload.observationState), true);
  await control.reconcile({ asOf: at, authority: authority(), consequentialIntentByIncident: { [incidentId]: true } });
  const retried = await intelligence.getTwinAsOf(at); assert.equal(retried.controlPlane.actions.length, 3); assert.equal(retried.controlPlane.acquisitionRequests.length, 2);
});

test('provider unavailability stops retries, applies backoff, selects an alternative, and converges', async () => {
  const { intelligence, control } = await harness();
  await control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority() });
  await intelligence.ingestSourceHealth({ sourceId: 'sensor:optical', status: 'UNAVAILABLE', at: '2026-08-24T12:03:00Z', reason: 'Injected provider outage.' }, { ingestedAt: '2026-08-24T12:03:00Z', project: false });
  const result = await control.reconcile({ asOf: '2026-08-24T12:04:00Z', authority: authority(), maximumCycles: 4 });
  assert.equal(result.state, 'CONVERGED');
  const requests = (await intelligence.getTwinAsOf('2026-08-24T12:04:00Z')).controlPlane.acquisitionRequests;
  assert.deepEqual(requests.map((item) => ({ sourceId: item.sourceId, status: item.status })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)), [
    { sourceId: 'authority:cap', status: 'ACTIVE' }, { sourceId: 'sensor:optical', status: 'BACKOFF' }, { sourceId: 'sensor:thermal', status: 'ACTIVE' }
  ]);
});

test('stronger evidence supersedes fulfilled work and advances to the next independent source', async () => {
  const { intelligence, control } = await harness();
  await control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority() });
  await intelligence.ingestOperationalEvent(observation({ id: 'optical', sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL', at: '2026-08-24T12:03:00Z' }), { ingestedAt: '2026-08-24T12:03:00Z', project: false });
  const result = await control.reconcile({ asOf: '2026-08-24T12:04:00Z', authority: authority() });
  assert.equal(result.state, 'CONVERGED');
  const requests = (await intelligence.getTwinAsOf('2026-08-24T12:04:00Z')).controlPlane.acquisitionRequests;
  assert.deepEqual(requests.map((item) => ({ sourceId: item.sourceId, status: item.status })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)), [
    { sourceId: 'authority:cap', status: 'ACTIVE' }, { sourceId: 'sensor:optical', status: 'SUPERSEDED' }, { sourceId: 'sensor:thermal', status: 'ACTIVE' }
  ]);
  await intelligence.ingestOperationalEvent(observation({ id: 'late-official', sourceId: 'authority:cap', familyId: 'official.cap', familyClass: 'OFFICIAL', at: '2026-08-24T12:01:30Z' }), { ingestedAt: '2026-08-24T12:05:00Z', project: false });
  await intelligence.ingestOperationalEvent(observation({ id: 'thermal', sourceId: 'sensor:thermal', familyId: 'physical.thermal', familyClass: 'PHYSICAL', at: '2026-08-24T12:03:30Z' }), { ingestedAt: '2026-08-24T12:05:01Z', project: false });
  await control.reconcile({ asOf: '2026-08-24T12:06:00Z', authority: authority() });
  const resolved = await intelligence.getTwinAsOf('2026-08-24T12:06:00Z');
  assert.equal(resolved.incidents[0].evaluation.state, 'CORROBORATED');
  assert.equal(resolved.controlPlane.acquisitionRequests.some((item) => ['ACTIVE', 'BACKOFF'].includes(item.status)), false);
});

test('dry-run has no side effects and shadow records would-have actions without acquisition', async () => {
  const dry = await harness(), before = (await dry.intelligence.getOperationalEvents({ asOf: '2026-08-24T12:02:00Z' })).length;
  const preview = await dry.control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), mode: 'DRY_RUN' });
  assert.equal(preview.state, 'DRY_RUN'); assert.equal((await dry.intelligence.getOperationalEvents({ asOf: '2026-08-24T12:02:00Z' })).length, before);
  const shadow = await harness(); await shadow.control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), mode: 'SHADOW' });
  const twin = await shadow.intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.controlPlane.actions.every((item) => item.status === 'SHADOW'), true); assert.equal(twin.controlPlane.acquisitionRequests.length, 0);
});

test('concurrent controller runs preserve one logical effect per idempotency key', async () => {
  const { intelligence, control } = await harness(), options = { asOf: '2026-08-24T12:02:00Z', authority: authority() };
  await Promise.all([control.reconcile(options), control.reconcile(options)]);
  const twin = await intelligence.getTwinAsOf(options.asOf);
  assert.equal(twin.controlPlane.acquisitionRequests.length, 2); assert.equal(new Set(twin.controlPlane.actions.map((item) => item.id)).size, twin.controlPlane.actions.length);
});

test('blocking contradiction opens bounded work and keeps warning execution behind authority', async () => {
  const { intelligence, control } = await harness();
  const negative = observation({ id: 'negative', sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL',
    at: '2026-08-24T12:01:00Z', stance: 'CONTRADICTING', state: 'OBSERVED_NEGATIVE' });
  await intelligence.ingestOperationalEvent(negative, { ingestedAt: '2026-08-24T12:01:30Z', project: false });
  await control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), consequentialIntentByIncident: { [incidentId]: true } });
  const twin = await intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.incidents[0].evaluation.state, 'CONTRADICTED'); assert.equal(twin.controlPlane.workItems[0].kind, 'CONTRADICTION_RESOLUTION');
  assert.equal(twin.controlPlane.actions.some((item) => item.type === 'ISSUE_PUBLIC_WARNING' && item.status === 'AUTHORITY_REQUIRED'), true);
  await intelligence.ingestOperationalEvent(observation({ id: 'negative-resolved', sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL',
    at: '2026-08-24T12:03:00Z', resolvesEventIds: [negative.id] }), { ingestedAt: '2026-08-24T12:03:30Z', project: false });
  await control.reconcile({ asOf: '2026-08-24T12:04:00Z', authority: authority(), consequentialIntentByIncident: { [incidentId]: true } });
  assert.equal((await intelligence.getTwinAsOf('2026-08-24T12:04:00Z')).controlPlane.workItems[0].status, 'CLOSED');
});

test('kill switch and circuit breaker bound unsafe or repeatedly failing execution', async () => {
  const killed = await harness();
  const stopped = await killed.control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), maximumCycles: 1,
    killSwitch: { engaged: true, scopes: ['ALL'], reason: 'exercise stop' } });
  assert.equal(stopped.state, 'MAXIMUM_CYCLES_REACHED');
  let twin = await killed.intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.controlPlane.actions.every((item) => item.status === 'BLOCKED'), true); assert.equal(twin.controlPlane.acquisitionRequests.length, 0);

  const failing = await harness(); let fail = true;
  const executor = { id: 'injected-failure', execute: async (input) => { if (fail) throw Object.assign(new Error('provider failed'), { code: 'PROVIDER_FAILED' });
    return new InternalControlExecutor().execute(input); } };
  const runtime = new ControlPlaneService({ intelligenceService: failing.intelligence, policies: createWildfireControlPolicies(), executor });
  await runtime.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), maximumCycles: 2, cooldown: { cooldownMs: 0 }, circuitBreaker: { failureThreshold: 1, resetAfterMs: 300_000 } });
  twin = await failing.intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.controlPlane.actions.every((item) => item.status === 'CIRCUIT_OPEN'), true); assert.equal(twin.controlPlane.acquisitionRequests.length, 0);
  fail = false; const recovered = await runtime.reconcile({ asOf: '2026-08-24T12:10:00Z', authority: authority(), circuitBreaker: { failureThreshold: 1, resetAfterMs: 300_000 } });
  assert.equal(recovered.state, 'CONVERGED'); assert.equal((await failing.intelligence.getTwinAsOf('2026-08-24T12:10:00Z')).controlPlane.acquisitionRequests.length, 2);
});

test('restart recovery completes STARTED work from postconditions and emits a receipt', async () => {
  const { intelligence } = await harness(), policies = createWildfireControlPolicies(), at = '2026-08-24T12:02:00Z';
  const plan = planControlCycle({ twin: await intelligence.getTwinAsOf(at), policies, at }), action = plan.actions[0];
  const persist = async (controlType, record, sequence = null) => intelligence.ingestOperationalEvent(createControlPlaneEvent({ controlType, record, incidentId, at, sequence }), { ingestedAt: at, project: false });
  for (const decision of plan.decisions) await persist('POLICY_DECISION', decision);
  for (const desired of plan.desiredStates) await persist('DESIRED_STATE', desired);
  await persist('ACTION', action, 'PLANNED:0'); await persist('ACTION', transitionControlAction(action, 'STARTED', { at, incrementAttempt: true }), 'STARTED:1');
  const restarted = new ControlPlaneService({ intelligenceService: intelligence, policies });
  const result = await restarted.reconcile({ asOf: at, authority: authority() }); assert.equal(result.state, 'CONVERGED');
  const twin = await intelligence.getTwinAsOf(at), recovered = twin.controlPlane.actions.find((item) => item.id === action.id);
  assert.equal(recovered.status, 'SUCCEEDED'); assert.equal(twin.controlPlane.receipts.some((item) => item.binding.actionId === action.id), true);
});

test('control history replays deterministically and external execution remains an unconfigured port', async () => {
  const { intelligence, control } = await harness(), policies = createWildfireControlPolicies(), at = '2026-08-24T12:02:00Z';
  await control.reconcile({ asOf: at, authority: authority() });
  const events = await intelligence.getOperationalEvents({ asOf: at }), replay = createControlPlaneReplay({ events, sourceRegistry: registry(), policies, asOf: at });
  assert.equal(verifyControlPlaneReplay(replay, { events: [...events].reverse(), sourceRegistry: registry(), policies }).valid, true);
  const changedPolicies = policies.map((item) => item.kind === 'MISSING_INDEPENDENT_CORROBORATION'
    ? createPolicyVersion({ ...item, version: '2.0.0', effectiveFrom: '2026-08-24T00:00:00Z', parameters: { maximumOutstandingRequestsPerNeed: 2 } }) : item);
  assert.equal(verifyControlPlaneReplay(replay, { events, sourceRegistry: registry(), policies: changedPolicies }).valid, false);
  await assert.rejects(new ExternalControlExecutorPort().execute({}), (error) => error.code === 'EXTERNAL_EXECUTOR_NOT_CONFIGURED');
});

test('action budgets cap each reconciliation cycle', async () => {
  const limited = await harness(), budget = createActionBudget({ maximumActionsPerCycle: 1, maximumActionsPerIncident: 10 });
  await limited.control.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), budget, maximumCycles: 1 });
  const twin = await limited.intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.controlPlane.actions.filter((item) => item.status === 'SUCCEEDED').length, 1);
  assert.equal(twin.controlPlane.actions.filter((item) => item.status === 'BUDGET_EXCEEDED').length, 1);
});

test('controller disable and retry exhaustion fail closed without hidden effects', async () => {
  const disabled = await harness(), before = (await disabled.intelligence.getOperationalEvents({ asOf: '2026-08-24T12:02:00Z' })).length;
  assert.equal((await disabled.control.reconcile({ asOf: '2026-08-24T12:02:00Z', enabled: false, authority: authority() })).state, 'DISABLED');
  assert.equal((await disabled.intelligence.getOperationalEvents({ asOf: '2026-08-24T12:02:00Z' })).length, before);
  const failed = await harness(), noEffect = { id: 'no-effect-executor', execute: async () => ({ records: [], result: { accepted: false } }) };
  const runtime = new ControlPlaneService({ intelligenceService: failed.intelligence, policies: createWildfireControlPolicies(), executor: noEffect,
    budget: createActionBudget({ maximumAttemptsPerAction: 1, maximumActionsPerCycle: 10, maximumActionsPerIncident: 10 }) });
  await runtime.reconcile({ asOf: '2026-08-24T12:02:00Z', authority: authority(), maximumCycles: 2, cooldown: { cooldownMs: 0 }, circuitBreaker: { failureThreshold: 99 } });
  const twin = await failed.intelligence.getTwinAsOf('2026-08-24T12:02:00Z');
  assert.equal(twin.controlPlane.actions.every((item) => item.status === 'BUDGET_EXCEEDED'), true); assert.equal(twin.controlPlane.acquisitionRequests.length, 0);
  assert.equal(runtime.status().metrics.postconditionFailures > 0, true);
});

test('late truth supersedes a crash-left PLANNED action before any effect executes', async () => {
  const { intelligence } = await harness(), policies = createWildfireControlPolicies(), plannedAt = '2026-08-24T12:02:00Z';
  const plan = planControlCycle({ twin: await intelligence.getTwinAsOf(plannedAt), policies, at: plannedAt }), action = plan.actions[0];
  const persist = async (controlType, record) => intelligence.ingestOperationalEvent(createControlPlaneEvent({ controlType, record, incidentId, at: plannedAt }), { ingestedAt: plannedAt, project: false });
  for (const decision of plan.decisions) await persist('POLICY_DECISION', decision); for (const desired of plan.desiredStates) await persist('DESIRED_STATE', desired); await persist('ACTION', action);
  for (const item of [
    { id: 'optical-before-effect', sourceId: 'sensor:optical', familyId: 'physical.optical', familyClass: 'PHYSICAL' },
    { id: 'thermal-before-effect', sourceId: 'sensor:thermal', familyId: 'physical.thermal', familyClass: 'PHYSICAL' },
    { id: 'official-before-effect', sourceId: 'authority:cap', familyId: 'official.cap', familyClass: 'OFFICIAL' }
  ]) await intelligence.ingestOperationalEvent(observation({ ...item, at: '2026-08-24T12:03:00Z' }), { ingestedAt: '2026-08-24T12:03:00Z', project: false });
  const runtime = new ControlPlaneService({ intelligenceService: intelligence, policies });
  await runtime.reconcile({ asOf: '2026-08-24T12:04:00Z', authority: authority() });
  const twin = await intelligence.getTwinAsOf('2026-08-24T12:04:00Z');
  assert.equal(twin.controlPlane.actions.find((item) => item.id === action.id).status, 'SUPERSEDED'); assert.equal(twin.controlPlane.acquisitionRequests.length, 0);
});
