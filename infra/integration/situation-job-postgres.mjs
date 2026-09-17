// Only run against the disposable, explicitly named local test database.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { enqueueSituationJob, dueSituationJobs, finishSituationJob, QUARANTINED_DUE_AT } from '../../apps/api/src/modules/intelligence/situation-job-queue.mjs';
const url=new URL(process.env.VIGIA_TEST_DATABASE_URL || 'postgresql://invalid.invalid/invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/vigia_queue_test'||process.env.VIGIA_DEMO_CONFIRM!=='SYNTHETIC_DEMO_ONLY')throw new Error('explicit_disposable_local_test_database_required');
const pool=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:3000,statement_timeout:3000});
const store={pool},at='2026-09-17T08:00:00.000Z';
before(async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS incident_situation_job(incident_id text PRIMARY KEY,revision text NOT NULL,payload jsonb NOT NULL,due_at timestamptz NOT NULL,attempts integer NOT NULL DEFAULT 0,last_error text)`);});
beforeEach(async()=>{await pool.query('TRUNCATE incident_situation_job');});
after(async()=>{await pool.end();});
const row=async()=> (await pool.query('SELECT *,octet_length(payload::text) bytes FROM incident_situation_job')).rows[0];
test('PostgreSQL upsert preserves both old/new fields and coalesces incident identity',async()=>{
 await enqueueSituationJob(store,'i',{incident:{id:'i',coordinate:[-8,39]},first:true},at);
 await enqueueSituationJob(store,'i',{incident:{name:'Updated'},second:true},at);
 const result=await row();
 assert.equal(result.payload.input.first,true);assert.equal(result.payload.input.second,true);
 assert.deepEqual(result.payload.input.incident,{id:'i',coordinate:[-8,39],name:'Updated'});
});
test('oversized merged update is rejected atomically',async()=>{
 await enqueueSituationJob(store,'i',{incident:{id:'i'},first:'x'.repeat(150000)},at);
 const prior=await row();
 await assert.rejects(enqueueSituationJob(store,'i',{second:'x'.repeat(150000)},at),/payload_too_large/);
 assert.equal((await row()).revision,prior.revision);
 assert.equal((await row()).payload.input.second,undefined);
});
test('highly compressible legacy payload is quarantined using logical size',async()=>{
 await pool.query('INSERT INTO incident_situation_job VALUES($1,$2,$3,$4,0,NULL)',['i','r',JSON.stringify({input:{incident:{id:'i'},large:'x'.repeat(2500000)}}),at]);
 assert.deepEqual(await dueSituationJobs(store,at),[]);
 const result=await row(); assert.ok(result.bytes<1000);
 assert.equal(result.payload.reason,'QUARANTINED'); assert.equal(result.due_at.toISOString(),QUARANTINED_DUE_AT);
});
test('terminal errors are quarantined once and a fresh revision can replace them',async()=>{
 await enqueueSituationJob(store,'i',{incident:{id:'i'},old:true},at);
 const [job]=await dueSituationJobs(store,at);
 await finishSituationJob(store,job,'situation_snapshot_payload_too_large',at);
 assert.deepEqual(await dueSituationJobs(store,at),[]);
 await enqueueSituationJob(store,'i',{incident:{id:'i'},fresh:true},at);
 const [fresh]=await dueSituationJobs(store,at);
 assert.equal(fresh.input.fresh,true);assert.equal(fresh.input.old,undefined);assert.equal(fresh.attempts,0);
});
test('stale worker revision cannot remove or quarantine newly queued work',async()=>{
 await enqueueSituationJob(store,'i',{incident:{id:'i'}},at);
 const [old]=await dueSituationJobs(store,at);
 await enqueueSituationJob(store,'i',{fresh:true},at);
 const revision=(await row()).revision;
 await finishSituationJob(store,old,null,at);
 await finishSituationJob(store,old,'situation_snapshot_payload_too_large',at);
 assert.equal((await row()).revision,revision);assert.notEqual((await row()).payload.reason,'QUARANTINED');
});
test('malformed legacy input does not reach the worker',async()=>{
 await pool.query('INSERT INTO incident_situation_job VALUES($1,$2,$3,$4,0,NULL)',['i','r',JSON.stringify({input:42}),at]);
 assert.deepEqual(await dueSituationJobs(store,at),[]);
 assert.equal((await row()).payload.reason,'QUARANTINED');
});
