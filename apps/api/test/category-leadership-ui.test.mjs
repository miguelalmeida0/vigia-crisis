import test from 'node:test';
import assert from 'node:assert/strict';
import { replayEntryIndex, replayJumpIndex, replayRefreshIndex } from '../../web/src/v2/app/replay-navigation.js';
import { replaySummary, renderReplayOverlay } from '../../web/src/v2/views/replay.js';
import { commandSummary, commandWorkbench } from '../../web/src/v2/views/command.js';
import { nationalCommandState } from '../../web/src/v2/views/live-command.js';
import { inspectorFor } from '../../web/src/v2/views/inspector.js';
import { renderObservation } from '../../web/src/v2/views/observe.js';
import { liveInspector, renderLiveOverlay } from '../../web/src/v2/views/live.js';
import { sourceHealth, systemValidationHtml } from '../../web/src/v2/app/action-handler.js';
const steps = ['2024-08-01T12:00:00.000Z','2024-08-01T13:21:00.000Z','2024-08-01T14:02:00.000Z'];

test('replay quick jumps land on the first qualifying physical signal and public report', () => {
  const state = { replayCase: { controlledClock: { steps }, case: { firstThermalAt: steps[1], alertAt: steps[2] } } };
  assert.equal(replayJumpIndex(state, 'start'), 0);
  assert.equal(replayJumpIndex(state, 'physical'), 1);
  assert.equal(replayJumpIndex(state, 'report'), 2);
});

test('a background data refresh preserves the governed replay clock', () => {
  const replayCase = { controlledClock: { steps } };
  assert.equal(replayRefreshIndex(replayCase, 2), 2);
  assert.equal(replayRefreshIndex(replayCase, 9), 2);
  assert.equal(replayRefreshIndex(replayCase, 2, true), 0);
});

test('Living Fire opens at the first physical signal while Replay starts at the governed beginning', () => {
  const replayCase={controlledClock:{steps},case:{firstThermalAt:steps[1]}};
  assert.equal(replayEntryIndex(replayCase,'incidents',0,true),1);
  assert.equal(replayEntryIndex(replayCase,'replay',2,true),0);
  assert.equal(replayEntryIndex(replayCase,'incidents',2,false),2);
});

test('replay never backfills later report knowledge into an earlier clock state', () => {
  const html = renderReplayOverlay({
    replayLoading: false,
    replayPlaying: false,
    replaySpeed: 1,
    replayTimeIndex: 0,
    replayCase: {
      controlledClock: { steps },
      case: { firstThermalAt: steps[1], alertAt: steps[2], physicalFirst: true, physicalLeadMinutes: 41 },
      evidence: [
        { id:'early-ambiguous', kind:'thermal', visibleAt:steps[0], observedAt:steps[0], platform:'Suomi NPP', association:{state:'ambiguous'} },
        { id:'physical', kind:'thermal', visibleAt:steps[1], observedAt:steps[1], platform:'NOAA-20', frpMw:18, association:{state:'associated'} },
        { id:'report', kind:'report', visibleAt:steps[2], observedAt:steps[2], source:'ICNF' }
      ],
      observedThermalFrames: [{ visibleAt:steps[1], aggregateFrpMw:999, activePixelCount:1, sourceFamilies:['NOAA-20'] }]
    }
  });
  assert.match(html, /AWAITING FIRST PHYSICAL SIGNAL/);
  assert.match(html, /earlier observations remain unresolved or abstained/);
  assert.doesNotMatch(html, /PUBLIC REPORT ASSOCIATED/);
  assert.doesNotMatch(html, /999 MW/);
  assert.doesNotMatch(html, />PHYSICAL</);
});

