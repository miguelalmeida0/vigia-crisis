import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectIncidentIntelligence } from '../src/intelligence/kernel.mjs';
import { deriveDecisionDelta } from '../src/intelligence/delta.mjs';

const NOW='2026-08-23T12:00:00.000Z',past='2026-08-23T11:50:00.000Z',stale='2026-08-22T01:00:00.000Z';
const physical=(id,family,at=past)=>({id,type:'thermal',sourceFamily:family,independenceGroup:family,at,receivedAt:at});
const report=(id,at=past)=>({id,type:'report',sourceFamily:'public_report',at,receivedAt:at});
const base=(id,observations,extra={})=>({incident:{id,observations,physicalState:{freshness:'current'},...extra},evidenceNeeds:[],evidenceRequests:[],opportunities:[],opportunityResults:[],sourceState:{},operatorDecisions:[],generatedAt:NOW,asOf:NOW});

test('evaluation cohorts are split before held-out inspection and reference real governed history',async()=>{const cohort=JSON.parse(await readFile(new URL('../../../data/validation/intelligence-fabric/evaluation-cohorts-v1.json',import.meta.url)));assert.equal(cohort.development.length,7);assert.equal(cohort.heldOut.length,7);assert.equal(cohort.development.filter(id=>cohort.heldOut.includes(id)).length,0);assert.ok(cohort.realHistoricalReferences.every(item=>item.authority.includes('ICNF')));assert.match(cohort.promotionLaw,/new rule-set version/);});

test('held-out situation cohort preserves report, family, contradiction, and stale boundaries',()=>{const rows=[
  [base('report',[report('r1')],{physicalState:{freshness:'unobserved'},reportState:{freshness:'current'}}),'REPORT_ONLY_INCIDENT'],
  [base('one',[physical('p1','viirs')]),'SINGLE_FAMILY_PHYSICAL_SIGNAL'],
  [base('two',[physical('p1','viirs'),physical('p2','sentinel3_slstr')]),'MULTI_FAMILY_PHYSICAL_SUPPORT'],
  [base('conflict',[physical('p1','viirs')],{contradictions:[{id:'contradiction:1'}]}),'PHYSICAL_REPORT_CONFLICT'],
  [base('stale',[physical('p1','viirs',stale)],{physicalState:{freshness:'stale'}}),'STALE_PHYSICAL_EVIDENCE']
];for(const[input,expected]of rows)assert.equal(projectIncidentIntelligence(input).situation.underlyingState,expected);});

test('source opportunity cohort separates healthy zero observation from provider failure',()=>{const input=base('source',[physical('p1','viirs')]);input.sourceState={sentinel3_slstr:{state:'healthy'},viirs:{state:'degraded'}};input.opportunities=[{id:'op:1',sourceFamily:'sentinel3_slstr',opportunityType:'CONFIRMED_PROVIDER_PRODUCT',authority:'PRODUCT:v1'}];input.opportunityResults=[{opportunityId:'op:1',coverageContractValid:true,outcome:'NO_QUALIFYING_OBSERVATION'}];const result=projectIncidentIntelligence(input),healthy=result.sourceContext.find(item=>item.sourceFamily==='sentinel3_slstr'),degraded=result.sourceContext.find(item=>item.sourceFamily==='viirs');assert.equal(healthy.providerHealth,'HEALTHY');assert.equal(healthy.measuredQuantities.validCoveredNegativeResults,1);assert.equal(healthy.performanceState,'INSUFFICIENT_SAMPLE');assert.equal(degraded.providerHealth,'DEGRADED');assert.ok(result.attention.reasons.includes('SOURCE_DEGRADATION'));});

test('open versus resolved evidence needs change unknown state and input identity',()=>{const input=base('need',[physical('p1','viirs')]);input.evidenceNeeds=[{id:'need:1',subjectId:'need',state:'OPEN',missingQuantity:'independent_corroboration',blocksDecisionState:true,strongerClaim:'MULTI_FAMILY_PHYSICAL_SUPPORT'}];const open=projectIncidentIntelligence(input);input.evidenceNeeds[0].state='RESOLVED';input.evidenceNeeds[0].resolvedAt=NOW;const resolved=projectIncidentIntelligence({...input,previousSnapshot:open});assert.notEqual(open.inputHash,resolved.inputHash);assert.equal(resolved.unknowns.some(item=>item.kind==='EVIDENCE_NEED'),false);assert.ok(resolved.decisionDelta.some(item=>item.type==='EVIDENCE_NEED_RESOLVED'));});

test('association correction and FieldNet reconciliation remain distinct decision deltas',()=>{const previous={generatedAt:'2026-08-23T11:00:00.000Z',incidentAssociation:{state:'AMBIGUOUS'},inputCorrectionIds:[],inputEvidenceNeedIds:[],inputEvidenceNeeds:[],inputEvidenceIds:[],fieldNetState:{lastReconciledAt:'2026-08-23T10:00:00.000Z'}},incident={id:'delta',observations:[],association:{state:'CONFIRMED'}},rows=deriveDecisionDelta({previous,incident,situation:{underlyingState:'INSUFFICIENT_EVIDENCE',supportingEvidenceIds:[]},corrections:[{id:'correction:1',reasonCode:'ASSOCIATION_CONFIRMED',createdAt:NOW}],fieldNetState:{lastReconciledAt:NOW},generatedAt:NOW});assert.ok(rows.some(item=>item.type==='ASSOCIATION_CHANGE'));assert.ok(rows.some(item=>item.type==='CORRECTION'));assert.ok(rows.some(item=>item.type==='FIELDNET_RECONCILIATION'));assert.ok(rows.every(item=>item.humanDecision===false));});

test('historical later-report cohort has deterministic output and stable explanation trace',()=>{const input=base('history',[physical('past','viirs','2026-08-23T10:00:00.000Z')]);input.mode='HISTORICAL_REPLAY';input.asOf='2026-08-23T10:30:00.000Z';input.generatedAt=input.asOf;input.futureEvidenceExcluded=[{id:'later-report',reason:'VISIBLE_AFTER_REPLAY_CLOCK'}];const first=projectIncidentIntelligence(input),second=projectIncidentIntelligence(structuredClone(input));assert.deepEqual(first,second);assert.equal(first.situation.state,'HISTORICAL_REHEARSAL_CASE');assert.deepEqual(first.explanationTrace.excludedEvidence,[{id:'later-report',reason:'VISIBLE_AFTER_REPLAY_CLOCK'}]);assert.equal(first.projectionHash,second.projectionHash);});
