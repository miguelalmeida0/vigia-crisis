import { generateKeyPairSync } from 'node:crypto';
import { semanticHash } from '../../src/intelligence/shared.mjs';
import {
  createCapabilityGrant, createCredentialClaim, createDelegation, createDeviceAttestationPayload, createDeviceIdentity, createRevocationRegistry,
  createSessionClaim, createSignedStatement, createTrustPolicy, createTrustRootRegistry, exportPublicKey, signProofEnvelope
} from '../../src/proof-plane/index.mjs';
import { ProofPlaneService } from '../../../../apps/api/src/modules/intelligence/proof-plane-service.mjs';

export const NOW = '2026-08-24T12:00:00.000Z';
const key = () => { const pair = generateKeyPairSync('ed25519'); return { privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() }; };

export function proofFixture() {
  // Ephemeral TEST ONLY keys. No production private key is stored in the repository.
  const keys = { organization: key(), controller: key(), sensor: key(), attester: key(), transparency: key(), rotated: key() };
  const roots = createTrustRootRegistry([
    { issuerId: 'org:fire', organizationId: 'org:fire', keyId: 'org-key-1', publicKey: keys.organization.publicKey, usages: ['CREDENTIAL', 'SESSION'], validFrom: '2026-01-01T00:00:00Z' },
    { issuerId: 'controller:alpha', organizationId: 'org:fire', keyId: 'controller-key-1', publicKey: keys.controller.publicKey, usages: ['ACTION'], validFrom: '2026-01-01T00:00:00Z' },
    { issuerId: 'sensor:alpha', organizationId: 'org:fire', keyId: 'sensor-key-1', publicKey: keys.sensor.publicKey, usages: ['ACTION'], validFrom: '2026-01-01T00:00:00Z' },
    { issuerId: 'attester:test', organizationId: 'org:fire', keyId: 'attester-key-1', publicKey: keys.attester.publicKey, usages: ['ATTESTATION'], validFrom: '2026-01-01T00:00:00Z' }
  ]);
  const devices = [
    createDeviceIdentity({ id: 'device:controller', principalId: 'controller:alpha', organizationId: 'org:fire', hardwareIdentity: 'hw:controller', deviceClass: 'SERVICE_HOST', publicKeyIds: ['controller-key-1'], registeredAt: '2026-01-01T00:00:00Z' }),
    createDeviceIdentity({ id: 'device:sensor', principalId: 'sensor:alpha', organizationId: 'org:fire', hardwareIdentity: 'hw:sensor', deviceClass: 'FIELD_SENSOR', publicKeyIds: ['sensor-key-1'], registeredAt: '2026-01-01T00:00:00Z' })
  ];
  const policy = createTrustPolicy({ id: 'trust:operational', version: '1.0.0', validFrom: '2026-01-01T00:00:00Z',
    requiredAttestationBySensitivity: { LOW: 'SOFTWARE', MEDIUM: 'HARDWARE_BOUND', HIGH: 'MEASURED_BOOT' } });
  const service = new ProofPlaneService({ trustRoots: roots, revocations: createRevocationRegistry([]), trustPolicy: policy, devices, clock: () => new Date(NOW),
    transparencySigner: { keyId: 'TEST-transparency-key', privateKey: keys.transparency.privateKey }, transparencyPublicKeys: { 'TEST-transparency-key': keys.transparency.publicKey } });
  return { keys, roots, devices, policy, service };
}

export function grant(capability, { incidentId = 'incident:alpha', actionClasses = ['*'], resourceTypes = ['*'], resourceIds = ['*'], validUntil = '2026-08-26T00:00:00Z' } = {}) {
  return createCapabilityGrant({ capability, scope: { organizationId: 'org:fire', incidentIds: [incidentId], actionClasses, resourceTypes, resourceIds },
    validFrom: '2026-08-20T00:00:00Z', validUntil, delegable: true, maxDelegationDepth: 2 });
}

export function request(capability = 'control:reconcile', overrides = {}) {
  const value = { capability, organizationId: 'org:fire', incidentId: 'incident:alpha', resourceType: 'control-plane', resourceId: 'incident:alpha',
    actionClass: 'RECONCILIATION', sensitivity: 'MEDIUM', ...overrides };
  return { ...value, requestFingerprint: overrides.requestFingerprint ?? semanticHash('capability-request', value) };
}

