import test from 'node:test';
import assert from 'node:assert/strict';
import { OperatorStateRepository } from '../src/modules/interventions/operator-state-repository.mjs';
test('scoped operator snapshots are detached, reject unknown fields and reflect only committed mutations',async()=>{
 let fail=false;
 const repository=new OperatorStateRepository({filePath:'/unused/scoped-state.json',writer:async()=>{if(fail)throw Error('disk_failed');}});
 await repository.mutate(state=>({...state,evidenceNeeds:[{id:'need:1',nested:{value:1}}]}));
 const scoped=repository.snapshotFields(['evidenceNeeds']);
 assert.deepEqual(Object.keys(scoped),['evidenceNeeds']);scoped.evidenceNeeds[0].nested.value=99;
 assert.equal(repository.snapshotFields(['evidenceNeeds']).evidenceNeeds[0].nested.value,1);
 assert.throws(()=>repository.snapshotFields(['__proto__']),/snapshot_fields_invalid/);
 fail=true;await assert.rejects(repository.mutate(state=>({...state,evidenceNeeds:[]})),/disk_failed/);
 assert.equal(repository.snapshotFields(['evidenceNeeds']).evidenceNeeds.length,1);
});
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { requireText } from '../src/shared/validation.mjs';
import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('operator mutation reports a failed commit, rolls back memory and can recover', async () => {
  let writes = 0, fail = false;
  const repository = new OperatorStateRepository({
    filePath: '/unused/operator-state.json',
    writer: async () => { writes += 1; if (fail) throw new Error('disk_unavailable'); }
  });
  await repository.initialize();
  const before = repository.snapshot(); fail = true;
  await assert.rejects(repository.mutate((state) => ({ ...state, watchedEventIds: ['event-1'] })), /disk_unavailable/);
  assert.deepEqual(repository.snapshot(), before);
  assert.equal(repository.persistenceStatus().state, 'failed');
  fail = false;
  await repository.mutate((state) => ({ ...state, watchedEventIds: ['event-2'] }));
  assert.deepEqual(repository.snapshot().watchedEventIds, ['event-2']);
  assert.equal(repository.persistenceStatus().state, 'ready');
  assert.equal(writes, 3);
});

test('operator dual persistence restores the authoritative file and rejects database-invalid text before writing',async()=>{
  let durable=null,mirrorFailure=false,writes=0,mirrors=0;const repository=new OperatorStateRepository({filePath:'/unused/operator-state-mirror.json',writer:async(_file,value)=>{writes+=1;durable=structuredClone(value);},mirrorStore:{commitOperationalState:async()=>{mirrors+=1;if(mirrorFailure)throw new Error('mirror_unavailable');return{persisted:true,state:'ready'};}}});await repository.initialize();const before=repository.snapshot(),beforeWrites=writes;mirrorFailure=true;await assert.rejects(()=>repository.mutate((state)=>({...state,watchedEventIds:['event:rejected']})),/mirror_unavailable/);assert.deepEqual(repository.snapshot(),before);assert.deepEqual(durable,before);assert.equal(writes,beforeWrites+2);const invalidWrites=writes,invalidMirrors=mirrors;await assert.rejects(()=>repository.mutate((state)=>({...state,watchedEventIds:['event:\u0000poison']})),error=>error.statusCode===400&&error.message==='operator_state_database_invalid_text');await assert.rejects(()=>repository.mutate((state)=>({...state,evidenceRequests:[{scheduleCommitment:{outer:{['bad\u0000key']:'safe'}}}]})),error=>error.statusCode===400&&error.message==='operator_state_database_invalid_text');await assert.rejects(()=>repository.mutate((state)=>({...state,evidenceRequests:[{scheduleCommitment:{outer:{key:'bad\u0000value'}}}]})),error=>error.statusCode===400&&error.message==='operator_state_database_invalid_text');assert.equal(writes,invalidWrites);assert.equal(mirrors,invalidMirrors);assert.throws(()=>requireText('bad\u0000title','title'),error=>error.statusCode===400&&error.message==='title_contains_database_invalid_text');
});

