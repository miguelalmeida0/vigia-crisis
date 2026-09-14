import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCrisisPlanning } from '../src/crisis-planning/index.mjs';

const AS_OF = '2026-09-04T15:00:00.000Z';

function project(overrides = {}) {
  return projectCrisisPlanning({
    asOf: AS_OF,
    incident: { id: 'incident:chronology', coordinate: [-8.5, 41.2] },
    contexts: {},
    ...overrides
  });
}

function eligibleCandidate(overrides = {}) {
  return {
    facilityId: 'station:one',
    kind: 'FIRE_STATION',
    eligibleForDispatchRecommendation: true,
    capacityReportConfirmed: true,
    capacityKnown: true,
    availableCapacityConfirmed: true,
    capabilityQualified: true,
    routeState: 'ROUTED',
    travelTimeMinutes: 12,
    routeDistanceKm: 8,
    routeCheckedAt: '2026-09-04T14:55:00Z',
    capacityObservedAt: '2026-09-04T14:55:00Z',
    ...overrides
  };
}

function scenario() {
  return {
    id: 'scenario:one',
    admitted: true,
    admissionReference: 'scenario-admission:one',
    validUntil: '2026-09-04T16:00:00Z',
    source: { id: 'forecast-governance', reference: 'scenario:one:v1' }
  };
}

function shelter(overrides = {}) {
  return {
    id: 'shelter:one',
    coordinate: [-8.4, 41.2],
    operationalState: 'OPEN_CONFIRMED',
    updatedAt: '2026-09-04T14:55:00Z',
    source: { id: 'municipal-shelter-registry', reference: 'shelter:one:status' },
    ...overrides
  };
}

function route(overrides = {}) {
  return {
    id: 'route:one',
    shelterId: 'shelter:one',
    currentState: 'OPEN_CONFIRMED',
    travelTimeMinutes: 14,
    segmentIds: ['segment:one'],
    updatedAt: '2026-09-04T14:55:00Z',
    source: { id: 'road-authority', reference: 'route:one:status' },
    ...overrides
  };
}

test('future context timestamps cannot create governed point-proximity edges', () => {
  const exposure = project({
    contexts: {
      communities: [{ id: 'community:future', coordinate: [-8.4, 41.2], source: 'OpenStreetMap contributors', retrievedAt: '2026-09-04T15:00:01Z' }]
    }
  }).dynamicExposureGraph;
  assert.equal(exposure.edges.length, 0);
  assert.equal(exposure.excludedEdges[0].reason, 'FUTURE_CONTEXT_TIME_REJECTED');
});

test('canonical facility provenance and freshness chronology create attributable exposure without object-string freshness', () => {
  const exposure = project({
    responseCapability: {
      facilities: {
        FIRE_STATION: [{
          id: 'osm:node:station-one',
          kind: 'FIRE_STATION',
          name: 'Mapped station',
          coordinate: [-8.45, 41.18],
          provenance: {
            provider: 'OpenStreetMap contributors via Overpass API',
            sourceRecordId: 'node/123',
            archiveSha256: 'sha256:abc',
            retrievedAt: '2026-09-04T14:55:00Z'
          },
          freshness: {
            state: 'STATIC_SNAPSHOT',
            retrievedAt: '2026-09-04T14:55:00Z',
            limitation: 'Static mapping context only.'
          }
        }]
      },
      optimizerInputs: { candidates: [], constraints: [], unknowns: [] }
    }
  }).dynamicExposureGraph;
  const node = exposure.nodes.find((item) => item.nodeId === 'osm:node:station-one');
  assert.equal(node.source.sourceId, 'OpenStreetMap contributors via Overpass API');
  assert.equal(node.source.reference, 'node/123');
  assert.equal(node.updatedAt, '2026-09-04T14:55:00.000Z');
  assert.equal(node.freshness, 'STATIC_SNAPSHOT');
  assert.notEqual(node.freshness, '[object Object]');
  assert.ok(exposure.edges.some((edge) => edge.to === node.nodeId && edge.updatedAt === node.updatedAt));
});

