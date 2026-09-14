import { INTELLIGENCE_SCHEMA_VERSION, intelligenceBindings, hashValue, stableValue } from './contract.mjs';
import { RULE_SET_VERSION } from './rules.mjs';
import { deriveSituation } from './situation.mjs';
import { deriveUnknowns } from './unknowns.mjs';
import { deriveAttention } from './attention.mjs';
import { deriveNextBestEvidence } from './next-evidence.mjs';
import { deriveSourcePassports } from './source-passport.mjs';
import { deriveDecisionDelta } from './delta.mjs';
import { deriveTimeToDefensibleTruth } from './tdt.mjs';
import { explanationTrace } from './explanation.mjs';

const INPUT_DOCUMENT_VERSION='vigia.intelligence-input.v3';
const canonicalRows=(items=[])=>Object.freeze((Array.isArray(items)?items:[]).map(stableValue).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right))));
function clockBucket(value,mode,asOf){const exact=new Date(asOf??value).toISOString();if(String(mode).toUpperCase().includes('HISTORICAL')||String(mode).toUpperCase().includes('REHEARSAL'))return exact;return`${exact.slice(0,16)}:00.000Z`;}
export function intelligenceInputState(input={}){
  const generatedAt=input.generatedAt??input.asOf;if(!generatedAt)throw new Error('intelligence_generated_at_required');
  const mode=input.mode??'LIVE',incident=stableValue(input.incident??{}),evidenceNeeds=canonicalRows(input.evidenceNeeds),evidenceRequests=canonicalRows(input.evidenceRequests),opportunities=canonicalRows(input.opportunities),opportunityResults=canonicalRows(input.opportunityResults),operatorDecisions=canonicalRows(input.operatorDecisions),corrections=canonicalRows(input.corrections);
  const authoritativeInputGeneration=Math.max(0,Number(input.authoritativeInputGeneration??0));if(!Number.isSafeInteger(authoritativeInputGeneration))throw new Error('intelligence_input_generation_invalid');
  const document=stableValue({schemaVersion:INPUT_DOCUMENT_VERSION,ruleSetVersion:RULE_SET_VERSION,authoritativeInputGeneration,mode,clockBucket:clockBucket(generatedAt,mode,input.asOf),asOf:input.asOf??null,staleAfterMs:input.staleAfterMs??6*60*60*1000,incident,evidenceNeeds,evidenceRequests,opportunities,opportunityResults,sourceState:input.sourceState??{},operatorDecisions,fieldNetState:input.fieldNetState??null,corrections,futureEvidenceExcluded:input.futureEvidenceExcluded??[]});
  return Object.freeze({document,inputStateHash:hashValue(document),incident,evidenceNeeds,evidenceRequests,opportunities,opportunityResults,operatorDecisions,corrections,mode,generatedAt});
}

export function projectIncidentIntelligence(input={}){
  const normalized=intelligenceInputState(input),{incident,evidenceNeeds,evidenceRequests,opportunities,opportunityResults,operatorDecisions,corrections,mode,generatedAt,inputStateHash}=normalized;
  if(input.previousSnapshot?.inputStateHash===inputStateHash)return input.previousSnapshot;
  const evidenceGraph={observations:incident.observations??[],fusion:incident.evidenceFusion??null,association:incident.association??null,corrections},sourceState=stableValue(input.sourceState??{});
  const bindings=intelligenceBindings({incident,evidenceGraph,sourceState,ruleSetVersion:RULE_SET_VERSION,generatedAt});
  const situation=deriveSituation({incident,mode,asOf:input.asOf??generatedAt,staleAfterMs:input.staleAfterMs}),unknowns=deriveUnknowns({incident,situation,evidenceNeeds,evidenceRequests,asOf:input.asOf??generatedAt});
  const existingFamilies=situation.why?.independentPhysicalFamilies??[],nextBestEvidence=deriveNextBestEvidence({unknowns,opportunities,existingPhysicalFamilies:existingFamilies});
  const sourceContext=deriveSourcePassports({incident,opportunities,opportunityResults,sourceState,asOf:input.asOf??generatedAt});
  const attention=deriveAttention({incident,situation,unknowns,sourceContext,evidenceRequests,asOf:input.asOf??generatedAt});
  const decisionDelta=deriveDecisionDelta({previous:input.previousSnapshot,incident,situation,sourceStateHash:bindings.sourceStateVersion,evidenceNeeds,operatorDecisions,fieldNetState:input.fieldNetState,corrections,generatedAt});
  const timeToDefensibleTruth=deriveTimeToDefensibleTruth({incident,operatorDecisions,decisionDelta,generatedAt});
  const explanation=explanationTrace({situation,attention,unknowns,nextBestEvidence,ruleSetVersion:RULE_SET_VERSION,excludedEvidence:input.futureEvidenceExcluded});
  const projection=stableValue({schemaVersion:INTELLIGENCE_SCHEMA_VERSION,inputDocumentVersion:INPUT_DOCUMENT_VERSION,inputStateHash,authoritativeInputGeneration:Number(input.authoritativeInputGeneration??0),incidentId:String(incident.id),...bindings,mode,situation,attention,unknowns,nextBestEvidence,sourceContext,timeToDefensibleTruth,decisionDelta,explanationTrace:explanation,incidentAssociation:incident.association??null,inputEvidenceIds:(incident.observations??[]).map((item)=>String(item.id??item.observationId??'')).filter(Boolean).sort(),inputEvidenceNeeds:evidenceNeeds.map((item)=>({id:String(item.id),state:String(item.state??item.resolutionState??'UNKNOWN')})).sort((a,b)=>a.id.localeCompare(b.id)),inputEvidenceNeedIds:evidenceNeeds.map((item)=>String(item.id)).sort(),inputCorrectionIds:corrections.map((item)=>String(item.id)).sort(),fieldNetState:input.fieldNetState??null,futureEvidenceExcluded:input.futureEvidenceExcluded??[],intelligenceIsEvidence:false,automaticHumanDecision:false});
  const inputHash=hashValue({inputStateHash,previousSnapshotVersion:input.previousSnapshot?.snapshotVersion??null});
  return Object.freeze({...projection,inputHash,snapshotVersion:`intelligence:${inputHash.slice(7,39)}`,projectionHash:hashValue(projection)});
}
