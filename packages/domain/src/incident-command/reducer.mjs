import { transitionEvacuation,transitionMayday,transitionOrder,transitionPerson,transitionResource } from './transitions.mjs';

export function emptyIncidentState(incidentId){return{schemaVersion:'vigia.incident-command-state.v1',incidentId,version:0,incident:null,operatingState:'NORMAL',organization:null,commandIntent:null,commandIntents:{},operationalPeriods:{},objectives:{},planningApplications:{},planningArtifacts:{},assignments:{},areas:{},persons:{},crews:{},resources:{},resourceRequests:{},accountability:{},entryCheckpoints:{},locations:{},hazards:{},observations:{},criticalChanges:{},orders:{},parRequests:{},evacuations:{},maydays:{},rescueOrganizations:{},waterSources:{},waterStates:{},searchSectors:{},evacuationZones:{},welfareEvents:{},commandTransfers:{},decisions:{},corrections:[],lastEventId:null,lastUpdatedAt:null};}
const reservedIdentifiers=new Set(['__proto__','prototype','constructor']);
const MAX_IDENTIFIER_LENGTH=160,MAX_PROJECTED_ENTITIES=5_000,MAX_ENTITY_TAIL=200,MAX_CORRECTIONS=500;
const safeIdentifier=(id)=>{if(typeof id!=='string')throw new Error('incident_command_identifier_invalid');const value=id.trim();if(!value||value!==id||value.length>MAX_IDENTIFIER_LENGTH||!(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u).test(value)||reservedIdentifiers.has(value.toLowerCase()))throw new Error('incident_command_identifier_invalid');return value;};
const boundedIdentifiers=(values,code)=>{if(!Array.isArray(values)||values.length>MAX_PROJECTED_ENTITIES)throw new Error(code);return[...new Set(values.map(safeIdentifier))];};
const appendTail=(values,item,limit=MAX_ENTITY_TAIL)=>[...(values??[]),item].slice(-limit);
const put=(state,key,id,value)=>{const safe=safeIdentifier(id);if(!Object.hasOwn(state[key],safe)&&Object.keys(state[key]).length>=MAX_PROJECTED_ENTITIES)throw Object.assign(new Error('incident_command_projection_collection_capacity_reached'),{statusCode:507,details:{collection:key,max:MAX_PROJECTED_ENTITIES}});state[key][safe]=value;};
const update=(state,key,id,patch)=>{const safe=safeIdentifier(id);if(!Object.hasOwn(state[key],safe))throw new Error(`${key.slice(0,-1)}_not_found`);state[key][safe]={...state[key][safe],...patch};};
const eventMeta=(event)=>({source:event.source,author:event.author,observedAt:event.observedAt,receivedAt:event.receivedAt,lastUpdatedAt:event.lastUpdatedAt,verificationState:event.verificationState,confidence:event.confidence,uncertainty:event.uncertainty,responsibleOwner:event.responsibleOwner,scope:event.scope,reviewAt:event.reviewAt,expiresAt:event.expiresAt,releaseId:event.releaseId,auditReference:event.auditReference});

