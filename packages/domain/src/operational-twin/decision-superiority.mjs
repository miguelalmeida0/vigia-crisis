import { canonicalIncidentId, incidentInScope, can } from '../authorization.mjs';
import { semanticHash } from '../intelligence/shared.mjs';
import { projectOperatorIntelligence } from './operator-intelligence.mjs';
import { rows, decisionWork } from './decision-work.mjs';
import { buildDependencyGraph } from './dependency-graph.mjs';
import { planEvidenceGaps, assessmentTransitionConditions } from './evidence-gap-planner.mjs';
import { temporalIntelligence } from './temporal-intelligence.mjs';
import { analyzeDecisionReadiness, dependencyImpacts, sharedDependencies, incidentContradictions, invalidatedReasoning, resolutionPath } from './decision-analysis.mjs';

export function projectDecisionSuperiority({twin,actor,incidentId=null,since=null,intelligence=null}) {
  if(!Number.isFinite(Date.parse(twin.asOf)))throw new Error('decision_projection_clock_required');
  const base=intelligence??projectOperatorIntelligence({twin,actor,incidentId}),work=decisionWork(twin,actor,incidentId);
  const incidents=rows(twin.incidents).filter(i=>incidentInScope(actor,i.incident.id)&&(!incidentId||canonicalIncidentId(i.incident.id)===canonicalIncidentId(incidentId)));
  const graph=buildDependencyGraph({twin,actor,incidentId,intelligence:base}),readiness=analyzeDecisionReadiness(graph,work),impacts=dependencyImpacts(graph),coordination=sharedDependencies(graph,work);
  const temporal=temporalIntelligence({incidents,tasks:work.tasks,sources:work.sources,asOf:twin.asOf});
  const assessments=incidents.map(item=>{const plan=planEvidenceGaps(item,work.sources,actor,work.decisions,twin.asOf),contradictions=incidentContradictions(item);
    for(const conflict of contradictions)plan.collectionRecommendations.unshift({actionId:`review:${conflict.id}`,action:'Review the conflicting source assertions before a consequential decision.',resolves:[conflict.id],blockersRemoved:[],sourceFamily:null,expectedOperationalValue:'MATERIAL_CONTRADICTION_REVIEW',reasons:[conflict.authorityRelationship,...conflict.resolutionOptions],evidenceIds:conflict.evidenceIds,allowed:can(actor,'command:incident'),requiresHumanApproval:true,executable:false,expectedLatencyMs:null,effortClass:'UNKNOWN',ruleIds:['EXPLICIT-CONTRADICTION-REVIEW-1']});
    return {incidentId:item.incident.id,assessment:item.assessment,...plan,transitionConditions:assessmentTransitionConditions(item),contradictions,resolutionPath:resolutionPath(item,plan.gaps,graph)};});
  const watchConditions=[...base.changes.filter(c=>!since||Date.parse(c.timestamp)>Date.parse(since)).map(c=>({id:c.id,type:c.type,entityId:c.entity,summary:c.summary,evidenceIds:c.evidenceIds,at:c.timestamp})),
    ...temporal.conditions.filter(c=>c.state!=='SCHEDULED').map(c=>({id:c.id,type:c.condition,entityId:c.entityId,summary:c.operationalImpact,evidenceIds:c.evidenceIds,at:c.occursAt})),
    ...coordination.contention.map(c=>({id:semanticHash('contention-watch',c),type:'RESOURCE_CONTENTION',entityId:c.resourceId,summary:'Shared resource requirements need human capacity/overlap review.',evidenceIds:c.competingRequirements,at:null,conditionAsOf:twin.asOf})),
    ...assessments.flatMap(a=>a.contradictions.map(c=>({id:c.id,type:'CONTRADICTION',entityId:a.incidentId,summary:'Conflicting attributable assertions require human review.',evidenceIds:c.evidenceIds,at:null,conditionAsOf:twin.asOf})))];
  const watches=[...new Map(watchConditions.map(w=>[w.id,w])).values()];
  const informationDebt={missingIndependent:assessments.filter(a=>a.assessment?.sourceCoverage.independentPhysicalFamilies<2).length,missingOfficial:assessments.filter(a=>a.assessment?.officialState!=='QUALIFYING_OFFICIAL_EVIDENCE').length,
    conflicting:assessments.filter(a=>a.contradictions.length).length,blockedDecisions:readiness.filter(r=>r.type==='DECISION'&&r.state!=='READY').length,unknownTaskDependencies:graph.coverage.unknownDependencies,
    sourceFailuresWithImpact:impacts.filter(i=>graph.nodes.find(n=>n.id===i.entityId)?.type==='SOURCE').length,
    priorityOrder:['HUMAN_REVIEW_CONFLICT','BLOCKED_DECISION','EXPIRING_SUPPORT','UNIDENTIFIED_DEPENDENCY','MISSING_CORROBORATION'],asOf:twin.asOf,trend:null,trendReason:'No historical debt samples are fabricated.'};
  const briefs=assessments.map(a=>({incidentId:a.incidentId,asOf:twin.asOf,status:a.assessment?.summary??'Assessment unavailable.',sinceLastReview:base.changes.filter(c=>c.entity===a.incidentId&&(!since||Date.parse(c.timestamp)>Date.parse(since))).slice(0,5),
    blockers:a.gaps.map(g=>g.missingEvidenceType),nextAction:a.collectionRecommendations.find(r=>r.allowed)?.action??'No permission-eligible evidence-backed collection recommendation.',freshness:a.assessment?.freshnessState??'UNKNOWN',evidenceIds:a.assessment?.evidenceIds??[]}));
  const handoff={asOf:twin.asOf,since,changes:watches.slice(0,20),unresolvedHighPriority:base.incidents.filter(i=>i.priority.level==='HIGH').map(i=>i.incidentId),blockedDecisions:readiness.filter(r=>r.type==='DECISION'&&r.state!=='READY'),
    staleOrSoonStale:temporal.conditions.filter(c=>c.condition==='EVIDENCE_EXPIRES'&&c.state!=='SCHEDULED'),contradictions:assessments.flatMap(a=>a.contradictions),sourceFailures:impacts,tasksDue:temporal.conditions.filter(c=>c.condition==='TASK_DEADLINE'),resourceContention:coordination.contention,watchConditions:watches.slice(0,20),boundary:'Generated briefing only; no handoff issuance or acknowledgement implied.'};
  return {schemaVersion:'vigia.decision-superiority.v2',asOf:twin.asOf,graph,assessments,readiness,impacts,coordination,temporal,watches,informationDebt,briefs,handoff,
    invalidation:invalidatedReasoning(twin,graph),truthBoundary:'Structured evidence and dependencies only. No autonomous life-safety command, fabricated resource availability, probability or physical forecast.'};
}
