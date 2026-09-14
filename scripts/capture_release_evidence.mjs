#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { evidenceOperationEffectiveness } from '../apps/api/src/modules/mission/ground-truth-service.mjs';

const root=path.resolve(import.meta.dirname,'..');
const baseUrl=String(process.env.VIGIA_BASE_URL||'http://127.0.0.1:4177').replace(/\/$/,'');
const databaseUrl=String(process.env.VIGIA_DATABASE_URL||'');
const outputFile=path.resolve(process.env.VIGIA_RELEASE_EVIDENCE_OUTPUT||path.join(root,'data/validation/release/vigia-category-leadership-evidence.json'));
const stateFile=path.resolve(process.env.VIGIA_STATE_FILE||path.join(root,'data/runtime/production-v1.json'));
const acquisitionStateFile=path.resolve(process.env.VIGIA_ACQUISITION_STATE_FILE||path.join(root,'data/runtime/acquisition-state.json'));
const rawArchiveDir=path.resolve(process.env.VIGIA_RAW_ARCHIVE_DIR||path.join(root,'data/runtime/raw-source-products'));
if(!databaseUrl)throw new Error('VIGIA_DATABASE_URL is required. The release evidence must be bound to the physical-truth database.');

async function request(route){const response=await fetch(`${baseUrl}${route}`,{headers:{accept:'application/json'}});const payload=await response.json();if(!response.ok&&route!=='/api/v10/ready')throw new Error(`${route} HTTP ${response.status}`);return payload;}
function sha(value){return`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;}
function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trimEnd();}
function repositoryState(){
  const exclude=':(exclude)data/validation/release/vigia-category-leadership-evidence.json';
  const commit=git(['rev-parse','HEAD']).trim(),status=git(['status','--short','--','.',exclude]),patch=git(['diff','--binary','HEAD','--','.',exclude]);
  const untracked=git(['ls-files','--others','--exclude-standard','--','.',exclude]),untrackedFileHashes=Object.fromEntries((untracked?untracked.split('\n'):[]).map((file)=>[file,`sha256:${createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')}`]));
  return {commit,clean:!status,changedPaths:status?status.split('\n').map((line)=>line.slice(3)):[],untrackedFileHashes,codeStateHash:sha({patch,untrackedFileHashes})};
}
async function fileJson(relative){return JSON.parse(await readFile(path.join(root,relative),'utf8'));}

const [bootstrap,live,territory,readiness,replay,campaign,detectionBenchmark,sentinel3Search,referenceManifest,v3Confirmatory,smallFireOpportunity,sentinel3Manifest,preventionReview,operatorState,acquisitionState]=await Promise.all([
  request('/api/v2/bootstrap'),request('/api/v10/events'),request('/api/v10/territory'),request('/api/v10/ready'),request('/api/v10/replay'),fileJson('data/validation/prevention/portugal-sentinel2-campaign-v1.json'),fileJson('data/validation/detection/portugal-2024-area-time-benchmark.json'),fileJson('data/validation/detection/sentinel3-portugal-2024-search.json'),fileJson('data/replay/raw/ptdata/fires-2024-all/manifest.json'),fileJson('data/validation/detection/portugal-2024-v3-confirmatory-benchmark.json'),fileJson('data/validation/detection/portugal-2024-small-fire-opportunity.json'),fileJson('data/validation/detection/sentinel3-portugal-2024-product-manifest.json'),fileJson('data/validation/prevention/portugal-sentinel2-review-corpus-v2.json'),readFile(stateFile,'utf8').then(JSON.parse),readFile(acquisitionStateFile,'utf8').then(JSON.parse)
]);
const sentinel3Products=Object.values(acquisitionState.products??{}).filter((item)=>String(item.sourceId??'').startsWith('sentinel3:')).sort((a,b)=>Date.parse(b.sourceTimestamp??b.receivedAt)-Date.parse(a.sourceTimestamp??a.receivedAt));
const sentinel3Product=sentinel3Products[0]??null;
let sentinel3ParseProof=null;
if(sentinel3Product?.originalUriOrObjectKey){const rawPath=path.resolve(rawArchiveDir,sentinel3Product.originalUriOrObjectKey),body=readFileSync(rawPath),calculated=createHash('sha256').update(body).digest('hex'),parser=path.join(root,'apps/api/src/modules/world/sentinel3/parse_sentinel3_frp.py'),python=path.join(root,'.venv/bin/python');const parsed=JSON.parse(execFileSync(python,[parser,rawPath],{encoding:'utf8'}));sentinel3ParseProof={providerProductId:sentinel3Product.providerProductId,sourceId:sentinel3Product.sourceId,rawPath:path.relative(root,rawPath),byteLength:body.length,recordedSha256:sentinel3Product.checksumSha256,calculatedSha256:calculated,checksumMatches:calculated===sentinel3Product.checksumSha256,parserVersion:sentinel3Product.parserVersion,normalizerVersion:sentinel3Product.normalizerVersion,sourceTimestamp:sentinel3Product.sourceTimestamp,receivedAt:sentinel3Product.receivedAt,httpStatus:sentinel3Product.httpStatus,sourceRecordCount:parsed.sourceRecordCount,aoiObservationCount:parsed.aoiObservationCount,positiveFrpRecordCount:parsed.positiveFrpRecordCount,observationConclusion:parsed.observationConclusion,canonicalObservations:parsed.detections?.length??0};}
const client=new pg.Client({connectionString:databaseUrl,application_name:'vigia-release-evidence'});await client.connect();
let database;
try{
  const {rows}=await client.query(`SELECT
    (SELECT count(*)::int FROM raw_source_product) raw_products,
    (SELECT count(*)::int FROM raw_source_product WHERE source_id LIKE 'firms:%') firms_products,
    (SELECT count(*)::int FROM raw_source_product WHERE source_id LIKE 'sentinel3:%') sentinel3_products,
    (SELECT count(*)::int FROM physical_observation) physical_observations,
    (SELECT count(*)::int FROM physical_observation WHERE source_family='viirs') viirs_observations,
    (SELECT count(*)::int FROM physical_observation WHERE source_family='sentinel3_slstr') sentinel3_observations,
    (SELECT count(*)::int FROM (SELECT eo.event_id FROM event_observation eo JOIN physical_observation po ON po.id=eo.observation_id GROUP BY eo.event_id HAVING count(DISTINCT po.source_family)>=2) family_events) two_physical_family_events,
    (SELECT count(*)::int FROM physical_observation WHERE provenance->>'synthetic'='true') synthetic_observations,
    (SELECT count(*)::int FROM fire_event) fire_events,
    (SELECT count(*)::int FROM detector_run) detector_runs,
    (SELECT count(*)::int FROM prevention_finding) prevention_findings,
    (SELECT count(*)::int FROM prevention_finding_review) prevention_reviews,
    (SELECT count(*)::int FROM evidence_need) evidence_needs,
    (SELECT count(*)::int FROM evidence_request) evidence_requests,
    PostGIS_Version() postgis_version`);
  const {rows:products}=await client.query(`SELECT source_id,provider_product_id,checksum_sha256,processing_state,source_timestamp FROM raw_source_product WHERE source_id LIKE 'firms:%' ORDER BY source_timestamp DESC LIMIT 6`);
  const {rows:sentinel3Products}=await client.query(`SELECT source_id,provider_product_id,checksum_sha256,processing_state,source_timestamp FROM raw_source_product WHERE source_id LIKE 'sentinel3:%' ORDER BY source_timestamp DESC LIMIT 6`);
  const {rows:families}=await client.query(`SELECT source,source_family,independence_group,count(*)::int observation_count,max(sensed_at) latest_observation FROM physical_observation WHERE provenance->>'synthetic' IS DISTINCT FROM 'true' GROUP BY source,source_family,independence_group ORDER BY observation_count DESC`);
  database={...rows[0],firmsProducts:products.map((item)=>({...item,source_timestamp:item.source_timestamp?.toISOString?.()??item.source_timestamp})),sentinel3Products:sentinel3Products.map((item)=>({...item,source_timestamp:item.source_timestamp?.toISOString?.()??item.source_timestamp})),physicalFamilies:families.map((item)=>({...item,latest_observation:item.latest_observation?.toISOString?.()??item.latest_observation}))};
}finally{await client.end();}

const benchmark=replay.benchmark?.validation?.metrics??{};
const heldOut=benchmark.splitMetrics?.held_out??null;
const physicalFirst=(live.events??[]).filter((item)=>item.leadTime?.thermalBeforeReport).map((item)=>({id:item.id,label:item.label,leadMinutes:item.leadTime.minutes,firstPhysicalAt:item.leadTime.firstThermalAt,firstReportAt:item.leadTime.firstReportAt,evidenceState:item.evidenceState}));
const prospectiveDetectionTimings=(live.events??[]).filter((item)=>item.prospectiveDetectionTiming?.providerObservationAt).map((item)=>({id:item.id,label:item.label,...item.prospectiveDetectionTiming}));
const repository=repositoryState();
const artifact={
  schema:'vigia.category-leadership-release-evidence.v1',generatedAt:new Date().toISOString(),repositoryCommit:repository.commit,repository,runtime:{endpoint:'local-vigia-runtime',universe:bootstrap.meta?.universe,features:bootstrap.meta?.features,region:bootstrap.meta?.region},
  integrity:{syntheticObservations:database.synthetic_observations,eventObservationInventory:(readiness.checks??[]).find((item)=>item.id==='production_synthetic_observations')?.evidence??null,demoIdentities:(readiness.checks??[]).find((item)=>item.id==='demo_identities')?.evidence?.count??null,auditChain:(readiness.checks??[]).find((item)=>item.id==='audit_chain')?.evidence??null,postgis:{state:(readiness.checks??[]).find((item)=>item.id==='postgres_physical_truth')?.state,version:database.postgis_version}},
  physicalTruth:{database,liveSummary:live.summary,physicalEvidenceEvents:(live.events??[]).filter((item)=>(item.fireEvidenceState?.physicalEvidence??[]).length).length,physicalFirstEvents:physicalFirst,prospectiveDetectionTimings,sentinel3ParseProof},
  detectionBenchmark:{schema:detectionBenchmark.schema,datasetHash:detectionBenchmark.datasetHash,evidenceHash:detectionBenchmark.evidenceHash,generatedAt:detectionBenchmark.generatedAt,samplingUnit:detectionBenchmark.samplingUnit,classInventory:detectionBenchmark.classInventory,referenceIndependence:detectionBenchmark.referenceIndependence,policyLock:detectionBenchmark.policyLock,headline:detectionBenchmark.headline,v1:detectionBenchmark.v1,v2Candidate:detectionBenchmark.v2Candidate,smallFireResults:detectionBenchmark.smallFireResults,observationOpportunity:detectionBenchmark.observationOpportunity,latency:detectionBenchmark.latency,sourceSpecific:detectionBenchmark.sourceSpecific,errorExplorer:detectionBenchmark.errorExplorer,regressionReference:detectionBenchmark.regressionReference,governedInputs:{referenceManifest:{schema:referenceManifest.schema,upstreamAuthority:referenceManifest.upstreamAuthority,selection:referenceManifest.selection,providerRows:referenceManifest.providerRows,uniqueRecords:referenceManifest.uniqueRecords,duplicateRows:referenceManifest.duplicateRows,duplicatePolicy:referenceManifest.duplicatePolicy,pages:referenceManifest.pages?.length??0},sentinel3Search:{schema:sentinel3Search.schema,generatedAt:sentinel3Search.generatedAt,selectionPolicy:sentinel3Search.selectionPolicy,credentialInheritance:sentinel3Search.credentialInheritance,searchSummary:sentinel3Search.searchSummary,releaseGate:sentinel3Search.releaseGate}},qualification:{referenceLabelIsolation:detectionBenchmark.referenceIndependence??null,operationalLandscapePrecision:'STRATIFIED_AREA_TIME_REFERENCE_WINDOWS_NOT_POPULATION_WEIGHTED_TERRITORIAL_RATE',smallFireRecall:'MEASURED_ONLY_CONDITIONAL_ON_MATCHED_VIIRS_OBSERVATION',sensorCoverage:'UNMEASURED_NO_COMPLETE_SENSOR_COVERAGE_PRODUCT',sentinel3:'UNMEASURED_NO_ELIGIBLE_POSITIVE_OR_NEGATIVE_CASES',twoFamily:'UNMEASURED_NO_TWO_FAMILY_DETECTION_CASES'}},
  capabilityEscalation:{detectorV3:{schema:v3Confirmatory.schema,cohort:v3Confirmatory.cohort,metrics:v3Confirmatory.v3,falsePositiveTaxonomy:v3Confirmatory.falsePositiveTaxonomy,falseNegativeTaxonomy:v3Confirmatory.falseNegativeTaxonomy,errorCount:v3Confirmatory.errorExplorer?.length??0,evidenceHash:v3Confirmatory.evidenceHash},smallFireOpportunity:{schema:smallFireOpportunity.schema,population:smallFireOpportunity.population,results:smallFireOpportunity.results,failureTaxonomy:smallFireOpportunity.failureTaxonomy,evidenceHash:smallFireOpportunity.evidenceHash},sentinel3ProductManifest:{schema:sentinel3Manifest.schema,summary:sentinel3Manifest.summary,providerBlocker:sentinel3Manifest.providerBlocker,evidenceHash:sentinel3Manifest.evidenceHash},preventionReview:{schema:preventionReview.schema,inventory:preventionReview.inventory,measuredQuality:preventionReview.measuredQuality,failureTaxonomy:preventionReview.failureTaxonomy,evidenceHash:preventionReview.evidenceHash}},
  prevention:{campaign:{campaignId:campaign.campaignId,datasetHash:campaign.dataset?.datasetHash,evidenceInputHash:campaign.reproducibility?.evidenceInputHash,generatedAt:campaign.generatedAt,summary:campaign.summary,integrity:campaign.integrity},runtime:{findings:bootstrap.prevention?.findings?.length??0,detectorRuns:bootstrap.prevention?.detectorRuns?.length??0,validation:bootstrap.prevention?.validation??null}},
  heldOut:{state:replay.benchmark?.validation?.state,corpusId:replay.corpus?.id,controlledClock:replay.corpus?.controlledClock,cases:heldOut?.caseCount??null,observationAssociationAccuracy:heldOut?.observationLevelAssociationAccuracy??null,reportJoinAccuracy:heldOut?.reportJoinAccuracy??null,ambiguityRate:heldOut?.ambiguityRate??null,fragmentationRate:heldOut?.fragmentationRate??null,falseMergeRate:heldOut?.falseMergeRate??null,futureEvidenceViolations:replay.benchmark?.softwareReplay?.futureEvidenceViolations??null,sentinel3Overlay:replay.sentinel3Overlay??null},
  territory:{summary:territory.summary,signalCount:territory.signals?.length??0},
  action:{effectiveness:evidenceOperationEffectiveness(operatorState)},
  sources:{states:Object.fromEntries(Object.entries(live.sources??{}).map(([id,value])=>[id,value?.state??null])),details:{firms:{state:live.sources?.firms?.state??null,accepted:live.sources?.firms?.accepted??null,latestSourceObservation:live.sources?.firms?.latestSourceObservation??live.sources?.firms?.upstreamAt??null,rawSourceProductIds:live.sources?.firms?.rawSourceProductIds??[]},sentinel3:{state:live.sources?.sentinel3Pixels?.state??null,accessClassification:live.sources?.sentinel3Pixels?.accessClassification??null,authenticationState:live.sources?.sentinel3Pixels?.authenticationState??null,cataloguedProducts:live.sources?.sentinel3Pixels?.cataloguedProducts??null,latestCatalogProduct:live.sources?.sentinel3Pixels?.latestCatalogProduct??null,accepted:live.sources?.sentinel3Pixels?.accepted??null,rawSourceProductIds:live.sources?.sentinel3Pixels?.rawSourceProductIds??[]}},externalBlockers:(readiness.checks??[]).filter((item)=>item.blocking&&!item.ok).map((item)=>({id:item.id,state:item.state,evidence:item.evidence}))},
  claims:{productionReady:false,operationallyValidated:false,reason:'The real VIIRS loop and label-isolated governed benchmark are implemented. Full sensor recall and population-weighted territorial false-alert rate remain unmeasured; positive Sentinel-3 and two-family detection evidence are absent.'}
};
artifact.evidenceHash=sha(artifact);
await mkdir(path.dirname(outputFile),{recursive:true});await writeFile(outputFile,`${JSON.stringify(artifact,null,2)}\n`);
console.log(JSON.stringify({state:'captured',outputFile,evidenceHash:artifact.evidenceHash,repositoryCommit:artifact.repositoryCommit,repositoryClean:artifact.repository.clean,codeStateHash:artifact.repository.codeStateHash,syntheticObservations:database.synthetic_observations,liveEvents:live.events?.length??0,physicalFirstEvents:physicalFirst.length,readiness:readiness.status},null,2));
