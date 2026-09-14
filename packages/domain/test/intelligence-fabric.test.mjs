import test from 'node:test';
import assert from 'node:assert/strict';
import { ONTOLOGY_INTERFACES, ONTOLOGY_OBJECT_TYPES, ONTOLOGY_VERSION, ontologyRelationship } from '../src/intelligence/contract.mjs';
import { INTELLIGENCE_RULES, RULE_SET_VERSION } from '../src/intelligence/rules.mjs';
import { deriveSituation } from '../src/intelligence/situation.mjs';
import { deriveUnknowns } from '../src/intelligence/unknowns.mjs';
import { deriveAttention } from '../src/intelligence/attention.mjs';
import { deriveNextBestEvidence } from '../src/intelligence/next-evidence.mjs';
import { deriveSourcePassports } from '../src/intelligence/source-passport.mjs';
import { deriveTimeToDefensibleTruth } from '../src/intelligence/tdt.mjs';
import { deriveDecisionDelta } from '../src/intelligence/delta.mjs';
import { hindsightSafeInputs } from '../src/intelligence/replay.mjs';
import { projectIncidentIntelligence } from '../src/intelligence/kernel.mjs';
import { createOperatorDecision } from '../src/intelligence/operator-decision.mjs';
import { IncidentProjectionQueue } from '../src/intelligence/queue.mjs';

const NOW='2026-08-23T12:00:00.000Z';
const observation=(id,family,at='2026-08-23T11:50:00.000Z',extra={})=>({id,type:'thermal',sourceFamily:family,independenceGroup:family,at,receivedAt:at,...extra});
const report=(id,at='2026-08-23T11:40:00.000Z')=>({id,type:'report',at,receivedAt:at});
const incident=(observations,extra={})=>({id:'incident:pt-1',label:'Portugal incident',observations,physicalState:{freshness:'current'},...extra});

test('ontology contract contains governed operational objects, interfaces, relationships, and versions',()=>{
  for(const value of ['INCIDENT','OBSERVATION','UNKNOWN','DECISION_STATE','FIELDNET_STATE','PREVENT_FINDING'])assert.ok(ONTOLOGY_OBJECT_TYPES.includes(value));
  for(const value of ['VERSIONED','PROVENANCED','INCIDENT_SCOPED','FRESHNESS_AWARE','MEASUREMENT_BOUND'])assert.ok(ONTOLOGY_INTERFACES.includes(value));
  const relationship=ontologyRelationship({relationshipType:'OBSERVATION_SUPPORTS_INCIDENT',subjectId:'obs:1',objectId:'incident:1',ruleOrAuthority:'SIT-001',createdAt:NOW,inputVersionHash:'sha256:test',provenance:{observationId:'obs:1'}});
  assert.equal(relationship.ontologyVersion,ONTOLOGY_VERSION);assert.equal(relationship.status,'ACTIVE');
  assert.ok(INTELLIGENCE_RULES.every((rule)=>rule.version&&rule.authority&&rule.testReferences.length));assert.match(RULE_SET_VERSION,/^vigia\.intelligence-rules\.v1:/);
});

test('SIT-001 through SIT-005 classify report, one-family, multi-family, conflict, and stale states',()=>{
  assert.equal(deriveSituation({incident:incident([report('r1')]),asOf:NOW}).state,'REPORT_ONLY_INCIDENT');
  assert.equal(deriveSituation({incident:incident([observation('o1','viirs')]),asOf:NOW}).state,'SINGLE_FAMILY_PHYSICAL_SIGNAL');
  assert.equal(deriveSituation({incident:incident([observation('o1','viirs'),observation('o2','sentinel3')]),asOf:NOW}).state,'MULTI_FAMILY_PHYSICAL_SUPPORT');
  assert.equal(deriveSituation({incident:incident([observation('o1','viirs')],{contradictions:[{id:'c1'}]}),asOf:NOW}).state,'PHYSICAL_REPORT_CONFLICT');
  const stale=incident([observation('o1','viirs','2026-08-22T01:00:00.000Z')],{physicalState:{freshness:'stale'}});assert.equal(deriveSituation({incident:stale,asOf:NOW}).state,'STALE_PHYSICAL_EVIDENCE');
  assert.equal(deriveSituation({incident:incident([observation('o1','viirs')]),mode:'HISTORICAL_REPLAY',asOf:NOW}).state,'HISTORICAL_REHEARSAL_CASE');
});

