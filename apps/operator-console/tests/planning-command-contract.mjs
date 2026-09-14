import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crisisOperationsPlanning } from '../src/crisisOperatingSystem.js';
import './response-capability-integrity-contract.mjs';

const approvedTypes=['OPERATIONAL_PERIOD','RESOURCE_RECOMMENDATION','AUTONOMOUS_REPLAN','EVACUATION_CORRIDOR','PROTECTION_TIMELINE'];
const currentIntentHash=`command-intent:sha256:${'a'.repeat(64)}`;
const currentExpiry='2099-09-04T18:00:00.000Z';
const [appSource,actionSource]=await Promise.all([
  Promise.all(['app.js','appActionController.js','planningApplyDescriptors.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8'))).then(parts=>parts.join('\n')),
  readFile(new URL('../src/domainActions.js',import.meta.url),'utf8'),
]);
const section=(state,value)=>({state,value});
const projection={
  schemaVersion:'vigia.crisis-planning-projection.v1',generatedAt:'2026-09-04T15:00:00.000Z',
  commandIntent:section('CONFIRMED_FOR_COMPILATION',{statement:'Protect the named community.',target:'Community north',assignments:[{id:'assignment:one'},{id:'assignment:two'}],collectionRequirements:[{id:'requirement:one'}],resourceRecommendations:[{id:'resource:one'},{id:'resource:two'}],watchConditions:[{id:'watch:one'}],protectionDraft:{state:'INCOMPLETE_REVIEW_DRAFT',missingFields:['authority','nextUpdate'],liveSend:false,deliveryState:'NOT_SENT'}}),
  operationalPeriodProposal:section('READY_FOR_HUMAN_APPROVAL',{periodStart:'2026-09-04T15:00:00.000Z',periodEnd:'2026-09-04T18:00:00.000Z',objectives:[{objective:'Protect community north.',owner:'Planning lead',deadline:'2026-09-04T16:00:00.000Z'}],assignments:[{action:'Maintain an attributable watch.',owner:'Operations lead',deadline:'2026-09-04T15:30:00.000Z'}]}),
  resourceOptimizer:section('PARTIAL_RECOMMENDATION',{recommendations:[{recommendationId:'recommendation:one',facilityId:'station:one',resourceType:'WILDFIRE_CREWS',recommendedQuantity:2,availableQuantity:3,committedQuantity:1,eta:{travelTimeMinutes:18},crewStatus:{state:'ATTRIBUTABLE_CURRENT_REPORT'},stagingState:'GOVERNED_CANDIDATE',coverage:{state:'ROUTED_TIME_AVAILABLE'},tradeOffs:['Preserve residual regional coverage.']}],remainingUncoveredDemand:[{requirementId:'requirement:one',state:'PARTIAL_CAPACITY_GAP',resourceType:'WILDFIRE_CREWS',gapQuantity:1,why:'One governed crew remains uncovered.'}]}),
  autonomousReplanning:section('NEW_PLAN_READY_FOR_APPROVAL',{why:['A current resource became unavailable.'],whatChanged:[{path:'assignments.assignment:one'}],triggers:[{type:'RESOURCE_UNAVAILABLE'}],approvalState:'HUMAN_APPROVAL_REQUIRED'}),
  evacuationCorridor:section('READY_FOR_AUTHORITY_REVIEW',{recommendedCorridor:{routeId:'route:one',constraintAssessment:{assessments:[{axis:'TERRAIN',state:'CLEAR'},{axis:'WEATHER',state:'CLEAR'},{axis:'RESOURCE',state:'CLEAR'}]}},decisionDeadline:'2026-09-04T15:30:00.000Z',planningOnly:true,officialOrder:false,truthBoundary:'Planning only; no evacuation order.'}),
  protectionTimeline:section('ADMITTED_SCENARIO_WINDOWS_AVAILABLE',{windows:[{minutes:15,state:'SCENARIO_AVAILABLE',confidence:{state:'SCENARIO_CONFIDENCE'},requiredPreparation:['Prepare authority review.'],decisionDeadline:'2026-09-04T15:20:00.000Z'},{minutes:30,state:'WITHHELD',reason:'WINDOW_EVIDENCE_REFERENCES_REQUIRED'}],truthBoundary:'Only admitted evidence-computed windows are displayed.'}),
  capProtection:section('NO_LIFECYCLE_RECORD',null),multilingualProtectionComposer:section('NO_CANONICAL_MESSAGE',null),
  proposalReviewBindings:Object.fromEntries(approvedTypes.map(proposalType=>[proposalType,{state:'CURRENT_REVIEWABLE_PROPOSAL',compiledAgainstIntentHash:currentIntentHash,expiresAt:currentExpiry}])),
  planningReview:{decisions:approvedTypes.map((proposalType,index)=>({decisionId:`decision:${index}`,proposalType,state:'APPROVED_FOR_PLANNING_ONLY',mutationsApplied:false,compiledAgainstIntentHash:currentIntentHash,proposalExpiresAt:currentExpiry}))},
  truthBoundary:{recommendationIsNotDispatch:true,actionIsNotSuccess:true},
};

