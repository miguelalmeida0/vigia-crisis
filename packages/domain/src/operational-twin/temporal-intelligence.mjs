import { semanticHash } from '../intelligence/shared.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1 } from './operational-contract.mjs';
import { rows, activeWork, workId } from './decision-work.mjs';

export function temporalIntelligence({incidents,tasks,sources,asOf,warningWindowMs=15*60_000}) {
  const now=Date.parse(asOf),conditions=[];
  const add=(entityId,condition,occursAt,operationalImpact,evidenceIds=[],incidentId=null)=>{
    const epoch=Date.parse(occursAt);if(!Number.isFinite(epoch))return;
    conditions.push({id:semanticHash('temporal-condition',{entityId,condition,occursAt}),entityId,incidentId,condition,occursAt:new Date(epoch).toISOString(),
      operationalImpact,recommendedBefore:new Date(epoch).toISOString(),remainingMs:epoch-now,state:epoch<=now?'DUE':epoch-now<=warningWindowMs?'SOON':'SCHEDULED',evidenceIds});
  };
  for(const item of incidents){
    const eligible=new Set([...rows(item.evaluation?.qualifyingEvidence),...rows(item.evaluation?.excludedEvidence).filter(e=>e.classification==='STALE')].map(e=>e.observationId));
    for(const obs of rows(item.evidenceGraph?.observations))if(eligible.has(obs.id))add(obs.id,'EVIDENCE_EXPIRES',new Date(Date.parse(obs.observedAt)+OPERATIONAL_WILDFIRE_CONTRACT_V1.freshness.maxAgeMs+1).toISOString(),'Reevaluate freshness; this is not a prediction of fire behavior.',rows(item.evidenceGraph.evidence).filter(e=>e.observationId===obs.id).map(e=>e.id),item.incident.id);
  }
  for(const task of tasks.filter(activeWork)){add(workId(task),'TASK_DEADLINE',task.deadline??task.deadlineAt,'Escalation review is due, not automatic dispatch.',rows(task.evidenceIds),task.incidentId);add(workId(task),'SOURCE_RECHECK',task.nextCheckAt??task.nextAttempt,'Check the governed collector result; a check does not imply success.',rows(task.evidenceIds),task.incidentId);}
  const elapsed=incidents.map(item=>({incidentId:item.incident.id,unresolvedSince:item.assessment?.corroborationState==='OFFICIAL_CONFIRMED'?null:item.incident.openedAt,
    unresolvedDurationMs:item.assessment?.corroborationState==='OFFICIAL_CONFIRMED'||!Number.isFinite(Date.parse(item.incident.openedAt))?null:Math.max(0,now-Date.parse(item.incident.openedAt)),
    latestOfficialAt:rows(item.evaluation?.qualifyingEvidence).filter(e=>e.familyClass==='OFFICIAL').map(e=>e.observedAt).sort().at(-1)??null,
    latestIndependentAt:item.assessment?.sourceCoverage?.independentPhysicalFamilies>=2?(rows(item.evaluation?.qualifyingEvidence).filter(e=>e.familyClass==='PHYSICAL').map(e=>e.observedAt).sort().at(-1)??null):null,
    boundary:'Elapsed time since retained incident opening, not a measured duration of physical fire.'}));
  return {asOf,warningWindowMs,conditions:conditions.sort((a,b)=>a.occursAt.localeCompare(b.occursAt)||a.id.localeCompare(b.id)),elapsed,
    sourceDurations:sources.filter(s=>s.status!=='ACTIVE').map(s=>({sourceId:s.sourceId,since:s.degradedSince??s.lastFailureAt??null,elapsedMs:(s.degradedSince??s.lastFailureAt)?Math.max(0,now-Date.parse(s.degradedSince??s.lastFailureAt)):null}))};
}
