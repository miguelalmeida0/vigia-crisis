import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync } from 'node:fs';
import path from 'node:path';
import { FieldNodeStore } from '../src/sqlite-store.mjs';
import { FieldNetService } from '../src/service.mjs';
import { createFieldIncidentPackage,createFieldTask } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { commandEvent } from '../../../packages/domain/src/incident-command/contracts.mjs';

function boundedStore(name,options={}){const base=path.join(process.cwd(),'.tmp/test');mkdirSync(base,{recursive:true});const filePath=path.join(mkdtempSync(path.join(base,`${name}-`)),'field.sqlite');return new FieldNodeStore({filePath,nodeId:`field-node:${name}`,...options});}
function seededPackage(incidentId,input={}){const createdAt=input.createdAt??'2026-08-13T10:00:00Z',seed=commandEvent({incidentId,type:'INCIDENT_IMPORTED',eventId:`seed:${incidentId}`,payload:{importHash:`seed:${incidentId}`,universe:'SHADOW',canonicalEventIds:[incidentId]},source:'TEST',author:'central',responsibleOwner:'central',releaseId:'release:test',observedAt:createdAt,receivedAt:createdAt});return createFieldIncidentPackage({incidentId,createdAt,...input,commandSurvival:{events:[seed]}});}
const addMayday=(service,incidentId,index)=>service.addCommandSurvivalEvent(incidentId,{type:'MAYDAY_ACTIVATED',eventId:`event:mayday:${incidentId}:${index}`,payload:{maydayId:`mayday:${incidentId}:${index}`,personId:`person:${index}`,timers:{}}},'shadow:lead');

test('queue-less central snapshots remain ordinary, compactable and bounded',()=>{
  const store=boundedStore('inbound',{maxRetainedMutations:5,priorityMutationReserve:2}),incidentId='incident:inbound';
  store.importPackage(createFieldIncidentPackage({incidentId,createdAt:'2026-08-13T10:00:00Z'}),'regional-vigia');
  for(let index=0;index<20;index+=1)store.applyInbound([{id:`central:snapshot:${index}`,incidentId,type:'CENTRAL_EVENT_SNAPSHOT',actor:'regional-vigia',priority:'P1_COMMAND',payload:{centralCursor:String(index),canonicalEventId:'event:inbound'}}]);
  assert.ok(store.state().capacity.retainedMutations<=store.state().capacity.maxRetainedMutations);assert.ok(store.state().capacity.compactionCheckpoints>0);assert.equal(store.db.prepare("SELECT count(*) count FROM mutation WHERE type='CENTRAL_EVENT_SNAPSHOT' AND priority IN ('P0_LIFE_SAFETY','P1_COMMAND')").get().count,0);assert.equal(store.verifyAudit().valid,true);store.close();
});

test('repeatable incident package projections remain ordinary and cannot consume emergency reserve',()=>{
  const store=boundedStore('package-projection',{maxRetainedMutations:5,priorityMutationReserve:2}),incidentId='incident:package-projection';
  for(let index=0;index<20;index+=1)store.importPackage(createFieldIncidentPackage({incidentId,packageId:`package:${index}`,createdAt:new Date(Date.UTC(2026,7,13,10,index)).toISOString()}),'regional-vigia');
  const capacity=store.state().capacity;assert.ok(capacity.retainedMutations<=capacity.maxRetainedMutations);assert.ok(capacity.compactionCheckpoints>0);
  assert.equal(store.db.prepare("SELECT count(*) count FROM mutation WHERE type IN ('INCIDENT_PACKAGE_IMPORTED','INCIDENT_PACKAGE_UPDATED') AND priority IN ('P0_LIFE_SAFETY','P1_COMMAND')").get().count,0);
  assert.equal(store.verifyAudit().valid,true);store.close();
});

