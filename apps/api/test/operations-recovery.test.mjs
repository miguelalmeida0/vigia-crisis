import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify, safeDatabaseTarget } from '../../../scripts/db_doctor.mjs';
import { Router } from '../src/http/router.mjs';
import { operationsPostgisUnavailable } from '../src/modules/storage/dependency-error.mjs';
import { ObservationOpportunityService } from '../src/modules/observations/observation-opportunity-service.mjs';
import { AlertService } from '../src/modules/alerts/alert-service.mjs';
import { IncidentOperationsService } from '../src/modules/alerts/incident-operations-service.mjs';
import { loadMigrations, runPostgresMigrations } from '../src/modules/storage/postgres-migration-runner.mjs';
import { PostgresAlertStore } from '../src/modules/alerts/postgres-alert-store.mjs';
import { alertMutationAlreadyApplied,observationMatchesOpportunity,writeAudit } from '../src/modules/alerts/postgres-alert-store-support.mjs';
import { MonitoredTerritoryService } from '../src/modules/monitored-territory/monitored-territory-service.mjs';

function responseCapture(){return{statusCode:null,headers:null,body:null,writeHead(status,headers){this.statusCode=status;this.headers=headers;},end(payload){this.body=payload?JSON.parse(payload):null;}};}

test('db doctor classifies recoverable local failure modes without exposing credentials',()=>{
  const base={database:{ready:false,errorCode:'ECONNREFUSED'},tcp:false,docker:{reachable:false},container:{state:null},migrations:null,schema:{missing:[]}};
  assert.equal(classify(base),'DOCKER_UNAVAILABLE');
  assert.equal(classify({...base,docker:{reachable:true},container:{state:'exited'}}),'CONTAINER_STOPPED');
  assert.equal(classify({...base,database:{ready:true},docker:{reachable:true},migrations:{state:'migration_required'},schema:{missing:['operational_alert']}}),'MIGRATION_REQUIRED');
  assert.equal(classify({...base,database:{ready:true},docker:{reachable:true},migrations:{state:'checksum_mismatch'},schema:{missing:[]}}),'SCHEMA_ERROR');
  assert.deepEqual(safeDatabaseTarget('postgresql://user:secret@127.0.0.1:55432/vigia'),{host:'127.0.0.1',port:55432,database:'vigia',ssl:'default'});
});

test('router emits a bounded structured 503 for operations PostGIS loss',async()=>{
  const router=new Router();router.get('/api/v10/operations/example',async()=>{throw operationsPostgisUnavailable({state:'degraded',lastFailureAt:'2026-08-13T10:00:00Z'});});
  const res=responseCapture();const handled=await router.safeHandle({method:'GET',url:'/api/v10/operations/example',headers:{}},res,{actor:{id:'supervisor',role:'supervisor',authentication:{authenticated:true}}});assert.equal(handled,true);
  assert.equal(res.statusCode,503);assert.equal(res.body.status,'degraded');assert.equal(res.body.dependency,'postgis');assert.equal(res.body.capability,'operations');assert.equal(res.body.retryable,true);assert.equal(JSON.stringify(res.body).includes('secret'),false);
});

