import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FieldNodeStore } from '../src/sqlite-store.mjs';
import { FieldNetService } from '../src/service.mjs';
import { FieldSensorGateway, normalizeSensorThingsObservation } from '../src/sensor-gateway.mjs';
import { createFieldIncidentPackage, createFieldTask, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';import { commandEvent } from '../../../packages/domain/src/incident-command/contracts.mjs';
import { centralResponse, observation, setup } from './field-node-test-fixtures.mjs';

test('durable-store readiness proves an opened writable SQLite transaction', () => {
  const { store } = setup();
  assert.deepEqual(store.readiness(), {
    opened:true,
    writable:true,
    state:'ready',
    mode:'SQLITE_WAL_FULL_SYNC',
    databasePath:store.filePath
  });
  store.close();
});

test('offline reports, contradiction, verification task, ack and restart are durable', () => {
  const { filePath, store, service } = setup();
  const first = service.addObservation(observation({ id: 'obs:a', deviceId: 'device:a', actor: 'shadow:a', claimValue: 'PASSABLE' }), 'shadow:a');
  const second = service.addObservation(observation({ id: 'obs:b', deviceId: 'device:b', actor: 'shadow:b', claimValue: 'BLOCKED' }), 'shadow:b');
  assert.equal(first.conflicts.length, 0);
  assert.equal(second.conflicts.length, 1);
  assert.equal(second.verificationTasks.length, 1);
  const task = second.verificationTasks[0].task;
  const ack = service.acknowledgeTask(task.taskId, { actor: 'shadow:field-team-a', taskVersion: task.version, note: 'accepted offline' });
  const duplicate = service.acknowledgeTask(task.taskId, { actor: 'shadow:field-team-a', taskVersion: task.version, note: 'accepted offline' });
  assert.equal(ack.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  const alertAck = service.acknowledgeAlert('incident:real-test', 'alert:controlled', { actor: 'shadow:field-team-a', alertVersion: 1, note: 'seen locally' });
  assert.equal(alertAck.duplicate, false);
  assert.equal(service.acknowledgeAlert('incident:real-test', 'alert:controlled', { actor: 'shadow:field-team-a', alertVersion: 1, note: 'seen locally' }).duplicate, true);
  const graph = store.truthGraph('incident:real-test');
  assert.equal(graph.currentOperationalInterpretation.state, 'CONFLICT_REQUIRES_VERIFICATION');
  assert.equal(graph.nodes.some((node) => node.kind === 'SOURCE_FRESHNESS' && node.payload.qualification.includes('never CURRENT_LOCAL')), true);
  assert.equal(store.verifyAudit().valid, true);
  const before = store.metrics('incident:real-test');
  store.close();
  const reopened = new FieldNodeStore({ filePath, nodeId: 'field-node:test' });
  assert.deepEqual({ observations: reopened.metrics('incident:real-test').observations, tasks: reopened.metrics('incident:real-test').tasks, acknowledgements: reopened.metrics('incident:real-test').acknowledgements, alertAcknowledgements: reopened.metrics('incident:real-test').alertAcknowledgements }, { observations: before.observations, tasks: before.tasks, acknowledgements: before.acknowledgements, alertAcknowledgements: before.alertAcknowledgements });
  assert.equal(reopened.verifyAudit().valid, true);
  reopened.close();
});
test('stale-base task mutation becomes visible conflict and priority queue defers bulk', () => {
  const { store, service } = setup();
  const created = service.createTask({ taskId: 'task:road', incidentId: 'incident:real-test', requiredAction: 'Check road', owner: 'shadow:a', priority: 'P1_COMMAND' }, 'shadow:lead').task;
  assert.equal(created.priority,'P3_TASK');
  const acknowledged = service.acknowledgeTask(created.taskId, { actor: 'shadow:a', taskVersion: created.version }).task;
  const baseVersion = acknowledged.version;
  const applied = service.mutateTask(created.taskId, { mutationId: 'mutation:task:a', actor: 'shadow:a', baseVersion, changes: { state: 'IN_PROGRESS' } });
  const conflict = service.mutateTask(created.taskId, { mutationId: 'mutation:task:b', actor: 'shadow:b', baseVersion, changes: { state: 'BLOCKED' } });
  assert.equal(applied.outcome, 'APPLY');
  assert.equal(conflict.outcome, 'CONFLICT');
  assert.equal(service.resolveConflict(conflict.conflict.conflictId, { actor: 'shadow:lead', strategy: 'ACCEPT_OFFLINE' }).task.state, 'BLOCKED');
  service.addAnnotation({ mutationId: 'mutation:bulk', incidentId: 'incident:real-test', actor: 'shadow:a', subjectId: 'task:road', body: 'x'.repeat(8_000), priority: 'P6_BULK_MEDIA' });
  store.setConnectionState('LOW_BANDWIDTH');
  const pending = store.pendingSync({ mode: 'LOW_BANDWIDTH' });
  assert.equal(pending.items.some((item) => item.mutationId === 'mutation:bulk'), false);
  assert.equal(store.pendingSync({ mode: 'FULL' }).items.some((item) => item.mutationId === 'mutation:bulk'), true);
  assert.throws(()=>service.mutateTask(created.taskId,{mutationId:'mutation:protected-priority',actor:'shadow:a',baseVersion:store.task(created.taskId).version,changes:{priority:'P1_COMMAND'}}),/protected_task_priority_forbidden/);
  const cursorBefore=store.state().syncCursor;assert.throws(()=>store.updateCursor('../unbounded-cursor'),/central_sync_cursor_invalid/);assert.equal(store.state().syncCursor,cursorBefore);assert.equal(store.updateCursor('cursor:bounded-2'),'cursor:bounded-2');
  store.close();
});

test('sync requires explicit acknowledgements and deduplicates inbound updates', async () => {
  const { store, service, pkg } = setup();
  service.addObservation(observation({ id: 'obs:a', deviceId: 'device:a', actor: 'shadow:a', claimValue: 'PASSABLE' }), 'shadow:a');
  const central = new Map(),syncSequences=[]; let syncHeaders = null; service.centralUrl = 'http://central.test';
  service.fetchFn = async (url, options = {}) => {
    if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
    syncHeaders = options.headers; const request = JSON.parse(options.body);syncSequences.push(...request.mutations.map((mutation)=>mutation.localSequence));
    for (const mutation of request.mutations) central.set(mutation.id, mutation);
    return centralResponse({ acceptedMutationIds: request.mutations.map((item) => item.id), cursor: String(central.size), updates: [{ id: 'central:update:1', incidentId: pkg.incidentId, type: 'CENTRAL_EVENT_SNAPSHOT', actor:'regional-vigia', priority:'P1_COMMAND',payload: { canonicalEventId:'event:controlled',evidenceState:'PERSISTED',knowledgeState:'CURRENT',physicalOperationalState:'UNKNOWN',lastSeenAt:'2026-08-13T10:01:00Z',centralCursor:String(central.size) } }] },options.headers,service.nodeKey);
  };
  const result = await service.checkCentral();
  assert.equal(result.reachable, true);
  assert.equal(store.state().connectionState, 'FULL');
  assert.equal(store.metrics(pkg.incidentId).pendingSync, 0);
  assert.ok(central.size >= 3);assert.deepEqual(syncSequences,[...syncSequences].sort((left,right)=>left-right));
  assert.equal(syncHeaders.authorization, undefined);assert.match(syncHeaders['x-vigia-field-signature'], /^[A-Za-z0-9_-]+$/);
  const duplicateInbound = store.applyInbound([{ id: 'central:update:1', incidentId: pkg.incidentId, type: 'CENTRAL_EVENT_SNAPSHOT',payload:{} }]);
  assert.equal(duplicateInbound.duplicate, 1);
  store.close();
});
test('the exact incident-scoped runtime never drains another retained incident queue',async()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-scoped-sync-')),'field.sqlite'),store=new FieldNodeStore({filePath,nodeId:'field-node:scoped'}),incidentA='incident:scope-a',incidentB='incident:scope-b';
  store.importPackage(createFieldIncidentPackage({incidentId:incidentA,createdAt:'2026-08-13T10:00:00Z'}));store.importPackage(createFieldIncidentPackage({incidentId:incidentB,createdAt:'2026-08-13T10:00:01Z'}));store.addAnnotation({mutationId:'annotation:a',incidentId:incidentA,actor:'field:a',subjectId:incidentA,body:'a'});store.addAnnotation({mutationId:'annotation:b',incidentId:incidentB,actor:'field:b',subjectId:incidentB,body:'b'});
  const received=[];const service=new FieldNetService({store,centralUrl:'http://central.test',nodeKey:'fieldnet-scoped-node-key-32-bytes',incidentId:incidentA,fetchFn:async(_url,options)=>{const input=JSON.parse(options.body),body={acceptedMutationIds:input.mutations.map(item=>item.id),cursor:'1',updates:[]};received.push(...input.mutations);return centralResponse(body,options.headers,'fieldnet-scoped-node-key-32-bytes');}});
  const result=await service.syncOnce();assert.equal(result.pending,0);assert.deepEqual(received.map(item=>item.incidentId),[incidentA]);assert.equal(store.pendingSync({incidentId:incidentA}).pendingTotal,0);assert.equal(store.pendingSync({incidentId:incidentB}).pendingTotal,1);store.close();
});
test('invalid evidence hash and identity collisions are rejected', () => {
  const { store, service } = setup();
  const reconnected = service.registerDevice({ deviceId: 'device:a', deviceType: 'PHONE', hardwareIdentity: 'shadow-hardware:a', ownerOperator: 'shadow:a', capabilities: ['FIELD_REPORT', 'TASK_ACK'], calibrationStatus: 'NOT_APPLICABLE', timeQuality: 'SYNCED', lastSeenAt: '2026-08-13T10:05:00Z' }, 'shadow:a');
  assert.equal(reconnected.reconnected, true);
  assert.throws(() => service.registerDevice({ deviceId: 'device:a', deviceType: 'PHONE', hardwareIdentity: 'different-hardware', ownerOperator: 'shadow:a' }, 'shadow:a'), /device_identity_conflict/);
  assert.throws(() => service.addObservation({ ...observation({ id: 'obs:a', deviceId: 'device:a', actor: 'shadow:a', claimValue: 'PASSABLE' }), rawEvidenceHash: 'not-a-hash' }, 'shadow:a'), /invalid_raw_evidence_hash/);
  service.addObservation(observation({ id: 'obs:a', deviceId: 'device:a', actor: 'shadow:a', claimValue: 'PASSABLE' }), 'shadow:a');
  assert.throws(() => service.addObservation(observation({ id: 'obs:a', deviceId: 'device:a', actor: 'shadow:a', claimValue: 'BLOCKED' }), 'shadow:a'), /observation_id_payload_conflict/);
  store.close();
});

test('bounded queue rejects atomically instead of losing a half-written device', () => {
  const base = path.join(process.cwd(), '.tmp/test');
  mkdirSync(base, { recursive: true });
  const filePath = path.join(mkdtempSync(path.join(base, 'fieldnet-bounded-')), 'field.sqlite');
  const store = new FieldNodeStore({ filePath, nodeId: 'field-node:bounded', maxPending: 1 });
  const service = new FieldNetService({ store });
  const seed=commandEvent({incidentId:'incident:bounded',type:'INCIDENT_IMPORTED',eventId:'seed:incident:bounded',payload:{importHash:'seed:incident:bounded',universe:'SHADOW',canonicalEventIds:['incident:bounded']},source:'TEST',author:'central',responsibleOwner:'central',releaseId:'release:test',observedAt:'2026-08-13T10:00:00Z',receivedAt:'2026-08-13T10:00:00Z'});service.importPackage(createFieldIncidentPackage({ incidentId: 'incident:bounded', createdAt: '2026-08-13T10:00:00Z',currentAlerts:[{id:'alert:bounded',version:1,qualification:'CONTROLLED_TEST'}],commandSurvival:{events:[seed]} }), 'regional-vigia');
  service.registerDevice({ deviceId: 'device:one', deviceType: 'PHONE', hardwareIdentity: 'hardware:one', ownerOperator: 'shadow:one' }, 'shadow:one');
  assert.throws(() => service.registerDevice({ deviceId: 'device:two', deviceType: 'PHONE', hardwareIdentity: 'hardware:two', ownerOperator: 'shadow:two' }, 'shadow:two'), /queue_capacity_reached/);
  assert.doesNotThrow(()=>service.addCommandSurvivalEvent('incident:bounded',{type:'MAYDAY_ACTIVATED',eventId:'mayday:bounded',payload:{maydayId:'mayday:bounded',personId:'person:bounded',timers:{}}},'shadow:one'));
  assert.deepEqual(store.devices().map((item) => item.deviceId), ['device:one']);
  assert.equal(store.verifyAudit().valid, true);
  store.close();
});

test('retained mutation and history ceilings fail closed without half-written observations',()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});
  const retainedPath=path.join(mkdtempSync(path.join(base,'fieldnet-retained-')),'field.sqlite'),retainedStore=new FieldNodeStore({filePath:retainedPath,nodeId:'field-node:retained',maxRetainedMutations:2}),retainedService=new FieldNetService({store:retainedStore});
  retainedService.importPackage(createFieldIncidentPackage({incidentId:'incident:real-test',createdAt:'2026-08-13T10:00:00Z'}),'regional-vigia');retainedService.registerDevice({deviceId:'device:a',deviceType:'PHONE',hardwareIdentity:'hardware:a',ownerOperator:'shadow:a'},'shadow:a');
  assert.throws(()=>retainedService.addObservation(observation({id:'obs:capacity',deviceId:'device:a',actor:'shadow:a',claimValue:'PASSABLE'}),'shadow:a'),(error)=>error.statusCode===507&&error.message==='field_retained_mutation_capacity_reached');assert.equal(retainedStore.metrics('incident:real-test').observations,0);assert.equal(retainedStore.state().capacity.retainedMutations,2);retainedStore.close();

  const historyPath=path.join(mkdtempSync(path.join(base,'fieldnet-history-')),'field.sqlite'),historyStore=new FieldNodeStore({filePath:historyPath,nodeId:'field-node:history',maxRetainedMutations:10,maxHistoryRows:1}),historyService=new FieldNetService({store:historyStore});
  historyService.importPackage(createFieldIncidentPackage({incidentId:'incident:history',createdAt:'2026-08-13T10:00:00Z'}),'regional-vigia');historyService.registerDevice({deviceId:'device:one',deviceType:'PHONE',hardwareIdentity:'hardware:one',ownerOperator:'shadow:one'},'shadow:one');historyService.registerDevice({deviceId:'device:two',deviceType:'PHONE',hardwareIdentity:'hardware:two',ownerOperator:'shadow:two'},'shadow:two');assert.throws(()=>historyStore.devices(),(error)=>error.statusCode===413&&error.message==='field_history_capacity_exceeded');assert.throws(()=>historyStore.audit(),(error)=>error.statusCode===413&&error.message==='field_history_capacity_exceeded');assert.deepEqual(historyStore.verifyAudit(),{valid:true,records:3,headHash:historyStore.db.prepare('SELECT record_hash FROM audit ORDER BY sequence DESC LIMIT 1').get().record_hash});assert.equal(historyService.commandSurvival('incident:history').audit.valid,true);historyStore.close();
});