test('source IDs do not manufacture independence within one governed family',()=>{
  const situation=deriveSituation({incident:incident([observation('o1','viirs'),observation('o2','viirs')]),asOf:NOW});
  assert.equal(situation.state,'SINGLE_FAMILY_PHYSICAL_SIGNAL');assert.deepEqual(situation.why.independentPhysicalFamilies,['viirs']);
});

test('unknown classification is policy-bound and attention exposes an ordered factor vector',()=>{
  const situation=deriveSituation({incident:incident([observation('o1','viirs')]),asOf:NOW});
  const unknowns=deriveUnknowns({incident:incident([observation('o1','viirs')]),situation,evidenceNeeds:[],asOf:NOW});
  assert.equal(unknowns[0].classification,'DECISION_BLOCKING');assert.equal(unknowns[0].ruleId,'UNK-001');
  const attention=deriveAttention({incident:{lifeSafetyRelevance:true},situation,unknowns,asOf:NOW});
  assert.equal(attention.tier,'P1');assert.deepEqual(attention.reasons.slice(0,3),['LIFE_SAFETY_RELEVANCE','UNRESOLVED_DECISION_IMPACT','CURRENT_SINGLE_FAMILY_PHYSICAL_SIGNAL']);assert.equal(attention.score,null);
});

test('next-best evidence ranks only real eligible and attributable opportunities',()=>{
  const unknowns=[{id:'unknown:1',classification:'DECISION_BLOCKING',whatIsUnknown:'Independent corroboration'}];
  const result=deriveNextBestEvidence({unknowns,existingPhysicalFamilies:['viirs'],opportunities:[
    {id:'unknown-op',sourceFamily:'mtg',opportunityType:'UNKNOWN',authority:'STATUS_ONLY',canCloseEvidenceNeed:false},
    {id:'scheduled',sourceFamily:'sentinel3',opportunityType:'PREDICTED_ORBITAL_PASS',authority:'ORBIT:v1',windowStart:'2026-08-23T13:00:00Z',availability:'SCHEDULED_CONFIRMED',canCloseEvidenceNeed:true},
    {id:'same-family',sourceFamily:'viirs',opportunityType:'CONFIRMED_PROVIDER_PRODUCT',authority:'PRODUCT:p1',availability:'AVAILABLE_NOW',canCloseEvidenceNeed:true}
  ]});
  assert.equal(result.candidates.length,2);assert.equal(result.candidates[0].candidateId,'same-family');assert.equal(result.candidates[1].independent,true);assert.equal(result.automaticTaskCreated,false);
});

test('source passports count negatives only with a valid opportunity and coverage contract',()=>{
  const passports=deriveSourcePassports({incident:incident([observation('o1','viirs')]),opportunities:[{id:'op1',sourceFamily:'viirs',opportunityType:'CONFIRMED_PROVIDER_PRODUCT',authority:'PRODUCT:p1'}],opportunityResults:[{opportunityId:'op1',coverageContractValid:false,outcome:'NO_QUALIFYING_OBSERVATION'}],sourceState:{viirs:{state:'healthy'}},asOf:NOW});
  assert.equal(passports[0].measuredQuantities.validCoveredNegativeResults,0);assert.equal(passports[0].performanceState,'INSUFFICIENT_SAMPLE');
  const unmeasured=deriveSourcePassports({incident:{id:'i',observations:[]},sourceState:{sentinel3:{state:'healthy'}},asOf:NOW});assert.equal(unmeasured[0].performanceState,'UNMEASURED');
});

test('TDT unreached stages and durations remain null rather than zero',()=>{
  const tdt=deriveTimeToDefensibleTruth({incident:incident([observation('o1','viirs')]),generatedAt:NOW});
  const corroboration=tdt.stages.find((item)=>item.stage==='FIRST_INDEPENDENT_PHYSICAL_CORROBORATION'),ack=tdt.stages.find((item)=>item.stage==='FIRST_OPERATOR_ACKNOWLEDGEMENT');
  assert.equal(corroboration.timestamp,null);assert.equal(corroboration.durationFromPreviousMs,null);assert.equal(ack.timestamp,null);assert.equal(ack.durationFromPreviousMs,null);
});

