import assert from 'node:assert/strict';
import { createCanonicalOperationalEvent, createSourceRegistry, operationalEventStatementHash } from '../packages/domain/src/event-fabric/index.mjs';
import { createRevocationRegistry } from '../packages/domain/src/proof-plane/index.mjs';
import { createWildfireControlPolicies, evaluateKillSwitch } from '../packages/domain/src/control-plane/index.mjs';
import { grant, NOW, proofFixture, request, signedBundle } from '../packages/domain/test/intelligence/proof-plane-fixtures.mjs';
import { ControlPlaneService } from '../apps/api/src/modules/intelligence/control-plane-service.mjs';
import { MemoryOperationalEventJournal } from '../apps/api/src/modules/intelligence/memory-event-journal.mjs';
import { OperationalIntelligenceService } from '../apps/api/src/modules/intelligence/operational-intelligence-service.mjs';

const results = [], step = (label, outcome, details = {}) => { const item = { step: results.length + 1, label, outcome, ...details }; results.push(item); process.stdout.write(`${String(item.step).padStart(2, '0')}. ${label} -> ${outcome}\n`); };
const physical = ({ id, incidentId = 'alpha', proof = {} } = {}) => createCanonicalOperationalEvent({ eventType: 'wildfire.observation', hazardType: 'wildfire',
  provider: { adapterId: 'proof-demo', adapterVersion: '1', providerEventId: id }, source: { sourceId: 'sensor:alpha', familyId: 'physical.demo', familyClass: 'PHYSICAL', producerId: 'sensor:alpha', upstreamOrigin: 'TEST demo sensor' },
  clocks: { occurredAt: '2026-08-24T11:58:00Z', observedAt: '2026-08-24T11:58:00Z', publishedAt: '2026-08-24T11:59:00Z', receivedAt: NOW, ingestedAt: null }, geometry: [-8, 40], correlationKeys: [`incident:${incidentId}`],
  payload: { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING', materiality: 'MATERIAL', opportunity: { state: 'VALID' } }, provenance: { strength: 'VERIFIED', rawPayloadHash: 'sha256:TEST-demo' }, proof });

const fixture = proofFixture();
step('trust roots and dedicated TEST receipt key', 'LOADED', { fingerprint: fixture.roots.fingerprint });
const boundedRequest = request(), boundedBundle = signedBundle(fixture, { request: boundedRequest, sequence: 1 });
const verified = fixture.service.authorize(boundedBundle, boundedRequest, { at: NOW }); assert.equal(verified.decision, 'AUTHORIZED');
step('valid signed actor', 'VERIFIED');
const forged = structuredClone(boundedBundle); forged.actionEnvelope.statement.payload.requestFingerprint = 'forged';
assert.equal(fixture.service.authorize(forged, boundedRequest, { at: NOW }).decision, 'QUARANTINED'); step('forged actor', 'DENIED_AND_QUARANTINED');
const replayFixture = proofFixture(), replayBundle = signedBundle(replayFixture, { request: boundedRequest, sequence: 2 });
replayFixture.service.authorize(replayBundle, boundedRequest, { at: NOW, consume: true });
assert.equal(replayFixture.service.authorize(replayBundle, boundedRequest, { at: NOW, consume: true }).decision, 'DENIED'); step('replayed request', 'REJECTED');
const expiredFixture = proofFixture(), expired = signedBundle(expiredFixture, { request: boundedRequest, credentialValidUntil: '2026-08-24T11:59:30Z' });
assert.equal(expiredFixture.service.authorize(expired, boundedRequest, { at: NOW }).decision, 'DENIED'); step('expired credential', 'DENIED');
const revokedFixture = proofFixture(), revoked = signedBundle(revokedFixture, { request: boundedRequest, credentialId: 'credential:revoked' });
revokedFixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'CREDENTIAL', targetId: 'credential:revoked', issuerId: 'org:fire', reason: 'demo revocation', effectiveAt: '2026-08-24T11:59:30Z' }]));
assert.equal(revokedFixture.service.authorize(revoked, boundedRequest, { at: NOW }).decision, 'DENIED'); step('revoked credential', 'DENIED');
const scopeFixture = proofFixture(), crossRequest = request('control:reconcile', { incidentId: 'incident:other' });
assert.equal(scopeFixture.service.authorize(signedBundle(scopeFixture, { request: crossRequest, grants: [grant('control:reconcile')] }), crossRequest, { at: NOW }).decision, 'DENIED'); step('cross-incident capability', 'DENIED');
step('valid bounded capability', verified.decision);
const riskFixture = proofFixture(); assert.equal(riskFixture.service.authorize(signedBundle(riskFixture, { request: boundedRequest }), boundedRequest, { at: NOW, softSignals: ['NEW_DEVICE'] }).decision, 'STEP_UP_REQUIRED');
step('new/risky device', 'STEP_UP');
const limitedFixture = proofFixture(); assert.equal(limitedFixture.service.authorize(signedBundle(limitedFixture, { request: boundedRequest }), boundedRequest, { at: NOW, softSignals: ['UNFAMILIAR_NETWORK'] }).decision, 'LIMITED');
const noCapFixture = proofFixture(); assert.equal(noCapFixture.service.authorize(signedBundle(noCapFixture, { request: boundedRequest, grants: [grant('read:evidence')] }), boundedRequest, { at: NOW }).decision, 'DENIED');
step('soft risk with no underlying authority', 'DENIED');
const publicEvent = createCanonicalOperationalEvent({ ...physical({ id: 'public' }), source: { sourceId: 'public:report', familyId: 'report.public', familyClass: 'REPORT', producerId: 'public:report', upstreamOrigin: 'public demo' } });
assert.equal(fixture.service.assessOperationalEvent(publicEvent, { at: NOW }).trust.authority, 'NONE'); step('unsigned public observation', 'ACCEPTED_WITHOUT_AUTHORITY');
const unsignedSensor = physical({ id: 'unsigned-sensor' }); assert.equal(fixture.service.assessOperationalEvent(unsignedSensor, { at: NOW }).state, 'QUARANTINED'); step('unsigned physical evidence', 'QUARANTINED');
const sensorFixture = proofFixture(), unsignedSigned = physical({ id: 'signed-sensor' }), eventRequest = request('publish:evidence', { incidentId: 'alpha', resourceType: 'operational-event', resourceId: unsignedSigned.id,
  actionClass: 'EVIDENCE_INGEST', sensitivity: 'MEDIUM', requestFingerprint: operationalEventStatementHash(unsignedSigned) });
