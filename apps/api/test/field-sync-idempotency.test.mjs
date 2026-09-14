import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvidenceRequest } from '../../../packages/domain/src/evidence-request.mjs';
import { EvidenceRequestService } from '../src/modules/verification/evidence-request-service.mjs';

class MemoryRepository {
  constructor(state) { this.state = structuredClone(state); this.chain=Promise.resolve(); }
  snapshot() { return structuredClone(this.state); }
  mutate(mutator) { const operation=this.chain.then(async()=>{this.state = await mutator(structuredClone(this.state)); return this.snapshot();});this.chain=operation.catch(()=>undefined);return operation; }
}

const actor = { id: 'inspector-1', role: 'field_inspector',incidentScopes:['PT-2026-1'] };
const createdAt = '2026-08-09T12:00:00.000Z';
const request = createEvidenceRequest({
  id: 'evidence-request:1',
  targetType: 'fire_event',
  targetId: 'event:PT-2026-1',
  title: 'Confirm fire report',
  ownerId: actor.id,
  requestedBy: 'supervisor-1',
  dueAt: '2026-08-09T12:30:00.000Z',
  createdAt
});

test('field operation replay returns the original receipt without a second transition', async () => {
  const repository = new MemoryRepository({
    evidenceRequests: [request],
    evidencePackages: [],
    fieldOperationReceipts: []
  });
  let changed = 0;
  const service = new EvidenceRequestService({
    repository,
    clock: () => new Date('2026-08-09T12:05:00.000Z'),
    auditService: { async record() {} },
    onChanged: () => { changed += 1; }
  });
  const operation = {
    clientId: 'client-operation-1',
    type: 'acknowledge',
    requestId: request.id,
    payload: { note: 'En route.' }
  };

  const first = await service.sync(actor, [operation]);
  const replay = await service.sync(actor, [operation]);

  assert.deepEqual(replay, first);
  assert.equal(first[0].ok, true);
  assert.equal(repository.snapshot().evidenceRequests[0].state, 'acknowledged');
  assert.equal(repository.snapshot().evidenceRequests[0].history.length, 2);
  assert.equal(repository.snapshot().fieldOperationReceipts.length, 1);
  assert.equal(changed, 1);
});

test('manual evidence request creation is idempotent for one governed evidence need', async () => {
  const repository = new MemoryRepository({ evidenceNeeds:[{id:'need:PT-2026-1',subjectType:'fire_event',subjectId:'event:PT-2026-1',state:'REQUEST_ACTIVE',missingQuantity:'confirm_public_report',version:1,bindingHash:'sha256:need-1',subjectVersion:'event-v1',policyVersion:'policy-v1'}],evidenceRequests: [], evidencePackages: [], fieldOperationReceipts: [] });
  let audits = 0;
  const service = new EvidenceRequestService({ repository, clock: () => new Date(createdAt), auditService: { async record() { audits += 1; } } });
  const supervisor = { id:'supervisor-1',role:'supervisor',incidentScopes:['PT-2026-1'] };
  const input = { evidenceNeedId:'need:PT-2026-1',evidenceNeedVersion:1,evidenceNeedBindingHash:'sha256:need-1',evidenceNeedSubjectVersion:'event-v1',evidenceNeedPolicyVersion:'policy-v1',targetType:'fire_event',targetId:'event:PT-2026-1',title:'Confirm report',ownerId:'inspector-1',dueAt:'2026-08-09T12:30:00.000Z',missingQuantity:'confirm_public_report',requestedMethodId:'manual-field-dispatch' };
  const first = await service.create(supervisor,input);
  const replay = await service.create(supervisor,input);
  assert.equal(replay.id,first.id);
  assert.equal(replay.idempotentReplay,true);
  assert.equal(repository.snapshot().evidenceRequests.length,1);
  assert.equal(repository.snapshot().evidenceRequests[0].evidenceNeedId,input.evidenceNeedId);
  assert.equal(audits,1);
});

test('manual evidence request idempotency is atomic and payload-bound', async () => {
  const repository = new MemoryRepository({ evidenceNeeds:[{id:'need:atomic',subjectType:'fire_event',subjectId:'event:PT-2026-1',state:'REQUEST_ACTIVE',missingQuantity:'confirm_public_report',version:1,bindingHash:'sha256:atomic',subjectVersion:'event-v1',policyVersion:'policy-v1'}],evidenceRequests: [], evidencePackages: [], fieldOperationReceipts: [] });
  let audits = 0;
  const service = new EvidenceRequestService({ repository, clock: () => new Date(createdAt), auditService: { async record() { audits += 1; } } });
  const supervisor = { id:'supervisor-1',role:'supervisor',incidentScopes:['PT-2026-1'] };
  const input = { evidenceNeedId:'need:atomic',evidenceNeedVersion:1,evidenceNeedBindingHash:'sha256:atomic',evidenceNeedSubjectVersion:'event-v1',evidenceNeedPolicyVersion:'policy-v1',targetType:'fire_event',targetId:'event:PT-2026-1',title:'Confirm report',ownerId:'inspector-1',priority:'high',dueAt:'2026-08-09T12:30:00.000Z',missingQuantity:'confirm_public_report',requirements:['Attributable visual confirmation'] };
  const [first,replay]=await Promise.all([service.create(supervisor,input),service.create(supervisor,input)]);
  assert.equal(first.id,replay.id);
  assert.equal(repository.snapshot().evidenceRequests.length,1);
  assert.equal(audits,1);
  await assert.rejects(()=>service.create(supervisor,{...input,ownerId:'inspector-2'}),error=>error.statusCode===409&&error.message==='evidence_request_idempotency_conflict');
});

