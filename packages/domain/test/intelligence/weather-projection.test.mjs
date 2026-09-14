import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherProjection} from '../../src/operational-twin/physical-conditions.mjs';

const asOf='2026-09-14T12:00:00Z';
const observation={source:'IPMA',stationId:'a',stationName:'A',coordinate:[-8,40],observedAt:'2026-09-14T11:00:00Z',temperatureC:25,windSpeedKph:0,humidityPercent:40,precipitationMm:0};

test('shared weather history binds location and subject independently without changing its input',()=>{
  const records=[observation,{...observation,stationId:'b',stationName:'B',coordinate:[-7,39],temperatureC:30}];
  const before=structuredClone(records),project=weatherProjection(records,asOf);
  const a=project({location:[-8,40],subjectId:'incident:a'}),b=project({location:[-7,39],subjectId:'incident:b'});
  assert.equal(a.station.id,'a');assert.equal(b.station.id,'b');
  assert.equal(a.temperature.value,25);assert.equal(b.temperature.value,30);
  assert.equal(a.wind.value,0);assert.equal(b.precipitation.value,0);
  assert.equal(a.temperature.measurementType,'OBSERVED_LOCAL');
  assert.equal(b.temperature.measurementType,'OBSERVED_LOCAL');
  assert.deepEqual(project({location:[-8,40],subjectId:'incident:a'}),a);
  assert.deepEqual(records,before);
});

test('station choice preserves freshness before distance, stable ties, and latest-sample usability',()=>{
  const project=weatherProjection([
    {...observation,stationId:'near',sourceState:'unavailable'},
    {...observation,stationId:'empty',observedAt:'2026-09-14T10:00:00Z'},
    {...observation,stationId:'empty',temperatureC:null,windSpeedKph:null,humidityPercent:null},
    {...observation,stationId:'first',coordinate:[-7,39]},
    {...observation,stationId:'tied',coordinate:[-7,39]},
    {...observation,stationId:'forecast',model:'IFS'},
    {...observation,stationId:'future',observedAt:'2026-09-15T12:00:00Z'},
  ],asOf);
  assert.equal(project({location:[-8,40]}).station.id,'first');
});

test('history retains duplicate conflicts and compares only the selected source and station',()=>{
  const older={...observation,observedAt:'2026-09-14T10:30:00Z',temperatureC:20};
  const result=weatherProjection([older,observation,{...observation,temperatureC:27},{...older,source:'Other',temperatureC:90}],asOf)({location:[-8,40]});
  assert.equal(result.temperature.value,null);
  assert.equal(result.temperature.missingReason,'CONFLICTING_VALUES');
  assert.equal(result.temperature.trend,null);
  const clear=weatherProjection([older,observation,{...older,source:'Other',temperatureC:90}],asOf)({location:[-8,40]});
  assert.equal(clear.temperature.trend.delta,5);
  assert.equal(clear.temperature.trend.minutes,30);
});

test('new projection clock and source state cannot reuse currentness from an older request',()=>{
  const current=weatherProjection([observation],asOf)();
  const stale=weatherProjection([observation],'2026-09-14T16:00:00Z')();
  const failed=weatherProjection([observation],asOf)({sourceState:'unavailable'});
  assert.equal(current.temperature.freshness,'CURRENT');
  assert.equal(stale.temperature.freshness,'STALE');
  assert.equal(failed.temperature.freshness,'STALE');
  assert.equal(failed.temperature.value,25);
});
