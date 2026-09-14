import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseCapabilityProjection, normalizeDynamicCapacity } from '../src/response-capability/index.mjs';
import { at, facility } from './response-capability-fixtures.mjs';

test('all facility classes remain explicit even when governed source coverage is empty', () => {
  const result = buildResponseCapabilityProjection({ incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at });
  assert.deepEqual(Object.keys(result.facilities), [
    'HOSPITAL', 'FIRE_STATION', 'EMS_BASE', 'CIVIL_PROTECTION', 'POLICE', 'PUBLIC_INSTITUTION', 'SHELTER', 'WATER_POINT', 'AIR_SUPPORT_BASE'
  ]);
  assert.ok(Object.values(result.facilities).every(Array.isArray));
});

test('null and empty generic capacity fields never become confirmed zero availability', () => {
  const unknown = facility('ems-unknown', 'EMS_BASE', 12);
  unknown.reachability.currentRoute.geometry = { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.4, 41.1]] };
  unknown.dynamicCapacity = { state: 'FIELD_REPORTED', fields: { unitsAvailable: null, crewsAvailable: null, constraints: [] }, confidence: { state: 'ATTRIBUTABLE_REPORT', score: null } };
  const zero = facility('ems-zero', 'EMS_BASE', 14);
  zero.reachability.currentRoute.geometry = { type: 'LineString', coordinates: [[-8.5, 41.2], [-8.42, 41.11]] };
  zero.dynamicCapacity = { state: 'FIELD_REPORTED', fields: { unitsAvailable: 0, crewsAvailable: null, constraints: [] }, confidence: { state: 'ATTRIBUTABLE_REPORT', score: null } };
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { EMS_BASE: [unknown, zero] }
  });
  const byFacility = new Map(result.resourceCoverageMap.routeFeatures.features.map((feature) => [feature.properties.facilityId, feature.properties.capacityAvailability]));
  assert.equal(byFacility.get('ems-unknown'), 'UNKNOWN');
  assert.equal(byFacility.get('ems-zero'), 'CONFIRMED_NO_AVAILABLE_CAPACITY');
});

test('optimizer prefers a farther attributable-capacity facility and preserves commitment, staging, and coverage constraints', () => {
  const unavailable = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:near', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Governed dispatch fixture', reference: 'dispatch:near' }, crewsAvailable: 0, crewsAssigned: 2, tankersAvailable: 0
  }, { now: new Date(at) });
  const available = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:far', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Governed dispatch fixture', reference: 'dispatch:far' }, crewsAvailable: 4, wildfireCrewsAvailable: 3, tankersAvailable: 1
  }, { now: new Date(at) });
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:optimizer', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [facility('station-near', 'FIRE_STATION', 10, unavailable), facility('station-far', 'FIRE_STATION', 18, available)] },
    decisionContext: {
      fireCapacityRequired: true,
      resourceDemand: { source: 'exercise:demand:1', byFacilityKind: { FIRE_STATION: { required: 2 } } },
      currentCommitments: { source: 'exercise:commitments:1', byFacilityId: { 'station-far': 1 } },
      stagingConstraints: { byFacilityId: { 'station-far': { state: 'SAFE' } } },
      coverageTradeoffs: { byFacilityId: { 'station-far': 2 } }
    }
  });
  const recommendation = result.recommendations.find((item) => item.kind === 'FIRE_RESPONSE_REVIEW');
  const candidate = result.optimizerInputs.candidates.find((item) => item.facilityId === 'station-far');
  assert.equal(recommendation.facilityId, 'station-far');
  assert.match(recommendation.recommendation, /closest by routed time.*18 minutes|closest by routed time/i);
  assert.equal(candidate.requiredQuantity, 2);
  assert.equal(candidate.competingDemandQuantity, 1);
  assert.equal(candidate.effectiveAvailableQuantity, 3);
  assert.equal(candidate.stagingSafety, 'SAFE');
  assert.equal(candidate.coveragePenalty, 2);
  assert.equal(candidate.eligibleForDispatchRecommendation, true);
  assert.ok(result.responseGaps.some((gap) => gap.code === 'NEAREST_FIRE_CAPACITY_COMMITTED'));
  assert.ok(result.resourceOptimizer.recommendedStaging.every((item) => item.dispatchClaimed === false && item.requiresHumanApproval));
  assert.ok(Number.isSafeInteger(recommendation.recommendationVersion));
  assert.match(recommendation.recommendationHash, /:sha256:/);
  const refreshed = buildResponseCapabilityProjection({
    incident: { id: 'incident:optimizer', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' },
    generatedAt: '2026-09-04T15:01:00.000Z',
    facilitiesByKind: { FIRE_STATION: [facility('station-near', 'FIRE_STATION', 10, unavailable), facility('station-far', 'FIRE_STATION', 18, available)] },
    decisionContext: {
      fireCapacityRequired: true,
      resourceDemand: { source: 'exercise:demand:1', byFacilityKind: { FIRE_STATION: { required: 2 } } },
      currentCommitments: { source: 'exercise:commitments:1', byFacilityId: { 'station-far': 1 } },
      stagingConstraints: { byFacilityId: { 'station-far': { state: 'SAFE' } } },
      coverageTradeoffs: { byFacilityId: { 'station-far': 2 } }
    }
  });
  const refreshedRecommendation = refreshed.recommendations.find((item) => item.kind === 'FIRE_RESPONSE_REVIEW');
  assert.equal(refreshedRecommendation.recommendationId, recommendation.recommendationId);
  assert.equal(refreshedRecommendation.recommendationHash, recommendation.recommendationHash);
  assert.notEqual(refreshed.projectionId, result.projectionId);
});

