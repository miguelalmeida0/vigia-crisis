import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCapProtectionTransition,
  projectCrisisPlanning,
} from '../src/crisis-planning/index.mjs';
import {
  buildResponseCapabilityProjection,
  normalizeDynamicCapacity,
} from '../src/response-capability/index.mjs';

const asOf = '2026-09-04T15:00:00.000Z';

function base(overrides = {}) {
  return {
    asOf,
    incident: {
      id: 'incident:governed-one',
      name: 'Governed incident',
      coordinate: [-8.5, 41.2],
      truthState: 'DETECTION_CANDIDATE',
    },
    ...overrides,
  };
}

function governedContext(id, name, coordinate, extra = {}) {
  return {
    id,
    name,
    coordinate,
    updatedAt: '2026-09-04T14:50:00.000Z',
    source: { id: 'governed-osm-extract', reference: `osm:${id}` },
    ...extra,
  };
}

function reachability(minutes, distanceKm) {
  return {
    state: 'ROUTED',
    method: 'OSRM_ROAD_NETWORK',
    routeDistanceKm: distanceKm,
    travelTimeMinutes: minutes,
    currentRoute: { travelTimeMinutes: minutes, distanceKm, geometry: null, geometryState: 'NOT_RETURNED' },
    alternativeRoute: null,
    alternativeRouteState: 'NOT_RETURNED',
    roadClosureImpact: { state: 'UNKNOWN', closures: [] },
    terrainAccessConstraints: { state: 'NOT_ROUTING_CONSTRAINED', constraints: [] },
    source: { provider: 'OSRM', reference: `osrm:${minutes}` },
    checkedAt: asOf,
    confidence: { state: 'CONTEXTUAL_ESTIMATE', score: null },
    reason: null,
  };
}

function reportedStation(id, minutes, crews) {
  const dynamicCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED',
    admitted: true,
    admissionReference: `admission:${id}`,
    observedAt: '2026-09-04T14:58:00.000Z',
    source: { name: 'Regional dispatch', reference: `dispatch:${id}` },
    crewsAvailable: crews,
    enginesAvailable: crews > 0 ? 1 : 0,
  }, { now: new Date(asOf) });
  return {
    id,
    kind: 'FIRE_STATION',
    name: id,
    coordinate: [-8.4, 41.1],
    distanceKm: minutes / 2,
    reachability: reachability(minutes, minutes / 1.5),
    staticCapability: { wildfireCapability: { state: 'KNOWN', value: true } },
    provenance: { provider: 'OpenStreetMap contributors', reference: `osm:${id}` },
    updatedAt: '2026-09-04T14:45:00.000Z',
    dynamicCapacity,
  };
}

test('an actor-bound confirmation compiles command intent without approving or applying its proposals', () => {
  const projected = projectCrisisPlanning(base({
    commandIntent: {
      intentId: 'intent:confirmed-road',
      statement: 'Verify the northern hospital access route.',
      intentType: 'VERIFY_ROUTE',
      target: 'road:n2',
      requestedBy: 'operator:one',
      owner: 'planning:one',
      deadline: '2026-09-04T15:30:00Z',
      periodStart: '2026-09-04T15:05:00Z',
      periodEnd: '2026-09-04T15:25:00Z',
      confirmation: { state: 'CONFIRMED', confirmedBy: 'operator:one', confirmedAt: '2026-09-04T14:59:30Z' },
      mutationsApplied: false,
    },
  }));
  assert.equal(projected.commandIntent.state, 'CONFIRMED_FOR_COMPILATION');
  assert.equal(projected.commandIntent.value.requiresHumanConfirmation, false);
  assert.equal(projected.commandIntent.value.confirmation.confirmedBy, 'operator:one');
  assert.equal(projected.commandIntent.value.mutationsExecuted, false);
  assert.equal(projected.operationalPeriodProposal.value.approvalRequired, true);
  assert.equal(projected.operationalPeriodProposal.value.assignmentsCreated, false);
  assert.equal(projected.operationalPeriodProposal.value.resourcesDispatched, false);
  assert.equal(projected.operationalPeriodProposal.value.periodBoundarySource, 'OPERATOR_SUPPLIED_COMMAND_INTENT');
});

