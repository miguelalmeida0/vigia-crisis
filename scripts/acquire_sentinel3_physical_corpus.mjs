#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcquisitionStore } from '../apps/api/src/modules/acquisition/acquisition-store.mjs';
import { PostgresPhysicalTruthStore } from '../apps/api/src/modules/storage/postgres-physical-truth-store.mjs';
import { CdseFrpAcquirer, CDSE_FRP_NTC_COLLECTION } from '../apps/api/src/modules/world/sentinel3/cdse-frp-acquirer.mjs';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import { buildFireEvents } from '../packages/domain/src/fire-event-tracker.mjs';
import { runBoundedJsonProcess } from '../apps/api/src/shared/bounded-json-process.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const physicalDirectory=path.join(root,'data/validation/physical-sensing');
const rawDirectory=path.join(physicalDirectory,'raw');
const statePath=path.join(physicalDirectory,'acquisition-state.json');
const manifestPath=path.join(root,'data/validation/detection/sentinel3-portugal-2024-product-manifest.json');
const corpusPath=path.join(root,'data/validation/detection/portugal-2024-active-fire-corpus.json');
const viirsPath=path.join(physicalDirectory,'viirs-small-fire-opportunity.json');
const outputPath=path.join(physicalDirectory,'sentinel3-physical-corpus.json');
const handoffPath=path.join(physicalDirectory,'gold-specialist-handoff.json');
const parserPath=path.join(root,'apps/api/src/modules/world/sentinel3/parse_sentinel3_frp.py');
const config=loadConfig();
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const wait=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
const ratio=(numerator,denominator)=>denominator?Number((numerator/denominator).toFixed(4)):null;

async function parseNative(file){
  const tempRoot=path.join(root,'.tmp','physical-sensing','sentinel3-corpus-parser');await mkdir(tempRoot,{recursive:true});const directory=await mkdtemp(path.join(tempRoot,'parse-')),extractionDir=path.join(directory,'expanded');
  try{await mkdir(extractionDir);const value=await runBoundedJsonProcess({command:config.geoPython,args:[parserPath,file,extractionDir],filePath:file,timeoutMs:30_000,maxFileBytes:50*1024*1024,maxOutputBytes:2*1024*1024,maxErrorBytes:128*1024,maxDetections:100_000});if(!value.ok)throw new Error(value.error??'sentinel3_parser_failed');return value;}
  finally{await rm(directory,{recursive:true,force:true});}
}

async function retry(operation,{attempts=6,label='operation'}={}){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt+=1){
    try{return await operation(attempt);}catch(error){
      lastError=error;const message=String(error?.message??error),transient=error?.name==='AbortError'||/upstream_http_(429|5\d\d)|fetch|timeout|ECONN|EAI_AGAIN|socket|terminated/i.test(message);
      if(!transient||attempt===attempts-1)throw error;
      await wait(Math.min(15_000,750*2**attempt));
    }
  }
  throw new Error(`${label}_failed:${lastError?.message??lastError}`);
}

async function boundedMap(values,concurrency,operation){
  const results=new Array(values.length);let cursor=0;
  async function worker(){while(cursor<values.length){const index=cursor;cursor+=1;results[index]=await operation(values[index],index);}}
  await Promise.all(Array.from({length:Math.min(concurrency,values.length)},worker));return results;
}

function itemWindow(product){
  const center=Date.parse(product.observedAt);return{start:new Date(center-10*60_000).toISOString(),end:new Date(center+10*60_000).toISOString()};
}

function rawPath(product){return path.join(rawDirectory,product.originalUriOrObjectKey);}

function nativeProductSummary(product,raw,parsed,{reused=false}={}){
  return{
    productId:product.id,platform:parsed.platform??product.platform,observedAt:parsed.observedAt??product.observedAt,targetCaseIds:product.targetCaseIds??[],assetName:product.asset?.name??'FRP_in',expectedBytes:product.asset?.sizeBytes??null,
    rawSourceProductId:raw.id,providerProductId:raw.providerProductId,byteLength:raw.byteLength,checksumSha256:raw.checksumSha256,archiveObjectKey:raw.originalUriOrObjectKey,processingState:raw.processingState,reusedByChecksum:reused,
    parser:{version:raw.parserVersion,ok:parsed.ok,sourceRecordCount:parsed.sourceRecordCount,positiveFrpRecordCount:parsed.positiveFrpRecordCount,aoiObservationCount:parsed.aoiObservationCount,nativeDimensions:parsed.nativeDimensions,dataset:parsed.dataset,geographicIntegrity:parsed.geographicIntegrity,observationConclusion:parsed.observationConclusion},
    detections:(parsed.detections??[]).map((detection)=>({...detection}))
  };
}

