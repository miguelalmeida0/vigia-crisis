import { createEvidenceGraph } from '../intelligence/index.mjs';
import { evaluateEvidenceContract } from '../intelligence/evaluation/evaluate-evidence-contract.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1 } from './operational-contract.mjs';
import { assessOperationalIncident } from './incident-assessment.mjs';
import { projectDecisionSuperiority } from './decision-superiority.mjs';
import { analyzeDecisionReadiness, dependencyImpacts } from './decision-analysis.mjs';
import { decisionWork } from './decision-work.mjs';
import { traceDependencies } from './dependency-graph.mjs';

export function operationalCounterfactual({twin,actor,incidentId=null,assumption}) {
  const base=projectDecisionSuperiority({twin,actor,incidentId}),target=base.graph.nodes.find(n=>n.id===assumption?.entityId);
  const types={SOURCE_FAILURE:'SOURCE',EVIDENCE_INVALIDATION:'OBSERVATION',FACILITY_UNAVAILABLE:'FACILITY',TASK_DELAY:'TASK'};
  if(!target||target.type!==types[assumption?.kind])throw Object.assign(new Error('counterfactual_target_unknown_or_out_of_scope'),{statusCode:400});
  const copy=structuredClone(twin);
  if(assumption.kind==='SOURCE_FAILURE'||assumption.kind==='EVIDENCE_INVALIDATION'){
    if(assumption.kind==='SOURCE_FAILURE')copy.sourceHealth.sources=copy.sourceHealth.sources.map(s=>s.sourceId===target.recordId?{...s,status:'UNAVAILABLE'}:s);
    for(const item of copy.incidents){
      const graph=item.evidenceGraph,removed=new Set(assumption.kind==='EVIDENCE_INVALIDATION'?[target.recordId,...graph.lineages.filter(l=>l.rootObservationIds.includes(target.recordId)).map(l=>l.observationId)]:[]);
      item.evidenceGraph=createEvidenceGraph({sourceFamilies:graph.sourceFamilies,sources:graph.sources.map(s=>assumption.kind==='SOURCE_FAILURE'&&s.id===target.recordId?{...s,status:'UNAVAILABLE'}:s),observations:graph.observations.filter(o=>!removed.has(o.id)),evidence:graph.evidence.filter(e=>!removed.has(e.observationId))});
      item.evaluation=evaluateEvidenceContract({claim:item.claim,contract:OPERATIONAL_WILDFIRE_CONTRACT_V1,evidenceGraph:item.evidenceGraph,evaluationTime:copy.asOf});
      item.assessment=assessOperationalIncident({incident:item.incident,evidenceGraph:item.evidenceGraph,evaluation:item.evaluation,asOf:copy.asOf});
    }
  }
  const simulated=projectDecisionSuperiority({twin:copy,actor,incidentId});
  const graph=structuredClone(simulated.graph),node=graph.nodes.find(n=>n.id===target.id);
  let crossedDeadlines=[];
  if(assumption.kind==='FACILITY_UNAVAILABLE')node.state='UNAVAILABLE';
  if(assumption.kind==='TASK_DELAY'){
    if(!Number.isInteger(assumption.minutes)||assumption.minutes<1||assumption.minutes>1440)throw Object.assign(new Error('counterfactual_delay_out_of_bounds'),{statusCode:400});
    const horizon=Date.parse(copy.asOf)+assumption.minutes*60000;
    crossedDeadlines=simulated.temporal.conditions.filter(c=>c.entityId===target.recordId&&c.condition==='TASK_DEADLINE'&&Date.parse(c.occursAt)<=horizon);
    if(crossedDeadlines.length)node.state='BLOCKED';
  }
  const readiness=analyzeDecisionReadiness(graph,decisionWork(copy,actor,incidentId)),changedReadiness=readiness.filter(r=>base.readiness.find(b=>b.id===r.id)?.state!==r.state);
  const paths=traceDependencies(base.graph,target.id,{downstream:true});
  const impacts=dependencyImpacts(graph).filter(i=>i.entityId===target.id);
  return {assumption,asOf:twin.asOf,simulation:true,productionMutated:false,affectedEntities:impacts.length?impacts:[{entityId:target.id,directImpact:paths.filter(p=>p.direct),indirectImpact:paths.filter(p=>!p.direct),reason:'Recorded pre-assumption dependency paths, including references to removed evidence.'}],changedReadiness,
    changedAssessments:simulated.assessments.filter(a=>base.assessments.find(b=>b.incidentId===a.incidentId)?.assessment?.corroborationState!==a.assessment?.corroborationState).map(a=>({incidentId:a.incidentId,state:a.assessment.corroborationState})),
    newBlockers:changedReadiness.flatMap(r=>r.blockers),newContention:[],crossedDeadlines,
    limitations:['Dependency simulation only, not a physical forecast.','Unknown dependencies and unrecorded alternatives remain unknown.','A delay horizon is a supplied assumption, not a completion estimate.']};
}
