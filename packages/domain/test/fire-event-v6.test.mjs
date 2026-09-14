import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFireEvents, thermalTrend } from '../src/fire-event-tracker.mjs';
import { assessThermalCandidate, assessThermalCandidateV2, assessThermalCandidateV2Candidate, assessThermalCandidateV3, assessThermalCandidateV3Candidate, assessThermalCandidateV4 } from '../src/thermal-candidate-policy.mjs';

const now = new Date('2026-08-08T18:00:00Z');

test('stale thermal direction is historical, never a current growing claim', () => {
  const trend = thermalTrend([
    { type:'thermal', at:'2026-08-08T12:00:00Z', frpMw:20 },
    { type:'thermal', at:'2026-08-08T13:00:00Z', frpMw:60 }
  ], { now, currentMinutes:90 });
  assert.equal(trend.direction, 'rising');
  assert.equal(trend.currentDirection, 'unknown');
  assert.ok(trend.ageMinutes > 90);
});

test('multisource event exposes association evidence and approximate observed geometry', () => {
  const [event] = buildFireEvents({
    fires:[{ id:'r', municipality:'Carrazeda de Ansiães', district:'Bragança', coordinate:[-7.3461,41.1975], startedAt:'2026-08-08T14:47:00Z', updatedAt:'2026-08-08T14:50:00Z' }],
    thermalDetections:[
      { id:'a', coordinate:[-7.3465,41.1978], observedAt:'2026-08-08T14:16:00Z', frpMw:20, confidence:'h', satellite:'VIIRS NOAA-21' },
      { id:'b', coordinate:[-7.347,41.198], observedAt:'2026-08-08T14:30:00Z', frpMw:51, confidence:'h', satellite:'VIIRS NOAA-20' }
    ]
  }, { now:new Date('2026-08-08T15:00:00Z') });
  assert.equal(event.association.state, 'associated');
  assert.equal(event.association.grade, 'strong');
  assert.equal(event.observedGeometry.geometry.type, 'Polygon');
  assert.equal(event.thermal.series.length, 2);
});

test('single low-confidence thermal signal is screened below critical quality', () => {
  const [event] = buildFireEvents({ thermalDetections:[{ id:'weak', coordinate:[-7.5,39.8], observedAt:'2026-08-08T17:55:00Z', frpMw:2, confidence:'l' }] }, { now });
  const assessment = assessThermalCandidate(event, { now });
  assert.equal(assessment.policyVersion,'vigia-thermal-candidate-policy-v1');
  assert.equal(assessment.thresholdVersion,'vigia-thermal-thresholds-v1');
  assert.equal(assessment.grade, 'low');
  assert.ok(assessment.flags.includes('single_observation'));
});

test('weak cross-source proximity does not silently merge two physical events', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const events = buildFireEvents({
    fires: [{ id:'report-weak', coordinate:[-8.0,40.0], municipality:'Example', district:'Coimbra', startedAt:'2026-08-08T11:00:00Z', updatedAt:'2026-08-08T11:00:00Z', operatives:3, ground:1, aerial:0 }],
    thermalDetections: [{ id:'thermal-weak', coordinate:[-7.961,40.0], observedAt:'2026-08-08T06:30:00Z', frpMw:18, confidence:'nominal', satellite:'VIIRS NOAA-20' }]
  }, { now });
  assert.equal(events.length, 2);
  assert.ok(events.some((event) => event.evidenceState === 'reported'));
  assert.ok(events.some((event) => event.evidenceState === 'satellite-only'));
});

test('FIRMS non-wildfire hotspot type is suppressed from critical thermal-candidate quality', () => {
  const now = new Date('2026-08-08T12:00:00Z');
  const [event] = buildFireEvents({ thermalDetections:[
    { id:'static-1', coordinate:[-8.0,40.0], observedAt:'2026-08-08T11:50:00Z', frpMw:80, confidence:'high', satellite:'VIIRS NOAA-20', hotspotType:2, hotspotClass:'other_static_land_source' },
    { id:'static-2', coordinate:[-8.001,40.001], observedAt:'2026-08-08T11:55:00Z', frpMw:90, confidence:'high', satellite:'VIIRS NOAA-21', hotspotType:2, hotspotClass:'other_static_land_source' }
  ]}, { now });
  const assessment = assessThermalCandidate(event, { now });
  assert.equal(assessment.decision,'SUPPRESS_PROVIDER_NON_WILDFIRE');
  assert.equal(assessment.qualifiesAsFireCandidate,false);
  assert.equal(assessment.flags.includes('firms_non_wildfire_type'), true);
  assert.equal(assessment.grade, 'low');
});

test('V2 candidate suppresses persistent low-FRP recurrence without replacing V1',()=>{
  const current=new Date('2026-08-12T12:00:00Z'),observations=Array.from({length:9},(_,index)=>({id:`thermal-${index}`,type:'thermal',at:new Date(current.getTime()-(96-index*12)*3_600_000).toISOString(),satellite:'VIIRS',confidence:'nominal',frpMw:2.1})),event={observations,thermal:{direction:'steady'}};
  assert.equal(assessThermalCandidate(event,{now:current}).qualifiesAsFireCandidate,true);
  const candidate=assessThermalCandidateV2Candidate(event,{now:current});
  assert.equal(candidate.decision,'SUPPRESS_PERSISTENT_LOW_FRP');
  assert.equal(candidate.candidateOnly,true);
});

