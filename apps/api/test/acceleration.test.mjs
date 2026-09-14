import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {facilityPresentation,FACILITY_TYPES,resolveEntity} from '../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {WorldKnowledgeStore} from '../src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../src/modules/intelligence/world-knowledge-service.mjs';
import {FacilityDetail} from '../../operator-console/src/approved/ui/facility-detail.js';
import {BasemapDiskCache} from '../src/modules/basemap/basemap-disk-cache.mjs';
import {observeMapSources} from '../../operator-console/src/mapSourceManager.js';
import {normalizePublicPhone} from '../src/modules/intelligence/facility-directory-adapters.mjs';
test('public Portuguese contact prefixes normalize without dropping compact international numbers',()=>{
 for(const value of ['266 740 100','+351266740100','00351266740100','+351 266 740 100'])assert.equal(normalizePublicPhone(value),'+351266740100');
 assert.equal(normalizePublicPhone('123456789012345'),null);
});
test('failed labels stay degraded after idle, retry independently twice and preserve ready imagery',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const handlers={},calls=[],map={dataset:{}},instance={},gl={on:(name,fn)=>{handlers[name]=fn;},getSource:id=>({serialize:()=>({tiles:['/labels/{z}/{x}/{y}']}),setTiles:tiles=>calls.push({id,tiles})}),triggerRepaint:()=>{}};
 observeMapSources(gl,map,instance);handlers.sourcedata({sourceId:'vigia-imagery',isSourceLoaded:true});
 const failure={sourceId:'vigia-labels',tile:{tileID:{key:'tile-one'}}};handlers.error(failure);handlers.sourcedata({sourceId:'vigia-labels',isSourceLoaded:true});
 assert.equal(instance.sourceStates['vigia-labels'],'DEGRADED');assert.equal(instance.sourceStates['vigia-imagery'],'READY');
 t.mock.timers.tick(2000);handlers.error(failure);t.mock.timers.tick(4000);handlers.error(failure);t.mock.timers.tick(20000);
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.id==='vigia-labels'));
 handlers.sourcedata({sourceId:'vigia-labels',isSourceLoaded:true,tile:{state:'loaded',tileID:{key:'tile-one'}}});assert.equal(instance.sourceStates['vigia-labels'],'READY');instance.disposeSources();
});
const now='2026-09-12T12:00:00Z',source={url:'https://www.cm-evora.pt/test',provider:'Municipal test fixture',authority:'MUNICIPAL',format:'JSON',adapter:'REVIEWED_STRUCTURED',operationalAdmission:true,watch:false};
async function fixture(t){await mkdir('.tmp/test',{recursive:true});const dir=await mkdtemp(path.resolve('.tmp/test/acceleration-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new WorldKnowledgeStore({filePath:path.join(dir,'store.json')}),service=new WorldKnowledgeService({store,clock:()=>new Date(now)});await service.initialize();return{dir,store,service};}
const ingest=(service,records)=>service.ingest(Buffer.from(JSON.stringify({records})),source);
test('facility-only recomputation preserves dated weather context, while an explicit empty refresh retires it',async t=>{
 const {service,store}=await fixture(t);await service.relateIncident('incident:context',[-8,40],{weather:{id:'station:one',observedAt:now}});
 await service.relateIncident('incident:context',[-8,40]);assert.equal((await store.read()).relations.find(r=>r.kind==='WEATHER_CONTEXT').state,'CURRENT');
 await service.relateIncident('incident:context',[-8,40],{weather:null});assert.equal((await store.read()).relations.find(r=>r.kind==='WEATHER_CONTEXT').state,'STALE');
});
test('an exact institution and postal street resolve without geocoding or a shared switchboard assumption',()=>{
 const candidate={id:'official:maternity',canonicalName:'Maternidade Bissaya Barreto',address:{street:'Rua Augusta',postcode:'3000-061'}};
 const raw={name:'Maternidade Bissaya Barreto',street:'Rua Augusta',postcode:'3000-061'};
 assert.equal(resolveEntity(raw,[candidate]).entityId,candidate.id);
 assert.equal(resolveEntity({...raw,postcode:'3000-062'},[candidate]).entityId,null);
 assert.equal(resolveEntity(raw,[candidate,{...candidate,id:'ambiguous:second-branch'}]).entityId,null);
});
test('a newly encountered governed police point is remembered once with a durable incident-priority gap',async t=>{
 const {service,store}=await fixture(t),raw={id:'osm:node:police-test',name:'GNR Test Station',kind:'POLICE',coordinate:[-8.12,39.67],distanceKm:4.61,provenance:{provider:'OpenStreetMap contributors',sourceRecordId:'node:police-test',retrievedAt:now}};
 service.decorate(raw);assert.equal(service.observedFacilities?.size??0,0);
 service.decorate(raw,{observe:true});service.decorate(raw,{observe:true});await service.rememberObservedFacilities();await service.refreshCache();
 const before=await store.read(),entity=service.decorate(raw);assert.equal(before.entities.length,1);assert.ok(entity.canonicalId);assert.equal(entity.canonicalType,'police_station');
 assert.ok(before.jobs.some(j=>j.type==='ENRICH_FACILITY'&&j.payload.distanceKm===4.61));
 const restarted=new WorldKnowledgeService({store,clock:()=>new Date(now),model:{extract:()=>{throw Error('inference forbidden');}}});await restarted.initialize();
 assert.equal(restarted.decorate(raw).canonicalId,entity.canonicalId);assert.doesNotMatch(FacilityDetail(restarted.decorate(raw)),/Capacity not confirmed|Opening status not confirmed/);
});
test('verified healthcare and historical reception facts are composed with separate activation meaning',async t=>{
 const {service}=await fixture(t);await ingest(service,[{id:'hospital-sheet',canonicalName:'Hospital Test',canonicalType:'hospital',capabilities:{emergencyDepartment:true}},{id:'historical-sheet',canonicalName:'Pavilion Test',canonicalType:'temporary_reception_center',designation:{historicalKind:'RECEPTION_CENTER'},activation:{lastReported:'ACTIVATED',observedAt:'2026-02-11T04:30:00Z'}}]);
 assert.match(FacilityDetail(service.decorate({id:'hospital-sheet'})),/Emergency department.*Verified by the published source/s);
 const sheet=FacilityDetail(service.decorate({id:'historical-sheet'}));assert.match(sheet,/Historical designation/);assert.match(sheet,/does not establish that this place is receiving people now/);
});
test('every facility type has domain-owned relevance and irrelevant fields are omitted',async t=>{const {service}=await fixture(t);for(const type of FACILITY_TYPES)assert.equal(typeof facilityPresentation(type).showRouting,'boolean');for(const [kind,type] of [['POLICE','police_station'],['FIRE_STATION','fire_station'],['WATER_POINT','water_point'],['SHELTER','shelter_generic']]){const f=service.decorate({id:'raw:'+kind,kind,name:kind,distanceKm:1});assert.equal(f.canonicalType,type);assert.doesNotMatch(FacilityDetail(f),/Capacity not confirmed|Opening status not confirmed|Can I use this place/);}assert.equal(facilityPresentation('hospital').showEmergencyDepartment,true);});
test('nearest hospital and qualified nearest are distinct, and no inference runs on queries',async t=>{const {service}=await fixture(t);await ingest(service,[{id:'near',canonicalName:'Hospital Near',canonicalType:'hospital',coordinate:[-7.9,38.57]},{id:'qualified',canonicalName:'Hospital Emergency',canonicalType:'hospital',coordinate:[-7.95,38.57],capabilities:{emergencyDepartment:true}}]);service.model.extract=()=>{throw Error('inference on read');};const relations=await service.relateIncident('incident:test',[-7.901,38.57]);assert.equal(relations.find(r=>r.kind==='NEAREST_HOSPITAL').entityId,service.cache.get('near').id);assert.equal(relations.find(r=>r.kind==='NEAREST_EMERGENCY_CAPABLE_HOSPITAL').entityId,service.cache.get('qualified').id);assert.equal(relations.find(r=>r.kind==='NEAREST_HOSPITAL').ranking.routeAvailability,'NOT_EVALUATED');});
test('designation does not activate a centre; expired activation is withheld',async t=>{const {service}=await fixture(t);await ingest(service,[{id:'centre',canonicalName:'Reception Centre',canonicalType:'temporary_reception_center',designation:{kind:'RECEPTION_CENTER'},activation:{state:'ACTIVATED',validFrom:'2026-02-01',validUntil:'2026-02-02'}}]);const entity=await service.entity('centre');assert.equal(entity.designation.kind,'RECEPTION_CENTER');assert.equal(entity.activation?.state,undefined);assert.equal(entity.fields['activation.state'].state,'STALE');});
test('branches sharing a switchboard cannot merge across different postal addresses',()=>{const result=resolveEntity({name:'Centro de Saúde Unidade Norte',phone:'+351239111111',postcode:'3000-100',street:'Rua Norte'},[{id:'south',canonicalName:'Centro de Saúde Unidade Norte',contact:{phone:'239111111'},address:{postcode:'3000-200',street:'Rua Sul'}}]);assert.equal(result.entityId,null);assert.equal(result.candidates[0].hardConflict,true);});
test('unlinked enrichment gap retains its failed attempt and next eligibility',async t=>{const {service,store}=await fixture(t);await ingest(service,[{id:'gap',canonicalName:'GNR Test',canonicalType:'police_station'}]);await service.tick();const before=(await store.read()).jobs.find(j=>j.type==='ENRICH_FACILITY');assert.equal(before.state,'FAILED');assert.equal(before.resolutionResult,'NO_APPROVED_SOURCE_LINK');await store.enqueue('ENRICH_FACILITY',before.subject,{dueAt:now,payload:before.payload});const after=(await store.read()).jobs.find(j=>j.id===before.id);assert.equal(after.attempts,before.attempts);assert.equal(after.state,'FAILED');assert.ok(after.nextEligibleAttempt>now);});
test('static tile bytes and original acquisition time survive a cache restart',async t=>{const {dir}=await fixture(t);const one=new BasemapDiskCache(path.join(dir,'tiles')),value={buffer:Buffer.from('tile bytes'),acquiredAt:now,provider:'Provider',contentType:'image/png',state:'current'};await one.set('imagery:10:1:2',value);const two=new BasemapDiskCache(path.join(dir,'tiles')),r=await two.get('imagery:10:1:2');assert.equal(r.buffer.toString(),'tile bytes');assert.equal(r.acquiredAt,now);assert.equal(await two.get('../../secret'),null);});
test('reviewed real ULS branches have separate record IDs and exact source passages',async()=>{const review=JSON.parse(await readFile('data/reference/facility-intelligence/acceleration/directory-review.json','utf8')),sources=review.sources.filter(s=>s.source.adapter==='ULS_CONTACT_TABLE');assert.ok(sources.length>30);for(const {records}of sources){assert.equal(new Set(records.map(r=>r.id)).size,records.length);for(const r of records){assert.ok(r.sourceText.includes(r.canonicalName));assert.match(r.address,/\d{4}-\d{3}/);assert.ok(!r.capabilities?.emergencyDepartment);}}});