test('configured mirror must acknowledge initialization before the file is published',async()=>{
  let writes=0;const repository=new OperatorStateRepository({filePath:'/unused/operator-state-init-mirror.json',writer:async()=>{writes+=1;},mirrorStore:{commitOperationalState:async()=>({persisted:false,state:'failed'})}});
  await assert.rejects(()=>repository.initialize(),error=>error.statusCode===503&&error.message==='operator_state_mirror_not_persisted');
  assert.equal(writes,0);assert.equal(repository.persistenceStatus().state,'failed');
});

test('configured invalid mirror is not treated as absent',async()=>{
  for(const mirrorStore of [{},{commitOperationalState:async()=>undefined}]){
    let writes=0;const repository=new OperatorStateRepository({filePath:'/unused/operator-state-invalid-mirror.json',writer:async()=>{writes+=1;},mirrorStore});
    await assert.rejects(()=>repository.initialize(),error=>error.statusCode===503&&error.message==='operator_state_mirror_not_persisted');
    assert.equal(writes,0);assert.equal(repository.persistenceStatus().state,'failed');
  }
});

test('configured non-persisted mirror rolls back and the mutation chain can recover',async()=>{
  let durable=null,writes=0,persisted=true;const repository=new OperatorStateRepository({filePath:'/unused/operator-state-non-persisted.json',writer:async(_file,value)=>{writes+=1;durable=structuredClone(value);},mirrorStore:{commitOperationalState:async()=>({persisted,state:persisted?'ready':'failed'})}});
  await repository.initialize();const before=repository.snapshot(),beforeWrites=writes;persisted=false;
  await assert.rejects(()=>repository.mutate((state)=>({...state,watchedEventIds:['event:rejected']})),error=>error.statusCode===503&&error.message==='operator_state_mirror_not_persisted');
  assert.deepEqual(repository.snapshot(),before);assert.deepEqual(durable,before);assert.equal(writes,beforeWrites+2);assert.equal(repository.persistenceStatus().state,'failed');
  persisted=true;await repository.mutate((state)=>({...state,watchedEventIds:['event:recovered']}));
  assert.deepEqual(repository.snapshot().watchedEventIds,['event:recovered']);assert.deepEqual(durable.watchedEventIds,['event:recovered']);assert.equal(repository.persistenceStatus().state,'ready');
});

test('resolver attempt retention archives full evidence idempotently without resetting attempt counts',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'vigia-resolver-archive-')),filePath=path.join(directory,'operator.json'),archivePath=path.join(directory,'source-resolution-attempt-history.jsonl');
  const attempts=Array.from({length:5},(_,index)=>({attempt:index+1,completedAt:`2026-09-03T00:0${index}:00.000Z`,providerAttempts:[{sourceId:'source:test',resultState:'NO_COVERAGE',durableReceipt:{state:'RECEIVED',completedAt:`2026-09-03T00:0${index}:00.000Z`}}]}));
  await writeFile(filePath,JSON.stringify({version:2,sourceResolutionJobs:[{jobId:'resolver:test',incidentId:'incident:test',requirementId:'need:test',attemptCount:5,attemptHistory:attempts}]}));
  const first=new OperatorStateRepository({filePath,hotAttemptHistoryLimit:2});await first.initialize();
  assert.deepEqual(first.snapshot().sourceResolutionJobs[0].attemptHistory.map(item=>item.attempt),[4,5]);
  assert.deepEqual(first.snapshot().sourceResolutionJobs[0].attemptHistoryArchive,{schemaVersion:'vigia.source-resolution-attempt-hot-cold-retention.v1',archiveFile:'source-resolution-attempt-history.jsonl',integrityState:'HASH_VERIFIED',archivedCount:3,retainedCount:2,totalRetainedAttemptCount:5,legacyUnretainedAttemptCount:0,lastArchivedAt:'2026-09-03T00:02:00.000Z'});
  const second=new OperatorStateRepository({filePath,hotAttemptHistoryLimit:2});await second.initialize();
  assert.equal((await readFile(archivePath,'utf8')).trim().split('\n').length,3);
  await second.mutate(state=>({...state,sourceResolutionJobs:state.sourceResolutionJobs.map(job=>({...job,attemptCount:6,attemptHistory:[...job.attemptHistory,{...attempts[0],attempt:6,completedAt:'2026-09-03T00:06:00.000Z'}]}))}));
  const archived=(await readFile(archivePath,'utf8')).trim().split('\n').map(JSON.parse),hot=second.snapshot().sourceResolutionJobs[0];
  assert.equal(archived.length,4);assert.deepEqual(hot.attemptHistory.map(item=>item.attempt),[5,6]);assert.equal(hot.attemptHistoryArchive.archivedCount,4);assert.equal(hot.attemptCount,6);
  assert.deepEqual([...archived.map(item=>item.attempt.attempt),...hot.attemptHistory.map(item=>item.attempt)].sort((a,b)=>a-b),[1,2,3,4,5,6]);
});

