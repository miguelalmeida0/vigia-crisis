import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { assertIncidentScope, incidentInScope } from '../../../packages/domain/src/authorization.mjs';
import { sanitizeTaskChanges } from '../../../packages/domain/src/fieldnet/reconciliation.mjs';
import { EvidenceRequestService } from '../src/modules/verification/evidence-request-service.mjs';
import { IncidentReviewService } from '../src/modules/verification/incident-review-service.mjs';
import { DetectionService } from '../src/modules/detection/detection-service.mjs';
import { OutcomeService } from '../src/modules/outcomes/outcome-service.mjs';
import { MonitoredTerritoryService } from '../src/modules/monitored-territory/monitored-territory-service.mjs';
import { RequestGate, SingleFlight } from '../src/shared/request-gate.mjs';
import { SseHub } from '../src/stream/sse-hub.mjs';
import { fetchRaw } from '../src/shared/fetch.mjs';
import { fieldEventVisible, publicFieldNodeHealth, resolveFieldRequestIncident, scopedFieldNodeSnapshot } from '../../field-node/src/http-boundary.mjs';
import { boundedSyncCursor, readBoundedCentralJson, validateCentralSyncPayload } from '../../field-node/src/bounded-central-response.mjs';
import { assertLocalVisualizationRequest, policyForRoute,visualizationClientKey } from '../src/http/route-security-policy.mjs';
import { commandAuthorizationFingerprint, scopedOperationsHandoff } from '../src/modules/mission/command-projection-routes.mjs';
import { AuditService } from '../src/modules/audit/audit-service.mjs';

const authenticated=(incidentScopes,role='supervisor')=>({id:'operator:test',role,incidentScopes,authentication:{authenticated:true}});

test('incident scope is canonical, prefix-tolerant, and fail closed',()=>{
  const actor=authenticated(['incident:PT-A']);
  assert.equal(incidentInScope(actor,'event:PT-A'),true);
  assert.equal(incidentInScope(actor,'PT-B'),false);
  assert.throws(()=>assertIncidentScope(actor,'PT-B'),error=>error.statusCode===403&&error.message==='incident_scope_forbidden');
  assert.equal(incidentInScope(authenticated([]),'PT-A'),false);
});

test('evidence snapshots and lifecycle mutations cannot cross incident scope',async()=>{
  let state={evidenceRequests:[
    {id:'request-a',targetType:'fire_event',targetId:'event:PT-A',state:'requested',ownerId:'operator:test'},
    {id:'request-b',targetType:'fire_event',targetId:'event:PT-B',state:'requested',ownerId:'operator:test'}
  ],evidencePackages:[{id:'package-a',requestId:'request-a'},{id:'package-b',requestId:'request-b'}]};
  const repository={snapshot:()=>structuredClone(state),mutate:async(fn)=>{state=await fn(structuredClone(state));return structuredClone(state);}};
  const service=new EvidenceRequestService({repository,auditService:{record:async()=>{}}});
  const actor=authenticated(['PT-A']);
  const visible=service.snapshot(actor);assert.deepEqual(visible.requests.map((item)=>item.id),['request-a']);assert.deepEqual(visible.packages.map((item)=>item.id),['package-a']);
  await assert.rejects(()=>service.transition(actor,'request-b',{state:'cancelled'}),error=>error.statusCode===403);
  assert.equal(state.evidenceRequests[1].state,'requested');
});

test('incident review rejects an out-of-scope decision before any repository write',async()=>{
  let writes=0;const service=new IncidentReviewService({repository:{snapshot:()=>({evidenceRequests:[]}),mutate:async()=>{writes+=1;}},auditService:{record:async()=>{}}});
  await assert.rejects(()=>service.review(authenticated(['PT-A']),'PT-B',{decision:'uncertain'}),error=>error.statusCode===403);
  assert.equal(writes,0);
});

test('global outcome and monitored-territory collections require wildcard scope',async()=>{
  const outcome=new OutcomeService({repository:{snapshot:()=>({interventions:[],hazards:[],evidencePackages:[],reobservations:[],evidenceRequests:[]})}}),narrow=authenticated(['PT-A']),global=authenticated(['*']);
  assert.throws(()=>outcome.snapshot(narrow),(error)=>error.statusCode===403&&error.message==='incident_scope_forbidden');assert.equal(outcome.snapshot(global).loops.length,0);
  const territory=new MonitoredTerritoryService({store:{listTerritories:async()=>[{id:'territory:global'}],listAssets:async()=>[{id:'asset:global'}]}});
  assert.throws(()=>territory.listTerritories(narrow),(error)=>error.statusCode===403);assert.throws(()=>territory.listAssets({},narrow),(error)=>error.statusCode===403);assert.equal((await territory.listTerritories(global))[0].id,'territory:global');assert.equal((await territory.listAssets({},global))[0].id,'asset:global');
  const routing=new MonitoredTerritoryService({operatorActorId:'operator:test',operatorConfigured:true,operatorIncidentScopes:['PT-A']});routing.registry={territory:{id:'territory:test'},actors:[]};const context={territories:[{id:'territory:test'}]};assert.equal(routing.recipients({territoryContext:context,eventId:'PT-B'}).length,0);assert.ok(routing.recipients({territoryContext:context,eventId:'event:PT-A'}).length>0);
});

