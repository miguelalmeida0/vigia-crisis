import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseCapabilityProjection, normalizeDynamicCapacity } from '../src/response-capability/index.mjs';
import { at, facility } from './response-capability-fixtures.mjs';

test('unknown dynamic hospital and fire capacity remains null and creates decision-relevant collection paths', () => {
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }, generatedAt: at,
    facilitiesByKind: { HOSPITAL: [facility('hospital-1', 'HOSPITAL', 24)], FIRE_STATION: [facility('station-1', 'FIRE_STATION', 18)] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }, sourceAvailability: {}
  });
  assert.equal(result.informationRequirements.length, 2);
  assert.deepEqual(result.informationRequirements.map((item) => item.state), ['BLOCKED_SOURCE_CONNECTOR', 'BLOCKED_SOURCE_CONNECTOR']);
  assert.ok(result.informationRequirements.every((item) => item.collectionPlan.strategies.length >= 3));
  assert.ok(result.informationRequirements.every((item) => /do not prove task dispatch/i.test(item.truthBoundary)));
  assert.equal(result.facilities.HOSPITAL[0].dynamicCapacity.fields.bedsAvailable, null);
  assert.equal(result.facilities.FIRE_STATION[0].dynamicCapacity.fields.crewsAvailable, null);
  assert.ok(result.responseGaps.some((gap) => gap.code === 'HOSPITAL_CAPACITY_UNCONFIRMED'));
  assert.ok(result.responseGaps.some((gap) => gap.code === 'WILDFIRE_RESPONSE_CAPACITY_UNCONFIRMED'));
  assert.ok(result.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation === false));
});

test('unknown capacity creates a plan only when it is decision-relevant', () => {
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:relevance', coordinate: [-8.5, 41.2], truthState: 'NEEDS_REVALIDATION' }, generatedAt: at,
    facilitiesByKind: { EMS_BASE: [facility('ems-1', 'EMS_BASE', 14)], SHELTER: [facility('shelter-1', 'SHELTER', 20)] },
    decisionContext: { requiredFacilityKinds: ['EMS_BASE'] },
  });
  assert.equal(result.optimizerInputs.candidates.find((item) => item.facilityId === 'ems-1').capacityDecisionRelevant, true);
  assert.equal(result.optimizerInputs.candidates.find((item) => item.facilityId === 'shelter-1').capacityDecisionRelevant, false);
  assert.deepEqual(result.informationRequirements.map((item) => item.subjectId), ['ems-1']);
  assert.equal(result.informationRequirements[0].collectionPlan.strategies.length, 3);
});

test('an admitted context-only report never turns null decision capacity into confirmed zero', () => {
  const fireCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:context-only-fire',
    observedAt: '2026-09-04T14:58:00Z', source: { name: 'VIGIA FieldNet', reference: 'field:context-only-fire' },
    communicationsStatus: 'OPERATIONAL'
  }, { now: new Date(at) });
  const hospitalCapacity = normalizeDynamicCapacity('HOSPITAL', {
    state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:context-only-hospital',
    observedAt: '2026-09-04T14:58:00Z', source: { name: 'VIGIA FieldNet', reference: 'field:context-only-hospital' },
    ambulanceAccess: 'OPEN'
  }, { now: new Date(at) });
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:context-only-capacity', coordinate: [-8.5, 41.2], truthState: 'VERIFIED_CURRENT' }, generatedAt: at,
    facilitiesByKind: {
      FIRE_STATION: [facility('station-context-only', 'FIRE_STATION', 18, fireCapacity)],
      HOSPITAL: [facility('hospital-context-only', 'HOSPITAL', 24, hospitalCapacity)]
    },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }
  });
  assert.deepEqual(result.informationRequirements.map((item) => item.subjectId).sort(), ['hospital-context-only', 'station-context-only']);
  assert.ok(result.optimizerInputs.candidates.every((item) => item.capacityKnown === false));
  assert.ok(result.optimizerInputs.candidates.every((item) => item.availableCapacityConfirmed === false));
  assert.ok(result.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation === false));
  assert.ok(result.responseGaps.filter((gap) => ['HOSPITAL_CAPACITY_UNCONFIRMED', 'WILDFIRE_RESPONSE_CAPACITY_UNCONFIRMED'].includes(gap.code))
    .every((gap) => gap.informationRequirementIds.length === 1));
});

test('canonical operational truth is retained in the response-capability incident contract', () => {
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2], operationalTruth: { classification: 'VERIFIED_CURRENT' } }, generatedAt: at
  });
  assert.equal(result.incident.truthState, 'VERIFIED_CURRENT');
});

test('attributable current aggregate reports become optimizer inputs without exposing staff identity fields', () => {
  const hospitalCapacity = normalizeDynamicCapacity('HOSPITAL', {
    state: 'PARTNER_REPORTED', admitted: true, admissionReference: 'admission:42', observedAt: '2026-09-04T14:55:00Z', source: { name: 'Regional health authority', reference: 'capacity:42' },
    bedsAvailable: 12, icuAvailableBeds: 2, acceptingPatients: true,
    doctorsOnDuty: 4, staffNames: ['must-not-project'], personalPhone: '+351000000000'
  }, { now: new Date(at) });
  const fireCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:77', observedAt: '2026-09-04T14:58:00Z', source: { name: 'Regional dispatch', reference: 'dispatch:77' },
    crewsAvailable: 2, enginesAvailable: 1, tankersAvailable: 1, firefighterNames: ['must-not-project']
  }, { now: new Date(at) });
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { HOSPITAL: [facility('hospital-1', 'HOSPITAL', 24, hospitalCapacity)], FIRE_STATION: [facility('station-1', 'FIRE_STATION', 18, fireCapacity)] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }
  });
  assert.equal(result.informationRequirements.length, 0);
  assert.ok(result.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation));
  assert.equal(result.resourceOptimizer.state, 'ADVISORY_CANDIDATES_READY');
  assert.equal(result.resourceOptimizer.recommendedStaging.length, 2);
  assert.ok(result.resourceOptimizer.recommendedStaging.every((item) => item.requiresHumanApproval && item.dispatchClaimed === false && item.validUntil));
  assert.equal(hospitalCapacity.fields.doctorsOnDuty, 4);
  assert.doesNotMatch(JSON.stringify(result), /must-not-project|personalPhone|staffNames|firefighterNames/);
});