test('response gap detector exposes route redundancy, water support, tanker uncertainty, and shared chokepoints without inventing closure effects', () => {
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:gaps', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }, generatedAt: at,
    facilitiesByKind: {
      FIRE_STATION: [facility('station-one', 'FIRE_STATION', 16)], HOSPITAL: [facility('hospital-one', 'HOSPITAL', 22)], WATER_POINT: [facility('water-far', 'WATER_POINT', 55)]
    },
    roadContext: { state: 'GOVERNED', chokepoints: [{ id: 'bridge-one', uses: ['EVACUATION_EGRESS', 'RESPONDER_ACCESS'] }] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }
  });
  const codes = new Set(result.responseGaps.map((gap) => gap.code));
  for (const code of ['WATER_TANKER_CAPACITY_UNCONFIRMED', 'WATER_SUPPORT_REACHABILITY_UNAVAILABLE', 'HOSPITAL_ROUTE_REDUNDANCY_UNCONFIRMED', 'SHARED_EVACUATION_RESPONSE_CHOKEPOINT']) assert.ok(codes.has(code), code);
  assert.ok(result.responseGaps.every((gap) => gap.why && gap.impact && gap.whatVigiaIsDoing && gap.recommendedAction));
});

test('surge engines compute bounded ranges only from attributable admitted drivers and never add hidden coefficients', () => {
  const sourced = (value, reference) => ({ ...value, source: { reference } });
  const zero = Object.fromEntries(['engines', 'tankers', 'crews', 'commandUnits', 'medicalSupport', 'waterSupport', 'airSupport'].map((key) => [key, [0, 0]]));
  const coefficient = Object.fromEntries(Object.keys(zero).map((key) => [key, sourced({ min: 0.5, max: 1 }, `model:${key}`)]));
  const common = {
    admitted: true, admissionReference: 'admission:surge:drivers', updatedAt: '2026-09-04T14:58:00Z', validUntil: '2026-09-04T15:30:00Z',
    source: { name: 'Governed exercise driver set', reference: 'exercise:drivers:1' }, confidence: 'BOUNDED_EXERCISE_RANGE',
    assumptions: ['All drivers are isolated exercise inputs.'], invalidatedBy: ['Any newer admitted driver revision.'], derivation: { kind: 'ADMITTED_DRIVER_RANGES' }
  };
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:surge', coordinate: [-8.5, 41.2] }, generatedAt: at,
    decisionContext: {
      medicalSurgeInput: { ...common, governedDrivers: {
        populationAtRisk: sourced({ min: 100, max: 200 }, 'census:exercise'),
        medicalSupportRateByScenario: { LOW: sourced({ min: 0.01, max: 0.02 }, 'rate:low'), MODERATE: sourced({ min: 0.03, max: 0.05 }, 'rate:moderate'), HIGH: sourced({ min: 0.06, max: 0.1 }, 'rate:high') }
      } },
      fireResponseSurgeInput: { ...common, available: zero, enRoute: zero, committed: zero, governedDrivers: {
        incidentScale: sourced({ min: 2, max: 4 }, 'scale:exercise'), resourceCoefficients: coefficient
      } }
    }
  });
  assert.equal(result.medicalSurge.state, 'ADMITTED_SCENARIO_RANGES');
  assert.deepEqual(result.medicalSurge.scenarios[0].range, { min: 1, max: 4 });
  assert.equal(result.medicalSurge.derivation.hiddenCoefficients, false);
  assert.equal(result.fireResponseSurge.state, 'ADMITTED_SCENARIO_RANGES');
  assert.deepEqual(result.fireResponseSurge.resources[0].required, { min: 1, max: 4 });
  assert.equal(result.fireResponseSurge.derivation.hiddenCoefficients, false);
  const ungoverned = buildResponseCapabilityProjection({
    incident: { id: 'incident:surge', coordinate: [-8.5, 41.2] }, generatedAt: at,
    decisionContext: { medicalSurgeInput: { ...common, governedDrivers: { populationAtRisk: { min: 100, max: 200 }, medicalSupportRateByScenario: {} } } }
  });
  assert.equal(ungoverned.medicalSurge.state, 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT');
});