test('public detection removes internal review and evidence identities while operator scope filters incidents',async()=>{
  const world={meta:{generatedAt:'2026-08-22T12:00:00Z',mode:'test'},sources:{fires:{state:'current'},firms:{state:'current'},weather:{state:'current'}},fires:[{id:'PT-A',coordinate:[-8,40],updatedAt:'2026-08-22T11:55:00Z'}],thermalDetections:[],weather:[]};
  const repository={snapshot:()=>({incidentDecisions:{'PT-A':{decision:'uncertain',note:'private note',actor:'private-reviewer',at:'2026-08-22T11:58:00Z'}},evidenceRequests:[{id:'request-a',targetId:'incident:PT-A',state:'accepted',evidencePackageId:'package-a'}],evidencePackages:[{id:'package-a',state:'accepted',observerId:'private-observer',note:'private evidence',capturedAt:'2026-08-22T11:57:00Z'}]})};
  const service=new DetectionService({worldService:{snapshot:async()=>world},repository,clock:()=>new Date('2026-08-22T12:00:00Z')});
  const publicIncident=(await service.snapshot({publicProjection:true})).incidents[0];
  assert.equal(publicIncident.truth.localReview,null);assert.equal(publicIncident.evidence.some((item)=>item.source==='operator-review'),false);
  const field=publicIncident.evidence.find((item)=>item.source==='accepted-field-evidence');assert.equal(field.payload,null);assert.equal(field.observedAt,null);assert.doesNotMatch(JSON.stringify(publicIncident),/private-reviewer|private-observer|private note|package-a/);
  assert.equal((await service.snapshot({actor:authenticated(['PT-B'])})).incidents.length,0);
});

test('FieldNode canonicalizes nested incident aliases and emits only scoped stream state',()=>{
  const store={task:()=>({incidentId:'PT-A'}),conflict:()=>null};
  assert.equal(resolveFieldRequestIncident({pathname:'/api/fieldnet/incidents/import',searchParams:new URLSearchParams(),input:{package:{incidentId:'PT-A'}},store}),'PT-A');
  assert.equal(resolveFieldRequestIncident({pathname:'/api/fieldnet/sensorthings/v1.1/observations',searchParams:new URLSearchParams(),input:{parameters:{incidentId:'PT-A'}},store}),'PT-A');
  assert.throws(()=>resolveFieldRequestIncident({pathname:'/api/fieldnet/tasks/task-1/mutations',searchParams:new URLSearchParams(),input:{changes:{incidentId:'PT-B'}},store}),/fieldnet_incident_identity_mismatch/);
  assert.equal(fieldEventVisible({type:'TASK_UPDATED',payload:{task:{incidentId:'PT-A'}}},'PT-A'),true);
  assert.equal(fieldEventVisible({type:'TASK_UPDATED',payload:{task:{incidentId:'PT-B'}}},'PT-A'),false);
  const health=publicFieldNodeHealth({releaseId:'release-test',now:new Date('2026-08-22T12:00:00Z')});assert.deepEqual(Object.keys(health).sort(),['generatedAt','ok','releaseId','service']);
  const scoped=scopedFieldNodeSnapshot({schemaVersion:'v1',nodeId:'node',connectionState:'FULL',centralUrlConfigured:true,releaseId:'release-test',releaseCompatibility:{state:'COMPATIBLE'},incidents:[{incidentId:'PT-A'},{incidentId:'PT-B'}],databasePath:'/private/db',generatedAt:'now'},'PT-A');
  assert.deepEqual(scoped.incidents,[{incidentId:'PT-A'}]);assert.equal('databasePath' in scoped,false);
});

