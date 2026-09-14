import { canonicalIncidentId, incidentInScope } from '../authorization.mjs';
import { semanticHash } from '../intelligence/shared.mjs';
import { rows, unique, workId, sourceRefs, decisionWork, activeWork } from './decision-work.mjs';
import { assertionContradictions } from './assertion-contradictions.mjs';

export const dependencyNodeId = (type,id) => `${type.toLowerCase()}:${type === 'INCIDENT' ? canonicalIncidentId(id) : id}`;
const traversalIndexes=new WeakMap();
export function buildDependencyGraph({twin,actor,incidentId=null,intelligence=null}) {
  const nodes = new Map(), edges = new Map(), work = decisionWork(twin,actor,incidentId);
  const node = (type,id,details={}) => { if (!id) return null; const key=dependencyNodeId(type,id);nodes.set(key,{...nodes.get(key),id:key,type,recordId:String(id),...details});return key; };
  const edge = (fromId,toId,dependencyType,reason,evidenceIds=[],confidenceClass='EXPLICIT') => {
    if(!fromId||!toId)return; const value={fromId,toId,dependencyType,reason,evidenceIds:unique(evidenceIds),derivationRuleId:`VIGIA-DEP-${dependencyType}-1`,confidenceClass};
    edges.set(semanticHash('dependency',value),value);
  };
  const scope = id => incidentInScope(actor,id) && (!incidentId || canonicalIncidentId(id)===canonicalIncidentId(incidentId));
  for(const item of rows(twin.incidents).filter(item=>scope(item.incident.id))) {
    const iid=item.incident.id,inc=node('INCIDENT',iid,{label:item.incident.label??iid,incidentId:iid}),assessment=node('ASSESSMENT',iid,{incidentId:iid,state:item.assessment?.corroborationState??'UNKNOWN'});
    edge(inc,assessment,'ASSESSED_BY','The canonical incident owns this assessment.');
    for(const observation of rows(item.evidenceGraph?.observations)) {
      const evidence=rows(item.evidenceGraph?.evidence).find(e=>e.observationId===observation.id);
      const evaluation=[...rows(item.evaluation?.qualifyingEvidence),...rows(item.evaluation?.excludedEvidence)].find(e=>e.observationId===observation.id);
      const obs=node('OBSERVATION',observation.id,{incidentId:iid,evidenceId:evidence?.id,observedAt:observation.observedAt,state:evaluation?.classification==='SUPPORTING'?'CURRENT_QUALIFYING_SUPPORT':evaluation?.classification??'UNKNOWN',observationState:observation.state});
      const source=node('SOURCE',observation.sourceId,{label:observation.sourceId});
      edge(obs,source,'OBSERVED_BY','Canonical observation sourceId.',[evidence?.id]);
      edge(assessment,obs,'INFORMED_BY','Evidence contract evaluates this attributable observation.',[evidence?.id]);
    }
    for(const conflict of assertionContradictions(item,twin.asOf)) {
      const subject=node(conflict.property==='road_status'?'ROUTE':'INCIDENT',conflict.subject,{state:'CONFLICTING',label:conflict.subject});
      for(const evidenceId of conflict.evidenceIds){const obs=[...nodes.values()].find(n=>n.type==='OBSERVATION'&&n.evidenceId===evidenceId);if(obs)edge(subject,obs.id,'CONFLICTING_ASSERTION','Fresh attributable assertions disagree about this exact subject.',[evidenceId]);}
    }
  }
  for(const source of work.sources) {
    const id=dependencyNodeId('SOURCE',source.sourceId);
    if(nodes.has(id))node('SOURCE',source.sourceId,{label:source.label??source.sourceId,state:source.status,lastHealthyAt:source.lastSuccessAt??null});
  }
  for(const item of rows(twin.incidents).filter(item=>scope(item.incident.id))){
    for(const observation of rows(item.evidenceGraph?.observations))for(const parentId of rows(observation.derivedFromObservationIds)){
      const target=dependencyNodeId('OBSERVATION',parentId);if(nodes.has(target))edge(dependencyNodeId('OBSERVATION',observation.id),target,'DERIVED_OBSERVATION','Explicit causal observation lineage.',rows(item.evidenceGraph.evidence).filter(e=>e.observationId===observation.id).map(e=>e.id));
    }
    for(const relation of rows(twin.relationHistory).filter(r=>['SUPERSEDED','CANCELLED'].includes(r.state)&&rows(item.eventIds).includes(r.eventId)))node('OBSERVATION',`observation:${relation.eventId}`,{incidentId:item.incident.id,evidenceId:`evidence:${relation.eventId}`,state:relation.state,byEventId:relation.byEventId});
  }
  for(const requirement of work.requirements) {
    const q=node('QUESTION',requirement.id,{incidentId:requirement.incidentId,label:requirement.question,state:requirement.state,resolutionCriteria:requirement.satisfactionRule??requirement.unlockCondition??null});
    edge(node('INCIDENT',requirement.incidentId),q,'HAS_QUESTION','Persisted requirement incident identity.');
    if(requirement.subjectId)edge(q,node('FACILITY',requirement.subjectId,{label:requirement.subjectId}),'ABOUT_FACILITY','Requirement subjectId from the facility-capacity contract.');
  }
  const unknown=[];
  for(const item of [...work.tasks,...work.decisions]) {
    const type=work.tasks.includes(item)?'TASK':'DECISION',id=node(type,workId(item),{incidentId:item.incidentId,label:item.question??item.title??item.nextAction??workId(item),state:item.state,deadline:item.deadline??item.deadlineAt??null,owner:item.owner??null});
    edge(node('INCIDENT',item.incidentId),id,'HAS_WORK','Explicit incident ownership of governed work.');
    let dependencies=0;
    for(const sourceId of sourceRefs(item)) {
      const source=work.sources.find(s=>s.sourceId===sourceId);
      edge(id,node('SOURCE',sourceId,{label:source?.label??sourceId,state:source?.status??'UNKNOWN'}),'REQUIRES_SOURCE','Recorded source dependency.',rows(item.evidenceIds));dependencies++;
    }
    const providerId=item.providerId??item.provider?.id;
    if(providerId){const provider=node('PROVIDER',providerId,{label:item.provider?.label??providerId,state:work.sources.find(s=>s.sourceId===providerId)?.status??'UNKNOWN'});edge(id,provider,'USES_PROVIDER','Collection task explicitly names this provider/projection.',rows(item.evidenceIds));dependencies++;
      if(work.sources.some(s=>s.sourceId===providerId))edge(provider,node('SOURCE',providerId),'REGISTERED_SOURCE','Provider identity exactly matches a registered source.');}
    for(const [field,targetType] of [['requiredQuestionIds','QUESTION'],['requiredTaskIds','TASK'],['requiredEvidenceIds','OBSERVATION'],['requiredResourceIds','RESOURCE'],['resourceIds','RESOURCE'],['facilityIds','FACILITY'],['routeIds','ROUTE'],['authorityIds','AUTHORITY']]) {
      for(const ref of rows(item[field])) {
        let target=targetType==='OBSERVATION'?[...nodes.values()].find(n=>n.evidenceId===ref)?.id:dependencyNodeId(targetType,ref);
        if(targetType==='QUESTION'||targetType==='TASK'){if(!nodes.has(target)&&!([...work.tasks,...work.requirements].some(r=>workId(r)===ref&&scope(r.incidentId)))){unknown.push({taskId:workId(item),recordType:type,reference:ref,state:'DEPENDENCY UNKNOWN',reason:'Reference is absent from the authorized graph.'});continue;}}
        target??=node(targetType,ref,{state:'UNKNOWN'});if(!nodes.has(target))node(targetType,ref,{state:'UNKNOWN'});
        edge(id,target,`REQUIRES_${targetType}`,`Explicit ${field} reference.`,rows(item.evidenceIds));dependencies++;
      }
    }
    if(item.requirementId)edge(id,node('QUESTION',item.requirementId),'COLLECTS_FOR','Exact collection task requirementId; task completion alone does not satisfy this question.');
    if(type==='TASK'&&!dependencies)unknown.push({taskId:workId(item),recordType:type,state:'DEPENDENCY UNKNOWN',reason:'No attributable source, provider, resource, facility or requirement dependency is recorded.'});
  }
  for(const item of rows(intelligence?.incidents))for(const recommendation of rows(item.recommendations)) {
    const id=node('RECOMMENDATION',recommendation.id,{incidentId:item.incidentId,label:recommendation.what});
    edge(id,dependencyNodeId('ASSESSMENT',item.incidentId),'DERIVED_FROM','Deterministic recommendation reads the canonical assessment.',recommendation.evidenceIds,'DERIVED');
  }
  for(const change of rows(intelligence?.changes)) {const incident=rows(twin.incidents).find(i=>i.incident.id===change.entity&&scope(i.incident.id));if(incident)edge(node('CHANGE',change.id,{incidentId:incident.incident.id,label:change.summary}),dependencyNodeId('ASSESSMENT',incident.incident.id),'DESCRIBES_CHANGE','Semantic change references this assessment.',change.evidenceIds,'DERIVED');}
  const values=[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id)),links=[...edges].map(([id,e])=>({id,...e})).sort((a,b)=>a.id.localeCompare(b.id));
  const unknownTasks=unknown.filter(r=>r.recordType==='TASK');
  return {schemaVersion:'vigia.dependency-graph.v1',asOf:twin.asOf,nodes:values,edges:links,coverage:{tasks:work.tasks.length,withNamedSource:work.tasks.filter(t=>sourceRefs(t).length).length,withNamedProvider:work.tasks.filter(t=>t.providerId??t.provider?.id).length,unknownDependencies:new Set(unknownTasks.map(t=>t.taskId)).size,unknown:unknownTasks,unresolvedReferences:unknown.length,
    activeTasks:work.tasks.filter(activeWork).length,activeWithNamedSource:work.tasks.filter(t=>activeWork(t)&&sourceRefs(t).length).length,
    activeUnknownUpstreamSources:work.tasks.filter(t=>activeWork(t)&&!sourceRefs(t).length).length,
    unknownUpstreamSources:work.tasks.filter(t=>!sourceRefs(t).length).map(t=>({taskId:workId(t),active:activeWork(t),providerId:t.providerId??t.provider?.id??null,state:'DEPENDENCY UNKNOWN',reason:'Upstream observation source is not explicitly linked; a provider/projection name does not establish that link.'}))},boundary:'An edge explains a recorded dependency, not successful collection or authority. Proximity never creates a dependency.'};
}

export function traceDependencies(graph,id,{downstream=false}={}) {
  const visited=new Set([id]),queue=[{id,path:[]}],result=[];
  if(!traversalIndexes.has(graph)){
    const forward=new Map(),reverse=new Map();for(const edge of graph.edges.filter(e=>!['HAS_WORK','HAS_QUESTION','ASSESSED_BY','ABOUT_FACILITY','COLLECTS_FOR','DESCRIBES_CHANGE'].includes(e.dependencyType))){for(const [map,key]of [[forward,edge.fromId],[reverse,edge.toId]]){if(!map.has(key))map.set(key,[]);map.get(key).push(edge);}}
    traversalIndexes.set(graph,{forward,reverse});
  }
  const adjacency=traversalIndexes.get(graph)[downstream?'reverse':'forward'];
  while(queue.length){const current=queue.shift();for(const edge of adjacency.get(current.id)??[]){const next=downstream?edge.fromId:edge.toId;if(visited.has(next))continue;visited.add(next);const path=[...current.path,edge.id];result.push({entityId:next,direct:path.length===1,path,evidenceIds:edge.evidenceIds});queue.push({id:next,path});}}
  return result;
}