function canonicalize(product){
  const accepted=[],rejected=[];
  for(const detection of product.detections??[]){
    const reason=!Array.isArray(detection.classification)||!detection.classification.includes('vegetation_fire')?'NON_VEGETATION_HOTSPOT':!Number.isFinite(Date.parse(detection.observedAt??''))?'INVALID_OBSERVATION_TIME':![detection.longitude,detection.latitude,detection.frpMw].every(Number.isFinite)?'INVALID_NATIVE_MEASUREMENT':detection.frpMw<=0?'NON_POSITIVE_FRP':null;
    const nativeId=`${product.productId}:${detection.nativeRecordIndex}`;
    if(reason){rejected.push({nativeId,reason,classification:detection.classification,classificationCode:detection.classificationCode});continue;}
    accepted.push({
      id:`SENTINEL3_SLSTR:${nativeId}`,coordinate:[detection.longitude,detection.latitude],observedAt:detection.observedAt,receivedAt:product.receivedAt??product.rawReceivedAt,satellite:product.platform,instrument:'SLSTR',source:'Copernicus Sentinel-3 SLSTR',sourceKey:'SENTINEL3_SLSTR_FRP',sourceFamily:'sentinel-3-slstr',independenceGroup:'sentinel-3-slstr',measurementType:'slstr_mwir_fire_radiative_power',frpMw:detection.frpMw,frpUncertaintyMw:detection.uncertaintyMw,brightnessK:detection.brightnessMirK,confidence:detection.confidence,nominalResolutionKm:1,geolocationUncertaintyM:500,qualityFlags:detection.qualityFlags??[],hotspotType:detection.classification?.join('+')??null,hotspotClass:detection.classification?.includes('vegetation_fire')?'vegetation_fire':'unclassified',
      provenance:{synthetic:false,provider:'Copernicus Data Space Ecosystem',providerProductId:product.providerProductId,rawSourceProductId:product.rawSourceProductId,checksumSha256:product.checksumSha256,parserVersion:product.parser?.version,normalizerVersion:'sentinel3-slstr-frp-v3',archiveObjectKey:product.archiveObjectKey,nativeRecordIndex:detection.nativeRecordIndex,nativeClassificationCode:detection.classificationCode,nativeRow:detection.nativeRow,nativeColumn:detection.nativeColumn}
    });
  }
  return{accepted,rejected};
}

function report(item){
  return{id:item.caseId,coordinate:item.geometry.coordinates,startedAt:item.alertAt,updatedAt:item.alertAt,municipality:item.region?.municipality,district:item.region?.district,parish:item.region?.parish,burnedAreaHa:item.burnedAreaHa,status:'known_reference_fire',provenance:{synthetic:false,provider:'ICNF SGIF',rawSourceProductId:item.evidenceProvenance?.rawSourceProductId??item.caseId}};
}

function uniqueDetections(rows){return[...new Map(rows.map((item)=>[item.id,item])).values()];}
function eventForObservation(events,id){return events.find((event)=>event.observations.some((observation)=>observation.id===`thermal:${id}`))??null;}

if(!config.cdseAccessToken&&!(config.cdseUsername&&config.cdsePassword))throw new Error('cdse_credentials_not_loaded_into_executing_process');
const [manifestBody,corpusBody]=await Promise.all([readFile(manifestPath),readFile(corpusPath)]),manifest=JSON.parse(manifestBody),corpus=JSON.parse(corpusBody);
const candidates=manifest.products.filter((item)=>item.catalogueValidation==='VALID'&&item.asset?.protectedHttpsAvailable);
if(candidates.length!==manifest.summary.protectedAssetsResolved)throw new Error(`sentinel3_manifest_candidate_mismatch:${candidates.length}`);

