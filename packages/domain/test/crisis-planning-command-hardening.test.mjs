import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCrisisPlanning } from '../src/crisis-planning/index.mjs';

const AS_OF='2026-09-04T15:00:00.000Z';
const INCIDENT={id:'incident:planning-hardening',coordinate:[-8.5,41.2]};
const source=(id)=>({id,reference:`evidence:${id}`});
const confirmedIntent=(intentType,extras={})=>({
  intentId:`intent:${intentType.toLowerCase()}`,
  intentType,
  statement:`Governed ${intentType.toLowerCase()} intent.`,
  target:'Named operational target',
  requestedBy:'operator:commander',
  owner:'planning:lead',
  deadline:'2026-09-04T16:00:00.000Z',
  periodStart:'2026-09-04T15:05:00.000Z',
  periodEnd:'2026-09-04T15:55:00.000Z',
  confirmation:{state:'CONFIRMED',confirmedBy:'operator:commander',confirmedAt:'2026-09-04T14:59:00.000Z'},
  ...extras,
});
const project=(input={})=>projectCrisisPlanning({asOf:AS_OF,incident:INCIDENT,...input});

function optimizerCandidate(facilityId,travelTimeMinutes,available,committed=0){
  return{
    facilityId,kind:'FIRE_STATION',eligibleForDispatchRecommendation:true,capacityReportConfirmed:true,capacityKnown:true,
    availableCapacityConfirmed:true,capabilityQualified:true,routeState:'ROUTED',travelTimeMinutes,routeDistanceKm:travelTimeMinutes/2,
    routeCheckedAt:'2026-09-04T14:55:00.000Z',capacityObservedAt:'2026-09-04T14:55:00.000Z',
    availableQuantities:{WILDFIRE_CREWS:available},committedQuantities:{WILDFIRE_CREWS:committed},
    crewStatus:{state:'ATTRIBUTABLE_CURRENT_REPORT',crewSize:4,crewsAvailable:available,crewsAssigned:committed},
    capabilities:['wildfireCapability'],constraints:[],coverage:{state:'ROUTED_TIME_AVAILABLE',travelTimeMinutes,withinMinutes:[30,45,60]},
    stagingCandidate:{state:'GOVERNED_CANDIDATE',facilityId,coordinate:[-8.4,41.1],source:source(`staging:${facilityId}`)},
  };
}

function evacuationBase(constraints={}){
  return{
    contexts:{shelters:[{id:'shelter:one',operationalState:'OPEN_CONFIRMED',updatedAt:'2026-09-04T14:55:00.000Z',source:source('shelter')}]},
    incidentScenario:{id:'scenario:one',admitted:true,admissionReference:'admission:scenario:one',validUntil:'2026-09-04T17:00:00.000Z',source:source('scenario')},
    evacuation:{decisionDeadline:'2026-09-04T15:30:00.000Z',routeCandidates:[{id:'route:one',shelterId:'shelter:one',currentState:'OPEN_CONFIRMED',travelTimeMinutes:14,segmentIds:['road:one'],updatedAt:'2026-09-04T14:55:00.000Z',source:source('route')}],...constraints},
    responseCapability:{roadContext:{closures:[]},optimizerInputs:{candidates:[],constraints:[],unknowns:[]}},
  };
}

const clearConstraints=()=>({
  terrainConstraints:[{id:'terrain:one',state:'CLEAR',updatedAt:'2026-09-04T14:55:00.000Z',source:source('terrain')}],
  weatherConstraints:[{id:'weather:one',state:'CLEAR',updatedAt:'2026-09-04T14:55:00.000Z',source:source('weather')}],
  resourceConstraints:[{id:'resource:one',state:'AVAILABLE',updatedAt:'2026-09-04T14:55:00.000Z',source:source('resource')}],
});

