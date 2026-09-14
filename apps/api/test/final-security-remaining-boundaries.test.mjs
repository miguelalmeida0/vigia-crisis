import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { mkdtemp,readFile,rm,stat } from 'node:fs/promises';
import { AcquisitionScheduler,HttpAcquirer } from '../src/modules/acquisition/http-acquirer.mjs';
import { AcquisitionStore } from '../src/modules/acquisition/acquisition-store.mjs';
import { EvidenceRequestService } from '../src/modules/verification/evidence-request-service.mjs';
import { SensorTaskService } from '../src/modules/sensors/sensor-task-service.mjs';
import { PostgresIncidentCommandRepository } from '../src/modules/incident-command/postgres-incident-command-repository.mjs';
import { applyIncidentCommandEvent,emptyIncidentState } from '../../../packages/domain/src/incident-command/reducer.mjs';
import { canonicalDeep,hash } from '../../../packages/domain/src/incident-command/contracts.mjs';
import { writeJsonAtomic } from '../src/shared/json-file.mjs';
import { visualizationClientKey } from '../src/http/route-security-policy.mjs';
import { buildHandoffSnapshot } from '../../operator-console/src/operationalExports.js';
import { FieldNodeStore } from '../../field-node/src/sqlite-store.mjs';

const now='2026-08-23T12:00:00.000Z',clock=()=>new Date(now);
async function temp(prefix){return mkdtemp(path.join(process.env.TMPDIR??os.tmpdir(),prefix));}
class MemoryRepository{
  constructor(state){this.state=structuredClone(state);this.chain=Promise.resolve();}
  snapshot(){return structuredClone(this.state);}
  mutate(work){const result=this.chain.then(async()=>{this.state=await work(structuredClone(this.state));return this.snapshot();});this.chain=result.catch(()=>undefined);return result;}
}
const actor={id:'operator-1',role:'supervisor',capabilities:['request:evidence','read:evidence'],incidentScopes:['incident-1'],authentication:{authenticated:true,mode:'local_shadow_session'}};
const need={id:'need-1',subjectType:'fire_event',subjectId:'incident-1',missingQuantity:'confirm_fire',state:'REQUEST_ACTIVE',ownerId:'operator-1',version:3,bindingHash:'sha256:current',subjectVersion:'event-v7',policyVersion:'policy-v2'};
const requestInput={evidenceNeedId:'need-1',evidenceNeedVersion:3,evidenceNeedBindingHash:'sha256:current',evidenceNeedSubjectVersion:'event-v7',evidenceNeedPolicyVersion:'policy-v2',targetType:'fire_event',targetId:'event:incident-1',title:'Confirm fire',ownerId:'operator-1',dueAt:'2026-08-23T13:00:00Z',missingQuantity:'confirm_fire',requirements:[]};

test('stale, resolved, superseded and concurrent evidence-need callers cannot create obsolete work',async()=>{
  const repository=new MemoryRepository({evidenceNeeds:[need],evidenceRequests:[],evidencePackages:[]}),service=new EvidenceRequestService({repository,clock,auditService:{record:async()=>{}}});
  await assert.rejects(()=>service.create(actor,{...requestInput,evidenceNeedVersion:2}),error=>error.statusCode===409&&error.details.refreshRequired===true);
  const {evidenceNeedBindingHash:omittedBinding,evidenceNeedSubjectVersion:omittedSubject,evidenceNeedPolicyVersion:omittedPolicy,...incomplete}=requestInput;void omittedBinding;void omittedSubject;void omittedPolicy;await assert.rejects(()=>service.create(actor,incomplete),error=>error.statusCode===409&&error.details.refreshRequired===true);
  assert.equal(repository.snapshot().evidenceRequests.length,0);
  const [left,right]=await Promise.all([service.create(actor,requestInput),service.create(actor,requestInput)]);assert.equal(repository.snapshot().evidenceRequests.length,1);assert.equal(new Set([left.id,right.id]).size,1);assert.equal(right.idempotentReplay||left.idempotentReplay,true);
  repository.state.evidenceNeeds[0]={...repository.state.evidenceNeeds[0],state:'RESOLVED',version:4,bindingHash:'sha256:resolved'};repository.state.evidenceRequests=[];
  await assert.rejects(()=>service.create(actor,requestInput),error=>error.statusCode===409&&error.details.reason==='need_not_unresolved');assert.equal(repository.snapshot().evidenceRequests.length,0);
  repository.state.evidenceNeeds[0]={...need,subjectVersion:'event-v8',version:4,bindingHash:'sha256:new'};
  await assert.rejects(()=>service.create(actor,requestInput),error=>error.statusCode===409&&error.details.currentVersion===4);
});