test('TDT corroboration follows operator-visible order and evidence-gap closure follows its governed delta',()=>{
  const first=observation('o1','viirs','2026-08-23T10:00:00.000Z',{visibleAt:'2026-08-23T11:00:00.000Z'}),second=observation('o2','sentinel3','2026-08-23T10:30:00.000Z',{visibleAt:'2026-08-23T10:31:00.000Z'}),tdt=deriveTimeToDefensibleTruth({incident:incident([first,second]),decisionDelta:[{id:'delta:closed',type:'EVIDENCE_NEED_RESOLVED',at:'2026-08-23T11:05:00.000Z'}],generatedAt:NOW});
  assert.equal(tdt.stages.find((item)=>item.stage==='FIRST_INDEPENDENT_PHYSICAL_CORROBORATION').timestamp,'2026-08-23T11:00:00.000Z');assert.equal(tdt.stages.find((item)=>item.stage==='EVIDENCE_GAP_CLOSURE').sourceEvent,'delta:closed');
});

test('decision delta separates external facts, projection changes, source changes, and human decisions',()=>{
  const current=incident([observation('o1','viirs')]),situation=deriveSituation({incident:current,asOf:NOW}),previous={generatedAt:'2026-08-23T11:00:00Z',inputEvidenceIds:[],situation:{underlyingState:'REPORT_ONLY_INCIDENT'},sourceStateVersion:'sha256:old',inputEvidenceNeedIds:[]};
  const rows=deriveDecisionDelta({previous,incident:current,situation,sourceStateHash:'sha256:new',operatorDecisions:[{decisionId:'d1',decisionType:'ASSESSMENT_ACKNOWLEDGED',createdAt:'2026-08-23T11:30:00Z'}],generatedAt:NOW});
  assert.ok(rows.some((item)=>item.type==='NEW_PHYSICAL_OBSERVATION'&&item.externalFact));assert.ok(rows.some((item)=>item.type==='RECOMPUTED_PROJECTION'&&!item.externalFact));assert.ok(rows.some((item)=>item.type==='SOURCE_STATE_CHANGE'));assert.ok(rows.some((item)=>item.type==='HUMAN_DECISION'&&item.humanDecision));
});

test('hindsight firewall excludes every future-visible record',()=>{
  const result=hindsightSafeInputs({incident:{...incident([observation('past','viirs','2026-08-23T10:00:00Z'),observation('future','sentinel3','2026-08-23T13:00:00Z')]),physicalState:{freshness:'current'},contradictions:[{id:'future-conflict',visibleAt:'2026-08-23T13:30:00Z'}],corrections:[{id:'future-correction',createdAt:'2026-08-23T13:15:00Z'}]},sourceState:{viirs:{state:'healthy',updatedAt:'2026-08-23T11:00:00Z'},sentinel3:{state:'failed',updatedAt:'2026-08-23T13:00:00Z'}},operatorDecisions:[{decisionId:'future-d',createdAt:'2026-08-23T14:00:00Z'}]},NOW);
  assert.deepEqual(result.incident.observations.map((item)=>item.id),['past']);assert.deepEqual(result.operatorDecisions,[]);assert.deepEqual(result.incident.contradictions,[]);assert.equal('physicalState' in result.incident,false);assert.deepEqual(Object.keys(result.sourceState),['viirs']);assert.ok(result.futureEvidenceExcluded.some((item)=>item.id==='future-correction'));
});

test('kernel output is deterministic, version-bound, evidence-bound, and never evidence',()=>{
  const input={incident:incident([observation('o1','viirs')]),sourceState:{viirs:{state:'healthy'}},evidenceNeeds:[],evidenceRequests:[],opportunities:[],operatorDecisions:[],generatedAt:NOW,asOf:NOW};
  const first=projectIncidentIntelligence(input),second=projectIncidentIntelligence(structuredClone(input));
  assert.deepEqual(first,second);assert.equal(first.intelligenceIsEvidence,false);assert.equal(first.automaticHumanDecision,false);assert.equal(first.ruleSetVersion,RULE_SET_VERSION);assert.match(first.evidenceGraphHash,/^sha256:/);assert.match(first.explanationTrace.explanationHash,/^sha256:/);
  const changed=projectIncidentIntelligence({...input,incident:{...input.incident,lifeSafetyRelevance:true}});assert.notEqual(changed.inputHash,first.inputHash);assert.equal(changed.attention.tier,'P1');
});