test('future-dated planning evidence never becomes observed or reconciled', () => {
  const futureAt = '2026-09-04T15:00:01Z';
  const projected = project({
    contexts: {
      roads: [{ id: 'road:one', coordinate: [-8.49, 41.19], updatedAt: '2026-09-04T14:55:00Z', source: { id: 'road-authority', reference: 'road:one' } }],
      hospitals: [{ id: 'hospital:one', coordinate: [-8.45, 41.18], updatedAt: '2026-09-04T14:55:00Z', source: { id: 'hospital-registry', reference: 'hospital:one' } }],
      exposureEdges: [{
        id: 'exposure:future',
        from: 'road:one',
        to: 'hospital:one',
        observed: true,
        exposureBasis: 'FIELD_ASSESSMENT',
        observedAt: futureAt,
        source: { id: 'fieldnet', reference: 'field-report:future-exposure' },
        evidenceReferences: ['field-report:future-exposure']
      }],
      dependencies: [{
        id: 'dependency:future',
        from: 'road:one',
        to: 'hospital:one',
        effect: 'FUTURE_REPORTED_ACCESS_EFFECT',
        observed: true,
        observedAt: futureAt,
        source: { id: 'fieldnet', reference: 'field-report:future-dependency' },
        evidenceReferences: ['field-report:future-dependency'],
        confidence: { state: 'VERIFIED_OBSERVATION', score: 1 }
      }]
    },
    modelClaims: [
      { id: 'claim:current', topic: 'ROAD_STATE', subjectId: 'road:one', value: 'OPEN', observedAt: '2026-09-04T14:59:00Z', source: { id: 'road-authority', reference: 'road-state:current' } },
      { id: 'claim:future', topic: 'ROAD_STATE', subjectId: 'road:one', value: 'CLOSED', observedAt: futureAt, source: { id: 'fieldnet', reference: 'road-state:future' } }
    ],
    reconciliation: [
      { id: 'reconciliation:future-observation', modelId: 'route-model:one', expectedValue: 10, generatedAt: '2026-09-04T14:00:00Z', observedValue: 20, observedAt: futureAt, source: { id: 'fieldnet', reference: 'arrival:future' } },
      { id: 'reconciliation:future-expected', modelId: 'route-model:one', expectedValue: 12, generatedAt: futureAt, observedValue: 18, observedAt: '2026-09-04T14:58:00Z', source: { id: 'fieldnet', reference: 'arrival:current' } },
      { id: 'reconciliation:current', modelId: 'route-model:one', expectedValue: 15, generatedAt: '2026-09-04T14:00:00Z', observedValue: 17, observedAt: '2026-09-04T14:58:00Z', source: { id: 'fieldnet', reference: 'arrival:current-control' } }
    ]
  });

  assert.equal(projected.dynamicExposureGraph.edges.some((edge) => edge.from === 'road:one' && edge.to === 'hospital:one'), false);
  assert.deepEqual(
    projected.dynamicExposureGraph.excludedEdges.find((edge) => edge.from === 'road:one' && edge.to === 'hospital:one'),
    { from: 'road:one', to: 'hospital:one', reason: 'FUTURE_EXPLICIT_EDGE_TIME_REJECTED', updatedAt: '2026-09-04T15:00:01.000Z' }
  );

  const dependency = projected.crisisDependencyGraph.edges.find((edge) => edge.effect === 'FUTURE_REPORTED_ACCESS_EFFECT');
  assert.equal(dependency.state, 'SCENARIO');
  assert.equal(dependency.observed, false);
  assert.equal(dependency.observedAt, null);
  assert.deepEqual(dependency.confidence, { state: 'NOT_PROBABILISTICALLY_SCORED', score: null });
  assert.equal(dependency.downgradeReason, 'FUTURE_OBSERVATION_TIME_REJECTED');

  assert.equal(projected.modelDisagreement.state, 'NO_ATTRIBUTABLE_DISAGREEMENT_DETECTED');
  assert.deepEqual(projected.modelDisagreement.excludedClaims, [{
    claimId: 'claim:future',
    reason: 'FUTURE_CLAIM_TIME_REJECTED',
    observedAt: '2026-09-04T15:00:01.000Z'
  }]);

  const futureObservation = projected.realityReconciliation.records.find((item) => item.estimateId === 'reconciliation:future-observation');
  assert.equal(futureObservation.state, 'AWAITING_ATTRIBUTABLE_OBSERVATION');
  assert.equal(futureObservation.observed.state, 'UNKNOWN');
  assert.equal(futureObservation.observed.rejectionReason, 'FUTURE_OBSERVATION_TIME_REJECTED');
  assert.equal(futureObservation.delta.state, 'UNKNOWN');

  const futureExpected = projected.realityReconciliation.records.find((item) => item.estimateId === 'reconciliation:future-expected');
  assert.equal(futureExpected.state, 'EXPECTED_VALUE_INCOMPLETE');
  assert.equal(futureExpected.expected.state, 'UNKNOWN');
  assert.equal(futureExpected.expected.rejectionReason, 'FUTURE_EXPECTED_TIME_REJECTED');
  assert.equal(futureExpected.delta.state, 'UNKNOWN');

  const current = projected.realityReconciliation.records.find((item) => item.estimateId === 'reconciliation:current');
  assert.equal(current.state, 'RECONCILED');
  assert.equal(current.delta.value, 2);
  assert.equal(projected.realityReconciliation.modelPerformance[0].reconciledCount, 1);
});