test('held-out validation is the primary replay summary', () => {
  const html = replaySummary({ replay:{ state:'ready', benchmark:{ validation:{ metrics:{ splitMetrics:{ held_out:{ caseCount:10, observationLevelAssociationAccuracy:.8887, reportJoinAccuracy:1, ambiguityRate:.1113 } } } }, softwareReplay:{ futureEvidenceViolations:0 } } } });
  assert.match(html, /HELD-OUT EVALUATION · 10 CASES/);
  assert.match(html, /88\.9%/);
  assert.match(html, /11\.1%/);
});

test('public Action uses normal sign-in language without implementation details', () => {
  const state = { bootstrap:{ actor:{ authentication:{ authenticated:false } } } };
  const html = `${commandSummary(state)}${commandWorkbench(state)}`;
  assert.match(html, /Operator sign-in required/);
  assert.match(html, /attributable operator identity/);
  assert.doesNotMatch(html, /bearer|PostGIS|hash chain/i);
});

test('Action keeps a resolved evidence gap visible until its open request is reconciled', () => {
  const state = {
    filter:'all',
    bootstrap:{
      actor:{authentication:{authenticated:true}},
      control:{actors:[{id:'operator-1',name:'Duty supervisor'}]},
      operations:{
        evidenceNeeds:[{id:'need-1',state:'RESOLVED',kind:'physical_confirmation',subjectId:'event-1'}],
        evidenceRequests:[{id:'request-1',evidenceNeedId:'need-1',state:'requested',ownerId:'operator-1',dueAt:steps[2]}]
      }
    },
    live:{events:[{id:'event-1',label:'Sabugal'}]}
  };
  const html = commandWorkbench(state);
  assert.match(html, /Evidence gap resolved; request closure pending/);
  assert.match(html, /Duty supervisor/);
  assert.match(html, /Review and close the open request/);
});

test('Action exposes measured closure effectiveness without converting volume into success',()=>{
  const state={filter:'all',bootstrap:{actor:{authentication:{authenticated:true}},control:{actors:[]},operations:{evidenceNeeds:[],evidenceRequests:[],effectiveness:{requestsCreated:12,requestsProducingNewEvidence:4,unknownsClosed:3,evidenceYieldPercent:33.3,actionableRequests:2,actionableEvidenceYieldPercent:100,requestCreationState:'FROZEN',medianAcknowledgementMinutes:8,medianResolutionMinutes:null,unownedWork:2,overdue:1,measurementBasis:'Persisted lifecycle timestamps.'}}},live:{events:[]}};
  const html=commandWorkbench(state);assert.match(html,/ACTION EFFECTIVENESS/);assert.match(html,/100%/);assert.match(html,/completed action yield/);assert.match(html,/all-history yield/);assert.match(html,/auto request creation/);assert.match(html,/FROZEN/);assert.match(html,/UNMEASURED/);assert.match(html,/Persisted lifecycle timestamps/);
});

test('Action exposes automatic system work separately from human and field blockers',()=>{
  const state={filter:'all',bootstrap:{actor:{authentication:{authenticated:false}},control:{actors:[]},operations:{evidenceNeeds:[],evidenceRequests:[],systemActionability:{systemActionable:4,systemCompleted:4,evidenceProducing:2,unknownsClosed:0,yieldPercent:50,measurementBasis:'Measured automatic cycle.',rows:[{label:'Remote source re-check',state:'COMPLETED',evidenceProduced:true,unknownsClosed:0}]},effectiveness:{waitingExpertReview:11,unownedWork:9,blockedRequests:27}}},live:{events:[]}};
  const html=commandWorkbench(state);assert.match(html,/SYSTEM-ACTIONABLE/);assert.match(html,/VIGIA executes what does not require a person/);assert.match(html,/Remote source re-check/);assert.match(html,/HUMAN-REVIEW-ACTIONABLE/);assert.match(html,/FIELD-BLOCKED/);assert.match(html,/EXTERNALLY-BLOCKED/);assert.match(html,/50%/);
});

