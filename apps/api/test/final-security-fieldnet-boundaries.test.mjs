import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { writeJsonAtomic } from '../src/shared/json-file.mjs';
import { canonical, sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { INCIDENT_COMMAND_SEMANTIC_VALIDATION,isLifeSafetyIncidentCommandType } from '../../../packages/domain/src/incident-command/contracts.mjs';

const now=new Date('2026-08-23T12:00:00.000Z'),operationalEventService={operatorEvent:async(id)=>({event:{id,evidenceState:'CURRENT',knowledgeState:'CURRENT',physicalOperationalState:'UNKNOWN',lastSeenAt:now.toISOString()}})};
const registry=(extra={})=>({
  'node:a':{key:'node-a-fieldnet-key-at-least-32-bytes',incidentIds:['incident:one','incident:two'],capabilities:['fieldnet:sync','fieldnet:command-survival',...(extra.a??[])],status:'active'},
  'node:b':{key:'node-b-fieldnet-key-at-least-32-bytes',incidentIds:['incident:one','incident:two'],capabilities:['fieldnet:sync',...(extra.b??[])],status:'active'}
});
const request=(nodeId,mutations)=>({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId,mutations});
function mutation(nodeId,sequence,type,payload,{incidentId='incident:one',id=`${nodeId}:mutation:${sequence}`,priority='P0_LIFE_SAFETY'}={}){return{id,incidentId,originNode:nodeId,actor:`operator:${nodeId}`,type,priority,reserve:true,lifeSafety:true,localSequence:sequence,payload,payloadHash:sha256(canonical(payload))};}
async function setup(t,options={}){const base=path.resolve('.tmp/test');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'final-fieldnet-'));t.after(()=>rm(directory,{recursive:true,force:true}));const filePath=path.join(directory,'ledger.json'),service=new CentralFieldNetService({filePath,operationalEventService,nodeRegistry:registry(),clock:()=>now,...options});await service.initialize();return{directory,filePath,service};}

