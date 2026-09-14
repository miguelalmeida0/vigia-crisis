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

test('sparse canonical input stays explicitly unknown and never creates exposure, prediction, authority, or execution', () => {
  const projected = projectCrisisPlanning(base());
  assert.equal(projected.dynamicExposureGraph.state, 'NO_GOVERNED_EDGES');
  assert.equal(projected.dynamicExposureGraph.owner, 'crisis-planning-projection');
  assert.equal(projected.dynamicExposureGraph.basis, 'POINT_PROXIMITY');
  assert.equal(projected.crisisDependencyGraph.state, 'NO_GOVERNED_DEPENDENCIES');
  assert.equal(projected.resourceOptimizer.state, 'WITHHELD_NO_GOVERNED_INPUTS');
  assert.equal(projected.evacuationCorridor.state, 'WITHHELD_NO_ADMITTED_SCENARIO');
  assert.equal(projected.protectionTimeline.deterministic, false);
  assert.deepEqual(projected.protectionTimeline.windows.map((window) => window.minutes), [15, 30, 60, 120]);
  assert.ok(projected.protectionTimeline.windows.every((window) => window.state === 'WITHHELD'));
  assert.equal(projected.multilingualProtectionComposer.state, 'NO_CANONICAL_MESSAGE');
  assert.equal(projected.truthBoundary.automaticCanonicalMutation, false);
  assert.equal(projected.truthBoundary.automaticConsequentialExecution, false);
});

test('dynamic exposure uses preliminary point proximity and dependency cascades remain scenario-labelled', () => {
  const projected = projectCrisisPlanning(base({
    contexts: {
      communities: [governedContext('community:east', 'Eastern community', [-8.48, 41.19])],
      roads: [governedContext('road:n2', 'N2', [-8.49, 41.19])],
      hospitals: [governedContext('hospital:one', 'Hospital one', [-8.44, 41.18])],
      dependencies: [{
        id: 'dependency:unproved',
        from: 'road:n2',
        to: 'hospital:one',
        effect: 'ROAD_CLOSURE_MAY_DEGRADE_MEDICAL_ACCESS',
        observed: true,
      }],
    },
  }));
  const proximity = projected.dynamicExposureGraph.edges.find((edge) => edge.to === 'community:east');
  assert.ok(proximity.distanceKm > 0);
  assert.equal(proximity.exposureState, 'PRELIMINARY_CONTEXT_ONLY');
  assert.equal(proximity.perimeterUsed, false);
  assert.equal(projected.dynamicExposureGraph.basis, 'POINT_PROXIMITY');
  const dependencies = projected.crisisDependencyGraph.edges.filter((edge) => edge.from === 'road:n2');
  assert.ok(dependencies.length >= 2);
  assert.ok(dependencies.every((edge) => edge.basis === 'SCENARIO' && edge.observed === false));
  assert.ok(dependencies.some((edge) => edge.downgradeReason === 'OBSERVED_LABEL_WITHHELD_WITHOUT_ATTRIBUTABLE_EVIDENCE_AND_TIME'));
  assert.equal(projected.crisisDependencyGraph.counts.observed, 0);
});

test('actual response-facility provenance and point-context retrieval time produce governed exposure', () => {
  const projected = projectCrisisPlanning(base({
    contexts: {
      hospitals: [{
        id: 'hospital:actual-shape',
        name: 'Actual-shape hospital',
        coordinate: [-8.47, 41.18],
        retrievedAt: '2026-09-04T14:40:00.000Z',
        provenance: {
          provider: 'OpenStreetMap contributors',
          sourceRecordId: 'node:123',
          archiveSha256: `sha256:${'a'.repeat(64)}`,
        },
      }],
    },
  }));
  const node = projected.dynamicExposureGraph.nodes.find((item) => item.nodeId === 'hospital:actual-shape');
  const edge = projected.dynamicExposureGraph.edges.find((item) => item.to === 'hospital:actual-shape');
  assert.equal(node.source.attributable, true);
  assert.equal(node.source.reference, 'node:123');
  assert.equal(node.updatedAt, '2026-09-04T14:40:00.000Z');
  assert.equal(edge.exposureState, 'PRELIMINARY_CONTEXT_ONLY');
});

