import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresIncidentCommandRepository } from '../src/modules/incident-command/postgres-incident-command-repository.mjs';

const NOW='2026-08-23T12:00:00.000Z';
const poolWith=(client)=>({on(){},query:async(sql)=>{if(sql.includes('to_regclass'))return{rows:[{event_table:'incident_command_event',snapshot_table:'incident_command_snapshot',capacity_table:'vigia_capacity_counter'}]};throw new Error(`unexpected_direct_query:${sql}`);},connect:async()=>client});
const event=()=>({schemaVersion:'vigia.incident-command-event.v1',eventId:'event:capacity',incidentId:'incident:1',type:'COMMAND_ORGANIZATION_SET',payload:{name:'Incident One'},source:'OPERATOR',author:'operator:1',observedAt:NOW,receivedAt:NOW,releaseId:'release:test',exercise:true});

test('incident-command repository publishes bounded pool capacity for runtime diagnosis',async()=>{
  const pool=poolWith({release(){},query:async()=>({rows:[],rowCount:0})}),repository=new PostgresIncidentCommandRepository({pool,poolMax:99});
  await repository.initialize();
  assert.deepEqual(repository.status().pool,{max:24,total:0,idle:0,waiting:0});
  assert.equal(repository.status().state,'ready');
});

test('incident-command repository reinitializes after a transient availability failure',async()=>{
  let initializationCount=0,stateCount=0;
  const pool={on(){},totalCount:1,idleCount:1,waitingCount:0,async query(sql){
    if(sql.includes('to_regclass')){initializationCount+=1;return{rows:[{event_table:'incident_command_event',snapshot_table:'incident_command_snapshot',capacity_table:'vigia_capacity_counter'}]};}
    if(sql.startsWith('SELECT state')){stateCount+=1;if(stateCount===1)throw Object.assign(new Error('connection reset by peer'),{code:'ECONNRESET'});return{rows:[{state:{incident:{id:'incident:1'}}}]};}
    throw new Error(`unexpected_direct_query:${sql}`);
  }},repository=new PostgresIncidentCommandRepository({pool});
  await repository.initialize();
  await assert.rejects(()=>repository.state('incident:1'),error=>error.code==='incident_command_postgis_unavailable'&&error.details.lastErrorCode==='ECONNRESET');
  assert.equal(repository.status().state,'degraded');
  assert.deepEqual(await repository.state('incident:1'),{incident:{id:'incident:1'}});
  assert.equal(initializationCount,2);
  assert.equal(repository.status().state,'ready');
});

test('incident-command transaction retries one transient pool acquisition without a false degraded latch',async()=>{
  const input={mutationId:'mutation:retry',incidentId:'incident:1',originNode:'node:1',localSequence:1,payloadHash:`sha256:${'2'.repeat(64)}`,centralEventId:null,state:'CONFLICTED'};
  let connectCount=0;
  const existing={incident_id:input.incidentId,origin_node:input.originNode,local_sequence:input.localSequence,payload_hash:input.payloadHash,central_event_id:null};
  const client={release(){},async query(sql){if(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock'))return{rows:[],rowCount:0};if(sql.startsWith('SELECT incident_id,origin_node'))return{rows:[existing],rowCount:1};throw new Error(`unexpected_query:${sql}`);}};
  const pool=poolWith(client);pool.connect=async()=>{connectCount+=1;if(connectCount===1)throw new Error('timeout exceeded when trying to connect');return client;};
  const repository=new PostgresIncidentCommandRepository({pool});await repository.initialize();
  const result=await repository.recordOfflineReceipt(input);
  assert.equal(result.duplicate,true);assert.equal(connectCount,2);assert.equal(repository.status().state,'ready');assert.equal(repository.status().lastFailureAt,null);
});

test('incident-command event admission enforces aggregate quotas before projection mutation',async()=>{
  let projected=false,inserted=false;const client={release(){},async query(sql){if(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock')||sql.startsWith('INSERT INTO vigia_capacity_counter'))return{rows:[],rowCount:0};if(sql.startsWith('SELECT incident_id,sequence'))return{rows:[],rowCount:0};if(sql.startsWith('SELECT rows,bytes FROM vigia_capacity_counter'))return{rows:[{rows:'1',bytes:'1024'}],rowCount:1};if(sql.startsWith('SELECT version')){projected=true;return{rows:[],rowCount:0};}if(sql.startsWith('INSERT INTO incident_command_event')){inserted=true;return{rows:[],rowCount:1};}throw new Error(`unexpected_query:${sql}`);}},repository=new PostgresIncidentCommandRepository({pool:poolWith(client),maxEventsPerIncident:1});await repository.initialize();await assert.rejects(()=>repository.append(event()),error=>error.statusCode===507&&error.details.scope==='incident');assert.equal(projected,false);assert.equal(inserted,false);
});

test('offline receipt admission is idempotent and aggregate-capacity bounded',async()=>{
  const input={mutationId:'mutation:1',incidentId:'incident:1',originNode:'node:1',localSequence:1,payloadHash:`sha256:${'1'.repeat(64)}`,centralEventId:null,state:'CONFLICTED'};let insert=false,existing=null;const client={release(){},async query(sql){if(sql==='BEGIN'||sql.startsWith('SET LOCAL')||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock')||sql.startsWith('INSERT INTO vigia_capacity_counter'))return{rows:[],rowCount:0};if(sql.startsWith('SELECT incident_id,origin_node'))return{rows:existing?[existing]:[],rowCount:existing?1:0};if(sql.startsWith('SELECT rows,bytes FROM vigia_capacity_counter'))return{rows:[{rows:'1',bytes:'1024'}],rowCount:1};if(sql.startsWith('INSERT INTO incident_command_offline_receipt')){insert=true;return{rows:[],rowCount:1};}throw new Error(`unexpected_query:${sql}`);}},repository=new PostgresIncidentCommandRepository({pool:poolWith(client),maxOfflineReceiptsPerIncident:1});await repository.initialize();await assert.rejects(()=>repository.recordOfflineReceipt(input),error=>error.statusCode===507&&error.details.scope==='incident');assert.equal(insert,false);existing={incident_id:input.incidentId,origin_node:input.originNode,local_sequence:input.localSequence,payload_hash:input.payloadHash,central_event_id:null};const duplicate=await repository.recordOfflineReceipt(input);assert.equal(duplicate.duplicate,true);assert.equal(insert,false);
});
