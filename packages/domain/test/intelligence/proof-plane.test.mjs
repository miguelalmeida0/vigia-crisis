import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeTrustPolicyTransition, createDelegation, createRevocationRegistry, createSignedStatement, createTrustPolicy,
  createTrustRootRegistry, evaluateContinuousTrust, signProofEnvelope, validateDelegation, verifyProofEnvelope
} from '../../src/proof-plane/index.mjs';
import { createCanonicalOperationalEvent, operationalEventStatementHash } from '../../src/event-fabric/index.mjs';
import { delegatedBundle, grant, NOW, proofFixture, request, signedBundle } from './proof-plane-fixtures.mjs';

test('real Ed25519 proof permits bounded authority and rejects forgery and replay', () => {
  const fixture = proofFixture(), requested = request(), bundle = signedBundle(fixture, { request: requested });
  const allowed = fixture.service.authorize(bundle, requested, { at: NOW, consume: true });
  assert.equal(allowed.decision, 'AUTHORIZED'); assert.equal(allowed.proofFingerprints.length, 4);
  const replayed = fixture.service.authorize(bundle, requested, { at: NOW, consume: true });
  assert.equal(replayed.decision, 'DENIED'); assert.match(replayed.reasons.join('|'), /ACTION_REPLAYED/);
  const forged = structuredClone(bundle); forged.actionEnvelope.statement.payload.requestFingerprint = 'forged';
  const denied = fixture.service.authorize(forged, requested, { at: NOW, consume: false });
  assert.equal(denied.decision, 'QUARANTINED'); assert.match(denied.reasons.join('|'), /MALFORMED|INVALID/);
});

test('credential expiry, revocation, and cross-incident escalation fail closed', () => {
  const expiredFixture = proofFixture(), requested = request(), expired = signedBundle(expiredFixture, { request: requested, credentialValidUntil: '2026-08-24T11:59:30Z' });
  assert.equal(expiredFixture.service.authorize(expired, requested, { at: NOW }).decision, 'DENIED');
  const scopedFixture = proofFixture(), otherIncident = request('control:reconcile', { incidentId: 'incident:other' });
  const scoped = signedBundle(scopedFixture, { request: otherIncident, grants: [grant('control:reconcile')] });
  assert.equal(scopedFixture.service.authorize(scoped, otherIncident, { at: NOW }).decision, 'DENIED');
  const revokedFixture = proofFixture(), revokedBundle = signedBundle(revokedFixture, { request: requested, credentialId: 'credential:revoked' });
  revokedFixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'CREDENTIAL', targetId: 'credential:revoked', issuerId: 'org:fire', reason: 'operator removed', effectiveAt: '2026-08-24T11:59:30Z' }]));
  const revoked = revokedFixture.service.authorize(revokedBundle, requested, { at: NOW });
  assert.equal(revoked.decision, 'DENIED'); assert.match(revoked.reasons.join('|'), /CREDENTIAL_REVOKED/);
});

test('soft risk restricts authority and can never manufacture a missing capability', () => {
  const fixture = proofFixture(), requested = request(), valid = signedBundle(fixture, { request: requested, sequence: 1 });
  assert.equal(fixture.service.authorize(valid, requested, { at: NOW, softSignals: ['NEW_DEVICE'] }).decision, 'STEP_UP_REQUIRED');
  const limitedFixture = proofFixture(), limited = signedBundle(limitedFixture, { request: requested });
  assert.equal(limitedFixture.service.authorize(limited, requested, { at: NOW, softSignals: ['UNFAMILIAR_NETWORK'] }).decision, 'LIMITED');
  const missingFixture = proofFixture(), missing = signedBundle(missingFixture, { request: requested, grants: [grant('read:evidence')] });
  assert.equal(missingFixture.service.authorize(missing, requested, { at: NOW, softSignals: [] }).decision, 'DENIED');
  const raw = evaluateContinuousTrust({ at: NOW, policy: fixture.policy, hardPrerequisites: { capability: false }, softSignals: [] });
  assert.equal(raw.decision, 'DENY');
});