test('System Validation renders governed V3 evidence without runtime formatting errors',()=>{
  const html=systemValidationHtml({
    detectionBenchmark:{
      schema:'vigia.detector-v3-frozen-confirmatory.v1',
      v3:{cases:210,truePositives:101,falsePositives:13,trueNegatives:95,falseNegatives:1,precision:.886,recall:.9902,specificity:.8796,falsePositiveRate:.1204,balancedAccuracy:.9349,matthewsCorrelationCoefficient:.8727,f1:.9352,promotionDecision:'PROMOTED'},
      cohort:{inventory:{positive:102,negative:108},negativeSubjectCount:5},
      falsePositiveTaxonomy:{'STATIC / INDUSTRIAL HEAT':12,OFFSHORE:1},
      falseNegativeTaxonomy:{'SMALL FIRE':1},
      errorExplorer:[],smallFire:{population:{knownSmallFires:5927},results:{}},sentinel3:{summary:{}},prevention:{inventory:{}}
    },
    bootstrap:{prevention:{validation:{sourceQualityBreakdown:{PIXEL_VERIFIED:{reviewed:1,rejected:0,abstained:0}}}},auditChain:{}},
    live:{summary:{},sources:{}},replay:{}
  });
  assert.match(html,/DETECTOR V3/);
  assert.match(html,/PIXEL VERIFIED: 1 reviewed/);
  assert.match(html,/static \/ industrial heat/i);
  assert.doesNotMatch(html,/undefined|null/);
});

test('System Validation remains usable while the benchmark request is still loading',()=>{
  const html=systemValidationHtml({detectionBenchmark:null,bootstrap:{},live:{},replay:{}});
  assert.match(html,/ACTIVE-FIRE DETECTION/);
  assert.match(html,/Detection benchmark unavailable/);
});

test('Territory Command preserves live prospective timing when territory metrics are present',()=>{
  const html=nationalCommandState(
    {summary:{prospectiveDetectionsCaptured:45,fullTimingCaptures:0,currentPhysicalEvents:2},sources:{}},
    {},
    [],
    {summary:{physicalFireEvents:0,reportOnlyIncidents:7}}
  );
  assert.match(html,/45 prospective · 0 full timing/);
  assert.match(html,/7<\/strong><span>Report-only current/);
});

test('Action detail never leaks an internal owner identifier into operator copy', () => {
  const request = {id:'request-1',queueKind:'evidence_request',state:'requested',priority:'high',title:'Verify Sabugal',ownerId:'internal-supervisor-id',dueAt:steps[2],requirements:[],history:[]};
  const state = {actorId:'qa-operator',view:'command',selected:{kind:'operation',id:request.id},bootstrap:{actor:{authentication:{authenticated:true}},control:{actors:[]},operations:{evidencePackages:[]}}};
  const html = inspectorFor(state,request).content;
  assert.match(html, /Owned by Assigned operator/);
  assert.doesNotMatch(html, /internal-supervisor-id/);
});

