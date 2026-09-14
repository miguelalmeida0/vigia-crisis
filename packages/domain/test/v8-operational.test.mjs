import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationPoint } from '../src/geo.mjs';
import { buildSpreadScenario } from '../src/spread-envelope.mjs';
import { fireEventGeometryState } from '../src/fire-event-geometry.mjs';
import { trackFireEvents } from '../src/fire-event-tracker.mjs';

const now = new Date('2026-08-08T18:00:00Z');

test('deterministic screening preserves low < central < high without probability semantics', () => {
  const scenario = buildSpreadScenario({ coordinate:[-8.0,40.0], riskLevel:5, windSpeedKph:32, windDirectionDeg:90, humidityPercent:18 });
  for (const envelope of scenario.envelopes) {
    assert.ok(envelope.low.properties.downwindKm < envelope.central.properties.downwindKm);
    assert.ok(envelope.central.properties.downwindKm < envelope.high.properties.downwindKm);
    assert.equal(envelope.central.properties.sensitivity, 'central');
  }
  assert.match(scenario.modelNotice, /Unvalidated/);
});

test('V8 living-fire geometry reports current footprint and centroid movement from fresh point observations', () => {
  const origin=[-8.0,40.0];
  const observations=[
    {id:'a',type:'thermal',at:'2026-08-08T17:00:00Z',coordinate:origin,satellite:'VIIRS NOAA-20'},
    {id:'b',type:'thermal',at:'2026-08-08T17:20:00Z',coordinate:destinationPoint(origin,.45,80),satellite:'VIIRS NOAA-20'},
    {id:'c',type:'thermal',at:'2026-08-08T17:40:00Z',coordinate:destinationPoint(origin,.9,80),satellite:'VIIRS NOAA-21'},
    {id:'d',type:'thermal',at:'2026-08-08T17:55:00Z',coordinate:destinationPoint(origin,1.15,80),satellite:'VIIRS S-NPP'}
  ];
  const state=fireEventGeometryState(observations,{now,currentMinutes:90,agingMinutes:180});
  assert.equal(state.freshness,'current');
  assert.equal(state.current.geometry.type,'Polygon');
  assert.equal(state.movement.direction,'moving');
  assert.ok(state.movement.distanceKm>.2);
  assert.ok(state.movement.bearingDeg>40&&state.movement.bearingDeg<120);
});

test('V8 report plus fresh camera evidence becomes a multisource event without inventing thermal behavior', () => {
  const observations=[
    {id:'report:r1',type:'report',source:'civil-protection',at:'2026-08-08T17:45:00Z',coordinate:[-8,40],incidentId:'r1',municipality:'Example',district:'Coimbra',status:'active'},
    {id:'cam:c1',type:'camera',source:'camera-network',at:'2026-08-08T17:48:00Z',coordinate:[-8.001,40.001],sensorId:'cam-14',classification:'smoke_plume',confidence:.92}
  ];
  const [event]=trackFireEvents(observations,{now});
  assert.equal(event.evidenceState,'multisource');
  assert.equal(event.physicalState.sourceType,'camera');
  assert.equal(event.physicalState.freshness,'current');
  assert.equal(event.behaviorState,'unknown');
  assert.equal(event.association.grade,'strong');
  assert.equal(event.association.physicalObservationId,'cam:c1');
  assert.equal(event.association.thermalObservationId,null);
});

test('distinct provider reports stay separate even when locality and timing overlap', () => {
  const observations=[
    {id:'report:1',type:'report',source:'civil-protection',at:'2026-08-08T15:00:00Z',coordinate:[-7.35,41.20],incidentId:'1',municipality:'Carrazeda de Ansiães',district:'Bragança',parish:'Linhares',status:'active'},
    {id:'report:2',type:'report',source:'civil-protection',at:'2026-08-08T15:40:00Z',coordinate:[-7.315,41.20],incidentId:'2',municipality:'Carrazeda de Ansiães',district:'Bragança',parish:'Linhares',status:'active'}
  ];
  const events=trackFireEvents(observations,{now});
  assert.equal(events.length,2);
  assert.deepEqual(new Set(events.flatMap((event)=>event.incidentIds)),new Set(['1','2']));
});