test('every supported command intent compiles owned tasks, collection, resource needs, and explicit non-execution boundaries',()=>{
  for(const intentType of ['PROTECT_AREA','KEEP_ACCESS_OPEN','VERIFY_ROUTE','PREPARE_PROTECTION_DRAFT']){
    const extras=intentType==='PREPARE_PROTECTION_DRAFT'?{
      protectionMessage:{whatHappened:'An admitted incident requires a bounded protection draft.',whatToDo:'Await instructions from the named authority.'},
      resourceRequirements:[{id:'need:ems',requiredKind:'EMS_BASE',requiredResourceType:'UNITS',requiredQuantity:2,minimumCrewSize:2,maxTravelTimeMinutes:30,stagingRequired:true,requiredCapabilities:['incidentSupport']}],
    }:{};
    const result=project({commandIntent:confirmedIntent(intentType,extras)}).commandIntent;
    assert.equal(result.state,'CONFIRMED_FOR_COMPILATION');
    assert.equal(result.periodBoundarySource,'OPERATOR_SUPPLIED_COMMAND_INTENT');
    assert.ok(result.assignments.length>=2,`${intentType} must compile more than a passive objective`);
    assert.ok(result.assignments.every(item=>item.owner==='planning:lead'&&item.execution===false&&item.acknowledgementState==='NOT_REQUESTED'));
    assert.ok(result.collectionRequirements.length>=1);
    assert.ok(result.resourceRecommendations.length>=1);
    assert.ok(result.resourceRecommendations.every(item=>item.assignmentState==='NOT_CREATED'&&item.dispatchState==='NOT_DISPATCHED'));
    if(intentType==='PREPARE_PROTECTION_DRAFT'){
      const draft=result.protectionDraft,custom=result.resourceRecommendations.find(item=>item.requiredResourceType==='UNITS');
      assert.equal(draft.liveSend,false);
      assert.equal(draft.deliveryState,'NOT_SENT');
      assert.equal(draft.authorityState,'NOT_GRANTED');
      assert.equal(draft.message.where,'Named operational target');
      assert.ok(draft.missingFields.includes('authority'));
      assert.equal(custom.requiredQuantity,2);
      assert.equal(custom.minimumCrewSize,2);
      assert.equal(custom.stagingRequired,true);
    }
  }
});

test('resource optimizer allocates explicit quantities after commitments and exposes crew, staging, coverage, trade-offs, and exact gaps',()=>{
  const responseCapability={schemaVersion:'vigia.response-capability.v1',roadContext:{source:{provider:'Governed routing'}},optimizerInputs:{candidates:[optimizerCandidate('station:a',12,3,1),optimizerCandidate('station:b',18,2,0)],constraints:[{explanation:'Preserve residual regional coverage.'}],unknowns:[]}};
  const requirement={id:'requirement:crews',requiredKind:'FIRE_STATION',requiredResourceType:'WILDFIRE_CREWS',requiredQuantity:3,minimumCrewSize:4,stagingRequired:true,requiredCapabilities:['wildfireCapability'],owner:'logistics:lead',deadline:'2026-09-04T15:30:00.000Z',tradeOffs:['Do not infer dispatch readiness.']};
  const optimizer=project({responseCapability,taskRequirements:[requirement]}).resourceOptimizer;
  assert.equal(optimizer.state,'RECOMMENDATIONS_READY_FOR_APPROVAL');
  assert.deepEqual(optimizer.recommendations.map(item=>[item.facilityId,item.recommendedQuantity]),[['station:a',2],['station:b',1]]);
  assert.equal(optimizer.recommendations[0].availableQuantity,3);
  assert.equal(optimizer.recommendations[0].committedQuantity,1);
  assert.equal(optimizer.recommendations[0].crewStatus.crewSize,4);
  assert.equal(optimizer.recommendations[0].stagingState,'GOVERNED_CANDIDATE');
  assert.equal(optimizer.recommendations[0].coverage.state,'ROUTED_TIME_AVAILABLE');
  assert.ok(optimizer.recommendations[0].tradeOffs.includes('Preserve residual regional coverage.'));
  assert.equal(optimizer.dispatchesExecuted,0);

  const partial=project({responseCapability,taskRequirements:[{...requirement,requiredQuantity:5}]}).resourceOptimizer;
  assert.equal(partial.state,'PARTIAL_RECOMMENDATION');
  assert.equal(partial.remainingUncoveredDemand[0].gapQuantity,1);
  const missing=project({responseCapability,taskRequirements:[{...requirement,requiredQuantity:null}]}).resourceOptimizer;
  assert.equal(missing.state,'NO_ELIGIBLE_RECOMMENDATION');
  assert.equal(missing.remainingUncoveredDemand[0].state,'REQUIRED_QUANTITY_REQUIRED');
  const genericCommitmentCandidate={...optimizerCandidate('station:generic-commitment',12,3),committedQuantities:{},competingDemandQuantity:2};
  const genericCommitment=project({responseCapability:{...responseCapability,optimizerInputs:{...responseCapability.optimizerInputs,candidates:[genericCommitmentCandidate]}},taskRequirements:[{...requirement,requiredQuantity:2}]}).resourceOptimizer;
  assert.equal(genericCommitment.recommendations[0].committedQuantity,2);
  assert.equal(genericCommitment.recommendations[0].recommendedQuantity,1);
  assert.equal(genericCommitment.remainingUncoveredDemand[0].gapQuantity,1);
  const unresolvedConstraint=project({responseCapability:{...responseCapability,optimizerInputs:{...responseCapability.optimizerInputs,candidates:[{...optimizerCandidate('station:constraint',12,3),constraints:[{state:'REQUIRES_REVIEW',description:'Unstructured operational limitation.'}]}]}},taskRequirements:[requirement]}).resourceOptimizer;
  assert.equal(unresolvedConstraint.state,'NO_ELIGIBLE_RECOMMENDATION');
  assert.ok(unresolvedConstraint.remainingUncoveredDemand[0].candidateEvaluations[0].exclusionReasons.includes('CANDIDATE_SAFETY_OR_ACCESS_CONSTRAINT_BLOCKS_USE'));
});