test('event mutation never returns success or retains memory state after persistence failure', async () => {
  let fail = true;
  const repository = new EventObservationRepository({ filePath: '/unused/events.json', writer: async () => { if (fail) throw new Error('event_disk_unavailable'); } });
  const observation = { id: 'field:1', type: 'field', at: '2026-08-09T12:00:00.000Z', coordinate: [-8, 40] };
  await assert.rejects(repository.merge([observation], new Date('2026-08-09T12:01:00.000Z')), /event_disk_unavailable/);
  assert.equal(repository.persistenceStatus().state, 'failed');
  fail = false;
  const observations = await repository.merge([], new Date('2026-08-09T12:01:00.000Z'));
  assert.equal(observations.length, 0);
});

test('shared operator-state capacity rejects every evidence writer atomically before JSON or PostGIS work',async()=>{
  let writes=0,mirrors=0;const repository=new OperatorStateRepository({filePath:'/unused/operator-state-capacity.json',writer:async()=>{writes+=1;},mirrorStore:{commitOperationalState:async()=>{mirrors+=1;return{persisted:true,state:'ready'};}},capacityPolicy:{maxEvidenceRequests:1,maxEvidenceRequestsPerIncident:1,maxEvidenceRequestsPerPrincipal:1,maxEvidencePackages:1,maxEvidencePackagesPerIncident:1,maxEvidencePackagesPerPrincipal:1}});await repository.initialize();
  const first={id:'request:1',targetType:'fire_event',targetId:'event:PT-1',requestedBy:'operator:1'};await repository.mutate((state)=>({...state,evidenceRequests:[first]}));const before=repository.snapshot(),beforeWrites=writes,beforeMirrors=mirrors;
  await assert.rejects(()=>repository.mutate((state)=>({...state,evidenceRequests:[...state.evidenceRequests,{...first,id:'request:2'}]})),error=>error.statusCode===507&&error.message==='operator_state_evidence_request_capacity_reached');
  assert.deepEqual(repository.snapshot(),before);assert.equal(writes,beforeWrites);assert.equal(mirrors,beforeMirrors);
  const packageOne={id:'package:1',requestId:first.id,observerId:'operator:1'};await repository.mutate((state)=>({...state,evidencePackages:[packageOne]}));const afterPackage=repository.snapshot(),packageWrites=writes,packageMirrors=mirrors;
  await assert.rejects(()=>repository.mutate((state)=>({...state,evidencePackages:[...state.evidencePackages,{...packageOne,id:'package:2'}]})),error=>error.statusCode===507&&error.message==='operator_state_evidence_package_capacity_reached');
  assert.deepEqual(repository.snapshot(),afterPackage);assert.equal(writes,packageWrites);assert.equal(mirrors,packageMirrors);
});
