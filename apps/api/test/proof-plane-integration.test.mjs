import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalOperationalEvent, createSourceRegistry, operationalEventStatementHash } from '../../../packages/domain/src/event-fabric/index.mjs';
import { createRevocationRegistry } from '../../../packages/domain/src/proof-plane/index.mjs';
import { createWildfireControlPolicies } from '../../../packages/domain/src/control-plane/index.mjs';
import { grant, NOW, proofFixture, request, signedBundle } from '../../../packages/domain/test/intelligence/proof-plane-fixtures.mjs';
import { ControlPlaneService } from '../src/modules/intelligence/control-plane-service.mjs';
import { MemoryOperationalEventJournal } from '../src/modules/intelligence/memory-event-journal.mjs';
import { OperationalIntelligenceService } from '../src/modules/intelligence/operational-intelligence-service.mjs';

const controlIncident = 'incident:proof-control';
function registry() {
  const common = { staleAfterMs: 21_600_000, registeredAt: '2026-08-24T11:00:00Z', capabilities: ['FAMILY_CLASS_QUORUM'], geographicApplicability: { bbox: [-9, 39, -7, 41] } };
  return createSourceRegistry([
    { ...common, sourceId: 'public:report', familyId: 'report.public', familyClass: 'REPORT', metadata: { priority: 1, provenanceStrength: 'ATTRIBUTED' } },
    { ...common, sourceId: 'sensor:alpha', familyId: 'physical.proof', familyClass: 'PHYSICAL', metadata: { priority: 1, provenanceStrength: 'VERIFIED' } },
    { ...common, sourceId: 'official:alpha', familyId: 'official.proof', familyClass: 'OFFICIAL', metadata: { priority: 1, provenanceStrength: 'VERIFIED' } }
  ]);
}
function observation({ id = 'report-1', sourceId = 'public:report', familyId = 'report.public', familyClass = 'REPORT', incidentId = controlIncident, proof = {} } = {}) {
  return createCanonicalOperationalEvent({ eventType: 'wildfire.observation', hazardType: 'wildfire', provider: { adapterId: 'proof-integration', adapterVersion: '1', providerEventId: id },
    source: { sourceId, familyId, familyClass, producerId: sourceId, upstreamOrigin: `TEST:${sourceId}` },
    clocks: { occurredAt: '2026-08-24T11:58:00Z', observedAt: '2026-08-24T11:58:00Z', publishedAt: '2026-08-24T11:58:30Z', receivedAt: NOW, ingestedAt: null },
    geometry: [-8, 40], correlationKeys: [incidentId], payload: { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING', materiality: 'MATERIAL', opportunity: { state: 'VALID' } },
    provenance: { strength: familyClass === 'REPORT' ? 'ATTRIBUTED' : 'VERIFIED', upstreamMeasurementId: id, rawPayloadHash: 'sha256:proof-integration' }, proof });
}
function controlAuthorization(fixture, credentialId = 'credential:control') {
  const openRequest = request('control:reconcile', { incidentId: controlIncident, resourceId: controlIncident, requestFingerprint: 'control-reconciliation:proof-control' });
  const grants = [
    grant('control:reconcile', { incidentId: controlIncident, actionClasses: ['RECONCILIATION'], resourceTypes: ['control-plane'], resourceIds: [controlIncident] }),
    grant('control:evidence-acquisition', { incidentId: controlIncident, actionClasses: ['BOUNDED_OPERATIONAL'], resourceTypes: ['control-action'] }),
    grant('control:reversible', { incidentId: controlIncident, actionClasses: ['REVERSIBLE'], resourceTypes: ['control-action'] }),
    grant('control:contradiction-work', { incidentId: controlIncident, actionClasses: ['BOUNDED_OPERATIONAL'], resourceTypes: ['control-action'] }),
    grant('control:consequential', { incidentId: controlIncident, actionClasses: ['CONSEQUENTIAL'], resourceTypes: ['control-action'] })
  ];
  const bundle = signedBundle(fixture, { request: openRequest, grants, credentialId, sequence: 20 });
  return { bundle, scope: { organizationId: 'org:fire', incidentId: controlIncident, requestFingerprint: openRequest.requestFingerprint, sensitivity: 'MEDIUM' } };
}

test('Event Fabric admits verified machine evidence, quarantines invalid physical input, and preserves pre-revocation history', async () => {
  const fixture = proofFixture(), journal = new MemoryOperationalEventJournal(), intelligence = new OperationalIntelligenceService({ journal, sourceRegistry: registry(), proofPlane: fixture.service, clock: () => new Date(NOW) });
  const unsigned = observation({ id: 'unsigned-physical', sourceId: 'sensor:alpha', familyId: 'physical.proof', familyClass: 'PHYSICAL', incidentId: 'incident:alpha' });
  assert.equal((await intelligence.ingestOperationalEvent(unsigned, { ingestedAt: NOW })).state, 'QUARANTINED');
  const unsignedSigned = observation({ id: 'signed-physical', sourceId: 'sensor:alpha', familyId: 'physical.proof', familyClass: 'PHYSICAL', incidentId: 'incident:alpha' });
  const eventRequest = request('publish:evidence', { incidentId: 'alpha', resourceType: 'operational-event', resourceId: unsignedSigned.id, actionClass: 'EVIDENCE_INGEST', sensitivity: 'MEDIUM', requestFingerprint: operationalEventStatementHash(unsignedSigned) });
  const bundle = signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: eventRequest, sequence: 21, credentialId: 'credential:sensor:integration',
    grants: [grant('publish:evidence', { incidentId: 'alpha', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'] })] });
  const accepted = await intelligence.ingestOperationalEvent(observation({ id: 'signed-physical', sourceId: 'sensor:alpha', familyId: 'physical.proof', familyClass: 'PHYSICAL', incidentId: 'incident:alpha', proof: { bundle } }), { ingestedAt: NOW });
  assert.equal(accepted.state, 'ACCEPTED'); assert.equal(accepted.event.trust.trustZone, 'ORGANIZATION_AUTHORIZED');
  fixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'DEVICE', targetId: 'device:sensor', issuerId: 'org:fire', reason: 'compromise discovered',
    effectiveAt: '2026-08-24T12:05:00Z', recordedAt: '2026-08-24T12:05:00Z', compromisedSince: '2026-08-24T11:59:00Z' }]));
  assert.equal(fixture.service.eventsForProjection([accepted.event], '2026-08-24T12:04:00Z').length, 1);
  assert.equal(fixture.service.eventsForProjection([accepted.event], '2026-08-24T12:06:00Z').length, 0);
  assert.equal((await intelligence.quarantineLog()).length, 1); assert.equal((await intelligence.getOperationalEvents({ asOf: NOW })).length, 1);
});

