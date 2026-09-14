import test from 'node:test';
import assert from 'node:assert/strict';
import { PreventionFindingService } from '../src/modules/prevention/prevention-finding-service.mjs';

function repository(){let state={preventionFindings:[],detectorRuns:[],preventionReviews:[],evidenceNeeds:[],evidenceRequests:[]};return{snapshot:()=>structuredClone(state),mutate:async(fn)=>{state=fn(structuredClone(state));return structuredClone(state);}};}
function reviewableFinding(){return{findingId:'finding-1',detectorVersion:'fuel-v1',currentObservationId:'s2-current',comparisonObservationId:'s2-prior',geometry:{type:'Polygon',coordinates:[[[-8,37],[-7.99,37],[-7.99,37.01],[-8,37]]]},affectedAreaHa:1.1,corridorLengthM:220,nearestStructureM:18,structuresWithinPolicyRadius:2,sourceQuality:{state:'PIXEL_VERIFIED'},landCoverContext:{state:'UNMEASURED'},firstObservableInterval:{start:'2025-08-06T11:30:00Z',end:'2026-08-08T11:31:00Z'}};}
const globalActor=(id='operator-1',extra={})=>({id,role:'supervisor',incidentScopes:['*'],...extra});

test('real detector output becomes a durable screening finding and owned evidence work',async()=>{
  const repo=repository(),audits=[];
  const service=new PreventionFindingService({repository:repo,clock:()=>new Date('2026-08-11T00:00:00Z'),auditService:{record:async(value)=>audits.push(value)},geospatialAnalysisService:{screenChange:async()=>({state:'screened',calibrationState:'unvalidated_screening',validFraction:.94,findings:[{kind:'fuel_continuity_change_candidate',areaM2:11185.7,corridorLengthM:218,nearestStructureM:15.8,structuresWithin150m:2,geometry:{type:'Polygon',coordinates:[[[-8,37],[-7.99,37],[-7.99,37.01],[-8,37.01],[-8,37]]]}}],observations:{current:{id:'s2-2026',acquiredAt:'2026-08-08T11:31:00Z',cloudCover:.1,resolutionMeters:10,bindingHash:'current-hash'},comparison:{id:'s2-2025',acquiredAt:'2025-08-06T11:30:00Z',cloudCover:16,resolutionMeters:10,bindingHash:'prior-hash'}},exposure:{state:'current',provider:'OpenStreetMap via Overpass',assets:[]},integrity:{primary:'current-hash',comparable:'prior-hash'},provenance:{algorithmVersion:'fuel_continuity_change_screen_v1'}})}});
  const result=await service.runFuelContinuity(globalActor(),{coordinate:[-8.0202,37.1397],radiusKm:3});
  assert.equal(result.findings.length,1);
  assert.equal(repo.snapshot().preventionFindings[0].calibrationState,'SCREENING_CANDIDATE');
  assert.equal(repo.snapshot().evidenceNeeds[0].subjectType,'prevention_finding');
  assert.equal(repo.snapshot().evidenceRequests[0].ownerId,'operator-1');
  assert.equal(result.findings[0].attentionPriority.scoreKind,'ATTENTION_PRIORITY_NOT_PROBABILITY');
  assert.equal(result.findings[0].roadCrossings,null);
  assert.match(result.findings[0].rationale.whyItMatters,/mapped structures/);
  assert.equal(audits.length,1);
  const persisted=service.screeningSnapshot({primaryId:'s2-2026',comparableId:'s2-2025'},globalActor());
  assert.equal(persisted.persisted,true);
  assert.equal(persisted.provenance.runId,result.run.id);
  assert.equal(persisted.findings[0].id,result.findings[0].findingId);
  assert.deepEqual(persisted.viewportBbox,[-8,37,-7.99,37.01]);
  const observation=service.observationSnapshot({primaryId:'s2-2026',comparableId:'s2-2025'},globalActor());
  assert.equal(observation.primary.id,'s2-2026');
  assert.equal(observation.comparable.id,'s2-2025');
  assert.equal(observation.changeScreening.eligible,true);
  assert.equal(observation.primary.evidenceBinding.pixelVerified,true);
});

