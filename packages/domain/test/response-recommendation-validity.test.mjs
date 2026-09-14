import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseCapabilityProjection, normalizeDynamicCapacity } from '../src/response-capability/index.mjs';
import { createResponseRecommendationReview } from '../src/response-capability/recommendation-review.mjs';
import { at, facility } from './response-capability-fixtures.mjs';

const decisionContext = {
  fireCapacityRequired: true,
  resourceDemand: { source: 'exercise:demand', byFacilityKind: { FIRE_STATION: { required: 1 } } }
};

function currentFireFacility() {
  const capacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:capacity:one',
    observedAt: '2026-09-04T14:58:00Z', nextExpectedUpdateAt: '2026-09-04T15:10:00Z',
    source: { name: 'FieldNet aggregate report', reference: 'report:capacity:one' },
    wildfireCrewsAvailable: 2
  }, { now: new Date(at) });
  return facility('station:one', 'FIRE_STATION', 8, capacity);
}

test('passive reads never slide recommendation validity and every primary/staging item exposes its support deadline', () => {
  const station = currentFireFacility();
  const first = buildResponseCapabilityProjection({
    incident: { id: 'incident:validity', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [station] }, decisionContext
  });
  const later = buildResponseCapabilityProjection({
    incident: { id: 'incident:validity', coordinate: [-8.5, 41.2] }, generatedAt: '2026-09-04T15:05:00Z',
    facilitiesByKind: { FIRE_STATION: [station] }, decisionContext
  });
  const primary = first.recommendations.find((item) => item.facilityId === station.id);
  const refreshed = later.recommendations.find((item) => item.facilityId === station.id);
  const staging = first.resourceOptimizer.recommendedStaging[0];
  assert.equal(primary.validUntil, '2026-09-04T15:10:00.000Z');
  assert.equal(refreshed.validUntil, primary.validUntil);
  assert.equal(refreshed.recommendationId, primary.recommendationId);
  assert.equal(refreshed.recommendationVersion, primary.recommendationVersion);
  assert.equal(refreshed.recommendationHash, primary.recommendationHash);
  for (const recommendation of [primary, staging]) {
    assert.equal(recommendation.nextSourceUpdate, '2026-09-04T15:10:00.000Z');
    assert.match(recommendation.nextInvalidatingCondition, /route, capacity, incident-demand/);
    assert.equal(recommendation.freshnessRequirement.routeMaximumAgeMinutes, 15);
    assert.equal(recommendation.freshnessRequirement.capacityMaximumAgeMinutes, 30);
  }
});

test('a governing support change changes recommendation version/hash without changing stable identity', () => {
  const station = currentFireFacility();
  const first = buildResponseCapabilityProjection({
    incident: { id: 'incident:validity', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [station] }, decisionContext
  });
  const changedStation = structuredClone(station);
  changedStation.reachability.checkedAt = '2026-09-04T15:02:00Z';
  const changed = buildResponseCapabilityProjection({
    incident: { id: 'incident:validity', coordinate: [-8.5, 41.2] }, generatedAt: '2026-09-04T15:02:00Z',
    facilitiesByKind: { FIRE_STATION: [changedStation] }, decisionContext
  });
  const left = first.recommendations.find((item) => item.facilityId === station.id);
  const right = changed.recommendations.find((item) => item.facilityId === station.id);
  assert.equal(right.recommendationId, left.recommendationId);
  assert.notEqual(right.recommendationVersion, left.recommendationVersion);
  assert.notEqual(right.recommendationHash, left.recommendationHash);
  assert.equal(right.supportEpoch.routeCheckedAt, '2026-09-04T15:02:00.000Z');
});

test('recommendations without a finite governing support deadline cannot be acknowledged', () => {
  const projection = buildResponseCapabilityProjection({
    incident: { id: 'incident:no-support', coordinate: [-8.5, 41.2] }, generatedAt: at
  });
  const recommendation = projection.recommendations[0];
  assert.equal(recommendation.validUntil, null);
  assert.equal(recommendation.state, 'WITHHELD_STALE_OR_UNTIMED_SUPPORT');
  assert.throws(() => createResponseRecommendationReview({
    incidentId: 'incident:no-support', projection,
    recommendationId: recommendation.recommendationId,
    input: {
      projectionId: projection.projectionId,
      recommendationVersion: recommendation.recommendationVersion,
      recommendationHash: recommendation.recommendationHash,
      disposition: 'ACKNOWLEDGED_FOR_REVIEW', idempotencyKey: 'review:no-support'
    },
    actorId: 'operator:test', now: new Date(at)
  }), /response_recommendation_validity_unavailable/);
});