test('task changes reject mass assignment and validate every mutable value',()=>{
  assert.throws(()=>sanitizeTaskChanges({incidentId:'PT-B',state:'COMPLETED'}),/immutable_task_field/);
  assert.throws(()=>sanitizeTaskChanges({priority:'urgent'}),/invalid_priority_class/);
  assert.throws(()=>sanitizeTaskChanges({priority:'P0_LIFE_SAFETY'}),/protected_task_priority_forbidden/);
  assert.throws(()=>sanitizeTaskChanges({priority:'P1_COMMAND'}),/protected_task_priority_forbidden/);
  assert.deepEqual(sanitizeTaskChanges({priority:'P2_POSITION'}),{priority:'P2_POSITION'});
  assert.deepEqual(sanitizeTaskChanges({state:'BLOCKED',owner:' operator-a ',dueAt:null}),{state:'BLOCKED',owner:'operator-a',dueAt:null});
});

test('visualization admission rejects browser cross-site work before quotas and partitions the trusted console lane',()=>{
  const crossSite={headers:{'sec-fetch-site':'cross-site'},socket:{remoteAddress:'127.0.0.1'}};
  assert.throws(()=>assertLocalVisualizationRequest(crossSite),error=>error.statusCode===403&&error.message==='local_visualization_cross_site_rejected');
  const trusted={headers:{'sec-fetch-site':'same-origin',origin:'http://127.0.0.1:4190','x-vigia-ui-proxy':'mission-dark-realdata-2.0'},socket:{remoteAddress:'127.0.0.1'}};
  assert.equal(visualizationClientKey(trusted,{actor:{id:'operator:test',authentication:{authenticated:true,mode:'local_shadow_session'}}}),'operator-console:operator:test');
  assert.equal(visualizationClientKey(trusted,{actor:{id:'operator:remote',authentication:{authenticated:true,mode:'environment_bearer'}}}),'operator-console:operator:remote');
  assert.throws(()=>visualizationClientKey(trusted),/local_visualization_session_required/);
  assert.throws(()=>visualizationClientKey({headers:{...trusted.headers,'x-vigia-ui-proxy':''},socket:trusted.socket},{actor:{id:'operator:test',authentication:{authenticated:true,mode:'local_shadow_session'}}}),/local_visualization_proxy_required/);
  assert.throws(()=>visualizationClientKey({headers:{},socket:{remoteAddress:'127.0.0.1'}}),/local_visualization_cross_site_rejected/);
  for(const route of ['/api/v2/observations/resolve','/api/v10/observations/change-screening','/api/v10/validation/measurement-debt'])assert.equal(policyForRoute('GET',route).localVisualization,true);
});

test('audit verification recomputes every record hash as well as checking links',async()=>{
  let state={audit:[]};const repository={snapshot:()=>structuredClone(state),mutate:async(work)=>{state=work(structuredClone(state));return structuredClone(state);}};
  const service=new AuditService({repository,clock:()=>new Date('2026-08-22T12:00:00Z')});
  await service.record({actor:{id:'operator:test',role:'supervisor'},type:'TEST',entityType:'event',entityId:'PT-A',payload:{decision:'accepted'}});
  assert.equal(service.verifyChain().valid,true);
  state.audit[0].payload.decision='tampered';
  assert.equal(service.verifyChain().valid,false);assert.equal(service.verifyChain().failedIndex,0);
});

test('central responses, update arrays and cursors fail closed at explicit bounds',async()=>{
  await assert.rejects(()=>readBoundedCentralJson(new Response(null,{headers:{'content-length':String(70_000)}}),{maxBytes:65_536}),/central_response_too_large/);
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"value":"'));controller.enqueue(new Uint8Array(1100));controller.enqueue(new TextEncoder().encode('"}'));controller.close();}});
  await assert.rejects(()=>readBoundedCentralJson(new Response(stream),{maxBytes:1024}),/central_response_too_large/);
  assert.throws(()=>validateCentralSyncPayload({acceptedMutationIds:[],updates:Array.from({length:501},()=>({}))}),/central_sync_updates_capacity_exceeded/);
  assert.equal(boundedSyncCursor('cursor:42'),'cursor:42');assert.throws(()=>boundedSyncCursor('../private'),/central_sync_cursor_invalid/);assert.throws(()=>boundedSyncCursor('x'.repeat(161)),/central_sync_cursor_invalid/);
});

test('command handoff requires wildcard scope and cache identity includes authorization state',()=>{
  const secret={incidentId:'PT-B',coordinate:[-8,40],ledgerActor:'operator-secret'},narrow=authenticated(['PT-A']),global=authenticated(['*']);
  assert.deepEqual(scopedOperationsHandoff(narrow,secret),{restricted:true,reason:'Global validation handoff requires wildcard incident scope.'});assert.equal(scopedOperationsHandoff(global,secret),secret);
  assert.notEqual(commandAuthorizationFingerprint(narrow),commandAuthorizationFingerprint({...narrow,incidentScopes:['*']}));
});

