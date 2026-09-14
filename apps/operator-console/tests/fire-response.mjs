import test from 'node:test';
import assert from 'node:assert/strict';
import {phaseBFixture} from './phase-b-fixture.mjs';
import {renderApprovedRoute} from '../src/approved/index.js';
import {fieldModel,usable} from '../src/approved/data/field.js';
import {FieldMetric,FieldFeed,RoadOptions,FacilityTable,WeatherHistory} from '../src/approved/ui/field.js';
import {parseRouteUrl,routeHash,migrateLegacyRouteState} from '../src/routeState.js';
import {sourceFor,routeURL} from '../src/approved/data/model.js';

const metric={id:'rain',label:'Rain',unit:'mm',value:0,available:true,observedAt:'2026-09-08T14:00:00Z',source:'IPMA',validity:'VALID_VALUE'};
test('replacement URLs retain incident selection and existing API contracts',()=>{
 for(const [slug,key] of [['fire-activity','intelligence'],['response-access','operations']]){
  const parsed=parseRouteUrl('http://vigia.local/#/'+slug+'?id=incident%3Atest');
  assert.equal(parsed.route,key);assert.equal(parsed.params.get('id'),'incident:test');
  assert.equal(routeHash(key,parsed.params),'#/'+slug+'?id=incident%3Atest');
  assert.equal(migrateLegacyRouteState('http://vigia.local/#/'+key+'?id=incident%3Atest').url.hash,'#/'+slug+'?id=incident%3Atest');
  assert.equal(routeURL(key,'incident:test'),'#/'+slug+'?id=incident%3Atest');
  const f=phaseBFixture();assert.equal(sourceFor(f,slug),sourceFor(f,key));
 }
});
test('missing or invalid values disappear while measured zero remains',()=>{
 assert.equal(FieldMetric({...metric,value:null,available:false}),'');
 assert.equal(FieldMetric({...metric,validity:'NO_VALID_VALUE'}),'');
 assert.equal(FieldMetric({...metric,observedAt:null}),'');
 assert.equal(FieldMetric({...metric,source:null}),'');
 assert.match(FieldMetric(metric),/>0<span>mm/);assert.match(FieldMetric(metric),/14:00 UTC/);
});
test('replacement primary pages omit administrative and null modules',()=>{
 for(const route of ['intelligence','operations']){
  const html=renderApprovedRoute(route,phaseBFixture());
  const primary=html.slice(html.indexOf('<main')).replace(/<[^>]*>/g,' ');
  assert.doesNotMatch(primary,/unknown|unavailable|evidence|confidence|waiting confirmation|task status|source not returned/i);
  assert.doesNotMatch(html,/field-signals|field-facilities-panel|field-routes-panel|task-list-panel|supporting-intelligence/);
  assert.match(html,/field-map-panel/);
 }
});
test('field activity is dated, scoped, deduplicated and excludes internal events',()=>{
 const change={at:'2026-09-08T14:00:00Z',type:'Weather',source:'IPMA',where:'Station A',text:'Wind increased by 2 km/h in 60 minutes.'};
 const f=fieldModel({runtime:{},generatedAt:'2026-09-08T15:00:00Z',physical:{changes:[change,change,{...change,type:'Internal audit'},{...change,at:'2027-01-01'}]}});
 assert.equal(f.events.length,1);assert.equal(FieldFeed([]),'');
 assert.match(FieldFeed(f.events),/Wind increased/);assert.match(FieldFeed(f.events),/datetime="2026-09-08T14:00:00Z"/);
});
test('facility display keeps static mapping distinct from response availability',()=>{
 const facility={id:'f',kind:'FIRE_STATION',name:'Mapped station',coordinate:[-8,41],distanceKm:3,provenance:{provider:'OpenStreetMap'},reachability:{state:'ROUTED',travelTimeMinutes:8,routeDistanceKm:6,checkedAt:'2026-09-08T14:00:00Z'}};
 const f=fieldModel({runtime:{},source:{data:{responseCapability:{state:"READY",value:{facilities:{FIRE_STATION:[facility]},generatedAt:'2026-09-08T14:00:00Z'}}}}});
 assert.equal(f.facilities.FIRE_STATION.length,1);assert.equal(f.routes.length,1);
 const html=RoadOptions(f)+FacilityTable(f);
 assert.match(html,/Facility → incident/);assert.match(html,/Road-network estimates exclude live closures/);
 assert.doesNotMatch(html,/Recommended|Safe route|Open<|ETA|Available crew/);
 facility.reachability.state='FAILED';assert.equal(fieldModel({runtime:{},source:{data:{responseCapability:{state:"READY",value:{facilities:{FIRE_STATION:[facility]}}}}}}).routes.length,0);
});
test('hostile provider labels are escaped on the new cards and feed',()=>{
 assert.doesNotMatch(FieldMetric({...metric,source:'<script>bad</script>'}),/<script>/);
 assert.doesNotMatch(FieldFeed([{at:metric.observedAt,type:'Weather',text:'<img src=x onerror=alert(1)>',source:'<script>x</script>'}]),/<img|<script/);
});
test('observation history keeps dates across midnight',()=>{
 const html=WeatherHistory({metrics:{rain:{...metric,trend:{samples:[{at:'2026-09-07T23:00:00Z',value:1},{at:'2026-09-08T00:00:00Z',value:0}]}}}});
 assert.match(html,/7 Sept · 23:00/);assert.match(html,/8 Sept · 00:00/);
});
