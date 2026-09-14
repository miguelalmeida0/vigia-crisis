import { hashValue } from './contract.mjs';

export const OPERATOR_DECISION_TYPES=Object.freeze(['ASSESSMENT_ACKNOWLEDGED','EVIDENCE_REQUEST_APPROVED','INCIDENT_ASSOCIATION_CORRECTED','SOURCE_STATE_REVIEWED','HANDOFF_ACCEPTED','UNKNOWN_MARKED_UNOBTAINABLE','EVIDENCE_NEED_RESOLVED']);
const REASON_CODES=new Set(['EVIDENCE_REVIEWED','PROVENANCE_VERIFIED','INSUFFICIENT_EVIDENCE','EXTERNAL_CAPABILITY_UNAVAILABLE','CORRECTION_REQUIRED','HANDOFF_VERIFIED','OPERATOR_JUDGEMENT']);
const bounded=(value,max)=>String(value??'').trim().slice(0,max);

export function createOperatorDecision(input={},actor={},createdAt=new Date().toISOString()){
  if(!OPERATOR_DECISION_TYPES.includes(input.decisionType))throw Object.assign(new Error('invalid_intelligence_decision_type'),{statusCode:400});
  if(!REASON_CODES.has(input.reasonCode))throw Object.assign(new Error('invalid_intelligence_reason_code'),{statusCode:400});
  if(!input.incidentId||!input.snapshotVersion||!input.evidenceGraphVersion||!Number.isSafeInteger(Number(input.authoritativeInputGeneration))||Number(input.authoritativeInputGeneration)<0)throw Object.assign(new Error('intelligence_decision_binding_required'),{statusCode:400});
  if(!String(input.selectedOption??'').trim())throw Object.assign(new Error('intelligence_decision_option_required'),{statusCode:400});
  if(!actor.id||actor.authentication?.authenticated!==true)throw Object.assign(new Error('authentication_required'),{statusCode:401});
  const note=input.note===undefined||input.note===null?'':bounded(input.note,500);if(String(input.note??'').length>500)throw Object.assign(new Error('intelligence_decision_note_too_long'),{statusCode:413});
  const material={schemaVersion:'vigia.operator-intelligence-decision.v2',incidentId:bounded(input.incidentId,180),principalId:bounded(actor.id,180),agencyId:bounded(actor.agencyId??actor.organizationId??actor.id,180),capability:'review:incident',snapshotVersion:bounded(input.snapshotVersion,100),evidenceGraphVersion:bounded(input.evidenceGraphVersion,100),authoritativeInputGeneration:Number(input.authoritativeInputGeneration),decisionType:input.decisionType,selectedOption:bounded(input.selectedOption,120),reasonCode:input.reasonCode,note,createdAt:new Date(createdAt).toISOString()};
  return Object.freeze({...material,decisionId:`intelligence-decision:${hashValue(material).slice(7,39)}`,bindingHash:hashValue(material)});
}
