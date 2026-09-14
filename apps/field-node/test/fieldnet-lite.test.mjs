import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createFieldIncidentPackage, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { signFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import { FieldNetService } from '../src/service.mjs';
import { FieldNodeStore } from '../src/sqlite-store.mjs';

const NOW = new Date('2026-09-04T12:00:00Z');
const NODE_KEY='fieldnet-lite-node-key-32-bytes-minimum';
const centralResponse=(body,headers)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json',...signFieldResponse({keyId:headers['x-vigia-field-key-id'],key:NODE_KEY,requestNonce:headers['x-vigia-field-nonce'],requestBodyHash:headers['x-vigia-field-body-sha256'],body})}});

function setup() {
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});
  const directory=mkdtempSync(path.join(base,'fieldnet-lite-')),filePath=path.join(directory,'field.sqlite');
  const store=new FieldNodeStore({filePath,nodeId:'field-node:lite',clock:()=>NOW});
  const service=new FieldNetService({store,clock:()=>NOW,incidentId:'incident:lite',nodeKey:NODE_KEY});
  service.importPackage(createFieldIncidentPackage({incidentId:'incident:lite',createdAt:'2026-09-04T11:00:00Z'}),'regional-vigia');
  service.registerDevice({
    deviceId:'device:municipal:1',deviceType:'PHONE',hardwareIdentity:'hardware:municipal:1',ownerOperator:'observer:municipal:1',capabilities:['STRUCTURED_FIELD_REPORT','TASK_ACK'],timeQuality:'SYNCED',
    observer:{observerId:'observer:municipal:1',observerClass:'MUNICIPAL_OPERATOR',verificationState:'ROLE_ATTESTED',organizationId:'municipality:1',attestationReference:'attestation:municipal:1',attestedBy:'field-control:regional',attestedAt:'2026-09-04T10:00:00Z'}
  },'field-control:regional');
  return{directory,filePath,store,service};
}

function roadReport(overrides={}) {
  return{
    reportId:'report:road:lite',reportType:'ROAD_ACCESS',incidentId:'incident:lite',deviceId:'device:municipal:1',sessionId:'session:lite',
    observedAt:'2026-09-04T11:58:00Z',receivedAt:'2026-09-04T12:00:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.61,41.15]},horizontalUncertaintyM:9,
    rawEvidenceHash:sha256('road-lite'),structuredAnswers:{roadId:'N2:lite',accessState:'RESTRICTED',vehicleClasses:['EMERGENCY'],constraints:['Smoke visibility constraint.'],alternativeRouteKnown:'YES'},...overrides
  };
}