test('request gates bound concurrency and single-flight duplicate work',async()=>{
  let release;const blocked=new Promise((resolve)=>{release=resolve;}),gate=new RequestGate({maxConcurrent:2,maxConcurrentPerClient:1,maxRequestsPerWindow:2}),first=gate.run('client-a',()=>blocked);
  await assert.rejects(()=>gate.run('client-a',async()=>1),error=>error.statusCode===429);release('done');assert.equal(await first,'done');
  assert.equal(await gate.run('client-a',async()=>1),1);await assert.rejects(()=>gate.run('client-a',async()=>1),error=>error.statusCode===429);
  let calls=0;const flight=new SingleFlight();const [left,right]=await Promise.all([flight.run('same',async()=>{calls+=1;return 7;}),flight.run('same',async()=>{calls+=1;return 8;})]);assert.deepEqual([left,right],[7,7]);assert.equal(calls,1);
});

test('SSE admission is bounded per client and blocked writers are evicted',async()=>{
  class Response extends EventEmitter{write(){return false;}end(){this.emit('close');}destroy(){this.destroyed=true;this.emit('close');}}
  const hub=new SseHub({maxClients:2,maxPerClient:1,maxAgeMs:1_000,backpressureTimeoutMs:5}),first=new Response(),second=new Response();hub.add(first,{clientKey:'client-a'});
  assert.throws(()=>hub.add(second,{clientKey:'client-a'}),error=>error.statusCode===429);hub.publish('update',{ok:true});await new Promise((resolve)=>setTimeout(resolve,15));assert.equal(first.destroyed,true);assert.equal(hub.size,0);hub.close();
});

test('raw fetch limits streamed bodies before full buffering',async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(Uint8Array.from([1,2,3,4,5,6]));controller.enqueue(Uint8Array.from([7,8,9,10,11,12]));controller.close();}});
  await assert.rejects(()=>fetchRaw('https://provider.test/product',{maxBytes:8,fetchImpl:async()=>new Response(body,{status:200,headers:{'content-type':'application/octet-stream'}})}),/upstream_body_too_large/);
});

