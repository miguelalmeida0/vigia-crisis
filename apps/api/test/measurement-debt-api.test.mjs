import test from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '../src/http/router.mjs';
import { registerMeasurementDebtRoutes } from '../src/modules/validation/measurement-debt-routes.mjs';

function responseCapture() {
  return { statusCode: null, headers: null, body: null, writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(payload) { this.body = payload ? JSON.parse(payload) : null; } };
}
const assessments=Array.from({length:11},(_,index)=>({finding_id:`finding-${index+1}`,claim_state:'INSUFFICIENT_EVIDENCE',legacy_claim_state:'INSUFFICIENT',exact_breakpoint_emitted:false,workflow:{disposition:'MEASUREMENT_REQUIRED',interventionReviewEligible:false},geometry:null,intervention_geometry:null,measurement_support_geometry:{type:'MultiPolygon',coordinates:[]},measurement_plan:{id:`plan-${index+1}`},evidence_debt:{id:`debt-${index+1}`,current_state:'OPEN'},claim_level:{level:1},graph_ensemble:{member_count:2,graph_realizations:2}}));
const handoff={schemaVersion:'vigia.measurement-debt-handoff.v1',generatedAt:'2026-08-25T00:00:00.000Z',evidenceDebtItems:Array.from({length:9},(_,index)=>({id:`debt-${index+1}`,current_state:index<5?'MEASURED':'OPEN',system_resolvable:index>=5,watch_state:'IDLE',field_required:false,closure_contract:{type:'FIXTURE_CONTRACT'},measurement_method:{type:'FIXTURE_METHOD'}})),measurementPlans:[],campaigns:[],preventMetrics:{denominatorFindings:11,landCover:{measured:11},threshold:{measured:11},expertValidation:{labels:0,precision:null}},referenceProductIntegrity:{archivedFamilies:3,denominatorFamilies:5},stabilityMetrics:{},negativeControls:{falseCandidateRate:null,specificity:null},retrospectiveAlignment:{denominator:0},matchedTemporalControl:{},claimLevels:[],falseNegativeClusters:{cases:18,taxonomy:{LOW_NATIVE_SIGNAL:{count:7},STATIC_HEAT_CONTEXT_ERROR:{count:11}},recovery:{RECOVERABLE_WITH_CURRENT_DATA:{count:7},REQUIRES_NEW_SENSING:{count:11}},v5Attempted:false},scientificClaimBoundary:'Engineering measurements do not authorize intervention.',evidenceHash:`sha256:${'1'.repeat(64)}`,artifactEvidenceHash:`sha256:${'2'.repeat(64)}`};
const consensus={schemaVersion:'vigia.consensus-topology-evaluation.v2',generatedAt:'2026-08-25T00:00:00.000Z',assessments,promotionContract:{policyHash:`sha256:${'3'.repeat(64)}`},consensusTopology:{claimStates:{INSUFFICIENT_EVIDENCE:11},workflowDispositions:{MEASUREMENT_REQUIRED:11},interventionReviewCandidates:0,measurementRequired:11},frozenEvaluation:{aggregate:{promotion_decision:'DO_NOT_PROMOTE'},rows:[]},scientificClaimBoundary:handoff.scientificClaimBoundary,evidenceHash:`sha256:${'4'.repeat(64)}`};
const falseNegativeRecovery={schemaVersion:'vigia.false-negative-recovery-program.v1',falseNegativeDenominator:18,recoverableWithCurrentData:{denominator:7},recoverableClusterEvaluation:{coherentDevelopmentClusters:[{cases:4}],rejectedCurrentDataHypotheses:[{cases:3}]},sensingLimited:{denominator:11,sensingGapClasses:{SUBPIXEL_LOW_RADIANCE:{supported:11},TEMPORAL_REVISIT:{supported:11},CLOUD_QUALITY:{supported:0}}},v5:{attempted:false,decision:'NOT_SCIENTIFICALLY_JUSTIFIED'}};
const scienceHandoff={zones:{denominator:11,claimStates:{ROBUST_INTERVENTION_ZONE:0},interventionReviewCandidates:0,measurementRequired:11},evidenceDebtAutoclosure:{resolved:5},conflictResolution:{plans:[{},{}]},fieldSensorGate:{state:'HARDWARE_NOT_PRESENT'},liveAlertPerformance:{chainIntegrity:{state:'VERIFIED'},summary:{eligiblePhysicalEvents:0,liveOutcomes:0},windows:[{label:'LAST_24_HOURS',metrics:{physicalCandidates:{value:0}}}]},prospectiveOutcomes:{liveOutcomeCount:0},evidenceHash:`sha256:${'5'.repeat(64)}`};
const scienceRescue={schemaVersion:'vigia.prevent-science-rescue-handoff.v1',criticalDelta:{before:{interventionReviewCandidates:11},after:{interventionReviewCandidates:0}},measurementAutopilot:{plans:11},agent1Integration:{required:['Render action geometry only when interventionReviewEligible is true.']}};
const files={handoff:'handoff',consensus:'consensus',falseNegativeRecovery:'falseNegativeRecovery',scienceHandoff:'scienceHandoff',scienceRescueHandoff:'scienceRescueHandoff'};
const values={handoff,consensus,falseNegativeRecovery,scienceHandoff,scienceRescueHandoff:scienceRescue};
const fixtureRoutes={files,read:async(file)=>structuredClone(values[file])};
async function request(path,{routeOptions=fixtureRoutes,expectedStatus=200}={}) {
  const router = new Router(); registerMeasurementDebtRoutes(router,routeOptions);
  const res = responseCapture();
  const handled = await router.safeHandle({ method: 'GET', url: path,headers:{origin:'http://127.0.0.1:4190','sec-fetch-site':'same-origin','x-vigia-ui-proxy':'mission-dark-realdata-2.0'},socket:{remoteAddress:'127.0.0.1'} }, res, {actor:{id:'test-operator',authentication:{authenticated:true,mode:'local_shadow_session'}}});
  assert.equal(handled, true); assert.equal(res.statusCode, expectedStatus);
  return res.body;
}