test('resource loss, weather, priority, authority denial, and field contradiction each produce reviewable plan diffs without execution',()=>{
  const responseCapability={schemaVersion:'vigia.response-capability.v1',roadContext:{closures:[],source:{provider:'Governed routing'}},optimizerInputs:{candidates:[optimizerCandidate('station:replacement',12,2)],constraints:[],unknowns:[]}};
  const oldPlan={assignments:[{id:'assignment:one',requirementId:'requirement:one',facilityId:'station:unavailable',state:'PROPOSED'}],priorityState:'NORMAL',protectionActionId:'protect:one',authorityState:'PENDING',safetyConstraints:[]};
  const triggers=[
    {id:'trigger:resource',type:'RESOURCE_UNAVAILABLE',facilityId:'station:unavailable',affectedFacilityIds:['station:unavailable'],observedAt:'2026-09-04T14:56:00.000Z',source:source('resource-loss')},
    {id:'trigger:priority',type:'PRIORITY_CHANGED',newPriorityState:'URGENT_REVIEW',observedAt:'2026-09-04T14:57:00.000Z',source:source('priority')},
    {id:'trigger:weather',type:'WEATHER_CHANGED',proposedSafetyConstraints:[{id:'wind:one',state:'REVIEW_REQUIRED'}],observedAt:'2026-09-04T14:58:00.000Z',source:source('weather-change')},
    {id:'trigger:authority',type:'AUTHORITY_DENIED',protectionActionId:'protect:one',observedAt:'2026-09-04T14:58:30.000Z',source:source('authority-denial')},
    {id:'trigger:field',type:'FIELD_REPORT_CONTRADICTS_PLAN',affectedAssignmentIds:['assignment:one'],observedAt:'2026-09-04T14:59:00.000Z',source:source('field-report')},
  ];
  const result=project({responseCapability,taskRequirements:[{id:'requirement:one',requiredKind:'FIRE_STATION',requiredResourceType:'WILDFIRE_CREWS',requiredQuantity:1,owner:'operations:lead',deadline:'2026-09-04T15:30:00.000Z'}],replanning:{oldPlan},triggers}).autonomousReplanning;
  assert.equal(result.state,'NEW_PLAN_READY_FOR_APPROVAL');
  assert.equal(result.newPlan.assignments[0].facilityId,'station:replacement');
  assert.equal(result.newPlan.assignments[0].execution,false);
  assert.equal(result.newPlan.priorityState,'URGENT_REVIEW');
  assert.equal(result.newPlan.authorityState,'DENIED_REPLAN_REQUIRED');
  assert.equal(result.newPlan.protectionActionId,null);
  assert.deepEqual(result.newPlan.safetyConstraints,[{id:'wind:one',state:'REVIEW_REQUIRED'}]);
  assert.ok(result.whatChanged.some(item=>item.path==='priorityState'));
  assert.equal(result.execution,false);
  assert.equal(result.dispatchesExecuted,0);
});

