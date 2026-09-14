import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { buildFieldNetCapacityTask } from '../src/modules/response-capability/fieldnet-capacity-task-client.mjs';
import { INCIDENT_ID, NODE_ID, facility, root } from './response-capability-fieldnet-task-fixtures.mjs';

test('hospital and fire task contracts are aggregate, remote-only, deterministic, and PII-free', () => {
  const createdAt = '2026-09-04T15:00:00.000Z';
  for (const kind of ['HOSPITAL', 'FIRE_STATION']) {
    const target = facility(kind);
    const requirement = {
      id: `sha256:${kind.toLowerCase().padEnd(50, 'a')}`,
      incidentId: INCIDENT_ID, subjectId: target.id, createdAt,
      deadline: '2026-09-04T15:30:00.000Z',
      currentAssessment: { nextCheckAt: '2026-09-04T15:15:00.000Z' }
    };
    const first = buildFieldNetCapacityTask({ requirement, facility: target, destinationNodeId: NODE_ID });
    const second = buildFieldNetCapacityTask({ requirement, facility: target, destinationNodeId: NODE_ID });
    assert.deepEqual(first, second);
    assert.equal(first.safeZoneConstraint.mode, 'REMOTE_ONLY');
    assert.equal(first.location, null);
    assert.equal(first.expectedReportTypes[0], kind === 'HOSPITAL' ? 'HOSPITAL_CAPACITY_UPDATE' : 'FIRE_STATION_CAPACITY_UPDATE');
    assert.equal(first.targetObserverClasses.includes('PUBLIC'), false);
    assert.equal(/name|email|phone|address/i.test(Object.keys(first.subject).join(' ')), false);
  }
});

test('canonical cold-start wiring gives only the restricted capacity-task secret to API and never to Operator', async () => {
  const [localRuntime, localRelease] = await Promise.all([
    readFile(path.join(root, 'scripts/local_runtime.mjs'), 'utf8'),
    readFile(path.join(root, 'scripts/release/local_release.mjs'), 'utf8')
  ]);
  const localApi = localRuntime.slice(localRuntime.indexOf("currentComponent='CENTRAL API'"), localRuntime.indexOf("currentComponent='CANONICAL RUNTIME DATA'", localRuntime.indexOf("currentComponent='CENTRAL API'")));
  const localField = localRuntime.slice(localRuntime.indexOf("currentComponent='FIELDNET'"), localRuntime.indexOf("currentComponent='OPERATOR'"));
  const localOperator = localRuntime.slice(localRuntime.indexOf("currentComponent='OPERATOR'"), localRuntime.indexOf("pointer.state='READY'"));
  assert.match(localApi, /FIELDNET_CONTROL_KEY:''/);
  assert.match(localApi, /FIELDNET_CONTROL_KEY_FILE:''/);
  assert.match(localApi, /VIGIA_FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey/);
  assert.match(localApi, /VIGIA_FIELDNET_CAPACITY_TASK_INCIDENT_SCOPES:governedIncidentId/);
  assert.match(localField, /FIELDNET_CONTROL_KEY:fieldControlKey/);
  assert.match(localField, /FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey/);
  assert.doesNotMatch(localOperator, /fieldControlKey|fieldCapacityTaskKey|FIELDNET_CONTROL_KEY|FIELDNET_CAPACITY_TASK_KEY/);

  const sharedStart = localRelease.indexOf('shared={');
  const apiStart = localRelease.indexOf('apiEnvironment={', sharedStart);
  const controlStart = localRelease.indexOf('controlShared={', apiStart);
  const fieldStart = localRelease.indexOf('const fieldEnvironment=', controlStart);
  const operatorStart = localRelease.indexOf("const backendOnly=", fieldStart);
  const shared = localRelease.slice(sharedStart, apiStart);
  const api = localRelease.slice(apiStart, controlStart);
  const field = localRelease.slice(fieldStart, operatorStart);
  assert.match(shared, /FIELDNET_CONTROL_KEY:''/);
  assert.match(shared, /VIGIA_FIELDNET_CAPACITY_TASK_KEY:''/);
  assert.match(api, /VIGIA_FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey/);
  assert.match(api, /VIGIA_FIELDNET_CAPACITY_TASK_INCIDENT_SCOPES:commandSurvivalProof\.incidentId/);
  assert.match(field, /FIELDNET_CONTROL_KEY:fieldControlKey/);
  assert.match(field, /FIELDNET_CAPACITY_TASK_KEY:fieldCapacityTaskKey/);
  assert.match(localRelease, /startProcess\(`vigia-\$\{centralPort\}`,[^\n]+,apiEnvironment\)/);
  assert.match(localRelease, /startProcess\(`fieldnet-\$\{fieldPort\}`,[^\n]+,fieldEnvironment,\{inheritEnvironment:false\}\)/);
  assert.match(localRelease, /operator-console\/scripts\/build\.mjs'\],\{env:shared/);
});
