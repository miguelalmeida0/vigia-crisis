import { incidentEnvelope } from './canonicalViewModel.js?v=3.0.0';
import { domainAction } from './domainActions.js?v=1.0.0';
import { sessionContinuityMatches } from './runtimeLoader.js?v=2.1.0';
import { vigiaApi } from './vigiaApi.js?v=2.1.0';

const dispositions=new Set(['ACKNOWLEDGED_FOR_REVIEW','DEFERRED','DECLINED']);
const rows=value=>Array.isArray(value)?value:[];
const present=value=>value!==null&&value!==undefined&&String(value).trim();
const decode=value=>{try{return decodeURIComponent(value);}catch{return'';}};

async function ensureMutationSession(state){
  if(state.runtime?.session?.mutationReady===true)return state.runtime.session;
  const created=await vigiaApi.createSession(),confirmed=await vigiaApi.session();
  if(!sessionContinuityMatches(created,confirmed))throw new Error('authenticated_command_session_required');
  state.runtime.session={...confirmed,mutationReady:true};
  return state.runtime.session;
}

export function responseCapabilityFromState(state){
  for(const route of ['operations','detail','intelligence']){
    const section=incidentEnvelope(state,route)?.data?.responseCapability;
    if(['READY','DEGRADED'].includes(section?.state)&&section.value)return section.value;
  }
  return null;
}

export function responseRecommendationBinding(state,recommendationId){
  const projection=responseCapabilityFromState(state),incidentId=state?.selectedIncidentId,recommendation=rows(projection?.recommendations).find(item=>String(item?.recommendationId??item?.id??'')===String(recommendationId));
  if(!projection||!recommendation||!present(incidentId)||String(projection?.incident?.id)!==String(incidentId))throw new Error('response_recommendation_incident_binding_invalid');
  if(!present(projection.projectionId)||!present(recommendation.recommendationId)||!present(recommendation.recommendationVersion)||!present(recommendation.recommendationHash))throw new Error('response_recommendation_version_binding_missing');
  const validUntil=recommendation.validUntil??recommendation.expiresAt;
  if(Number.isFinite(Date.parse(validUntil))&&Date.parse(validUntil)<=Date.now())throw new Error('response_recommendation_expired');
  return{incidentId:String(incidentId),projectionId:String(projection.projectionId),recommendationId:String(recommendation.recommendationId),recommendationVersion:recommendation.recommendationVersion,recommendationHash:String(recommendation.recommendationHash),validUntil:validUntil??null};
}

function currentRecommendationAndReview(state,recommendationId){
  const projection=responseCapabilityFromState(state),recommendation=rows(projection?.recommendations).find(item=>String(item?.recommendationId??item?.id??'')===String(recommendationId));
  const history=[...rows(projection?.recommendationReviews)].reverse(),exactReview=history.find(item=>{const receipt=item?.receipt??item;return receipt?.receiptId&&String(receipt.recommendationId)===String(recommendationId)&&String(receipt.projectionId)===String(projection?.projectionId)&&String(receipt.recommendationVersion)===String(recommendation?.recommendationVersion)&&String(receipt.recommendationHash)===String(recommendation?.recommendationHash);})??null;
  const priorReview=history.find(item=>{const receipt=item?.receipt??item;return receipt?.receiptId&&String(receipt.recommendationId)===String(recommendationId);})??null,transient=state?.runtime?.responseRecommendationReceipts?.[recommendationId]??null,review=exactReview??priorReview,receipt=review?.receipt??review??transient;
  const sameSemantic=String(receipt?.recommendationVersion??'')===String(recommendation?.recommendationVersion??'')&&String(receipt?.recommendationHash??'')===String(recommendation?.recommendationHash??''),bindingState=!receipt?.receiptId?'UNREVIEWED':String(receipt.projectionId)===String(projection?.projectionId)&&sameSemantic?'CURRENT_PROJECTION_EXACT_BINDING':sameSemantic?'PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION':'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED';
  return{projection,recommendation,review,receipt,bindingState,requiresRereview:Boolean(receipt?.receiptId)&&bindingState!=='CURRENT_PROJECTION_EXACT_BINDING'};
}

export function responseRecommendationReviewRevision(state,recommendationId){
  const {projection,receipt,bindingState}=currentRecommendationAndReview(state,recommendationId);
  return`response-recommendation-review:${projection?.projectionId??'projection-unavailable'}:${recommendationId??'recommendation-unavailable'}:${receipt?.receiptId??'unreviewed'}:${bindingState}`;
}

