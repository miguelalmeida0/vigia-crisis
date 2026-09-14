import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationalTruthProjection, OperationalRecoveryService } from '../src/modules/operator/operational-recovery-service.mjs';

const at='2026-09-03T12:00:00.000Z';

test('read projection selects only its input collections without changing the recovery result',async()=>{
  const state={sourceResolutionJobs:[],certifiedActionOutcomeChains:[{chainId:'test',universe:'CERTIFIED_REPLAY'}],protectionWorkflows:[{workflowId:'test'}],materialEventAcknowledgements:[],humanAttentionWorkStates:[]};
  const full=new OperationalRecoveryService({repository:{snapshot:()=>structuredClone(state)},clock:()=>new Date(at)});
  const selected=new OperationalRecoveryService({repository:{snapshot(){throw Error('Unrelated state must not be cloned');},snapshotFields(fields){assert.deepEqual(fields.sort(),Object.keys(state).sort());return structuredClone(state);}},clock:()=>new Date(at)});
  const twin={incidents:[],sourceHealth:{sources:[]}};
  assert.deepEqual(await selected.project(twin),await full.project(twin));
});
const incident=(id,updatedAt,{verified=false,status='OPEN',need=false}={})=>({
  fireActivityEvents:[{id:'fire:'+id,eventType:'wildfire.official_alert',source:{sourceId:'official-fixture',familyClass:'OFFICIAL'},clocks:{observedAt:updatedAt,ingestedAt:updatedAt},payload:{officialIncidentStatus:status==='CLOSED'?'EXTINGUISHED':'ACTIVE'}}],
  incident:{id,label:id,status,updatedAt,location:{coordinate:[-8,40]}},
  claim:{validTime:{to:updatedAt}},
  evaluation:{state:verified?'SATISFIED':'INSUFFICIENT_EVIDENCE',requirementsSatisfied:verified},
  evidenceGraph:{observations:[{id:`observation:${id}`,observedAt:updatedAt}],evidence:[]},
  evidenceDebt:{needs:need?[{id:`need:${id}`,missingQuantity:'wildfire.official-corroboration',reason:'Official corroboration is required.',whyItMatters:'Verification changes operational admission.',eligibility:{requiredSourceFamilyClasses:['OFFICIAL']}}]:[]}
});

test('operational truth has one governed classification and only verified-current counts as active',()=>{
  const twin={incidents:[incident('verified','2026-09-03T11:00:00.000Z',{verified:true}),incident('candidate','2026-09-03T10:00:00.000Z'),incident('stale','2026-08-30T10:00:00.000Z'),incident('closed','2026-08-30T10:00:00.000Z',{status:'CLOSED'})]};
  const truth=buildOperationalTruthProjection(twin,{at});
  assert.deepEqual(truth.counts,{VERIFIED_CURRENT:1,DETECTION_CANDIDATE:1,NEEDS_REVALIDATION:1,HISTORICAL_CLOSED:1});
  assert.equal(truth.activeCount,1);assert.equal(truth.needsAttentionCount,2);assert.equal(truth.governedOperationalSubsetCount,1);assert.equal(truth.geolocation.percent,100);assert.equal(truth.incidents.filter(row=>row.countsAsActive).length,1);assert.equal(truth.zeroContradictions,true);
});

test('verified evidence without a governed location remains outside active truth',()=>{
  const row=incident('unlocated','2026-09-03T11:00:00.000Z',{verified:true});delete row.incident.location;
  const truth=buildOperationalTruthProjection({incidents:[row]},{at});
  assert.equal(truth.counts.DETECTION_CANDIDATE,1);assert.equal(truth.activeCount,0);assert.equal(truth.governedOperationalSubsetCount,0);assert.equal(truth.geolocation.state,'NO_VERIFIED_CURRENT_DENOMINATOR');
});

