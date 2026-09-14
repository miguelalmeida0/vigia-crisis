import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeCompartment, buildDoctrineScenarioCorpus, certifyDoctrineScenarioCoverage, certifyHaEvidence, createAccessContext, createForecastEvaluationProtocol, createHaCertificationTopology, createKmsAdapter, createResourceMarking, createTenantKeyReference, evaluateErrorBudgets, evaluateForecastRows, redactUnauthorizedProperties } from '../../src/worldclass/index.mjs';

const marking = () => createResourceMarking({ organizationId: 'org-a', regionId: 'west', incidentId: 'fire-1', resourceId: 'packet-1', classification: 'SENSITIVE', rights: { view: ['read'], export: ['export'], lineage: ['lineage'], execute: ['execute'] }, actionClasses: ['WARN'], propertyMarkings: { location: { classification: 'RESTRICTED', view: ['location'], export: ['location-export'] } } });
const context = (input = {}) => createAccessContext({ principalId: 'p1', deviceId: 'd1', sessionId: 's1', organizations: ['org-a'], regions: ['west'], incidents: ['fire-1'], resources: ['packet-1'], rights: ['read', 'export', 'lineage', 'execute', 'location', 'location-export'], actionClasses: ['WARN'], clearance: 'RESTRICTED', validFrom: '2025-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z', ...input });

test('compartment ABAC authorizes all dimensions and denies every scope escape', () => {
  const at = '2026-01-01T00:00:00Z', resource = marking();
  assert.equal(authorizeCompartment({ context: context(), marking: resource, operation: 'READ', at }).allowed, true);
  for (const changed of [{ organizations: ['org-b'] }, { regions: ['east'] }, { incidents: ['fire-2'] }, { resources: ['packet-2'] }, { clearance: 'PUBLIC' }, { principalState: 'DISABLED' }, { deviceState: 'UNATTESTED' }, { sessionState: 'CLOSED' }, { revokedAt: '2025-12-01T00:00:00Z' }]) assert.equal(authorizeCompartment({ context: context(changed), marking: resource, operation: 'READ', at }).allowed, false);
  assert.equal(authorizeCompartment({ context: context({ rights: ['read'] }), marking: resource, operation: 'EXPORT', at }).allowed, false);
  assert.equal(authorizeCompartment({ context: context({ actionClasses: [] }), marking: resource, operation: 'EXECUTE_ACTION', actionClass: 'WARN', at }).allowed, false);
  assert.equal(authorizeCompartment({ context: context({ clearance: 'SENSITIVE' }), marking: resource, operation: 'READ_PROPERTY', property: 'location', at }).allowed, false);
  assert.deepEqual(redactUnauthorizedProperties({ summary: 'visible', location: 'protected' }, { context: context({ clearance: 'SENSITIVE' }), marking: resource, at }), { summary: 'visible' });
  assert.equal(authorizeCompartment({ context: context(), marking: null, operation: 'READ', at }).allowed, false);
});

test('KMS adapter rotates opaque per-tenant references without exporting key material', async () => {
  const prior = createTenantKeyReference({ organizationId: 'org-a', keyId: 'kms/key/1', provider: 'test-kms', createdAt: '2026-01-01T00:00:00Z' }), adapter = createKmsAdapter({ id: 'test-kms', wrap: async () => ({ ciphertext: 'opaque' }), unwrap: async () => Buffer.from('test-only'), health: async () => ({ state: 'READY' }), rotate: async () => ({ keyId: 'kms/key/2', createdAt: '2026-02-01T00:00:00Z' }) }), next = await adapter.rotate(prior);
  assert.equal((await adapter.health()).secretsRecorded, false); assert.equal(next.version, 2); assert.equal(next.rotatedFrom, prior.keyId); assert.equal(next.keyMaterialExported, false);
});

