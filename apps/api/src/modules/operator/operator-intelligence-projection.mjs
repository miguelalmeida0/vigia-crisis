import { projectOperatorIntelligence } from '../../../../../packages/domain/src/operational-twin/operator-intelligence.mjs';
import { projectDecisionSuperiority } from '../../../../../packages/domain/src/operational-twin/decision-superiority.mjs';
import { compactDecisionIntelligence } from './decision-intelligence-projection.mjs';
import { projectPhysicalWorld } from '../../../../../packages/domain/src/operational-twin/physical-world.mjs';
import { appendOperationalActivity } from './physical-activity.mjs';

const referenceLists = new Set(['evidenceIds','conflictingEvidenceIds','possibleDuplicateIncidentIds','backingWorkIds','causalKeys','rootObservationIds','affectedEntityIds','layers']);
function boundedReferences(value) {
  if (Array.isArray(value)) return value.map(boundedReferences);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([name,item]) => referenceLists.has(name) && Array.isArray(item)
    ? [[name,item.slice(0,20).map(boundedReferences)],[`${name}Total`,item.length]] : [[name,boundedReferences(item)]]));
}

function boundedProjection(projection) {
  const rank={HIGH:0,REVIEW:1,MONITOR:2};
  const incidents=[...projection.incidents].sort((a,b)=>(rank[a.priority.level]??3)-(rank[b.priority.level]??3)||a.incidentId.localeCompare(b.incidentId)).slice(0,20).map(item=>({
    ...item,assessment:item.assessment?{...item.assessment,lineage:item.assessment.lineage.slice(0,20),lineageTotal:item.assessment.lineage.length}:null,
    work:item.work.slice(0,20),workTotal:item.work.length,
  }));
  const sourceBlastRadius=projection.sourceBlastRadius.slice(0,20).map(item=>({...item,
    affectedIncidentCount:item.incidentIds.length,affectedTaskCount:item.taskIds.length,affectedDecisionCount:item.decisionIds.length,
    incidentIds:item.incidentIds.slice(0,20),assessmentIds:item.assessmentIds.slice(0,20),taskIds:item.taskIds.slice(0,20),decisionIds:item.decisionIds.slice(0,20),
  }));
  return {...projection,incidents,sourceBlastRadius,inventory:{incidents:{total:projection.incidents.length,returned:incidents.length},sources:{total:projection.sourceBlastRadius.length,returned:sourceBlastRadius.length}},
    wireBoundary:'Lists are bounded; explicit totals refer to the authorized projection, not a national universe.'};
}

export async function physicalWorldContext(services) {try{return await services.worldService?.snapshot({preferCache:true})??null;}catch{return null;}}
export function withOperatorIntelligence(data, twin, actor, incidentId, previous = null, world = null, asOf = twin?.asOf ?? world?.meta?.generatedAt) {
  const physical=appendOperationalActivity(projectPhysicalWorld({twin:twin??{asOf,incidents:[]},actor,incidentId,world,asOf,scene:['READY','DEGRADED'].includes(data.mapScene?.state)?data.mapScene.value:null}),data,actor,incidentId);
  if (!twin) return { ...data, physicalWorld:{state:world?'DEGRADED':'UNAVAILABLE',value:world?physical:null,reason:'Incident reasoning is unavailable; independent national source context may still be returned.'},operationalIntelligence: { state: 'UNAVAILABLE', value: null, reason: 'Canonical event twin is unavailable.' },decisionIntelligence:{state:'UNAVAILABLE',value:null,reason:'Canonical event twin is unavailable.'} };
  // Portfolio rows need dated weather summaries; complete selected-incident
  // measurements remain on incident projections and coverage disclosures.
  if(!incidentId)physical.incidents=physical.incidents.map(row=>({...row,metrics:(row.metrics??[]).filter(m=>['temperature','wind','humidity','rain'].includes(m.id)),measurementDetail:'SELECT_INCIDENT_FOR_FULL_COVERAGE'}));
  const intelligence=projectOperatorIntelligence({ twin, actor, incidentId, asOf:twin.asOf, previous });
  const decisionSupport=compactDecisionIntelligence(projectDecisionSuperiority({twin,actor,incidentId,intelligence}));
  return { ...data, physicalWorld:{state:'READY',value:physical,authority:'ATTRIBUTED_PHYSICAL_OBSERVATIONS'},decisionIntelligence:{state:'READY',value:decisionSupport,authority:'CANONICAL_EVIDENCE_AND_EXPLICIT_DEPENDENCIES'},operationalIntelligence: {
    state: 'READY', authority: 'EVENT_FABRIC_EVIDENCE_CONTRACT_AND_GOVERNED_WORK',
    value: boundedReferences(boundedProjection(intelligence)),
  } };
}
