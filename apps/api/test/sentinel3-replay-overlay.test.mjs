import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sentinel3ReplayOverlay } from '../src/modules/replay/sentinel3-replay-overlay.mjs';
import { ReplayService } from '../src/modules/replay/replay-service.mjs';

const rawId='raw:copernicus:s3:abc',at='2024-09-17T11:30:00Z';
const product={id:rawId,sourceId:'sentinel3:ntc:sentinel-3a',provider:'copernicus-data-space',providerProductId:'S3A:product',requestWindow:{collection:'sentinel-3-sl-2-frp-ntc'},requestedAt:'2026-08-12T10:00:00Z',receivedAt:'2026-08-12T10:01:00Z',sourceTimestamp:at,contentType:'application/zip',byteLength:42,checksumSha256:'a'.repeat(64),originalUri:'https://stac.test/item',originalUriOrObjectKey:'received/s3.raw',httpStatus:200,acquisitionRunId:'run-1',parserVersion:'parser-v3',normalizerVersion:'normalizer-v3',licenceMetadata:{provider:'CDSE'},parsedAt:'2026-08-12T10:01:01Z'};
const point={id:'s3:point:1',coordinate:[-8,40],observedAt:at,receivedAt:product.receivedAt,frpMw:20,frpUncertaintyMw:2,satellite:'Sentinel-3A',instrument:'SLSTR',source:'Copernicus Sentinel-3 SLSTR L2 FRP',sourceKey:'S3_SLSTR_FRP',sourceFamily:'sentinel3_slstr',independenceGroup:'sentinel_3a_slstr',qualityFlags:[],rawSourceProductId:rawId,provenance:{rawSourceProductId:rawId,checksumSha256:product.checksumSha256,normalizerVersion:'normalizer-v3',synthetic:false}};
const caseRow={id:'PT-2024-CASE',officialReportId:'1',evaluationSplit:'held_out',municipality:'Test',coordinate:[-8,40],alertAt:'2024-09-17T12:00:00Z',extinctionAt:'2024-09-17T18:00:00Z',physicalFirst:true,physicalLeadMinutes:60,thermalObservationCount:1,independentPlatforms:['VIIRS S-NPP']};
const snapshot={data:[point,{...point,id:'s3:point:far',coordinate:[-9.5,42]}],state:{selectionMode:'governed_window',catalogueWindow:{collection:'sentinel-3-sl-2-frp-ntc'},rawSourceProductIds:[rawId]}};

test('historical Sentinel-3 overlay assigns by governed space-time rules and preserves unassigned truth',()=>{
  const corpus={metadata:{id:'official',evidenceClass:'official_archival_evidence',countryCode:'PT'},cases:[caseRow],records:[]},result=sentinel3ReplayOverlay({corpus,snapshot,acquisitionStore:{getProduct:()=>product}});
  assert.equal(result.summary.observationCount,2);assert.equal(result.summary.assignedObservationCount,1);assert.equal(result.summary.unassignedObservationCount,1);
  assert.equal(result.corpus.cases[0].twoPhysicalFamilies,true);assert.deepEqual(result.corpus.cases[0].physicalSourceFamilies,['viirs','sentinel3_slstr']);
  assert.equal(result.corpus.records.filter((item)=>item.caseId===caseRow.id).length,1);assert.equal(result.corpus.records.find((item)=>item.caseId===null).payload.replayCaseId,null);
});

test('historical Sentinel-3 replay commits product, two-family event and checkpoint before publication',async(t)=>{
  const tempRoot=path.resolve('.tmp/test');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'vigia-replay-s3-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const thermal={id:'viirs:1',caseId:caseRow.id,kind:'thermal',arrivalAt:'2024-09-17T11:00:00Z',payload:{id:'viirs:1',replayCaseId:caseRow.id,coordinate:[-8,40],observedAt:'2024-09-17T11:00:00Z',satellite:'VIIRS S-NPP',instrument:'VIIRS',sourceFamily:'viirs',independenceGroup:'viirs_s_npp',frpMw:10,hotspotType:0,provenance:{synthetic:false,rawSourceProductId:'raw:viirs',checksumSha256:'b'.repeat(64)}}};
  const report={id:'report:1',caseId:caseRow.id,kind:'report',arrivalAt:caseRow.alertAt,payload:{id:'1',replayCaseId:caseRow.id,coordinate:[-8,40],municipality:'Test',status:'historical_official_record',startedAt:caseRow.alertAt,provenance:{synthetic:false,provider:'ICNF',rawSourceProductId:'raw:report',checksumSha256:'c'.repeat(64)}}};
  const corpus={metadata:{id:'official',evidenceClass:'official_archival_evidence',countryCode:'PT',sourceManifest:'manifest.json',controlledClock:true},cases:[caseRow],records:[thermal,report]},manifest={products:[{id:'raw:viirs',provider:'NASA',kind:'thermal',checksumSha256:'b'.repeat(64)},{id:'raw:report',provider:'ICNF',kind:'report',checksumSha256:'c'.repeat(64)}],limitations:[]},benchmark={generatedAt:'2024-01-01T00:00:00Z',softwareReplay:{futureEvidenceViolations:0},validation:{metrics:{cases:[],unmeasured:[]}}};
  const files={corpusFile:path.join(directory,'corpus.json'),sourceManifestFile:path.join(directory,'manifest.json'),benchmarkFile:path.join(directory,'benchmark.json')};await Promise.all([writeFile(files.corpusFile,JSON.stringify(corpus)),writeFile(files.sourceManifestFile,JSON.stringify(manifest)),writeFile(files.benchmarkFile,JSON.stringify(benchmark))]);
  let committed=null,marked=null;const acquisitionStore={getProduct:()=>product,getCheckpoint:()=>({sourceId:product.sourceId,lastSuccessfulPollAt:product.receivedAt}),markProductsIngested:async(ids)=>marked=ids};
  const physicalTruthStore={status:()=>({configured:true,state:'ready'}),commitSnapshot:async(value)=>committed=value};
  const service=new ReplayService({...files,sentinel3FrpGateway:{historicalReplayConfigured:()=>true,snapshot:async()=>({...snapshot,data:[point]})},acquisitionStore,physicalTruthStore});const overview=await service.initialize(),detail=await service.caseDetail(caseRow.id);
  assert.equal(overview.sentinel3Overlay.persistenceState,'committed');assert.equal(committed.products[0].id,rawId);assert.deepEqual(marked,[rawId]);
  const event=committed.events.find((item)=>item.observations.some((row)=>row.sourceFamily==='sentinel3_slstr'));assert.deepEqual([...new Set(event.observations.filter((row)=>row.type==='thermal').map((row)=>row.sourceFamily))].sort(),['sentinel3_slstr','viirs']);
  assert.equal(detail.evidence.filter((item)=>item.sourceFamily==='sentinel3_slstr').length,1);assert.equal(detail.controlledClock.futureEvidenceViolations,0);
});