test('delegation is explicit, bounded, and cannot exceed parent authority', () => {
  const parent = grant('publish:evidence', { actionClasses: ['EVIDENCE_INGEST'] });
  const bounded = createDelegation({ delegatorPrincipalId: 'controller:alpha', delegatePrincipalId: 'sensor:alpha', organizationId: 'org:fire', parentCredentialId: 'credential:parent',
    grants: [grant('publish:evidence', { actionClasses: ['EVIDENCE_INGEST'] })], depth: 1, validFrom: '2026-08-24T11:00:00Z', validUntil: '2026-08-24T13:00:00Z', purpose: 'bounded sensor ingest' });
  assert.equal(validateDelegation(bounded, [parent], NOW).valid, true);
  const escalated = createDelegation({ ...bounded, grants: [grant('control:consequential')], purpose: 'attempted escalation' });
  assert.equal(validateDelegation(escalated, [parent], NOW).valid, false);
});

test('a signed machine delegation uses only its child scope and preserves the delegator credential binding', () => {
  const fixture = proofFixture(), requested = request('publish:evidence', { incidentId: 'incident:alpha', resourceType: 'operational-event', resourceId: 'event:delegated', actionClass: 'EVIDENCE_INGEST' });
  const parent = grant('publish:evidence', { incidentId: 'incident:alpha', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'] });
  const child = grant('publish:evidence', { incidentId: 'incident:alpha', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'], resourceIds: ['event:delegated'] });
  const bounded = delegatedBundle(fixture, { request: requested, parentGrants: [parent], delegatedGrants: [child] });
  const decision = fixture.service.authorize(bounded, requested, { at: NOW });
  assert.equal(decision.decision, 'AUTHORIZED'); assert.equal(decision.principalId, 'sensor:alpha'); assert.equal(decision.proofFingerprints.length, 5);
  const escalatedFixture = proofFixture(), other = request('publish:evidence', { incidentId: 'incident:other', resourceType: 'operational-event', resourceId: 'event:other', actionClass: 'EVIDENCE_INGEST' });
  const escalated = delegatedBundle(escalatedFixture, { request: other, parentGrants: [parent], delegatedGrants: [grant('publish:evidence', { incidentId: 'incident:other', actionClasses: ['EVIDENCE_INGEST'], resourceTypes: ['operational-event'] })] });
  assert.equal(escalatedFixture.service.authorize(escalated, other, { at: NOW }).decision, 'DENIED');
});

test('key rotation preserves historical proof without allowing expired-key issuance', () => {
  const fixture = proofFixture();
  const registry = createTrustRootRegistry([
    { issuerId: 'controller:alpha', keyId: 'old', publicKey: fixture.keys.controller.publicKey, usages: ['ACTION'], validFrom: '2026-01-01T00:00:00Z', validUntil: '2026-08-24T12:00:00Z' },
    { issuerId: 'controller:alpha', keyId: 'new', publicKey: fixture.keys.rotated.publicKey, usages: ['ACTION'], validFrom: '2026-08-24T12:00:00Z', rotatedFromKeyId: 'old' }
  ]);
  const oldStatement = createSignedStatement({ statementType: 'ACTION_AUTHORIZATION', issuerId: 'controller:alpha', principalId: 'controller:alpha', payload: { requestFingerprint: 'request:1' },
    issuedAt: '2026-08-24T11:59:00Z', expiresAt: '2026-08-24T12:10:00Z', nonce: 'old:1', sequence: 1, keyId: 'old' });
  const oldEnvelope = signProofEnvelope(oldStatement, fixture.keys.controller.privateKey);
  assert.equal(verifyProofEnvelope(oldEnvelope, { trustRoots: registry, revocations: createRevocationRegistry([]), at: '2026-08-24T12:05:00Z', usage: 'ACTION' }).status, 'VALID');
  const invalidLate = createSignedStatement({ ...oldStatement, issuedAt: '2026-08-24T12:01:00Z', notBefore: '2026-08-24T12:01:00Z', nonce: 'old:2', sequence: 2 });
  assert.equal(verifyProofEnvelope(signProofEnvelope(invalidLate, fixture.keys.controller.privateKey), { trustRoots: registry, revocations: createRevocationRegistry([]), at: '2026-08-24T12:05:00Z', usage: 'ACTION' }).status, 'INVALID_PROOF');
});

test('device compromise quarantines signed physical evidence while unsigned public observations stay non-authoritative', () => {
  const fixture = proofFixture();
  const base = { eventType: 'wildfire.observation', hazardType: 'wildfire', provider: { adapterId: 'proof-test', adapterVersion: '1', providerEventId: 'sensor-1' },
    source: { sourceId: 'sensor:alpha', familyId: 'physical.test', familyClass: 'PHYSICAL', producerId: 'sensor:alpha', upstreamOrigin: 'TEST sensor' },
    clocks: { occurredAt: NOW, observedAt: NOW, publishedAt: NOW, receivedAt: NOW, ingestedAt: null }, geometry: [-8, 40], correlationKeys: ['incident:alpha'],
    payload: { observationState: 'OBSERVED_POSITIVE', stance: 'SUPPORTING' }, provenance: { strength: 'VERIFIED', rawPayloadHash: 'sha256:test' } };
  const unsigned = createCanonicalOperationalEvent(base);
  assert.equal(fixture.service.assessOperationalEvent(unsigned, { at: NOW }).state, 'QUARANTINED');
  const eventRequest = request('publish:evidence', { incidentId: 'alpha', resourceType: 'operational-event', resourceId: unsigned.id, actionClass: 'EVIDENCE_INGEST',
    sensitivity: 'MEDIUM', requestFingerprint: operationalEventStatementHash(unsigned) });
  const bundle = signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: eventRequest,
    grants: [grant('publish:evidence', { incidentId: 'alpha', actionClasses: ['EVIDENCE_INGEST'] })], sequence: 3, credentialId: 'credential:sensor' });
  const signed = createCanonicalOperationalEvent({ ...base, proof: { bundle } });
  const accepted = fixture.service.assessOperationalEvent(signed, { at: NOW });
  assert.equal(accepted.state, 'ACCEPTED'); assert.equal(accepted.event.trust.trustZone, 'ORGANIZATION_AUTHORIZED');
  fixture.service.replaceRevocations(createRevocationRegistry([{ targetType: 'DEVICE', targetId: 'device:sensor', issuerId: 'org:fire', reason: 'device compromise', effectiveAt: NOW, compromisedSince: '2026-08-24T11:58:00Z' }]));
  const later = createCanonicalOperationalEvent({ ...base, provider: { ...base.provider, providerEventId: 'sensor-2' }, proof: { bundle: signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: { ...eventRequest, resourceId: 'later', requestFingerprint: 'later' }, grants: [grant('publish:evidence', { incidentId: 'alpha', actionClasses: ['EVIDENCE_INGEST'] })], sequence: 4, credentialId: 'credential:sensor' }) } });
  assert.equal(fixture.service.assessOperationalEvent(later, { at: NOW }).state, 'QUARANTINED');
  const report = createCanonicalOperationalEvent({ ...base, provider: { ...base.provider, providerEventId: 'public-1' }, source: { ...base.source, sourceId: 'public:report', familyId: 'report.public', familyClass: 'REPORT', producerId: 'public:report' } });
  const publicAssessment = fixture.service.assessOperationalEvent(report, { at: NOW });
  assert.equal(publicAssessment.state, 'ACCEPTED'); assert.equal(publicAssessment.trust.authority, 'NONE');
});

