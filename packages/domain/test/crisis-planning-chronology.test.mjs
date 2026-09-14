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

test('operational-period proposals fail closed for reversed or already-ended periods', () => {
  const reversed = project({
    operationalPeriodProposal: {
      periodStart: '2026-09-04T16:00:00Z',
      periodEnd: '2026-09-04T15:30:00Z',
      objectives: [{ id: 'objective:one', statement: 'Maintain access.', owner: 'planning:one', deadline: '2026-09-04T15:20:00Z' }]
    }
  }).operationalPeriodProposal;
  assert.equal(reversed.state, 'BLOCKED_INCOMPLETE');
  assert.ok(reversed.value.missing.includes('PERIOD_CHRONOLOGY'));

  const ended = project({
    operationalPeriodProposal: {
      periodStart: '2026-09-04T13:00:00Z',
      periodEnd: '2026-09-04T14:59:59Z',
      objectives: [{ id: 'objective:one', statement: 'Maintain access.', owner: 'planning:one', deadline: '2026-09-04T15:20:00Z' }]
    }
  }).operationalPeriodProposal;
  assert.ok(ended.value.missing.includes('PERIOD_ALREADY_ENDED'));
});

test('resource recommendations require future deadlines and non-negative routed travel times', () => {
  const responseCapability = { schemaVersion: 'vigia.response-capability.v1', optimizerInputs: { candidates: [eligibleCandidate()], constraints: [], unknowns: [] } };
  const expired = project({
    responseCapability,
    taskRequirements: [{ id: 'requirement:one', requiredKind: 'FIRE_STATION', owner: 'operations:one', deadline: '2026-09-04T14:59:59Z' }]
  }).resourceOptimizer;
  assert.equal(expired.state, 'NO_ELIGIBLE_RECOMMENDATION');
  assert.equal(expired.value.remainingUncoveredDemand[0].state, 'DEADLINE_EXPIRED');

  const impossibleEta = project({
    responseCapability: { ...responseCapability, optimizerInputs: { ...responseCapability.optimizerInputs, candidates: [eligibleCandidate({ travelTimeMinutes: -2 })] } },
    taskRequirements: [{ id: 'requirement:one', requiredKind: 'FIRE_STATION', demandMode: 'BINARY_CAPABILITY', owner: 'operations:one', deadline: '2026-09-04T15:30:00Z' }]
  }).resourceOptimizer;
  assert.equal(impossibleEta.state, 'NO_ELIGIBLE_RECOMMENDATION');
  assert.equal(impossibleEta.value.remainingUncoveredDemand[0].state, 'NO_ELIGIBLE_ATTRIBUTABLE_CAPACITY');
});

test('evacuation planning rejects future, stale, and travel-time-incomplete route context', () => {
  const futureRoute = project({
    contexts: { shelters: [shelter()] },
    incidentScenario: scenario(),
    evacuation: { decisionDeadline: '2026-09-04T15:20:00Z', routeCandidates: [route({ updatedAt: '2026-09-04T15:00:01Z' })] }
  }).evacuationCorridor;
  assert.equal(futureRoute.state, 'WITHHELD_NO_GOVERNED_OPEN_CORRIDOR');
  assert.equal(futureRoute.value.routesAssessed[0].exclusionReason, 'ATTRIBUTABLE_CURRENT_ROUTE_SOURCE_REQUIRED');

  const staleShelter = project({
    contexts: { shelters: [shelter({ updatedAt: '2026-09-04T14:29:59Z' })] },
    incidentScenario: scenario(),
    evacuation: { decisionDeadline: '2026-09-04T15:20:00Z', routeCandidates: [route()] }
  }).evacuationCorridor;
  assert.equal(staleShelter.value.routesAssessed[0].exclusionReason, 'CURRENT_ATTRIBUTABLE_SHELTER_AVAILABILITY_REQUIRED');

  const missingEta = project({
    contexts: { shelters: [shelter()] },
    incidentScenario: scenario(),
    evacuation: { decisionDeadline: '2026-09-04T15:20:00Z', routeCandidates: [route({ travelTimeMinutes: null })] }
  }).evacuationCorridor;
  assert.equal(missingEta.value.routesAssessed[0].exclusionReason, 'NON_NEGATIVE_ROUTE_TRAVEL_TIME_REQUIRED');
});

test('CAP histories and replanning triggers reject future or decreasing event time', () => {
  const cap = project({
    capProtection: {
      mode: 'EXERCISE',
      events: [
        { id: 'event:validate', action: 'VALIDATE', actor: 'validator:one', reference: 'validation:one', at: '2026-09-04T14:59:00Z' },
        { id: 'event:review', action: 'AUTHORITY_REVIEW', actor: 'authority:one', reference: 'review:one', at: '2026-09-04T14:58:00Z' },
        { id: 'event:future', action: 'AUTHORITY_REVIEW', actor: 'authority:one', reference: 'review:future', at: '2026-09-04T15:00:01Z' }
      ]
    }
  }).capProtection;
  assert.equal(cap.state, 'INVALID_TRANSITIONS_PRESENT');
  assert.deepEqual(cap.rejectedTransitions.map((item) => item.reason), [
    'cap_protection_transition_chronology_invalid',
    'cap_protection_future_transition_rejected'
  ]);

  const replan = project({
    responseCapability: { roadContext: { closures: [] }, optimizerInputs: { candidates: [], constraints: [], unknowns: [] } },
    replanning: { oldPlan: { id: 'plan:one', assignments: [] } },
    triggers: [{ id: 'trigger:future', type: 'WEATHER_CHANGED', observedAt: '2026-09-04T15:00:01Z', source: { id: 'weather-source', reference: 'weather:future' } }]
  }).autonomousReplanning;
  assert.equal(replan.state, 'NO_REPLAN_TRIGGER');
  assert.equal(replan.value.rejectedTriggers[0].reason, 'FUTURE_TRIGGER_TIME_REJECTED');
});