test('acknowledged low-priority mutations compact into a hash checkpoint and preserve priority reserve',()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-compaction-')),'field.sqlite'),store=new FieldNodeStore({filePath,nodeId:'field-node:compaction',maxRetainedMutations:4,priorityMutationReserve:2}),service=new FieldNetService({store}),incidentId='incident:compaction';
  service.importPackage(createFieldIncidentPackage({incidentId,createdAt:'2026-08-13T10:00:00Z',currentAlerts:[{id:'alert:controlled',version:1,qualification:'CONTROLLED_TEST'}]}),'regional-vigia');
  for(let index=0;index<3;index+=1)service.addAnnotation({mutationId:`annotation:${index}`,incidentId,actor:'shadow:a',subjectId:'incident',body:`note-${index}`,priority:index===0?'P0_LIFE_SAFETY':'P3_TASK'});
  assert.equal(store.pendingSync({mode:'FULL'}).items.find((item)=>item.mutationId==='annotation:0').priority,'P3_TASK');
  assert.throws(()=>service.addAnnotation({mutationId:'annotation:blocked',incidentId,actor:'shadow:a',subjectId:'incident',body:'blocked'}),/field_retained_mutation_capacity_reached/);
  const compacted=store.recordSyncAttempt(store.pendingSync({mode:'FULL'}).items);assert.ok(compacted.compaction.compacted>=2);assert.ok(compacted.compaction.checkpointId);assert.ok(store.state().capacity.compactionCheckpoints>=1);
  while(store.state().capacity.retainedMutations<store.state().capacity.maxRetainedMutations)service.addAnnotation({mutationId:`annotation:refill:${store.state().capacity.retainedMutations}`,incidentId,actor:'shadow:a',subjectId:'incident',body:'refill'});
  assert.doesNotThrow(()=>store.applyInbound([{id:'ordinary:central-snapshot',incidentId,type:'CENTRAL_EVENT_SNAPSHOT',actor:'regional-vigia',priority:'P1_COMMAND',payload:{centralCursor:'1'}}]));assert.ok(store.state().capacity.retainedMutations<=store.state().capacity.maxRetainedMutations);assert.equal(store.db.prepare("SELECT priority FROM mutation WHERE id='ordinary:central-snapshot'").get().priority,'P3_TASK');
  assert.doesNotThrow(()=>service.acknowledgeAlert(incidentId,'alert:controlled',{actor:'shadow:field-team-a',alertVersion:1}));assert.equal(store.verifyAudit().valid,true);store.close();
});