test('Prevention observation opens avoidance intelligence over native scene pairs',()=>{
  const primary={id:'s2-current',sensor:'Sentinel-2',acquiredAt:'2026-08-08T11:31:00Z',source:'Earth Search',visualCogUrl:'https://example.test/current.tif',redCogUrl:'https://example.test/red.tif',nirCogUrl:'https://example.test/nir.tif',swir16CogUrl:'https://example.test/swir.tif',bbox:[-8.1,37,-7.9,37.2],evidenceBinding:{renderAllowed:true,pixelVerified:true,state:'pixel_verified',bindingHash:'current'}};
  const comparable={...primary,id:'s2-prior',acquiredAt:'2025-08-06T11:30:00Z',visualCogUrl:'https://example.test/prior.tif',evidenceBinding:{...primary.evidenceBinding,bindingHash:'prior'}};
  const item={kind:'FUEL_CONTINUITY_CHANGE',findingId:'finding-1',municipality:'Loulé',coordinate:[-8,37.1],geometry:{type:'Polygon',coordinates:[[[-8.01,37.09],[-7.99,37.09],[-7.99,37.11],[-8.01,37.11],[-8.01,37.09]]]},affectedAreaHa:1.2,corridorLengthM:240,nearestStructureM:18,structuresWithinPolicyRadius:2,roadCrossings:3,criticalAssetProximityM:81,terrainContext:{state:'MEASURED_LOCAL_CONTEXT',slopeDegrees:{median:4.2}},landCoverContext:{state:'MEASURED_GEOMETRY_BOUND',dominantClass:'tree_cover'},sourceQuality:{state:'PIXEL_VERIFIED'},attentionPriority:{score:62,band:'high'},rationale:{whyItMatters:'Connected fuel-like support near mapped exposure requires review.'},reviewSummary:{count:0}};
  const state={bootstrap:{actor:{authentication:{authenticated:true}}},observation:{primary,comparable,timeline:[comparable],viewportBbox:primary.bbox,changeScreening:{eligible:true},safety:'Screening only',notice:'Native source pixels.'}};
  const html=renderObservation(state,item);
  for(const contract of [/PRE-IGNITION AVOIDANCE INTELLIGENCE/,/CONSENSUS UNMEASURED/,/MEASUREMENT PRIORITY · NOT PROBABILITY/,/INTERVENTION GEOMETRY UNSTABLE/,/MEASUREMENT PLAN ACTIVE/,/Fuel graph/,/Consensus zone/,/Exact coordinate suppressed/])assert.match(html,contract);
  assert.match(html,/data-studio-action="vegetation"/);
  assert.match(html,/2 mapped structure paths · 3 road intersections/);
  assert.match(html,/tree_cover · median slope 4\.2°/);
  assert.match(html,/data-action="measurement-plan"/);
  assert.doesNotMatch(html,/INTERVENTION REVIEW PRIORITY|data-action="review-prevention-finding"/);
});

test('Action gives contradictory physical evidence its own work lane',()=>{
  const state={filter:'conflict',bootstrap:{actor:{authentication:{authenticated:true}},control:{actors:[{id:'operator-1',name:'Duty supervisor'}]},operations:{evidenceNeeds:[{id:'need-conflict',subjectId:'event-conflict',state:'REQUEST_ACTIVE',missingQuantity:'resolve_evidence_conflict',ownerId:'operator-1'}],evidenceRequests:[]}},live:{events:[{id:'event-conflict',label:'Conflicting event',actionNeed:{kind:'resolve_evidence_conflict'}}]}};
  const html=commandWorkbench(state);
  assert.match(html,/Evidence conflict/);
  assert.match(html,/Conflicting event/);
});

test('Living Fire analysis mode exposes observed support without claiming a perimeter or forecast',()=>{
  const event={id:'event-physical',label:'Sabugal physical event',evidenceState:'satellite-only',geometryFreshness:'current',physicalState:{freshness:'current'},fireEvidenceState:{state:'PHYSICAL_EVIDENCE_PRESENT',physicalEvidence:[{dependencyGroup:'source-group-1',observationCount:2}]},observedThermalSupport:{properties:{observationCount:2}},movement:{direction:'moving',distanceKm:.7,bearingDeg:42},timeline:[{at:steps[0],label:'First VIIRS observation'},{at:steps[1],label:'Second VIIRS observation'}],thermal:{series:[{at:steps[0],frpMw:14},{at:steps[1],frpMw:21}],currentDirection:'growing',direction:'growing'}};
  const html=renderLiveOverlay({analysisMode:true,liveThermalEnabled:false,liveTimeIndex:1,selected:{kind:'event',id:event.id},live:{events:[event],thermal:{replaySlots:[]}}});
  assert.match(html,/LIVING FIRE ANALYSIS/);
  assert.match(html,/2 associated physical observations/);
  assert.match(html,/0\.7 km centroid displacement/);
  assert.match(html,/not a flame-front perimeter or spread forecast/);
  assert.match(html,/Exit analysis/);
});

