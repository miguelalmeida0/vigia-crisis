import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOperationalTwin } from '../../src/operational-twin/project-operational-twin.mjs';
import { projectDecisionSuperiority } from '../../src/operational-twin/decision-superiority.mjs';
import { operationalCounterfactual } from '../../src/operational-twin/operational-counterfactual.mjs';
import { answerIntelligenceQuery, parseIntelligenceQuery, SUPPORTED_INTELLIGENCE_QUERIES } from '../../src/operational-twin/intelligence-query.mjs';
import { captureDecisionContext, decisionHistory } from '../../src/operational-twin/decision-context.mjs';
import { at,actor,registry,recorded,health,requirement } from './operational-intelligence-fixture.mjs';

const twin=(events,minute=5,extra={})=>({...projectOperationalTwin({events,sourceRegistry:registry(),asOf:at(minute)}),informationCollection:{requirements:[requirement()]},decisions:[{id:'decision:test',incidentId:'incident:test-fire',requiredTaskIds:['task:test'],state:'OPEN'}],...extra});
const project=(events,minute=5,extra={})=>projectDecisionSuperiority({twin:twin(events,minute,extra),actor});

test('A source failure cascade has a causal task/decision path and an evidence-backed recommendation',()=>{
  const p=project([recorded('thermal',0),recorded('official',1),health('UNAVAILABLE',2)]);
  const impact=p.impacts.find(i=>i.entityId==='source:official');
  assert.ok(impact.directImpact.some(i=>i.entityId==='task:task:test'));
  assert.ok(impact.decisionImpact.some(i=>i.entityId==='decision:decision:test'&&i.path.length>=2));
  assert.notEqual(p.readiness.find(r=>r.id==='decision:test').state,'READY');
  assert.ok(p.assessments[0].collectionRecommendations.some(r=>r.evidenceIds.length&&r.reasons.length));
});
test('B contradictory official/physical evidence requires human review until an explicit resolution',()=>{
  const negative=recorded('optical',2,{payload:{observationState:'OBSERVED_NEGATIVE',stance:'CONTRADICTING',materiality:'MATERIAL',opportunity:{state:'VALID',reason:'Isolated unobstructed observation'}}});
  const events=[recorded('thermal',0),recorded('official',1),negative];
  const before=project(events);assert.equal(before.assessments[0].assessment.corroborationState,'CONFLICTING');assert.ok(before.assessments[0].contradictions.length);assert.equal(before.assessments[0].contradictions[0].automaticResolution,false);
  const resolution=recorded('official',4,{payload:{observationState:'OBSERVED_POSITIVE',stance:'SUPPORTING',resolvesEventIds:[negative.id]}});
  const after=project([...events,resolution]);assert.equal(after.assessments[0].contradictions.length,0);
});
test('C independent evidence resolves the physical gap and changes collection tasking',()=>{
  const before=project([recorded('thermal',0)]),after=project([recorded('thermal',0),recorded('optical',2)]);
  assert.ok(before.assessments[0].gaps.some(g=>g.acceptableSourceFamilies.includes('PHYSICAL')));
  assert.ok(!after.assessments[0].gaps.some(g=>g.acceptableSourceFamilies.includes('PHYSICAL')));
  assert.equal(after.assessments[0].assessment.corroborationState,'MULTI_SOURCE');
  assert.equal(before.assessments[0].valueOfInformation.automaticTaskCreated,false);
  assert.ok(before.assessments[0].collectionRecommendations.every(r=>r.expectedLatencyMs===null));
});
test('D temporal decay produces stable watch identities and new evidence restores freshness',()=>{
  const events=[recorded('thermal',0)],near=project(events,80),again=project(events,81),expired=project(events,91),fresh=project([...events,recorded('thermal',92)],93);
  const watch=near.watches.find(w=>w.type==='EVIDENCE_EXPIRES');assert.ok(watch);assert.ok(again.watches.some(w=>w.id===watch.id));
  assert.equal(expired.assessments[0].assessment.corroborationState,'STALE');assert.equal(fresh.assessments[0].assessment.corroborationState,'SINGLE_SOURCE');
  assert.ok(expired.temporal.conditions.some(c=>c.condition==='EVIDENCE_EXPIRES'&&c.state==='DUE'));
});
test('E shared source dependency stays scoped and exposes multi-incident paths',()=>{
  const t=twin([recorded('thermal',0),recorded('optical',1,{correlationKeys:['incident:second']}),health('UNAVAILABLE',2)],5,{informationCollection:{requirements:[requirement(),{...requirement(),id:'requirement:2',incidentId:'incident:second',collectionTasks:[{id:'task:2',sourceId:'official',state:'OPEN'}]}]}});
  const p=projectDecisionSuperiority({twin:t,actor:{...actor,incidentScopes:['*']}});
  assert.equal(p.coordination.shared.find(s=>s.dependencyId==='source:official').incidentIds.length,2);
  const scoped=projectDecisionSuperiority({twin:t,actor});assert.ok(!JSON.stringify(scoped).includes('incident:second'));
});
test('F as-of excludes later evidence and durable context cannot be rewritten with it',()=>{
  const events=[recorded('thermal',0),recorded('optical',5)],earlier=twin(events,2),later=twin(events,6);
  const context=captureDecisionContext({twin:earlier,actor,incidentId:'incident:test-fire',action:'ASSUME_OWNERSHIP'}),original=JSON.stringify(context);
  assert.equal(projectDecisionSuperiority({twin:earlier,actor}).assessments[0].assessment.corroborationState,'SINGLE_SOURCE');
  assert.equal(projectDecisionSuperiority({twin:later,actor}).assessments[0].assessment.corroborationState,'MULTI_SOURCE');
  assert.equal(JSON.stringify(context),original);
  assert.equal(decisionHistory([{at:at(3),actorId:actor.id,decisionContext:context}],actor,{asOf:at(2)}).length,0);
});
test('provider identity backfill never invents an upstream observation source',()=>{
  const p=project([recorded('thermal',0)],5,{informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'named',provider:{id:'official_status'},state:'OPEN'},{id:'unknown',state:'OPEN'}]}]}});
  assert.equal(p.graph.coverage.withNamedProvider,1);assert.equal(p.graph.coverage.withNamedSource,0);
  assert.equal(p.graph.coverage.unknownDependencies,1);assert.equal(p.graph.coverage.unknown[0].state,'DEPENDENCY UNKNOWN');
  assert.ok(!p.graph.edges.some(e=>e.fromId==='provider:official_status'&&e.toId==='source:official'));
  assert.ok(p.graph.edges.every(e=>e.reason&&e.derivationRuleId&&['EXPLICIT','DERIVED','UNKNOWN'].includes(e.confidenceClass)));
});
test('resource contention is only recorded shared demand; no capacity or allocation invented',()=>{
  const t=twin([recorded('thermal',0),recorded('optical',1,{correlationKeys:['incident:second']})],5,{informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'a',requiredResourceIds:['drone:real-ref'],state:'OPEN'}]},{...requirement(),id:'q2',incidentId:'incident:second',collectionTasks:[{id:'b',requiredResourceIds:['drone:real-ref'],state:'OPEN'}]}]}});
  const p=projectDecisionSuperiority({twin:t,actor:{...actor,incidentScopes:['*']}});assert.equal(p.coordination.contention.length,1);assert.equal(p.coordination.contention[0].automaticAllocation,false);assert.equal(p.coordination.contention[0].state,'POTENTIAL_CONTENTION');
});
test('counterfactual source failure and invalidation reevaluate contract without mutating input',()=>{
  const t=twin([recorded('thermal',0),recorded('optical',1),recorded('official',2)]),original=JSON.stringify(t);
  const c=operationalCounterfactual({twin:t,actor,assumption:{kind:'SOURCE_FAILURE',entityId:'source:official'}});
  assert.ok(c.changedAssessments.some(a=>a.state==='MULTI_SOURCE'));assert.equal(JSON.stringify(t),original);assert.equal(c.productionMutated,false);
  const observation=t.incidents[0].evidenceGraph.observations.find(o=>o.sourceId==='optical');
  const invalid=operationalCounterfactual({twin:t,actor,assumption:{kind:'EVIDENCE_INVALIDATION',entityId:`observation:${observation.id}`}});assert.equal(invalid.productionMutated,false);assert.equal(JSON.stringify(t),original);
  assert.throws(()=>operationalCounterfactual({twin:t,actor,assumption:{kind:'SOURCE_FAILURE',entityId:'source:foreign'}}),/out_of_scope/);
});
test('Ask Vigia is bounded, deterministic and unknown requests do not invent answers',()=>{
  const p=project([recorded('thermal',0)]);
  assert.equal(SUPPORTED_INTELLIGENCE_QUERIES.length,9);
  for(const question of SUPPORTED_INTELLIGENCE_QUERIES.filter(q=>!q.includes('[')))assert.notEqual(parseIntelligenceQuery(question).intent,'UNKNOWN');
  assert.equal(answerIntelligenceQuery(p,'Evacuate now').results.length,0);
  assert.match(answerIntelligenceQuery(p,'Evacuate now').answer,/enough verified/);
  assert.ok(answerIntelligenceQuery(p,'What is blocking verification?').evidenceIds.length);
});