test('acknowledged protected mutations remain locally recoverable after ordinary compaction',()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-protected-compaction-')),'field.sqlite'),store=new FieldNodeStore({filePath,nodeId:'field-node:protected-compaction',maxRetainedMutations:5,priorityMutationReserve:2}),incidentId='incident:protected-compaction';
  store.importPackage(createFieldIncidentPackage({incidentId,createdAt:'2026-08-13T10:00:00Z'}),'regional-vigia');
  for(let index=0;index<4;index+=1)store.createTask(createFieldTask({taskId:`task:protected:${index}`,incidentId,requiredAction:`Governed command ${index}`,priority:'P1_COMMAND'},{now:new Date(`2026-08-13T10:0${index}:00Z`)}),'fieldnet-truth-engine');
  const acknowledged=store.recordSyncAttempt(store.pendingSync({mode:'FULL'}).items);assert.ok(acknowledged.compaction.compacted>=1);assert.ok(acknowledged.compaction.checkpointId);const remainingProtected=Number(store.db.prepare("SELECT count(*) count FROM sync_queue WHERE state='SENT' AND priority IN ('P0_LIFE_SAFETY','P1_COMMAND')").get().count);assert.equal(remainingProtected,4);assert.equal(Number(store.db.prepare("SELECT count(*) count FROM mutation WHERE priority IN ('P0_LIFE_SAFETY','P1_COMMAND')").get().count),4);assert.ok(store.state().capacity.retainedMutations<=store.state().capacity.maxRetainedMutations);assert.equal(store.verifyAudit().valid,true);store.close();
});