test('missing governed validation artifacts fail explicitly without fabricated evidence',async()=>{
  const body=await request('/api/v10/validation/measurement-debt',{routeOptions:{},expectedStatus:424});
  assert.equal(body.error,'validation_evidence_dependency_unavailable');
  assert.equal(body.details.state,'EVIDENCE_UNAVAILABLE');
  assert.match(body.details.qualification,/No synthetic or inferred replacement/);
});

test('measurement debt API publishes governed items, plans, and claim boundary', async () => {
  const body = await request('/api/v10/validation/measurement-debt');
  assert.equal(body.schemaVersion, 'vigia.measurement-debt-workspace.v2');
  assert.equal(body.summary.total, 9);
  assert.equal(body.summary.resolved, 5);
  assert.equal(body.consensusGeometryDebt.total, 11);
  assert.equal(body.consensusGeometryDebt.open, 11);
  assert.equal(body.items.every((item) => item.closure_contract && item.measurement_method), true);
  assert.match(body.scientificClaimBoundary, /do not authorize intervention/);
  assert.match(body.evidenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(body.artifactEvidenceHash, /^sha256:[a-f0-9]{64}$/);
});

test('PREVENT evidence API keeps unsupported performance quantities null', async () => {
  const body = await request('/api/v10/validation/prevention-machine-evidence');
  assert.equal(body.denominatorFindings, 11);
  assert.equal(body.metrics.landCover.measured, 11);
  assert.equal(body.metrics.threshold.measured, 11);
  assert.equal(body.referenceProductIntegrity.archivedFamilies, 3);
  assert.equal(body.referenceProductIntegrity.denominatorFamilies, 5);
  assert.equal(body.expertValidation.labels, 0);
  assert.equal(body.expertValidation.precision, null);
  assert.equal(body.negativeControls.falseCandidateRate, null);
  assert.equal(body.negativeControls.specificity, null);
  assert.equal(body.retrospectiveAlignment.denominator, 0);
});

test('false-negative taxonomy API exposes causal recovery classes and honest V5 decision', async () => {
  const body = await request('/api/v10/validation/false-negative-taxonomy');
  assert.equal(body.cases, 18);
  assert.equal(body.taxonomy.LOW_NATIVE_SIGNAL.count + body.taxonomy.STATIC_HEAT_CONTEXT_ERROR.count, 18);
  assert.equal(body.recovery.RECOVERABLE_WITH_CURRENT_DATA.count + body.recovery.REQUIRES_NEW_SENSING.count, 18);
  assert.equal(body.v5Attempted, false);
});

test('consensus API separates measurement support from review-eligible intervention geometry', async () => {
  const collection=await request('/api/v10/validation/prevention-consensus/zones');
  assert.equal(collection.schemaVersion,'vigia.consensus-assessment-collection.v2');
  assert.equal(collection.assessments.length,11);
  assert.equal(collection.zones.length,11);
  assert.match(collection.policyHash,/^sha256:/);
  assert.equal(collection.zones.every((zone)=>zone.exact_breakpoint_emitted===false),true);
  assert.equal(collection.summary.interventionReviewCandidates,0);
  assert.equal(collection.summary.measurementRequired,11);
  assert.equal(collection.zones.every((zone)=>zone.workflow.disposition==='MEASUREMENT_REQUIRED'),true);
  assert.equal(collection.zones.every((zone)=>zone.geometry===null&&zone.intervention_geometry===null),true);
  assert.equal(collection.zones.every((zone)=>zone.measurement_plan&&zone.evidence_debt),true);
  const item=await request(`/api/v10/validation/prevention-consensus/${collection.zones[0].finding_id}`);
  assert.equal(item.consensus.schemaVersion,'vigia.prevention-consensus-assessment.v4');
  assert.equal(item.consensus.workflow.interventionReviewEligible,false);
  assert.equal(item.consensus.interventionGeometry,null);
  assert.equal(item.consensus.measurementSupportGeometry?.type,'MultiPolygon');
  assert.equal('candidateBreakLocation' in item.consensus.zone,false);
});

test('false-negative recovery API preserves V4 without reusing frozen outcomes for tuning', async () => {
  const body=await request('/api/v10/validation/false-negative-recovery');
  assert.equal(body.falseNegativeDenominator,18);
  assert.equal(body.recoverableWithCurrentData.denominator,7);
  assert.equal(body.sensingLimited.denominator,11);
  assert.equal(body.recoverableClusterEvaluation.coherentDevelopmentClusters[0].cases,4);
  assert.equal(body.recoverableClusterEvaluation.rejectedCurrentDataHypotheses[0].cases,3);
  assert.equal(body.sensingLimited.sensingGapClasses.SUBPIXEL_LOW_RADIANCE.supported,11);
  assert.equal(body.sensingLimited.sensingGapClasses.TEMPORAL_REVISIT.supported,11);
  assert.equal(body.sensingLimited.sensingGapClasses.CLOUD_QUALITY.supported,0);
  assert.equal(body.v5.attempted,false);
  assert.equal(body.v5.decision,'NOT_SCIENTIFICALLY_JUSTIFIED');
});

test('category leadership handoff binds consensus, operations, debt, conflict, and sensor gates', async () => {
  const body=await request('/api/v10/validation/category-leadership-science-handoff');
  assert.equal(body.zones.denominator,11);
  assert.equal(body.zones.claimStates.ROBUST_INTERVENTION_ZONE??0,0);
  assert.equal(body.zones.interventionReviewCandidates,0);
  assert.equal(body.zones.measurementRequired,11);
  assert.equal(body.evidenceDebtAutoclosure.resolved,5);
  assert.equal(body.conflictResolution.plans.length,2);
  assert.equal(body.fieldSensorGate.state,'HARDWARE_NOT_PRESENT');
  const currentWindow=body.liveAlertPerformance.windows.find((item)=>item.label==='LAST_24_HOURS');
  assert.equal(body.liveAlertPerformance.chainIntegrity.state,'VERIFIED');
  assert.equal(currentWindow.metrics.physicalCandidates.value??0,body.liveAlertPerformance.summary.eligiblePhysicalEvents);
  assert.equal(body.prospectiveOutcomes.liveOutcomeCount,body.liveAlertPerformance.summary.liveOutcomes);
  assert.match(body.evidenceHash,/^sha256:/);
});

test('science rescue handoff publishes the product gating contract for Agent 1', async () => {
  const body=await request('/api/v10/validation/science-rescue-handoff');
  assert.equal(body.schemaVersion,'vigia.prevent-science-rescue-handoff.v1');
  assert.equal(body.criticalDelta.before.interventionReviewCandidates,11);
  assert.equal(body.criticalDelta.after.interventionReviewCandidates,0);
  assert.equal(body.measurementAutopilot.plans,11);
  assert.equal(body.agent1Integration.required.some((item)=>item.includes('interventionReviewEligible')),true);
});