test('opportunity hierarchy promotes only attributable archived provider products',async()=>{
  const persisted=[];const service=new ObservationOpportunityService({reader:async()=>({opportunities:[]}),clock:()=>new Date('2026-08-13T10:00:00Z'),operationsStore:{reconcileOpportunityResults:async()=>[],upsertOpportunities:async(items)=>persisted.push(...items)}});await service.refresh();
  const plan=await service.plan({id:'event-1',coordinate:[-8,40],actionNeed:{needsRouting:true,kind:'investigate_thermal_candidate'},observations:[{id:'viirs-1',type:'thermal',sourceFamily:'viirs',at:'2026-08-13T09:55:00Z',provenance:{rawSourceProductId:'raw:firms:1'}}]},{},{firms:{state:'current',rawSourceProductIds:['raw:firms:1'],upstreamAt:'2026-08-13T09:55:00Z',currentCoverage:'Portugal mainland'},sentinel3:{state:'current'},sentinel2:{state:'catalogue_available'}});
  const viirs=plan.opportunitiesV2.find((item)=>item.sourceFamily==='viirs');assert.equal(viirs.opportunityType,'CONFIRMED_PROVIDER_PRODUCT');assert.equal(viirs.canCloseEvidenceNeed,true);assert.match(viirs.authority,/ATTRIBUTABLE_ARCHIVED_PRODUCT/);
  assert.equal(plan.opportunitiesV2.find((item)=>item.sourceFamily==='sentinel3_slstr').opportunityType,'UNKNOWN');assert.equal(persisted.length,3);
  const unmatched=await service.plan({id:'event-2',coordinate:[-8,40],actionNeed:{needsRouting:true,kind:'investigate_thermal_candidate'},observations:[]},{},{firms:{state:'current',rawSourceProductIds:['raw:firms:1'],upstreamAt:'2026-08-13T09:55:00Z',currentCoverage:'Portugal mainland'}});assert.equal(unmatched.opportunitiesV2.find((item)=>item.sourceFamily==='viirs').opportunityType,'UNKNOWN');
});

test('alert priority exposes transparent operational factors instead of a probability',async()=>{
  let persisted=null;const event={id:'event-current',label:'Current physical candidate',physicalOperationalState:'CURRENT_MULTISOURCE_PHYSICAL_FIRE',physicalFirst:true,physicalState:{freshness:'current',lastAt:'2026-08-13T09:59:00Z'},physicalSourceProfile:{families:['viirs','sentinel3_slstr']},reportState:{firstAt:null},observations:[{id:'o1',at:'2026-08-13T09:59:00Z',type:'thermal',sourceFamily:'viirs'}]};
  const store={recoverIfNeeded:async()=>{},recordDecisions:async()=>{},upsertAlert:async(alert)=>{persisted=alert;return{alert,created:true,materialChange:true};},escalateDue:async()=>[],listAlerts:async()=>[]};
  const territoryService={ensurePersisted:async()=>{},context:async()=>({territories:[{id:'t1'}],policies:[{policyId:'p1'}],assets:[{distanceMeters:500}]}),recipients:()=>[] ,registry:null};
  const service=new AlertService({store,territoryService,repository:{snapshot:()=>({evidenceRequests:[],watchedEventIds:[]})},clock:()=>new Date('2026-08-13T10:00:00Z')});await service.sync({events:[event]});
  assert.equal(persisted.priority,'HIGH');assert.equal(persisted.payload.priorityDecision.algorithmVersion,'vigia.transparent-operational-priority.v1');assert.ok(persisted.payload.priorityDecision.factors.some((item)=>item.code==='MONITORED_ASSET_WITHIN_1KM'));assert.match(persisted.payload.priorityDecision.scoreQualification,/not a probability/);
});

test('operations status remains inspectable while persistence is degraded',async()=>{
  const dependency=operationsPostgisUnavailable({state:'degraded'}),service=new IncidentOperationsService({operationsStore:{recoverIfNeeded:async()=>{throw dependency;},status:()=>({state:'degraded',dependency:'postgis'})},monitoredTerritoryService:{ensurePersisted:async()=>{throw dependency;},snapshot:()=>({state:'DEGRADED',assetCount:1000})},alertService:{deliveryWorker:{status:()=>({state:'IDLE'})}},deliveryAdapters:{configuration:()=>({IN_APP:{configured:true}})},livePhysicalIntelligenceService:{status:()=>({lastCycle:null})},clock:()=>new Date('2026-08-13T10:00:00Z')});
  const status=await service.status();assert.equal(status.overallStatus,'DEGRADED');assert.equal(status.status,'degraded');assert.equal(status.degradedReasons[0].dependency,'postgis');assert.equal(status.metrics,null);
});