test('proof-bound controller executes bounded work while consequential execution stays disabled', async () => {
  const fixture = proofFixture(), intelligence = new OperationalIntelligenceService({ journal: new MemoryOperationalEventJournal(), sourceRegistry: registry(), proofPlane: fixture.service, clock: () => new Date(NOW) });
  await intelligence.ingestOperationalEvent(observation(), { ingestedAt: NOW, project: false });
  const authorization = controlAuthorization(fixture), opened = fixture.service.openControlContext(authorization.bundle, authorization.scope, { at: NOW });
  assert.equal(opened.decision.decision, 'AUTHORIZED'); assert.ok(opened.context);
  const control = new ControlPlaneService({ intelligenceService: intelligence, policies: createWildfireControlPolicies(), proofPlane: fixture.service, clock: () => new Date(NOW) });
  const result = await control.reconcile({ asOf: NOW, trustContext: opened.context, consequentialIntentByIncident: { [controlIncident]: true } });
  assert.equal(result.state, 'CONVERGED');
  const twin = await intelligence.getTwinAsOf(NOW), actions = twin.controlPlane.actions;
  assert.ok(actions.some((item) => item.status === 'SUCCEEDED' && item.safetyClass !== 'CONSEQUENTIAL'));
  assert.ok(actions.some((item) => item.status === 'AUTHORIZED_BUT_EXECUTION_DISABLED' && item.safetyClass === 'CONSEQUENTIAL'));
  assert.equal(actions.some((item) => item.safetyClass === 'CONSEQUENTIAL' && item.status === 'SUCCEEDED'), false);
  const controlEvents = (await intelligence.getOperationalEvents({ asOf: NOW })).filter((event) => event.source.familyClass === 'SYSTEM');
  assert.ok(controlEvents.length > 0); assert.equal(controlEvents.every((event) => event.trust?.trustZone === 'PRIVILEGED_OPERATIONAL'), true);
});

test('revocation between STARTED persistence and execution is caught by the TOCTOU recheck', async () => {
  const fixture = proofFixture(), intelligence = new OperationalIntelligenceService({ journal: new MemoryOperationalEventJournal(), sourceRegistry: registry(), proofPlane: fixture.service, clock: () => new Date(NOW) });
  await intelligence.ingestOperationalEvent(observation(), { ingestedAt: NOW, project: false });
  const credentialId = 'credential:revocation-race', authorization = controlAuthorization(fixture, credentialId);
  const opened = fixture.service.openControlContext(authorization.bundle, authorization.scope, { at: NOW }); let injected = false;
  const boundary = {
    getTwinAsOf: (...args) => intelligence.getTwinAsOf(...args),
    ingestOperationalEvent: async (event, options) => {
      const result = await intelligence.ingestOperationalEvent(event, options);
      if (!injected && event.payload?.controlType === 'ACTION' && event.payload.action?.status === 'STARTED') {
        injected = true; fixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'CREDENTIAL', targetId: credentialId, issuerId: 'org:fire', reason: 'race-test revocation', effectiveAt: NOW }]));
      }
      return result;
    }
  };
  const control = new ControlPlaneService({ intelligenceService: boundary, policies: createWildfireControlPolicies(), proofPlane: fixture.service, clock: () => new Date(NOW) });
  await control.reconcile({ asOf: NOW, trustContext: opened.context, maximumCycles: 1 });
  const twin = await intelligence.getTwinAsOf(NOW);
  assert.equal(injected, true); assert.equal(twin.controlPlane.actions.some((item) => item.status === 'SUCCEEDED'), false);
  assert.ok(twin.controlPlane.actions.some((item) => item.reasons.includes('TOCTOU_AUTHORITY_RECHECK_FAILED')));
  assert.equal(twin.controlPlane.acquisitionRequests.length, 0);
});