test('reported current station capacity enables a recommendation without claiming dispatch or assignment', () => {
  const responseCapability = buildResponseCapabilityProjection({
    incident: { id: 'incident:governed-one', coordinate: [-8.5, 41.2] },
    generatedAt: asOf,
    facilitiesByKind: { FIRE_STATION: [reportedStation('station:ready', 18, 2)] },
    roadContext: { state: 'AVAILABLE', source: { provider: 'OSRM', reference: 'route-batch:one' }, closures: [] },
  });
  const projected = projectCrisisPlanning(base({
    responseCapability,
    taskRequirements: [{ id: 'requirement:initial-response', requiredKind: 'FIRE_STATION', demandMode: 'BINARY_CAPABILITY', owner: 'operations:one', deadline: '2026-09-04T15:20:00Z' }],
  }));
  assert.equal(projected.resourceOptimizer.state, 'RECOMMENDATIONS_READY_FOR_APPROVAL');
  assert.equal(projected.resourceOptimizer.value.recommendedAssignment[0].facilityId, 'station:ready');
  assert.equal(projected.resourceOptimizer.value.etaMinutes, 18);
  assert.equal(projected.resourceOptimizer.value.dispatchClaimed, false);
  assert.equal(projected.resourceOptimizer.value.recommendations[0].dispatchState, 'NOT_DISPATCHED');
  assert.equal(projected.resourceOptimizer.value.recommendations[0].execution, false);
});

test('road closure triggers OLD PLAN to NEW PLAN diff using the newly eligible routed station', () => {
  const responseCapability = buildResponseCapabilityProjection({
    incident: { id: 'incident:governed-one', coordinate: [-8.5, 41.2] },
    generatedAt: asOf,
    facilitiesByKind: {
      FIRE_STATION: [reportedStation('station:closed-route', 40, 2), reportedStation('station:alternative', 22, 1)],
    },
    roadContext: {
      state: 'AVAILABLE',
      source: { provider: 'Road authority', reference: 'closure-feed:one' },
      closures: [{ id: 'closure:n2', affectedFacilityIds: ['station:closed-route'], segmentIds: ['segment:n2'], observedAt: '2026-09-04T14:59:00Z', source: { id: 'road-authority', reference: 'closure:n2' } }],
    },
  });
  const oldPlan = {
    id: 'plan:old',
    assignments: [{ id: 'assignment:initial-response', taskRequirementId: 'requirement:initial-response', facilityId: 'station:closed-route', state: 'PROPOSED' }],
  };
  const projected = projectCrisisPlanning(base({
    responseCapability,
    taskRequirements: [{ id: 'requirement:initial-response', requiredKind: 'FIRE_STATION', demandMode: 'BINARY_CAPABILITY', owner: 'operations:one', deadline: '2026-09-04T15:20:00Z' }],
    triggers: [{ id: 'trigger:closure', type: 'ROAD_CLOSURE', observedAt: '2026-09-04T14:59:00Z', closureId: 'closure:n2', affectedFacilityIds: ['station:closed-route'] }],
    replanning: { oldPlan },
  }));
  assert.equal(projected.autonomousReplanning.state, 'NEW_PLAN_READY_FOR_APPROVAL');
  assert.equal(projected.autonomousReplanning.value.oldPlan.assignments[0].facilityId, 'station:closed-route');
  assert.equal(projected.autonomousReplanning.value.newPlan.assignments[0].facilityId, 'station:alternative');
  assert.equal(projected.autonomousReplanning.value.whatChanged[0].requiresApproval, true);
  assert.equal(projected.autonomousReplanning.value.requiresApproval, true);
  assert.equal(projected.autonomousReplanning.value.mutationExecuted, false);
  assert.equal(projected.autonomousReplanning.value.execution, false);
});

