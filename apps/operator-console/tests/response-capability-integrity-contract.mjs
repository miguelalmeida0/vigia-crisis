import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { responseCapabilityPanel } from '../src/crisisOperatingSystem.js';
import { responseFacilityIntegrityFacts, responseTaskLifecycle } from '../src/responseCapabilityIntegrity.js';
import { buildResponseRecommendationReviewInput, handleResponseCapabilityAction, responseRecommendationBinding, responseRecommendationReviewCanonicalState, responseRecommendationReviewRevision, validateResponseRecommendationReviewResult } from '../src/responseCapabilityActions.js';
import { domainAction } from '../src/domainActions.js';

const projectionAt='2026-09-04T15:00:00.000Z',incidentId='incident:response-ui',projectionId='response-projection:7',recommendationId='response-recommendation:fire:1';
const receipt={schemaVersion:'vigia.response-recommendation-review-receipt.v1',receiptId:'receipt:response-review:1',incidentId,projectionId,recommendationId,recommendationVersion:'7',recommendationHash:`sha256:${'7'.repeat(64)}`,disposition:'ACKNOWLEDGED_FOR_REVIEW',actorId:'operator:command',recordedAt:'2026-09-04T14:59:00.000Z',idempotencyKey:'review:once',truthEffect:'REVIEW_STATE_ONLY'};
const fieldTask={id:'collection-task:fieldnet:1',collectorType:'FIELDNET_TASK',strategyId:'fieldnet-fire-capacity',provider:{label:'Trusted FieldNet fire-station capacity report'},state:'FIELDNET_TASK_COMPLETED',attemptCount:2,lastAttempt:'2026-09-04T14:50:00.000Z',nextAttempt:null,deadline:'2026-09-04T15:15:00.000Z',escalation:{state:'MONITORING',escalateTo:'INCIDENT_COMMAND'},receipt:{receiptId:'receipt:delivery:1',sourceRecordId:'field-task:1'},delivery:{state:'PERSISTED_AT_TRUSTED_FIELDNET_DESTINATION',recordedTaskId:'field-task:1',recordedAt:'2026-09-04T14:40:00.000Z'},acknowledgement:{state:'RECORDED_LOCAL',acknowledgementId:'ack:field:1',acknowledgedAt:'2026-09-04T14:42:00.000Z'},localCompletion:{state:'COMPLETED_LOCAL_PENDING_SYNC',completionId:'completion:field:1',completedAt:'2026-09-04T14:48:00.000Z'},centralReconciliation:{state:'CENTRAL_RECONCILED',centralRecordId:'central:field:1'}};
const facility={id:'station:one',kind:'FIRE_STATION',name:'Governed station',distanceKm:8,staticCapability:{wildfireCapability:{value:true}},provenance:{provider:'OpenStreetMap contributors',sourceRecordId:'node/123',retrievedAt:'2026-09-01T00:00:00.000Z'},freshness:{state:'STATIC_SNAPSHOT',retrievedAt:'2026-09-01T00:00:00.000Z'},reachability:{state:'ROUTED',travelTimeMinutes:14,method:'OSRM',checkedAt:'2026-09-04T14:57:00.000Z',source:{provider:'Governed OSRM',reference:'route:123'},roadClosureImpact:{state:'APPLIED'},terrainAccessConstraints:{state:'APPLIED'}},dynamicCapacity:{state:'FIELD_REPORTED',fields:{crewsAvailable:2,enginesAvailable:1},lastUpdatedAt:'2026-09-04T14:55:00.000Z',nextExpectedUpdateAt:'2026-09-04T15:10:00.000Z',source:{name:'Authorized FieldNet report',reference:'report:capacity:1',admissionReference:'admission:1'}}};
const recommendation={recommendationId,recommendationVersion:'7',recommendationHash:receipt.recommendationHash,validUntil:'2099-09-04T15:15:00.000Z',nextInvalidatingCondition:'A route, capacity, capability, or source-freshness input changes.',nextSourceUpdate:'2099-09-04T15:05:00.000Z',freshnessRequirement:'Recompute from current attributable capacity and route evidence.',recommendation:'Review Governed station as the fastest routed candidate with attributable available capacity.',basis:'Road route and admitted capacity',authority:'PLANNING_SUPPORT_ONLY'};
const projection={projectionId,incident:{id:incidentId},facilities:{FIRE_STATION:[facility]},resourceCoverageMap:{state:'UNAVAILABLE',truthBoundary:'No inferred coverage.'},responseGaps:[],resourceOptimizer:{recommendedStaging:[]},recommendations:[recommendation],recommendationReviews:[{recommendationId,disposition:receipt.disposition,recordedAt:receipt.recordedAt,receipt}],informationRequirements:[{id:'requirement:1',question:'What response capacity is available?',collectionTasks:[fieldTask],collectionPlan:{executions:[{collectionTaskId:fieldTask.id,strategyId:fieldTask.strategyId,state:fieldTask.state}]}}],truthBoundary:'No dispatch, assignment, or availability is inferred.'};

