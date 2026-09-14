import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { FieldNodeStore } from '../src/sqlite-store.mjs';
import { FieldNetService } from '../src/service.mjs';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';

export const centralResponse = (body, headers, key) => new Response(JSON.stringify(body), {
  status: 200,
  headers: {
    'content-type': 'application/json',
    ...signFieldResponse({
      keyId: headers['x-vigia-field-key-id'],
      key,
      requestNonce: headers['x-vigia-field-nonce'],
      requestBodyHash: headers['x-vigia-field-body-sha256'],
      body
    })
  }
});

export const setup = () => {
  const base = path.join(process.cwd(), '.tmp/test');
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(path.join(base, 'fieldnet-'));
  const filePath = path.join(directory, 'field.sqlite');
  const store = new FieldNodeStore({ filePath, nodeId: 'field-node:test' });
  const service = new FieldNetService({ store, nodeKey: 'fieldnet-test-node-key-32-bytes-minimum' });
  const pkg = createFieldIncidentPackage({
    incidentId: 'incident:real-test',
    createdAt: '2026-08-13T10:00:00Z',
    currentAlerts: [{ id: 'alert:controlled', version: 1, qualification: 'CONTROLLED_TEST' }],
    sourceFreshness: { viirs: { sourceFamily: 'viirs', lastReceivedAt: '2026-08-13T09:55:00Z', freshnessContractMs: 600_000 } }
  });
  service.importPackage(pkg, 'regional-vigia');
  service.registerDevice({ deviceId: 'device:a', deviceType: 'PHONE', hardwareIdentity: 'shadow-hardware:a', ownerOperator: 'shadow:a', capabilities: ['FIELD_REPORT'], calibrationStatus: 'NOT_APPLICABLE', timeQuality: 'SYNCED' }, 'shadow:a');
  service.registerDevice({ deviceId: 'device:b', deviceType: 'PHONE', hardwareIdentity: 'shadow-hardware:b', ownerOperator: 'shadow:b', capabilities: ['FIELD_REPORT'], calibrationStatus: 'NOT_APPLICABLE', timeQuality: 'SKEWED' }, 'shadow:b');
  return { directory, filePath, store, service, pkg };
};

export const observation = ({ id, deviceId, actor, claimValue, receivedAt = '2026-08-13T10:01:00Z' }) => ({
  observationId: id,
  incidentId: 'incident:real-test',
  deviceId,
  observerIdentity: actor,
  sourceIdentity: { kind: 'HUMAN' },
  observedAt: '2026-08-13T10:00:00Z',
  receivedAt,
  deviceClockQuality: deviceId === 'device:b' ? 'SKEWED' : 'SYNCED',
  geometry: { type: 'Point', coordinates: [-7, 40] },
  horizontalUncertaintyM: 12,
  observationType: 'ACCESS_CONDITION',
  payload: { subjectKey: 'road:alpha', claimField: 'access', claimValue },
  rawEvidenceHash: sha256(`controlled-exercise:${id}`),
  causalMetadata: { clientSequence: 1 },
  verificationOwner: 'shadow:field-team-a'
});
