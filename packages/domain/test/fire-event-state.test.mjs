import test from 'node:test';
import assert from 'node:assert/strict';
import { fireEventState } from '../src/fire-event-state.mjs';

const now = new Date('2026-08-08T20:00:00Z');
const report = (at, status = 'active') => ({ type: 'report', at, status });
const thermal = (at) => ({ type: 'thermal', at });

test('fresh public report does not imply a physically observed fire', () => {
  const state = fireEventState([report('2026-08-08T19:50:00Z')], {}, { now });
  assert.equal(state.report.sourceActivity, 'current');
  assert.equal(state.physical.freshness, 'unobserved');
  assert.equal(state.knowledge, 'report_only');
  assert.equal(state.behavior, 'unknown');
});

test('old open report degrades to stale-open knowledge rather than current fire state', () => {
  const state = fireEventState([report('2026-08-08T14:00:00Z')], {}, { now });
  assert.equal(state.report.sourceActivity, 'stale_open');
  assert.equal(state.knowledge, 'unknown');
  assert.equal(state.behavior, 'unknown');
});

test('one current thermal point creates physical knowledge but never a trend', () => {
  const state = fireEventState([thermal('2026-08-08T19:40:00Z')], { samples: 1, currentSamples: 1, currentDirection: 'unknown' }, { now });
  assert.equal(state.physical.freshness, 'current');
  assert.equal(state.knowledge, 'physically_observed');
  assert.equal(state.behavior, 'unknown');
});

test('current thermal series can support a current growing state', () => {
  const observations = [thermal('2026-08-08T19:20:00Z'), thermal('2026-08-08T19:50:00Z')];
  const state = fireEventState(observations, { samples: 2, currentSamples: 2, currentDirection: 'rising' }, { now });
  assert.equal(state.physical.freshness, 'current');
  assert.equal(state.knowledge, 'physically_observed');
  assert.equal(state.behavior, 'growing');
});

test('physical freshness is source-aware and historical satellite points cannot remain current',()=>{
  const viirs=fireEventState([{type:'thermal',sourceFamily:'viirs',at:'2026-08-08T18:20:00Z'}],{samples:1,currentSamples:0},{now});
  const sentinel3=fireEventState([{type:'thermal',sourceFamily:'sentinel3_slstr',at:'2026-08-08T18:20:00Z'}],{samples:1,currentSamples:0},{now});
  const historical=fireEventState([{type:'thermal',sourceFamily:'sentinel3_slstr',at:'2026-08-08T06:00:00Z'}],{samples:1,currentSamples:0},{now});
  assert.equal(viirs.physical.freshness,'delayed');assert.equal(viirs.physical.freshnessPolicy.agingMinutes,360);
  assert.equal(sentinel3.physical.freshness,'current');assert.equal(sentinel3.physical.freshnessPolicy.currentMinutes,120);
  assert.equal(historical.physical.freshness,'stale');
});
