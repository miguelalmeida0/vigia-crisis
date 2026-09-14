import assert from 'node:assert/strict';
import test from 'node:test';
import { canonical, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldRequest } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import { grant, NOW, proofFixture, request, signedBundle } from '../../../packages/domain/test/intelligence/proof-plane-fixtures.mjs';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';

function authorizedRequest({ command = false } = {}) {
  const nodeId = 'sensor:alpha', incidentId = 'incident:alpha', type = command ? 'COMMAND_SURVIVAL_EVENT' : 'FIELD_OBSERVATION_ADDED';
  const mutation = { id: `mutation:${type}`, incidentId, originNode: nodeId, type, actor: nodeId, payload: { test: true }, payloadHash: sha256(canonical({ test: true })), localSequence: 1 };
  const requestFingerprint = sha256(canonical({ nodeId, incidentId, mutations: [{ id: mutation.id, type, payloadHash: mutation.payloadHash, localSequence: 1 }] }));
  return { input: { nodeId, mutations: [mutation], proofBundles: {} }, requested: request('fieldnet:sync', { incidentId, resourceType: 'fieldnet-sync', resourceId: nodeId, actionClass: 'FIELD_SYNC', sensitivity: 'MEDIUM', requestFingerprint }) };
}

test('FieldNet transport proof is strengthened by machine-principal capability and incident scope', () => {
  const fixture = proofFixture(), transportKey = 'TEST-ONLY-fieldnet-transport-key-32-bytes', built = authorizedRequest();
  built.input.proofBundles['incident:alpha'] = signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: built.requested, sequence: 30,
    grants: [grant('fieldnet:sync', { incidentId: 'incident:alpha', actionClasses: ['FIELD_SYNC'], resourceTypes: ['fieldnet-sync'], resourceIds: ['sensor:alpha'] })] });
  const service = new CentralFieldNetService({ filePath: '.tmp/test/fieldnet-proof-plane.json', operationalEventService: {}, proofPlane: fixture.service,
    nodeRegistry: { 'sensor:alpha': { key: transportKey, status: 'active', principalId: 'sensor:alpha', organizationId: 'org:fire', incidentIds: ['incident:alpha'], capabilities: ['fieldnet:sync', 'fieldnet:command-survival'] } }, clock: () => new Date(NOW) });
  const path = '/api/v10/fieldnet/sync', headers = signFieldRequest({ method: 'POST', path, keyId: 'sensor:alpha', key: transportKey, body: built.input, now: new Date(NOW), nonce: 'transport:30' });
  const principal = service.authorizeSync({ method: 'POST', url: path, headers }, built.input);
  assert.equal(principal.keyId, 'sensor:alpha'); assert.equal(principal.proofAuthorityDecisionIds.length, 1);
});

test('a transport-authorized FieldNet node cannot use a stronger internal command capability through a confused deputy', () => {
  const fixture = proofFixture(), transportKey = 'TEST-ONLY-fieldnet-transport-key-32-bytes', built = authorizedRequest({ command: true });
  built.input.proofBundles['incident:alpha'] = signedBundle(fixture, { principalId: 'sensor:alpha', deviceId: 'device:sensor', request: built.requested, sequence: 31,
    grants: [grant('fieldnet:sync', { incidentId: 'incident:alpha', actionClasses: ['FIELD_SYNC'], resourceTypes: ['fieldnet-sync'], resourceIds: ['sensor:alpha'] })] });
  const service = new CentralFieldNetService({ filePath: '.tmp/test/fieldnet-proof-plane-command.json', operationalEventService: {}, proofPlane: fixture.service,
    nodeRegistry: { 'sensor:alpha': { key: transportKey, status: 'active', principalId: 'sensor:alpha', organizationId: 'org:fire', incidentIds: ['incident:alpha'], capabilities: ['fieldnet:sync', 'fieldnet:command-survival'] } }, clock: () => new Date(NOW) });
  const path = '/api/v10/fieldnet/sync', headers = signFieldRequest({ method: 'POST', path, keyId: 'sensor:alpha', key: transportKey, body: built.input, now: new Date(NOW), nonce: 'transport:31' });
  assert.throws(() => service.authorizeSync({ method: 'POST', url: path, headers }, built.input), /fieldnet_command_proof_authority_forbidden/);
});