export function applyIncidentCommandEvent(prior,event){
  const state=structuredClone(prior??emptyIncidentState(event.incidentId));if(state.incidentId!==event.incidentId)throw new Error('incident_event_identity_mismatch');for(const key of ['commandIntents','operationalPeriods','objectives','planningApplications','planningArtifacts','assignments','areas','persons','crews','resources','resourceRequests','accountability','entryCheckpoints','locations','hazards','observations','criticalChanges','orders','parRequests','evacuations','maydays','rescueOrganizations','waterSources','waterStates','searchSectors','evacuationZones','welfareEvents','commandTransfers','decisions'])state[key]??={};const p=event.payload??{},meta=eventMeta(event);for(const[key,value]of Object.entries(p)){if(/Id$/.test(key)&&value!=null)safeIdentifier(value);if(/Ids$/.test(key)&&value!=null)boundedIdentifiers(value,'incident_command_identifier_collection_invalid');}
  switch(event.type){
    case'INCIDENT_IMPORTED':if(state.incident&&state.incident.importHash!==p.importHash)throw new Error('duplicate_incident_identity_conflict');state.incident={...p,...meta};break;
    case'OPERATIONAL_PERIOD_UPSERTED':put(state,'operationalPeriods',p.operationalPeriodId,{...p,...meta});break;
    case'COMMAND_ORGANIZATION_SET':state.organization={...p,...meta};break;
    case'COMMAND_INTENT_PROPOSED':put(state,'commandIntents',p.intentId,{...p,state:'CONFIRMED_FOR_COMPILATION',mutationsApplied:false,...meta});state.commandIntent={...p,state:'CONFIRMED_FOR_COMPILATION',mutationsApplied:false,...meta};break;
    case'OBJECTIVE_UPSERTED':put(state,'objectives',p.objectiveId,{...p,...meta});break;
    case'OPERATIONAL_AREA_UPSERTED':put(state,'areas',p.operationalAreaId,{...p,...meta});break;
    case'PERSON_UPSERTED':put(state,'persons',p.personId,{...state.persons[p.personId],...p,...meta});break;
    case'CREW_UPSERTED':put(state,'crews',p.crewId,{...state.crews[p.crewId],...p,...meta});break;
    case'ASSIGNMENT_ISSUED':put(state,'assignments',p.assignmentId,{...p,state:p.state??'ISSUED',...meta});break;
    case'ACCOUNTABILITY_RECORDED':put(state,'accountability',p.personId,{...state.accountability[p.personId],...p,...meta});break;
    case'LOCATION_REPORTED':{const claimedVerificationState=p.verificationState,effectiveVerificationState=claimedVerificationState==='CONFIRMED'&&event.verificationState!=='VERIFIED'?'REPORTED':claimedVerificationState;put(state,'locations',p.personId,{...meta,...p,claimedVerificationState,verificationState:effectiveVerificationState,eventVerificationState:event.verificationState});break;}
    case'EXIT_CHECKPOINT_CONFIRMED':{const person=state.persons[p.personId];if(!person)throw new Error('person_not_found');transitionPerson(person.operationalState,'OUT',{exitCheckpointEvidence:p.checkpointEvidence});update(state,'persons',p.personId,{operationalState:'OUT',lastExitCheckpointId:p.checkpointId,lastUpdatedAt:event.receivedAt});put(state,'entryCheckpoints',p.checkpointId,{...p,...meta});break;}
    case'PERSON_STATE_TRANSITIONED':{const person=state.persons[p.personId];if(!person)throw new Error('person_not_found');transitionPerson(person.operationalState,p.state,{exitCheckpointEvidence:p.exitCheckpointEvidence});update(state,'persons',p.personId,{operationalState:p.state,lastUpdatedAt:event.receivedAt});break;}
    case'RESOURCE_UPSERTED':put(state,'resources',p.resourceId,{...state.resources[p.resourceId],...p,...meta});break;
    case'RESOURCE_TRANSITIONED':{const current=state.resources[p.resourceId];if(!current)throw new Error('resource_not_found');transitionResource(current.state,p.state);update(state,'resources',p.resourceId,{state:p.state,transitionEvidence:p.evidence??null,lastUpdatedAt:event.receivedAt});break;}
    case'RESOURCE_REQUESTED':put(state,'resourceRequests',p.resourceRequestId,{...p,...meta});break;
    case'ORDER_CREATED':put(state,'orders',p.orderId,{...p,intendedRecipients:boundedIdentifiers(p.intendedRecipients??[],'order_recipient_capacity_exceeded'),state:'CREATED',deliveries:[],acknowledgements:[],progress:[],unresolvedRecipients:boundedIdentifiers(p.intendedRecipients??[],'order_recipient_capacity_exceeded'),...meta});break;
    case'ORDER_TRANSITIONED':{const current=state.orders[p.orderId];if(!current)throw new Error('order_not_found');transitionOrder(current.state,p.state,{completionEvidence:p.completionEvidence});const deliveries=p.delivery?appendTail(current.deliveries,p.delivery):current.deliveries,acks=p.acknowledgement?appendTail(current.acknowledgements,p.acknowledgement):current.acknowledgements,progress=p.progress?appendTail(current.progress,p.progress):current.progress,recipientId=p.recipientId?safeIdentifier(p.recipientId):null,unresolved=recipientId?(current.unresolvedRecipients??[]).filter((id)=>id!==recipientId):current.unresolvedRecipients;update(state,'orders',p.orderId,{state:p.state,deliveries,acknowledgements:acks,progress,unresolvedRecipients:unresolved,exceptions:Array.isArray(p.exceptions)?p.exceptions.slice(-MAX_ENTITY_TAIL):current.exceptions,lastUpdatedAt:event.receivedAt});break;}
    case'PAR_REQUESTED':put(state,'parRequests',p.parRequestId,{...p,subjectIds:boundedIdentifiers(p.subjectIds??[],'par_subject_capacity_exceeded'),responses:{},state:'OPEN',...meta});break;
    case'PAR_RESPONDED':{const request=state.parRequests[safeIdentifier(p.parRequestId)];if(!request)throw new Error('par_request_not_found');const subjectId=safeIdentifier(p.subjectId);if(!request.subjectIds.includes(subjectId))throw new Error('par_subject_not_requested');request.responses[subjectId]={...p,subjectId,...meta};const subjects=request.subjectIds??[];request.state=subjects.length>0&&subjects.every((id)=>request.responses[id]?.accounted===true)?'COMPLETE':'OPEN';break;}
    case'EVACUATION_CREATED':put(state,'evacuations',p.evacuationId,{...p,state:'ORDER_AUTHORIZED',memberExitConfirmations:{},...meta});break;
    case'EVACUATION_TRANSITIONED':{const current=state.evacuations[p.evacuationId];if(!current)throw new Error('evacuation_not_found');const expectedMemberIds=[...new Set((current.crewIds??[]).flatMap((crewId)=>state.crews[crewId]?.memberIds??[]))],reportedMemberIds=new Set(p.evidence?.memberIds??[]),confirmedMemberIds=expectedMemberIds.filter((personId)=>reportedMemberIds.has(personId)&&['OUT','REHABILITATION','DEMOBILIZED'].includes(state.persons[personId]?.operationalState)&&state.persons[personId]?.lastExitCheckpointId);const evidence={...p.evidence,allMembersExited:expectedMemberIds.length>0&&confirmedMemberIds.length===expectedMemberIds.length};transitionEvacuation(current.state,p.state,evidence);const confirmations={...(current.memberExitConfirmations??{}),...Object.fromEntries(confirmedMemberIds.map((personId)=>[personId,{checkpointId:state.persons[personId].lastExitCheckpointId,confirmedAt:event.observedAt,confirmedBy:p.evidence?.confirmedBy??event.author}]))};update(state,'evacuations',p.evacuationId,{state:p.state,memberExitConfirmations:confirmations,evidence,lastUpdatedAt:event.receivedAt});break;}
    case'MAYDAY_ACTIVATED':{put(state,'maydays',p.maydayId,{...p,state:'ACTIVE',activatedAt:event.observedAt,pinned:true,timers:p.timers??{},...meta});state.operatingState='MAYDAY';const person=state.persons[p.personId];if(person)update(state,'persons',p.personId,{operationalState:'MAYDAY',lastUpdatedAt:event.receivedAt});break;}
    case'MAYDAY_TRANSITIONED':{const current=state.maydays[p.maydayId];if(!current)throw new Error('mayday_not_found');transitionMayday(current.state,p.state,{physicalRecoveryEvidence:p.physicalRecoveryEvidence});update(state,'maydays',p.maydayId,{state:p.state,pinned:p.state!=='PHYSICALLY_RECOVERED',physicalRecoveryEvidence:p.physicalRecoveryEvidence??null,lastUpdatedAt:event.receivedAt});if(p.state==='PHYSICALLY_RECOVERED'){state.operatingState=Object.values(state.maydays).some((item)=>item.maydayId!==p.maydayId&&item.pinned)?'MAYDAY':'NORMAL';const person=state.persons[current.personId];if(person)update(state,'persons',current.personId,{operationalState:'OUT',lastExitCheckpointId:p.physicalRecoveryEvidence.checkpointId,lastUpdatedAt:event.receivedAt});}break;}
    case'RESCUE_ORGANIZATION_SET':put(state,'rescueOrganizations',p.rescueOrganizationId,{...p,...meta});break;
    case'CRITICAL_CHANGE_RECORDED':put(state,'criticalChanges',p.criticalChangeId,{...p,...meta});break;
    case'CRITICAL_CHANGE_DELIVERY_RECORDED':{const current=state.criticalChanges[p.criticalChangeId];if(!current)throw new Error('critical_change_not_found');const targeting=structuredClone(current.targeting??{recipients:[],deliveryState:{},exceptions:[]}),recipientId=p.recipientId?safeIdentifier(p.recipientId):null;if(recipientId)targeting.deliveryState[recipientId]=p.deliveryState??'DELIVERED';if(p.exception)targeting.exceptions=appendTail(targeting.exceptions,{...p.exception,recipientId:recipientId??safeIdentifier(p.exception.recipientId),recordedAt:event.observedAt,recordedBy:event.author});update(state,'criticalChanges',p.criticalChangeId,{targeting,lastUpdatedAt:event.receivedAt});break;}
    case'WATER_SOURCE_UPSERTED':put(state,'waterSources',p.waterSourceId,{...p,...meta});break;
    case'WATER_STATE_RECORDED':if(p.flowState==='FLOWING'&&!p.flowEvidence)throw new Error('water_flow_evidence_required');put(state,'waterStates',p.waterSupplyStateId,{...p,...meta});break;
    case'SEARCH_SECTOR_UPSERTED':put(state,'searchSectors',p.searchSectorId,{...p,...meta});break;
    case'EVACUATION_ZONE_UPSERTED':put(state,'evacuationZones',p.evacuationZoneId,{...p,...meta});break;
    case'WELFARE_EVENT_RECORDED':put(state,'welfareEvents',p.welfareEventId,{...p,...meta});break;
    case'HAZARD_RECORDED':put(state,'hazards',p.hazardId,{...p,...meta});break;
    case'OBSERVATION_RECORDED':put(state,'observations',p.observationId,{...p,...meta});break;
    case'DECISION_RECORDED':put(state,'decisions',p.decisionId,{...p,...meta});break;
    case'PLANNING_PROPOSAL_APPLIED':{
      const decision=state.decisions[safeIdentifier(p.decisionId)],supported=['OPERATIONAL_PERIOD','RESOURCE_RECOMMENDATION','AUTONOMOUS_REPLAN','EVACUATION_CORRIDOR','PROTECTION_TIMELINE'];
      if(!decision)throw new Error('planning_decision_not_found');
      if(decision.decision!=='APPROVE_FOR_PLANNING'||decision.state!=='APPROVED_FOR_PLANNING_ONLY'||decision.mutationsApplied===true)throw new Error('planning_decision_not_applicable');
      if(!supported.includes(p.proposalType)||p.proposalType!==decision.proposalType||p.proposalHash!==decision.proposalHash||p.proposalVersion!==decision.proposalVersion)throw new Error('planning_proposal_binding_mismatch');
      put(state,'planningApplications',p.applicationId,{...p,operationalPeriod:undefined,objectives:undefined,resourceRequests:undefined,appliedArtifact:undefined,state:'APPLIED',...meta});
      if(p.proposalType==='OPERATIONAL_PERIOD'){
        if(!p.operationalPeriod?.operationalPeriodId)throw new Error('planning_operational_period_required');
        if(!Array.isArray(p.objectives)||p.objectives.length>MAX_PROJECTED_ENTITIES)throw new Error('planning_objective_collection_invalid');
        put(state,'operationalPeriods',p.operationalPeriod.operationalPeriodId,{...p.operationalPeriod,applicationId:p.applicationId,...meta});
        for(const objective of p.objectives){if(!objective?.objectiveId)throw new Error('planning_objective_id_required');put(state,'objectives',objective.objectiveId,{...objective,applicationId:p.applicationId,...meta});}
      }else{
        if(!p.appliedArtifact?.artifactId)throw new Error('planning_applied_artifact_required');
        put(state,'planningArtifacts',p.appliedArtifact.artifactId,{...p.appliedArtifact,applicationId:p.applicationId,...meta});
        if(p.proposalType==='RESOURCE_RECOMMENDATION'){
          if(!Array.isArray(p.resourceRequests)||!p.resourceRequests.length||p.resourceRequests.length>MAX_PROJECTED_ENTITIES)throw new Error('planning_resource_request_collection_invalid');
          for(const request of p.resourceRequests){if(!request?.resourceRequestId)throw new Error('planning_resource_request_id_required');put(state,'resourceRequests',request.resourceRequestId,{...request,applicationId:p.applicationId,...meta});}
        }
      }
      update(state,'decisions',p.decisionId,{state:'APPLIED_TO_CANONICAL_PLAN',mutationsApplied:true,applicationId:p.applicationId,applicationReceipt:p.receipt,lastUpdatedAt:event.receivedAt});break;
    }
    case'COMMAND_TRANSFERRED':put(state,'commandTransfers',p.commandTransferId,{...p,...meta});break;
    case'CORRECTION_RECORDED':state.corrections=appendTail(state.corrections,{...p,...meta},MAX_CORRECTIONS);break;
    default:throw new Error(`unsupported_incident_command_event:${event.type}`);
  }
  state.version+=1;state.lastEventId=event.eventId;state.lastUpdatedAt=event.receivedAt;return state;
}

export function replayIncidentCommand(events=[]){return events.reduce((state,event)=>applyIncidentCommandEvent(state,event),events[0]?emptyIncidentState(events[0].incidentId):null);}