test('snapshot identity covers every decision-driving collection, FieldNet state, corrections, and the governed live clock',()=>{
  const base={incident:incident([observation('o1','viirs')]),sourceState:{viirs:{state:'healthy',updatedAt:NOW}},evidenceNeeds:[{id:'need:1',state:'OPEN',decisionImpact:'blocks dispatch',createdAt:NOW}],evidenceRequests:[{id:'request:1',state:'OPEN',dueAt:'2026-08-23T13:00:00Z',ownerId:'operator:1',requirements:['thermal']}],opportunities:[{id:'op:1',sourceFamily:'sentinel3',authority:'ORBIT:v1',availability:'SCHEDULED_CONFIRMED'}],opportunityResults:[{id:'result:1',opportunityId:'op:1',outcome:'NO_QUALIFYING_OBSERVATION',coverageContractValid:true}],operatorDecisions:[],fieldNetState:{lastReconciledAt:NOW,counts:{mutations:1},openConflicts:0},corrections:[{id:'correction:1',state:'APPLIED',createdAt:NOW}],generatedAt:NOW};
  const first=projectIncidentIntelligence(base),changes=[
    {...base,evidenceNeeds:[{...base.evidenceNeeds[0],decisionImpact:'blocks evacuation'}]},
    {...base,evidenceRequests:[{...base.evidenceRequests[0],ownerId:'operator:2'}]},
    {...base,opportunities:[{...base.opportunities[0],availability:'CANCELLED'}]},
    {...base,opportunityResults:[{...base.opportunityResults[0],outcome:'QUALIFYING_OBSERVATION'}]},
    {...base,fieldNetState:{...base.fieldNetState,lastReconciledAt:'2026-08-23T12:01:00Z'}},
    {...base,corrections:[{...base.corrections[0],state:'SUPERSEDED'}]},
    {...base,generatedAt:'2026-08-23T12:01:00Z'}
  ];
  for(const changed of changes)assert.notEqual(projectIncidentIntelligence(changed).inputStateHash,first.inputStateHash);
  const cached=projectIncidentIntelligence({...base,generatedAt:'2026-08-23T12:00:30Z',previousSnapshot:first});assert.equal(cached,first);
  const changed=projectIncidentIntelligence({...base,evidenceNeeds:[{...base.evidenceNeeds[0],decisionImpact:'changed'}],previousSnapshot:first}),reverted=projectIncidentIntelligence({...base,previousSnapshot:changed});assert.notEqual(reverted.inputHash,first.inputHash);assert.notEqual(reverted.snapshotVersion,first.snapshotVersion);
});

test('operator decisions bind exact principal, capability, snapshot, graph, and bounded hostile text',()=>{
  const actor={id:'operator:1',agencyId:'agency:pt',authentication:{authenticated:true}},decision=createOperatorDecision({incidentId:'incident:1',snapshotVersion:'snap:1',evidenceGraphVersion:'graph:1',authoritativeInputGeneration:7,decisionType:'ASSESSMENT_ACKNOWLEDGED',selectedOption:'REVIEWED',reasonCode:'EVIDENCE_REVIEWED',note:'<img src=x onerror=alert(1)>'},actor,NOW);
  assert.equal(decision.capability,'review:incident');assert.equal(decision.note,'<img src=x onerror=alert(1)>');assert.match(decision.bindingHash,/^sha256:/);assert.throws(()=>createOperatorDecision({...decision,note:'x'.repeat(501)},actor,NOW),/note_too_long/);
  assert.throws(()=>createOperatorDecision({...decision,selectedOption:' '},actor,NOW),/option_required/);
});

test('bounded queue coalesces one incident without starving another',async()=>{
  const processed=[],queue=new IncidentProjectionQueue({worker:async(id,version)=>{processed.push([id,version]);await new Promise((resolve)=>setImmediate(resolve));},maxQueued:4});
  queue.enqueue('a','v1');queue.enqueue('a','v2');queue.enqueue('b','v1');
  while(queue.status().active||queue.status().queued)await new Promise((resolve)=>setImmediate(resolve));
  assert.ok(processed.some(([id])=>id==='a'));assert.ok(processed.some(([id])=>id==='b'));assert.ok(queue.status().coalesced>=1);
});
