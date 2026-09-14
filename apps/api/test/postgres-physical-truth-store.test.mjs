import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PostgresPhysicalTruthStore } from '../src/modules/storage/postgres-physical-truth-store.mjs';

const at='2026-08-10T12:00:00.000Z',clock=()=>new Date(at);
function harness({failOn=null}={}){
  const calls=[];let activeFailOn=failOn;
  const client={async query(sql,values=[]){calls.push({sql:String(sql),values});if(activeFailOn&&String(sql).includes(activeFailOn))throw new Error('database_write_failed');if(String(sql).includes('PostGIS_Version'))return{rows:[{version:'3.5 TEST'}]};return{rows:[]};},release(){calls.push({sql:'RELEASE',values:[]});}};
  return{calls,setFailOn(value){activeFailOn=value;},pool:{async connect(){return client;},async end(){calls.push({sql:'END',values:[]});}}};
}
function snapshot(){
  const product={id:'raw:nasa:feed:abc',sourceId:'firms:VIIRS_NOAA20_NRT',provider:'nasa-firms',providerProductId:'VIIRS_NOAA20_NRT:2026-08-10T11:55:00Z',requestWindow:{aoi:'portugal'},requestedAt:at,receivedAt:at,sourceTimestamp:'2026-08-10T11:55:00Z',sourceTimestampRange:{start:'2026-08-10T11:55:00Z',end:'2026-08-10T11:55:00Z'},contentType:'text/csv',byteLength:100,checksumSha256:'a'.repeat(64),originalUriOrObjectKey:'received/nasa/feed/a.raw',httpStatus:200,acquisitionRunId:'run-1',parserVersion:'csv-v1',normalizerVersion:'normalizer-v1',licenceMetadata:{provider:'NASA FIRMS'},parsedAt:at};
  const footprint={type:'Feature',properties:{authoritativePerimeter:false},geometry:{type:'Polygon',coordinates:[[[-8.101,40.099],[-8.099,40.099],[-8.099,40.101],[-8.101,40.099]]]}};
  const observation={id:'thermal:n20:1',type:'thermal',source:'NASA FIRMS VIIRS',at:'2026-08-10T11:55:00Z',receivedAt:at,coordinate:[-8.1,40.1],footprint,sourceFamily:'viirs',independenceGroup:'viirs_noaa_20',instrument:'VIIRS',satellite:'VIIRS NOAA-20',confidence:'nominal',frpMw:14.2,qualityFlags:[],provenance:{rawSourceProductId:product.id,normalizerVersion:'normalizer-v1',checksumSha256:product.checksumSha256,synthetic:false}};
  const event={id:'PT-2026-ABC',firstSeenAt:observation.at,lastSeenAt:observation.at,coordinate:observation.coordinate,evidenceState:'satellite-only',evolutionState:'active',knowledgeState:'physically_observed',behaviorState:'unknown',association:{state:'single_source'},observedGeometry:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-8.11,40.09],[-8.09,40.09],[-8.09,40.11],[-8.11,40.09]]]}},observations:[observation]};
  const checkpoint={sourceId:product.sourceId,lastSuccessfulPollAt:at,pendingProductIds:[product.id],healthState:'archive_ready'};
  return{products:[product],events:[event],checkpoints:[checkpoint]};
}

test('PostGIS physical-truth store writes the complete lineage in one transaction',async()=>{
  const fake=harness(),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});
  const initialized=await store.initialize();assert.equal(initialized.state,'ready');assert.equal(initialized.postgis,true);
  fake.calls.length=0;const result=await store.commitSnapshot(snapshot());assert.deepEqual(result,{products:1,observations:1,events:1,checkpoints:1});
  const sql=fake.calls.map((item)=>item.sql);assert.equal(sql[0],'BEGIN');assert.equal(sql.at(-2),'COMMIT');
  for(const table of ['raw_source_product','physical_observation','fire_event','event_observation','source_checkpoint','provenance_lineage'])assert.ok(sql.some((value)=>value.includes(table)),`missing ${table}`);
  assert.ok(sql.findIndex((value)=>value.includes('raw_source_product'))<sql.findIndex((value)=>value.includes('physical_observation')));
  assert.equal(store.status().lastCommitAt,at);
});

test('operator actions are mirrored with one PostgreSQL transaction',async()=>{
  const fake=harness(),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();fake.calls.length=0;
  const result=await store.commitOperatorAction({id:'audit:1',at,actorId:'operator-1',actorRole:'supervisor',type:'evidence.requested',entityType:'evidence_request',entityId:'request-1',payload:{targetId:'event:1'},previousHash:'GENESIS',hash:'b'.repeat(64)});
  assert.equal(result.persisted,true);const sql=fake.calls.map((item)=>item.sql);assert.equal(sql[0],'BEGIN');assert.ok(sql.some((item)=>item.includes('INSERT INTO operator_action')));assert.equal(sql.at(-2),'COMMIT');
});