test('evacuation corridor eligibility fails closed until terrain, weather, and resource constraints are current and clear',()=>{
  const missing=project(evacuationBase()).evacuationCorridor;
  assert.equal(missing.state,'WITHHELD_NO_GOVERNED_OPEN_CORRIDOR');
  assert.equal(missing.routesAssessed[0].constraintAssessment.assessments.find(item=>item.axis==='TERRAIN').state,'UNKNOWN');
  const attemptedPolicyBypass=project(evacuationBase({constraintPolicy:{requiredAxes:[]}})).evacuationCorridor;
  assert.equal(attemptedPolicyBypass.state,'WITHHELD_NO_GOVERNED_OPEN_CORRIDOR');
  assert.deepEqual(attemptedPolicyBypass.routesAssessed[0].constraintAssessment.requiredAxes,['TERRAIN','WEATHER','RESOURCE']);
  const blocked=project(evacuationBase({...clearConstraints(),weatherConstraints:[{id:'weather:block',state:'UNSAFE',updatedAt:'2026-09-04T14:55:00.000Z',source:source('weather-block')}]})).evacuationCorridor;
  assert.equal(blocked.routesAssessed[0].exclusionReason,'WEATHER_CONSTRAINT_BLOCKS_ROUTE');
  const admitted=project(evacuationBase(clearConstraints())).evacuationCorridor;
  assert.equal(admitted.state,'READY_FOR_AUTHORITY_REVIEW');
  assert.equal(admitted.recommendedCorridor.constraintAssessment.state,'ELIGIBLE');
  assert.equal(admitted.planningOnly,true);
  assert.equal(admitted.officialOrder,false);
});

test('protection windows are exposed only when computation is bound to admitted evidence, preparation, confidence, and a future deadline',()=>{
  const scenario={id:'scenario:protection',admitted:true,admissionReference:'admission:protection',validUntil:'2026-09-04T17:00:00.000Z',source:source('protection-scenario')};
  const withheld=project({protectionScenario:{...scenario,windows:[{minutes:15,scenarioExposure:{communityId:'community:one'},confidence:{state:'SCENARIO'},requiredPreparation:['Prepare liaison review.'],decisionDeadline:'2026-09-04T15:30:00.000Z'}]}}).protectionTimeline;
  assert.equal(withheld.windows[0].state,'WITHHELD');
  assert.ok(withheld.windows[0].invalidReasons.includes('WINDOW_EVIDENCE_REFERENCES_REQUIRED'));
  const stale=project({protectionScenario:{...scenario,windows:[{minutes:15,scenarioExposure:{communityId:'community:one'},confidence:{state:'SCENARIO'},requiredPreparation:['Prepare liaison review.'],decisionDeadline:'2026-09-04T15:30:00.000Z',evidenceReferences:['evidence:old-window'],computedAt:'2026-09-04T14:20:00.000Z',calculationMethod:'ADMITTED_SCENARIO_EXPOSURE_INTERSECTION'}]}}).protectionTimeline;
  assert.ok(stale.windows[0].invalidReasons.includes('STALE_WINDOW_COMPUTATION_REJECTED'));
  const available=project({protectionScenario:{...scenario,windows:[{minutes:15,scenarioExposure:{communityId:'community:one'},confidence:{state:'SCENARIO'},requiredPreparation:['Prepare liaison review.'],decisionDeadline:'2026-09-04T15:30:00.000Z',evidenceReferences:['evidence:admitted-window'],computedAt:'2026-09-04T14:59:00.000Z',calculationMethod:'ADMITTED_SCENARIO_EXPOSURE_INTERSECTION'}]}}).protectionTimeline;
  assert.equal(available.state,'ADMITTED_SCENARIO_WINDOWS_AVAILABLE');
  assert.equal(available.windows[0].computationState,'COMPUTED_FROM_ADMITTED_EVIDENCE');
  assert.equal(available.windows[0].deterministicPrediction,false);
  assert.ok(available.windows.slice(1).every(item=>item.state==='WITHHELD'));
  assert.equal(available.execution,false);
});