const acquisitionStore=new AcquisitionStore({filePath:statePath,archiveDir:rawDirectory});await acquisitionStore.initialize();
const priorByItem=new Map(acquisitionStore.products().filter((item)=>(item.sourceId??'').startsWith('sentinel3:')&&item.requestWindow?.itemId).map((item)=>[item.requestWindow.itemId,item]));
const acquirer=new CdseFrpAcquirer({username:config.cdseUsername,password:config.cdsePassword,accessToken:config.cdseAccessToken,acquisitionStore,pythonBinary:config.geoPython,tempRoot:path.join(root,'.tmp','physical-sensing','sentinel3'),timeoutMs:config.cdseDownloadTimeoutMs,collection:CDSE_FRP_NTC_COLLECTION,maxProducts:1});
const failures=[];let completed=0;
console.log(JSON.stringify({stage:'sentinel3_corpus_start',manifestProducts:candidates.length,reusableProducts:priorByItem.size,credentialsLoadedIntoProcess:true,secretValuesRecorded:false}));

const products=await boundedMap(candidates,2,async(product)=>{
  try{
    let raw=priorByItem.get(product.id),parsed,reused=false;
    if(raw){
      try{if(!['accepted','ingested'].includes(raw.processingState)||!raw.checksumSha256)throw new Error('archive_processing_state_not_reusable');const archived=rawPath(raw),metadata=await stat(archived);if(metadata.size!==raw.byteLength)throw new Error('archive_byte_length_mismatch');if(sha(await readFile(archived))!==raw.checksumSha256)throw new Error('archive_checksum_mismatch');parsed=await parseNative(archived);reused=true;}
      catch{raw=null;parsed=null;}
    }
    if(!raw){
      const window=itemWindow(product),acquired=await retry(()=>acquirer.acquire({...window,limit:100,collection:CDSE_FRP_NTC_COLLECTION,productIds:[product.id],maxProducts:1,selectionMode:'validated_2024_portugal_physical_corpus'}),{label:product.id});
      const output=acquired.outputs.find((item)=>item.item.id===product.id);if(!output)throw new Error(`validated_manifest_product_not_returned:${product.id}`);
      raw=output.rawSourceProduct;parsed=output.parsed;
    }
    completed+=1;if(completed%5===0||completed===candidates.length)console.log(JSON.stringify({stage:'sentinel3_corpus_progress',completed,total:candidates.length,failures:failures.length}));
    return nativeProductSummary(product,raw,parsed,{reused});
  }catch(error){failures.push({productId:product.id,error:String(error?.message??error)});completed+=1;console.log(JSON.stringify({stage:'sentinel3_product_failed',productId:product.id,error:String(error?.message??error)}));return null;}
});

const parsedProducts=products.filter(Boolean),canonicalized=parsedProducts.map((product)=>({product,...canonicalize(product)})),canonical=canonicalized.flatMap((item)=>item.accepted),rejected=canonicalized.flatMap((item)=>item.rejected);
for(const item of parsedProducts){const raw=acquisitionStore.getProduct(item.rawSourceProductId);item.receivedAt=raw?.receivedAt??null;item.parsedAt=raw?.parsedAt??null;item.processingState=raw?.processingState??item.processingState;}
for(const detection of canonical){const raw=acquisitionStore.getProduct(detection.provenance.rawSourceProductId);detection.receivedAt=raw?.receivedAt??null;detection.vigiaAcquiredAt=raw?.receivedAt??null;detection.vigiaParsedAt=raw?.parsedAt??null;}