test('native acquisition paths enforce archive, memory, result, and subprocess ceilings',async()=>{
  const [python,node,runner,sentinelScript,viirsPython,viirsScript,mtgPython,acquisitionStore,httpAcquirer]=await Promise.all([readFile(new URL('../src/modules/world/sentinel3/parse_sentinel3_frp.py',import.meta.url),'utf8'),readFile(new URL('../src/modules/world/sentinel3/cdse-frp-acquirer.mjs',import.meta.url),'utf8'),readFile(new URL('../src/shared/bounded-json-process.mjs',import.meta.url),'utf8'),readFile(new URL('../../../scripts/acquire_sentinel3_physical_corpus.mjs',import.meta.url),'utf8'),readFile(new URL('../src/modules/world/viirs/evaluate_viirs_granule.py',import.meta.url),'utf8'),readFile(new URL('../../../scripts/acquire_viirs_small_fire_opportunity.mjs',import.meta.url),'utf8'),readFile(new URL('../src/modules/world/mtg/parse_mtg_frp.py',import.meta.url),'utf8'),readFile(new URL('../src/modules/acquisition/acquisition-store.mjs',import.meta.url),'utf8'),readFile(new URL('../src/modules/acquisition/http-acquirer.mjs',import.meta.url),'utf8')]);
  assert.match(python,/MAX_ARCHIVE_MEMBERS/);assert.match(python,/MAX_ARCHIVE_EXPANDED_BYTES/);assert.match(python,/MAX_COMPRESSION_RATIO/);assert.match(python,/MAX_DATASET_ELEMENTS/);assert.doesNotMatch(python,/extractall\(/);
  assert.match(python,/MAX_DETECTIONS/);assert.match(python,/RLIMIT_AS/);assert.match(node,/runBoundedJsonProcess/);assert.match(runner,/parser_timeout/);assert.match(runner,/parser_output_too_large/);assert.match(runner,/maxDetections/);
  assert.match(python,/supervisor_owned_extraction_directory_required/);assert.doesNotMatch(python,/tempfile\.mkdtemp|atexit\.register/);assert.match(node,/finally \{ await rm\(directory/);assert.match(runner,/forcedError/);
  assert.match(sentinelScript,/runBoundedJsonProcess/);assert.match(sentinelScript,/archive_checksum_mismatch/);assert.doesNotMatch(sentinelScript,/spawn\(/);
  assert.match(viirsPython,/MAX_GRID_ELEMENTS/);assert.match(viirsPython,/MAX_FIRE_PIXELS/);assert.match(viirsPython,/RLIMIT_AS/);assert.match(viirsScript,/assertTrustedEarthdataUrl/);assert.match(viirsScript,/runBoundedJsonProcess/);assert.doesNotMatch(viirsScript,/spawn\(/);
  assert.match(mtgPython,/RLIMIT_AS/);assert.match(mtgPython,/MAX_DATASET_BYTES/);assert.match(mtgPython,/MAX_DECODED_BYTES/);assert.match(mtgPython,/unsafe_dataset_dtype/);
  assert.match(acquisitionStore,/maxArchiveBytes/);assert.match(acquisitionStore,/maxRejectedBytes/);assert.match(acquisitionStore,/raw_archive_byte_capacity_reached/);assert.ok(httpAcquirer.indexOf('if(!raw.ok)')<httpAcquirer.indexOf('archiveReceivedProduct'));
});

test('FieldNode HTTP admission, storage and response work have explicit ceilings',async()=>{
  const [server,httpHelpers,store,retention,capacity,service,gateway,bounded]=await Promise.all([readFile(new URL('../../field-node/src/server.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/http-helpers.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/sqlite-store.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/mutation-retention.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/sqlite-capacity.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/service.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/sensor-gateway.mjs',import.meta.url),'utf8'),readFile(new URL('../../field-node/src/bounded-central-response.mjs',import.meta.url),'utf8')]);
  assert.match(server,/preAuthGate\.run\(gateKey,\(\)=>requestVerifier\.verifyEnvelope/);assert.match(server,/principalRequestGate\.run\(actor\(request\)/);assert.ok(server.indexOf('verifyEnvelope')<server.indexOf("request.method==='POST'?await body"));assert.match(server,/maxRequestsPerWindow:Number\.MAX_SAFE_INTEGER/);assert.match(server,/target\.maxConnections/);assert.match(server,/target\.headersTimeout/);assert.match(server,/target\.maxRequestsPerSocket/);assert.match(server,/FIELDNET_CONTROL_SOCKET/);assert.match(server,/fieldnet_protected_control_socket_required_at_startup/);assert.match(server,/publicOnly/);assert.match(server,/chmodSync\(controlSocketPath,0o600\)/);assert.match(server,/FIELDNET_BODY_TIMEOUT_MS/);assert.match(server,/FIELDNET_MAX_RESPONSE_BYTES/);assert.match(server,/createFieldNodeJsonResponder/);assert.match(httpHelpers,/fieldnet_response_capacity_exceeded/);assert.match(store,/maxDatabaseBytes/);assert.match(store,/storageReserveBytes/);assert.match(store,/protectedWrite:reserveEligible/);assert.match(store,/isLifeSafetyIncidentCommandType/);assert.doesNotMatch(store,/protectedWrite:true/);const mutateBlock=store.slice(store.indexOf('mutateTask('),store.indexOf('addAnnotation('));assert.doesNotMatch(mutateBlock,/protectedWrite:true/);assert.match(store,/maxRetainedMutations/);assert.match(store,/priorityMutationReserve/);assert.match(store,/mutation_compaction_checkpoint/);assert.match(store,/compactAcknowledgedMutations/);assert.match(retention,/protectedRetention/);assert.match(retention,/m2\.priority IN \('P0_LIFE_SAFETY','P1_COMMAND'\)/);assert.match(retention,/previousHash/);assert.match(retention,/mutation_compaction_checkpoint/);assert.match(capacity,/wal_checkpoint\(TRUNCATE\)/);assert.match(capacity,/sqliteWriteLimit/);assert.match(capacity,/sqliteLogicalBytes/);assert.match(capacity,/transactionReserveBytes/);assert.match(store,/#boundedPayloadRows/);assert.match(capacity,/field_storage_capacity_reached/);assert.match(store,/field_retained_mutation_capacity_reached/);assert.match(service,/CENTRAL_SYNC_MAX_BYTES/);assert.doesNotMatch(service,/response\.json\(/);assert.match(bounded,/central_response_too_large/);assert.match(bounded,/central_sync_updates_capacity_exceeded/);assert.match(service,/\['P2_POSITION','P3_TASK','P4_TELEMETRY','P5_THUMBNAIL','P6_BULK_MEDIA'\]/);assert.match(gateway,/field_sensor_websocket_bounded_transport_required/);assert.match(gateway,/field_sensor_websocket_setup_timeout/);
});
