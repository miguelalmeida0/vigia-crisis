import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOperationalTwin } from '../../src/operational-twin/project-operational-twin.mjs';
import { projectOperatorIntelligence } from '../../src/operational-twin/operator-intelligence.mjs';
import { at,actor,registry,recorded,health,requirement } from './operational-intelligence-fixture.mjs';
import { Agent1OperationalProjectionAdapter } from '../../src/event-fabric/adapters/agent1-operational-projection-adapter.mjs';
import { createAssociationState, associateOperationalEvent } from '../../src/operational-twin/incident-association.mjs';

const twin = (events,minute=5) => projectOperationalTwin({events,sourceRegistry:registry(),asOf:at(minute)});
const project = (events,options={}) => projectOperatorIntelligence({twin:{...twin(events,options.minute??5),informationCollection:{requirements:[requirement()]}},actor,...options});

test('thermal correlation forms one candidate with explicit reasons, never official promotion',()=>{
  const p=project([recorded('thermal',0)]),i=p.incidents[0];
  assert.equal(i.assessment.corroborationState,'SINGLE_SOURCE');
  assert.match(i.assessment.summary,/Heat detected/);
  assert.deepEqual(i.correlation.correlationReasons,['EXACT_CORRELATION_KEY']);
  assert.equal(i.priority.physicalHazardSeverity,null);
});
test('two broker feeds of the same upstream observation do not increase independence',()=>{
  const i=project([recorded('thermal',0),recorded('thermal-copy',1)]).incidents[0];
  assert.equal(i.assessment.corroborationState,'SINGLE_SOURCE');
  assert.equal(i.assessment.sourceCoverage.independentPhysicalFamilies,1);
  assert.equal(new Set(i.assessment.lineage.flatMap(x=>x.causalKeys)).size,1);
});
test('independent evidence yields multisource and material semantic change without official authority',()=>{
  const p=project([recorded('thermal',0),recorded('optical',2)]);
  assert.equal(p.incidents[0].assessment.corroborationState,'MULTI_SOURCE');
  assert.equal(p.incidents[0].assessment.officialState,'NO_CURRENT_CONFIRMATION');
  assert.ok(p.changes.some(c=>c.type==='corroboration_changed'&&c.after==='MULTI_SOURCE'));
  assert.ok(p.consequences.some(c=>c.recommendedWorkflow==='REEVALUATE_INCIDENT'));
});
test('official evidence changes the assessment only when source contract permits it',()=>{
  const blocked=project([recorded('thermal',0),health('UNAVAILABLE',1),recorded('official',2)]);
  assert.equal(blocked.incidents[0].assessment.officialState,'NO_CURRENT_CONFIRMATION');
  const recovered=project([recorded('thermal',0),health('UNAVAILABLE',1),recorded('official',2),health('ACTIVE',3)]);
  assert.equal(recovered.incidents[0].assessment.corroborationState,'OFFICIAL_CONFIRMED');
  assert.ok(!recovered.incidents[0].recommendations.some(r=>r.what==='Request official confirmation'));
});
test('freshness expiry does not retain a current corroboration label',()=>{
  const p=project([recorded('thermal',0)],{minute:180});
  assert.equal(p.incidents[0].assessment.corroborationState,'STALE');
  assert.ok(p.incidents[0].recommendations.some(r=>r.what==='Recheck stale evidence'));
  const later=project([recorded('thermal',0)],{minute:181,previous:p});
  assert.equal(later.attention.total,p.attention.total,'Polling an unchanged expired evidence basis must not create more attention');
  assert.deepEqual(later.changes.map(c=>c.id).sort(),p.changes.map(c=>c.id).sort());
});
test('conflicting attributable evidence takes precedence over corroboration',()=>{
  const negative=recorded('optical',2,{payload:{observationState:'OBSERVED_NEGATIVE',stance:'CONTRADICTING',materiality:'MATERIAL',opportunity:{state:'VALID',reason:'Isolated unobstructed test observation'}}});
  const p=project([recorded('thermal',0),negative]);
  assert.equal(p.incidents[0].assessment.corroborationState,'CONFLICTING');
  assert.equal(p.incidents[0].priority.level,'HIGH');
  assert.ok(p.consequences.some(c=>c.recommendedWorkflow==='RESOLVE_CONFLICT'));
});
test('source blast radius uses explicit dependencies and discloses missing last success',()=>{
  const p=project([recorded('thermal',0),health('UNAVAILABLE',1)]),b=p.sourceBlastRadius[0];
  assert.deepEqual(b.taskIds,['task:test']);assert.equal(b.incidentIds.length,1);
  assert.equal(b.lastHealthyAt,null);assert.equal(b.elapsedSinceHealthyMs,null);
  assert.ok(p.incidents[0].recommendations[0].evidenceIds.length);
  assert.deepEqual(p.incidents[0].recommendations.find(r=>r.what==='Request official confirmation').backingWorkIds,['task:test']);
  assert.deepEqual(p.incidents[0].recommendations.find(r=>r.what==='Acquire independent observation').backingWorkIds,[],'Unrelated work cannot supply an owner or next check');
});
test('permissions constrain recommendations and incident scopes constrain all dependencies',()=>{
  const p=project([recorded('thermal',0),health('UNAVAILABLE',1)],{actor:{...actor,capabilities:['read:evidence']}});
  assert.ok(p.incidents[0].recommendations.every(r=>r.allowed===false));
  const other=project([recorded('thermal',0),health('UNAVAILABLE',1)],{actor:{...actor,incidentScopes:['other']}});
  assert.deepEqual(other.incidents,[]);assert.deepEqual(other.sourceBlastRadius,[]);assert.deepEqual(other.changes,[]);
});
test('reordered replay and unchanged projection produce identical attention IDs; since filters history',()=>{
  const events=[recorded('thermal',0),recorded('optical',2)];
  assert.deepEqual(project(events).attention,project([...events].reverse()).attention);
  assert.equal(project(events,{since:at(4)}).attention.unreadCount,0);
});
test('conflicting unknown explicit incident keys cannot be silently merged',()=>{
  const p=twin([recorded('thermal',0,{correlationKeys:['incident:a','incident:b']})]);
  assert.equal(p.incidents.length,0);assert.equal(p.failures[0].reason,'CONFLICTING_CORRELATION_KEYS');
});
test('deadline priority changes are explained against the prior projection without claiming hazard escalation',()=>{
  const events=[recorded('thermal',0)],before=project(events,{minute:5}),after=project(events,{minute:31,previous:before});
  assert.equal(after.incidents[0].priority.level,'HIGH');
  assert.ok(after.changes.some(c=>c.type==='priority_changed'&&c.before==='REVIEW'&&c.after==='HIGH'));
  assert.equal(after.incidents[0].priority.physicalHazardSeverity,null);
});
test('duplicate collection references do not inflate source impact counts',()=>{
  const original=twin([recorded('thermal',0),health('UNAVAILABLE',1)]),r=requirement();
  const p=projectOperatorIntelligence({twin:{...original,informationCollection:{requirements:[r,r]}},actor});
  assert.equal(p.sourceBlastRadius[0].taskIds.length,1);
  assert.match(p.sourceBlastRadius[0].summary,/1 active tasks/);
});
test('declared compatibility aliases remain context-only and cannot steal an existing incident identity',()=>{
  const state=createAssociationState(),adapter=new Agent1OperationalProjectionAdapter();
  const event=adapter.adaptOne({id:'primary',incidentIds:['alias'],coordinate:[-8,40],lastSeenAt:at(0),firstSeenAt:at(0)});
  const associated=associateOperationalEvent(state,event);
  assert.equal(associated.id,'incident:primary');
  assert.equal(state.keyToIncident.get('incident:alias'),'incident:primary');
  const other=adapter.adaptOne({id:'other',incidentIds:['alias'],coordinate:[-8,40],lastSeenAt:at(1),firstSeenAt:at(1)});
  assert.equal(associateOperationalEvent(state,other),null);
  assert.equal(state.keyToIncident.get('incident:alias'),'incident:primary');
  assert.equal(state.ambiguities[0].reason,'CONFLICTING_CORRELATION_KEYS');
  const context=project([recorded('thermal',0,{payload:{observationState:'OBSERVED_UNDETERMINED',stance:'IRRELEVANT'}})]).incidents[0];
  assert.equal(context.assessment.corroborationState,'UNCONFIRMED');
  assert.ok(context.recommendations.some(r=>r.what==='Request official confirmation'&&r.evidenceIds.length),'Recorded context can request verification without becoming qualifying evidence');
});