test('peer-owned tasks and conflicts reject acknowledgement, mutation, reassignment, and adjudication without exact capability',async(t)=>{
  const{service}=await setup(t),task={taskId:'task:owned-a',incidentId:'incident:one',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',ownerNodeId:'node:a',requiredAction:'Observe'};
  await service.sync(request('node:a',[mutation('node:a',1,'TASK_CREATED',task)]));
  for(const [type,payload]of[['TASK_ACKNOWLEDGED',{taskId:task.taskId,acknowledgementId:'ack:peer',acknowledgedAt:now.toISOString()}],['TASK_UPDATED',{taskId:task.taskId,applied:true,changes:{state:'COMPLETED'},outcome:'APPLY'}],['TASK_ASSIGNED',{taskId:task.taskId,owner:'peer'}]])await assert.rejects(()=>service.sync(request('node:b',[mutation('node:b',1,type,payload,{id:`node:b:${type}`})])),error=>error.statusCode===403&&error.message==='fieldnet_peer_task_mutation_forbidden');
  const verification={taskId:'task:verify-a',incidentId:'incident:one',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',requiredAction:'Verify'},conflict={conflictId:'conflict:owned-a',verificationTaskId:verification.taskId,incidentId:'incident:one',subjectType:'FIELD_TASK',subjectId:task.taskId,state:'OPEN'};
  await service.sync(request('node:a',[mutation('node:a',2,'TASK_CREATED',verification),mutation('node:a',3,'CONFLICT_CREATED',conflict)]));
  await assert.rejects(()=>service.sync(request('node:b',[mutation('node:b',1,'CONFLICT_RESOLVED',{conflictId:conflict.conflictId,strategy:'KEEP_CURRENT'})])),error=>error.statusCode===403&&error.message==='fieldnet_peer_conflict_mutation_forbidden');
  const spoof={...task,taskId:'task:spoofed',ownerNodeId:'node:b'};await assert.rejects(()=>service.sync(request('node:a',[mutation('node:a',4,'TASK_CREATED',spoof)])),/fieldnet_task_owner_spoofed/);
  assert.equal(service.snapshot('incident:one').tasks.find((item)=>item.taskId===task.taskId).state,'OPEN');
});

test('an exact server-registered governance capability permits a peer task transition without changing immutable ownership',async(t)=>{
  const{directory}=await setup(t),filePath=path.join(directory,'governed.json'),service=new CentralFieldNetService({filePath,operationalEventService,nodeRegistry:registry({b:['fieldnet:task-transfer']}),clock:()=>now});await service.initialize();
  const task={taskId:'task:governed',incidentId:'incident:one',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',requiredAction:'Observe'};await service.sync(request('node:a',[mutation('node:a',1,'TASK_CREATED',task)]));
  await service.sync(request('node:b',[mutation('node:b',1,'TASK_UPDATED',{taskId:task.taskId,applied:true,changes:{state:'IN_PROGRESS'},outcome:'CENTRAL_TRANSFER'})]));const stored=service.snapshot('incident:one').tasks[0];assert.equal(stored.state,'IN_PROGRESS');assert.equal(stored.ownerNodeId,'node:a');
});

test('a conflict cannot bind a verification task from another incident, including within one batch',async(t)=>{
  const{service}=await setup(t),verification={taskId:'task:incident-two',incidentId:'incident:two',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',requiredAction:'Verify'},conflict={conflictId:'conflict:incident-one',verificationTaskId:verification.taskId,incidentId:'incident:one',subjectType:'FIELD_TASK',subjectId:'task:subject',state:'OPEN'};
  await assert.rejects(()=>service.sync(request('node:a',[mutation('node:a',1,'TASK_CREATED',verification,{incidentId:'incident:two'}),mutation('node:a',2,'CONFLICT_CREATED',conflict)])),error=>error.statusCode===409&&error.message==='fieldnet_conflict_verification_task_required');
  assert.equal(service.snapshot('incident:one').conflicts.length,0);assert.equal(service.snapshot('incident:two').tasks.length,0);
});

test('incident-node partitions preserve peer and cross-incident progress while caller reserve flags are ignored',async(t)=>{
  const{service}=await setup(t,{maxBindingsPerIncident:6,maxBindingsPerNode:6,maxBindingsPerIncidentNode:2,maxActiveBytesPerIncidentNode:256*1024});
  const notes=(node,start,count,incidentId='incident:one')=>Array.from({length:count},(_,index)=>mutation(node,start+index,'ANNOTATION_ADDED',{note:`${node}:${start+index}`},{incidentId,priority:'P0_LIFE_SAFETY'}));
  await service.sync(request('node:a',notes('node:a',1,2)));await assert.rejects(()=>service.sync(request('node:a',notes('node:a',3,1))),error=>error.statusCode===507&&error.details?.scope==='incident_node');
  await service.sync(request('node:b',notes('node:b',1,2)));await service.sync(request('node:a',notes('node:a',3,1,'incident:two')));
  const one=service.snapshot('incident:one',{limit:20}),two=service.snapshot('incident:two',{limit:20});assert.equal(one.mutations.length,4);assert.equal(two.mutations.length,1);assert.ok(one.mutations.every((item)=>item.priority==='P3_TASK'&&item.serverPriorityClass===true&&item.claimedPriority==='P0_LIFE_SAFETY'));
});

test('trusted command capability and event semantics alone select protected reserve class',async(t)=>{
  const incidentCommandService={previewOfflineMutations:async(mutations)=>Object.fromEntries(mutations.map((item)=>[item.id,{state:'READY',eventId:item.payload.event.eventId,semanticValidation:INCIDENT_COMMAND_SEMANTIC_VALIDATION,lifeSafetyEligible:isLifeSafetyIncidentCommandType(item.payload.event.type)}])),acceptOfflineMutation:async(mutation)=>({state:'APPLIED',eventId:mutation.payload.event.eventId})},{service}=await setup(t,{incidentCommandService});
  const ordinary=mutation('node:a',1,'ANNOTATION_ADDED',{note:'forged reserve'}),event={eventId:'event:mayday',incidentId:'incident:one',type:'MAYDAY_ACTIVATED',payload:{maydayId:'mayday:one'}},command=mutation('node:a',2,'COMMAND_SURVIVAL_EVENT',{event},{priority:'P6_BULK_MEDIA'});await service.sync(request('node:a',[ordinary,command]));const rows=service.snapshot('incident:one',{limit:10}).mutations;assert.equal(rows.find((item)=>item.id===ordinary.id).priority,'P3_TASK');assert.equal(rows.find((item)=>item.id===command.id).priority,'P0_LIFE_SAFETY');
});

test('per-node queue admission prevents a noisy node from occupying a quiet peer slot',async(t)=>{
  let release,startedResolve;const blocked=new Promise((resolve)=>{release=resolve;}),started=new Promise((resolve)=>{startedResolve=resolve;}),{service}=await setup(t,{maxQueuedSyncs:4,maxQueuedSyncsPerNode:1,maxQueuedSyncsPerIncident:4,writer:async(file,value)=>{startedResolve();await blocked;await writeJsonAtomic(file,value);}});
  const noisy=service.sync(request('node:a',[mutation('node:a',1,'ANNOTATION_ADDED',{note:'noisy'})]));await started;await assert.rejects(()=>service.sync(request('node:a',[mutation('node:a',2,'ANNOTATION_ADDED',{note:'monopoly'})])),error=>error.statusCode===503&&error.details?.scope==='node');const quiet=service.sync(request('node:b',[mutation('node:b',1,'ANNOTATION_ADDED',{note:'quiet'})]));release();await Promise.all([noisy,quiet]);assert.equal(service.snapshot('incident:one',{limit:10}).mutations.length,2);
});

test('acknowledgement collection cursors use a unique authenticated total order across pages and restart',async(t)=>{
  const{filePath,service}=await setup(t,{snapshotPageSize:1}),taskA={taskId:'task:a',incidentId:'incident:one',schemaVersion:'vigia.field-task.v1',version:1,state:'OPEN',requiredAction:'A'},taskB={...taskA,taskId:'task:b',requiredAction:'B'};
  await service.sync(request('node:a',[mutation('node:a',1,'TASK_CREATED',taskA),mutation('node:a',2,'TASK_CREATED',taskB),mutation('node:a',3,'TASK_ACKNOWLEDGED',{taskId:'task:a',acknowledgementId:'ack:duplicate-key',acknowledgedAt:now.toISOString()}),mutation('node:a',4,'TASK_ACKNOWLEDGED',{taskId:'task:b',acknowledgementId:'ack:duplicate-key',acknowledgedAt:now.toISOString()})]));
  const first=service.snapshot('incident:one',{afterCursor:999,limit:1}),token=first.collectionPages.acknowledgements.nextCursor,second=service.snapshot('incident:one',{afterCursor:999,limit:1,collectionCursors:{acknowledgements:token}});assert.equal(first.acknowledgements.length,1);assert.equal(second.acknowledgements.length,1);assert.notEqual(first.acknowledgements[0].centralRecordId,second.acknowledgements[0].centralRecordId);
  assert.throws(()=>service.snapshot('incident:one',{collectionCursors:{acknowledgements:`${token}tampered`}}),/central_fieldnet_collection_cursor_invalid/);assert.throws(()=>service.snapshot('incident:two',{collectionCursors:{acknowledgements:token}}),/central_fieldnet_collection_cursor_invalid/);
  const reopened=new CentralFieldNetService({filePath,operationalEventService,nodeRegistry:registry(),clock:()=>now,snapshotPageSize:1});await reopened.initialize();assert.equal(reopened.snapshot('incident:one',{afterCursor:999,limit:1,collectionCursors:{acknowledgements:token}}).acknowledgements.length,1);
});

test('archive publication recovers a committed pending segment and discards an unbound prepare on ledger failure',async(t)=>{
  const first=await setup(t,{maxActiveMutationsPerIncident:1,archiveFinalizer:async()=>{throw new Error('finalize_interrupted');}});await first.service.sync(request('node:a',[mutation('node:a',1,'ANNOTATION_ADDED',{note:'one'}),mutation('node:a',2,'ANNOTATION_ADDED',{note:'two'})]));assert.equal(first.service.status().pendingArchiveSegments,1);
  const recovered=new CentralFieldNetService({filePath:first.filePath,operationalEventService,nodeRegistry:registry(),clock:()=>now,maxActiveMutationsPerIncident:1});await recovered.initialize();assert.equal(recovered.status().pendingArchiveSegments,0);assert.equal(recovered.snapshot('incident:one').retention.archiveCheckpoint.publicationState,'FINALIZED');
  const second=await setup(t,{maxActiveMutationsPerIncident:1,writer:async()=>{throw new Error('ledger_commit_failed');}});await assert.rejects(()=>second.service.sync(request('node:a',[mutation('node:a',1,'ANNOTATION_ADDED',{note:'one'}),mutation('node:a',2,'ANNOTATION_ADDED',{note:'two'})])),/ledger_commit_failed/);const files=await readdir(`${second.filePath}.archive`,{recursive:true}).catch(()=>[]);assert.equal(files.some((file)=>String(file).includes('.pending-')),false);assert.equal(second.service.status().persistedMutations,0);
});