const sensorBundle = signedBundle(sensorFixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: eventRequest, sequence: 7, credentialId: 'credential:sensor', grants: [grant('publish:evidence', { incidentId: 'alpha', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'] })] });
assert.equal(sensorFixture.service.assessOperationalEvent(physical({ id: 'signed-sensor', proof: { bundle: sensorBundle } }), { at: NOW }).state, 'ACCEPTED'); step('signed sensor evidence', 'ORGANIZATION_AUTHORIZED');
sensorFixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'DEVICE', targetId: 'device:sensor', issuerId: 'org:fire', reason: 'demo compromise', effectiveAt: NOW, compromisedSince: '2026-08-24T11:57:00Z' }]));
const revokedUnsigned = physical({ id: 'revoked-sensor' }), revokedRequest = { ...eventRequest, resourceId: revokedUnsigned.id, requestFingerprint: operationalEventStatementHash(revokedUnsigned) };
const revokedSensorBundle = signedBundle(sensorFixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: revokedRequest, sequence: 8, credentialId: 'credential:sensor', grants: [grant('publish:evidence', { incidentId: 'alpha', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'] })] });
assert.equal(sensorFixture.service.assessOperationalEvent(physical({ id: 'revoked-sensor', proof: { bundle: revokedSensorBundle } }), { at: NOW }).state, 'QUARANTINED'); step('revoked sensor', 'EVIDENCE_QUARANTINED');

const controlFixture = proofFixture(), incidentId = 'incident:proof-demo', common = { staleAfterMs: 21_600_000, registeredAt: '2026-08-24T11:00:00Z', capabilities: ['FAMILY_CLASS_QUORUM'], geographicApplicability: { bbox: [-9, 39, -7, 41] } };
const registry = createSourceRegistry([
  { ...common, sourceId: 'public:report', familyId: 'report.public', familyClass: 'REPORT', metadata: { priority: 1, provenanceStrength: 'ATTRIBUTED' } },
  { ...common, sourceId: 'sensor:alpha', familyId: 'physical.demo', familyClass: 'PHYSICAL', metadata: { priority: 1, provenanceStrength: 'VERIFIED' } },
  { ...common, sourceId: 'official:alpha', familyId: 'official.demo', familyClass: 'OFFICIAL', metadata: { priority: 1, provenanceStrength: 'VERIFIED' } }
]);
const intelligence = new OperationalIntelligenceService({ journal: new MemoryOperationalEventJournal(), sourceRegistry: registry, proofPlane: controlFixture.service, clock: () => new Date(NOW) });
const reportInput = structuredClone(publicEvent); delete reportInput.id; delete reportInput.fingerprint; reportInput.provider.providerEventId = 'control-report'; reportInput.correlationKeys = [incidentId]; reportInput.correlationId = incidentId;
const report = createCanonicalOperationalEvent(reportInput); await intelligence.ingestOperationalEvent(report, { ingestedAt: NOW, project: false });
const openRequest = request('control:reconcile', { incidentId, resourceId: incidentId, requestFingerprint: 'proof-demo:control' }), controlGrants = [
  grant('control:reconcile', { incidentId, actionClasses: ['RECONCILIATION'], resourceTypes: ['control-plane'], resourceIds: [incidentId] }),
  grant('control:evidence-acquisition', { incidentId, actionClasses: ['BOUNDED_OPERATIONAL'], resourceTypes: ['control-action'] }), grant('control:reversible', { incidentId, actionClasses: ['REVERSIBLE'], resourceTypes: ['control-action'] }),
  grant('control:contradiction-work', { incidentId, actionClasses: ['BOUNDED_OPERATIONAL'], resourceTypes: ['control-action'] }), grant('control:consequential', { incidentId, actionClasses: ['CONSEQUENTIAL'], resourceTypes: ['control-action'] }) ];
const opened = controlFixture.service.openControlContext(signedBundle(controlFixture, { request: openRequest, grants: controlGrants, sequence: 40, credentialId: 'credential:controller' }),
  { organizationId: 'org:fire', incidentId, requestFingerprint: openRequest.requestFingerprint, sensitivity: 'MEDIUM' }, { at: NOW }); assert.ok(opened.context); step('trusted controller context', 'VERIFIED');
const control = new ControlPlaneService({ intelligenceService: intelligence, policies: createWildfireControlPolicies(), proofPlane: controlFixture.service, clock: () => new Date(NOW) });
await control.reconcile({ asOf: NOW, trustContext: opened.context, consequentialIntentByIncident: { [incidentId]: true } }); const twin = await intelligence.getTwinAsOf(NOW);
assert.ok(twin.controlPlane.actions.some((action) => action.status === 'SUCCEEDED')); step('trusted controller bounded reconciliation', 'PERMITTED');
assert.ok(twin.controlPlane.actions.some((action) => action.status === 'AUTHORIZED_BUT_EXECUTION_DISABLED')); step('consequential action authority', 'UNDERSTOOD');
assert.equal(twin.controlPlane.actions.some((action) => action.safetyClass === 'CONSEQUENTIAL' && action.status === 'SUCCEEDED'), false); step('consequential external execution', 'DISABLED_ZERO_EFFECTS');
const consequential = twin.controlPlane.actions.find((action) => action.safetyClass === 'CONSEQUENTIAL'); assert.equal(evaluateKillSwitch({ engaged: true, scopes: ['ALL'], reason: 'demo stop' }, consequential, NOW).allowed, false); step('automation kill switch', 'ENFORCED');
const proofReplay = controlFixture.service.createReplay(NOW); assert.equal(controlFixture.service.verifyReplay(proofReplay).valid, true); step('receipt chain', 'VERIFIED');
const trustedReplay = await intelligence.createTrustedReplay(NOW), trustedAgain = await intelligence.createTrustedReplay(NOW); assert.equal(trustedAgain.replayHash, trustedReplay.replayHash); assert.equal((await intelligence.verifyTrustedReplay(trustedReplay)).valid, true); step('full replay', 'DETERMINISTIC');
const tampered = structuredClone(trustedReplay); tampered.proof.receipts[0].decisionHash = 'substituted'; assert.equal((await intelligence.verifyTrustedReplay(tampered)).valid, false); step('receipt/replay substitution', 'DETECTED');

assert.equal(results.length, 22);
process.stdout.write(`${JSON.stringify({ schemaVersion: 'vigia.proof-plane-demo.v1', state: 'PASS', steps: results.length, boundedEffects: twin.controlPlane.actions.filter((item) => item.status === 'SUCCEEDED').length,
  consequentialEffects: twin.controlPlane.actions.filter((item) => item.safetyClass === 'CONSEQUENTIAL' && item.status === 'SUCCEEDED').length, receiptCount: proofReplay.receipts.length, replayHash: trustedReplay.replayHash }, null, 2)}\n`);
