import { hashValue } from './contract.mjs';

const OPEN=new Set(['OPEN','ACKNOWLEDGED','IN_PROGRESS','REQUEST_ACTIVE','WAITING_FOR_SCHEDULED_OBSERVATION','WAITING_FOR_OBSERVATION','MANUAL_ESCALATION_REQUIRED','FIELD_CAPACITY_NOT_CONFIGURED','NO_AVAILABLE_OBSERVATION','FAILED']);
const CLASSES=new Set(['DECISION_BLOCKING','DECISION_MATERIAL','OPERATIONALLY_RELEVANT','CONTEXTUAL','UNPRIORITIZED']);
const text=(value)=>String(value??'').replaceAll('_',' ');

function classify(need,situation){
  const declared=String(need.decisionImpact??need.impactClass??'').toUpperCase();if(CLASSES.has(declared))return declared;
  if(need.blocksDecisionState===true||need.resolutionWouldChangeDecision===true||need.blockedClaim&&need.strongerClaim)return'DECISION_BLOCKING';
  if(String(need.missingQuantity??'').includes('contradiction'))return'DECISION_MATERIAL';
  if(situation.underlyingState==='SINGLE_FAMILY_PHYSICAL_SIGNAL'&&String(need.missingQuantity??'').match(/independent|corrobor/))return'DECISION_BLOCKING';
  if(need.ownerId||need.evidenceRequestId)return'OPERATIONALLY_RELEVANT';return'CONTEXTUAL';
}

export function deriveUnknowns({incident={},situation={},evidenceNeeds=[],evidenceRequests=[],asOf=new Date().toISOString()}={}){
  const requestsByNeed=new Map(evidenceRequests.map((item)=>[String(item.evidenceNeedId??''),item])),rows=[];
  for(const need of evidenceNeeds.filter((item)=>OPEN.has(String(item.state??item.resolutionState??item.status??'').toUpperCase()))){const request=requestsByNeed.get(String(need.id)),classification=classify(need,situation);rows.push({id:String(need.id),kind:'EVIDENCE_NEED',whatIsUnknown:text(need.missingQuantity??need.reason??'Required evidence'),affectsClaim:text(need.blockedClaim??incident.physicalOperationalState??situation.underlyingState),strongerClaimBlocked:text(need.strongerClaim??(classification==='DECISION_BLOCKING'?'A decision-state transition defined by rule UNK-001':null)),existingSupportingEvidence:need.supportingEvidenceIds??situation.supportingEvidenceIds??[],missingEvidence:[need.missingQuantity].filter(Boolean),currentAcquisitionWork:request?[{id:request.id,state:request.state,ownerId:request.ownerId??null,dueAt:request.dueAt??null}]:[],ageMs:Number.isFinite(Date.parse(need.createdAt??''))?Math.max(0,Date.parse(asOf)-Date.parse(need.createdAt)):null,owner:need.ownerId??request?.ownerId??null,escalationState:need.escalationState??request?.state??null,classification,reason:classification==='DECISION_BLOCKING'?'The governed rule set identifies a reachable stronger decision state if this evidence is resolved.':'The gap remains relevant but is not proven to block the current decision state.',ruleId:classification==='DECISION_BLOCKING'?'UNK-001':null});}
  if(situation.underlyingState==='SINGLE_FAMILY_PHYSICAL_SIGNAL'&&!rows.some((item)=>item.classification==='DECISION_BLOCKING'))rows.push({id:`unknown:${hashValue({incidentId:incident.id,kind:'independent-corroboration'}).slice(7,31)}`,kind:'RULE_DERIVED_UNKNOWN',whatIsUnknown:'Independent physical corroboration',affectsClaim:'SINGLE FAMILY PHYSICAL SIGNAL',strongerClaimBlocked:'MULTI FAMILY PHYSICAL SUPPORT',existingSupportingEvidence:situation.supportingEvidenceIds,missingEvidence:['INDEPENDENT_PHYSICAL_CORROBORATION'],currentAcquisitionWork:[],ageMs:null,owner:null,escalationState:'OPEN',classification:'DECISION_BLOCKING',reason:'Rule UNK-001 permits a stronger state only after a second governed independent source family.',ruleId:'UNK-001'});
  return Object.freeze(rows.sort((a,b)=>['DECISION_BLOCKING','DECISION_MATERIAL','OPERATIONALLY_RELEVANT','CONTEXTUAL','UNPRIORITIZED'].indexOf(a.classification)-['DECISION_BLOCKING','DECISION_MATERIAL','OPERATIONALLY_RELEVANT','CONTEXTUAL','UNPRIORITIZED'].indexOf(b.classification)||a.id.localeCompare(b.id)));
}