test('Living Fire makes two-family physical truth, timeline lanes and raw lineage visible',()=>{
  const observations=[
    {id:'viirs-1',type:'thermal',at:steps[0],source:'NASA FIRMS',sourceFamily:'viirs',independenceGroup:'viirs_noaa20',satellite:'NOAA-20',instrument:'VIIRS',frpMw:18,provenance:{rawSourceProductId:'raw:nasa:viirs:abc',checksumSha256:'a'.repeat(64),normalizerVersion:'firms-v3'}},
    {id:'s3-1',type:'thermal',at:steps[1],source:'Copernicus',sourceFamily:'sentinel3_slstr',independenceGroup:'sentinel_3a_slstr',satellite:'Sentinel-3A',instrument:'SLSTR',frpMw:24,frpUncertaintyMw:3,provenance:{rawSourceProductId:'raw:cdse:s3:def',checksumSha256:'b'.repeat(64),normalizerVersion:'sentinel3-slstr-frp-v3'}},
    {id:'report-1',type:'report',at:steps[2],source:'civil-protection'}
  ];
  const event={id:'PT-TWO-FAMILY',label:'Two-family physical event',coordinate:[-8,40],firstSeenAt:steps[0],lastSeenAt:steps[2],observations,timeline:observations.map((item)=>({...item,label:item.id,sensor:item.satellite})),physicalSourceProfile:{families:['viirs','sentinel3_slstr'],familyCount:2,independenceGroups:['viirs_noaa20','sentinel_3a_slstr'],independenceGroupCount:2,twoPhysicalSourceFamilies:true},fireEvidenceState:{state:'PHYSICAL_EVIDENCE_PRESENT',physicalSourceFamilies:['viirs','sentinel3_slstr'],physicalSourceFamilyCount:2,twoPhysicalSourceFamilies:true,independenceGroups:['viirs_noaa20','sentinel_3a_slstr']},reportState:{sourceActivity:'current',lastAt:steps[2]},physicalState:{freshness:'current',lastAt:steps[1]},sensorCoverage:{viirs:{pointDetection:true},sentinel3:{pointDetection:true}},actionNeed:{needsRouting:false,reason:'Continue monitoring.'},thermal:{samples:2,series:[{at:steps[0],frpMw:18},{at:steps[1],frpMw:24}],currentDirection:'rising',direction:'rising'},evidenceState:'multisource'};
  const html=liveInspector({liveTimeIndex:2,bootstrap:{control:{actors:[]},operations:{evidenceRequests:[],evidenceNeeds:[]}},live:{events:[event]}},event).content;
  assert.match(html,/TWO-FAMILY PHYSICAL EVENT/);assert.match(html,/S3 \/ SLSTR/);assert.match(html,/FRP SUPPORT/);assert.match(html,/AMBIGUITY/);
  assert.match(html,/raw:nasa:viirs:abc/);assert.match(html,/raw:cdse:s3:def/);assert.match(html,/sentinel3-slstr-frp-v3/);
});