test('offline structured reports preserve trust, provenance, unknown capacity and ordered durable sync', () => {
  const {filePath,store,service}=setup();
  const road=service.addStructuredReport(roadReport(),'field-control:regional').observation;
  const hospital=service.addStructuredReport({reportId:'report:hospital:lite',reportType:'HOSPITAL_CAPACITY_UPDATE',incidentId:'incident:lite',deviceId:'device:municipal:1',sessionId:'session:lite',observedAt:'2026-09-04T11:58:30Z',receivedAt:'2026-09-04T12:00:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.60,41.14]},horizontalUncertaintyM:9,rawEvidenceHash:sha256('hospital-lite'),structuredAnswers:{facilityId:'hospital:lite',edStatus:'OPERATIONAL',bedsAvailable:null,icuAvailability:'UNKNOWN',staffAvailable:{doctors:2,nurses:5},ambulanceAccess:'OPEN',acceptingPatients:'UNKNOWN'}},'field-control:regional').observation;
  const station=service.addStructuredReport({reportId:'report:station:lite',reportType:'FIRE_STATION_CAPACITY_UPDATE',incidentId:'incident:lite',deviceId:'device:municipal:1',sessionId:'session:lite',observedAt:'2026-09-04T11:59:00Z',receivedAt:'2026-09-04T12:00:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.62,41.13]},horizontalUncertaintyM:9,rawEvidenceHash:sha256('station-lite'),structuredAnswers:{stationId:'station:lite',crewsAvailable:2,crewSize:5,enginesAvailable:1,tankersAvailable:1,alreadyCommittedResources:{crews:1},communicationsStatus:'OPERATIONAL'}},'field-control:regional').observation;
  assert.equal(road.provenance.observerClass,'MUNICIPAL_OPERATOR');
  assert.equal(road.provenance.observerVerificationState,'ROLE_ATTESTED');
  assert.equal(hospital.payload.structuredAnswers.bedsAvailable,null);
  assert.equal(station.privacy.containsPersonallyIdentifiableStaffData,false);
  const queued=store.pendingSync({mode:'FULL',incidentId:'incident:lite'}).items.filter((item)=>item.mutation.type==='FIELD_OBSERVATION_ADDED');
  assert.equal(queued.length,3);assert.deepEqual(queued.map((item)=>item.mutation.localSequence),[...queued.map((item)=>item.mutation.localSequence)].sort((a,b)=>a-b));
  assert.equal(queued.every((item)=>item.mutation.payload.reportState==='OBSERVATION_PENDING_GOVERNED_ADMISSION'),true);
  store.close();
  const reopened=new FieldNodeStore({filePath,nodeId:'field-node:lite',clock:()=>NOW});
  assert.equal(reopened.observations('incident:lite').length,3);
  assert.equal(reopened.pendingSync({mode:'FULL',incidentId:'incident:lite'}).items.filter((item)=>item.mutation.type==='FIELD_OBSERVATION_ADDED').length,3);
  assert.equal(reopened.verifyAudit().valid,true);reopened.close();
});

test('verification task acknowledgement and evidence-bound completion are durable, idempotent and syncable', () => {
  const {store,service}=setup();
  const task=service.createVerificationTask({taskId:'task:road:lite',incidentId:'incident:lite',objective:'Confirm current N2 access from the designated safe point.',owner:'team:municipal:1',dueAt:'2026-09-04T12:30:00Z',acknowledgeBy:'2026-09-04T12:05:00Z',location:{type:'Point',coordinates:[-8.61,41.15]},safeZoneConstraint:{mode:'KNOWN_SAFE_POINT',instruction:'Remain at the designated observation point.',hazardExclusionM:500},targetObserverClasses:['MUNICIPAL_OPERATOR'],expectedReportTypes:['ROAD_ACCESS'],requiredEvidence:['CURRENT_ACCESS_STATE','GNSS_POINT'],completionCriteria:'One linked attributable ROAD_ACCESS observation is persisted.',linkedInformationRequirementId:'ir:road:lite'},'field-control:regional').task;
  const acknowledgement=service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'ACCEPTED',safetyState:'SAFE_TO_PROCEED',note:'Accepted from designated safe point.'},'field-control:regional');
  assert.equal(acknowledgement.task.state,'ACKNOWLEDGED');assert.equal(acknowledgement.acknowledgement.syncState,'PENDING');
  const duplicate=service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'ACCEPTED',safetyState:'SAFE_TO_PROCEED',note:'Accepted from designated safe point.'},'field-control:regional');
  assert.equal(duplicate.duplicate,true);
  assert.throws(()=>service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'DECLINED_UNSAFE',safetyState:'NOT_SAFE'},'field-control:regional'),/acknowledgement_id_payload_conflict/);
  service.addStructuredReport(roadReport({linkedTaskId:task.taskId}),'field-control:regional');
  const current=store.task(task.taskId),completed=service.completeVerificationTask(task.taskId,{taskVersion:current.version,evidenceObservationIds:['report:road:lite'],note:'Requested access observation submitted.'},'field-control:regional');
  assert.equal(completed.task.state,'COMPLETED');assert.equal(completed.task.completionEvidence[0].reportType,'ROAD_ACCESS');
  const repeated=service.completeVerificationTask(task.taskId,{taskVersion:current.version,evidenceObservationIds:['report:road:lite'],note:'Requested access observation submitted.'},'field-control:regional');
  assert.equal(repeated.duplicate,true);
  const receipts=store.taskAcknowledgements(task.taskId);assert.equal(receipts.length,1);assert.equal(receipts[0].disposition,'ACCEPTED');
  const queue=store.pendingSync({mode:'FULL',incidentId:'incident:lite'});assert.equal(queue.items.some((item)=>item.mutation.type==='TASK_ACKNOWLEDGED'),true);assert.equal(queue.items.some((item)=>item.mutation.type==='TASK_UPDATED'&&item.mutation.payload.completion),true);
  store.recordSyncAttempt(queue.items);assert.equal(store.taskAcknowledgements(task.taskId)[0].syncState,'ACKNOWLEDGED');assert.equal(store.verifyAudit().valid,true);store.close();
});