test('observation ownership bindings are transactionally enforced before local evidence persistence',async()=>{
  const fake=harness(),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();fake.calls.length=0;
  const identity={identityVersion:'vigia.observation-identity.v1',canonicalObservationId:'sensor:canonical',externalObservationId:'provider:one',principalId:'registered_sensor:camera:one',agencyId:'agency:one',nodeOrProviderId:'camera:one',incidentId:'incident:one',sourceFamily:'registered_camera',schemaVersion:'physical-observation.v1',payloadHash:`sha256:${'a'.repeat(64)}`,createdAt:at};
  const result=await store.commitObservationIdentities([{provenance:{observationIdentity:identity}}]);assert.equal(result.identities,1);
  const binding=fake.calls.find((item)=>item.sql.includes('INSERT INTO observation_identity_binding'));assert.ok(binding);assert.match(binding.sql,/ON CONFLICT\(canonical_observation_id\).*payload_hash=EXCLUDED\.payload_hash.*RETURNING canonical_observation_id/s);assert.deepEqual(binding.values,[identity.canonicalObservationId,identity.externalObservationId,identity.principalId,identity.agencyId,identity.nodeOrProviderId,identity.incidentId,identity.sourceFamily,identity.schemaVersion,identity.identityVersion,identity.payloadHash,identity.createdAt]);assert.equal(fake.calls.at(-2).sql,'COMMIT');
});

test('PostGIS physical-truth store rolls back and fails closed on a partial write',async()=>{
  const fake=harness({failOn:'INSERT INTO fire_event'}),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();fake.calls.length=0;
  await assert.rejects(()=>store.commitSnapshot(snapshot()),/database_write_failed/);
  assert.ok(fake.calls.some((item)=>item.sql==='ROLLBACK'));assert.equal(store.status().state,'failed');assert.equal(store.status().lastCommitAt,null);
});

test('a later governed mirror write actively recovers a failed physical-truth store',async()=>{
  const fake=harness({failOn:'INSERT INTO fire_event'}),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();
  await assert.rejects(()=>store.commitSnapshot(snapshot()),/database_write_failed/);assert.equal(store.status().state,'failed');
  fake.setFailOn(null);fake.calls.length=0;
  const result=await store.commitOperationalState({preventionFindings:[],preventionReviews:[]});
  assert.equal(result.persisted,true);assert.equal(store.status().state,'ready');assert.equal(store.status().postgis,true);
  const sql=fake.calls.map(item=>item.sql);assert.ok(sql.some(item=>item.includes('PostGIS_Version')),'recovery must re-prove PostGIS readiness before mirroring');assert.equal(sql.at(-2),'COMMIT');
});

test('physical-truth store is explicit when no database is configured',async()=>{
  const store=new PostgresPhysicalTruthStore({clock});const status=await store.initialize();assert.equal(status.state,'not_configured');assert.match(status.lastError,/VIGIA_DATABASE_URL/);
  await assert.rejects(()=>store.commitSnapshot(snapshot()),/postgres_physical_truth_not_configured/);
});

test('physical-truth store records a connection failure instead of leaving an initializing state',async()=>{
  const pool={async connect(){throw new Error('database_offline');},async end(){}};
  const store=new PostgresPhysicalTruthStore({pool,clock});
  const status=await store.initialize();assert.equal(status.state,'failed');assert.equal(status.postgis,false);assert.match(status.lastError,/database_offline/);
});

test('checked-out client termination degrades physical truth without crashing the process',()=>{
  const pool=new EventEmitter(),client=new EventEmitter();client.release=()=>{};pool.end=async()=>{};
  const store=new PostgresPhysicalTruthStore({pool,clock});pool.emit('acquire',client);
  const fatal=Object.assign(new Error('terminating connection due to idle-in-transaction timeout'),{code:'25P03'});
  assert.doesNotThrow(()=>client.emit('error',fatal));
  assert.equal(store.status().state,'failed');assert.equal(store.status().postgis,false);assert.match(store.status().lastError,/idle-in-transaction/);
});

test('production physical-truth store rejects synthetic provenance before opening a transaction',async()=>{
  const fake=harness(),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();fake.calls.length=0;
  const input=snapshot();input.events[0].observations[0].provenance.synthetic=true;input.events[0].observations[0].provenance.universe='test';
  await assert.rejects(()=>store.commitSnapshot(input),(error)=>error?.name==='ProductionIntegrityViolation');assert.equal(fake.calls.length,0);
});

test('operational state mirrors prevention reviews after their findings',async()=>{
  const fake=harness(),store=new PostgresPhysicalTruthStore({pool:fake.pool,clock});await store.initialize();fake.calls.length=0;
  const finding={findingId:'finding-1',kind:'FUEL_CONTINUITY_CHANGE',state:'OPEN',calibrationState:'SCREENING_CANDIDATE',coordinate:[-8,37],geometry:{type:'Polygon',coordinates:[[[-8,37],[-7.99,37],[-7.99,37.01],[-8,37]]]},currentObservationId:'s2-current',comparisonObservationId:'s2-prior',firstObservableInterval:{start:at,end:at},infrastructureInteractions:[],sourceQuality:{},detectorVersion:'fuel-v1',validation:{},provenance:{},evidenceNeedId:null,evidenceRequestId:null,createdAt:at,updatedAt:at};
  const review={id:'review-1',findingId:'finding-1',detectorVersion:'fuel-v1',reviewerType:'DEVELOPER_REVIEW',reviewerId:'operator-1',decision:'ABSTAIN',reason:'INSUFFICIENT_RESOLUTION',note:'Needs expert review.',reviewedAt:at};
  const result=await store.commitOperationalState({preventionFindings:[finding],preventionReviews:[review]});
  assert.equal(result.preventionReviews,1);
  const sql=fake.calls.map((item)=>item.sql);
  assert.ok(sql.findIndex((value)=>value.includes('INSERT INTO prevention_finding('))<sql.findIndex((value)=>value.includes('INSERT INTO prevention_finding_review')));
  assert.equal(sql.at(-2),'COMMIT');
});