test('operations status remains a full degraded contract when the first post-loss read fails',async()=>{
  let state='ready';const dependency=operationsPostgisUnavailable({state:'degraded'}),store={recoverIfNeeded:async()=>{},operationsStatus:async()=>{state='degraded';throw dependency;},status:()=>({state,dependency:'postgis'})};
  const service=new IncidentOperationsService({operationsStore:store,monitoredTerritoryService:{ensurePersisted:async()=>{},snapshot:()=>({state:'DEGRADED',assetCount:1000})},alertService:{metrics:async()=>({}),deliveryWorker:{status:()=>({state:'IDLE'})}},deliveryAdapters:{configuration:()=>({IN_APP:{configured:true}})},livePhysicalIntelligenceService:{status:()=>({lastCycle:null})},clock:()=>new Date('2026-08-13T10:00:00Z')});
  const status=await service.status();assert.equal(status.overallStatus,'DEGRADED');assert.equal(status.database.state,'degraded');assert.equal(status.degradedReasons[0].dependency,'postgis');assert.equal(status.alertEngine.state,'DEGRADED');
});

test('shadow roster is authenticated and never presented as real personnel',async()=>{
  const service=new IncidentOperationsService({operationsStore:{recoverIfNeeded:async()=>{},listRoster:async()=>[{actorId:'shadow:operator-primary',identityScope:'SHADOW'}]}});
  await assert.rejects(()=>service.roster({}, {id:'public',authentication:{authenticated:false}}),/forbidden/);
  const value=await service.roster({}, {id:'operator',incidentScopes:['*'],authentication:{authenticated:true}});assert.equal(value.roster[0].identityScope,'SHADOW');assert.match(value.qualification,/no external organization or real personnel/);
});

test('migrations are checksum-governed, repeatable and contain no destructive table reset',async()=>{
  const ledger=[],calls=[];
  const client={query:async(sql,params=[])=>{calls.push(String(sql));if(String(sql).startsWith('SELECT version,name,checksum'))return{rows:ledger.map((item)=>({...item}))};if(String(sql).startsWith('INSERT INTO vigia_schema_migration')){ledger.push({version:params[0],name:params[1],checksum:params[2],applied_at:params[3],execution_ms:params[4]});return{rows:[]};}if(String(sql).startsWith('SELECT PostGIS_Version'))return{rows:[{version:'3.5-test'}]};return{rows:[]};},release:()=>{}};
  const pool={connect:async()=>client};
  const migrations=await loadMigrations(),expectedVersions=migrations.map((item)=>item.version);
  const first=await runPostgresMigrations(pool,{clock:()=>new Date('2026-08-13T10:00:00Z')}),second=await runPostgresMigrations(pool,{clock:()=>new Date('2026-08-13T10:01:00Z')});
  assert.deepEqual(first.applied,expectedVersions);assert.deepEqual(second.skipped,first.applied);assert.equal(ledger.length,expectedVersions.length);
  assert.ok(migrations.every((item)=>item.checksum.startsWith('sha256:')));assert.equal(migrations.some((item)=>/\bDROP\s+TABLE\b|\bTRUNCATE\b/i.test(item.sql)),false);
  assert.equal(calls.some((sql)=>/vigia_schema_migration\s*\(version\)\s*VALUES\s*\('[^']+-[^']+'\)/i.test(sql)),false);
});

test('read-path reconnect verifies migration state without mutating schema',async()=>{
  const migrations=await loadMigrations(),ledger=migrations.map((item)=>({version:item.version,name:item.name,checksum:item.checksum,applied_at:'2026-08-13T10:00:00Z',execution_ms:1})),calls=[];
  const pool={on:()=>{},query:async(sql)=>{calls.push(String(sql));if(String(sql).startsWith("SELECT to_regclass"))return{rows:[{migration_table:'vigia_schema_migration'}]};if(String(sql).startsWith('SELECT version,name,checksum'))return{rows:ledger};return{rows:[]};},end:async()=>{}};
  const store=new PostgresAlertStore({pool,clock:()=>new Date('2026-08-13T10:01:00Z')});const status=await store.recoverIfNeeded({minRetryIntervalMs:0});
  assert.equal(status.state,'ready');assert.equal(calls.some((sql)=>sql.includes('CREATE TABLE IF NOT EXISTS monitored_territory')),false);assert.equal(calls.some((sql)=>sql.includes('ALTER TABLE')),false);await store.close();
});

