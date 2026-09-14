import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFireEvents, buildEventObservations, thermalTrend, trackFireEvents } from '../src/fire-event-tracker.mjs';

const now = new Date('2026-08-08T15:00:00Z');

test('fire event tracker fuses a satellite detection and later public report into one event', () => {
  const events = buildFireEvents({
    fires: [{ id:'f-1', municipality:'Monchique', district:'Faro', coordinate:[-8.49,37.32], startedAt:'2026-08-08T14:18:00Z', updatedAt:'2026-08-08T14:40:00Z', operatives:20, ground:6, aerial:1 }],
    thermalDetections: [
      { id:'t-1', coordinate:[-8.491,37.321], observedAt:'2026-08-08T14:10:00Z', frpMw:18, satellite:'NOAA-20' },
      { id:'t-2', coordinate:[-8.492,37.322], observedAt:'2026-08-08T14:35:00Z', frpMw:57, satellite:'NOAA-21' }
    ]
  }, { now });
  assert.equal(events.length, 1);
  assert.equal(events[0].evidenceState, 'multisource');
  assert.equal(events[0].evolutionState, 'growing');
  assert.equal(events[0].leadTime.minutes, 8);
  assert.equal(events[0].thermal.latestMw, 57);
});

test('satellite-only thermal cluster remains an unreported event', () => {
  const events = buildFireEvents({ fires: [], thermalDetections: [
    { id:'t-a', coordinate:[-7.5,39.8], observedAt:'2026-08-08T14:50:00Z', frpMw:20 },
    { id:'t-b', coordinate:[-7.51,39.81], observedAt:'2026-08-08T14:55:00Z', frpMw:24 }
  ] }, { now });
  assert.equal(events.length, 1);
  assert.equal(events[0].evidenceState, 'satellite-only');
  assert.equal(events[0].evolutionState, 'stable');
  assert.equal(events[0].leadTime.firstReportAt, null);
});

test('distant observations do not merge', () => {
  const observations = buildEventObservations({ now, thermalDetections: [
    { id:'a', coordinate:[-8.5,37.3], observedAt:'2026-08-08T14:40:00Z' },
    { id:'b', coordinate:[-7.5,40.3], observedAt:'2026-08-08T14:41:00Z' }
  ] });
  assert.equal(trackFireEvents(observations, { now }).length, 2);
});

test('thermal trend never invents growth from one sample', () => {
  assert.equal(thermalTrend([{ type:'thermal', at:'2026-08-08T14:40:00Z', frpMw:30 }]).direction, 'unknown');
});

test('dense thermal refresh remains bounded instead of rescanning full event history quadratically',()=>{
  const started=Date.parse('2026-08-12T00:00:00Z'),observations=Array.from({length:4000},(_,index)=>({id:`dense-${index}`,type:'thermal',at:new Date(started+Math.floor(index/100)*60_000).toISOString(),receivedAt:new Date(started+3_600_000).toISOString(),source:'NASA FIRMS VIIRS',sourceFamily:'viirs',independenceGroup:'viirs_noaa_20',instrument:'VIIRS',coordinate:[-8+(index%50)*.0001,40+(index%37)*.0001],frpMw:10,provenance:{synthetic:false}}));
  const before=performance.now(),events=trackFireEvents(observations,{now:new Date('2026-08-12T02:00:00Z')}),elapsed=performance.now()-before;
  assert.equal(events.length,1);assert.equal(events[0].observations.length,4000);assert.equal(events[0].geometryTimeline.length,12);assert.equal(events[0].geometryTimeline[0].sourceFrameCount,40);assert.ok(elapsed<6000,`dense refresh took ${Math.round(elapsed)}ms`);
});

test('living-fire geometry emits one physical frame per acquisition instant', () => {
  const observations = buildEventObservations({ now, thermalDetections: [
    { id:'same-pass-a', coordinate:[-8.500,37.300], observedAt:'2026-08-08T14:10:00Z', frpMw:10 },
    { id:'same-pass-b', coordinate:[-8.495,37.302], observedAt:'2026-08-08T14:10:00Z', frpMw:14 },
    { id:'next-pass', coordinate:[-8.490,37.304], observedAt:'2026-08-08T14:40:00Z', frpMw:22 }
  ] });
  const [event] = trackFireEvents(observations, { now });
  assert.equal(event.geometryTimeline.length, 2);
  assert.deepEqual(event.geometryTimeline.map((frame)=>frame.observationCount),[2,1]);
  assert.deepEqual(event.geometryTimeline.map((frame)=>frame.at),['2026-08-08T14:10:00.000Z','2026-08-08T14:40:00.000Z']);
});

test('two nearby provider incidents remain separate and midpoint evidence abstains', () => {
  const events = buildFireEvents({
    fires: [
      { id:'r-a', municipality:'A', coordinate:[-8.02,40], startedAt:'2026-08-08T14:00:00Z' },
      { id:'r-b', municipality:'B', coordinate:[-7.98,40], startedAt:'2026-08-08T14:02:00Z' }
    ],
    thermalDetections: [{ id:'between', coordinate:[-8,40], observedAt:'2026-08-08T14:10:00Z', frpMw:25, satellite:'VIIRS NOAA-20' }]
  }, { now });
  assert.equal(events.filter((event)=>event.observations.some((item)=>item.type==='report')).length,2);
  const unresolved=events.find((event)=>event.associationState==='ambiguous');
  assert.ok(unresolved);
  assert.equal(unresolved.evidenceNeeds[0].state,'waiting_for_observation');
  assert.equal(unresolved.evidenceNeeds[0].reasonCodes.includes('COMPETING_REPORT_ANCHORS'),true);
});