test('restart repair preserves incident package projections as compactable ordinary history',()=>{
  let store=boundedStore('package-restart',{maxRetainedMutations:5,priorityMutationReserve:2});const filePath=store.filePath,incidentId='incident:package-restart',options={filePath,nodeId:'field-node:package-restart',maxRetainedMutations:5,priorityMutationReserve:2};
  for(let index=0;index<4;index+=1)store.importPackage(createFieldIncidentPackage({incidentId,packageId:`restart-package:${index}`,createdAt:new Date(Date.UTC(2026,7,13,11,index)).toISOString()}),'regional-vigia');store.close();store=new FieldNodeStore(options);
  assert.equal(store.db.prepare("SELECT count(*) count FROM mutation WHERE type IN ('INCIDENT_PACKAGE_IMPORTED','INCIDENT_PACKAGE_UPDATED') AND priority!='P3_TASK'").get().count,0);
  for(let index=4;index<20;index+=1)store.importPackage(createFieldIncidentPackage({incidentId,packageId:`restart-package:${index}`,createdAt:new Date(Date.UTC(2026,7,13,11,index)).toISOString()}),'regional-vigia');assert.ok(store.state().capacity.retainedMutations<=store.state().capacity.maxRetainedMutations);assert.ok(store.state().capacity.compactionCheckpoints>0);store.close();
});

test('ordinary task and evidence-debt revisions cannot consume the protected mutation reserve',()=>{
  const store=boundedStore('reserve-class',{maxRetainedMutations:5,priorityMutationReserve:2}),service=new FieldNetService({store}),incidentId='incident:reserve-class';
  service.importPackage(seededPackage(incidentId,{currentAlerts:[{id:'alert:reserve',version:1,qualification:'CONTROLLED_TEST'}]}),'regional-vigia');
  const task=service.createTask({taskId:'task:ordinary',incidentId,requiredAction:'Record ordinary field status',priority:'P3_TASK'},'shadow:lead').task;
  while(store.state().capacity.retainedMutations<store.state().capacity.maxRetainedMutations)service.addAnnotation({mutationId:`reserve:fill:${store.state().capacity.retainedMutations}`,incidentId,actor:'shadow:a',subjectId:'incident',body:'ordinary'});
  assert.throws(()=>service.acknowledgeTask(task.taskId,{actor:'shadow:a',taskVersion:task.version}),/field_retained_mutation_capacity_reached/);assert.equal(store.task(task.taskId).state,'OPEN');
  const debt={id:'debt:ordinary',question:'What remains unknown?',currentState:'OPEN',closesWhen:'New attributable evidence arrives.'};assert.throws(()=>store.upsertEvidenceDebt(incidentId,debt,'shadow:a'),/field_retained_mutation_capacity_reached/);assert.equal(store.evidenceDebt(incidentId).some((item)=>item.id===debt.id),false);
  assert.throws(()=>service.acknowledgeAlert(incidentId,'alert:reserve',{actor:'shadow:a',alertVersion:1}),(error)=>error.statusCode===507&&error.details?.reserveEligible===false);assert.doesNotThrow(()=>addMayday(service,incidentId,0));assert.equal(store.state().capacity.p0RetainedMutations,1);assert.equal(store.verifyAudit().valid,true);store.close();
});

test('unsupported, malformed, and caller-prioritized local work consume zero emergency reserve',()=>{
  const store=boundedStore('semantic-reserve',{maxRetainedMutations:20,maxPending:20,priorityMutationReserve:2}),service=new FieldNetService({store}),incidentId='incident:semantic-reserve';service.importPackage(seededPackage(incidentId),'regional-vigia');const before=store.state().capacity;
  assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'MAYDAY_FORGED',eventId:'event:forged',payload:{description:'forged'}},'shadow:lead'));assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'MAYDAY_ACTIVATED',eventId:'event:malformed',payload:{description:'missing semantic identifiers'}},'shadow:lead'));assert.equal(store.state().capacity.p0RetainedMutations,before.p0RetainedMutations);assert.equal(store.state().capacity.p0PendingMutations,before.p0PendingMutations);
  const task=createFieldTask({taskId:'task:caller-p0',incidentId,requiredAction:'Caller-prioritized ordinary task',priority:'P0_LIFE_SAFETY'},{now:new Date('2026-08-13T10:01:00Z')}),created=store.createTask(task,'shadow:lead');assert.equal(created.task.priority,'P0_LIFE_SAFETY');assert.equal(store.db.prepare("SELECT priority FROM mutation WHERE type='TASK_CREATED' AND json_extract(payload,'$.taskId')=?").get(task.taskId).priority,'P1_COMMAND');assert.equal(store.state().capacity.p0RetainedMutations,before.p0RetainedMutations);assert.equal(store.state().capacity.p0PendingMutations,before.p0PendingMutations);store.close();
});

