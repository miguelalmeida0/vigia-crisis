import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { resolveLocalDatabaseUrl } from '../../../scripts/local_database_secret.mjs';
import { querySpatialRelationships } from '../src/modules/intelligence/reference-spatial-query.mjs';
import { retainPerimeterObservation } from '../src/modules/intelligence/perimeter-observation-history.mjs';
import { IncidentContextService } from '../src/modules/intelligence/incident-context-service.mjs';

const enabled=process.env.VIGIA_TEST_POSTGIS==='1';
const pool=enabled?new pg.Pool({connectionString:await resolveLocalDatabaseUrl(),connectionTimeoutMillis:3000}):null;
test.after(async()=>pool?.end());
const box=(w,s,e,n)=>({type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]});
const previous=box(-8.005,39.995,-7.995,40.005),current=box(-8.01,39.99,-7.99,40.01);
const feature=(id,geometry,kind='SETTLEMENT')=>({id,name:id,source:'TEST_ONLY',provenanceRef:'test:fixture',geometry,kind});
const point=(x,y)=>({type:'Point',coordinates:[x,y]});
const query=options=>querySpatialRelationships(pool,{coordinate:[-8,40],current,previous,features:[feature('inside',point(-8,40)),feature('new',point(-7.992,40)),feature('outside',point(-7.98,40)),feature('far',point(-7,40)),feature('road',{type:'LineString',coordinates:[[-8.02,40],[-7.98,40]]},'ROAD')],radiusM:5000,...options});
test('PostGIS inside/outside, nearest ranking, radius and line intersection',{skip:!enabled},async()=>{const r=await query();assert.equal(r.relationships.find(x=>x.feature.id==='inside').intersects,true);assert.equal(r.relationships.find(x=>x.feature.id==='outside').intersects,false);assert.equal(r.relationships.find(x=>x.feature.id==='road').intersects,true);assert.equal(r.relationships.find(x=>x.feature.id==='inside').rank,1);assert.ok(!r.relationships.some(x=>x.feature.id==='far'));});
test('PostGIS perimeter growth, newly intersected point and closer distance',{skip:!enabled},async()=>{const r=await query();assert.ok(r.areaHa>r.previousAreaHa);assert.ok(Math.abs(r.newAreaHa-(r.areaHa-r.previousAreaHa))<.001);assert.equal(r.relationships.find(x=>x.feature.id==='new').newlyIntersected,true);assert.ok(r.relationships.find(x=>x.feature.id==='outside').distanceChangeM<0);});
test('PostGIS no perimeter leaves size and intersection unknown, retains point distance',{skip:!enabled},async()=>{const r=await query({current:null,previous:null});assert.equal(r.areaHa,null);assert.equal(r.relationships[0].intersects,null);assert.equal(r.relationships[0].distanceFromPerimeterM,null);assert.equal(r.relationships[0].distanceFromPointM,0);});
test('PostGIS valid multipolygon and hole remain geometric truth',{skip:!enabled},async()=>{const polygon={type:'Polygon',coordinates:[current.coordinates[0],previous.coordinates[0]]};const r=await query({current:{type:'MultiPolygon',coordinates:[polygon.coordinates]},previous:null});assert.equal(r.perimeterValid,true);assert.equal(r.relationships.find(x=>x.feature.id==='inside').intersects,false);});
test('PostGIS invalid self-intersection fails closed without repairing source geometry',{skip:!enabled},async()=>{const r=await query({current:{type:'Polygon',coordinates:[[[-8.01,39.99],[-7.99,40.01],[-7.99,39.99],[-8.01,40.01],[-8.01,39.99]]]},previous:null});assert.equal(r.perimeterValid,false);assert.equal(r.areaHa,null);});

function memoryRepository(){let object=null;return{getObject:async()=>object,putObject:async(kind,id,payload,{expectedRevision})=>{assert.equal(expectedRevision,object?.revision??0);object={payload,revision:(object?.revision??0)+1};}};}
const record=(geometry,observedAt)=>({source:'TEST_ONLY_AUTHORITY',authority:'OFFICIAL_PERIMETER',provenanceRef:'test:fixture',geometry,observedAt,receivedAt:observedAt,synthetic:false});
test('perimeter history survives a new service consumer and deduplicates replay',async()=>{const repository=memoryRepository(),a=record(previous,'2026-09-12T10:00:00Z'),b=record(current,'2026-09-12T11:00:00Z');await retainPerimeterObservation(repository,'test',a);await retainPerimeterObservation(repository,'test',a);const r=await retainPerimeterObservation(repository,'test',b);assert.deepEqual(r.previous,a);assert.equal((await repository.getObject()).payload.records.length,2);});
test('conflicting same-time perimeter revisions retain both and withhold a single geometry',async()=>{const repo=memoryRepository();await retainPerimeterObservation(repo,'test',record(previous,'2026-09-12T10:00:00Z'));const r=await retainPerimeterObservation(repo,'test',record(current,'2026-09-12T10:00:00Z'));assert.equal(r.conflicting,true);assert.equal((await repo.getObject()).payload.records.length,2);});
test('derived thermal envelope does not enter perimeter query even if polygon shaped',async()=>{let values;const pool={query:async input=>{values=input.values;return{rows:[{result:{relationships:[],areaHa:null,previousAreaHa:null,newAreaHa:null,perimeterKm:null}}]};}},inventory={state:'CACHED',sources:[],candidates:()=>({features:[],total:0,truncated:false})};const s=new IncidentContextService({pool,inventory,clock:()=>new Date('2026-09-12T12:00:00Z')});await s.project({physical:{incidentId:'test',location:[-8,40]},item:{spatialTruth:{officialPerimeter:{...record(current,'2026-09-12T10:00:00Z'),authority:'ADMITTED_OFFICIAL_OR_OBSERVED_GEOMETRY'}}}});assert.equal(values[1],null);});
