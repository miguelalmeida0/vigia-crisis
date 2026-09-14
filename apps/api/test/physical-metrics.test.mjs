import test from 'node:test';
import assert from 'node:assert/strict';
import { IpmaGateway } from '../src/modules/world/ipma-gateway.mjs';
import { physicalWorldContext, withOperatorIntelligence } from '../src/modules/operator/operator-intelligence-projection.mjs';

test('IPMA rejects source missing sentinels, blank and null without losing real zero rain',async()=>{
  const payload={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-8,40]},properties:{idEstacao:1,time:'2026-09-08T11:00:00',temperatura:-99,humidade:null,intensidadeVentoKM:'',precAcumulada:0}}]};
  const result=await new IpmaGateway({clock:()=>new Date('2026-09-08T12:00:00Z'),fetchImpl:async url=>new Response(JSON.stringify(String(url).includes('warnings')?[]:payload),{headers:{'content-type':'application/json'}})}).snapshot();
  const r=result.ipmaWeather.data[0];assert.equal(r.temperatureC,null);assert.equal(r.humidityPercent,null);assert.equal(r.windSpeedKph,null);assert.equal(r.precipitationMm,0);
});
test('physical read plane uses the existing cache and does not request collection',async()=>{let input;const world={meta:{mode:'production'}};const actual=await physicalWorldContext({worldService:{snapshot:async options=>{input=options;return world;}}});assert.deepEqual(input,{preferCache:true});assert.equal(actual,world);});
test('failed context reads and missing twin remain unavailable, never demonstration data',async()=>{assert.equal(await physicalWorldContext({worldService:{snapshot:async()=>{throw new Error('offline');}}}),null);assert.deepEqual(withOperatorIntelligence({},null,{},null).physicalWorld,{state:'UNAVAILABLE',value:null,reason:'Incident reasoning is unavailable; independent national source context may still be returned.'});});