test('database byte quota rejects writes before capacity is exceeded',()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-storage-')),'field.sqlite'),store=new FieldNodeStore({filePath,nodeId:'field-node:storage',maxDatabaseBytes:1}),service=new FieldNetService({store});
  assert.throws(()=>service.importPackage(createFieldIncidentPackage({incidentId:'incident:storage',createdAt:'2026-08-13T10:00:00Z'}),'regional-vigia'),(error)=>error.statusCode===507&&error.message==='field_storage_capacity_reached');store.close();
});

test('sync retry exhaustion remains durable and recoverable after five attempts', () => {
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});let now=new Date('2026-08-13T10:00:00Z');const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-retry-recovery-')),'field.sqlite'),store=new FieldNodeStore({filePath,nodeId:'field-node:retry-recovery',clock:()=>now});
  store.importPackage(createFieldIncidentPackage({incidentId:'incident:retry-recovery',createdAt:'2026-08-13T09:00:00Z'}),'regional-vigia');store.addAnnotation({mutationId:'annotation:retry-recovery',incidentId:'incident:retry-recovery',actor:'shadow:a',subjectId:'incident:retry-recovery',body:'durable'});
  const item = store.pendingSync({ mode: 'FULL' }).items[0];assert.ok(item);
  for (let attempt = 0; attempt < 5; attempt += 1) store.recordSyncAttempt([item], 'controlled_transport_failure');
  const metrics = store.metrics('incident:retry-recovery');assert.equal(metrics.failedSync, 1);
  assert.equal(store.pendingSync({ mode: 'FULL' }).items.some((candidate) => candidate.mutationId === item.mutationId), false);
  store.db.prepare("UPDATE sync_queue SET state='FAILED',next_attempt_at=NULL WHERE id=?").run(item.queueId);store.close();now=new Date('2026-08-13T10:01:01Z');const reopened=new FieldNodeStore({filePath,nodeId:'field-node:retry-recovery',clock:()=>now}),retry=reopened.pendingSync({mode:'FULL'}).items.find((candidate)=>candidate.mutationId===item.mutationId);assert.ok(retry);reopened.recordSyncAttempt([retry]);assert.equal(reopened.metrics('incident:retry-recovery').failedSync,0);assert.equal(reopened.pendingSync({mode:'FULL'}).pendingTotal,0);reopened.close();
});