test('P1 retained history cannot consume the P0 life-safety reserve and accounting survives restart',()=>{
  let store=boundedStore('retained-p0-reserve',{maxRetainedMutations:4,maxPending:20,priorityMutationReserve:2});const filePath=store.filePath,nodeId=store.nodeId,incidentId='incident:retained-p0-reserve';let service=new FieldNetService({store});
  service.importPackage(seededPackage(incidentId,{currentAlerts:[0,1,2].map((index)=>({id:`alert:retained:${index}`,version:1,qualification:'CONTROLLED_TEST'}))}),'regional-vigia');
  for(let index=0;index<3;index+=1)service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:`event:p1:${index}`,payload:{objectiveId:`objective:p1:${index}`,description:`Governed P1 command ${index}`}},'shadow:lead');
  assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:'event:p1:overflow',payload:{objectiveId:'objective:p1:overflow',description:'Must not consume P0 reserve'}},'shadow:lead'),(error)=>error.statusCode===507&&error.message==='field_retained_mutation_capacity_reached'&&error.details?.reserveEligible===false);assert.equal(store.commandSurvival(incidentId).events.some((event)=>event.eventId==='event:p1:overflow'),false);
  let capacity=store.state().capacity;assert.equal(capacity.retainedMutations,4);assert.equal(capacity.p1RetainedMutations,3);assert.deepEqual(capacity.priorityMutationReserveAccounting,{priority:'P0_LIFE_SAFETY',retainedUsed:0,retainedAvailable:2,retainedNonP0Overcommit:0,pendingUsed:0,pendingAvailable:2,pendingNonP0Overcommit:0});
  assert.doesNotThrow(()=>addMayday(service,incidentId,0));assert.doesNotThrow(()=>addMayday(service,incidentId,1));
  assert.throws(()=>addMayday(service,incidentId,2),(error)=>error.statusCode===507&&error.message==='field_retained_mutation_capacity_reached'&&error.details?.reserveEligible===true);
  capacity=store.state().capacity;assert.equal(capacity.retainedMutations,6);assert.equal(capacity.p0RetainedMutations,2);assert.equal(capacity.p1RetainedMutations,3);assert.equal(capacity.priorityMutationReserveAccounting.retainedUsed,2);assert.equal(capacity.priorityMutationReserveAccounting.retainedAvailable,0);
  store.close();store=new FieldNodeStore({filePath,nodeId,maxRetainedMutations:4,maxPending:20,priorityMutationReserve:2});service=new FieldNetService({store});capacity=store.state().capacity;assert.equal(capacity.priorityMutationReserveAccounting.retainedUsed,2);assert.equal(capacity.priorityMutationReserveAccounting.retainedAvailable,0);
  store.recordSyncAttempt(store.pendingSync({mode:'FULL'}).items);assert.equal(Number(store.db.prepare("SELECT count(*) count FROM mutation WHERE priority='P0_LIFE_SAFETY'").get().count),2);assert.equal(Number(store.db.prepare("SELECT count(*) count FROM mutation WHERE priority='P1_COMMAND'").get().count),3);assert.equal(store.verifyAudit().valid,true);store.close();
});