export function responseRecommendationReviewCanonicalState(state,recommendationId){
  const {projection,recommendation,receipt,bindingState,requiresRereview}=currentRecommendationAndReview(state,recommendationId);
  return{scope:'RESPONSE_RECOMMENDATION_REVIEW',selectedIncidentId:state?.selectedIncidentId??null,incidentId:receipt?.incidentId??projection?.incident?.id??null,projectionId:receipt?.projectionId??null,currentProjectionId:projection?.projectionId??null,recommendationId:recommendation?.recommendationId??recommendationId??null,recommendationVersion:receipt?.recommendationVersion??recommendation?.recommendationVersion??null,recommendationHash:receipt?.recommendationHash??recommendation?.recommendationHash??null,currentRecommendationVersion:recommendation?.recommendationVersion??null,currentRecommendationHash:recommendation?.recommendationHash??null,receiptId:receipt?.receiptId??null,disposition:receipt?.disposition??null,truthEffect:receipt?.truthEffect??null,bindingState,requiresRereview};
}

export function buildResponseRecommendationReviewInput(binding,{disposition,idempotencyKey,note=''}){
  if(!binding||!present(binding.projectionId)||!present(binding.recommendationVersion)||!present(binding.recommendationHash)||!dispositions.has(disposition)||!present(idempotencyKey))throw new Error('response_recommendation_review_input_invalid');
  return{projectionId:binding.projectionId,recommendationVersion:binding.recommendationVersion,recommendationHash:binding.recommendationHash,disposition,idempotencyKey,...(present(note)?{note:String(note).trim()}:{})};
}

export function validateResponseRecommendationReviewResult(result,binding,input){
  const receipt=result?.receipt;
  if(!['RECORDED','ALREADY_RECORDED'].includes(result?.state)||!receipt?.receiptId||!Number.isFinite(Date.parse(receipt.recordedAt))||!receipt.actorId)throw new Error('response_recommendation_review_receipt_missing');
  const matches=String(receipt.incidentId)===binding.incidentId&&String(receipt.projectionId)===binding.projectionId&&String(receipt.recommendationId)===binding.recommendationId&&String(receipt.recommendationVersion)===String(binding.recommendationVersion)&&String(receipt.recommendationHash)===binding.recommendationHash&&String(receipt.disposition)===input.disposition&&String(receipt.idempotencyKey)===input.idempotencyKey;
  if(!matches||receipt.truthEffect!=='REVIEW_STATE_ONLY')throw new Error('response_recommendation_review_receipt_binding_invalid');
  return receipt;
}

export async function handleResponseCapabilityAction({kind,value,state,actionForm,overlayField,executeGovernedMutation,render,toast}){
  if(!['response-recommendation-review','response-recommendation-review-submit'].includes(kind))return false;
  if(kind==='response-recommendation-review'){
    const recommendationId=decode(value),spec=domainAction('AcknowledgeResponseRecommendation');
    try{
      await ensureMutationSession(state);
      responseRecommendationBinding(state,recommendationId);
      const idempotencyKey=crypto.randomUUID();
      actionForm(spec?.label??'Review recommendation',`${spec?.intent??'Record a bounded human review state.'} The server will re-resolve the exact incident, projection, version, hash, and expiry. This never assigns, reserves, requests, or dispatches a resource.`,[{id:'disposition',label:'Review disposition',value:'DEFERRED',options:[{value:'DEFERRED',label:'Defer — no acknowledgement'},{value:'ACKNOWLEDGED_FOR_REVIEW',label:'Acknowledge for review'},{value:'DECLINED',label:'Decline recommendation'}]},{id:'note',label:'Review note',multiline:true,optional:true}],`response-recommendation-review-submit:${encodeURIComponent(recommendationId)}:${encodeURIComponent(idempotencyKey)}`);
    }catch(error){toast(`Recommendation review unavailable: ${error.message}`,'warning');}
    return true;
  }
  const separator=value.indexOf(':'),recommendationId=decode(value.slice(0,separator)),idempotencyKey=decode(value.slice(separator+1));
  if(state.runtime?.pendingOperations?.responseRecommendationReview){toast('A recommendation review is already being recorded','warning');return true;}
  let binding=null,receipt=null,result=null;
  try{
    binding=responseRecommendationBinding(state,recommendationId);
    const input=buildResponseRecommendationReviewInput(binding,{disposition:overlayField('disposition'),note:overlayField('note'),idempotencyKey});
    state.runtime.pendingOperations.responseRecommendationReview={recommendationId,beganAt:new Date().toISOString()};render();
    result=await executeGovernedMutation({workflowId:binding.recommendationId,action:'REVIEW_RESPONSE_RECOMMENDATION',uiAction:`response-recommendation-review:${encodeURIComponent(binding.recommendationId)}`,revisionScope:'response-recommendation-review'},async()=>{const response=await vigiaApi.reviewResponseRecommendation(binding.incidentId,binding.recommendationId,input);receipt=validateResponseRecommendationReviewResult(response,binding,input);state.runtime.responseRecommendationReceipts={...(state.runtime.responseRecommendationReceipts??{}),[binding.recommendationId]:receipt};return response;},'Recommendation review receipt retained; no dispatch occurred');
  }catch(error){toast(receipt?`Review receipt ${receipt.receiptId} was recorded, but canonical refresh failed: ${error.message}`:`Recommendation review was not recorded: ${error.message}`,'warning');}
  finally{state.runtime.pendingOperations.responseRecommendationReview=null;render();}
  return true;
}