test('V2 candidate suppresses offshore coordinates without reading provider class',()=>{
  const at='2026-08-12T12:00:00Z',point={id:'offshore',type:'thermal',at,observedAt:at,coordinate:[-10.5,38.2],frpMw:18,confidence:'h',satellite:'VIIRS NOAA-20',hotspotType:null,hotspotClass:null};
  const event={observations:[point],thermal:thermalTrend([point],{now:new Date('2026-08-12T12:05:00Z')})};
  const v1=assessThermalCandidate(event,{now:new Date('2026-08-12T12:05:00Z')}),v2=assessThermalCandidateV2Candidate(event,{now:new Date('2026-08-12T12:05:00Z')});
  assert.equal(v1.qualifiesAsFireCandidate,true);assert.equal(v2.qualifiesAsFireCandidate,false);assert.equal(v2.decision,'SUPPRESS_OFFSHORE_LAND_CONTEXT');assert.ok(v2.flags.includes('outside_portugal_mainland_mask_v1'));
});

test('promoted V2 retains screening qualification and frozen evidence binding',()=>{
  const at='2026-08-12T12:00:00Z',point={id:'offshore-live',type:'thermal',at,coordinate:[-10.5,38.2],frpMw:18,confidence:'h',satellite:'VIIRS NOAA-20'};
  const assessment=assessThermalCandidateV2({observations:[point],thermal:thermalTrend([point],{now:new Date('2026-08-12T12:05:00Z')})},{now:new Date('2026-08-12T12:05:00Z')});
  assert.equal(assessment.decision,'SUPPRESS_OFFSHORE_LAND_CONTEXT');assert.equal(assessment.candidateOnly,false);assert.equal(assessment.fireProbability,null);assert.equal(assessment.promotionEvidence,'vigia.area-time-detection-benchmark.v1');
});

test('V3 suppresses persistent stationary low-intensity history without provider labels',()=>{
  const point={type:'thermal',at:'2026-08-12T12:00:00Z',coordinate:[-8.42,40.29],frpMw:1.2,confidence:'nominal',satellite:'NOAA-20'};
  const event={observations:[point],thermalMemory:{observationCount:7,distinctObservationDays:6,durationHours:480,stationarityRadiusKm:.2,frpP90Mw:1.8}};
  const candidate=assessThermalCandidateV3Candidate(event,{now:new Date('2026-08-12T12:05:00Z')});
  assert.equal(candidate.decision,'SUPPRESS_PERSISTENT_STATIONARY_LOW_INTENSITY');
  assert.equal(candidate.qualifiesAsFireCandidate,false);
  const promoted=assessThermalCandidateV3(event,{now:new Date('2026-08-12T12:05:00Z')});
  assert.equal(promoted.candidateOnly,false);
  assert.match(promoted.promotionEvidence,/frozen-confirmatory/);
});

test('V3 does not suppress short or spatially unstable thermal history',()=>{
  const point={type:'thermal',at:'2026-08-12T12:00:00Z',coordinate:[-8.42,40.29],frpMw:8,confidence:'nominal',satellite:'NOAA-20'};
  const short=assessThermalCandidateV3Candidate({observations:[point],thermalMemory:{observationCount:7,distinctObservationDays:6,durationHours:48,stationarityRadiusKm:.2,frpP90Mw:1.8}},{now:new Date('2026-08-12T12:05:00Z')});
  assert.notEqual(short.decision,'SUPPRESS_PERSISTENT_STATIONARY_LOW_INTENSITY');
  const moving=assessThermalCandidateV3Candidate({observations:[point],thermalMemory:{observationCount:7,distinctObservationDays:6,durationHours:480,stationarityRadiusKm:2.1,frpP90Mw:1.8}},{now:new Date('2026-08-12T12:05:00Z')});
  assert.notEqual(moving.decision,'SUPPRESS_PERSISTENT_STATIONARY_LOW_INTENSITY');
});

test('promoted V4 binds the untouched new-site evidence and preserves unmapped low-FRP signal',()=>{
  const point={type:'thermal',at:'2026-08-12T12:00:00Z',coordinate:[-8.42,40.29],frpMw:1.2,confidence:'nominal',satellite:'NOAA-20'};
  const assessment=assessThermalCandidateV4({observations:[point],siteContext:{insidePortugal:true,heatContext:null}},{now:new Date('2026-08-12T12:05:00Z')});
  assert.equal(assessment.qualifiesAsFireCandidate,true);
  assert.equal(assessment.candidateOnly,false);
  assert.equal(assessment.promotionEvidence,'vigia.detector-v4-frozen-confirmatory.v1');
  assert.match(assessment.promotionEvidenceHash,/^sha256:[a-f0-9]{64}$/);
});