test('developer review is durable but cannot be reported as expert precision',async()=>{
  const repo=repository(),audits=[];
  await repo.mutate((state)=>({...state,preventionFindings:[reviewableFinding()]}));
  const service=new PreventionFindingService({repository:repo,clock:()=>new Date('2026-08-12T08:00:00Z'),auditService:{record:async(value)=>audits.push(value)},geospatialAnalysisService:{}});
  const result=await service.review(globalActor(),'finding-1',{decision:'ABSTAIN',reason:'INSUFFICIENT_RESOLUTION',note:'Native evidence is not sufficient for a decision.'});
  assert.equal(result.review.reviewerType,'DEVELOPER_REVIEW');
  assert.equal(result.validation.developerReviewCount,1);
  assert.equal(result.validation.domainExpertReviewCount,0);
  assert.equal(result.validation.candidatePrecision,null);
  assert.equal(service.find('finding-1').reviewSummary.developer,1);
  assert.equal(audits[0].type,'prevention.finding.reviewed');
});

test('domain-expert labels require an explicit reviewer qualification',async()=>{
  const repo=repository();
  await repo.mutate((state)=>({...state,preventionFindings:[reviewableFinding()]}));
  const service=new PreventionFindingService({repository:repo,clock:()=>new Date('2026-08-12T08:00:00Z'),auditService:{record:async()=>{}},geospatialAnalysisService:{}});
  const input={reviewerType:'DOMAIN_EXPERT_REVIEW',decision:'ACCEPT_CANDIDATE',reason:'TRUE_FUEL_CONTINUITY_CHANGE'};
  await assert.rejects(()=>service.review(globalActor(),'finding-1',input),(error)=>error.statusCode===403&&error.message==='domain_expert_qualification_required');
  const result=await service.review(globalActor('expert-1',{qualifications:['wildfire_prevention_domain_expert']}),'finding-1',input);
  assert.equal(result.validation.candidatePrecision,1);
  assert.equal(result.validation.precisionBasis,'DOMAIN_EXPERT_REVIEW');
  assert.deepEqual(result.review.reviewerQualifications,['wildfire_prevention_domain_expert']);
  assert.deepEqual(result.review.scenePair,{currentObservationId:'s2-current',comparisonObservationId:'s2-prior'});
});

test('zero-output runs distinguish a valid negative screen from a detector abstention',async()=>{
  const actor=globalActor();
  const execute=async(reason)=>{
    const repo=repository();
    const service=new PreventionFindingService({repository:repo,clock:()=>new Date('2026-08-12T08:00:00Z'),auditService:{record:async()=>{}},geospatialAnalysisService:{screenChange:async()=>({state:'screened',reason,findings:[],observations:{current:{id:`current-${reason}`},comparison:{id:`prior-${reason}`}}})}});
    return service.runFuelContinuity(actor,{coordinate:[-8,37]});
  };
  const negative=await execute('no_fuel_continuity_candidate');
  assert.equal(negative.run.state,'screened_no_candidate');
  assert.equal(negative.run.abstentionReason,null);
  const abstained=await execute('mapped_structure_points_required');
  assert.equal(abstained.run.state,'abstained');
  assert.equal(abstained.run.abstentionReason,'mapped_structure_points_required');
});

test('global prevention reads and mutations fail closed for narrow actors',async()=>{
  const repo=repository(),service=new PreventionFindingService({repository:repo,clock:()=>new Date('2026-08-12T08:00:00Z'),auditService:{record:async()=>{}},geospatialAnalysisService:{screenChange:async()=>({state:'screened',reason:'no_fuel_continuity_candidate',findings:[],observations:{current:{id:'current'},comparison:{id:'prior'}}})}}),narrow={id:'analyst-1',role:'analyst',incidentScopes:['PT-A']};
  assert.throws(()=>service.snapshot(narrow),(error)=>error.statusCode===403&&error.message==='incident_scope_forbidden');
  assert.throws(()=>service.screeningSnapshot({primaryId:'current',comparableId:'prior'}),(error)=>error.statusCode===403&&error.message==='incident_scope_forbidden');
  assert.throws(()=>service.observationSnapshot({primaryId:'current',comparableId:'prior'},narrow),(error)=>error.statusCode===403&&error.message==='incident_scope_forbidden');
  await assert.rejects(()=>service.runFuelContinuity(narrow,{coordinate:[-8,37]}),(error)=>error.statusCode===403&&error.message==='incident_scope_forbidden');
  assert.deepEqual(repo.snapshot().detectorRuns,[]);
});