test('P1 pending work stops at maxPending while only P0 consumes the queue reserve',()=>{
  const store=boundedStore('pending-p0-reserve',{maxRetainedMutations:20,maxPending:2,priorityMutationReserve:2}),service=new FieldNetService({store}),incidentId='incident:pending-p0-reserve';
  service.importPackage(seededPackage(incidentId,{currentAlerts:[0,1,2].map((index)=>({id:`alert:pending:${index}`,version:1,qualification:'CONTROLLED_TEST'}))}),'regional-vigia');
  for(let index=0;index<2;index+=1)service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:`event:pending:p1:${index}`,payload:{objectiveId:`objective:pending:p1:${index}`,description:`Queued P1 command ${index}`}},'shadow:lead');
  assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:'event:pending:p1:overflow',payload:{objectiveId:'objective:pending:p1:overflow',description:'Must not consume P0 queue reserve'}},'shadow:lead'),(error)=>error.statusCode===507&&error.message==='field_sync_queue_capacity_reached'&&error.details?.reserveEligible===false);assert.equal(store.commandSurvival(incidentId).events.some((event)=>event.eventId==='event:pending:p1:overflow'),false);
  assert.doesNotThrow(()=>addMayday(service,incidentId,0));assert.doesNotThrow(()=>addMayday(service,incidentId,1));
  assert.throws(()=>addMayday(service,incidentId,2),(error)=>error.statusCode===507&&error.message==='field_sync_queue_capacity_reached'&&error.details?.reserveEligible===true);
  let capacity=store.state().capacity;assert.equal(capacity.maxPending,2);assert.equal(capacity.pendingMutations,4);assert.equal(capacity.p0PendingMutations,2);assert.equal(capacity.p1PendingMutations,2);assert.equal(capacity.priorityMutationReserveAccounting.pendingUsed,2);assert.equal(capacity.priorityMutationReserveAccounting.pendingAvailable,0);
  store.recordSyncAttempt(store.pendingSync({mode:'FULL'}).items);capacity=store.state().capacity;assert.equal(capacity.pendingMutations,0);assert.equal(capacity.priorityMutationReserveAccounting.pendingUsed,0);assert.equal(capacity.priorityMutationReserveAccounting.pendingAvailable,2);assert.equal(Number(store.db.prepare("SELECT count(*) count FROM mutation WHERE priority IN ('P0_LIFE_SAFETY','P1_COMMAND')").get().count),4);assert.equal(store.verifyAudit().valid,true);store.close();
});

test('legacy P1 overcommit is preserved and reported without consuming P0 headroom after restart',()=>{
  let store=boundedStore('legacy-p1-overcommit',{maxRetainedMutations:6,maxPending:4,priorityMutationReserve:2});const filePath=store.filePath,nodeId=store.nodeId,incidentId='incident:legacy-p1-overcommit';let service=new FieldNetService({store});
  service.importPackage(seededPackage(incidentId,{currentAlerts:[0,1,2].map((index)=>({id:`alert:legacy:${index}`,version:1,qualification:'CONTROLLED_TEST'}))}),'regional-vigia');
  for(let index=0;index<4;index+=1)service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:`event:legacy:p1:${index}`,payload:{objectiveId:`objective:legacy:p1:${index}`}},'shadow:lead');
  store.close();store=new FieldNodeStore({filePath,nodeId,maxRetainedMutations:4,maxPending:2,priorityMutationReserve:2});service=new FieldNetService({store});let capacity=store.state().capacity;
  assert.equal(capacity.p1RetainedMutations,4);assert.equal(capacity.p1PendingMutations,4);assert.equal(capacity.priorityMutationReserveAccounting.retainedNonP0Overcommit,1);assert.equal(capacity.priorityMutationReserveAccounting.pendingNonP0Overcommit,2);assert.equal(capacity.priorityMutationReserveAccounting.retainedUsed,0);assert.equal(capacity.priorityMutationReserveAccounting.pendingUsed,0);
  assert.doesNotThrow(()=>addMayday(service,incidentId,0));assert.doesNotThrow(()=>addMayday(service,incidentId,1));
  assert.throws(()=>addMayday(service,incidentId,2),(error)=>error.statusCode===507&&error.details?.reserveEligible===true);
  assert.throws(()=>service.addCommandSurvivalEvent(incidentId,{type:'OBJECTIVE_UPSERTED',eventId:'event:legacy:p1:blocked',payload:{objectiveId:'objective:legacy:p1:blocked'}},'shadow:lead'),(error)=>error.statusCode===507&&error.details?.reserveEligible===false);
  capacity=store.state().capacity;assert.equal(capacity.p0RetainedMutations,2);assert.equal(capacity.p1RetainedMutations,4);assert.equal(capacity.p0PendingMutations,2);assert.equal(capacity.p1PendingMutations,4);assert.equal(capacity.priorityMutationReserveAccounting.retainedUsed,2);assert.equal(capacity.priorityMutationReserveAccounting.pendingUsed,2);assert.equal(store.verifyAudit().valid,true);store.close();
});