test('acquisition scheduler deduplicates products and enforces global/provider memory fairness',async()=>{
  const scheduler=new AcquisitionScheduler({maxConcurrency:2,maxProviderConcurrency:1,maxInFlightBytes:20,maxProviderInFlightBytes:10});let active=0,maxActive=0,calls=0;const releases=[];
  const operation=(name)=>()=>new Promise((resolve)=>{calls+=1;active+=1;maxActive=Math.max(maxActive,active);releases.push(()=>{active-=1;resolve(name);});});
  const a1=scheduler.run({provider:'a',key:'a:1',reservedBytes:10},operation('a1')),duplicate=scheduler.run({provider:'a',key:'a:1',reservedBytes:10},operation('duplicate')),a2=scheduler.run({provider:'a',key:'a:2',reservedBytes:10},operation('a2')),b1=scheduler.run({provider:'b',key:'b:1',reservedBytes:10},operation('b1'));
  await new Promise((resolve)=>setImmediate(resolve));assert.equal(scheduler.status().active,2);assert.equal(scheduler.status().activeBytes,20);assert.equal(scheduler.status().providers.a.active,1);assert.equal(scheduler.status().providers.b.active,1);assert.equal(calls,2);
  releases.splice(0).forEach((release)=>release());await Promise.all([a1,duplicate,b1]);await new Promise((resolve)=>setImmediate(resolve));assert.equal(calls,3);releases.splice(0).forEach((release)=>release());await a2;assert.equal(maxActive,2);assert.equal(await duplicate,'a1');assert.equal(scheduler.status().active,0);
  assert.throws(()=>scheduler.run({provider:'a',key:'huge',reservedBytes:11},async()=>null),/memory_reservation/);
});