test('newer incident package adds offline geography without losing local state', () => {
  const { store, service, pkg } = setup();
  service.addObservation(observation({ id:'obs:before-upgrade', deviceId:'device:a', actor:'shadow:a', claimValue:'PASSABLE' }), 'shadow:a');
  const upgraded = createFieldIncidentPackage({ incidentId:pkg.incidentId, createdAt:'2026-08-13T11:00:00Z', offlineMap:{ baseLayer:{ state:'LOCAL_OFFLINE_GEOGRAPHY_AND_TERRAIN_PACKAGED', featureCounts:{ road:12 }, terrain:{ state:'LOCAL_DEM_PACKAGED' } } } });
  const result = service.importPackage(upgraded, 'regional-vigia');
  assert.equal(result.upgraded, true);
  assert.equal(store.incident(pkg.incidentId).offlineMap.baseLayer.featureCounts.road, 12);
  assert.equal(store.observations(pkg.incidentId).some((item) => item.observationId === 'obs:before-upgrade'), true);
  assert.throws(() => service.importPackage(createFieldIncidentPackage({ incidentId:pkg.incidentId, createdAt:'2026-08-13T10:30:00Z' }), 'regional-vigia'), /version_not_newer/);
  store.close();
});

test('evidence debt is locally mutable, syncable and replayed with its verification plan', () => {
  const { store, pkg } = setup();
  const contract={ id:'debt:field:test', question:'Which access report is current?', currentState:'OPEN', whyUnknown:'Two field reports disagree.', whyItMatters:'Task routing depends on it.', howWeCanKnow:['Independent eastern-corridor observation'], whatVigiaIsDoing:'VERIFICATION_TASK_PLANNED', closesWhen:'Attributable independent evidence resolves access state.' };
  const created=store.upsertEvidenceDebt(pkg.incidentId,contract,'shadow:lead');
  assert.equal(created.created,true);
  assert.equal(created.mutation.type,'EVIDENCE_DEBT_CREATED');
  const updated=store.upsertEvidenceDebt(pkg.incidentId,{...contract,currentState:'PARTIALLY_MEASURED',currentDenominator:1,targetDenominator:2},'shadow:lead');
  assert.equal(updated.item.revision,2);
  assert.equal(updated.mutation.type,'EVIDENCE_DEBT_UPDATED');
  assert.equal(store.replay(pkg.incidentId).evidenceDebt.find((item)=>item.id===contract.id).currentState,'PARTIALLY_MEASURED');
  assert.equal(store.pendingSync({mode:'FULL'}).items.some((item)=>item.mutation.type==='EVIDENCE_DEBT_UPDATED'),true);
  store.close();
});