test('typed road assertions propagate conflict to dependent work and require attributable resolution',()=>{
  const assertion=(source,minute,value,extra={})=>recorded(source,minute,{payload:{observationState:'OBSERVED_POSITIVE',stance:'IRRELEVANT',assertion:{subjectId:'road:exact',property:'road_status',value},...extra}});
  const open=assertion('official',0,'OPEN'),blocked=assertion('optical',1,'BLOCKED');
  const extra={informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'road-task',routeIds:['road:exact'],state:'OPEN'}]}]}};
  const p=project([open,blocked],2,extra);
  assert.equal(p.assessments[0].contradictions.length,1);
  assert.equal(p.readiness.find(r=>r.id==='road-task').state,'CONFLICTING');
  assert.ok(p.assessments[0].collectionRecommendations.some(r=>r.actionId.startsWith('review:')&&r.allowed&&r.evidenceIds.length===2));
  assert.equal(p.assessments[0].contradictions[0].automaticResolution,false);
  const resolved=project([open,blocked,assertion('official',3,'CLOSED',{resolvesEventIds:[open.id]})],4,extra);
  assert.equal(resolved.assessments[0].contradictions.length,0);
  assert.notEqual(resolved.readiness.find(r=>r.id==='road-task').state,'CONFLICTING');
  assert.equal(project([open,blocked],100,extra).assessments[0].contradictions.length,0,'stale assertions do not masquerade as a current conflict');
});