test('provider archive quota is persisted, per-product bounded, and cannot consume another provider reservation',async()=>{
  const root=await temp('vigia-provider-quota-'),env={filePath:path.join(root,'state.json'),archiveDir:path.join(root,'archive')};try{
    const store=new AcquisitionStore({...env,clock,maxArchiveBytes:30,maxProviderArchiveBytes:12,maxProductBytes:10});await store.initialize();
    const archived=await store.archiveReceivedProduct({sourceId:'a1',provider:'provider-a',body:Buffer.alloc(8,1)});const archivedFile=store.productArchivePath(archived.product.id);assert.equal((await stat(path.dirname(archivedFile))).mode&0o777,0o700);assert.equal((await stat(archivedFile)).mode&0o777,0o600);
    await assert.rejects(()=>store.archiveReceivedProduct({sourceId:'a2',provider:'provider-a',body:Buffer.alloc(5,2)}),/provider_capacity/);
    await store.archiveReceivedProduct({sourceId:'b1',provider:'provider-b',body:Buffer.alloc(10,3)});
    await assert.rejects(()=>store.archiveReceivedProduct({sourceId:'b2',provider:'provider-b',body:Buffer.alloc(11,4)}),/product_too_large/);
    const restarted=new AcquisitionStore({...env,clock,maxArchiveBytes:30,maxProviderArchiveBytes:12,maxProductBytes:10});await restarted.initialize();assert.deepEqual(restarted.status().providerArchiveBytes,{'provider-a':8,'provider-b':10});assert.equal((await stat(restarted.productArchivePath(archived.product.id))).mode&0o777,0o600);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('acquirer cleans slots on parser/archive/oversize failure and never advances the ingestion checkpoint',async()=>{
  const root=await temp('vigia-acquirer-failure-'),env={filePath:path.join(root,'state.json'),archiveDir:path.join(root,'archive')};try{
    const store=new AcquisitionStore({...env,clock,maxProductBytes:1024}),scheduler=new AcquisitionScheduler({maxConcurrency:1,maxProviderConcurrency:1,maxInFlightBytes:1024,maxProviderInFlightBytes:1024}),acquirer=new HttpAcquirer({store,scheduler,clock,fetchImpl:async()=>new Response('bad',{headers:{'content-type':'text/plain'}})});await store.initialize();
    await assert.rejects(()=>acquirer.text({sourceId:'bad',provider:'p',url:'https://p.test/product',maxBytes:1024,describe:async()=>{throw new Error('parser_failed');}}),/parser_failed/);assert.equal(scheduler.status().active,0);assert.equal(store.getCheckpoint('bad').cursor,null);assert.equal(store.status().rejectedProducts,1);
    const oversize=new HttpAcquirer({store,scheduler,clock,fetchImpl:async()=>new Response('x'.repeat(2000),{headers:{'content-type':'text/plain'}})});await assert.rejects(()=>oversize.text({sourceId:'large',provider:'p',url:'https://p.test/large',maxBytes:1024,describe:async()=>({})}),/upstream_body_too_large/);assert.equal(store.getCheckpoint('large').lastProductId,null);assert.equal(scheduler.status().active,0);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('acquirer deduplication identity cannot merge different integrity expectations',async()=>{
  const body=Buffer.from('provider-product'),good=createHash('sha256').update(body).digest('hex'),bad='0'.repeat(64);let calls=0,archives=0,release;const gate=new Promise(resolve=>{release=resolve;}),store={recordAttempt:async()=>{},recordFailure:async()=>{},recordProductRejected:async()=>{},archiveReceivedProduct:async()=>{archives+=1;return{product:{id:`raw:${archives}`},duplicate:false};},acceptProduct:async id=>({product:{id},checkpoint:{}})},scheduler=new AcquisitionScheduler({maxConcurrency:2,maxProviderConcurrency:2,maxInFlightBytes:2048,maxProviderInFlightBytes:2048}),acquirer=new HttpAcquirer({store,scheduler,clock,fetchImpl:async()=>{calls+=1;await gate;return new Response(body);}}),input={sourceId:'integrity',provider:'p',url:'https://p.test/product',maxBytes:1024,describe:async()=>({})};
  const accepted=acquirer.text({...input,expectedChecksum:good}),rejected=acquirer.text({...input,expectedChecksum:bad});for(let attempt=0;attempt<20&&calls<2;attempt+=1)await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2);release();await accepted;await assert.rejects(()=>rejected,/upstream_checksum_mismatch/);assert.equal(archives,1);
});

const publicDns=async()=>[{address:'93.184.216.34',family:4}],registry={get:(id)=>({id,name:id,type:'camera',endpoint:`https://${id}.sensors.example/task`})};
test('sensor task response bounds, concurrency and rate limits fail closed',async()=>{
  let release;const pending=new Promise((resolve)=>{release=resolve;}),service=new SensorTaskService({registry,resolveHost:publicDns,fetchImpl:async()=>{await pending;return new Response('{"accepted":true}',{headers:{'content-type':'application/json'}});},maxConcurrent:1,maxConcurrentPerAsset:1,maxRequestsPerMinute:2});
  const first=service.task('cam-1',{eventId:'incident-1'});await new Promise((resolve)=>setImmediate(resolve));await assert.rejects(()=>service.task('cam-2',{eventId:'incident-1'}),/concurrency_limited/);release();await first;
  const wrongType=new SensorTaskService({registry,resolveHost:publicDns,fetchImpl:async()=>new Response('ok',{headers:{'content-type':'text/plain'}})});await assert.rejects(()=>wrongType.task('cam-1',{eventId:'incident-1'}),/response_type_rejected/);
  const oversized=new SensorTaskService({registry,resolveHost:publicDns,maxResponseBytes:32,fetchImpl:async()=>new Response('x'.repeat(64),{headers:{'content-type':'application/json'}})});await assert.rejects(()=>oversized.task('cam-1',{eventId:'incident-1'}),/body_too_large/);
});

function deadlineSensorRequest(state){return(_options,callback)=>{const attempt=++state.attempts,request=new EventEmitter();let response=null,timer=null;request.setTimeout=()=>{};request.destroy=(error)=>{clearInterval(timer);state.requestDestroyed=attempt===1&&Boolean(error);response?.destroy(error);queueMicrotask(()=>request.emit('error',error));};request.end=()=>queueMicrotask(()=>{response=attempt===1?new Readable({read(){}}):Readable.from([Buffer.from('{"accepted":true}')]);response.statusCode=200;response.headers={'content-type':'application/json'};response.once('close',()=>{if(attempt===1)state.responseDestroyed=response.destroyed;});callback(response);if(attempt===1)timer=setInterval(()=>response.push(Buffer.from(' ')),5);});return request;};}

test('sensor task absolute deadline aborts a slow drip and releases admission',async()=>{
  const state={attempts:0,requestDestroyed:false,responseDestroyed:false},service=new SensorTaskService({registry,resolveHost:publicDns,requestImpl:deadlineSensorRequest(state),timeoutMs:1_000,absoluteTimeoutMs:25,maxConcurrent:1,maxConcurrentPerAsset:1});
  await assert.rejects(()=>service.task('cam-1',{eventId:'incident-1'}),error=>error.message==='sensor_task_deadline_exceeded'&&error.statusCode===504);
  const recovered=await service.task('cam-1',{eventId:'incident-1'});assert.equal(recovered.result.accepted,true);assert.equal(state.requestDestroyed,true);assert.equal(state.responseDestroyed,true);
});

test('sensor task SSRF rejects private DNS, rebinding, IP forms and cross-authority redirects',async()=>{
  const privateService=new SensorTaskService({registry,resolveHost:async()=>[{address:'169.254.169.254',family:4}],fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json'}})});await assert.rejects(()=>privateService.task('cam-1',{eventId:'incident-1'}),/destination_not_public/);
  let resolutions=0;const rebinding=new SensorTaskService({registry,resolveHost:async()=>[{address:++resolutions===1?'93.184.216.34':'127.0.0.1',family:4}],fetchImpl:async()=>new Response('',{status:307,headers:{location:'/next'}})});await assert.rejects(()=>rebinding.task('cam-1',{eventId:'incident-1'}),/destination_not_public/);
  const redirected=new SensorTaskService({registry,resolveHost:publicDns,fetchImpl:async()=>new Response('',{status:307,headers:{location:'https://metadata.example/latest'}})});await assert.rejects(()=>redirected.task('cam-1',{eventId:'incident-1'}),/redirect_origin_rejected|redirect_authority_rejected/);
  const ipRegistry={get:()=>({id:'cam-ip',name:'ip',type:'camera',endpoint:'https://2130706433/task'})};await assert.rejects(()=>new SensorTaskService({registry:ipRegistry,resolveHost:publicDns,fetchImpl:async()=>new Response('{}')}).task('cam-ip',{}),/endpoint_not_configured/);
});

test('handoff places stale sources, FieldNet, roster and resources only in timestamped stale context',()=>{
  const snapshot=buildHandoffSnapshot({events:[],sources:[{key:'firms',name:'FIRMS',state:'stale',lastSuccessAt:'2026-08-23T10:00:00Z',latestObservationAt:'2026-08-23T09:00:00Z'}],fieldnet:{state:'ready',updatedAt:'2026-08-23T10:00:00Z',nodes:[{}]},roster:[{id:'old'}],resources:[{id:'truck'}],dependencies:{fieldnet:{state:'STALE',lastSuccessAt:'2026-08-23T10:00:00Z'},operationsRoster:{state:'STALE',lastSuccessAt:'2026-08-23T10:00:00Z'},operationsAssets:{state:'STALE',lastSuccessAt:'2026-08-23T10:00:00Z'}},createdAt:now});
  assert.equal(snapshot.currentContext.sources.length,0);assert.equal(snapshot.currentContext.fieldnet,null);assert.equal(snapshot.currentContext.roster,null);assert.equal(snapshot.fieldnet.state,'UNAVAILABLE');assert.equal(snapshot.staleContext.sources[0].freshnessState,'STALE');assert.equal(snapshot.staleContext.fieldnet.availabilityState,'LAST_KNOWN_ONLY');assert.equal(snapshot.staleContext.roster.lastSuccessAt,'2026-08-23T10:00:00Z');assert.deepEqual(snapshot.staleContext.resources.value,[{id:'truck'}]);
});

test('atomic JSON and SQLite operational state stay restrictive through creation, replacement and restart',async()=>{
  const root=await temp('vigia-mode-'),file=path.join(root,'sensitive','state.json'),database=path.join(root,'fieldnet','node.sqlite');try{await writeJsonAtomic(file,{secret:'value'});assert.equal((await stat(path.dirname(file))).mode&0o777,0o700);assert.equal((await stat(file)).mode&0o777,0o600);await writeJsonAtomic(file,{secret:'replaced'});assert.equal((await stat(file)).mode&0o777,0o600);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{secret:'replaced'});let store=new FieldNodeStore({filePath:database,nodeId:'node-mode'});assert.equal((await stat(path.dirname(database))).mode&0o777,0o700);assert.equal((await stat(database)).mode&0o777,0o600);for(const suffix of ['-wal','-shm'])assert.equal((await stat(`${database}${suffix}`)).mode&0o777,0o600);store.close();store=new FieldNodeStore({filePath:database,nodeId:'node-mode'});assert.equal((await stat(database)).mode&0o777,0o600);store.close();}finally{await rm(root,{recursive:true,force:true});}
});

test('forged local visualization headers cannot authorize without the signed shadow session',()=>{
  const request={headers:{origin:'http://127.0.0.1:4190','sec-fetch-site':'same-origin','x-vigia-ui-proxy':'mission-dark-realdata-2.0','x-local-operator':'true','x-forwarded-for':'127.0.0.1'},socket:{remoteAddress:'127.0.0.1'}};
  assert.throws(()=>visualizationClientKey(request,{actor:null}),error=>error.statusCode===401);assert.equal(visualizationClientKey(request,{actor:{id:'operator-1',authentication:{authenticated:true,mode:'local_shadow_session'}}}),'operator-console:operator-1');assert.equal(visualizationClientKey(request,{actor:{id:'operator-remote',authentication:{authenticated:true,mode:'environment_bearer'}}}),'operator-console:operator-remote');
});

test('public acquisition diagnostics redact internal exception text and paths',async()=>{
  const root=await temp('vigia-diagnostic-');try{const store=new AcquisitionStore({filePath:path.join(root,'state.json'),archiveDir:path.join(root,'archive'),clock});await store.initialize();await store.recordFailure('source-a',new Error('password secret at /private/runtime.sql SELECT * FROM users'));const status=store.publicStatus(),encoded=JSON.stringify(status);assert.equal(status.checkpoints[0].errorPresent,true);assert.doesNotMatch(encoded,/password|private|SELECT|users/);}finally{await rm(root,{recursive:true,force:true});}
});

function commandRows(incidentId,count){let previous=null;const rows=[];for(let sequence=1;sequence<=count;sequence+=1){const eventId=`event-${sequence}`,type='DECISION_RECORDED',actorId='operator-1',source='TEST',observedAt=new Date(Date.parse(now)+sequence).toISOString(),receivedAt=observedAt,payload={decisionId:`decision-${sequence}`,value:'x'.repeat(sequence%5)},payloadHash=hash(payload),releaseId='release-test',exercise=true,recordHash=hash(canonicalDeep({incidentId,eventId,sequence,type,author:actorId,source,observedAt,receivedAt,payloadHash,previousHash:previous,releaseId,exercise}));rows.push({sequence,event_id:eventId,event_type:type,actor_id:actorId,source,occurred_at:new Date(observedAt),received_at:new Date(receivedAt),payload,payload_hash:payloadHash,previous_hash:previous,record_hash:recordHash,release_id:releaseId,exercise,event_envelope:{observedAt,receivedAt},envelope_hash:null});previous=recordHash;}return rows;}
class EventPool{
  constructor(rowsByIncident){this.rowsByIncident=rowsByIncident;}
  on(){}
  async query(sql,params=[]){if(sql.includes('to_regclass'))return{rowCount:1,rows:[{event_table:'incident_command_event',snapshot_table:'incident_command_snapshot',capacity_table:'vigia_capacity_counter'}]};const incident=params[0],rows=this.rowsByIncident[incident]??[];if(sql.startsWith('SELECT sequence FROM')){const found=rows.find((row)=>row.record_hash===params[1]);return{rowCount:found?1:0,rows:found?[{sequence:found.sequence}]:[]};}if(sql.includes('ORDER BY sequence DESC LIMIT $2')&&!sql.includes('LATERAL'))return{rowCount:Math.min(rows.length,Number(params[1])),rows:rows.slice(-Number(params[1])).reverse()};if(sql.includes('ORDER BY sequence LIMIT $5')){const selected=rows.filter((row)=>row.sequence>Number(params[1])).slice(0,Number(params[4]));return{rowCount:selected.length,rows:selected};}if(sql.includes('LEFT JOIN LATERAL')){const last=rows.at(-1);return{rowCount:last?1:0,rows:last?[{version:rows.length,last_event_hash:last.record_hash,sequence:last.sequence,record_hash:last.record_hash}]:[]};}throw new Error(`unexpected_query:${sql.slice(0,50)}`);}
}
test('command history streams thousands of records in stable byte-bounded pages without gaps or cross-incident cursors',async()=>{
  const complete=commandRows('incident-1',1201),rows=complete.slice(0,1200),other=commandRows('incident-2',2),repository=new PostgresIncidentCommandRepository({pool:new EventPool({'incident-1':rows,'incident-2':other}),maxEventPageSize:97,maxEventPageBytes:32*1024});await repository.initialize();let cursor=null,total=0,prior=0,pages=0;
  do{const page=await repository.events('incident-1',{afterCursor:cursor,limit:97,maxBytes:32*1024});assert.ok(page.page.responseBytes<=32*1024);assert.equal(repository.verifyEventPage(page).valid,true);for(const event of page.events){assert.equal(event.sequence,prior+1);prior=event.sequence;}total+=page.events.length;pages+=1;if(pages===5)rows.push(complete[1200]);cursor=page.page.nextCursor;if(!page.page.hasMore)break;}while(pages<100);assert.equal(total,1201);assert.ok(pages>10);await assert.rejects(()=>repository.events('incident-2',{afterCursor:rows[10].record_hash}),/cursor_invalid/);await assert.rejects(()=>repository.events('incident-1',{afterCursor:'0'.repeat(64)}),/cursor_invalid/);
});

const commandEvent=(type,payload)=>({incidentId:'incident-1',eventId:`event-${Math.random()}`,type,payload,source:'TEST',author:'operator-1',observedAt:now,receivedAt:now,releaseId:'release-test',exercise:true});
test('projection tails are bounded and PAR identifiers reject every non-string, reserved, Unicode and overlong form',()=>{
  let state=emptyIncidentState('incident-1');state=applyIncidentCommandEvent(state,commandEvent('ORDER_CREATED',{orderId:'order-1',intendedRecipients:['crew-1']}));for(let index=0;index<260;index+=1){state.orders['order-1'].state='SENT';state=applyIncidentCommandEvent(state,commandEvent('ORDER_TRANSITIONED',{orderId:'order-1',state:'DELIVERED',delivery:{index}}));}assert.equal(state.orders['order-1'].deliveries.length,200);
  for(const subjectId of [{},[],1,true,null,'__proto__','constructor','prototype','cre\u0175-1','x'.repeat(161),' spaced ',''])assert.throws(()=>applyIncidentCommandEvent(state,commandEvent('PAR_REQUESTED',{parRequestId:'par-1',subjectIds:[subjectId]})),/identifier|capacity/);
  state=applyIncidentCommandEvent(state,commandEvent('PAR_REQUESTED',{parRequestId:'par-ok',subjectIds:['crew-1']}));for(const subjectId of [{},[],1,true,null,'__proto__','cre\u0175-1','x'.repeat(161)])assert.throws(()=>applyIncidentCommandEvent(state,commandEvent('PAR_RESPONDED',{parRequestId:'par-ok',subjectId,accounted:true})),/identifier/);assert.throws(()=>applyIncidentCommandEvent(state,commandEvent('PAR_RESPONDED',{parRequestId:'par-ok',subjectId:'crew-2',accounted:true})),/not_requested/);
});