test('operations pool is sized for bounded concurrent status fan-out',async()=>{
  const store=new PostgresAlertStore({databaseUrl:'postgresql://unused'});
  assert.equal(store.pool.options.max,24);
  assert.deepEqual(store.status().pool,{max:24,total:0,idle:0,waiting:0});
  await store.close();
});

test('a transient pool-acquisition timeout is retried without falsely degrading PostGIS',async()=>{
  let calls=0;
  const pool={on:()=>{},query:async()=>{calls+=1;if(calls===1)throw new Error('timeout exceeded when trying to connect');return{rows:[]};},end:async()=>{}};
  const store=new PostgresAlertStore({pool});store.ready=true;
  assert.deepEqual(await store.listAlerts(),[]);
  assert.equal(calls,2);assert.equal(store.status().state,'initializing');
  await store.close();
});

test('alert timeline keeps acknowledgement, escalation, resolution and audit projections aligned',async()=>{
  const pool={on:()=>{},query:async(sql)=>{
    const text=String(sql);
    if(text.includes('operational_alert_status_projection'))return{rows:[{id:'alert-1'}]};
    if(text.includes('alert_delivery_outbox'))return{rows:[{id:'delivery-1'}]};
    if(text.includes('alert_acknowledgement'))return{rows:[{id:'ack-1'}]};
    if(text.includes('alert_escalation'))return{rows:[{id:'escalation-1'}]};
    if(text.includes('alert_resolution'))return{rows:[{id:'resolution-1'}]};
    if(text.includes('operations_audit_record'))return{rows:[{id:'audit-1'}]};
    return{rows:[]};
  },end:async()=>{}};
  const store=new PostgresAlertStore({pool});store.ready=true;
  const timeline=await store.alertTimeline('alert-1');
  assert.equal(timeline.acknowledgements[0].id,'ack-1');
  assert.equal(timeline.escalations[0].id,'escalation-1');
  assert.equal(timeline.resolutions[0].id,'resolution-1');
  assert.equal(timeline.audit[0].id,'audit-1');
  await store.close();
});

test('confirmed provider results require the same attributable archived product',()=>{
  const opportunity={source_family:'viirs',opportunity_type:'CONFIRMED_PROVIDER_PRODUCT',created_at:'2026-08-13T09:00:00Z',expires_at:'2026-08-13T11:00:00Z',window_start:'2026-08-13T10:00:00Z',window_end:'2026-08-13T10:00:00Z',payload:{coverageAssumptions:{productId:'raw:expected'}}};
  const base={id:'observation-1',at:'2026-08-13T10:00:00Z',sourceFamily:'viirs'};
  assert.equal(observationMatchesOpportunity({...base,provenance:{rawSourceProductId:'raw:other'}},opportunity),false);
  assert.equal(observationMatchesOpportunity({...base,provenance:{rawSourceProductId:'raw:expected'}},opportunity),true);
});

test('audit appends acquire an aggregate-scoped transaction lock before reading the chain head',async()=>{
  const calls=[];const client={query:async(sql)=>{calls.push(String(sql));return{rows:[]};}};
  await writeAudit(client,{aggregateType:'ALERT',aggregateId:'alert-1',action:'OPENED',actorId:'engine',payload:{},at:'2026-08-13T10:00:00Z'});
  assert.match(calls[0],/pg_advisory_xact_lock/);assert.match(calls[1],/FOR UPDATE/);
});