test('explicit evidence dependency goes ready → stale → new attributable support; source recovery restores task information readiness',()=>{
  const e=recorded('thermal',0),task={...requirement(),collectionTasks:[{id:'evidence-task',requiredEvidenceIds:[`evidence:${e.id}`],state:'OPEN'}]};
  const extra={informationCollection:{requirements:[task]}};
  assert.equal(project([e],1,extra).readiness.find(r=>r.id==='evidence-task').state,'READY');
  assert.equal(project([e],91,extra).readiness.find(r=>r.id==='evidence-task').state,'STALE');
  const fresh=recorded('thermal',92);
  const updated={informationCollection:{requirements:[{...task,collectionTasks:[{...task.collectionTasks[0],requiredEvidenceIds:[`evidence:${fresh.id}`]}]}]}};
  assert.equal(project([e,fresh],93,updated).readiness.find(r=>r.id==='evidence-task').state,'READY');
  assert.equal(project([e,health('UNAVAILABLE',1)],2).readiness.find(r=>r.id==='task:test').state,'BLOCKED');
  assert.equal(project([e,health('UNAVAILABLE',1),health('ACTIVE',3)],4).readiness.find(r=>r.id==='task:test').state,'READY');
});

test('source/provider aliases do not make an exact dependency query ambiguous',()=>{
  const p=project([recorded('official',0)],1,{informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'provider-task',provider:{id:'official'},state:'OPEN'}]}]}});
  const result=answerIntelligenceQuery(p,'What depends on official?');
  assert.ok(result.results.some(r=>r.entityId==='task:provider-task'));
});

test('facility and task-delay assumptions are isolated, bounded and do not invent capacity',()=>{
  const t=twin([recorded('thermal',0)],5,{informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'task:test',facilityIds:['facility:recorded'],deadline:at(20),state:'OPEN'}]}]}}),before=JSON.stringify(t);
  const facility=operationalCounterfactual({twin:t,actor,assumption:{kind:'FACILITY_UNAVAILABLE',entityId:'facility:facility:recorded'}});
  assert.ok(facility.affectedEntities[0].directImpact.some(d=>d.entityId==='task:task:test'));
  const delay=operationalCounterfactual({twin:t,actor,assumption:{kind:'TASK_DELAY',entityId:'task:task:test',minutes:30}});
  assert.equal(delay.crossedDeadlines.length,1);
  assert.equal(JSON.stringify(t),before);
  assert.throws(()=>operationalCounterfactual({twin:t,actor,assumption:{kind:'TASK_DELAY',entityId:'task:task:test',minutes:1441}}),/out_of_bounds/);
});

test('superseded evidence marks its exact task and downstream decision for review, while watches never fabricate a new occurrence time',()=>{
  const original=recorded('thermal',0),replacement=recorded('thermal',2,{action:'SUPERSEDE',targetEventId:original.id});
  const extra={informationCollection:{requirements:[{...requirement(),collectionTasks:[{id:'task:test',requiredEvidenceIds:[`evidence:${original.id}`],state:'OPEN'}]}]}};
  const p=project([original,replacement],3,extra);
  assert.ok(p.invalidation.some(i=>i.evidenceId===`evidence:${original.id}`&&i.affected.some(a=>a.entityId==='task:task:test')));
  assert.ok(p.invalidation.some(i=>i.affected.some(a=>a.entityId==='decision:decision:test')));
  assert.equal(p.readiness.find(r=>r.id==='task:test').state,'BLOCKED');
  const conflicting=project([recorded('official',0),recorded('optical',1,{payload:{observationState:'OBSERVED_NEGATIVE',stance:'CONTRADICTING',materiality:'MATERIAL',opportunity:{state:'VALID',reason:'Isolated test'}}})]);
  const watch=conflicting.watches.find(w=>w.type==='CONTRADICTION');assert.ok(watch);assert.equal(watch.at,null);assert.equal(watch.conditionAsOf,at(5));
  assert.equal(new Set(conflicting.assessments[0].collectionRecommendations.filter(r=>r.actionId.startsWith('collect:')).map(r=>r.actionId)).size,conflicting.assessments[0].collectionRecommendations.filter(r=>r.actionId.startsWith('collect:')).length);
});