test('model conflicts remain explicit and reality reconciliation never averages them into truth', () => {
  const projected = projectCrisisPlanning(base({
    modelClaims: [
      { id: 'field:road', topic: 'ROAD_STATE', subjectId: 'road:n2', value: 'OPEN', observedAt: '2026-09-04T14:51:00Z', source: { id: 'fieldnet', reference: 'field-report:1' }, sourceClass: 'FIELD_OBSERVATION', decisionConsequence: 'Route selection remains blocked.' },
      { id: 'official:road', topic: 'ROAD_STATE', subjectId: 'road:n2', value: 'CLOSED', observedAt: '2026-09-04T14:52:00Z', source: { id: 'road-authority', reference: 'closure:77' }, sourceClass: 'OFFICIAL_SOURCE' },
    ],
    reconciliation: [
      { id: 'eta:one', modelId: 'route-model:a', expectedValue: 18, generatedAt: '2026-09-04T14:00:00Z', observedValue: 27, observedAt: '2026-09-04T14:40:00Z', unit: 'minutes', source: { id: 'fieldnet', reference: 'arrival:one' }, why: 'Observed arrival was later.', decisionConsequence: 'Review future staging lead time.' },
      { id: 'eta:two', modelId: 'route-model:a', expectedValue: 15, generatedAt: '2026-09-04T13:00:00Z', observedValue: 21, observedAt: '2026-09-04T13:40:00Z', unit: 'minutes', source: { id: 'dispatch', reference: 'arrival:two' } },
    ],
  }));
  assert.equal(projected.modelDisagreement.state, 'DISAGREEMENTS_PRESENT');
  const disagreement = projected.modelDisagreement.disagreements[0];
  assert.equal(disagreement.valuesAveraged, false);
  assert.equal(disagreement.claimA.value === 'OPEN' || disagreement.claimB.value === 'OPEN', true);
  assert.equal(disagreement.claimA.value === 'CLOSED' || disagreement.claimB.value === 'CLOSED', true);
  assert.equal(disagreement.decisionConsequence, 'Route selection remains blocked.');
  assert.equal(projected.realityReconciliation.records[0].delta.value, 9);
  assert.equal(projected.realityReconciliation.modelPerformance[0].repeatedErrorAssessment, 'REPEATED_DIFFERENCE_OBSERVED');
  assert.equal(projected.realityReconciliation.modelPerformance[0].causalJudgement, 'NOT_INFERRED');
});

test('structured command intent and operational period remain proposed until governed human approval', () => {
  const projected = projectCrisisPlanning(base({
    sourceProjectionHash: `canonical-governed-operator-twin:sha256:${'a'.repeat(64)}`,
    compiledAgainstIntentHash: `command-intent:sha256:${'b'.repeat(64)}`,
    planningDecisions: [{ decisionId: 'decision:prior-review', proposalType: 'OPERATIONAL_PERIOD', state: 'REJECTED', recordedAt: '2026-09-04T14:58:00.000Z', mutationsApplied: false }],
    planningDecisionInventory: { total: 1, returned: 1, truncated: false, reference: '/api/v10/incident-command/incidents/governed-one/events' },
    commandIntent: {
      id: 'intent:road',
      statement: 'Keep hospital access open.',
      intentType: 'KEEP_ACCESS_OPEN',
      target: 'road:n2',
      requestedBy: 'operator:one',
      owner: 'planning:one',
      deadline: '2026-09-04T15:30:00Z',
      periodStart: '2026-09-04T15:00:00Z',
      periodEnd: '2026-09-04T18:00:00Z',
      requestedAt: '2026-09-04T14:59:00Z',
    },
    operationalPeriodProposal: {
      id: 'period:one',
      periodStart: '2026-09-04T15:00:00Z',
      periodEnd: '2026-09-04T18:00:00Z',
      tactics: [{ id: 'tactic:monitor-road', description: 'Monitor admitted road reports.', owner: 'planning:one', deadline: '2026-09-04T15:15:00Z' }],
      resourceNeeds: [{ id: 'need:observer', description: 'Road observer capability', owner: 'operations:one', deadline: '2026-09-04T15:10:00Z' }],
      safetyConstraints: [{ id: 'safety:one', constraint: 'Do not task public observers toward danger.' }],
      decisionGates: [{ id: 'gate:road', description: 'Review any attributable closure.', owner: 'incident-command:one', deadline: '2026-09-04T15:20:00Z' }],
    },
  }));
  assert.equal(projected.commandIntent.state, 'READY_FOR_HUMAN_CONFIRMATION');
  assert.equal(projected.commandIntent.value.proposedOnly, true);
  assert.equal(projected.commandIntent.value.assignments[0].acknowledgementState, 'NOT_REQUESTED');
  assert.equal(projected.commandIntent.value.protectionDraft, null);
  assert.equal(projected.operationalPeriodProposal.state, 'READY_FOR_HUMAN_APPROVAL');
  assert.equal(projected.operationalPeriodProposal.value.approvalRequired, true);
  assert.equal(projected.operationalPeriodProposal.value.assignmentsCreated, false);
  assert.equal(projected.operationalPeriodProposal.value.resourcesDispatched, false);
  assert.equal(projected.proposalReviewBindings.OPERATIONAL_PERIOD.state, 'CURRENT_REVIEWABLE_PROPOSAL');
  assert.equal(projected.proposalReviewBindings.OPERATIONAL_PERIOD.proposalHash, projected.operationalPeriodProposal.value.proposalHash);
  assert.match(projected.proposalReviewBindings.OPERATIONAL_PERIOD.proposalVersion, /^crisis-planning-proposal-version:sha256:[a-f0-9]{64}$/u);
  assert.equal(projected.proposalReviewBindings.OPERATIONAL_PERIOD.sourceProjectionHash, `canonical-governed-operator-twin:sha256:${'a'.repeat(64)}`);
  assert.equal(projected.proposalReviewBindings.OPERATIONAL_PERIOD.compiledAgainstIntentHash, `command-intent:sha256:${'b'.repeat(64)}`);
  assert.equal(projected.planningReview.rejected, 1);
  assert.equal(projected.planningReview.decisions[0].decisionId, 'decision:prior-review');
  assert.equal(projected.planningReview.inventory.reference, '/api/v10/incident-command/incidents/governed-one/events');
});
