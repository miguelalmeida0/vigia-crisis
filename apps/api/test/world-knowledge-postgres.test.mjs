import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {resolveLocalDatabaseUrl} from '../../../scripts/local_database_secret.mjs';
import {WorldKnowledgeStore} from '../src/modules/intelligence/world-knowledge-store.mjs';
import {WorldKnowledgeService} from '../src/modules/intelligence/world-knowledge-service.mjs';

test('PostgreSQL durable knowledge, concurrency, source change and spatial invalidation', {skip:process.env.VIGIA_KNOWLEDGE_POSTGRES_PROOF!=='1'?'Set VIGIA_KNOWLEDGE_POSTGRES_PROOF=1 for isolated local database proof':false}, async t=>{
 const connectionString=await resolveLocalDatabaseUrl(),admin=new pg.Pool({connectionString,max:2}),schema='knowledge_proof_'+randomUUID().replaceAll('-','');
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new pg.Pool({connectionString,max:4,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
 await pool.query(await readFile('apps/api/src/modules/storage/migrations/023-world-knowledge.sql','utf8'));
 const store=new WorldKnowledgeStore({pool}),model={extract(){throw Error('Inference must not occur');},health:async()=>({state:'offline'})},service=new WorldKnowledgeService({store,model});
 await service.initialize();
 const source={url:'https://www.ministeriopublico.pt/test-fixture',provider:'Isolated test authority',authority:'OWNER',format:'JSON',watch:false},raw={id:'fixture:facility',canonicalName:'Procuradoria de Teste',canonicalType:'public_prosecutor',address:{street:'Rua A 12'},coordinate:[-7.9,38.57]},bytes=record=>Buffer.from(JSON.stringify({records:[record]}));
 await t.test('A/B: admitted facts and field provenance are persisted with PostGIS geometry',async()=>{
  await service.ingest(bytes(raw),source);const rows=await store.nearby(raw.coordinate,{limit:1});assert.equal(rows.length,1);assert.equal(rows[0].distanceM,0);assert.equal(rows[0].canonicalType,'public_prosecutor');assert.equal(rows[0].provenance['address.street'][0].provider,source.provider);
 });
 await t.test('C: a new pool and service reuse persisted intelligence with AI offline',async()=>{
  const freshPool=new pg.Pool({connectionString,max:1,options:`-c search_path=${schema},public`});try{const restarted=new WorldKnowledgeService({store:new WorldKnowledgeStore({pool:freshPool}),model});await restarted.initialize();assert.equal(restarted.decorate({id:raw.id}).address,'Rua A 12');}finally{await freshPool.end();}
 });
 await t.test('concurrent workers claim each durable job once',async()=>{
  await store.enqueue('RESOLVE_ENTITY','fixture:job',{priority:500});const jobs=await Promise.all([store.claim(),store.claim()]);assert.equal(jobs.filter(j=>j?.subject==='fixture:job').length,1);assert.equal(new Set(jobs.filter(Boolean).map(j=>j.id)).size,jobs.filter(Boolean).length);for(const job of jobs.filter(Boolean))await store.finish(job);
 });
 await t.test('D: changed coordinates invalidate and recalculate persisted distances',async()=>{
  await service.relateIncident('fixture:incident',[-7.91,38.58]);const before=(await store.read()).relations[0];await service.ingest(bytes({...raw,address:{street:'Rua B 24'},coordinate:[-7.92,38.6]}),source);assert.equal((await store.read()).relations[0].state,'STALE');await service.tick();await service.tick();const after=(await store.read()).relations[0];assert.equal(after.state,'CURRENT');assert.notEqual(after.distanceM,before.distanceM);assert.notEqual(after.entityRevision,before.entityRevision);assert.equal(service.decorate({id:raw.id}).address,'Rua B 24');
 });
 await t.test('fact foreign keys agree with canonical merge payloads',async()=>{
  const osm={...raw,id:'osm:fixture',canonicalType:'police_station',coordinate:[-7.92,38.6]};await service.ingest(bytes(osm),{...source,url:'https://www.openstreetmap.org/',authority:'OSM'});await service.resolveKnownEntities();const result=await pool.query("SELECT count(*)::int count FROM world_knowledge_fact WHERE entity_id IS DISTINCT FROM payload->>'entityId'");assert.equal(result.rows[0].count,0);
 });
});
