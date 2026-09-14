import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { LivePhysicalIntelligenceService, traceDiagnostics } from '../src/modules/world/live-physical-intelligence-service.mjs';

test('prospective trace completeness requires the durable physical-truth and association clocks',()=>{
  const complete={id:'complete',prospectiveDetectionTiming:{providerObservationAt:'2026-08-13T11:59:00Z',vigiaAcquiredAt:'2026-08-13T12:00:00Z',vigiaParsedAt:'2026-08-13T12:00:01Z',vigiaRawProductIngestedAt:'2026-08-13T12:00:02Z',observationPersistedAt:'2026-08-13T12:00:02Z',associationCompletedAt:'2026-08-13T12:00:03Z',candidateDecisionAt:'2026-08-13T12:00:03Z',eventCreatedAt:'2026-08-13T12:00:03Z',apiAvailableAt:'2026-08-13T12:00:04Z',uiFirstSeenAt:'2026-08-13T12:00:05Z'}},partial={id:'partial',prospectiveDetectionTiming:{...complete.prospectiveDetectionTiming,vigiaRawProductIngestedAt:null,uiFirstSeenAt:null}};
  const result=traceDiagnostics([complete,partial],'2026-08-13T12:01:00Z');
  assert.equal(result.traceCount,2);assert.equal(result.serverComplete,1);assert.equal(result.complete,1);assert.equal(result.serverCompletionPercent,50);assert.deepEqual(result.gaps.vigiaRawProductIngestedAt,['partial']);assert.match(result.qualification,/PostGIS physical-truth/);
});

test('shadow cycle records isolated source health, product deltas and VIGIA latency',async(t)=>{
  const root=path.resolve('.tmp/test');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'vigia-live-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const products=[],acquisitionStore={products:()=>structuredClone(products),status:()=>({checkpoints:[{sourceId:'firms:VIIRS_NOAA20_NRT',cursor:'2026-08-13T11:55:00Z'},{sourceId:'sentinel3:nrt:sentinel-3a',cursor:'2026-08-13T11:50:00Z'}]})};
  const worldService={refresh:async()=>{products.push({id:'raw:new'});return{changed:true,snapshot:{sources:{}}};}};
  const event={physicalState:{freshness:'current'},physicalSourceProfile:{observationCount:2},associationDecisions:[],observations:[{vigiaObservationPersistedAt:'2026-08-13T12:00:00Z'}],prospectiveDetectionTiming:{associationCompletedAt:'2026-08-13T12:00:00Z',latencyMs:{download:40,parse:12,canonicalization:2,association:3,postgis:8,sourceProductToEvent:85,vigiaProcessing:65}}};
  const operationalEventService={snapshot:async()=>({sources:{firms:{configured:true,state:'current',feeds:['a','b','c'],healthyFeeds:['a','b','c'],upstreamAt:'2026-08-13T11:55:00Z',fetchedAt:'2026-08-13T12:00:00Z',accepted:1},sentinel3Pixels:{configured:true,authenticated:true,state:'current',cataloguedProducts:1,acquiredProducts:1,latestPhysicalObservation:'2026-08-13T11:50:00Z',fetchedAt:'2026-08-13T12:00:00Z',accepted:1}},summary:{currentPhysicalEvents:1,currentPhysicalCandidates:1,currentMultisourcePhysicalEvents:1},events:[event]})};
  let postgisChecks=0;const physicalTruthStore={status:()=>postgisChecks++?{lastCommitAt:'2026-08-13T12:00:00Z',lastCommit:{products:1}}:{lastCommitAt:null}};
  const service=new LivePhysicalIntelligenceService({filePath:path.join(directory,'live.json'),worldService,operationalEventService,acquisitionStore,physicalTruthStore,clock:()=>new Date('2026-08-13T12:00:00Z')});await service.initialize();const result=await service.cycle({reason:'test'}),status=result.status;
  assert.equal(status.lastCycle.sourceProductsPolled,4);assert.equal(status.lastCycle.productsSuccessfullyAcquired,4);assert.equal(status.lastCycle.newUniqueProducts,1);assert.equal(status.lastCycle.duplicates,3);assert.equal(status.current.multisourcePhysicalEvents,1);assert.equal(status.sources.sentinel3.authenticated,true);assert.equal(status.latency.vigiaProcessing.medianMs,65);
  assert.equal(status.lastCycle.productsPersistedToPostgis,1);assert.equal(status.cumulative.productsPersistedToPostgis,1);
});

test('shadow cycle retains the direct Sentinel-3 provider result when the event projection omits source state',async(t)=>{
  const root=path.resolve('.tmp/test');await mkdir(root,{recursive:true});const directory=await mkdtemp(path.join(root,'vigia-live-s3-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const acquisitionStore={products:()=>[],status:()=>({checkpoints:[]})},providerState={configured:true,authenticated:true,state:'current',fetchedAt:'2026-08-13T12:00:00Z',latestSuccessAt:'2026-08-13T12:00:00Z',latestPhysicalObservation:'2026-08-13T11:50:00Z',cumulativeAcceptedObservations:2};
  const service=new LivePhysicalIntelligenceService({filePath:path.join(directory,'live.json'),worldService:{refresh:async()=>({changed:false,snapshot:{sources:{}}})},operationalEventService:{snapshot:async()=>({sources:{},summary:{},events:[]})},acquisitionStore,sentinel3FrpGateway:{snapshot:async()=>({data:[],state:providerState})},clock:()=>new Date('2026-08-13T12:00:00Z')});
  const {status}=await service.cycle({reason:'scheduled'});
  assert.equal(status.sources.sentinel3.state,'current');assert.equal(status.sources.sentinel3.authenticated,true);assert.equal(status.sources.sentinel3.acceptedObservations,2);assert.equal(status.sources.sentinel3.latestPhysicalObservation,'2026-08-13T11:50:00Z');
});
