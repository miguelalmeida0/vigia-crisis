import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentSignals,conditionsTrend,rankedRoutes,nearestSupport,regionalPriorities,primaryMetric,nationalCurrentMetric,namedArea} from '../src/approved/data/hierarchy.js';
import {EnvironmentalConditionsStrip,NationalSignalStrip} from '../src/approved/ui/signals.js';
import {ConditionsOverTime,ReadingsDetail} from '../src/approved/ui/trends.js';
import {PhysicalInline} from '../src/approved/ui/physical.js';
import {AccessApproaches,NearestSupport,ResponseSnapshot,ResponseCoverage} from '../src/approved/ui/access.js';
import {renderApprovedRoute} from '../src/approved/index.js';
import {approvedController} from '../src/approved/controller.js';
import {phaseBFixture} from './phase-b-fixture.mjs';

const now=Date.parse('2026-09-08T16:30:00Z');
const m=(id,value,extra={})=>({id,label:id,value,display:String(value),unit:id==='rain'?'mm':id==='temperature'?'°C':'km/h',available:value!==null,source:'IPMA',observedAt:'2026-09-08T16:00:00Z',validity:'VALID_VALUE',...extra});
test('primary signal selection omits null, invalid and unattributed values and preserves a measured zero',()=>{
 const physical={metrics:{temperature:m('temperature',33),wind:m('wind',20,{direction:'NW'}),humidity:m('humidity',null),rain:m('rain',0),fireDanger:m('fireDanger',2,{validity:'NO_VALID_VALUE'}),gust:m('gust',null),aqCategory:m('aqCategory',null)}};
 assert.deepEqual(currentSignals(physical,now).map(x=>x.id),['temperature','wind','rain']);
 const html=EnvironmentalConditionsStrip({physical,generatedAt:new Date(now).toISOString()});
 assert.match(html,/--signal-count:3/);assert.equal((html.match(/data-metric=/g)??[]).length,3);
 assert.doesNotMatch(html,/signal-unavailable|Not reported|Not connected|Unavailable|data-metric="gust"/);
 assert.match(html,/0/);assert.match(html,/NW/);assert.match(html,/Data coverage/);
 assert.equal(primaryMetric(m('wind',Infinity)),false);assert.equal(primaryMetric(m('wind',20,{source:null})),false);
});
test('signal strip rebalances from five to three and uses only attributable station fallback',()=>{
 const physical={metrics:Object.fromEntries(['temperature','wind','humidity','rain','fireDanger'].map((id,n)=>[id,m(id,n)]))};
 assert.match(EnvironmentalConditionsStrip({physical}),/--signal-count:5/);
 physical.metrics.humidity=m('humidity',null);physical.metrics.fireDanger=m('fireDanger',null);
 assert.match(EnvironmentalConditionsStrip({physical}),/--signal-count:3/);
 physical.station={name:'Station',distanceKm:7,source:'IPMA',observedAt:'2026-09-08T16:00:00Z'};
 assert.equal(currentSignals(physical,now).at(-1).id,'stationDistance');
 delete physical.station.observedAt;assert.equal(currentSignals(physical,now).length,3);
});
test('trend composition uses actual timestamps, shared domain and no invented samples',()=>{
 const a={at:'2026-09-08T14:00:00Z',value:32},b={at:'2026-09-08T16:00:00Z',value:33};
 const f={now,station:{name:'Station'},metrics:{temperature:m('temperature',33,{trend:{samples:[b,a,{...a},{at:'bad',value:4},{at:'2026-09-09',value:50}]}}),wind:m('wind',20,{trend:{samples:[{at:'2026-09-08T15:00:00Z',value:18},{...b,value:20}]}}),rain:m('rain',0,{trend:{samples:[{...a,value:0},{...b,value:0}]}})}};
 const t=conditionsTrend(f);assert.equal(t.series.length,3);assert.deepEqual(t.times,[Date.parse(a.at),Date.parse('2026-09-08T15:00:00Z'),Date.parse(b.at)]);
 assert.equal(t.series[0].delta,1);assert.equal(t.series[0].minutes,120);assert.equal(t.series[0].samples.length,2);
 const html=ConditionsOverTime(f);assert.equal((html.match(/data-at=/g)??[]).length,6);assert.match(html,/Conditions over time/);assert.match(html,/View readings/);assert.doesNotMatch(html,/field-history-values|NaN|2026-09-09/);
 assert.match(html,/0 mm in 2 returned readings/);assert.match(html,/trend-rain/);
 assert.match(html,/trend-time-axis/);assert.doesNotMatch(html,/<text /);assert.match(html,/datetime="2026-09-08T15:00:00.000Z"/);
 assert.match(ReadingsDetail(f),/8 Sept · 14:00 UTC/);
});
test('trend dates remain unambiguous across midnight and sparse series are omitted',()=>{
 const f={now,metrics:{temperature:m('temperature',33,{trend:{samples:[{at:'2026-09-07T23:00:00Z',value:32},{at:'2026-09-08T00:00:00Z',value:33}]}})}};
 assert.match(ConditionsOverTime(f),/7 Sept – 8 Sept/);assert.match(ReadingsDetail(f),/7 Sept · 23:00 UTC/);
 f.metrics.temperature.trend.samples.pop();assert.equal(ConditionsOverTime(f),'');
});
const facility=(id,kind,distance,minutes,roadDistance=distance*1.5)=>({id,kind,name:id,coordinate:[-8,41],distanceKm:distance,provenance:{provider:'OpenStreetMap'},reachability:{state:'ROUTED',travelTimeMinutes:minutes,routeDistanceKm:roadDistance,checkedAt:'2026-09-08T16:00:00Z'}});
test('access ranking is stable by returned duration then route distance, never claimed safe',()=>{
 const a=facility('a','FIRE_STATION',2,8),b=facility('b','POLICE',3,3),c=facility('c','WATER_POINT',1,3,4),bad=facility('bad','HOSPITAL',0,-1);
 const f={routes:[a,b,c,bad]};assert.deepEqual(rankedRoutes(f).map(r=>r.id),['c','b','a']);
 const html=AccessApproaches(f);assert.ok(html.indexOf('data-id="c"')<html.indexOf('data-id="a"'));
 assert.match(html,/Shortest returned facility-to-incident/);assert.match(html,/exclude live closures/);assert.doesNotMatch(html,/Safe route|Recommended|ETA|passable/);
});
test('nearest support chooses one closest returned location per category, independently of travel time',()=>{
 const near=facility('near','FIRE_STATION',1,9),fast=facility('fast','FIRE_STATION',3,2),water=facility('water','WATER_POINT',2,4);
 const f={facilities:{FIRE_STATION:[fast,near],WATER_POINT:[water]}};
 assert.deepEqual(nearestSupport(f).map(r=>r.id),['near','water']);
 const html=NearestSupport(f);assert.match(html,/View all support points/);assert.doesNotMatch(html,/field-facility-tabs|data-kind=/);
});
test('national priority ranks current then recent, preserves area identity and avoids overlapping thermal totals',()=>{
 const vm={generatedAt:new Date(now).toISOString(),incidents:[{id:'1',region:'Earlier area',classification:'NEEDS_REVALIDATION',observedAt:'2026-08-01'},{id:'2',region:'Recent area',classification:'NEEDS_REVALIDATION',observedAt:'2026-09-08T12:00:00Z'},{id:'3',region:'Current area',classification:'VERIFIED_CURRENT',observedAt:'2026-09-08T11:00:00Z'}]};
 assert.deepEqual(regionalPriorities(vm).map(r=>r.name),['Current area','Recent area','Earlier area']);
 assert.equal(regionalPriorities(vm)[2].earlier,1);assert.equal(regionalPriorities(vm)[1].current,0);
 assert.equal(regionalPriorities(vm)[0].thermalCount,undefined);
});
test('national first-view strip omits unsupported metrics and retains a successful zero',()=>{
 const vm={physicalSummary:[m('activeOfficial',5),m('thermalHour',0),m('national-temperature',null)]};
 const html=NationalSignalStrip(vm);assert.match(html,/--signal-count:2/);assert.doesNotMatch(html,/signal-unavailable|Unknown|Not reported/);
});
test('national selection delegates map focus; generic table and city chip clutter are removed',async()=>{
 const calls=[],state=phaseBFixture(),c=approvedController({state,onAction:async a=>calls.push(a)});
 await c.action({dataset:{action:'select-region',region:'Évora'}});
 assert.deepEqual(calls,['global-region-focus:'+encodeURIComponent('Évora')]);
 const html=renderApprovedRoute('global-awareness',state);assert.match(html,/Regional priority/);assert.doesNotMatch(html,/region-pills|region-table|Stale weather/);
 assert.ok(html.indexOf('National situation')<html.indexOf('Portugal map'));
});
test('Reports leaves both navigation definitions but direct internal route stays functional',()=>{
 for(const path of ['src/data.js','src/approved/ui/shell.js'])assert.doesNotMatch(readFileSync(new URL('../'+path,import.meta.url),'utf8'),/\['reports-analytics','Reports & Analytics'/);
 const html=renderApprovedRoute('reports-analytics',phaseBFixture());
 assert.match(html,/data-report-view=/);assert.doesNotMatch(html.slice(html.indexOf('<nav'),html.indexOf('</nav>')),/Reports &amp; Analytics|Reports & Analytics/);
});
test('national fallback retains a verified zero without claiming public-feed availability',()=>{
 const vm={generatedAt:new Date(now).toISOString(),source:{data:{operationalTruth:{state:'READY',value:{activeCount:0}}}},physicalSummary:[m('activeOfficial',null)]};
 const metric=nationalCurrentMetric(vm);assert.equal(metric.value,0);assert.equal(metric.label,'Verified current incidents');
 const html=NationalSignalStrip(vm);assert.match(html,/Verified current incidents/);assert.doesNotMatch(html,/Current official incidents|Unknown|Unavailable/);
 vm.source.data.operationalTruth.state='UNAVAILABLE';assert.equal(nationalCurrentMetric(vm),null);
});
test('national area labels preserve source names without inventing regions from coordinates',()=>{
 assert.equal(namedArea('37.2558°N · 7.0468°W'),false);assert.equal(namedArea('Alentejo'),true);
 const ranked=regionalPriorities({generatedAt:new Date(now).toISOString(),incidents:[{id:'a',region:'37.2558°N · 7.0468°W',classification:'VERIFIED_CURRENT'},{id:'b',region:'Bragança',classification:'NEEDS_REVALIDATION'}]});
 assert.deepEqual(ranked.map(x=>x.name),['Bragança']);
});
test('support projection failure has a retry path without a weather-only response snapshot',()=>{
 const f={metrics:{wind:m('wind',6)},facilities:{},routes:[],response:null};
 assert.equal(ResponseSnapshot(f),'');assert.match(ResponseCoverage(f),/could not be loaded/);assert.match(ResponseCoverage(f),/data-action="refresh-runtime"/);
 assert.doesNotMatch(ResponseCoverage(f),/0 facilities|No facilities/);assert.equal(ResponseCoverage({...f,response:{facilities:{}}}),'');
});
test('incident inventory summaries also omit unsupported primary readings',()=>{
 const html=PhysicalInline({metrics:{temperature:m('temperature',22),wind:m('wind',6,{direction:'NW'}),gust:m('gust',null,{display:'Not reported'}),warnings:m('warnings',null,{display:'Unknown'}),rain:m('rain',0)}});
 assert.match(html,/22/);assert.match(html,/NW/);assert.match(html,/0/);assert.doesNotMatch(html,/Not reported|Unknown|gust/);assert.equal(PhysicalInline({metrics:{}}),'');
});