const facts=responseFacilityIntegrityFacts(facility,projectionAt);
for(const label of ['Route provenance','Static facility provenance','Dynamic capacity provenance','Facility freshness','Capacity freshness','Next expected update','Route checked'])assert.match(facts,new RegExp(label),`facility integrity is missing ${label}`);
for(const value of ['Governed OSRM','route:123','OpenStreetMap contributors','node/123','Authorized FieldNet report','report:capacity:1','admission:1','15:10'])assert.match(facts,new RegExp(value),`facility integrity is missing ${value}`);
assert.doesNotMatch(facts,/<dt>Source<\/dt>/,'route, facility, and capacity provenance must not collapse into one Source field');

const lifecycle=responseTaskLifecycle(projection.informationRequirements,projectionAt);
for(const value of ['FieldNet capacity-task lifecycle','Delivery','receipt:delivery:1','field-task:1','Acknowledgement','ack:field:1','Local completion','completion:field:1','Central reconciliation','central:field:1','Escalation','Incident command'])assert.match(lifecycle,new RegExp(value,'i'),`FieldNet lifecycle is missing ${value}`);
const unreviewedPanel=responseCapabilityPanel({...projection,recommendationReviews:[]},{projectionAt,interactive:true,showTaskLifecycle:true});
assert.match(unreviewedPanel,/data-action="response-recommendation-review:response-recommendation%3Afire%3A1"/,'a current unreviewed version-bound recommendation must expose deliberate review');
const panel=responseCapabilityPanel(projection,{projectionAt,interactive:true,showTaskLifecycle:true});
assert.match(panel,/data-response-projection="response-projection:7"/);
assert.match(panel,/data-response-review-receipt="receipt:response-review:1"/,'the durable review receipt must remain visible');
assert.doesNotMatch(panel,/data-action="response-recommendation-review:/,'a receipt-backed review must not remain exposed as a repeat consequential action');
assert.match(panel,/acknowledgement is review state only/i);
for(const value of ['Valid until','Invalidates when','Next source update','source-freshness input changes','current attributable capacity'])assert.match(panel,new RegExp(value,'i'),`recommendation half-life is missing ${value}`);

const state={selectedIncidentId:incidentId,runtime:{session:{mutationReady:true},pendingOperations:{},canonical:{incidents:{[incidentId]:{operations:{value:{data:{responseCapability:{state:'READY',value:projection}}}}}}}}};
const binding=responseRecommendationBinding(state,recommendationId),input=buildResponseRecommendationReviewInput(binding,{disposition:'ACKNOWLEDGED_FOR_REVIEW',idempotencyKey:'review:once'});
assert.deepEqual(input,{projectionId,recommendationVersion:'7',recommendationHash:receipt.recommendationHash,disposition:'ACKNOWLEDGED_FOR_REVIEW',idempotencyKey:'review:once'});
assert.equal(validateResponseRecommendationReviewResult({state:'RECORDED',receipt},binding,input),receipt);
assert.throws(()=>buildResponseRecommendationReviewInput({...binding,recommendationHash:''},{disposition:'ACKNOWLEDGED_FOR_REVIEW',idempotencyKey:'review:once'}),/input_invalid/);
assert.throws(()=>validateResponseRecommendationReviewResult({state:'RECORDED',receipt:{...receipt,projectionId:'stale'}},binding,input),/binding_invalid/);
assert.match(responseRecommendationReviewRevision(state,recommendationId),new RegExp(`${projectionId}:${recommendationId}:${receipt.receiptId}`));
assert.deepEqual(responseRecommendationReviewCanonicalState(state,recommendationId),{scope:'RESPONSE_RECOMMENDATION_REVIEW',selectedIncidentId:incidentId,incidentId,projectionId,currentProjectionId:projectionId,recommendationId,recommendationVersion:'7',recommendationHash:receipt.recommendationHash,currentRecommendationVersion:'7',currentRecommendationHash:receipt.recommendationHash,receiptId:receipt.receiptId,disposition:receipt.disposition,truthEffect:'REVIEW_STATE_ONLY',bindingState:'CURRENT_PROJECTION_EXACT_BINDING',requiresRereview:false});

const supersedingRecommendation={...recommendation,recommendationVersion:'8',recommendationHash:`sha256:${'8'.repeat(64)}`},supersedingProjection={...projection,projectionId:'response-projection:8',recommendations:[supersedingRecommendation],recommendationReviews:[{...projection.recommendationReviews[0],bindingState:'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED'}]};
const supersedingState={
  ...state,
  runtime:{
    ...state.runtime,
    responseRecommendationReceipts:{[recommendationId]:receipt},
    canonical:{incidents:{[incidentId]:{operations:{value:{data:{responseCapability:{state:'READY',value:supersedingProjection}}}}}}}
  }
};
const supersededPanel=responseCapabilityPanel(supersedingProjection,{projectionAt,interactive:true,showTaskLifecycle:true,transientReviewReceipts:supersedingState.runtime.responseRecommendationReceipts});
assert.match(supersededPanel,/data-response-review-binding="SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED"/);
assert.match(supersededPanel,/data-response-prior-review-receipt="receipt:response-review:1"/,'a superseded durable review must remain auditable');
assert.match(supersededPanel,/supporting evidence changed; the current recommendation requires review/i);
assert.match(supersededPanel,/data-action="response-recommendation-review:response-recommendation%3Afire%3A1"/,'a superseded review must not disable deliberate review of the current recommendation');
assert.deepEqual(responseRecommendationReviewCanonicalState(supersedingState,recommendationId),{scope:'RESPONSE_RECOMMENDATION_REVIEW',selectedIncidentId:incidentId,incidentId,projectionId,currentProjectionId:'response-projection:8',recommendationId,recommendationVersion:'7',recommendationHash:receipt.recommendationHash,currentRecommendationVersion:'8',currentRecommendationHash:supersedingRecommendation.recommendationHash,receiptId:receipt.receiptId,disposition:receipt.disposition,truthEffect:'REVIEW_STATE_ONLY',bindingState:'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED',requiresRereview:true});

const [apiSource,controllerSource,actionHandlerSource]=await Promise.all(['vigiaApi.js','appActionController.js','responseCapabilityActions.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8')));
assert.match(apiSource,/reviewResponseRecommendation:[\s\S]*\/response-capability\/recommendations\/\$\{encodeURIComponent\(recommendationId\)\}\/reviews[\s\S]*method:'POST'/,'client must use the exact governed review endpoint');
assert.match(controllerSource,/await handleResponseCapabilityAction\(/,'the shared controller must route the review action');
const callIndex=actionHandlerSource.indexOf('await vigiaApi.reviewResponseRecommendation'),validationIndex=actionHandlerSource.indexOf('receipt=validateResponseRecommendationReviewResult(response'),cacheIndex=actionHandlerSource.indexOf('state.runtime.responseRecommendationReceipts=');
assert.ok(callIndex>=0&&callIndex<validationIndex&&validationIndex<cacheIndex,'review must remain pessimistic and validate its durable receipt before exposing it');
assert.match(actionHandlerSource,/executeGovernedMutation\(\{workflowId:binding\.recommendationId[\s\S]*revisionScope:'response-recommendation-review'/,'review must use the shared receipt and canonical-refresh proof path');
assert.match(actionHandlerSource,/receipt\.truthEffect!=='REVIEW_STATE_ONLY'/,'receipt validation must fail closed outside the review-only truth boundary');
assert.match(actionHandlerSource,/await ensureMutationSession\(state\)/,'a deliberate review must re-confirm a stale client mutation session before opening its form');
assert.match(actionHandlerSource,/sessionContinuityMatches\(created,confirmed\)/,'session recovery must prove continuity rather than trusting a single session response');
const action=domainAction('AcknowledgeResponseRecommendation');
assert.equal(action.uiPolicy,'PESSIMISTIC');
assert.match(action.postconditions.join(' '),/does not assign, reserve, request, acknowledge, stage, or dispatch/i);

const originalFetch=globalThis.fetch,originalDocument=globalThis.document,toasts=[],proof={actions:[]},app={dataset:{}},renders={count:0};let submitAction='',refreshes=0,closed=false;
try{
  globalThis.document={querySelector:()=>({click(){closed=true;}})};
  globalThis.fetch=async(url,options)=>{assert.match(String(url),/\/incident%3Aresponse-ui\/response-capability\/recommendations\/response-recommendation%3Afire%3A1\/reviews$/);assert.equal(options.method,'POST');assert.equal(state.runtime.responseRecommendationReceipts,undefined,'review state must not advance before the server receipt');assert.equal(state.runtime.pendingOperations.responseRecommendationReview.recommendationId,recommendationId);const inputValue=JSON.parse(options.body);return new Response(JSON.stringify({state:'RECORDED',receipt:{...receipt,idempotencyKey:inputValue.idempotencyKey}}),{status:201,headers:{'content-type':'application/json'}});};
  const context={state,actionForm:(_title,_description,_fields,submit)=>{submitAction=submit;},overlayField:key=>key==='disposition'?'ACKNOWLEDGED_FOR_REVIEW':'Reviewed for command consideration.',executeGovernedMutation:async(options,operation,message)=>{assert.equal(options.revisionScope,'response-recommendation-review');const result=await operation();refreshes+=1;closed=true;assert.equal(state.runtime.responseRecommendationReceipts[recommendationId].receiptId,receipt.receiptId);proof.actions.push({state:'PASS',...options});toasts.push({message,tone:'green'});return result;},render:()=>{renders.count+=1;},toast:(message,tone)=>toasts.push({message,tone})};
  assert.equal(await handleResponseCapabilityAction({kind:'response-recommendation-review',value:encodeURIComponent(recommendationId),...context}),true);
  assert.match(submitAction,/^response-recommendation-review-submit:/);
  assert.equal(await handleResponseCapabilityAction({kind:'response-recommendation-review-submit',value:submitAction.slice(submitAction.indexOf(':')+1),...context}),true);
}finally{globalThis.fetch=originalFetch;if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
assert.equal(refreshes,1,`a successful durable receipt must trigger one canonical refresh: ${JSON.stringify(toasts)}`);
assert.equal(closed,true);assert.equal(state.runtime.pendingOperations.responseRecommendationReview,null);assert.equal(proof.actions.at(-1).state,'PASS');assert.equal(toasts.at(-1).tone,'green');assert.ok(renders.count>=2);

console.log('Response-capability operator integrity contract passed.');
