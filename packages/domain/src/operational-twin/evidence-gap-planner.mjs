import { can, incidentInScope } from '../authorization.mjs';
import { projectValueOfInformation } from '../crisis-autopilot/value-of-information.mjs';
import { rankCandidateAcquisitions } from '../decision-foundry/index.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1 } from './operational-contract.mjs';
import { rows, unique } from './decision-work.mjs';

export function assessmentTransitionConditions(item) {
  return {currentState:item.assessment?.corroborationState??'UNKNOWN',
    strengtheningConditions:[{target:'MULTI_SOURCE',condition:'Two current qualifying physical source families with independent causal roots support the same incident.'},{target:'OFFICIAL_CONFIRMED',condition:'Current attributable official evidence passes the existing contract; dispatch authority remains separate.'}],
    weakeningConditions:['Qualifying observations exceed their freshness window.','An upstream observation is retracted or its source becomes excluded.'],
    conflictConditions:['A fresh, attributable, material physical or official contradiction qualifies under the contract.'],
    resolvingConditions:['A later admitted update explicitly resolves or supersedes each blocking contradiction. Human review remains required for consequential action.'],
    evidenceIds:rows(item.assessment?.evidenceIds),ruleIds:['OP-ASSESSMENT-1',OPERATIONAL_WILDFIRE_CONTRACT_V1.id],asOf:item.assessment?.generatedAt};
}