test('sensor gateway qualifies complete production enrollment and excludes exercise sensors', () => {
  const { store, service } = setup();
  const gateway = new FieldSensorGateway({ fieldNetService:service, hardwareReportPath:'/not/present', clock:() => new Date('2026-08-13T10:02:00Z') });
  const base = { sensorFamily:'CONTROLLED_THERMAL_PROBE', measurementType:'SURFACE_TEMPERATURE', unit:'degC', calibration:{ status:'CALIBRATED', recordId:'cal:controlled', calibratedAt:'2026-08-01T00:00:00Z' }, location:{ verified:true, geometry:{ type:'Point', coordinates:[-7,40] }, horizontalUncertaintyM:4 }, time:{ quality:'SYNCED', source:'GNSS' }, samplingIntervalMs:10_000, freshnessContractMs:60_000, rawPayloadPolicy:'PRESERVE', failureMode:{ independentFromRegionalSources:true }, firmware:{ version:'controlled-1' }, model:'CONTROLLED_TEST_MODEL', ownerOperator:'shadow:sensor-lead' };
  const qualified = gateway.register({ ...base, sensorId:'sensor:qualified', hardwareIdentity:'hardware:controlled:qualified', stableHardwareIdentity:true, mode:'PRODUCTION' }, 'shadow:sensor-lead');
  assert.equal(qualified.device.currentQualification, 'QUALIFIED_FIELD_SENSOR');
  const observationResult = gateway.ingest({ sensorId:'sensor:qualified', incidentId:'incident:real-test', observedAt:'2026-08-13T10:01:30Z', geometry:{ type:'Point', coordinates:[-7,40] }, horizontalUncertaintyM:4, measurement:{ value:72.4, unit:'degC' }, rawPayload:{ adc:4412, temperatureC:72.4 } }, 'shadow:sensor-gateway');
  assert.equal(observationResult.observation.physicalFamilyQualification, 'QUALIFIED_FIELD_SENSOR_INDEPENDENT_PHYSICAL_FAMILY');
  assert.deepEqual(observationResult.observation.payload.rawPayload, { adc:4412, temperatureC:72.4 });
  const exercise = gateway.register({ ...base, sensorId:'sensor:exercise', hardwareIdentity:'emulator:controlled', stableHardwareIdentity:true, mode:'EXERCISE' }, 'shadow:sensor-lead');
  assert.notEqual(exercise.device.currentQualification, 'QUALIFIED_FIELD_SENSOR');
  const exerciseObservation = gateway.ingest({ sensorId:'sensor:exercise', incidentId:'incident:real-test', observedAt:'2026-08-13T10:01:30Z', measurement:{ value:71, unit:'degC' }, rawPayload:{ emulator:true, value:71 } }, 'shadow:exercise');
  assert.equal(exerciseObservation.observation.physicalFamilyQualification, 'EXERCISE_SENSOR_INELIGIBLE_FOR_PRODUCTION_EVIDENCE');
  const normalized = normalizeSensorThingsObservation({ '@iot.id':91, sensorId:'sensor:qualified', incidentId:'incident:real-test', phenomenonTime:'2026-08-13T10:01:30Z', resultTime:'2026-08-13T10:01:31Z', result:70, unitOfMeasurement:{ symbol:'degC' }, FeatureOfInterest:{ feature:{ type:'Point', coordinates:[-7,40] } } });
  assert.equal(normalized.measurement.value, 70);
  assert.equal(gateway.status().adapters.SENSORTHINGS_V1_1.state, 'READY');
  gateway.close(); store.close();
});
