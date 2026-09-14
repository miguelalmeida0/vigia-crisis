const STATES=Object.freeze(['PROPOSED','EXPERT_ACCEPTED','FIELD_REVIEW_REQUIRED','ASSIGNED','OBSERVED','MITIGATION_REPORTED','POST_INTERVENTION_OBSERVATION_PENDING','VERIFIED_CHANGE','CLOSED']);
const TRANSITIONS=Object.freeze({PROPOSED:new Set(['EXPERT_ACCEPTED','CLOSED']),EXPERT_ACCEPTED:new Set(['FIELD_REVIEW_REQUIRED','CLOSED']),FIELD_REVIEW_REQUIRED:new Set(['ASSIGNED','CLOSED']),ASSIGNED:new Set(['OBSERVED','CLOSED']),OBSERVED:new Set(['MITIGATION_REPORTED','CLOSED']),MITIGATION_REPORTED:new Set(['POST_INTERVENTION_OBSERVATION_PENDING','CLOSED']),POST_INTERVENTION_OBSERVATION_PENDING:new Set(['VERIFIED_CHANGE','CLOSED']),VERIFIED_CHANGE:new Set(['CLOSED']),CLOSED:new Set()});
const required=(value,code)=>{const text=String(value??'').trim();if(!text)throw new Error(code);return text;};

export function createPreventionMission({id,findingId,candidateVersion,graphVersion,place,coordinate,createdAt=new Date().toISOString(),actorId='system'}){
  const mission={id:required(id,'prevention_mission_id_required'),findingId:required(findingId,'prevention_mission_finding_required'),candidateVersion:required(candidateVersion,'prevention_mission_candidate_required'),graphVersion:required(graphVersion,'prevention_mission_graph_required'),place:String(place??'Selected territory'),coordinate:Array.isArray(coordinate)?coordinate.map(Number):null,state:'PROPOSED',assigneeId:null,createdAt,updatedAt:createdAt,verification:{state:'NOT_SCHEDULED',nextOpticalOpportunity:null,beforeGraphVersion:graphVersion,afterGraphVersion:null,observedVegetationChange:null,claimBoundary:'Post-intervention physical verification only; no fire-probability or efficacy claim.'},events:[]};
  mission.events.push({id:`${mission.id}:0`,type:'INTERVENTION_CANDIDATE_CREATED',from:null,to:'PROPOSED',at:createdAt,actorId,reason:'Graph-bound intervention candidate entered governed review.'});return mission;
}
function transitionPatch(mission,to,patch){
  if(to==='ASSIGNED')return{assigneeId:required(patch.assigneeId,'prevention_mission_assignee_required')};
  if(to==='OBSERVED')return patch.fieldObservationId?{fieldObservationId:required(patch.fieldObservationId,'prevention_mission_field_observation_required')}:{};
  if(to==='MITIGATION_REPORTED')return{mitigationEvidenceId:required(patch.mitigationEvidenceId,'mitigation_evidence_required')};
  if(to==='POST_INTERVENTION_OBSERVATION_PENDING')return{verification:{...mission.verification,state:'SCHEDULED',nextOpticalOpportunity:required(patch.verification?.nextOpticalOpportunity,'post_intervention_opportunity_required')}};
  if(to==='VERIFIED_CHANGE')return{verification:{...mission.verification,state:'VERIFIED_CHANGE',afterGraphVersion:required(patch.verification?.afterGraphVersion,'post_intervention_physical_evidence_required'),observedVegetationChange:required(patch.verification?.observedVegetationChange,'post_intervention_physical_evidence_required')}};
  return{};
}
export function transitionPreventionMission(mission,to,{actorId,reason,at=new Date().toISOString(),patch={}}={}){
  if(!STATES.includes(to))throw new Error('invalid_prevention_mission_state');
  if(!TRANSITIONS[mission.state]?.has(to))throw new Error(`invalid_prevention_mission_transition:${mission.state}->${to}`);
  if(to==='MITIGATION_REPORTED'&&!patch.mitigationEvidenceId)throw new Error('mitigation_evidence_required');
  if(to==='POST_INTERVENTION_OBSERVATION_PENDING'&&!patch.verification?.nextOpticalOpportunity)throw new Error('post_intervention_opportunity_required');
  if(to==='VERIFIED_CHANGE'&&(!patch.verification?.afterGraphVersion||!patch.verification?.observedVegetationChange))throw new Error('post_intervention_physical_evidence_required');
  const eventType=to==='EXPERT_ACCEPTED'?'INTERVENTION_REVIEW_ACCEPTED':to==='ASSIGNED'?'FIELD_REVIEW_ASSIGNED':to==='MITIGATION_REPORTED'?'MITIGATION_REPORTED':to==='VERIFIED_CHANGE'?'PHYSICAL_CHANGE_VERIFIED':`PREVENTION_MISSION_${to}`;
  return{...mission,...transitionPatch(mission,to,patch),state:to,updatedAt:at,events:[...(mission.events??[]),{id:`${mission.id}:${mission.events?.length??0}`,type:eventType,from:mission.state,to,at,actorId:required(actorId,'prevention_mission_actor_required'),reason:required(reason,'prevention_mission_reason_required')}]};
}

export const PREVENTION_MISSION_STATES=STATES;