const selectedCaseIds=new Set(candidates.flatMap((item)=>item.targetCaseIds??[])),selectedCases=corpus.cases.filter((item)=>selectedCaseIds.has(item.caseId));
const viirsDetections=uniqueDetections(selectedCases.flatMap((item)=>item.observations??[]));
const latestAt=[...viirsDetections,...canonical].map((item)=>Date.parse(item.observedAt??item.at)).filter(Number.isFinite).sort((a,b)=>a-b).at(-1)??Date.parse('2024-12-31T00:00:00Z');
const events=buildFireEvents({fires:selectedCases.map(report),thermalDetections:[...viirsDetections,...canonical]},{now:new Date(latestAt+5*60_000)});
const associations=canonical.map((detection)=>{const event=eventForObservation(events,detection.id),decision=event?.associationDecisions?.find((item)=>item.observationId===`thermal:${detection.id}`)??null,state=event?.incidentIds?.length?'associated':decision?.state==='ambiguous'?'ambiguous':'unassigned';return{observationId:`thermal:${detection.id}`,eventId:event?.id??null,state,incidentIds:event?.incidentIds??[],decision};});
const sentinelEvents=events.filter((event)=>event.observations.some((observation)=>observation.sourceFamily==='sentinel-3-slstr'));
const twoFamilyEvents=sentinelEvents.filter((event)=>{const families=new Set(event.observations.filter((observation)=>observation.type==='thermal').map((observation)=>observation.sourceFamily));return families.has('sentinel-3-slstr')&&families.has('viirs');});

const sourceProducts=parsedProducts.map((item)=>acquisitionStore.getProduct(item.rawSourceProductId)).filter(Boolean),checkpoints=acquisitionStore.status().checkpoints.filter((item)=>(item.sourceId??'').startsWith('sentinel3:'));
const postgres=new PostgresPhysicalTruthStore({databaseUrl:config.databaseUrl,universe:'production',connectionTimeoutMs:5_000,statementTimeoutMs:30_000});const postgresStatus=await postgres.initialize();
if(postgresStatus.state!=='ready'||!postgresStatus.postgis){await postgres.close();throw new Error(`sentinel3_postgis_not_ready:${postgresStatus.lastError??postgresStatus.state}`);}
const persistence=await postgres.commitSnapshot({products:sourceProducts,events,checkpoints});await postgres.close();
await acquisitionStore.markProductsIngested(sourceProducts.map((item)=>item.id));

const rejectionReasons=Object.fromEntries([...new Set(rejected.map((item)=>item.reason))].sort().map((reason)=>[reason,rejected.filter((item)=>item.reason===reason).length]));
const metrics={attemptedProducts:candidates.length,downloadedProducts:parsedProducts.length,downloadFailures:failures.length,downloadedBytes:parsedProducts.reduce((sum,item)=>sum+Number(item.byteLength??0),0),reusedProducts:parsedProducts.filter((item)=>item.reusedByChecksum).length,parsedProducts:parsedProducts.length,nativePositiveProducts:parsedProducts.filter((item)=>Number(item.parser.positiveFrpRecordCount)>0).length,nativeFrpRecords:parsedProducts.reduce((sum,item)=>sum+Number(item.parser.positiveFrpRecordCount??0),0),portugalNativeFrpRecords:parsedProducts.reduce((sum,item)=>sum+Number(item.parser.aoiObservationCount??0),0),canonicalAccepted:canonical.length,canonicalRejected:rejected.length,rejectionReasons,sentinel3Events:sentinelEvents.length,associatedObservations:associations.filter((item)=>item.state==='associated').length,ambiguousObservations:associations.filter((item)=>item.state==='ambiguous').length,unassignedObservations:associations.filter((item)=>item.state==='unassigned').length,twoFamilyEvents:twoFamilyEvents.length};
const artifact={schema:'vigia.sentinel3-physical-corpus.v1',generatedAt:new Date().toISOString(),providerPreflight:{configuration:'CONFIGURED',authentication:'SUCCEEDED',protectedDownload:'SUCCEEDED',providerStatus:200,credentialValuesRecorded:false},inputs:{manifest:{path:path.relative(root,manifestPath),checksumSha256:sha(manifestBody)},corpus:{path:path.relative(root,corpusPath),checksumSha256:sha(corpusBody)}},selection:{policy:'Every validated protected Sentinel-3 SLSTR L2 FRP NTC product in the governed 2024 Portugal manifest.',candidateProducts:candidates.length,targetCases:selectedCases.length},metrics,persistence:{postgisStatus:postgresStatus,commit:persistence,rawProductsMarkedIngested:sourceProducts.length},products:parsedProducts.map((item)=>({...item,detections:undefined,receivedAt:acquisitionStore.getProduct(item.rawSourceProductId)?.receivedAt??null,parsedAt:acquisitionStore.getProduct(item.rawSourceProductId)?.parsedAt??null,processingState:'ingested'})),canonicalObservations:canonical,canonicalRejections:rejected,productionAssociation:{engine:'packages/domain/src/fire-event-tracker.mjs buildFireEvents (default production thresholds)',manualAssignment:false,thresholdRelaxation:false,targetCaseIds:[...selectedCaseIds].sort(),observationAssociations:associations,sentinel3EventIds:sentinelEvents.map((item)=>item.id),twoFamilyEventIds:twoFamilyEvents.map((item)=>item.id),ambiguousAssociations:associations.filter((item)=>item.state==='ambiguous'),unassignedAssociations:associations.filter((item)=>item.state==='unassigned')},events:sentinelEvents,failures};
artifact.evidenceHash=`sha256:${sha(JSON.stringify(artifact))}`;await writeFile(outputPath,`${JSON.stringify(artifact)}\n`);

