import { semanticHash } from '../intelligence/shared.mjs';
import { rows, unique, activeWork, workId } from './decision-work.mjs';
import { dependencyNodeId, traceDependencies } from './dependency-graph.mjs';
import { assertionContradictions } from './assertion-contradictions.mjs';

const bad = new Set(['UNAVAILABLE','DEGRADED','QUARANTINED','COMPROMISED','BLOCKED','BLOCKED_AUTHORITY','BLOCKED_SOURCE_CONNECTOR','TERMINAL_UNAVAILABLE','REJECTED','CANCELLED','SUPERSEDED']);
const ready = new Set(['ACTIVE','READY','AVAILABLE','SATISFIED','COMPLETED','OFFICIAL_CONFIRMED','CORROBORATED','CURRENT_QUALIFYING_SUPPORT']);

export function analyzeDecisionReadiness(graph,work) {
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  return [...work.tasks.map(item=>({item,type:'TASK'})),...work.decisions.map(item=>({item,type:'DECISION'}))].map(({item,type})=>{
    const dependencies=traceDependencies(graph,dependencyNodeId(type,workId(item))).map(d=>({...d,node:nodes.get(d.entityId)}));
    const conflicting=dependencies.filter(d=>d.node?.state==='CONFLICTING'),stale=dependencies.filter(d=>d.node?.state==='STALE');
    const blocked=dependencies.filter(d=>bad.has(d.node?.state)),available=dependencies.filter(d=>ready.has(d.node?.state));
    const unknown=dependencies.filter(d=>!ready.has(d.node?.state)&&!bad.has(d.node?.state)&&!['STALE','CONFLICTING'].includes(d.node?.state));
    const state=conflicting.length?'CONFLICTING':stale.length?'STALE':blocked.length?(available.length?'PARTIALLY_READY':'BLOCKED'):unknown.length?(available.length?'PARTIALLY_READY':'BLOCKED'):dependencies.length?'READY':'BLOCKED';
    return {id:workId(item),incidentId:item.incidentId,title:item.title??item.question??item.nextAction??(type==='TASK'?'Collection task':'Decision review'),type,state,available:available.map(d=>d.entityId),blockers:[...blocked,...conflicting,...stale].map(d=>({entityId:d.entityId,label:d.node?.label??d.node?.recordId,state:d.node?.state,path:d.path})),
      unknown:unknown.map(d=>d.entityId),reasons:dependencies.length?[`${available.length} dependencies have a usable state; ${blocked.length} blocked, ${stale.length} stale, ${conflicting.length} conflicting and ${unknown.length} unknown.`]:['DEPENDENCY UNKNOWN: no attributable readiness requirements are recorded.'],
      evidenceIds:unique(dependencies.flatMap(d=>d.evidenceIds)),ruleIds:['DECISION-INFORMATION-READINESS-1'],boundary:'Information readiness only; never an authorization, allocation or life-safety decision.'};
  });
}

export function dependencyImpacts(graph) {
  return graph.nodes.filter(n=>bad.has(n.state)||['STALE','CONFLICTING'].includes(n.state)).map(node=>{
    const impacted=traceDependencies(graph,node.id,{downstream:true}),lookup=new Map(graph.nodes.map(n=>[n.id,n]));
    return {entityId:node.id,label:node.label??node.recordId,state:node.state,directImpact:impacted.filter(i=>i.direct),indirectImpact:impacted.filter(i=>!i.direct),
      decisionImpact:impacted.filter(i=>lookup.get(i.entityId)?.type==='DECISION'),
      incidentIds:unique(impacted.map(i=>lookup.get(i.entityId)?.incidentId)),
      reason:'Every impact is reachable through the recorded dependency edges; alternatives and final admission still require evaluation.'};
  }).filter(i=>i.directImpact.length);
}

export function sharedDependencies(graph,work) {
  const lookup=new Map(graph.nodes.map(n=>[n.id,n]));
  const shared=graph.nodes.filter(n=>['SOURCE','PROVIDER','RESOURCE','FACILITY','ROUTE','AUTHORITY'].includes(n.type)).map(node=>{
    const dependents=traceDependencies(graph,node.id,{downstream:true}),incidents=unique(dependents.map(d=>lookup.get(d.entityId)?.incidentId));
    return {dependencyId:node.id,type:node.type,label:node.label??node.recordId,incidentIds:incidents,dependentIds:dependents.map(d=>d.entityId),paths:dependents,state:node.state??'UNKNOWN'};
  }).filter(row=>row.incidentIds.length>1);
  const contention=shared.filter(row=>row.type==='RESOURCE').map(row=>{
    const tasks=work.tasks.filter(t=>activeWork(t)&&row.dependentIds.includes(dependencyNodeId('TASK',workId(t))));
    return {resourceId:row.dependencyId,competingRequirements:tasks.map(workId),deadlines:tasks.map(t=>({taskId:workId(t),deadline:t.deadline??null})),
      priorities:tasks.map(t=>({taskId:workId(t),priority:t.priority??null})),constraints:['Shared requirement is recorded. Available capacity and time overlap must be checked before claiming over-allocation.'],
      state:'POTENTIAL_CONTENTION',operatorDecisionRequired:true,alternatives:[],automaticAllocation:false};
  }).filter(row=>row.competingRequirements.length>1);
  return {shared,contention};
}