test('doctrine corpus is deterministic, has 100 states and closes every critical invariant', () => {
  const first = buildDoctrineScenarioCorpus(), second = buildDoctrineScenarioCorpus(), report = certifyDoctrineScenarioCoverage();
  assert.equal(first.fingerprint, second.fingerprint); assert.equal(first.scenarioCount, 100); assert.equal(first.categories.length, 18); assert.equal(report.passed, true); assert.deepEqual(report.uncoveredP0States, []); assert.deepEqual(report.authorityFreeConsequentialPaths, []); assert.equal(report.dependencyCycles, 0);
});

test('forecast evaluation is preregistered, complete and never creates evidence or authority', () => {
  const protocol = createForecastEvaluationProtocol(); assert.equal(protocol.preregisteredBeforePromotion, true); assert.equal(protocol.evidenceSeparation.forecastMayCreateAuthority, false); assert.equal(protocol.metrics.length, 9);
  const rows = protocol.ladder.flatMap((modelId) => [1, 3, 6].map((horizonHours) => ({ modelId, horizonHours, split: 'heldout', region: 'west', season: '2025', sourceAblation: 'none', iou: .6, boundaryErrorM: 1000, areaErrorRatio: .2, arrivalTimeErrorMinutes: 40, brierScore: .1, confidence: .8, observed: 1, contourCovered: true, falseSafe: false, underpredictionRatio: .1 }))), evaluation = evaluateForecastRows(rows, { protocol });
  assert.equal(evaluation.models.NO_GROWTH.examples, 3); assert.deepEqual(evaluation.scoreableHorizons, [1, 3, 6]); assert.equal(evaluation.models.CALIBRATED_HYBRID_ENSEMBLE.falseSafeRate, 0); assert.throws(() => evaluateForecastRows([{ modelId: 'NO_GROWTH' }]), /incomplete/);
});

test('HA evidence requires distinct failure domains and every one of 100 clean cycles', () => {
  const topology = { primary: { region: 'r1', zone: 'z1', stackId: 's1', databaseEndpointId: 'db1' }, synchronousStandby: { region: 'r1', zone: 'z2', stackId: 's2', databaseEndpointId: 'db2' }, recoveryReplica: { region: 'r2', zone: 'z3', stackId: 's3', databaseEndpointId: 'db3' }, routing: { trafficDirector: 'global-router', fencingProvider: 'lease-fencer' } }; assert.ok(createHaCertificationTopology(topology).fingerprint);
  const cycles = Array.from({ length: 100 }, (_, index) => ({ id: `cycle-${index}`, zoneRtoSeconds: 10, zoneRpoTransactions: 0, regionRtoSeconds: 120, regionRpoTransactions: 2, splitBrainWrites: 0, duplicateActions: 0, databasePromoted: true, writeFencingHeld: true, consistencyTokensHeld: true, controllerIdempotencyHeld: true, decisionPacketIdentityHeld: true, rollingUpgradeHeld: true, secondaryDomainBackupRestored: true }));
  assert.equal(certifyHaEvidence({ topology, cycles }).passed, true); cycles[42].splitBrainWrites = 1; assert.equal(certifyHaEvidence({ topology, cycles }).passed, false); assert.throws(() => createHaCertificationTopology({ ...topology, recoveryReplica: { ...topology.recoveryReplica, region: 'r1' } }), /not_distinct/);
});

test('error-budget exhaustion freezes non-remediation changes', () => {
  const pass = evaluateErrorBudgets({ interactiveIncidentRead: Array.from({ length: 1000 }, () => ({ success: true, durationMs: 10 })) }), fail = evaluateErrorBudgets({ interactiveIncidentRead: Array.from({ length: 100 }, (_, index) => ({ success: index < 90, durationMs: index < 90 ? 10 : 1000 })) });
  assert.equal(pass.freezeNonRemediationChanges, false); assert.equal(fail.freezeNonRemediationChanges, true); assert.equal(fail.services.interactiveIncidentRead.state, 'EXHAUSTED');
});