const html=crisisOperationsPlanning(projection,{projectionAt:'2026-09-04T15:00:00.000Z'});
assert.equal((html.match(/data-action="planning-approved-apply:/gu)??[]).length,5,'every supported approved planning proposal must expose its reviewed apply path');
for(const proposalType of approvedTypes)assert.match(html,new RegExp(`data-planning-application-type="${proposalType}"`),`${proposalType} must have a bounded application banner`);
const invalidPlanning={...projection,planningReview:{decisions:[
  {...projection.planningReview.decisions[0],decisionId:'expired',proposalExpiresAt:'2020-01-01T00:00:00.000Z'},
  {...projection.planningReview.decisions[0],decisionId:'replaced-intent',compiledAgainstIntentHash:`command-intent:sha256:${'b'.repeat(64)}`},
]}};
const invalidHtml=crisisOperationsPlanning(invalidPlanning,{projectionAt:'2026-09-04T15:00:00.000Z'});
assert.doesNotMatch(invalidHtml,/planning-approved-apply:/,'expired or intent-replaced approvals must not be rendered as executable');
for(const copy of ['Intent compilation','2 tasks','2 resource needs','Protection message draft','authority not granted','2 Wildfire Crews','available 3','committed 1','Crew Attributable Current Report','staging Governed Candidate','gap 1 Wildfire Crews','Terrain','Weather','Resource','no evacuation order','1 preparation step','No assignment, reservation, acknowledgement, arrival, or dispatch is claimed'])assert.match(html,new RegExp(copy,'i'),`planning UI is missing decision-useful copy: ${copy}`);

for(const proposalType of approvedTypes)assert.match(appSource,new RegExp(`${proposalType}:\\{boundary:`),`app handler is missing the ${proposalType} boundary`);
assert.match(appSource,/applicationBoundary!==descriptor\.boundary/,'application must fail closed until the displayed boundary is deliberately accepted');
assert.match(appSource,/planningDecisionApplicable\(decision,planning\)/,'application handler must repeat the exact current-intent and expiry guard');
assert.match(appSource,/vigiaApi\.applyReviewedPlan\(state\.selectedIncidentId,decisionId,\{idempotencyKey,applicationBoundary\}\)/,'accepted boundary must be sent to the reviewed-apply endpoint');
assert.match(appSource,/value:'DECLINE'/,'the application form must default to non-application');
assert.doesNotMatch(appSource,/decision\.proposalType!==['"]OPERATIONAL_PERIOD['"]/,'operator apply must not remain artificially limited to operational periods');
for(const field of ['periodStart','periodEnd','whatHappened','whoIsAffected','whatToDo','whatNotToDo','when','authority','nextUpdate','resourceQuantity','minimumCrewSize','maxTravelTimeMinutes'])assert.match(appSource,new RegExp(`id:'${field}'`),`command intent must expose the bounded ${field} input`);
assert.match(appSource,/periodEndMs<=periodStartMs/,'operator-supplied period bounds must fail closed when chronology is invalid');
assert.match(appSource,/periodStart:new Date\(periodStartMs\)\.toISOString\(\),periodEnd:new Date\(periodEndMs\)\.toISOString\(\)/,'explicit period bounds must be sent with command intent');
assert.match(appSource,/resourceSpecified&&\(!resourceType\|\|!Number\.isFinite\(resourceQuantity\)\|\|resourceQuantity<=0/,'operator-supplied resource demand must fail closed without a type and positive quantity');
assert.match(appSource,/protectionMessage:Object\.keys\(protectionMessage\)\.length\?protectionMessage:null,resourceRequirements/,'bounded draft and resource inputs must be sent with the confirmed command intent');
assert.match(actionSource,/Apply reviewed planning record/,'shared action language must describe the generic reviewed planning record');
assert.match(actionSource,/No assignment, resource request delivery, dispatch, evacuation order, warning, protection authority, execution, or outcome is implied/,'shared action contract must state its consequential-action boundary');
assert.match(actionSource,/vigia\.planning-application-receipt\.v2/,'shared action contract must require the v2 typed receipt');

console.log('Planning and command-intent operator contract passed.');
