import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { FieldSensorQualificationService } from '../src/modules/fieldnet/field-sensor-qualification-service.mjs';
import { canonical, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';

const mutation = (overrides = {}) => {
  const payload = overrides.payload ?? { observationId: 'field-observation:1', incidentId: 'PT-REAL-1', sourceIdentity: { kind: 'HUMAN' }, observedAt: '2026-08-13T10:00:00Z', receivedAt: '2026-08-13T10:01:00Z' };
  return { id: 'mutation:1', incidentId: 'PT-REAL-1', originNode: 'field-node:1', actor: 'shadow:operator', type: 'FIELD_OBSERVATION_ADDED', priority: 'P2_POSITION', localSequence: 1, wallClockAt: '2026-08-13T10:01:00Z', clockQuality: 'SYNCED', causalMetadata: { nodeSequence: 1 }, payloadHash: sha256(canonical(payload)), payload, ...overrides };
};
const request = (mutations) => ({ schemaVersion: 'vigia.fieldnet-sync-request.v1', nodeId: 'field-node:1', cursor: '0', mutations });
const setup = async (options={}) => {
  const base = path.join(process.cwd(), '.tmp/test'); mkdirSync(base, { recursive: true });
  const filePath = path.join(mkdtempSync(path.join(base, 'central-fieldnet-')), 'ledger.json');
  const operationalEventService = { async operatorEvent(id) { return id === 'PT-REAL-1' ? { event: { id, evidenceState: 'satellite-only', knowledgeState: 'physical_observation_aging', physicalOperationalState: 'AGING_PHYSICAL_EVIDENCE', lastSeenAt: '2026-08-13T09:00:00Z' } } : null; } };
  const service = new CentralFieldNetService({ filePath, operationalEventService, ...options }); await service.initialize();
  return { filePath, operationalEventService, service };
};

test('central FieldNet receiver is idempotent, hash-validating and restart-safe', async () => {
  const changes=[],{ filePath, operationalEventService, service } = await setup({onChanged:(event)=>changes.push(event)});
  const first = await service.sync(request([mutation()]));
  assert.deepEqual(first.acceptedMutationIds, ['mutation:1']);
  assert.equal(first.duplicates, 0);
  const retry = await service.sync(request([mutation()]));
  assert.equal(retry.duplicates, 1);
  assert.deepEqual(changes.flatMap((item)=>item.incidentIds),['PT-REAL-1']);
  const snapshot = service.snapshot('PT-REAL-1');
  assert.equal(snapshot.mutations.length, 1);
  assert.equal(snapshot.mutations[0].actor,'fieldnet-node:field-node:1');assert.equal(snapshot.mutations[0].claimedActor,'shadow:operator');
  assert.equal(snapshot.observations.length, 1);
  assert.deepEqual(snapshot.canonicalIncidentIds, ['PT-REAL-1']);
  const reopened = new CentralFieldNetService({ filePath, operationalEventService }); await reopened.initialize();
  assert.equal(reopened.snapshot('PT-REAL-1').mutations.length, 1);
});

test('central FieldNet receiver rejects bad hashes, unknown events and mutation identity collisions', async () => {
  const { service } = await setup();
  await assert.rejects(service.sync(request([{ ...mutation(), payloadHash: sha256('bad') }])), /payload_hash_mismatch/);
  await assert.rejects(service.sync(request([{ ...mutation(), incidentId: 'UNKNOWN' }])), /canonical_event_not_found/);
  await service.sync(request([mutation()]));
  const changedPayload = { observationId: 'field-observation:1', incidentId: 'PT-REAL-1', changed: true };
  await assert.rejects(service.sync(request([mutation({ payload: changedPayload, payloadHash: sha256(canonical(changedPayload)) })])), /mutation_identity_conflict/);
});

test('central FieldNet rejects forged observation chronology and recomputes freshness from its own receipt',async()=>{
  const now='2026-08-13T10:05:00.000Z',{service}=await setup({clock:()=>new Date(now)}),future={observationId:'field-observation:future',incidentId:'PT-REAL-1',sourceIdentity:{kind:'HUMAN'},observedAt:'2026-08-13T10:10:00Z',receivedAt:'2026-08-13T10:10:01Z',deviceClockQuality:'SYNCED',freshness:'CURRENT_LOCAL'};
  await assert.rejects(service.sync(request([mutation({payload:future,payloadHash:sha256(canonical(future))})])),/fieldnet_observation_future_timestamp/);
  assert.equal(service.snapshot('PT-REAL-1').observations.length,0);
  const old={observationId:'field-observation:old',incidentId:'PT-REAL-1',sourceIdentity:{kind:'HUMAN'},observedAt:'2026-08-13T09:00:00Z',receivedAt:'2026-08-13T09:01:00Z',deviceClockQuality:'SYNCED',freshness:'CURRENT_LOCAL'};
  await service.sync(request([mutation({id:'mutation:old',payload:old,payloadHash:sha256(canonical(old))})]));
  const projected=service.snapshot('PT-REAL-1').observations[0];
  assert.equal(projected.receivedAt,now);assert.equal(projected.claimedReceivedAt,old.receivedAt);assert.equal(projected.claimedFreshness,'CURRENT_LOCAL');assert.equal(projected.freshness,'STALE_AT_CENTRAL_RECEIPT');assert.equal(projected.chronologyAuthority,'CENTRAL_RECEIPT_V1');
});

test('central FieldNet cannot promote a node-selected sensor claim into an independent physical family',async()=>{
  const now='2026-08-13T10:05:00.000Z',{service}=await setup({clock:()=>new Date(now)}),sensor={observationId:'field-observation:forged-sensor',incidentId:'PT-REAL-1',sourceIdentity:{kind:'SENSOR',sensorId:'sensor:unregistered'},deviceId:'device:unregistered',observedAt:'2026-08-13T10:00:00Z',receivedAt:'2026-08-13T10:01:00Z',deviceClockQuality:'SYNCED',calibrationState:'CALIBRATED',physicalFamilyQualification:'QUALIFIED_FIELD_SENSOR_INDEPENDENT_PHYSICAL_FAMILY'};
  await service.sync(request([mutation({id:'mutation:forged-sensor',payload:sensor,payloadHash:sha256(canonical(sensor))})]));
  const projected=service.snapshot('PT-REAL-1').observations[0];
  assert.equal(projected.physicalFamilyQualification,'FIELDNET_SENSOR_NOT_CENTRALLY_REGISTERED');
  assert.equal(projected.calibrationState,'CENTRAL_REGISTRATION_REQUIRED');
  assert.deepEqual(projected.sourceIdentity,{kind:'FIELDNET_NODE_SENSOR_REPORT',sensorId:'sensor:unregistered',originNode:'field-node:1',qualification:'CENTRAL_REGISTRATION_REQUIRED'});
  assert.equal(projected.claimedPhysicalFamilyQualification,'QUALIFIED_FIELD_SENSOR_INDEPENDENT_PHYSICAL_FAMILY');
  assert.deepEqual(projected.claimedSourceIdentity,sensor.sourceIdentity);
});

test('central FieldNet snapshot exposes deterministic non-adjudicating conflict plans', async () => {
  const { service } = await setup();
  const taskPayload={taskId:'task:verify-conflict',incidentId:'PT-REAL-1',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',requiredAction:'Verify conflict'},payload={conflictId:'conflict:task-1',verificationTaskId:taskPayload.taskId,incidentId:'PT-REAL-1',subjectType:'FIELD_TASK',subjectId:'task:1',conflictingFields:['state'],versions:[{origin:'regional',version:2,values:{state:'IN_PROGRESS'}},{origin:'field-node:1',version:1,values:{state:'BLOCKED'}}]};
  const taskMutation=mutation({id:'mutation:task',type:'TASK_CREATED',localSequence:1,payload:taskPayload,payloadHash:sha256(canonical(taskPayload))}),conflict=mutation({id:'mutation:conflict',type:'CONFLICT_CREATED',localSequence:2,payload,payloadHash:sha256(canonical(payload))});
  await service.sync(request([taskMutation,conflict]));
  const snapshot=service.snapshot('PT-REAL-1');
  assert.equal(snapshot.conflicts.length,1);
  assert.equal(snapshot.conflictPlans.length,1);
  assert.equal(snapshot.conflictPlans[0].state,'OPEN_PRESERVED');
  assert.equal('winner' in snapshot.conflictPlans[0],false);
});

test('field sensor qualification service reports the governed no-hardware gate', async () => {
  const service=new FieldSensorQualificationService({hardwareInventoryFile:path.join(process.cwd(),'data/validation/fieldnet/sensors/hardware-discovery.json'),clock:()=>new Date('2026-08-14T10:00:00Z')});
  const status=await service.status();
  assert.equal(status.state,'HARDWARE_NOT_PRESENT');
  assert.equal(status.physicalFamilyEligible,false);
});
