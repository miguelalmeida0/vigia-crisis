import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponseCapabilityProjection, normalizeDynamicCapacity } from '../src/response-capability/index.mjs';
import { at, facility } from './response-capability-fixtures.mjs';
import './response-capability-admission.case.mjs';
import './response-capability-surge-admission.case.mjs';
import './response-capability-optimizer.case.mjs';

test('stale reports remain stale and cannot prove current resource availability', () => {
  const stale = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'LIVE_CONFIRMED', admitted: true, admissionReference: 'admission:station:1', observedAt: '2026-09-04T12:00:00Z', source: { name: 'Trusted station operator', reference: 'station-report:1' }, crewsAvailable: 9
  }, { now: new Date(at), staleAfterMs: 30 * 60_000 });
  assert.equal(stale.state, 'STALE');
  assert.equal(stale.truthState, 'LIVE_CONFIRMED');
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [facility('station-1', 'FIRE_STATION', 18, stale)] },
    decisionContext: { fireCapacityRequired: true }
  });
  assert.equal(result.optimizerInputs.candidates[0].confirmedCapacity, false);
  assert.equal(result.informationRequirements.length, 1);
});

test('unadmitted, unattributed, and future capacity claims remain unknown', () => {
  const reports = [
    { state: 'LIVE_CONFIRMED', observedAt: '2026-09-04T14:55:00Z', source: { name: 'Unknown submitter', reference: 'claim:1' }, crewsAvailable: 8 },
    { state: 'DISPATCH_CONFIRMED', admitted: true, observedAt: '2026-09-04T14:55:00Z', source: { name: 'Dispatch without receipt' }, crewsAvailable: 8 },
    { state: 'FIELD_REPORTED', admitted: true, observedAt: '2026-09-04T14:55:00Z', source: { name: 'Trusted field lane', reference: 'field:1' }, crewsAvailable: 8 },
    { state: 'FIELD_REPORTED', admitted: true, admissionReference: 'admission:future:1', observedAt: '2026-09-04T15:10:00Z', source: { name: 'Trusted field lane', reference: 'field:1' }, crewsAvailable: 8 }
  ];
  for (const report of reports) {
    const capacity = normalizeDynamicCapacity('FIRE_STATION', report, { now: new Date(at) });
    assert.equal(capacity.state, 'UNKNOWN');
    assert.equal(capacity.fields.crewsAvailable, null);
  }
});

test('admitted FieldNet-shaped aggregate capacity maps without inventing individual staffing', () => {
  const capacity = normalizeDynamicCapacity('HOSPITAL', {
    state: 'FIELD_REPORTED', admissionState: 'ADMITTED', admissionReference: 'admission:field:12',
    observedAt: '2026-09-04T14:57:00Z', source: { name: 'VIGIA FieldNet', reference: 'field-observation:12' },
    edStatus: 'LIMITED', icuAvailability: 'UNKNOWN', bedsAvailable: 4,
    staffAvailable: { DOCTORS: 2, NURSES: 5, TOTAL_OPERATIONAL_STAFF: 11 },
    ambulanceAccess: 'RESTRICTED', acceptingPatients: 'YES', nextExpectedUpdate: '2026-09-04T15:20:00Z'
  }, { now: new Date(at) });
  assert.equal(capacity.state, 'FIELD_REPORTED');
  assert.equal(capacity.fields.emergencyDepartmentStatus, 'LIMITED');
  assert.equal(capacity.fields.doctorsOnDuty, 2);
  assert.equal(capacity.fields.nursesOnDuty, 5);
  assert.equal(capacity.fields.acceptingPatients, true);
  assert.equal(capacity.fields.staffingLevel, null);
  assert.deepEqual(capacity.fields.constraints, []);
  assert.equal(capacity.nextExpectedUpdateAt, '2026-09-04T15:20:00.000Z');
  assert.doesNotMatch(JSON.stringify(capacity), /TOTAL_OPERATIONAL_STAFF/);
});

test('confirmed aggregate headcount does not substitute for incident-relevant facility capability', () => {
  const capacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:general-crew', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Regional dispatch', reference: 'dispatch:general-crew' }, crewsAvailable: 3
  }, { now: new Date(at) });
  const station = facility('station-general', 'FIRE_STATION', 12, capacity);
  station.staticCapability.wildfireCapability = { state: 'UNKNOWN', value: null };
  const result = buildResponseCapabilityProjection({ incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at, facilitiesByKind: { FIRE_STATION: [station] } });
  const candidate = result.optimizerInputs.candidates[0];
  assert.equal(candidate.confirmedCapacity, true);
  assert.equal(candidate.capabilityQualified, false);
  assert.equal(candidate.eligibleForDispatchRecommendation, false);
  assert.ok(candidate.exclusionReasons.includes('INCIDENT_RELEVANT_STATIC_OR_REPORTED_CAPABILITY_NOT_CONFIRMED'));
});