test('manual evidence request cannot bind a governed target to another incident need',async()=>{
  const repository=new MemoryRepository({evidenceNeeds:[{id:'need:foreign',subjectType:'fire_event',subjectId:'event:PT-2026-2',state:'REQUEST_ACTIVE',missingQuantity:'confirm_public_report',version:1,bindingHash:'sha256:foreign',subjectVersion:'event-v1',policyVersion:'policy-v1'}],evidenceRequests:[],evidencePackages:[],fieldOperationReceipts:[]});
  const service=new EvidenceRequestService({repository,clock:()=>new Date(createdAt),auditService:{async record(){}}});
  const supervisor={id:'supervisor-1',role:'supervisor',incidentScopes:['PT-2026-1']};
  await assert.rejects(()=>service.create(supervisor,{evidenceNeedId:'need:foreign',evidenceNeedVersion:1,evidenceNeedBindingHash:'sha256:foreign',evidenceNeedSubjectVersion:'event-v1',evidenceNeedPolicyVersion:'policy-v1',targetType:'fire_event',targetId:'event:PT-2026-1',title:'Confirm report',ownerId:'inspector-1',dueAt:'2026-08-09T12:30:00.000Z',missingQuantity:'confirm_public_report'}),error=>error.statusCode===409&&error.message==='evidence_need_target_mismatch');
  assert.equal(repository.snapshot().evidenceRequests.length,0);
});

test('evidence request history enforces cumulative principal, incident, global, byte and read bounds without breaking replay',async()=>{
  const need={id:'need:bounded',subjectType:'fire_event',subjectId:'event:PT-2026-1',state:'REQUEST_ACTIVE',missingQuantity:'confirm_public_report',version:1,bindingHash:'sha256:bounded',subjectVersion:'event-v1',policyVersion:'policy-v1'},repository=new MemoryRepository({evidenceNeeds:[need],evidenceRequests:[],evidencePackages:[],fieldOperationReceipts:[]}),supervisor={id:'supervisor-1',role:'supervisor',incidentScopes:['PT-2026-1']},service=new EvidenceRequestService({repository,clock:()=>new Date(createdAt),auditService:{async record(){}},maxRequestsGlobal:1,maxRequestsPerIncident:1,maxRequestsPerPrincipal:1,maxSnapshotRows:1});
  const governed={evidenceNeedId:need.id,evidenceNeedVersion:need.version,evidenceNeedBindingHash:need.bindingHash,evidenceNeedSubjectVersion:need.subjectVersion,evidenceNeedPolicyVersion:need.policyVersion,targetType:'fire_event',targetId:'event:PT-2026-1',title:'Bounded request',ownerId:'inspector-1',dueAt:'2026-08-09T12:30:00.000Z',missingQuantity:need.missingQuantity};
  const first=await service.create(supervisor,governed),replay=await service.create(supervisor,governed);assert.equal(replay.id,first.id);assert.equal(replay.idempotentReplay,true);
  await assert.rejects(()=>service.create(supervisor,{targetType:'fire_event',targetId:'event:PT-2026-1',title:'Second request',ownerId:'inspector-1',dueAt:'2026-08-09T12:40:00.000Z'}),error=>error.statusCode===507&&error.message==='evidence_request_history_capacity_exceeded'&&error.details.scope==='global');
  assert.equal(repository.snapshot().evidenceRequests.length,1);
  const snapshot=service.snapshot({...supervisor,role:'supervisor'});assert.equal(snapshot.requests.length,1);assert.equal(snapshot.page.returned,1);assert.equal(snapshot.page.hasMore,false);assert.ok(snapshot.page.responseBytes>0);
});

test('evidence snapshots return a bounded deterministic prefix and explicit continuation state',()=>{
  const requests=[1,2].map((index)=>({...request,id:`evidence-request:${index}`,requestedBy:'supervisor-1'})),repository=new MemoryRepository({evidenceRequests:requests,evidencePackages:requests.map((item,index)=>({id:`evidence-package:${index+1}`,requestId:item.id,observerId:'inspector-1'}))}),service=new EvidenceRequestService({repository,auditService:{async record(){}},maxSnapshotRows:1});
  const snapshot=service.snapshot({id:'supervisor-1',role:'supervisor',incidentScopes:['PT-2026-1']});
  assert.deepEqual(snapshot.requests.map((item)=>item.id),['evidence-request:1']);assert.deepEqual(snapshot.packages.map((item)=>item.id),['evidence-package:1']);assert.deepEqual({...snapshot.page,responseBytes:undefined},{limit:1,returned:1,totalVisible:2,hasMore:true,responseBytes:undefined});
});

test('a rejected durable evidence mutation closes its intelligence mutation fence',async()=>{const repository=new MemoryRepository({evidenceRequests:[request],evidencePackages:[],fieldOperationReceipts:[]});repository.mutate=async(mutator)=>{await mutator(repository.snapshot());throw new Error('controlled_persistence_failure');};const lifecycle=[],service=new EvidenceRequestService({repository,auditService:{record:async()=>{}},onChanging:async()=>lifecycle.push('begin'),onChangeFailed:async()=>lifecycle.push('abort'),onChanged:async()=>lifecycle.push('commit')});await assert.rejects(()=>service.transition({...actor,role:'supervisor'},request.id,{state:'cancelled'}),/controlled_persistence_failure/);assert.deepEqual(lifecycle,['begin','abort']);});