export function planEvidenceGaps(item,sources,actor,decisions=[],asOf) {
  const a=item.assessment, support=rows(item.evidenceGraph?.evidence).map(e=>e.id),definitions=[];
  if(!a)return {gaps:[],collectionRecommendations:[],valueOfInformation:null};
  if(a.officialState!=='QUALIFYING_OFFICIAL_EVIDENCE')definitions.push(['OFFICIAL','Current qualifying official incident observation',['OFFICIAL'],'Official evidence qualifies under the existing evidence contract.']);
  if(a.sourceCoverage.independentPhysicalFamilies<2)definitions.push(['PHYSICAL','Independent current physical corroboration',['PHYSICAL'],'Two qualifying physical families with independent causal roots; duplicate feeds do not count.']);
  if(a.conflictState==='UNRESOLVED')definitions.push(['CONFLICT','Attributable contradiction resolution',['OFFICIAL','PHYSICAL'],'Each blocking contradiction is explicitly resolved or superseded by admissible evidence.']);
  const gaps=definitions.map(([kind,missingEvidenceType,acceptableSourceFamilies,resolution])=>({
    questionId:`assessment-gap:${item.incident.id}:${kind}`,incidentId:item.incident.id,missingEvidenceType,acceptableSourceFamilies,
    freshnessRequirement:{maxAgeMs:OPERATIONAL_WILDFIRE_CONTRACT_V1.freshness.maxAgeMs,basis:'Existing wildfire evidence contract'},blockingAssessment:a.corroborationState,
    availableCollectionOptions:sources.filter(s=>acceptableSourceFamilies.includes(s.familyClass)).map(s=>({sourceId:s.sourceId,label:s.label??s.sourceId,familyId:s.familyId,familyClass:s.familyClass,
      availability:s.status,coverage:s.coverage??null,rights:s.rights??'UNKNOWN',expectedLatencyMs:s.expectedLatencyMs??null,effortClass:s.effortClass??'UNKNOWN',
      condition:'Provider availability is not incident coverage. Returned evidence must pass attribution, freshness, scope and independence checks.'})),
    resolutionCriteria:[resolution],evidenceIds:unique([...support,...rows(a.conflictingEvidenceIds)]),ruleId:`EVIDENCE-GAP-${kind}-1`
  }));
  const options=[];
  for(const gap of gaps)for(const option of gap.availableCollectionOptions){
    const blocked=decisions.filter(d=>rows(d.requiredQuestionIds).includes(gap.questionId));
    options.push({id:`collect:${gap.questionId}:${option.sourceId}`,incidentId:item.incident.id,provider:option.sourceId,sourceFamily:option.familyId,requirement:gap.missingEvidenceType,
      gapId:gap.questionId,consequenceClass:'OPERATIONAL',requirementsClosed:[gap.questionId],decisionsAffected:blocked.map(d=>d.decisionId??d.attentionId??d.id),criticalDecisionsPotentiallyUnblocked:0,
      contractsPotentiallySatisfied:[gap.ruleId],independentFamilyGained:option.familyClass==='PHYSICAL'&&!rows(item.evaluation?.independentFamilies).some(f=>f.sourceFamilyId===option.familyId),
      sourceAvailability:option.availability==='ACTIVE'?'AVAILABLE':'UNAVAILABLE',sourceHealth:option.availability==='ACTIVE'?'HEALTHY':option.availability,
      coverage:option.coverage===true,rights:option.rights,expectedLatencyMs:option.expectedLatencyMs??Number.MAX_SAFE_INTEGER,estimatedCostUnits:Number.MAX_SAFE_INTEGER,
      blockingConditions:[...(option.availability!=='ACTIVE'?['SOURCE_NOT_CURRENTLY_AVAILABLE']:[]),...(option.coverage!==true?['INCIDENT_COVERAGE_NOT_PROVEN']:[]),...(option.rights!=='READY'?['COLLECTION_RIGHTS_NOT_PROVEN']:[])],
      evidenceIds:gap.evidenceIds,effortClass:option.effortClass,knownLatencyMs:option.expectedLatencyMs});
  }
  const grouped=new Map();
  for(const option of options){const prior=grouped.get(option.provider);grouped.set(option.provider,prior?{...prior,requirement:`${prior.requirement}; ${option.requirement}`,requirementsClosed:unique([...prior.requirementsClosed,...option.requirementsClosed]),decisionsAffected:unique([...prior.decisionsAffected,...option.decisionsAffected]),contractsPotentiallySatisfied:unique([...prior.contractsPotentiallySatisfied,...option.contractsPotentiallySatisfied]),evidenceIds:unique([...prior.evidenceIds,...option.evidenceIds]),independentFamilyGained:prior.independentFamilyGained||option.independentFamilyGained}:{...option,id:`collect:${item.incident.id}:${option.provider}`});}
  const candidates=[...grouped.values()];
  const ranked=rankCandidateAcquisitions(candidates,{knowledgeTime:asOf});
  const voi=projectValueOfInformation({candidateAcquisitions:candidates,rankedCandidates:ranked,asOf});
  // The shared doctrine ranks structurally. Unknown cost/latency sentinels are
  // internal sort bounds, never presented as measurements or completion times.
  const sanitize = action => action?{...action,why:'Existing lexicographic decision-value doctrine: explicit blockers, evidence questions, independence and source eligibility.',
    expectedWait:candidates.find(c=>c.id===action.candidateId)?.knownLatencyMs==null?{state:'UNKNOWN',expectedMs:null,nextCheckAt:null}:action.expectedWait}:null;
  const valueOfInformation={...voi,bestNextCollectionAction:sanitize(voi.bestNextCollectionAction),highestValueBlockedCandidate:sanitize(voi.highestValueBlockedCandidate),alternatives:voi.alternatives.map(sanitize)};
  const collectionRecommendations=candidates.filter(c=>c.evidenceIds.length).map(c=>({actionId:c.id,action:`Request ${c.requirement.toLowerCase()} from ${sources.find(s=>s.sourceId===c.provider)?.label??c.provider}`,
    resolves:c.requirementsClosed,blockersRemoved:c.decisionsAffected,sourceFamily:c.sourceFamily,expectedOperationalValue:'STRUCTURAL_POTENTIAL_NOT_PROBABILITY',
    reasons:[`Could answer ${c.requirement}.`,...c.blockingConditions.map(b=>b.replaceAll('_',' ').toLowerCase())],evidenceIds:c.evidenceIds,
    allowed:can(actor,'command:incident')&&incidentInScope(actor,item.incident.id),requiresHumanApproval:true,executable:c.blockingConditions.length===0,
    expectedLatencyMs:c.knownLatencyMs,effortClass:c.effortClass,ruleIds:[valueOfInformation.rankingDoctrine.id]}));
  const rank=new Map(ranked.map((r,index)=>[r.candidateId,index+1]));
  collectionRecommendations.sort((a,b)=>(rank.get(a.actionId)??Infinity)-(rank.get(b.actionId)??Infinity)||a.actionId.localeCompare(b.actionId));
  return {gaps,collectionRecommendations,valueOfInformation};
}