test('reachability bands count only road-routed facilities and preserve distance-only fallbacks as unknown time', () => {
  const fallback = facility('station-fallback', 'FIRE_STATION', 1);
  fallback.reachability = { ...fallback.reachability, state: 'DISTANCE_ONLY_FALLBACK', travelTimeMinutes: null, routeDistanceKm: null, currentRoute: null };
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [facility('station-routed', 'FIRE_STATION', 18), fallback] }
  });
  assert.equal(result.reachabilityBands.fire.find((item) => item.minutes === 20).count, 1);
  assert.equal(result.optimizerInputs.candidates.find((item) => item.facilityId === 'station-fallback').travelTimeMinutes, null);
  assert.ok(result.responseGaps.every((gap) => gap.why && gap.impact && gap.whatVigiaIsDoing));
});

test('confirmed zero capacity resolves the unknown but never becomes available or dispatch-eligible', () => {
  const fireCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:zero-fire', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Regional dispatch', reference: 'dispatch:zero-fire' }, crewsAvailable: 0, enginesAvailable: 0,
    specialistCapabilities: ['WILDFIRE'], communicationsStatus: 'DEGRADED', constraints: ['No available crew.']
  }, { now: new Date(at) });
  const hospitalCapacity = normalizeDynamicCapacity('HOSPITAL', {
    state: 'PARTNER_REPORTED', admitted: true, admissionReference: 'admission:zero-hospital', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Regional health authority', reference: 'capacity:zero-hospital' }, acceptingPatients: false, bedsAvailable: 0
  }, { now: new Date(at) });
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [facility('station-zero', 'FIRE_STATION', 12, fireCapacity)], HOSPITAL: [facility('hospital-zero', 'HOSPITAL', 20, hospitalCapacity)] },
    decisionContext: { fireCapacityRequired: true, medicalCapacityRequired: true }
  });
  assert.equal(result.informationRequirements.length, 0);
  assert.ok(result.optimizerInputs.candidates.every((item) => item.capacityKnown === true));
  assert.ok(result.optimizerInputs.candidates.every((item) => item.availableCapacityConfirmed === false));
  assert.ok(result.optimizerInputs.candidates.every((item) => item.eligibleForDispatchRecommendation === false));
  assert.ok(result.responseGaps.some((gap) => gap.code === 'FIRE_COMMUNICATIONS_DEGRADED'));
  assert.deepEqual(fireCapacity.fields.specialistCapabilities, ['WILDFIRE']);
  assert.deepEqual(fireCapacity.fields.constraints, ['No available crew.']);
});

test('road routing proves the 30-minute response gap without a decorative radius', () => {
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [facility('station-far', 'FIRE_STATION', 38)] }
  });
  assert.ok(result.responseGaps.some((gap) => gap.code === 'NO_FIRE_RESPONSE_WITHIN_30_MIN'));
  assert.equal(result.reachabilityBands.fire.find((item) => item.minutes === 30).count, 0);
});