let priorHandoff={};try{priorHandoff=JSON.parse(await readFile(handoffPath,'utf8'));}catch{}
let viirs={};try{const value=JSON.parse(await readFile(viirsPath,'utf8'));viirs={earthdataPreflight:value.providerPreflight?.earthdata,granuleMetrics:value.granuleSummary,smallFireOpportunityMetrics:value.cascade,sizeStrata:value.sizeStrata,geographicStrata:value.geographicStrata,signalStrata:value.signalStrata,platformPerformance:value.platformPerformance,stateCounts:value.stateCounts,errorTaxonomy:value.errorTaxonomy,errorRecords:value.errors};}catch{viirs=priorHandoff.viirs??{};}
const handoff={...priorHandoff,schema:'vigia.physical-sensing-gold-handoff.v2',generatedAt:new Date().toISOString(),criticalDelta:{before:{sentinel3PayloadsDownloaded:0,sentinel3Parsed:0,sentinel3PositiveObservations:0,viirsProductLevelCases:0,viirsValidOpportunities:0,viirsSensorRecall:null},after:{sentinel3PayloadsDownloaded:metrics.downloadedProducts,sentinel3Parsed:metrics.parsedProducts,sentinel3PositiveObservations:metrics.canonicalAccepted,sentinel3TwoFamilyEvents:metrics.twoFamilyEvents,viirsGranulesAcquired:viirs.granuleMetrics?.activeFireGranulesAcquired??null,viirsProductLevelCases:viirs.smallFireOpportunityMetrics?.productLevelGranuleProof??null,viirsValidOpportunities:viirs.smallFireOpportunityMetrics?.validOpportunity??null,viirsSensorRecall:viirs.smallFireOpportunityMetrics?.sensorDetectionGivenValidOpportunity??null}},sentinel3:{providerPreflight:artifact.providerPreflight,...metrics,observationIds:canonical.map((item)=>`thermal:${item.id}`),sentinel3EventIds:artifact.productionAssociation.sentinel3EventIds,twoFamilyEventIds:artifact.productionAssociation.twoFamilyEventIds,ambiguousAssociations:artifact.productionAssociation.ambiguousAssociations,unassignedAssociations:artifact.productionAssociation.unassignedAssociations,postgis:artifact.persistence,blocker:failures.length?{state:'PARTIAL_CORPUS_ACQUISITION_FAILURE',failures}:null},viirs,artifacts:{...(priorHandoff.artifacts??{}),sentinel3Corpus:path.relative(root,outputPath),opportunity:path.relative(root,viirsPath),acquisitionState:path.relative(root,statePath)},remainingBlockers:[...(failures.length?[`${failures.length} Sentinel-3 manifest products failed after deterministic retries.`]:[]),...((priorHandoff.remainingBlockers??[]).filter((item)=>!/CDSE|Sentinel-3/i.test(item)))]};handoff.evidenceHash=`sha256:${sha(JSON.stringify(handoff))}`;await writeFile(handoffPath,`${JSON.stringify(handoff,null,2)}\n`);
console.log(JSON.stringify({stage:'sentinel3_corpus_complete',outputPath,handoffPath,evidenceHash:artifact.evidenceHash,metrics,persistence,providerDependentProcessSourcedCredentialFile:process.env.VIGIA_PERSISTENT_SECRETS_SOURCED==='1'},null,2));
