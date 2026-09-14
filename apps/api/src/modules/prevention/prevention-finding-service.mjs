import { createHash } from 'node:crypto';
import { assertCan, assertGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';
import { createEvidenceNeed, EVIDENCE_NEED_STATES, transitionEvidenceNeed } from '../../../../../packages/domain/src/evidence-need.mjs';
import { createEvidenceRequest, transitionEvidenceRequest } from '../../../../../packages/domain/src/evidence-request.mjs';
import { createEvidenceEnvelope } from '../../../../../packages/domain/src/evidence-envelope.mjs';
import { createFuelContinuityFinding } from '../../../../../packages/domain/src/fuel-continuity-finding.mjs';
import { createPreventionReview, preventionFindingVersion, preventionValidationMetrics } from '../../../../../packages/domain/src/prevention-review.mjs';
import { computeFindingAttentionPriority } from '../../../../../packages/domain/src/prevention-priority.mjs';
import { buildFuelConnectivityGraph, buildInterventionCandidate } from '../../../../../packages/domain/src/fuel-connectivity-graph.mjs';
import { createPreventionMission, transitionPreventionMission } from '../../../../../packages/domain/src/prevention-mission.mjs';

const VERSION = 'fuel_continuity_change_screen_v1';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plusHours = (at, hours) => new Date(Date.parse(at) + hours * 3_600_000).toISOString();
const REVIEWER_QUALIFICATION=Object.freeze({DOMAIN_EXPERT_REVIEW:'wildfire_prevention_domain_expert',WILDFIRE_EXPERT_REVIEW:'wildfire_prevention_domain_expert',REMOTE_SENSING_EXPERT_REVIEW:'remote_sensing_expert',FORESTRY_EXPERT_REVIEW:'forestry_expert'});
const EXPERT_REVIEWER_TYPES=new Set(Object.keys(REVIEWER_QUALIFICATION));
function avoidance(item){try{const fuelConnectivityGraph=buildFuelConnectivityGraph(item),candidate=buildInterventionCandidate(item,fuelConnectivityGraph);return{fuelConnectivityGraph,interventionCandidates:candidate?[candidate]:[],avoidanceState:'REVIEW_READY'};}catch(error){return{fuelConnectivityGraph:null,interventionCandidates:[],avoidanceState:'UNAVAILABLE_INVALID_GEOMETRY',avoidanceError:String(error.message??error)};}}
function preventionLedger(findings,reviews,missions){const records=[];for(const item of findings){records.push({type:'PREVENT_FINDING_CREATED',subjectId:item.findingId,at:item.createdAt,version:item.findingVersion},{type:'EXPERT_REVIEW_REQUESTED',subjectId:item.findingId,at:item.updatedAt??item.createdAt,version:item.findingVersion});if(item.interventionCandidates?.[0])records.push({type:'INTERVENTION_CANDIDATE_CREATED',subjectId:item.findingId,at:item.updatedAt??item.createdAt,version:item.interventionCandidates[0].version});}for(const review of reviews){records.push({type:review.decision==='ACCEPT_CANDIDATE'?'FINDING_ACCEPTED':review.decision==='REJECT_CANDIDATE'?'FINDING_REJECTED':'FINDING_ABSTAINED',subjectId:review.findingId,at:review.reviewedAt,version:review.findingVersion});if(review.interventionDecision==='YES')records.push({type:'INTERVENTION_REVIEW_ACCEPTED',subjectId:review.findingId,at:review.reviewedAt,version:review.candidateVersion});}for(const mission of missions)records.push(...(mission.events??[]).map((event)=>({...event,subjectId:mission.id,version:mission.candidateVersion})));return records.filter((item)=>item.at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}

function evidenceMethod(actor) {
  return {
    id: 'method:sentinel2-native-review', label: 'Review native Sentinel-2 comparison', kind: 'REMOTE_SENSING', methodType: 'current_remote_source', availability: 'available', ownerId: actor.id,
    informationGain: { state: 'UNMEASURED' }, latency: { state: 'MEASURED', value: 'operator_review' }, reliability: { state: 'UNMEASURED' }, cost: { state: 'UNMEASURED' },
    note: 'Review the native current/comparison scenes and mapped structure relationship. This closes screening review, not physical verification.'
  };
}

function interactions(exposure) {
  return (exposure?.assets ?? []).slice(0, 12).map((asset) => ({ id:asset.id,kind:asset.kind,label:asset.label,coordinate:asset.coordinate,relationship:'inside_analysis_context' }));
}
function geometryBbox(findings) {
  const points=[];
  const visit=(value)=>{if(Array.isArray(value)&&value.length===2&&value.every(Number.isFinite))points.push(value);else if(Array.isArray(value))for(const item of value)visit(item);};
  for(const finding of findings)visit(finding.geometry?.coordinates);
  if(!points.length)return null;
  const xs=points.map((point)=>point[0]),ys=points.map((point)=>point[1]);
  return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
}

export function closeReviewEvidence(state,finding,review){
  const requestIndex=(state.evidenceRequests??[]).findIndex((item)=>item.id===finding.evidenceRequestId),needIndex=(state.evidenceNeeds??[]).findIndex((item)=>item.id===finding.evidenceNeedId);
  if(requestIndex<0||needIndex<0)return{state,closure:null};
  const packageId=`evidence-package:${digest({reviewId:review.id,requestId:finding.evidenceRequestId}).slice(0,28)}`,priorPackage=(state.evidencePackages??[]).find((item)=>item.id===packageId);
  if(state.evidenceRequests[requestIndex].state==='accepted'&&state.evidenceNeeds[needIndex].state===EVIDENCE_NEED_STATES.RESOLVED&&priorPackage)return{state,closure:null};
  const at=review.reviewedAt,actorId=review.reviewerId,evidencePackage=priorPackage??createEvidenceEnvelope({id:packageId,requestId:finding.evidenceRequestId,observerId:actorId,observerRole:review.reviewerType,capturedAt:at,receivedAt:at,coordinate:finding.coordinate,evidenceType:'prevention_native_scene_review',note:review.note,observations:[`decision:${review.decision}`,`reason:${review.reason}`],provenance:{device:'VIGIA Review Lab',clientVersion:'10.0.0',offlineCaptured:false,source:'persisted-prevention-review',locationSource:'analysis_assignment'}});
  let request=state.evidenceRequests[requestIndex];
  if(request.state==='requested')request=transitionEvidenceRequest(request,'acknowledged',{actorId,at,note:'Native scene-pair review opened.'});
  if(request.state==='acknowledged')request=transitionEvidenceRequest(request,'in_progress',{actorId,at,note:'Exact detector scene pair inspected.'});
  if(request.state==='in_progress')request=transitionEvidenceRequest(request,'submitted',{actorId,at,evidencePackageId:packageId,note:review.note});
  if(request.state==='submitted')request=transitionEvidenceRequest(request,'accepted',{actorId,at,note:'Evidence-backed review workflow completed.',review:{actorId,note:review.note,decision:'accepted',findingDecision:review.decision,findingReason:review.reason}});
  const evidenceRequests=[...(state.evidenceRequests??[])];evidenceRequests[requestIndex]=request;
  const evidencePackages=[...(state.evidencePackages??[])],packageIndex=evidencePackages.findIndex((item)=>item.id===packageId),acceptedPackage={...evidencePackage,state:'accepted',review:request.review};if(packageIndex>=0)evidencePackages[packageIndex]=acceptedPackage;else evidencePackages.unshift(acceptedPackage);
  const evidenceNeeds=[...(state.evidenceNeeds??[])];evidenceNeeds[needIndex]=transitionEvidenceNeed(evidenceNeeds[needIndex],EVIDENCE_NEED_STATES.RESOLVED,{at,reason:`Native Sentinel-2 review completed: ${review.decision} / ${review.reason}. The finding remains screening evidence unless separately verified.`,escalationReason:null});
  return{state:{...state,evidenceRequests,evidencePackages,evidenceNeeds},closure:{requestId:request.id,evidencePackageId:packageId,evidenceNeedId:evidenceNeeds[needIndex].id,reviewId:review.id,decision:review.decision,reason:review.reason}};
}

export class PreventionFindingService {
  constructor({ repository, geospatialAnalysisService, auditService, preventionReviewContextService=null,preventionReviewExchange=null, clock = () => new Date(), onChanged = () => {} }) { Object.assign(this,{repository,geospatialAnalysisService,auditService,preventionReviewContextService,preventionReviewExchange,clock,onChanged}); }
  snapshot(actor=null) {
    if(actor)assertGlobalIncidentScope(actor);
    const state=this.repository.snapshot(),rawFindings=state.preventionFindings??[],rawReviews=state.preventionReviews??[];
    const enriched=rawFindings.map((item)=>this.preventionReviewContextService?.enrich(item)??item);
    const findings=enriched.map((item)=>{const findingVersion=preventionFindingVersion(item),reviews=rawReviews.filter((review)=>review.findingId===item.findingId&&review.detectorVersion===item.detectorVersion&&review.findingVersion===findingVersion),projection=avoidance(item);return{...item,...projection,findingVersion,attentionPriority:computeFindingAttentionPriority(item,{now:this.clock()}),reviewSummary:{count:reviews.length,developer:reviews.filter((review)=>review.reviewerType==='DEVELOPER_REVIEW').length,domainExpert:reviews.filter((review)=>EXPERT_REVIEWER_TYPES.has(review.reviewerType)).length,byClass:Object.fromEntries([...EXPERT_REVIEWER_TYPES].map((type)=>[type,reviews.filter((review)=>review.reviewerType===type).length])),latest:reviews.at(-1)?{decision:reviews.at(-1).decision,interventionDecision:reviews.at(-1).interventionDecision??'ABSTAIN',reason:reviews.at(-1).reason,reviewerType:reviews.at(-1).reviewerType,reviewedAt:reviews.at(-1).reviewedAt}:null}};});
    const reviews=rawReviews.map(({reviewerId,...review})=>review);
    const missions=state.preventionMissions??[],validation=preventionValidationMetrics(enriched,rawReviews);
    return {findings,runs:state.detectorRuns??[],reviews,missions,avoidanceLedger:preventionLedger(findings,rawReviews,missions),reviewContext:this.preventionReviewContextService?.snapshot()??null,reviewExchange:this.preventionReviewExchange?.snapshot()??{state:'not_configured'},validation:{...validation,fuelGraphCount:findings.length,interventionCandidateCount:findings.reduce((sum,item)=>sum+item.interventionCandidates.length,0),counterfactualCount:findings.filter((item)=>item.interventionCandidates[0]?.connectivity).length,preventionMissionCount:missions.length,postInterventionVerifiedCount:missions.filter((item)=>['VERIFIED_CHANGE','CLOSED'].includes(item.state)).length,graphStability:null,graphStabilityBasis:'UNMEASURED_NO_REPEAT_SCENE_GRAPH_CORPUS'}};
  }
  find(id,actor=null) { return this.snapshot(actor).findings.find((item)=>item.findingId===id)??null; }
  async review(actor,id,input={}) {
    assertCan(actor,'review:prevention');
    assertGlobalIncidentScope(actor);
    const state=this.repository.snapshot(),rawFinding=(state.preventionFindings??[]).find((item)=>item.findingId===id);
    if(!rawFinding)throw new Error('prevention_finding_not_found');
    const finding=this.preventionReviewContextService?.enrich(rawFinding)??rawFinding;
    const reviewerType=String(input.reviewerType??'DEVELOPER_REVIEW');
    const requiredQualification=REVIEWER_QUALIFICATION[reviewerType];
    if(requiredQualification&&!(actor.qualifications??[]).includes(requiredQualification))throw Object.assign(new Error('domain_expert_qualification_required'),{statusCode:403,details:{requiredQualification,reviewerType}});
    const reviewedAt=this.clock().toISOString();
    const projection=avoidance(finding),candidate=projection.interventionCandidates[0];
    const review=createPreventionReview({
      id:`prevention-review:${digest({findingId:id,reviewerId:actor.id,reviewedAt,decision:input.decision,interventionDecision:input.interventionDecision}).slice(0,28)}`,
      findingId:id,detectorVersion:finding.detectorVersion,modelVersion:finding.detectorVersion,findingVersion:preventionFindingVersion(finding),scenePair:{currentObservationId:finding.currentObservationId,comparisonObservationId:finding.comparisonObservationId},reviewerType,reviewerId:actor.id,reviewerQualifications:actor.qualifications??[],organization:input.organization,decision:input.decision,reason:input.reason,note:input.note,graphVersion:projection.fuelConnectivityGraph?.version,candidateVersion:candidate?.version,interventionDecision:input.interventionDecision,interventionReason:input.interventionReason,sourceQuality:finding.sourceQuality,landCoverContext:finding.landCoverContext,reviewedAt
    });
    let closure=null;
    await this.repository.mutate((current)=>{let withReview={...current,preventionReviews:[...(current.preventionReviews??[]),review].slice(-2_000)};if(EXPERT_REVIEWER_TYPES.has(reviewerType)&&review.interventionDecision==='YES'&&candidate){const missionId=`prevention-mission:${digest({findingId:id,candidateVersion:candidate.version}).slice(0,24)}`,prior=(current.preventionMissions??[]).find((item)=>item.id===missionId);let mission=prior??createPreventionMission({id:missionId,findingId:id,candidateVersion:candidate.version,graphVersion:projection.fuelConnectivityGraph.version,place:finding.place,coordinate:candidate.candidateBreakLocation,createdAt:reviewedAt,actorId:actor.id});if(mission.state==='PROPOSED')mission=transitionPreventionMission(mission,'EXPERT_ACCEPTED',{actorId:actor.id,at:reviewedAt,reason:review.interventionReason});withReview={...withReview,preventionMissions:[mission,...(current.preventionMissions??[]).filter((item)=>item.id!==missionId)]};}const applied=closeReviewEvidence(withReview,finding,review);closure=applied.closure;return applied.state;});
    await this.auditService.record({actor,type:'prevention.finding.reviewed',entityType:'prevention_finding',entityId:id,payload:{reviewId:review.id,reviewerType:review.reviewerType,decision:review.decision,interventionDecision:review.interventionDecision,reason:review.reason,detectorVersion:review.detectorVersion,graphVersion:review.graphVersion,candidateVersion:review.candidateVersion}});
    if(closure){await this.auditService.record({actor,type:'evidence.submitted',entityType:'evidence_package',entityId:closure.evidencePackageId,payload:closure});await this.auditService.record({actor,type:'evidence.accepted',entityType:'evidence_request',entityId:closure.requestId,payload:closure});await this.auditService.record({actor,type:'evidence_need.resolved',entityType:'evidence_need',entityId:closure.evidenceNeedId,payload:closure});}
    this.onChanged({type:'prevention.finding.reviewed',findingId:id,reviewId:review.id});
    return {review,evidenceClosure:closure,validation:this.snapshot().validation};
  }
  async transitionMission(actor,id,input={}){assertCan(actor,'review:prevention');assertGlobalIncidentScope(actor);let updated=null;await this.repository.mutate((state)=>{const missions=[...(state.preventionMissions??[])],index=missions.findIndex((item)=>item.id===id);if(index<0)throw new Error('prevention_mission_not_found');updated=transitionPreventionMission(missions[index],String(input.state),{actorId:actor.id,reason:input.reason,patch:input.patch??{}});missions[index]=updated;return{...state,preventionMissions:missions};});await this.auditService.record({actor,type:'prevention.mission.transitioned',entityType:'prevention_mission',entityId:id,payload:{state:updated.state,event:updated.events.at(-1)}});this.onChanged({type:'prevention.mission.changed',missionId:id});return updated;}
  exportExpertReviewPack(actor){assertGlobalIncidentScope(actor);return this.preventionReviewExchange.exportPack();}
  async importExpertReviews(actor,payload={}){
    assertCan(actor,'review:prevention');assertGlobalIncidentScope(actor);const snapshot=this.snapshot(),rows=this.preventionReviewExchange.resolve(payload,snapshot.findings);
    for(const row of rows){if(!EXPERT_REVIEWER_TYPES.has(row.reviewerType))throw new Error('expert_reviewer_type_required');const required=REVIEWER_QUALIFICATION[row.reviewerType];if(!(actor.qualifications??[]).includes(required))throw Object.assign(new Error('domain_expert_qualification_required'),{statusCode:403,details:{requiredQualification:required,reviewerType:row.reviewerType}});}
    const imported=[];for(const row of rows){const result=await this.review(actor,row.findingId,row);imported.push({caseId:row.caseId,reviewId:result.review.id,findingId:row.findingId,evidenceClosure:result.evidenceClosure});}
    await this.auditService.record({actor,type:'prevention.expert_reviews.imported',entityType:'prevention_review_batch',entityId:`batch:${digest(imported).slice(0,20)}`,payload:{count:imported.length,caseIds:imported.map((item)=>item.caseId)}});return{schema:'vigia.prevention.expert-review-import-result.v1',imported:imported.length,items:imported,validation:this.snapshot().validation};
  }
  async reconcileReviewVersionGaps(){
    const reopened=[],at=this.clock().toISOString(),activeStates=new Set(['requested','acknowledged','in_progress','submitted']);
    await this.repository.mutate((current)=>{
      const findings=[...(current.preventionFindings??[])],needs=[...(current.evidenceNeeds??[])],requests=[...(current.evidenceRequests??[])];
      for(let index=0;index<findings.length;index+=1){
        const raw=findings[index],finding=this.preventionReviewContextService?.enrich(raw)??raw,version=preventionFindingVersion(finding);
        const currentReview=(current.preventionReviews??[]).some((review)=>review.findingId===finding.findingId&&review.detectorVersion===finding.detectorVersion&&review.findingVersion===version);
        if(currentReview)continue;
        const active=requests.find((request)=>request.targetType==='prevention_finding'&&request.targetId===finding.findingId&&activeStates.has(request.state));
        if(active){if(raw.evidenceRequestId!==active.id)findings[index]={...raw,evidenceRequestId:active.id,evidenceNeedId:active.evidenceNeedId??raw.evidenceNeedId,updatedAt:at};continue;}
        const prior=[...requests].filter((request)=>request.targetType==='prevention_finding'&&request.targetId===finding.findingId).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0],ownerId=prior?.ownerId??'vigia-operator',token=digest({findingId:finding.findingId,version}).slice(0,20),needId=`evidence-need:${token}`,requestId=`evidence-request:${token}`,dueAt=plusHours(at,4);
        const need=createEvidenceNeed({id:needId,subjectType:'prevention_finding',subjectId:finding.findingId,missingQuantity:'human_review_of_fuel_continuity_change',reason:'The current geometry-bound finding version has no attributable review. Prior-version reviews remain audit history only.',candidateMethods:[evidenceMethod({id:ownerId})],ranking:{state:'UNMEASURED',basis:['native_pixel_review_available','geometry_bound_context_available'],missingDimensions:['domain_expert_label']},state:EVIDENCE_NEED_STATES.REQUEST_ACTIVE,ownerId,evidenceRequestId:requestId,selectedMethodId:'method:sentinel2-native-review',createdAt:at});
        const request={...createEvidenceRequest({id:requestId,targetType:'prevention_finding',targetId:finding.findingId,title:'Review current fuel-continuity finding version',coordinate:finding.coordinate,ownerId,requestedBy:'system',priority:'high',dueAt,requirements:['Inspect the exact native current and comparison scenes','Use geometry-bound road, terrain and land-cover context','Adjudicate seasonal, agricultural, forestry and registration alternatives','Accept, reject or abstain with attributable evidence note'],createdAt:at}),evidenceNeedId:needId,missingQuantity:'human_review_of_fuel_continuity_change',requestedMethodId:'method:sentinel2-native-review',findingVersion:version};
        needs.unshift(need);requests.unshift(request);findings[index]={...raw,evidenceNeedId:needId,evidenceRequestId:requestId,updatedAt:at};reopened.push({findingId:finding.findingId,findingVersion:version,evidenceNeedId:needId,evidenceRequestId:requestId});
      }
      return{...current,preventionFindings:findings,evidenceNeeds:needs,evidenceRequests:requests};
    });
    for(const item of reopened)await this.auditService.record({actor:null,type:'prevention.review.version_gap_reopened',entityType:'prevention_finding',entityId:item.findingId,payload:item});
    return{reopened:reopened.length,items:reopened};
  }
  async reconcileEvidenceClosures(){
    const closures=[];
    await this.repository.mutate((current)=>{let next=current;for(const raw of current.preventionFindings??[]){const finding=this.preventionReviewContextService?.enrich(raw)??raw,version=preventionFindingVersion(finding),review=(current.preventionReviews??[]).filter((item)=>item.findingId===finding.findingId&&item.detectorVersion===finding.detectorVersion&&item.findingVersion===version).sort((a,b)=>Date.parse(b.reviewedAt)-Date.parse(a.reviewedAt))[0];if(!review)continue;const applied=closeReviewEvidence(next,finding,review);next=applied.state;if(applied.closure)closures.push(applied.closure);}return next;});
    for(const closure of closures){await this.auditService.record({actor:null,type:'evidence.submitted',entityType:'evidence_package',entityId:closure.evidencePackageId,payload:{...closure,reconciled:true}});await this.auditService.record({actor:null,type:'evidence.accepted',entityType:'evidence_request',entityId:closure.requestId,payload:{...closure,reconciled:true}});await this.auditService.record({actor:null,type:'evidence_need.resolved',entityType:'evidence_need',entityId:closure.evidenceNeedId,payload:{...closure,reconciled:true}});}
    if(closures.length)this.onChanged({type:'prevention.review.evidence_closures',count:closures.length});return{closed:closures.length,closures};
  }
  screeningSnapshot({ primaryId, comparableId } = {},actor) {
    assertGlobalIncidentScope(actor);
    if(!primaryId||!comparableId)return null;
    const state=this.snapshot(actor);
    const findings=state.findings.filter((item)=>item.currentObservationId===primaryId&&item.comparisonObservationId===comparableId);
    if(!findings.length)return null;
    const first=findings[0],run=state.runs.find((item)=>item.id===first.provenance?.runId)??null;
    return {
      state:run?.state??'screened',method:'persisted_real_detector_run',calibrationState:'unvalidated_screening',persisted:true,viewportBbox:geometryBbox(findings),validFraction:first.sourceQuality?.validPixelFraction??null,
      findings:findings.map((item)=>({id:item.findingId,kind:'fuel_continuity_change_candidate',signalStrength:'screening',geometry:item.geometry,areaM2:item.affectedAreaHa*10_000,corridorLengthM:item.corridorLengthM,nearestStructureM:item.nearestStructureM,structuresWithin150m:item.structuresWithinPolicyRadius})),
      analyses:{spectral:{state:'not_replayed',method:null,findings:0},fuelContinuity:{state:run?.state??'screened',method:first.detectorVersion,findings:findings.length,reason:null}},
      observations:{current:first.provenance?.current??null,comparison:first.provenance?.comparison??null},integrity:first.provenance?.integrity??null,provenance:{runId:run?.id??first.provenance?.runId,algorithm:first.provenance?.algorithm,persistence:'postgis_physical_truth_transaction'},
      exposure:{state:first.sourceQuality?.exposureState??'unavailable',provider:first.provenance?.exposure?.provider??null,assets:findings.flatMap((item)=>item.infrastructureInteractions??[]),limitation:first.provenance?.exposure?.limitation??'Mapped structure context unavailable.'}
    };
  }
  observationSnapshot({ primaryId, comparableId } = {},actor) {
    assertGlobalIncidentScope(actor);
    const screening=this.screeningSnapshot({primaryId,comparableId},actor);
    if(!screening?.observations?.current||!screening?.observations?.comparison)return null;
    const scene=(item)=>({...item,imageUrl:item.previewUrl??null,bbox:screening.viewportBbox,coversSelection:true,renderProduct:'native_cog_crop',evidenceBinding:{state:item.bindingState??'pixel_verified',bindingHash:item.bindingHash??null,pixelVerified:true,renderAllowed:Boolean(item.visualCogUrl),scientificInferenceAllowed:true}});
    const primary=scene(screening.observations.current),comparable=scene(screening.observations.comparison);
    return {primary,comparable,timeline:[comparable],viewportBbox:screening.viewportBbox,selectionReason:{selected:['Exact detector scene pair restored from the committed physical-truth transaction.'],rejected:[]},changeScreening:{eligible:true,reason:'Persisted detector output is available for this exact pixel-verified scene pair.'},access:{metadata:'available',pixels:'available'},visual:{sensor:primary.sensor,product:'native_cog_crop'},safety:'Screening evidence only.',notice:'Native Sentinel-2 pixels and persisted detector lineage are bound to this exact scene pair.'};
  }

  async runFuelContinuity(actor, input = {}) {
    assertCan(actor,'request:evidence');
    assertGlobalIncidentScope(actor);
    const coordinate=Array.isArray(input.coordinate)?input.coordinate.map(Number):[];
    if(coordinate.length!==2||!coordinate.every(Number.isFinite))throw new Error('invalid_coordinate');
    const startedAt=this.clock().toISOString();
    const result=await this.geospatialAnalysisService.screenChange({coordinate,radiusKm:Number(input.radiusKm??3),primaryId:input.primaryId??null,comparableId:input.comparableId??null});
    const fuel=(result.findings??[]).filter((item)=>item.kind==='fuel_continuity_change_candidate');
    const runId=`detector-run:${digest({coordinate,current:result.observations?.current?.id,comparison:result.observations?.comparison?.id,version:VERSION,startedAt}).slice(0,24)}`;
    const completedAt=this.clock().toISOString(),initialState=this.repository.snapshot();
    const created=[];
    for(const raw of fuel){
      const findingId=`fuel-continuity:${digest({geometry:raw.geometry,current:result.observations?.current?.id,comparison:result.observations?.comparison?.id,version:VERSION}).slice(0,28)}`;
      const priorFinding=(initialState.preventionFindings??[]).find((item)=>item.findingId===findingId),needId=priorFinding?.evidenceNeedId??`evidence-need:${findingId}:review`,priorActiveRequest=(initialState.evidenceRequests??[]).find((item)=>item.targetType==='prevention_finding'&&item.targetId===findingId&&['requested','acknowledged','in_progress','submitted'].includes(item.state)),requestId=priorActiveRequest?.id??priorFinding?.evidenceRequestId??`evidence-request:${digest({findingId,owner:actor.id}).slice(0,24)}`;
      const candidate={
        findingId,place:String(input.territoryLabel??'Algarve interior fuel corridor'),geometry:raw.geometry,coordinate,currentObservationId:result.observations.current.id,comparisonObservationId:result.observations.comparison.id,
        firstObservableInterval:{start:result.observations.comparison.acquiredAt,end:result.observations.current.acquiredAt},affectedAreaHa:Number(raw.areaM2)/10_000,corridorLengthM:raw.corridorLengthM,
        nearestStructureM:raw.nearestStructureM,structuresWithinPolicyRadius:raw.structuresWithin150m,newFuelFraction:raw.newFuelFraction??null,medianNdmi:raw.medianNdmi??null,roadCrossings:null,criticalAssetProximityM:null,terrainContext:{state:'UNMEASURED',reason:'No terrain model is bound to this detector run.'},landCoverContext:{state:'UNMEASURED',reason:'No authoritative land-cover label is bound to this candidate.'},infrastructureInteractions:interactions(result.exposure),
        sourceQuality:{state:'PIXEL_VERIFIED',validPixelFraction:result.validFraction??null,currentCloudCover:result.observations.current.cloudCover,comparisonCloudCover:result.observations.comparison.cloudCover,resolutionMeters:result.observations.current.resolutionMeters,exposureState:result.exposure?.state??'unavailable'},
        detectorVersion:VERSION,calibrationState:'SCREENING_CANDIDATE',provenance:{runId,current:result.observations.current,comparison:result.observations.comparison,integrity:result.integrity,algorithm:result.provenance,exposure:{provider:result.exposure?.provider??null,limitation:result.exposure?.limitation??'Mapped structure context unavailable.'}},
        rationale:{whatChanged:`${Math.round(Number(raw.newFuelFraction??0)*100)}% of this connected fuel-like component was not present in the comparable observation.`,where:String(input.territoryLabel??'Selected territory'),howLarge:{areaHa:Number(raw.areaM2)/10_000,corridorSpanM:raw.corridorLengthM},whenFirstAppeared:{after:result.observations.comparison.acquiredAt,by:result.observations.current.acquiredAt},whatItConnects:'A connected fuel-like component reaches the analysis boundary and mapped structure exposure within policy distance.',whatIsNearby:{nearestMappedStructureM:raw.nearestStructureM,structuresWithin150m:raw.structuresWithin150m,roads:'UNMEASURED',criticalAssets:'UNMEASURED'},whyItMatters:'Continuous fuel-like support near mapped structures can change the evidence required for prevention inspection.',uncertainty:['Screening detector is uncalibrated','Land cover is unmeasured','Terrain and road crossings are unmeasured','Human adjudication is required']},
        validation:{state:'UNMEASURED',precision:null,recall:null,reason:'Prospective expert adjudication has not been completed.'},evidenceNeedId:needId,evidenceRequestId:requestId,createdAt:completedAt
      };
      candidate.attentionPriority=computeFindingAttentionPriority(candidate,{now:new Date(completedAt)});
      created.push(createFuelContinuityFinding(candidate));
    }
    const noCandidateReason=result.reason??result.analyses?.fuelContinuity?.reason??'no_fuel_continuity_candidate';
    const runState=created.length?'screened':noCandidateReason==='no_fuel_continuity_candidate'?'screened_no_candidate':'abstained';
    const run={id:runId,detectorVersion:VERSION,state:runState,currentObservationId:result.observations?.current?.id??null,comparisonObservationId:result.observations?.comparison?.id??null,outputCount:created.length,abstentionReason:created.length||runState==='screened_no_candidate'?null:noCandidateReason,noCandidateReason:created.length?null:noCandidateReason,sourceQuality:{validPixelFraction:result.validFraction??null,integrity:result.integrity??null},negativeMining:result.negativeMining??null,screeningDiagnostics:result.screeningDiagnostics??null,campaign:input.campaign??null,provenance:{algorithm:result.provenance??null},startedAt,completedAt};
    await this.repository.mutate((state)=>{
      const findings=[...(state.preventionFindings??[])];
      const needs=[...(state.evidenceNeeds??[])],requests=[...(state.evidenceRequests??[])];
      for(const finding of created){
        const fi=findings.findIndex((item)=>item.findingId===finding.findingId); if(fi>=0)findings[fi]={...findings[fi],...finding,createdAt:findings[fi].createdAt};else findings.unshift(finding);
        if(!needs.some((item)=>item.id===finding.evidenceNeedId))needs.unshift(createEvidenceNeed({id:finding.evidenceNeedId,subjectType:'prevention_finding',subjectId:finding.findingId,missingQuantity:'human_review_of_fuel_continuity_change',reason:'Confirm whether the observed corridor is a meaningful fuel-path change rather than seasonal vegetation, agriculture, forestry activity or registration artifact.',candidateMethods:[evidenceMethod(actor)],ranking:{state:'UNMEASURED',basis:['native_pixel_review_available'],missingDimensions:['field_capacity','prospective_calibration']},state:EVIDENCE_NEED_STATES.REQUEST_ACTIVE,ownerId:actor.id,evidenceRequestId:finding.evidenceRequestId,selectedMethodId:'method:sentinel2-native-review',createdAt:completedAt}));
        if(!requests.some((item)=>item.id===finding.evidenceRequestId))requests.unshift({...createEvidenceRequest({id:finding.evidenceRequestId,targetType:'prevention_finding',targetId:finding.findingId,title:'Review fuel continuity screening candidate',coordinate,ownerId:actor.id,requestedBy:actor.id,priority:'high',dueAt:plusHours(completedAt,4),requirements:['Inspect native current and comparison scenes','Adjudicate seasonal/agricultural/forestry alternatives','Accept or reject with evidence note'],createdAt:completedAt}),evidenceNeedId:finding.evidenceNeedId,missingQuantity:'human_review_of_fuel_continuity_change',requestedMethodId:'method:sentinel2-native-review'});
      }
      return {...state,preventionFindings:findings.slice(0,250),detectorRuns:[run,...(state.detectorRuns??[]).filter((item)=>item.id!==run.id)].slice(0,250),evidenceNeeds:needs,evidenceRequests:requests};
    });
    await this.auditService.record({actor,type:'prevention.detector.completed',entityType:'detector_run',entityId:run.id,payload:{outputCount:created.length,currentObservationId:run.currentObservationId,comparisonObservationId:run.comparisonObservationId}});
    this.onChanged({type:'prevention.findings.changed',count:created.length});
    return {run,findings:created,analysis:{state:result.state,calibrationState:result.calibrationState,operational:false,confirmsHazard:false}};
  }
}
