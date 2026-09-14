import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sourceFreshness,operationalSourceRegistry } from '../src/modules/world/operational-source-registry.mjs';
import { validateSourceBatch,retainObservationHistory } from '../src/modules/world/observation-validation.mjs';
import { WorldService } from '../src/modules/world/world-service.mjs';
import { normalizeOccurrences,normalizeRisk } from '../src/modules/world/ptdata-normalizers.mjs';
import { IpmaGateway } from '../src/modules/world/ipma-gateway.mjs';
import { CopernicusGateway } from '../src/modules/world/copernicus-gateway.mjs';
import { PtDataGateway } from '../src/modules/world/ptdata-gateway.mjs';
import { weatherMetrics } from '../../../packages/domain/src/operational-twin/physical-conditions.mjs';
import { trend } from '../../../packages/domain/src/operational-twin/physical-metric.mjs';
import { stationRecords } from '../../../packages/domain/src/operational-twin/physical-world-context.mjs';
import { incidentBriefing } from '../../../packages/domain/src/operational-twin/incident-briefing.mjs';
import { withIncidentBriefing } from '../src/modules/operator/incident-briefing-projection.mjs';
import { validateOperationalGeometry,querySpatialRelationships } from '../src/modules/intelligence/reference-spatial-query.mjs';
import { createAssociationState,associateOperationalEvent } from '../../../packages/domain/src/operational-twin/incident-association.mjs';

const at='2026-09-12T12:00:00.000Z',old='2026-09-12T11:00:00.000Z';
const station=(extra={})=>({id:'station-1',stationId:'station-1',sourceId:'ipmaWeather',source:'IPMA',name:'Station',stationName:'Station',coordinate:[-8,40],observedAt:old,receivedAt:'2026-09-12T11:05:00.000Z',temperatureC:20,windSpeedKph:10,humidityPercent:40,precipitationMm:0,provenance:{synthetic:false,provider:'IPMA',rawSourceProductId:'raw:one'},...extra});