test('available local shadow operator receives durable local channels when no real roster is configured',()=>{
  const service=new MonitoredTerritoryService({operatorConfigured:false});
  service.registry={territory:{id:'territory:portugal-shadow'},actors:[{actorId:'shadow:operator-primary',actorRole:'OPERATOR',availability:'AVAILABLE',channels:['IN_APP','BROWSER_NOTIFICATION']}]};
  const recipients=service.recipients({territoryContext:{territories:[{id:'territory:portugal-shadow'}]}});
  assert.deepEqual(recipients.map((item)=>item.channel),['IN_APP','BROWSER_NOTIFICATION']);assert.ok(recipients.every((item)=>item.actorId==='shadow:operator-primary'));
});

test('first read failure after PostGIS loss becomes structured degraded state immediately',async()=>{
  const pool={on:()=>{},query:async()=>{throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:55432'),{code:'ECONNREFUSED'});},end:async()=>{}};
  const store=new PostgresAlertStore({pool,clock:()=>new Date('2026-08-13T10:00:00Z')});store.ready=true;
  await assert.rejects(()=>store.listAlerts(),(error)=>error.statusCode===503&&error.details?.dependency==='postgis');
  assert.equal(store.status().state,'degraded');assert.equal(store.status().lastErrorCode,'ECONNREFUSED');await store.close();
});

test('first transaction connection failure after PostGIS loss becomes structured degraded state immediately',async()=>{
  const pool={on:()=>{},connect:async()=>{throw Object.assign(new Error('connection terminated unexpectedly'),{code:'ECONNRESET'});},end:async()=>{}};
  const store=new PostgresAlertStore({pool,clock:()=>new Date('2026-08-13T10:00:00Z')});store.ready=true;
  await assert.rejects(()=>store.claimDeliveries(),(error)=>error.statusCode===503&&error.details?.dependency==='postgis');
  assert.equal(store.status().state,'degraded');assert.equal(store.status().lastErrorCode,'ECONNRESET');await store.close();
});

test('operator lifecycle retries are semantic no-ops after the requested state already persisted',()=>{
  assert.equal(alertMutationAlreadyApplied({acknowledged_at:'2026-08-13T10:00:00Z'},{action:'ACKNOWLEDGE'}),true);
  assert.equal(alertMutationAlreadyApplied({lifecycle_state:'OWNED',owner_actor_id:'operator-1'},{action:'REASSIGN',ownerActorId:'operator-1'}),true);
  assert.equal(alertMutationAlreadyApplied({lifecycle_state:'RESOLVED',resolution_code:'FALSE_POSITIVE'},{action:'RESOLVE',resolutionCode:'FALSE_POSITIVE'}),true);
  assert.equal(alertMutationAlreadyApplied({lifecycle_state:'OWNED',owner_actor_id:'operator-1'},{action:'REASSIGN',ownerActorId:'operator-2'}),false);
});

test('database recovery is volume-preserving and count-gated before it can report ready',async()=>{
  const source=await readFile(new URL('../../../scripts/db_up.mjs',import.meta.url),'utf8');
  assert.match(source,/--no-recreate/);assert.match(source,/preservationSnapshot/);assert.match(source,/db_up_preservation_gate_failed/);assert.doesNotMatch(source,/\bdown\b|\brm\b|\bprune\b|DROP\s+TABLE|TRUNCATE/i);
});

test('backup rehearsal binds the created tar to an exact safely restored evidence manifest',async()=>{
  const [drill,integrity,helper]=await Promise.all([readFile(new URL('../../../scripts/operations/run_backup_restore_drill.mjs',import.meta.url),'utf8'),readFile(new URL('../../../scripts/operations/archive-integrity.mjs',import.meta.url),'utf8'),readFile(new URL('../../../scripts/operations/archive-integrity-helper.py',import.meta.url),'utf8')]),implementation=`${integrity}\n${helper}`;
  assert.match(drill,/createEvidenceSourceManifest/);assert.match(drill,/restoreEvidenceArchive/);assert.match(drill,/restoredManifestDigest===evidenceSourceManifest\.manifestDigest/);assert.doesNotMatch(drill,/archiveEntries>0&&restoredEntries>0/);
  for(const required of ['production-v1.json','alerts-v10.json','event-projections.production.json','fieldnet-central-reconciliation.json','geo-integrity-proofs.json','live-shadow-campaign.json','source-cache.json'])assert.match(drill,new RegExp(required.replaceAll('.','\\.')));
  assert.match(implementation,/archive_restore_unsafe_entry_type/);assert.match(implementation,/archive_restore_archive_changed/);assert.match(implementation,/archive_restore_manifest_mismatch/);assert.match(implementation,/O_NOFOLLOW/);
});

test('operator soak request-rate sampling excludes accelerated setup traffic',async()=>{
  const source=await readFile(new URL('../../../scripts/operations/operator_maturity_soak.py',import.meta.url),'utf8');
  assert.match(source,/previous_requests = evidence\["totalRequests"\]/);
  assert.doesNotMatch(source,/previous_requests = 0/);
  assert.match(source,/"requestsThisMinute": evidence\["totalRequests"\] - previous_requests/);
});

test('deployment crash drill exercises restart policy instead of manually stopping containers',async()=>{
  const [compose,drill,runtime,operatorImage,server,services]=await Promise.all([
    readFile(new URL('../../../infra/docker-compose.remote-shadow.yml',import.meta.url),'utf8'),
    readFile(new URL('../../../scripts/operations/run_deployment_recovery_drill.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../../scripts/operations/deployment-drill-runtime.mjs',import.meta.url),'utf8'),
    readFile(new URL('../../../infra/Dockerfile.operator',import.meta.url),'utf8'),
    readFile(new URL('../src/server.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/application/create-services.mjs',import.meta.url),'utf8'),
  ]);
  assert.equal((compose.match(/^\s{4}init: true$/gm)??[]).length,3);
  assert.doesNotMatch(drill,/compose\('kill'/);
  for(const service of ['api','fieldnet','web'])assert.match(drill,new RegExp(`crashProcess\\('${service}'\\)`));
  assert.match(runtime,/kill -KILL/);
  assert.match(runtime,/restartCountAfter > restartCountBefore/);
  assert.match(drill,/migration: manifest\.contracts\?\.migrationHead/);
  assert.match(drill,/successfulReleaseResponse/);
  assert.match(drill,/badContainerReady/);
  assert.match(drill,/remote_shadow_release_identity_mismatch/);
  assert.match(drill,/stale_release_rejection_not_proven/);
  assert.match(drill,/createDetachedImageAttestation/);
  assert.match(drill,/verifyExtractedApplicationImage/);
  assert.match(drill,/VIGIA_API_IMAGE_REFERENCE:apiImage\.Id/);
  assert.match(drill,/VIGIA_OPERATOR_IMAGE_REFERENCE:operatorImage\.Id/);
  assert.match(drill,/compose\('up', '-d', '--no-build'/);
  assert.doesNotMatch(drill,/compose\('up', '-d', '--build'/);
  assert.match(compose,/image:\s*"\$\{VIGIA_API_IMAGE_REFERENCE:\?set VIGIA_API_IMAGE_REFERENCE\}"/);
  assert.match(compose,/image:\s*"\$\{VIGIA_OPERATOR_IMAGE_REFERENCE:\?set VIGIA_OPERATOR_IMAGE_REFERENCE\}"/);
  const [operatorBuildStage,operatorRuntimeStage]=operatorImage.split(/\nFROM /);assert.match(operatorBuildStage,/apt-get install -y --no-install-recommends python3/);assert.doesNotMatch(operatorRuntimeStage,/apt-get|python3/);
  assert.doesNotMatch(drill,/badReleaseProbe\?\.body\?\.releaseId === badRelease/);
  assert.match(server,/createServices\(\{ config, hub, releaseIdentity, onStartupPhase:recordStartupPhase \}\)/);
  assert.equal((services.match(/releaseId:verifiedReleaseId/g)??[]).length,2);
  assert.doesNotMatch(services,/releaseId:config\.releaseId/);
});