export function signedBundle(fixture, { principalId = 'controller:alpha', deviceId = 'device:controller', grants = [grant('control:reconcile')],
  request: requested = request(), sequence = 1, nonce = `nonce:${sequence}`, credentialId = `credential:${principalId}:${sequence}`,
  credentialValidUntil = '2026-08-26T00:00:00Z', issuedAt = '2026-08-24T11:59:00Z', actionExpiresAt = '2026-08-24T12:10:00Z', sessionId = `session:${principalId}:${sequence}` } = {}) {
  const principalKey = principalId === 'sensor:alpha' ? fixture.keys.sensor : fixture.keys.controller;
  const principalKeyId = principalId === 'sensor:alpha' ? 'sensor-key-1' : 'controller-key-1';
  const credentialClaim = createCredentialClaim({ credentialId, subjectPrincipalId: principalId, organizationId: 'org:fire', roleIds: [principalId === 'sensor:alpha' ? 'sensor' : 'controller'], grants,
    issuedAt, validFrom: issuedAt, validUntil: credentialValidUntil, assuranceLevel: 'HIGH' });
  const credentialStatement = createSignedStatement({ statementType: 'CREDENTIAL', issuerId: 'org:fire', principalId: 'org:fire', organizationId: 'org:fire', subjectId: principalId,
    payload: credentialClaim, issuedAt, expiresAt: '2026-08-30T00:00:00Z', nonce: `credential:${nonce}`, sequence, keyId: 'org-key-1' });
  const credentialEnvelope = signProofEnvelope(credentialStatement, fixture.keys.organization.privateKey);
  const sessionClaim = createSessionClaim({ sessionId, principalId, organizationId: 'org:fire', credentialId, deviceId, authenticationMethods: ['TEST_SIGNATURE'],
    issuedAt, expiresAt: actionExpiresAt, channelBinding: `TEST-channel:${principalId}` });
  const sessionStatement = createSignedStatement({ statementType: 'SESSION', issuerId: 'org:fire', principalId: 'org:fire', organizationId: 'org:fire', subjectId: principalId,
    payload: sessionClaim, deviceId, issuedAt, expiresAt: actionExpiresAt, nonce: `session:${nonce}`, sequence, keyId: 'org-key-1' });
  const sessionEnvelope = signProofEnvelope(sessionStatement, fixture.keys.organization.privateKey);
  const hardwareIdentity = deviceId === 'device:sensor' ? 'hw:sensor' : 'hw:controller';
  const attestationClaim = createDeviceAttestationPayload({ deviceId, hardwareIdentity, level: 'HARDWARE_BOUND', measurements: { testFixture: true }, firmwareVersion: 'TEST-1', bootState: 'VERIFIED', attestedAt: issuedAt });
  const attestationStatement = createSignedStatement({ statementType: 'DEVICE_ATTESTATION', issuerId: 'attester:test', principalId: 'attester:test', organizationId: 'org:fire',
    subjectId: deviceId, deviceId, payload: attestationClaim, issuedAt, expiresAt: actionExpiresAt, nonce: `attestation:${nonce}`, sequence, keyId: 'attester-key-1' });
  const deviceAttestationEnvelope = signProofEnvelope(attestationStatement, fixture.keys.attester.privateKey);
  const actionStatement = createSignedStatement({ statementType: requested.actionClass === 'EVIDENCE_INGEST' ? 'EVIDENCE_STATEMENT' : 'ACTION_AUTHORIZATION', issuerId: principalId, principalId,
    organizationId: 'org:fire', subjectId: requested.resourceId, payload: { requestFingerprint: requested.requestFingerprint }, scope: { incidentId: requested.incidentId },
    credentialRefs: [credentialId], deviceId, sessionId, issuedAt, expiresAt: actionExpiresAt, nonce, sequence, keyId: principalKeyId });
  const actionEnvelope = signProofEnvelope(actionStatement, principalKey.privateKey);
  return { actionEnvelope, credentialEnvelope, sessionEnvelope, deviceAttestationEnvelope };
}

export function publicKeyFor(privateKey) { return exportPublicKey(privateKey); }

export function delegatedBundle(fixture, { request: requested, parentGrants, delegatedGrants, sequence = 50, credentialId = 'credential:delegator' } = {}) {
  const bundle = signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: requested, grants: parentGrants, sequence, credentialId });
  const issuedAt = '2026-08-24T11:59:00Z', parent = createCredentialClaim({ credentialId, subjectPrincipalId: 'controller:alpha', organizationId: 'org:fire', roleIds: ['controller'],
    grants: parentGrants, issuedAt, validFrom: issuedAt, validUntil: '2026-08-26T00:00:00Z', assuranceLevel: 'HIGH' });
  const parentStatement = createSignedStatement({ statementType: 'CREDENTIAL', issuerId: 'org:fire', principalId: 'org:fire', organizationId: 'org:fire', subjectId: 'controller:alpha',
    payload: parent, issuedAt, expiresAt: '2026-08-30T00:00:00Z', nonce: `delegated-credential:${sequence}`, sequence, keyId: 'org-key-1' });
  const delegation = createDelegation({ delegatorPrincipalId: 'controller:alpha', delegatePrincipalId: 'sensor:alpha', organizationId: 'org:fire', parentCredentialId: credentialId,
    grants: delegatedGrants, depth: 1, validFrom: issuedAt, validUntil: '2026-08-24T12:10:00Z', purpose: 'TEST ONLY bounded machine delegation' });
  const delegationStatement = createSignedStatement({ statementType: 'DELEGATION', issuerId: 'org:fire', principalId: 'org:fire', organizationId: 'org:fire', subjectId: 'sensor:alpha',
    payload: delegation, issuedAt, expiresAt: '2026-08-24T12:10:00Z', nonce: `delegation:${sequence}`, sequence, keyId: 'org-key-1' });
  const actionInput = { ...bundle.actionEnvelope.statement, payload: { ...bundle.actionEnvelope.statement.payload, delegationId: delegation.id } };
  delete actionInput.statementHash;
  return { ...bundle, credentialEnvelope: signProofEnvelope(parentStatement, fixture.keys.organization.privateKey),
    delegationEnvelope: signProofEnvelope(delegationStatement, fixture.keys.organization.privateKey),
    actionEnvelope: signProofEnvelope(createSignedStatement(actionInput), fixture.keys.sensor.privateKey) };
}