for(const [name,source,status,freshness] of [
  ['fresh',{upstreamAt:old,lastSuccessAt:at,staleAfterSeconds:7200,state:'current'},'healthy','CURRENT'],
  ['approaching',{upstreamAt:old,lastSuccessAt:at,staleAfterSeconds:4000,state:'current'},'healthy','APPROACHING_STALE'],
  ['stale',{upstreamAt:old,lastSuccessAt:at,staleAfterSeconds:1800,state:'current'},'stale','STALE'],
  ['unavailable retained',{upstreamAt:old,lastSuccessAt:at,error:'timeout',staleAfterSeconds:7200},'unavailable','CURRENT'],
  ['not configured',{state:'not_configured'},'unavailable','UNKNOWN'],
  ['future',{upstreamAt:'2026-09-12T12:01:00Z'},'degraded','TIME_CONFLICT']
])test(`registry ${name} separates acquisition from observations`,()=>{const r=sourceFreshness(source,at);assert.equal(r.status,status);assert.equal(r.freshness,freshness);});
test('registry preserves source-specific thresholds and explicit capability gaps',()=>{const r=operationalSourceRegistry({},at);assert.equal(r.sources.find(s=>s.id==='firms').staleAfterSeconds,21600);assert.equal(r.sources.find(s=>s.id==='ipmaWeather').staleAfterSeconds,10800);assert.equal(r.sources.find(s=>s.id==='unconfigured:road_conditions').provider,null);});
test('ingestion time never substitutes for observed time in registry',()=>{const r=sourceFreshness({lastSuccessAt:at,state:'current'},at);assert.equal(r.observedAt,null);assert.equal(r.ageBasis,'ACQUISITION_ONLY');});
test('normalization preserves unknown personnel and measured zero separately',()=>{const r=normalizeOccurrences({data:{occurrences:[{id:1,lat:40,lon:-8,nature:'Incendio rural',ground:0}]}})[0];assert.equal(r.operatives,null);assert.equal(r.aerial,null);assert.equal(r.ground,0);});
test('invalid forecast category is rejected rather than clamped into authority',()=>assert.equal(normalizeRisk({data:{risks:[{lat:40,lon:-8,level:99}]}}).length,0));
test('impossible measurements are null with field-level quarantine; zero retained',()=>{const r=validateSourceBatch('ipmaWeather',[station({temperatureC:800,humidityPercent:101,windSpeedKph:-1})],at);assert.equal(r.data[0].temperatureC,null);assert.equal(r.data[0].humidityPercent,null);assert.equal(r.data[0].windSpeedKph,null);assert.equal(r.data[0].precipitationMm,0);assert.equal(r.data[0].validation.invalidFields.length,3);});
for(const [name,patch] of [['coordinate',{coordinate:[400,40]}],['missing time',{observedAt:null}],['future',{observedAt:'2099-01-01T00:00:00Z'}],['synthetic',{provenance:{synthetic:true}}]])test(`invalid ${name} record does not discard valid peers`,()=>{const r=validateSourceBatch('ipmaWeather',[station(patch),station()],at);assert.equal(r.data.length,1);assert.equal(r.rejectedCount,1);});
test('bounded source payload rejects non-arrays and oversized cohorts',()=>{assert.throws(()=>validateSourceBatch('weather',{},at));assert.throws(()=>validateSourceBatch('weather',Array(20001).fill(null),at));});
test('history deduplicates replay but retains first receipt and conflicting revisions',()=>{let r=retainObservationHistory([],[station()],{sourceId:'ipmaWeather',receivedAt:at,asOf:at});r=retainObservationHistory(r,[station({receivedAt:at}),station({temperatureC:24,receivedAt:at})],{sourceId:'ipmaWeather',receivedAt:at,asOf:at});assert.equal(r.length,2);assert.equal(r[0].receivedAt,'2026-09-12T11:05:00.000Z');assert.equal(new Set(r.map(x=>x.observationId)).size,1);});
test('history rejects expired/future/synthetic observations',()=>{const r=retainObservationHistory([],[station({observedAt:'2020-01-01T00:00:00Z'}),station({observedAt:'2099-01-01T00:00:00Z'}),station({provenance:{synthetic:true}})],{sourceId:'ipmaWeather',asOf:at});assert.equal(r.length,0);});
for(const [value,delta,direction]of [[34,15,'INCREASED'],[4,-15,'DECREASED'],[19,0,'UNCHANGED']])test(`change ${direction} uses the previous real observation`,()=>{const r=trend([station({windSpeedKph:2,observedAt:'2026-09-12T10:00:00Z'}),station({windSpeedKph:19}),station({windSpeedKph:value,observedAt:'2026-09-12T11:45:00Z'})],'windSpeedKph',at);assert.equal(r.delta,delta);assert.equal(r.minutes,45);assert.equal(r.previousValue,19);assert.equal(r.direction,direction);});
test('single observation produces no invented delta',()=>assert.equal(trend([station()],'windSpeedKph',at),null));
test('small changes remain history, not material changes',()=>assert.equal(trend([station(),station({windSpeedKph:10.1,observedAt:at})],'windSpeedKph',at).material,false));
test('conflicting same-station/time reports remain inspectable and no single value selected',()=>{const r=weatherMetrics([station(),station({temperatureC:24})],at,{location:[-8,40]});assert.equal(r.temperature.value,null);assert.equal(r.temperature.conflicts.length,2);assert.equal(r.temperature.missingReason,'CONFLICTING_VALUES');});
test('different stations are never a comparison series',()=>{const r=weatherMetrics([station(),station({stationId:'two',coordinate:[-9,40],temperatureC:40,observedAt:at})],at,{location:[-8,40]});assert.equal(r.temperature.trend,null);});

