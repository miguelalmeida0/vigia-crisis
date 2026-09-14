import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceOperationEffectiveness } from '../src/modules/mission/ground-truth-service.mjs';
import { closeReviewEvidence } from '../src/modules/prevention/prevention-finding-service.mjs';
import { createEvidenceNeed, EVIDENCE_NEED_STATES } from '../../../packages/domain/src/evidence-need.mjs';
import { createEvidenceRequest } from '../../../packages/domain/src/evidence-request.mjs';
import { EvidenceNeedService } from '../src/modules/verification/evidence-need-service.mjs';

test('Action effectiveness measures lifecycle outcomes and keeps empty samples unmeasured',()=>{
  const metrics=evidenceOperationEffectiveness({
    evidenceNeeds:[{state:'RESOLVED',ownerId:'operator-1'},{state:'REQUEST_ACTIVE',ownerId:null}],
    evidenceRequests:[
      {state:'accepted',createdAt:'2026-08-12T08:00:00Z',acknowledgedAt:'2026-08-12T08:10:00Z',resolvedAt:'2026-08-12T09:00:00Z',evidencePackageId:'package-1',dueAt:'2026-08-12T09:00:00Z'},
      {state:'requested',createdAt:'2026-08-12T10:00:00Z',acknowledgedAt:null,resolvedAt:null,dueAt:'2026-08-12T10:30:00Z'}
    ],
    evidencePackages:[{id:'package-1'}]
  },new Date('2026-08-12T11:00:00Z'));
  assert.deepEqual({...metrics,measurementBasis:undefined},{requestsCreated:2,requestsResolved:1,requestsProducingNewEvidence:1,evidencePackages:1,unknownsClosed:1,unknownsClosedWithEvidence:0,unknownsOpen:1,unownedWork:1,overdue:1,medianAcknowledgementMinutes:10,medianResolutionMinutes:60,evidenceYieldPercent:50,internallyActionableRequests:0,actionableRequests:0,waitingRemoteSensor:0,waitingExpertReview:0,associationClosable:0,blockedRequests:0,completedActionableAttempts:1,completedActionableWithEvidence:1,actionableEvidenceYieldPercent:100,backlogDisposition:{UNCLASSIFIED:2},requestCreationState:'UNMEASURED',measurementBasis:undefined});
  const empty=evidenceOperationEffectiveness({},new Date('2026-08-12T11:00:00Z'));assert.equal(empty.medianAcknowledgementMinutes,null);assert.equal(empty.medianResolutionMinutes,null);assert.equal(empty.evidenceYieldPercent,null);
});

test('backlog reconciliation closes unobtainable and duplicate requests without closing their unknowns',async()=>{
  const at='2026-08-12T08:00:00Z',fireNeed=createEvidenceNeed({id:'need-fire',subjectId:'event-1',missingQuantity:'confirm_public_report',state:EVIDENCE_NEED_STATES.REQUEST_ACTIVE,createdAt:at}),reviewNeed=createEvidenceNeed({id:'need-review',subjectType:'prevention_finding',subjectId:'finding-1',missingQuantity:'human_review',state:EVIDENCE_NEED_STATES.REQUEST_ACTIVE,createdAt:at});
  const request=(id,targetType,targetId,needId)=>({...createEvidenceRequest({id,targetType,targetId,ownerId:'supervisor',requestedBy:'system',dueAt:'2026-08-12T12:00:00Z',createdAt:at}),evidenceNeedId:needId,requestedMethodId:targetType==='fire_event'?'manual-field-dispatch':'method:sentinel2-native-review'});
  let state={actors:[{id:'supervisor',role:'supervisor'}],preventionFindings:[{findingId:'finding-1',evidenceRequestId:'review-canonical'}],evidenceNeeds:[fireNeed,reviewNeed],evidenceRequests:[request('fire-request','fire_event','event:event-1','need-fire'),request('review-canonical','prevention_finding','finding-1','need-review'),request('review-duplicate','prevention_finding','finding-1','need-review')]};
  const repository={snapshot:()=>structuredClone(state),mutate:async(fn)=>{state=await fn(structuredClone(state));return structuredClone(state);}},auditService={record:async()=>{}},service=new EvidenceNeedService({repository,auditService,automaticRequestCreation:false,clock:()=>new Date('2026-08-12T10:00:00Z')});
  const summary=await service.reconcileBacklog();
  assert.equal(summary.unobtainableRequestsClosed,1);assert.equal(summary.duplicatesClosed,1);assert.equal(state.evidenceRequests.find((item)=>item.id==='review-canonical').state,'requested');assert.equal(state.evidenceRequests.find((item)=>item.id==='review-duplicate').state,'cancelled');assert.equal(state.evidenceNeeds.find((item)=>item.id==='need-fire').state,EVIDENCE_NEED_STATES.FIELD_CAPACITY_NOT_CONFIGURED);assert.equal(state.evidenceNeeds.find((item)=>item.id==='need-fire').resolvedAt,null);
  assert.equal(state.evidenceRequests.find((item)=>item.id==='review-canonical').actionDisposition.class,'WAITING_EXPERT_REVIEW');assert.equal(state.evidenceRequests.find((item)=>item.id==='review-duplicate').actionDisposition.class,'SUPERSEDED');assert.equal(state.evidenceRequests.find((item)=>item.id==='fire-request').actionDisposition.class,'EXTERNALLY_BLOCKED');
});

test('a persisted prevention review closes its owned request with attributable evidence',()=>{
  const at='2026-08-12T08:00:00Z',finding={findingId:'finding-1',coordinate:[-8,40],evidenceNeedId:'need-1',evidenceRequestId:'request-1'},need=createEvidenceNeed({id:'need-1',subjectType:'prevention_finding',subjectId:'finding-1',missingQuantity:'human_review',state:EVIDENCE_NEED_STATES.REQUEST_ACTIVE,createdAt:at}),request=createEvidenceRequest({id:'request-1',targetType:'prevention_finding',targetId:'finding-1',ownerId:'reviewer-1',requestedBy:'reviewer-1',dueAt:'2026-08-12T12:00:00Z',createdAt:at}),review={id:'review-1',reviewerId:'reviewer-1',reviewerType:'DEVELOPER_REVIEW',reviewedAt:'2026-08-12T09:00:00Z',decision:'ABSTAIN',reason:'INSUFFICIENT_RESOLUTION',note:'Native pixels cannot resolve causality.'};
  const result=closeReviewEvidence({evidenceNeeds:[need],evidenceRequests:[request],evidencePackages:[]},finding,review),state=result.state;
  assert.equal(state.evidenceRequests[0].state,'accepted');assert.equal(state.evidenceNeeds[0].state,'RESOLVED');assert.equal(state.evidencePackages[0].state,'accepted');assert.equal(state.evidencePackages[0].evidenceType,'prevention_native_scene_review');assert.equal(state.evidencePackages[0].provenance.source,'persisted-prevention-review');assert.equal(result.closure.decision,'ABSTAIN');
});