export function incidentContradictions(item) {
  const observations=rows(item.evidenceGraph?.observations),evidence=rows(item.evidenceGraph?.evidence),sources=rows(item.evidenceGraph?.sources);
  const supporters=rows(item.evaluation?.qualifyingEvidence);
  return [...assertionContradictions(item,item.assessment?.generatedAt),...rows(item.evaluation?.contradictions).filter(c=>c.blocking).map(c=>{
    const negative=observations.find(o=>o.id===c.observationId),positive=supporters[0],pos=observations.find(o=>o.id===positive?.observationId);
    return {id:semanticHash('contradiction',{incidentId:item.incident.id,evidenceId:c.evidenceId}),subject:item.claim?.id??item.incident.id,
      assertionA:pos?{state:pos.state,value:pos.value,observationId:pos.id}:null,assertionB:negative?{state:negative.state,value:negative.value,observationId:negative.id}:null,
      sourceA:sources.find(s=>s.id===pos?.sourceId)?.id??null,sourceB:negative?.sourceId??null,
      authorityRelationship:'Existing evidence contract admits this as a blocking attributable contradiction; no automatic authority override.',freshnessRelationship:'Both evaluated at the same canonical as-of clock.',
      severity:'HUMAN_REVIEW_REQUIRED',resolutionOptions:['Review attributable conflicting assertions.','Admit an explicit resolution or superseding update; do not infer resolution from silence.'],
      evidenceIds:unique([positive?.evidenceId,c.evidenceId,...evidence.filter(e=>e.observationId===negative?.id).map(e=>e.id)]),automaticResolution:false};
  })];
}

export function invalidatedReasoning(twin,graph) {
  const authorized=new Set(rows(twin.incidents).filter(item=>graph.nodes.some(n=>n.type==='INCIDENT'&&n.recordId===item.incident.id)).flatMap(item=>rows(item.eventIds)));
  return rows(twin.relationHistory).filter(r=>['SUPERSEDED','CANCELLED'].includes(r.state)&&authorized.has(r.eventId)).map(r=>({
    evidenceId:`evidence:${r.eventId}`,byEventId:r.byEventId,state:r.state,reviewRequired:true,
    affected:[...traceDependencies(graph,dependencyNodeId('OBSERVATION',`observation:${r.eventId}`),{downstream:true}),...rows(twin.incidents).filter(item=>rows(item.eventIds).includes(r.eventId)).flatMap(item=>graph.nodes.filter(n=>n.incidentId===item.incident.id&&['ASSESSMENT','RECOMMENDATION'].includes(n.type)).map(n=>({entityId:n.id,reason:'Derived from the incident whose explicit event history includes the invalidated observation.'})))],
    reason:'The canonical event relation explicitly invalidates the earlier observation. Current assessments have been recomputed; historical decision context is immutable.'}));
}

export function resolutionPath(item,gaps,graph) {
  const steps=gaps.map(gap=>({id:gap.questionId,objective:gap.missingEvidenceType,options:gap.availableCollectionOptions.map(o=>({sourceId:o.sourceId,state:o.availability,eligible:o.availability==='ACTIVE'&&o.coverage===true&&o.rights==='READY'})),resolutionCriteria:gap.resolutionCriteria}));
  // Exact minimum acquisition count over the small, fixed assessment-question
  // set. This is a structural path, never a claim about physical resolution time.
  const sourceIds=unique(steps.flatMap(s=>s.options.map(o=>o.sourceId))),paths=new Map([[0,[]]]);
  for(const sourceId of sourceIds){const mask=steps.reduce((bits,s,i)=>bits|(s.options.some(o=>o.sourceId===sourceId)?1<<i:0),0);
    for(const [covered,path]of [...paths]){const next=covered|mask,candidate=[...path,sourceId],prior=paths.get(next);if(!prior||candidate.length<prior.length||candidate.length===prior.length&&candidate.join('|')<prior.join('|'))paths.set(next,candidate);}}
  const shortest=paths.get((1<<steps.length)-1)??null;
  return {objective:'Resolve the incident evidence assessment, not close or dispatch the incident',incidentId:item.incident.id,steps,
    blockers:steps.filter(s=>!s.options.some(o=>o.eligible)).map(s=>({stepId:s.id,reason:'No declared option has all of availability, incident coverage and collection rights proven.'})),
    parallelizableSteps:steps.map(s=>s.id),criticalPath:shortest?.map(sourceId=>({sourceId,resolves:steps.filter(s=>s.options.some(o=>o.sourceId===sourceId)).map(s=>s.id),eligibility:steps.every(s=>!s.options.some(o=>o.sourceId===sourceId)||s.options.some(o=>o.sourceId===sourceId&&o.eligible))?'PROVEN':'BLOCKED_OR_UNKNOWN'}))??[],
    minimumAcquisitions:shortest?.length??null,pathState:shortest?'STRUCTURAL_PATH':'NO_DECLARED_PATH',
    estimatedCompletionBasis:'Minimum distinct declared source acquisitions covering all questions; not a completion-time estimate. Each result still needs evidence admission. Questions are AND conditions; sources are alternatives. Eligibility blockers remain explicit.',
    upstreamDependencies:traceDependencies(graph,dependencyNodeId('ASSESSMENT',item.incident.id))};
}