test('evacuation and protection projections require admitted attributable scenarios and never claim official action', () => {
  const incidentScenario = {
    id: 'scenario:admitted',
    admitted: true,
    admissionReference: 'scenario-admission:one',
    validUntil: '2026-09-04T16:00:00Z',
    source: { id: 'forecasting-governance', reference: 'scenario:admitted:v1' },
  };
  const projected = projectCrisisPlanning(base({
    contexts: {
      shelters: [governedContext('shelter:east', 'East shelter', [-8.4, 41.2], { operationalState: 'OPEN_CONFIRMED' })],
    },
    incidentScenario,
    responseCapability: {
      schemaVersion: 'vigia.response-capability.v1',
      roadContext: { state: 'AVAILABLE', source: { id: 'road-authority', reference: 'closures:one' }, closures: [{ id: 'closure:a', segmentIds: ['segment:a'] }] },
      optimizerInputs: { candidates: [], constraints: [], unknowns: [] },
    },
    evacuation: {
      decisionDeadline: '2026-09-04T15:20:00Z',
      terrainConstraints: [{ id: 'terrain:route-open', routeId: 'route:open', state: 'CLEAR', updatedAt: '2026-09-04T14:55:00Z', source: { id: 'terrain-governance', reference: 'terrain:route-open' } }],
      weatherConstraints: [{ id: 'weather:route-open', routeId: 'route:open', state: 'CLEAR', updatedAt: '2026-09-04T14:55:00Z', source: { id: 'weather-governance', reference: 'weather:route-open' } }],
      resourceConstraints: [{ id: 'resource:route-open', routeId: 'route:open', state: 'AVAILABLE', updatedAt: '2026-09-04T14:55:00Z', source: { id: 'resource-governance', reference: 'resource:route-open' } }],
      routeCandidates: [
        { id: 'route:blocked', shelterId: 'shelter:east', communityId: 'community:east', currentState: 'OPEN_CONFIRMED', segmentIds: ['segment:a'], travelTimeMinutes: 10, updatedAt: '2026-09-04T14:55:00Z', source: { id: 'road-authority', reference: 'route:blocked' } },
        { id: 'route:open', shelterId: 'shelter:east', communityId: 'community:east', currentState: 'OPEN_CONFIRMED', segmentIds: ['segment:b'], travelTimeMinutes: 14, updatedAt: '2026-09-04T14:55:00Z', source: { id: 'road-authority', reference: 'route:open' }, confidence: { state: 'ATTRIBUTABLE_CURRENT_ROUTE', score: null } },
      ],
    },
    protectionScenario: {
      ...incidentScenario,
      windows: [
        { minutes: 15, scenarioExposure: { assetIds: ['community:east'], state: 'SCENARIO_EXPOSURE' }, confidence: { state: 'SCENARIO_CONFIDENCE', score: null }, requiredPreparation: ['Review protection readiness.'], decisionDeadline: '2026-09-04T15:10:00Z', evidenceReferences: ['evidence:scenario:15'], computedAt: '2026-09-04T14:59:00Z', calculationMethod: 'ADMITTED_SCENARIO_WINDOW_INTERSECTION' },
        { minutes: 60, scenarioExposure: { assetIds: ['community:east'], state: 'SCENARIO_EXPOSURE' }, confidence: { state: 'SCENARIO_CONFIDENCE', score: null }, requiredPreparation: ['Maintain watch.'], decisionDeadline: '2026-09-04T15:30:00Z', evidenceReferences: ['evidence:scenario:60'], computedAt: '2026-09-04T14:59:00Z', calculationMethod: 'ADMITTED_SCENARIO_WINDOW_INTERSECTION' },
      ],
    },
  }));
  assert.equal(projected.evacuationCorridor.state, 'READY_FOR_AUTHORITY_REVIEW');
  assert.equal(projected.evacuationCorridor.value.recommendedCorridor.routeId, 'route:open');
  assert.deepEqual(projected.evacuationCorridor.value.blockedSegments, ['segment:a']);
  assert.equal(projected.evacuationCorridor.value.planningOnly, true);
  assert.equal(projected.evacuationCorridor.value.officialOrder, false);
  assert.equal(projected.protectionTimeline.deterministic, false);
  assert.equal(projected.protectionTimeline.windows.find((window) => window.minutes === 15).state, 'SCENARIO_AVAILABLE');
  assert.equal(projected.protectionTimeline.windows.find((window) => window.minutes === 30).state, 'WITHHELD');
});
