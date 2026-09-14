import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { writeJsonAtomic } from '../src/shared/json-file.mjs';
import { AcquisitionStore } from '../src/modules/acquisition/acquisition-store.mjs';
import { HttpAcquirer } from '../src/modules/acquisition/http-acquirer.mjs';
import { FirmsGateway } from '../src/modules/world/firms-gateway.mjs';
import { EventObservationRepository } from '../src/modules/events/event-observation-repository.mjs';
import { buildEventObservations, trackFireEvents } from '../../../packages/domain/src/fire-event-tracker.mjs';

const clock=()=>new Date('2026-08-09T12:30:00Z');
async function environment(){const root=await mkdtemp(path.join(os.tmpdir(),'vigia-acquisition-'));return{root,filePath:path.join(root,'state.json'),archiveDir:path.join(root,'raw')};}

test('raw archive and checkpoints survive restart, deduplicate and do not regress on out-of-order products',async()=>{
  const env=await environment();
  try{
    const store=new AcquisitionStore({...env,clock});await store.initialize();await store.recordAttempt('source-a');
    const first=await store.commitProduct({sourceId:'source-a',provider:'real-provider',providerProductId:'p-2',body:Buffer.from('newer'),contentType:'text/plain',sourceTimestamp:'2026-08-09T12:00:00Z',originalUri:'https://provider.test/p-2'});
    const duplicate=await store.commitProduct({sourceId:'source-a',provider:'real-provider',providerProductId:'p-2',body:Buffer.from('newer'),contentType:'text/plain',sourceTimestamp:'2026-08-09T12:00:00Z'});
    assert.equal(duplicate.duplicate,true);assert.equal(store.status().rawProductCount,1);
    await store.markProductsIngested([first.product.id]);
    const older=await store.commitProduct({sourceId:'source-a',provider:'real-provider',providerProductId:'p-1',body:Buffer.from('older'),contentType:'text/plain',sourceTimestamp:'2026-08-09T11:00:00Z'});
    assert.equal(older.checkpoint.lastSourceObservationAt,'2026-08-09T12:00:00.000Z');await store.markProductsIngested([older.product.id]);assert.equal(store.getCheckpoint('source-a').lastProductId,first.product.id);
    const restarted=new AcquisitionStore({...env,clock});await restarted.initialize();assert.equal(restarted.status().rawProductCount,2);assert.equal(restarted.getCheckpoint('source-a').lastProductId,first.product.id);
    const archived=await readFile(path.join(env.archiveDir,first.product.originalUriOrObjectKey),'utf8');assert.equal(archived,'newer');
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('missing bytes for an already-ingested historical product remain explicit without blocking retained projections',async()=>{
  const env=await environment();
  try{
    const initial=new AcquisitionStore({...env,clock});await initial.initialize();
    const saved=await initial.commitProduct({sourceId:'source-a',provider:'real-provider',providerProductId:'p-1',body:Buffer.from('historical-bytes'),sourceTimestamp:'2026-08-09T12:00:00Z'});
    await initial.markProductsIngested([saved.product.id]);await rm(initial.productArchivePath(saved.product.id));
    const restarted=new AcquisitionStore({...env,clock}),status=await restarted.initialize(),[product]=restarted.products();
    assert.equal(status.rawByteAvailabilityState,'DEGRADED_HISTORICAL_BYTES_UNAVAILABLE');assert.equal(status.unavailableHistoricalProductCount,1);assert.equal(status.archiveBytes,0);assert.equal(product.rawArchiveState,'unavailable');assert.equal(product.rawArchiveError,'historical_raw_bytes_unavailable');assert.equal(restarted.productArchivePath(product.id),null);
    const recovered=await restarted.archiveReceivedProduct({sourceId:'source-a',provider:'real-provider',body:Buffer.from('historical-bytes')});assert.equal(recovered.duplicate,true);assert.equal(recovered.recoveredHistoricalBytes,true);assert.equal(restarted.status().rawByteAvailabilityState,'READY');assert.equal(await readFile(restarted.productArchivePath(product.id),'utf8'),'historical-bytes');
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('missing bytes for an unprocessed product still fail closed',async()=>{
  const env=await environment();
  try{
    const initial=new AcquisitionStore({...env,clock});await initial.initialize();const saved=await initial.archiveReceivedProduct({sourceId:'source-a',provider:'real-provider',body:Buffer.from('pending-bytes')});await rm(initial.productArchivePath(saved.product.id));
    await assert.rejects(()=>new AcquisitionStore({...env,clock}).initialize(),/raw_archive_metadata_file_missing/);
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('checkpoint never advances when acquisition-state persistence fails',async()=>{
  const env=await environment();let fail=false;
  const writer=async(file,value)=>{if(fail)throw new Error('checkpoint_store_unavailable');return writeJsonAtomic(file,value);};
  try{
    const store=new AcquisitionStore({...env,clock,writer});await store.initialize();await store.recordAttempt('source-a');const archived=await store.commitProduct({sourceId:'source-a',provider:'real-provider',providerProductId:'p-1',body:Buffer.from('payload'),sourceTimestamp:'2026-08-09T12:00:00Z'});
    assert.equal(store.getCheckpoint('source-a').lastProductId,null);assert.equal(store.getCheckpoint('source-a').cursor,null);fail=true;
    await assert.rejects(()=>store.markProductsIngested([archived.product.id]),/checkpoint_store_unavailable/);assert.equal(store.getCheckpoint('source-a').lastProductId,null);assert.equal(store.getCheckpoint('source-a').cursor,null);
    fail=false;await store.markProductsIngested([archived.product.id]);assert.equal(store.getCheckpoint('source-a').lastProductId,archived.product.id);assert.equal(store.status().rawProductCount,1);
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('failed metadata publication removes the final archive file and restart reconciles crash orphans',async()=>{
  const env=await environment(),body=Buffer.from('uncommitted'),checksum=createHash('sha256').update(body).digest('hex'),orphan=path.join(env.archiveDir,'received','provider','source-a',`${checksum}.raw`);
  try{
    const failing=new AcquisitionStore({...env,clock,writer:async()=>{throw new Error('checkpoint_store_unavailable');}});await failing.initialize();await assert.rejects(()=>failing.archiveReceivedProduct({sourceId:'source-a',provider:'provider',body}),/checkpoint_store_unavailable/);await assert.rejects(()=>readFile(orphan),(error)=>error.code==='ENOENT');
    await mkdir(path.dirname(orphan),{recursive:true});await writeFile(orphan,body);const restarted=new AcquisitionStore({...env,clock});const status=await restarted.initialize();assert.equal(status.reconciledOrphans,1);assert.equal(status.archiveBytes,0);await assert.rejects(()=>readFile(orphan),(error)=>error.code==='ENOENT');
    const committed=await restarted.archiveReceivedProduct({sourceId:'source-a',provider:'provider',body});const committedPath=restarted.productArchivePath(committed.product.id);assert.equal(await readFile(committedPath,'utf8'),'uncommitted');await symlink(committedPath,path.join(path.dirname(committedPath),'untracked-link.raw'));await assert.rejects(()=>new AcquisitionStore({...env,clock}).initialize(),/raw_archive_symlink_forbidden/);
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('malformed provider data is retained in quarantine metadata before parser failure',async()=>{
  const env=await environment();
  try{
    const store=new AcquisitionStore({...env,clock});await store.initialize();
    const acquirer=new HttpAcquirer({store,fetchImpl:async()=>new Response('{bad',{status:200,headers:{'content-type':'application/json'}})});
    await assert.rejects(()=>acquirer.json({sourceId:'broken-json',provider:'real-provider',url:'https://provider.test/data',describe:async()=>({})}),/upstream_invalid_json/);
    assert.equal(store.status().rawProductCount,1);assert.equal(store.status().rejectedProducts,1);assert.equal(store.getCheckpoint('broken-json').healthState,'unavailable');assert.equal(store.getCheckpoint('broken-json').consecutiveFailures,1);
    const [product]=store.products();assert.equal(product.processingState,'rejected');assert.equal(product.parserError,'upstream_invalid_json');assert.equal(await readFile(path.join(env.archiveDir,product.originalUriOrObjectKey),'utf8'),'{bad');
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('non-success HTTP bodies are never archived',async()=>{
  const env=await environment();try{const store=new AcquisitionStore({...env,clock}),acquirer=new HttpAcquirer({store,fetchImpl:async()=>new Response('provider error body',{status:503})});await store.initialize();await assert.rejects(()=>acquirer.text({sourceId:'failed-http',provider:'real-provider',url:'https://provider.test/data',describe:async()=>({})}),/upstream_http_503/);assert.equal(store.status().rawProductCount,0);}finally{await rm(env.root,{recursive:true,force:true});}
});

test('archive and rejected quarantine enforce cumulative byte and product ceilings',async()=>{
  const env=await environment();try{
    const store=new AcquisitionStore({...env,clock,maxArchiveBytes:10,maxProviderArchiveBytes:10,maxProducts:3,maxRejectedBytes:6,maxRejectedProducts:2});await store.initialize();
    const first=await store.archiveReceivedProduct({sourceId:'source-a',provider:'provider',body:Buffer.from('aaaa')});await store.recordProductRejected(first.product.id,new Error('invalid-a'));
    const second=await store.archiveReceivedProduct({sourceId:'source-a',provider:'provider',body:Buffer.from('bbbbb')});await store.recordProductRejected(second.product.id,new Error('invalid-b'));
    assert.ok(store.status().rejectedBytes<=6);assert.ok(store.status().rejectedProducts<=2);
    await assert.rejects(()=>store.archiveReceivedProduct({sourceId:'source-a',provider:'provider-b',body:Buffer.from('ccccccc')}),/raw_archive_byte_capacity_reached/);
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('configured FIRMS acquisition archives real-format CSV before normalization and is idempotent',async()=>{
  const env=await environment();
  const csv=(satellite)=>`latitude,longitude,acq_date,acq_time,confidence,frp,satellite,scan,track,type\n39.92,-8.14,2026-08-09,1200,n,12.4,${satellite},0.4,0.4,0\n`;
  try{
    const store=new AcquisitionStore({...env,clock});await store.initialize();
    const gateway=new FirmsGateway({mapKey:'configured',clock,acquisitionStore:store,fetchImpl:async(url)=>new Response(csv(String(url).includes('NOAA20')?'N20':String(url).includes('NOAA21')?'N21':'N'),{status:200,headers:{'content-type':'text/csv'}})});
    const first=await gateway.snapshot();await store.markProductsIngested(first.state.rawSourceProductIds);const second=await gateway.snapshot();
    assert.equal(first.state.state,'current');assert.equal(first.data.length,3);assert(first.data.every((item)=>item.provenance.synthetic===false&&item.rawSourceProductId));assert(first.data.every((item)=>item.receivedAt==='2026-08-09T12:30:00.000Z'&&item.vigiaAcquiredAt===item.receivedAt&&item.providerReceivedAt===null));
    assert.equal(second.state.state,'current');assert.equal(store.status().rawProductCount,4);assert.equal(store.status().checkpoints.filter((item)=>item.healthState==='healthy').length,4);
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('FIRMS version-binds mutable area snapshots instead of quarantining legitimate provider updates',async()=>{
  const env=await environment();let nowMs=Date.parse('2026-08-09T12:30:00Z'),revision=0;
  const csv=()=>`latitude,longitude,acq_date,acq_time,confidence,frp,satellite,scan,track,type\n39.92,-8.14,2026-08-09,1200,n,${revision?13.1:12.4},N20,0.4,0.4,0\n`;
  try{
    const store=new AcquisitionStore({...env,clock:()=>new Date(nowMs)});await store.initialize();
    const gateway=new FirmsGateway({mapKey:'configured',clock:()=>new Date(nowMs),pollIntervalMs:60_000,acquisitionStore:store,fetchImpl:async()=>new Response(csv(),{status:200,headers:{'content-type':'text/csv'}})});
    const first=await gateway.snapshot();await store.markProductsIngested(first.state.rawSourceProductIds);
    revision=1;nowMs+=60_000;const second=await gateway.snapshot();await store.markProductsIngested(second.state.rawSourceProductIds);
    assert.equal(first.state.state,'current');assert.equal(second.state.state,'current');assert.equal(second.state.rejected,0);
    assert.equal(store.getCheckpoint('firms:VIIRS_NOAA20_NRT').consecutiveFailures,0);
    const identifiers=store.products().filter((item)=>item.sourceId==='firms:VIIRS_NOAA20_NRT').map((item)=>item.providerProductId);
    assert.equal(new Set(identifiers).size,2);assert(identifiers.every((value)=>/^VIIRS_NOAA20_NRT:area-snapshot:[a-f0-9]{64}$/.test(value)));
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('FIRMS polling is throttled and failed polls back off before retry',async()=>{
  const env=await environment();let nowMs=Date.parse('2026-08-09T12:30:00Z'),calls=0;
  try{
    const store=new AcquisitionStore({...env,clock:()=>new Date(nowMs)});await store.initialize();
    const gateway=new FirmsGateway({mapKey:'configured',clock:()=>new Date(nowMs),pollIntervalMs:60_000,maxBackoffMs:300_000,acquisitionStore:store,fetchImpl:async()=>{calls+=1;throw new Error('provider_down');}});
    const first=await gateway.snapshot();assert.equal(first.state.state,'unavailable');assert.equal(first.state.consecutiveFailures,1);assert.equal(calls,4);
    const throttled=await gateway.snapshot();assert.equal(throttled.state.nextPollAt,first.state.nextPollAt);assert.equal(calls,4);
    nowMs+=60_000;const second=await gateway.snapshot();assert.equal(second.state.consecutiveFailures,2);assert.equal(calls,8);assert.equal(Date.parse(second.state.nextPollAt)-nowMs,120_000);
    gateway.stop();
  }finally{await rm(env.root,{recursive:true,force:true});}
});

test('FIRMS physical-first event survives process reconstruction with stable identity and no duplicate ingestion',async()=>{
  const env=await environment(),eventFile=path.join(env.root,'events.json');
  const csv=(satellite)=>`latitude,longitude,acq_date,acq_time,confidence,frp,satellite,scan,track,type\n39.92,-8.14,2026-08-09,1200,n,12.4,${satellite},0.4,0.4,0\n`;
  const fetchImpl=async(url)=>new Response(csv(String(url).includes('NOAA20')?'N20':String(url).includes('NOAA21')?'N21':'N'),{status:200,headers:{'content-type':'text/csv'}});
  async function run(store,repository){
    const gateway=new FirmsGateway({mapKey:'configured',clock,pollIntervalMs:60_000,acquisitionStore:store,fetchImpl});
    const snapshot=await gateway.snapshot(),incoming=buildEventObservations({fires:[],thermalDetections:snapshot.data,now:clock()});
    const observations=await repository.merge(incoming,clock()),events=await repository.reconcileEvents(trackFireEvents(observations,{now:clock()}),clock());
    await repository.persistDerivedStates(events,clock());await store.markProductsIngested(snapshot.state.rawSourceProductIds);gateway.stop();return{observations,events};
  }
  try{
    const firstStore=new AcquisitionStore({...env,clock});await firstStore.initialize();const firstRepository=new EventObservationRepository({filePath:eventFile,universe:'production'});const first=await run(firstStore,firstRepository);
    assert.equal(first.events.length,1);assert.equal(first.events[0].evidenceState,'satellite-only');assert.equal(first.events[0].createdAt,'2026-08-09T12:30:00.000Z');const eventId=first.events[0].id,observationIds=first.observations.map((item)=>item.id);
    const restartedStore=new AcquisitionStore({...env,clock});await restartedStore.initialize();const restartedRepository=new EventObservationRepository({filePath:eventFile,universe:'production'});const second=await run(restartedStore,restartedRepository);
    assert.equal(second.events.length,1);assert.equal(second.events[0].id,eventId);assert.equal(second.events[0].createdAt,first.events[0].createdAt);assert.deepEqual(second.observations.map((item)=>item.id),observationIds);assert.equal(restartedStore.status().rawProductCount,4);assert.equal(restartedStore.status().ingestedProducts,4);
  }finally{await rm(env.root,{recursive:true,force:true});}
});