test('source resolver persists identified ownership and certified replay remains isolated',async()=>{
  let state={sourceResolutionJobs:[],certifiedActionOutcomeChains:[],protectionWorkflows:[]};
  const repository={snapshot:()=>structuredClone(state),async mutate(mutator){state=mutator(structuredClone(state));return structuredClone(state);}};
  const twin={incidents:[incident('candidate','2026-09-03T10:00:00.000Z',{need:true})],sourceHealth:{sources:[{sourceId:'cap-authority',status:'STALE'}]}};
  const service=new OperationalRecoveryService({repository,projectRoot:process.cwd(),clock:()=>new Date(at)}),result=await service.synchronize(twin),job=result.sourceResolution.jobs[0],chain=result.certifiedOutcomeChains[0];
  assert.equal(result.sourceResolution.summary.total,1);assert.equal(result.sourceResolution.summary.identifiedSourcePercent,100);assert.equal(job.selectedSourceId,'cap-authority');assert.equal(job.owner.id,'vigia-source-resolution-scheduler');assert.equal(job.attemptCount,1);assert.ok(job.nextCheckAt);assert.ok(job.deadlineAt);assert.ok(job.escalation.condition);assert.ok(job.unlockCondition);assert.ok(job.completionCriteria);
  assert.equal(chain.universe,'CERTIFIED_REPLAY');assert.equal(chain.productionTruth,false);assert.equal(chain.externalSendEnabled,false);assert.equal(chain.outcomeClassification.causalProtectionOutcome,'NOT_MEASURED');assert.equal(state.sourceResolutionJobs.length,1);assert.equal(state.certifiedActionOutcomeChains.length,1);
  assert.equal(result.protectWorkflow.universe,'CERTIFIED_REPLAY');assert.equal(result.protectWorkflow.dispatch.state,'NOT_SENT');assert.equal(result.protectWorkflow.authority.state,'NO_LIVE_AUTHORITY');assert.equal(result.protectWorkflow.safetyProof.exerciseDataMixedIntoProduction,false);assert.equal(state.protectionWorkflows.length,1);
});

test('recovery synchronization preserves a protection workflow committed during provider acquisition',async()=>{
  const foregroundWorkflow={workflowId:'protect:foreground',incidentId:'incident:candidate',universe:'EXERCISE',state:'DRAFT'};
  let state={sourceResolutionJobs:[],certifiedActionOutcomeChains:[],protectionWorkflows:[],operationalRecovery:null},snapshotTaken=false;
  const repository={
    snapshot(){snapshotTaken=true;return structuredClone(state);},
    async mutate(mutator){state=await mutator(structuredClone(state));return structuredClone(state);}
  };
  const router={
    strategy(){return{strategyId:'test',providerInstance:'test',acquisitionMode:'TEST',query:{incidentId:'candidate',requirementId:'need:candidate'}};},
    async acquire(){assert.equal(snapshotTaken,true);state={...state,protectionWorkflows:[foregroundWorkflow]};return new Map();},
    evaluateCandidates(){return{state:'NO_COVERAGE',matches:[],providerAttempts:[]};}
  };
  const twin={incidents:[incident('candidate','2026-09-03T10:00:00.000Z',{need:true})],sourceHealth:{sources:[{sourceId:'cap-authority',status:'STALE'}]}};
  await new OperationalRecoveryService({repository,projectRoot:'/definitely/missing',clock:()=>new Date(at),sourceResolutionRouter:router}).synchronize(twin);
  assert.deepEqual(state.protectionWorkflows,[foregroundWorkflow]);
});

test('source resolver opens its circuit after bounded attempts and retains a scheduled probe',async()=>{
  let state={sourceResolutionJobs:[],certifiedActionOutcomeChains:[],protectionWorkflows:[]};
  const repository={snapshot:()=>structuredClone(state),async mutate(mutator){state=mutator(structuredClone(state));return structuredClone(state);}};
  const twin={incidents:[incident('candidate','2026-09-03T10:00:00.000Z',{need:true})],sourceHealth:{sources:[{sourceId:'cap-authority',status:'STALE'}]}};
  for(let attempt=0;attempt<12;attempt+=1){const current=new Date(Date.parse(at)+attempt*5*60_000);const service=new OperationalRecoveryService({repository,projectRoot:process.cwd(),clock:()=>current});await service.synchronize(twin);state.sourceResolutionJobs[0].nextCheckAt=current.toISOString();}
  const result=await new OperationalRecoveryService({repository,projectRoot:process.cwd(),clock:()=>new Date('2026-09-03T13:00:00.000Z')}).synchronize(twin),job=result.sourceResolution.jobs[0];
  assert.equal(job.circuitBreaker.state,'OPEN');assert.equal(job.state,'ESCALATED_CIRCUIT_OPEN');assert.equal(job.retryPolicy.circuitOpenProbeMinutes,60);assert.ok(Date.parse(job.nextCheckAt)>Date.parse(job.lastCheckAt));
});