test('Source Health explains provider recovery and capability impact in operator language',()=>{
  const html=sourceHealth({
    firms:{label:'NASA FIRMS · VIIRS',state:'stale',configurationState:'configured',lastSuccessAt:steps[2],latestSourceObservation:steps[1],accepted:42,authority:'point-level physical observation'},
    sentinel3Pixels:{label:'Sentinel-3 SLSTR',state:'not_configured',configured:false},
    mtgPixels:{label:'MTG structured FRP points',state:'not_configured',configured:false},
    sensorAssets:{label:'Connected observation assets',state:'not_configured',count:0,error:'No connected observation assets are configured.'},
    observationSchedule:{label:'Observation opportunity planner',state:'planner_ready',confirmedCount:0},
    riskTomorrow:{label:'Tomorrow fire danger',state:'current',fetchedAt:steps[2]},
    copernicus:{label:'Sentinel-2 catalogue',state:'current',fetchedAt:steps[2]},
    thermal:{label:'MTG thermal context',state:'current',fetchedAt:steps[2],selected:{label:'MTG',state:'current',origin:'EUMETSAT'}}
  });
  assert.match(html,/WHAT IS NEEDED/);
  assert.match(html,/No operator action\. Acquisition and source checks are healthy/);
  assert.match(html,/No credential change\. Polling is configured/);
  assert.match(html,/VIGIA_CDSE_USERNAME and VIGIA_CDSE_PASSWORD/);
  assert.match(html,/Independent SLSTR point evidence/);
  assert.match(html,/raster thermal context alone does not unlock this evidence family/i);
  assert.match(html,/Broad raster context only; it never substitutes for a structured physical-observation feed/);
  assert.match(html,/Official fire-danger forecasts help prioritize territory review/);
  assert.match(html,/Real scene-pair selection for pre-ignition screening/);
  assert.match(html,/A confirmed, attributable observation-opportunity schedule/);
  assert.match(html,/No confirmed opportunities/);
  assert.match(html,/Configuration: not configured/);
  assert.doesNotMatch(html,/undefined|null/);
});

test('Source Health exposes a truthful product-level Sentinel-3 zero result',()=>{
  const html=sourceHealth({sentinel3Pixels:{label:'Sentinel-3 SLSTR',provider:'CDSE',state:'empty',configured:true,observationConclusion:'source_product_contains_no_active_fire_records',productDiagnostics:[{providerProductId:'S3B_SL_2_FRP:FRP_MWIR1km_STANDARD',sourceRecordCount:0,positiveFrpRecordCount:0,aoiObservationCount:0,observationConclusion:'source_product_contains_no_active_fire_records'}]}});
  assert.match(html,/Product acquired · no FRP points/);assert.match(html,/0 source records/);assert.match(html,/source_product_contains_no_active_fire_records/);
});
test('current production Sentinel-3 proof supersedes an obsolete blocked handoff across command and validation',()=>{const live={summary:{sentinel3PhysicalObservations:161,viirsSentinel3Events:1,twoPhysicalFamilyEvents:1},sources:{firms:{state:'stale'},sentinel3Pixels:{state:'stale',acquiredProducts:6,accepted:161,observationConclusion:'positive_frp_pixels_present',productDiagnostics:[{sourceRecordCount:65,positiveFrpRecordCount:65,aoiObservationCount:65},{sourceRecordCount:96,positiveFrpRecordCount:96,aoiObservationCount:96}]}}},benchmark={schema:'vigia.detector-v4-frozen-confirmatory.v1',v4:{},v3Baseline:{},cohort:{inventory:{}},physicalSensing:{sentinel3:{candidateProducts:68,downloadedProducts:0,positiveProducts:0,twoFamilyEventIds:[],blocker:{state:'EXTERNAL_PROVIDER_REJECTED_CONFIGURED_CREDENTIALS'}}},physicalSensingViirs:{smallFireOpportunityMetrics:{productLevelGranuleProof:626,validOpportunity:584,fireSignal:84,sensorDetectionGivenValidOpportunity:.1438},granuleMetrics:{activeFireGranulesAcquired:45}}};const command=nationalCommandState(live,{},[],null,benchmark),validation=systemValidationHtml({detectionBenchmark:benchmark,live,bootstrap:{},replay:{}});assert.match(command,/6 S3 products · 161 observations · 1 VIIRS\+S3/);assert.match(command,/Two-family connected · delayed/);assert.match(validation,/6 Sentinel-3 products acquired · 161 point observations · 1 VIIRS \+ Sentinel-3 events/);assert.match(validation,/Current production acquisition supersedes the older specialist preflight state/);assert.match(validation,/161 parsed source records · 161 positive FRP records · 161 qualifying Portugal observations/);assert.doesNotMatch(validation,/provider returned 401/);});