test('unsafe refusal is a persisted acknowledgement and blocks work without claiming completion', () => {
  const {store,service}=setup();
  const task=service.createVerificationTask({taskId:'task:smoke:lite',incidentId:'incident:lite',objective:'Confirm smoke only from the designated municipal safe point.',owner:'team:municipal:1',dueAt:'2026-09-04T12:30:00Z',location:{type:'Point',coordinates:[-8.61,41.15]},safeZoneConstraint:{mode:'KNOWN_SAFE_POINT',instruction:'Do not leave the designated safe point.',hazardExclusionM:1000},targetObserverClasses:['MUNICIPAL_OPERATOR'],expectedReportTypes:['FIRE_SMOKE'],requiredEvidence:['SAFE_VISUAL_CHECK'],completionCriteria:'One linked safe-point observation is persisted.'},'field-control:regional').task;
  const result=service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'DECLINED_UNSAFE',safetyState:'NOT_SAFE',note:'Smoke makes the designated point unsafe.'},'field-control:regional');
  assert.equal(result.task.state,'BLOCKED');assert.equal(result.acknowledgement.disposition,'DECLINED_UNSAFE');assert.equal('completedAt' in result.task,false);assert.equal(store.taskAcknowledgements(task.taskId)[0].truthBoundary.includes('does not prove task completion'),true);store.close();
});

test('completion rejects unrelated evidence and capacity payloads reject personal staff data', () => {
  const {store,service}=setup();
  const task=service.createVerificationTask({taskId:'task:capacity:lite',incidentId:'incident:lite',objective:'Request aggregate hospital capacity.',owner:'team:health:1',dueAt:'2026-09-04T12:30:00Z',safeZoneConstraint:{mode:'REMOTE_ONLY',instruction:'Respond through the authorized remote facility channel.'},targetObserverClasses:['MUNICIPAL_OPERATOR'],expectedReportTypes:['HOSPITAL_CAPACITY_UPDATE'],requiredEvidence:['AGGREGATE_CAPACITY'],completionCriteria:'One linked attributable capacity report is persisted.'},'field-control:regional').task;
  service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'ACCEPTED',safetyState:'SAFE_TO_PROCEED'},'field-control:regional');
  service.addStructuredReport(roadReport(),'field-control:regional');
  assert.throws(()=>service.completeVerificationTask(task.taskId,{taskVersion:store.task(task.taskId).version,evidenceObservationIds:['report:road:lite']},'field-control:regional'),/evidence_not_linked/);
  service.addStructuredReport(roadReport({reportId:'report:road:wrong-type',rawEvidenceHash:sha256('wrong-type'),linkedTaskId:task.taskId}),'field-control:regional');
  assert.throws(()=>service.completeVerificationTask(task.taskId,{taskVersion:store.task(task.taskId).version,evidenceObservationIds:['report:road:wrong-type']},'field-control:regional'),/expected_report_missing/);
  assert.throws(()=>service.addStructuredReport({reportId:'report:hospital:pii',reportType:'HOSPITAL_CAPACITY_UPDATE',incidentId:'incident:lite',deviceId:'device:municipal:1',sessionId:'session:lite',observedAt:'2026-09-04T11:59:00Z',receivedAt:'2026-09-04T12:00:00Z',connectivityAtCapture:'OFFLINE',geometry:{type:'Point',coordinates:[-8.6,41.1]},horizontalUncertaintyM:5,rawEvidenceHash:sha256('pii'),structuredAnswers:{facilityId:'hospital:lite',edStatus:'OPERATIONAL',staffAvailable:{'Alice Smith':1}}},'field-control:regional'),/staff_counts_invalid/);
  store.close();
});

