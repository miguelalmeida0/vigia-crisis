import test from 'node:test';
import assert from 'node:assert/strict';
import {FacilityDetail,facilityTitle,humanDistance} from '../src/approved/ui/facility-detail.js';
import {MeasurementPanel,OfficialNoticeList} from '../src/approved/ui/measurement-panel.js';
import {selectOptionMarkup} from '../src/approved/ui/select-runtime.js';

const facility={id:'osm:node:1',kind:'SHELTER',name:'Mapped shelter',coordinate:[-8,39],distanceKm:.55,provenance:{provider:'OpenStreetMap'},reachability:{state:'ROUTED',travelTimeMinutes:3.1,routeDistanceKm:1.41}};
test('facility identity remains honest and distance uses human units, including zero',()=>{
 assert.equal(facilityTitle(facility),'Shelter');assert.equal(humanDistance(.55),'550 m');assert.equal(humanDistance(0),'0 m');assert.equal(humanDistance(null),'Distance unavailable');
 assert.equal(facilityTitle({...facility,name:'Pavilhão Municipal'}),'Shelter · Pavilhão Municipal');
 const html=FacilityDetail({...facility,locality:'Évora',address:'Évora',addressPrecision:'LOCALITY'});
 assert.match(html,/Exact street address is not available/);assert.match(html,/Évora/);assert.match(html,/550 m/);
 assert.match(html,/Estimated drive to the incident/);assert.doesNotMatch(html,/Evacuation shelter|safe route|3.1 min to the shelter/i);
});
test('stale capacity cannot imply availability, and confirmed zero places is not unknown',()=>{
 const capacity={state:'STALE',fields:{spacesAvailable:20,acceptingPeople:true}};
 const stale=FacilityDetail({...facility,dynamicCapacity:capacity});assert.match(stale,/Opening status not confirmed/);assert.match(stale,/Available places not confirmed/);assert.doesNotMatch(stale,/Receiving people|20 places reported available/);
 const zero=FacilityDetail({...facility,dynamicCapacity:{state:'FIELD_REPORTED',fields:{spacesAvailable:0,acceptingPeople:false}}});assert.match(zero,/0 places reported available/);assert.match(zero,/Not receiving people/);
});
test('directions action uses the facility point and only supplied phone data',()=>{
 const html=FacilityDetail({...facility,contact:{phone:'+351 123 456 789'}});assert.match(html,/href="tel:\+351123456789"/);assert.match(html,/mlat=39&amp;mlon=-8/);assert.match(html,/Source and location details/);assert.doesNotMatch(html,/<details[^>]*open/);
 assert.doesNotMatch(FacilityDetail({...facility,coordinate:null}),/openstreetmap.org/);
});
test('missing readings move to coverage while zero and complete technical nuance survive',()=>{
 const metrics=[{id:'rain',label:'Rain',value:0,display:'0',unit:'mm',available:true,source:'IPMA',freshnessLabel:'Measured 5m ago',context:'Regional station, not the incident',definition:{periodMinutes:60}}, {id:'gust',label:'Gust',value:null,display:'Not reported',available:false,source:'IPMA',missingText:'The station does not report gusts.'}];
 const html=MeasurementPanel({metrics});const current=html.split('What changed')[0];
 assert.match(current,/<strong>0<\/strong>/);assert.doesNotMatch(current,/Not reported|The station does not report/);
 assert.match(html,/Some readings missing/);assert.match(html,/The station does not report gusts/);assert.match(html,/Regional station, not the incident/);assert.match(html,/periodMinutes/);
});
test('changes use supplied previous/current samples without manufacturing deltas',()=>{
 const html=MeasurementPanel({changes:[{label:'Wind',previous:0,current:8,unit:'km/h',source:'IPMA',timeLabel:'10:00 UTC'}]});assert.match(html,/0 → <b>8 km\/h/);assert.match(html,/10:00 UTC/);
 assert.match(MeasurementPanel({}),/No dated change was returned/);
});
test('source refresh failures stay in coverage rather than displacing condition changes',()=>{
 const html=MeasurementPanel({changes:[{type:'System failure',text:'Weather could not be refreshed. Last known observations may be retained.',source:'IPMA',timeLabel:'10:00 UTC'}]});
 const changes=html.split('What changed')[1].split('Source status &amp; coverage')[0].split('Source status & coverage')[0];
 assert.doesNotMatch(changes,/Weather could not be refreshed/);assert.match(html,/Source updates · 1/);assert.match(html,/Last known observations may be retained/);
});
test('official notices and option labels escape untrusted content while preserving semantics',()=>{
 assert.doesNotMatch(OfficialNoticeList([{type:'<script>bad</script>',text:'<img src=x>',authority:'IPMA'}]),/<script>|<img/);
 const html=selectOptionMarkup({value:'x" onclick="bad',label:'<bad>',selected:true,disabled:true});assert.match(html,/aria-selected="true"/);assert.match(html,/aria-disabled="true"/);assert.match(html,/&lt;bad&gt;/);assert.doesNotMatch(html,/ onclick="bad/);
});