test('resource coverage map contains only returned routed road lines and never invents a service-area radius', () => {
  const routed = facility('station-routed-line', 'FIRE_STATION', 18);
  routed.reachability.currentRoute.geometry = {
    type: 'LineString',
    coordinates: [[-8.5, 41.2], [-8.46, 41.16], [-8.4, 41.1]]
  };
  routed.reachability.currentRoute.geometryState = 'AVAILABLE';
  routed.reachability.checkedAt = '2026-09-04T14:55:00Z';
  routed.provenance = { provider: 'OpenStreetMap contributors', sourceRecordId: 'node/42', archiveSha256: 'sha256:fixture', retrievedAt: '2026-09-04T12:00:00Z' };
  routed.freshness = { state: 'STATIC_SNAPSHOT', retrievedAt: '2026-09-04T12:00:00Z' };
  const distanceOnly = facility('ems-distance-only', 'EMS_BASE', 12);
  distanceOnly.reachability = { ...distanceOnly.reachability, state: 'DISTANCE_ONLY_FALLBACK', travelTimeMinutes: null, routeDistanceKm: null, currentRoute: null };
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [routed], EMS_BASE: [distanceOnly] }
  });
  assert.equal(result.resourceCoverageMap.state, 'ROUTED_PATH_COVERAGE_AVAILABLE');
  assert.equal(result.resourceCoverageMap.geometryPolicy, 'ROUTED_ROAD_LINES_ONLY');
  assert.equal(result.resourceCoverageMap.serviceArea.geometry, null);
  assert.equal(result.resourceCoverageMap.serviceArea.state, 'ROUTED_PATHS_ONLY_NO_ISOCHRONE');
  assert.equal(result.resourceCoverageMap.routeFeatures.features.length, 1);
  assert.ok(result.resourceCoverageMap.routeFeatures.features.every((feature) => feature.geometry.type === 'LineString'));
  assert.equal(result.resourceCoverageMap.routeFeatures.features[0].properties.dispatchClaimed, false);
  assert.equal(result.resourceCoverageMap.source.checkedAt, '2026-09-04T14:55:00.000Z');
  assert.equal(result.resourceCoverageMap.source.projectedAt, at);
  assert.equal(result.resourceCoverageMap.facilityFeatures.features[0].properties.updatedAt, '2026-09-04T12:00:00.000Z');
  assert.equal(result.resourceCoverageMap.facilityFeatures.features[0].properties.freshnessState, 'STATIC_SNAPSHOT');
  assert.equal(result.resourceCoverageMap.excluded.find((item) => item.facilityId === 'ems-distance-only').reason, 'ROAD_ROUTE_NOT_AVAILABLE');
  assert.doesNotMatch(JSON.stringify(result.resourceCoverageMap), /\"type\":\"(?:Polygon|MultiPolygon|Circle)\"/);
});

test('road-network coverage surface remains discrete, explainable, and capacity-truth aware', () => {
  const fireCapacity = normalizeDynamicCapacity('FIRE_STATION', {
    state: 'DISPATCH_CONFIRMED', admitted: true, admissionReference: 'admission:surface:fire', observedAt: '2026-09-04T14:58:00Z',
    source: { name: 'Regional dispatch', reference: 'dispatch:surface:fire' }, crewsAvailable: 2, crewsAssigned: 1, enginesAvailable: 1
  }, { now: new Date(at) });
  const station = facility('station-surface', 'FIRE_STATION', 18, fireCapacity);
  const hospital = facility('hospital-surface', 'HOSPITAL', 24);
  const result = buildResponseCapabilityProjection({
    incident: { id: 'incident:one', coordinate: [-8.5, 41.2] }, generatedAt: at,
    facilitiesByKind: { FIRE_STATION: [station], HOSPITAL: [hospital] },
    coverageSurface: {
      schemaVersion: 'vigia.road-network-coverage-samples.v1', state: 'ROAD_NETWORK_SAMPLES_AVAILABLE', checkedAt: at,
      method: 'OSRM_TABLE_ROAD_NETWORK_SAMPLING', source: { provider: 'OSRM public routing service' },
      roadClosureImpact: { state: 'UNKNOWN', reason: 'No governed closure feed joined.' },
      samples: [{ sampleId: 'road-sample:1', coordinate: [-8.45, 41.15], byKind: {
        FIRE_STATION: { facilityId: station.id, facilityKind: station.kind, travelTimeMinutes: 14, routeDistanceKm: 9 },
        HOSPITAL: { facilityId: hospital.id, facilityKind: hospital.kind, travelTimeMinutes: 22, routeDistanceKm: 14 }
      } }],
      truthBoundary: 'Point samples only.'
    }
  });
  const surface = result.resourceCoverageMap.responseCoverageSurface;
  assert.equal(surface.state, 'ROAD_NETWORK_SAMPLE_SURFACE_AVAILABLE');
  assert.equal(surface.geometryPolicy, 'ROUTED_POINT_SAMPLES_NO_INTERPOLATED_AREA');
  assert.equal(surface.features.features.length, 1);
  assert.equal(surface.features.features[0].geometry.type, 'Point');
  assert.equal(surface.features.features[0].properties.coverageState, 'CONFIRMED_AVAILABLE_CAPABILITY');
  assert.equal(surface.features.features[0].properties.capabilityByKind.FIRE_STATION.committedCount, 1);
  assert.equal(surface.features.features[0].properties.capabilityByKind.HOSPITAL.capacityAvailability, 'UNKNOWN');
  assert.match(surface.features.features[0].properties.explanation, /fastest routed mapped facility/i);
  assert.match(surface.truthBoundary, /does not interpolate/i);
  assert.doesNotMatch(JSON.stringify(surface), /\"type\":\"(?:Polygon|MultiPolygon|Circle)\"/);
});
