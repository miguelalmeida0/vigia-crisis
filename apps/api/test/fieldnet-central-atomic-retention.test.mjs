import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir,mkdtemp,readFile,rm } from 'node:fs/promises';
import { CentralFieldNetService } from '../src/modules/fieldnet/central-fieldnet-service.mjs';
import { writeJsonAtomic } from '../src/shared/json-file.mjs';
import { canonical,sha256 } from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { INCIDENT_COMMAND_SEMANTIC_VALIDATION,isLifeSafetyIncidentCommandType } from '../../../packages/domain/src/incident-command/contracts.mjs';

const now=new Date('2026-08-22T12:00:00Z');
const request=(mutations)=>({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:one',mutations});
const mutation=(sequence,overrides={})=>{
  const payload=overrides.payload??{note:`field-note-${sequence}`};
  return{id:`mutation:${sequence}`,incidentId:'incident:one',originNode:'node:one',actor:'field:operator',type:'ANNOTATION_ADDED',priority:'P3_TASK',localSequence:sequence,payload,payloadHash:sha256(canonical(payload)),...overrides};
};
const operationalEventService={operatorEvent:async(id)=>({event:{id,evidenceState:'CURRENT',knowledgeState:'CURRENT',physicalOperationalState:'UNKNOWN',lastSeenAt:now.toISOString()}})};
const setup=async(t,options={})=>{const base=path.resolve('.tmp/test');await mkdir(base,{recursive:true});const directory=await mkdtemp(path.join(base,'central-atomic-'));t.after(()=>rm(directory,{recursive:true,force:true}));const filePath=path.join(directory,'ledger.json'),service=new CentralFieldNetService({filePath,operationalEventService,clock:()=>now,...options});await service.initialize();return{directory,filePath,service};};

test('a bad later mutation leaves no earlier live projection or durable ledger record',async(t)=>{
  const{service}=await setup(t),bad=mutation(2,{payload:{note:'tampered'},payloadHash:sha256(canonical({note:'different'}))});
  await assert.rejects(()=>service.sync(request([mutation(1),bad])),/payload_hash_mismatch/);
  assert.equal(service.status().persistedMutations,0);
  assert.deepEqual(service.snapshot('incident:one').mutations,[]);
});

test('command side effects occur only after the complete batch and durable ledger commit',async(t)=>{
  const order=[],incidentCommandService={previewOfflineMutations:async()=>({'mutation:1':{state:'READY',eventId:'command:one'}}),acceptOfflineMutation:async()=>{order.push('command-effect');return{state:'APPLIED',eventId:'command:one'};}};
  const writer=async(file,value)=>{order.push(`ledger:${Object.keys(value.commandOutbox).length}`);await writeJsonAtomic(file,value);};
  const{service}=await setup(t,{incidentCommandService,writer});
  const commandPayload={event:{eventId:'command:one',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'}}},command=mutation(1,{type:'COMMAND_SURVIVAL_EVENT',priority:'P0_LIFE_SAFETY',payload:commandPayload,payloadHash:sha256(canonical(commandPayload))});
  const invalid=mutation(2,{payload:{note:'bad-second'},payloadHash:'sha256:not-the-payload'});
  await assert.rejects(()=>service.sync(request([command,invalid])),/payload_hash_mismatch/);
  assert.deepEqual(order,[]);
  await service.sync(request([command]));
  assert.deepEqual(order,['ledger:1','command-effect','ledger:0']);
  assert.equal(service.snapshot('incident:one').mutations[0].commandDisposition.state,'APPLIED');
});

test('a failed central commit invokes no command effect and mutates no live state',async(t)=>{
  let effects=0;const incidentCommandService={previewOfflineMutations:async()=>({}),acceptOfflineMutation:async()=>{effects+=1;return{state:'APPLIED'};}};
  const{service}=await setup(t,{incidentCommandService,writer:async()=>{throw new Error('simulated_ledger_write_failure');}});
  const payload={event:{eventId:'command:failure',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'}}},command=mutation(1,{type:'COMMAND_SURVIVAL_EVENT',priority:'P0_LIFE_SAFETY',payload,payloadHash:sha256(canonical(payload))});
  await assert.rejects(()=>service.sync(request([command])),/simulated_ledger_write_failure/);
  assert.equal(effects,0);assert.equal(service.status().persistedMutations,0);
});

test('a durable pending command effect is retried idempotently after restart',async(t)=>{
  let attempts=0;const firstCommandService={previewOfflineMutations:async()=>({}),acceptOfflineMutation:async()=>{attempts+=1;throw new Error('database_temporarily_unavailable');}};
  const{filePath,service}=await setup(t,{incidentCommandService:firstCommandService});
  const payload={event:{eventId:'command:retry',incidentId:'incident:one',type:'PERSON_UPSERTED',payload:{personId:'person:one'}}},command=mutation(1,{type:'COMMAND_SURVIVAL_EVENT',priority:'P0_LIFE_SAFETY',payload,payloadHash:sha256(canonical(payload))});
  const accepted=await service.sync(request([command]));assert.equal(accepted.pendingCommandEffects,1);assert.equal(attempts,1);
  const recovered=new CentralFieldNetService({filePath,operationalEventService,clock:()=>now,incidentCommandService:{acceptOfflineMutation:async()=>{attempts+=1;return{state:'APPLIED',eventId:'command:retry',duplicate:true};}}});
  await recovered.initialize();assert.equal(recovered.status().pendingCommandEffects,0);assert.equal(attempts,2);assert.equal(recovered.snapshot('incident:one').mutations[0].commandDisposition.state,'APPLIED');
});

test('retention archives a deterministic hash-linked segment and keeps a bounded active tail across restart',async(t)=>{
  const{filePath,service}=await setup(t,{maxActiveMutationsPerIncident:2});await service.sync(request([1,2,3,4,5].map((sequence)=>mutation(sequence))));
  const status=service.status(),snapshot=service.snapshot('incident:one');assert.equal(status.persistedMutations,2);assert.equal(status.archivedMutations,3);assert.equal(status.archiveSegments,1);assert.deepEqual(snapshot.mutations.map((item)=>item.id),['mutation:4','mutation:5']);assert.equal(snapshot.retention.archiveCheckpoint.recordCount,3);
  const segmentPath=path.resolve(path.dirname(filePath),snapshot.retention.archiveCheckpoint.latestSegmentPath),segment=JSON.parse(await readFile(segmentPath,'utf8')),{segmentHash,recordCount,archivedAt,...body}=segment;
  assert.equal(recordCount,3);assert.equal(segmentHash,sha256(canonical(body)));assert.deepEqual(segment.records.map((item)=>item.id),['mutation:1','mutation:2','mutation:3']);
  const reopened=new CentralFieldNetService({filePath,operationalEventService,clock:()=>now,maxActiveMutationsPerIncident:2});await reopened.initialize();assert.equal(reopened.status().persistedMutations,2);assert.equal(reopened.status().archivedMutations,3);
  const reboundPayload={note:'rebound'};await assert.rejects(()=>reopened.sync(request([mutation(6,{id:'mutation:1',payload:reboundPayload,payloadHash:sha256(canonical(reboundPayload))})])),/central_mutation_identity_conflict/);
});

test('central admission bounds queued sync jobs before they retain request bodies',async(t)=>{
  let releaseWrite,writeStarted;const blocked=new Promise(resolve=>{releaseWrite=resolve;}),started=new Promise(resolve=>{writeStarted=resolve;});
  const{service}=await setup(t,{maxQueuedSyncs:1,writer:async(file,value)=>{writeStarted();await blocked;await writeJsonAtomic(file,value);}});
  const first=service.sync(request([mutation(1)]));await started;
  await assert.rejects(()=>service.sync(request([mutation(2)])),error=>error.statusCode===503&&error.message==='central_fieldnet_sync_queue_capacity_reached');
  releaseWrite();await first;assert.equal(service.status().persistedMutations,1);
});

test('ledger reads are cursor-paginated and enforce their serialized byte budget',async(t)=>{
  const{service}=await setup(t,{maxActiveMutationsPerIncident:10,snapshotPageSize:2,maxSnapshotBytes:16_384});await service.sync(request([1,2,3,4,5].map((sequence)=>mutation(sequence))));
  const first=service.snapshot('incident:one'),second=service.snapshot('incident:one',{afterCursor:first.page.nextCursor,limit:2});assert.deepEqual(first.mutations.map((item)=>item.id),['mutation:1','mutation:2']);assert.equal(first.page.hasMore,true);assert.deepEqual(second.mutations.map((item)=>item.id),['mutation:3','mutation:4']);assert.ok(Buffer.byteLength(JSON.stringify(first))<=16_384);assert.equal(first.page.responseBytes,Buffer.byteLength(JSON.stringify(first)));
  const hugePayload={note:'x'.repeat(20_000)},huge=mutation(6,{payload:hugePayload,payloadHash:sha256(canonical(hugePayload))});await service.sync(request([huge]));assert.throws(()=>service.snapshot('incident:one',{afterCursor:5,limit:1}),/central_fieldnet_snapshot_event_too_large/);
});

test('central mutation allowlist and permanent binding quotas reject before shared state changes',async(t)=>{
  const{service}=await setup(t,{maxBindingsPerNode:1});
  await assert.rejects(()=>service.sync(request([mutation(1,{type:'UNRECOGNIZED_MUTATION'})])),error=>error.statusCode===400&&error.message==='fieldnet_mutation_type_forbidden');
  await service.sync(request([mutation(1)]));
  await assert.rejects(()=>service.sync(request([mutation(2)])),error=>error.statusCode===507&&error.message==='central_fieldnet_binding_capacity_reached');
  assert.deepEqual(service.snapshot('incident:one').mutations.map((item)=>item.id),['mutation:1']);
});

test('per-node active capacity isolates an oversized sender and saturated archive publication retains a bounded active tail',async(t)=>{
  const{service}=await setup(t,{maxActiveBytesPerNode:2_500,maxMutationBytes:16_000});
  const oversizedPayload={subjectId:'subject:one',body:'x'.repeat(4_000)},oversized=mutation(1,{payload:oversizedPayload,payloadHash:sha256(canonical(oversizedPayload))});
  await assert.rejects(()=>service.sync(request([oversized])),error=>error.statusCode===507&&['central_fieldnet_node_capacity_reached','central_fieldnet_incident_node_capacity_reached'].includes(error.message));
  const otherPayload={subjectId:'subject:two',body:'bounded'},other={...mutation(1,{id:'mutation:other',incidentId:'incident:two',originNode:'node:two',payload:otherPayload,payloadHash:sha256(canonical(otherPayload))})};
  await service.sync({schemaVersion:'vigia.fieldnet-sync-request.v1',nodeId:'node:two',mutations:[other]});assert.deepEqual(service.snapshot('incident:two').mutations.map((item)=>item.id),['mutation:other']);
  let archiveWrites=0;const bounded=await setup(t,{maxActiveMutationsPerIncident:1,maxArchiveBytesPerIncident:1,archiveWriter:async()=>{archiveWrites+=1;}});
  await assert.doesNotReject(()=>bounded.service.sync(request([mutation(1),mutation(2)])));
  assert.equal(archiveWrites,0);assert.equal(bounded.service.status().persistedMutations,2);assert.equal(bounded.service.status().archiveSegments,0);
});

test('only semantically validated server-classified P0 command records can consume the central emergency reserve',async(t)=>{
  const incidentCommandService={previewOfflineMutations:async(mutations)=>Object.fromEntries(mutations.map((item)=>[item.id,{state:'READY',eventId:item.payload.event.eventId,semanticValidation:INCIDENT_COMMAND_SEMANTIC_VALIDATION,lifeSafetyEligible:isLifeSafetyIncidentCommandType(item.payload.event.type)}])),acceptOfflineMutation:async(item)=>({state:'APPLIED',eventId:item.payload.event.eventId})};
  const nodeRegistry={'node:one':{status:'active',key:'k'.repeat(32),incidentIds:['incident:one'],capabilities:['fieldnet:sync','fieldnet:command-survival']}};
  const{service}=await setup(t,{incidentCommandService,nodeRegistry,maxLedgerBytes:13_000,priorityReserveBytes:7_000,maxMutationBytes:10_000,maxActiveBytesPerIncident:24_000,maxActiveBytesPerNode:24_000,maxActiveBytesPerIncidentNode:24_000});
  const command=(sequence,type)=>{const payload={event:{eventId:`command:${sequence}`,incidentId:'incident:one',type,payload:{description:'x'.repeat(5_000)}}};return mutation(sequence,{type:'COMMAND_SURVIVAL_EVENT',priority:'P0_LIFE_SAFETY',payload,payloadHash:sha256(canonical(payload))});};
  await assert.rejects(()=>service.sync(request([command(1,'OBJECTIVE_UPSERTED')])),(error)=>error.statusCode===507&&error.message==='central_fieldnet_ledger_capacity_reached'&&error.details?.priorityReserveApplied===false&&error.details?.reservePriority==='P0_LIFE_SAFETY');
  await assert.doesNotReject(()=>service.sync(request([command(1,'MAYDAY_ACTIVATED')])));
  const stored=service.snapshot('incident:one').mutations[0];assert.equal(stored.priority,'P0_LIFE_SAFETY');assert.equal(stored.reserveEligibility.state,'ELIGIBLE');
});

test('every unresolved projection remains reachable through independent collection cursors',async(t)=>{
  const{service}=await setup(t,{maxActiveMutationsPerIncident:500,snapshotPageSize:250,maxSnapshotBytes:512_000});
  const rows=Array.from({length:300},(_,index)=>{const sequence=index+1,payload={observationId:`observation:${String(sequence).padStart(3,'0')}`,incidentId:'incident:one',observationType:'FIELD_NOTE',body:`note-${sequence}`,observedAt:'2026-08-22T11:59:00Z',receivedAt:'2026-08-22T11:59:01Z',deviceClockQuality:'SYNCED'};return mutation(sequence,{type:'FIELD_OBSERVATION_ADDED',payload,payloadHash:sha256(canonical(payload))});});
  for(let index=0;index<rows.length;index+=100)await service.sync(request(rows.slice(index,index+100)));
  const observed=[];let cursor='',pages=0;
  do{const page=service.snapshot('incident:one',{afterCursor:1_000,limit:250,collectionCursors:{observations:cursor}});observed.push(...page.observations.map((item)=>item.observationId));cursor=page.collectionPages.observations.nextCursor;pages+=1;if(!page.collectionPages.observations.hasMore)break;}while(pages<10);
  assert.equal(pages,2);assert.equal(observed.length,300);assert.equal(new Set(observed).size,300);assert.ok(observed.includes('observation:001'));assert.ok(observed.includes('observation:300'));
});