test('provider to persisted history to briefing survives timeout, empty, malformed and recovery',async()=>{
  await mkdir('.tmp/tests',{recursive:true});const dir=await mkdtemp(path.resolve('.tmp/tests/intelligence-'));let now=old,mode='current';
  const payload=()=>({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-8,40]},properties:{idEstacao:1,time:now,localEstacao:'Station',temperatura:mode==='second'?24:20,humidade:40,intensidadeVentoKM:mode==='second'?25:10,precAcumulada:0}}]});
  const ipma=new IpmaGateway({clock:()=>new Date(now),fetchImpl:async url=>{if(mode==='timeout')throw new Error('upstream_timeout');if(mode==='http')return new Response('{}',{status:503});return new Response(JSON.stringify(String(url).includes('warnings')?[]:mode==='malformed'?{error:'bad'}:mode==='empty'?{type:'FeatureCollection',features:[]}:payload()));}});
  const gateway={snapshot:async()=>ipma.snapshot()},create=()=>new WorldService({sourceGateway:gateway,clock:()=>new Date(now),stateFile:path.join(dir,'state.json')});
  try{
    const service=create();await service.refresh({force:true});now=at;mode='second';await service.refresh({force:true});
    const restored=create();await restored.loadCache();const world=await restored.snapshot({preferCache:true});assert.equal(world.weatherHistory.length,2);
    const weather=weatherMetrics(stationRecords(world),at,{location:[-8,40]});assert.equal(weather.wind.trend.delta,15);assert.equal(weather.wind.receivedAt,at);
    const physical={incidentId:'one',weather,thermal:{metrics:[]},places:{roads:[]}};
    const briefing=incidentBriefing({physical,sources:world.sourceRegistry,asOf:at});assert.equal(briefing.changes.find(c=>c.id==='wind').delta,15);assert.equal(briefing.access.confirmedClosureCount,null);
    for(mode of ['timeout','http','malformed']){await restored.refresh({force:true});const failed=await restored.snapshot({preferCache:true});assert.equal(failed.directWeather.length,1);assert.equal(failed.sourceRegistry.sources.find(s=>s.id==='ipmaWeather').status,'unavailable');assert.equal(failed.directWeather[0].observedAt,at);}
    mode='empty';await restored.refresh({force:true});const empty=await restored.snapshot({preferCache:true});assert.equal(empty.directWeather.length,0);assert.equal(empty.sources.ipmaWeather.error,null);assert.match(empty.sources.ipmaWeather.emptyProductMeaning,/no mainland station/);
    now='2026-09-12T16:00:00Z';const aged=await restored.snapshot({preferCache:true});assert.equal(aged.sourceRegistry.sources.find(s=>s.id==='ipmaWeather').freshness,'STALE');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('PTData malformed schema is unavailable, successful empty is empty',async()=>{for(const bad of [true,false]){const p=new PtDataGateway({clock:()=>new Date(at),fetchImpl:async()=>new Response(JSON.stringify(bad?{error:'bad'}:{data:[]}))});const r=await p.snapshot();assert.equal(r.weather.state.state,bad?'unavailable':'current');assert.equal(r.weather.data.length,0);}});
test('API does not attach another incident briefing when selected context is missing',async()=>{const r=await withIncidentBriefing({physicalWorld:{value:{incidents:[{incidentId:'other'}]}}},{incidentId:'selected',asOf:at});assert.equal(r.incidentIntelligence.state,'UNAVAILABLE');});
test('API geospatial failure does not discard independent weather facts',async()=>{const weather=weatherMetrics([station()],at),physical={incidentId:'one',weather,thermal:{metrics:[]},places:{roads:[]}};const r=await withIncidentBriefing({physicalWorld:{value:{incidents:[physical]}}},{incidentId:'one',asOf:at,world:{},service:{project:async()=>({state:'UNAVAILABLE',relationships:[]}),sourceRecords:()=>[]}});assert.ok(r.incidentIntelligence.value.facts.some(f=>f.id==='wind'));assert.equal(r.incidentIntelligence.value.exposure.state,'UNAVAILABLE');});

const polygon={type:'Polygon',coordinates:[[[-8.01,39.99],[-7.99,39.99],[-7.99,40.01],[-8.01,40.01],[-8.01,39.99]]]};
for(const [name,geometry,expected]of [['point',{type:'Point',coordinates:[-8,40]},true],['polygon',polygon,true],['multipolygon',{type:'MultiPolygon',coordinates:[polygon.coordinates]},true],['null',null,false],['unclosed',{type:'Polygon',coordinates:[[[-8,40],[-7,40],[-7,41],[-8,41]]]},false],['antimeridian',{type:'LineString',coordinates:[[179,40],[-179,40]]},false],['wrong CRS',{...polygon,crs:{name:'EPSG:3857'}},false]])test(`geometry validation ${name}`,()=>assert.equal(validateOperationalGeometry(geometry),expected));
test('spatial query validates bounds before database access',async()=>{await assert.rejects(()=>querySpatialRelationships(null,{coordinate:[200,40]}),/scope/);await assert.rejects(()=>querySpatialRelationships(null,{coordinate:[-8,40],features:Array(2001).fill({})}),/bound/);});

const event=(id,key,lon=-8)=>({id,eventType:'wildfire.observation',hazardType:'wildfire',geometry:{type:'Point',coordinates:[lon,40]},clocks:{observedAt:old,occurredAt:old},correlationKeys:key?[key]:[]});
test('association exact official identity and duplicate observation are stable',()=>{const state=createAssociationState(),a=event('a','incident:one');associateOperationalEvent(state,a);associateOperationalEvent(state,a);associateOperationalEvent(state,event('b','incident:one'));assert.equal(state.incidents.size,1);assert.equal(state.incidents.get('incident:one').eventIds.length,2);});
test('nearby distinct official incident identifiers remain separate',()=>{const state=createAssociationState();associateOperationalEvent(state,event('a','incident:one'));associateOperationalEvent(state,event('b','incident:two',-8.001));assert.equal(state.incidents.size,2);});
test('ambiguous unkeyed observation is not merged into nearby fires',()=>{const state=createAssociationState();associateOperationalEvent(state,event('a','incident:one',-8.001));associateOperationalEvent(state,event('b','incident:two',-7.999));assert.equal(associateOperationalEvent(state,event('c',null)),null);assert.equal(state.eventAssociations.get('c').state,'AMBIGUOUS');});

test('cached malformed and synthetic records are quarantined before read projection',async()=>{
 const dir=await mkdtemp(path.resolve('.tmp/tests/cache-'));try{
 await writeFile(path.join(dir,'source-cache.json'),JSON.stringify({meta:{mode:'production'},sources:{},directWeather:[station(),station({id:'fake',provenance:{synthetic:true}})],weatherHistory:[null,station({temperatureC:800})]}));
 const service=new WorldService({sourceGateway:{snapshot:async()=>({})},stateFile:path.join(dir,'state.json'),clock:()=>new Date(at)});
 await service.loadCache();const snapshot=await service.snapshot({preferCache:true});
 assert.equal(snapshot.directWeather.length,1);assert.equal(snapshot.sources.ipmaWeather.error,'cached_records_rejected');assert.equal(snapshot.weatherHistory.length,1);assert.equal(snapshot.weatherHistory[0].temperatureC,null);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('malformed gateway result isolates failure without crashing independent source',async()=>{
 const dir=await mkdtemp(path.resolve('.tmp/tests/malformed-'));try{
 const service=new WorldService({acquisitionStore:{markProductsIngested:async()=>{}},sourceGateway:{snapshot:async()=>({weather:null,ipmaWeather:{data:[station()],state:{id:'ipmaWeather',state:'current',lastSuccessAt:at}}})},stateFile:path.join(dir,'state.json'),clock:()=>new Date(at)});
 await service.initialize();const snapshot=await service.snapshot({preferCache:true});assert.equal(snapshot.directWeather.length,1);assert.equal(snapshot.sources.weather.error,'provider_result_schema_invalid');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('matching cross-provider observations expose disagreement without averaging',()=>{
 const definition={temperature:{statistic:'hourly mean',periodMinutes:60}};
 const primary=station({measurementDefinitions:definition}),other=station({sourceId:'weather',temperatureC:26,measurementDefinitions:definition,provenance:{synthetic:false,provider:'IPMA via PTData'}});
 const records=stationRecords({directWeather:[primary],weatherHistory:[other],sources:{ipmaWeather:{state:'current'}}});
 const result=weatherMetrics(records,at,{location:[-8,40]});assert.equal(result.temperature.value,null);assert.equal(result.temperature.conflicts.length,2);
 other.measurementDefinitions={temperature:{statistic:'instantaneous'}};const incomparable=stationRecords({directWeather:[primary],weatherHistory:[other],sources:{ipmaWeather:{state:'current'}}});
 assert.equal(weatherMetrics(incomparable,at,{location:[-8,40]}).temperature.value,20);
});

test('API thrown spatial failure retains independent weather facts',async()=>{
 const physical={incidentId:'one',weather:weatherMetrics([station()],at),thermal:{metrics:[]},places:{roads:[]}};
 const r=await withIncidentBriefing({physicalWorld:{value:{incidents:[physical]}}},{incidentId:'one',asOf:at,world:{},service:{project:async()=>{throw new Error('database timeout');},sourceRecords:()=>[]}});
 assert.ok(r.incidentIntelligence.value.facts.some(f=>f.id==='wind'));assert.equal(r.incidentIntelligence.value.exposure.state,'UNAVAILABLE');
});
test('expired or cancelled road restriction cannot become current closure count',()=>{
 for(const patch of [{expires:'2026-09-12T11:58:00Z'},{cancelled:true},{effective:'2026-09-12T13:00:00Z'}]){
 const r=incidentBriefing({physical:{places:{roads:[{id:'road',source:'Official test notice',statusEvidenceId:'notice:1',observedAt:'2026-09-12T11:55:00Z',state:'CLOSED',...patch}]}},sources:{sources:[]},asOf:at});
 assert.equal(r.access.confirmedClosureCount,null);assert.equal(r.access.retainedReports.length,1);
 }
});
test('future ingestion clock conflicts even when observation clock is valid',()=>{
 assert.equal(sourceFreshness({upstreamAt:old,lastSuccessAt:'2026-09-12T12:10:00Z',state:'current'},at).freshness,'TIME_CONFLICT');
});

test('catalogue request is bounded and successful empty is distinct from schema failure',async()=>{
 let malformed=false,limit;
 const gateway=new CopernicusGateway({clock:()=>new Date(at),fetchImpl:async(url,options)=>{limit=JSON.parse(options.body).limit;return new Response(JSON.stringify(malformed?{}:{type:'FeatureCollection',features:[]}),{status:200});}});
 const empty=await gateway.snapshot();assert.equal(limit,20);assert.equal(empty.state.state,'current');assert.match(empty.state.emptyProductMeaning,/no matching/);assert.equal(empty.data.every(r=>r.provenance.synthetic===false),true);
 malformed=true;assert.equal((await gateway.snapshot()).state.state,'unavailable');
});

test('feed publication cannot masquerade as the latest station observation',()=>{
 const source={state:'current',upstreamAt:at,lastSuccessAt:at};
 const r=operationalSourceRegistry({sources:{ipmaWeather:source,riskToday:source},directWeather:[station()]},at);
 const weather=r.sources.find(s=>s.id==='ipmaWeather'),forecast=r.sources.find(s=>s.id==='riskToday');
 assert.equal(weather.lastObservationAt,old);assert.equal(weather.sourcePublicationAt,at);assert.equal(forecast.lastObservationAt,null);assert.equal(forecast.ageBasis,'ACQUISITION_ONLY');
});