test('transparency receipt chain and proof replay detect substitution', () => {
  const fixture = proofFixture(), requested = request(); fixture.service.authorize(signedBundle(fixture, { request: requested }), requested, { at: NOW });
  const first = fixture.service.createReplay(NOW), second = fixture.service.createReplay(NOW);
  assert.equal(first.replayHash, second.replayHash); assert.equal(fixture.service.verifyReplay(first).valid, true);
  const tampered = structuredClone(first); tampered.receipts[0].decisionHash = 'tampered';
  assert.equal(fixture.service.verifyReplay(tampered).valid, false);
});

test('trust-policy modification requires its own scoped capability and remains version-bound', () => {
  const current = createTrustPolicy({ id: 'trust:operational', version: '1', validFrom: '2026-01-01T00:00:00Z' });
  const proposed = createTrustPolicy({ id: 'trust:operational', version: '2', validFrom: '2026-09-01T00:00:00Z', maximumSessionAgeMs: 3_600_000 });
  const denied = authorizeTrustPolicyTransition({ currentPolicy: current, proposedPolicy: proposed, grants: [], principalId: 'controller:alpha', organizationId: 'org:fire', at: NOW });
  assert.equal(denied.state, 'DENIED');
  const allowed = authorizeTrustPolicyTransition({ currentPolicy: current, proposedPolicy: proposed,
    grants: [grant('trust-policy:modify', { incidentId: '*', actionClasses: ['POLICY_MODIFICATION'], resourceTypes: ['trust-policy'], resourceIds: ['trust:operational'] })],
    principalId: 'controller:alpha', organizationId: 'org:fire', at: NOW });
  assert.equal(allowed.state, 'AUTHORIZED'); assert.notEqual(allowed.from.fingerprint, allowed.to.fingerprint);
});