test('structured reports and two-way receipts use authenticated ordered sync and become acknowledged only on central receipt',async()=>{
  const {store,service}=setup(),received=[];
  const task=service.createVerificationTask({taskId:'task:sync:lite',incidentId:'incident:lite',objective:'Confirm road access from the safe point.',owner:'team:municipal:1',dueAt:'2026-09-04T12:30:00Z',location:{type:'Point',coordinates:[-8.61,41.15]},safeZoneConstraint:{mode:'KNOWN_SAFE_POINT',instruction:'Remain at the safe point.',hazardExclusionM:500},targetObserverClasses:['MUNICIPAL_OPERATOR'],expectedReportTypes:['ROAD_ACCESS'],requiredEvidence:['CURRENT_ACCESS_STATE'],completionCriteria:'One linked road report is persisted.'},'field-control:regional').task;
  service.acknowledgeVerificationTask(task.taskId,{taskVersion:task.version,deviceId:'device:municipal:1',sessionId:'session:lite',disposition:'ACCEPTED',safetyState:'SAFE_TO_PROCEED'},'field-control:regional');
  service.addStructuredReport(roadReport({reportId:'report:sync:lite',rawEvidenceHash:sha256('road-sync-lite'),linkedTaskId:task.taskId}),'field-control:regional');
  service.centralUrl='http://central.test';service.fetchFn=async(_url,options)=>{const input=JSON.parse(options.body);received.push(...input.mutations);return centralResponse({schemaVersion:'vigia.fieldnet-sync-response.v1',acceptedMutationIds:input.mutations.map((item)=>item.id),cursor:String(input.mutations.at(-1)?.localSequence??0),updates:[]},options.headers);};
  const result=await service.syncOnce();assert.equal(result.pending,0);assert.deepEqual(received.map((item)=>item.localSequence),[...received.map((item)=>item.localSequence)].sort((a,b)=>a-b));
  assert.equal(received.some((item)=>item.type==='FIELD_OBSERVATION_ADDED'&&item.payload.reportType==='ROAD_ACCESS'),true);assert.equal(received.some((item)=>item.type==='TASK_ACKNOWLEDGED'&&item.payload.disposition==='ACCEPTED'),true);
  assert.equal(store.observations('incident:lite').find((item)=>item.observationId==='report:sync:lite').syncState,'ACKNOWLEDGED');assert.equal(store.taskAcknowledgements(task.taskId)[0].syncState,'ACKNOWLEDGED');store.close();
});

test('legacy acknowledgement tables migrate in place without deleting existing runtime data',()=>{
  const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,'fieldnet-lite-migration-')),'field.sqlite'),legacy=new DatabaseSync(filePath);
  legacy.exec('CREATE TABLE acknowledgement(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,incident_id TEXT NOT NULL,actor TEXT NOT NULL,task_version INTEGER NOT NULL,node_id TEXT NOT NULL,note TEXT,created_at TEXT NOT NULL,payload_hash TEXT NOT NULL);');legacy.close();
  const store=new FieldNodeStore({filePath,nodeId:'field-node:migration',clock:()=>NOW}),columns=store.db.prepare('PRAGMA table_info(acknowledgement)').all().map((item)=>item.name);assert.equal(columns.includes('payload'),true);assert.equal(store.verifyAudit().valid,true);store.close();
});
