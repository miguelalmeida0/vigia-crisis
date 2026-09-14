#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcquisitionStore } from '../apps/api/src/modules/acquisition/acquisition-store.mjs';
import { HttpAcquirer } from '../apps/api/src/modules/acquisition/http-acquirer.mjs';
import { loadConfig } from '../apps/api/src/config/env.mjs';
import {
  VIIRS_ACTIVE_FIRE_COLLECTIONS,
  chooseOpportunityGranule,
  discoverCompanionGeolocation,
  discoverViirsGranules,
  granuleEvidenceId,
  selectReportStratifiedCohort,
  assertTrustedEarthdataUrl
} from '../apps/api/src/modules/world/viirs/viirs-granule-opportunity.mjs';
import { fetchRaw } from '../apps/api/src/shared/fetch.mjs';
import { runBoundedJsonProcess } from '../apps/api/src/shared/bounded-json-process.mjs';
import { assessThermalCandidateV4 } from '../packages/domain/src/thermal-candidate-policy.mjs';
import { buildThermalContextResolver } from '../packages/domain/src/thermal-site-context.mjs';
import { buildFireEvents, thermalTrend } from '../packages/domain/src/fire-event-tracker.mjs';
import { haversineKm } from '../packages/domain/src/geo.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const physicalDirectory=path.join(root,'data/validation/physical-sensing');
const rawDirectory=path.join(physicalDirectory,'raw');
const tempDirectory=path.join(root,'.tmp','physical-sensing','viirs');
const corpusPath=path.join(root,'data/validation/detection/portugal-2024-active-fire-corpus.json');
const contextPath=path.join(root,'data/reference/portugal-thermal-context-v1.json');
const canonicalOutputPath=path.join(root,'data/validation/detection/portugal-2024-small-fire-opportunity.json');
const outputPath=path.join(physicalDirectory,'viirs-small-fire-opportunity.json');
const handoffPath=path.join(physicalDirectory,'gold-specialist-handoff.json');
const sentinelManifestPath=path.join(root,'data/validation/detection/sentinel3-portugal-2024-product-manifest.json');
const parserPath=path.join(root,'apps/api/src/modules/world/viirs/evaluate_viirs_granule.py');
const config=loadConfig();
const ratio=(numerator,denominator)=>denominator?Number((numerator/denominator).toFixed(4)):null;
const sha=(value)=>createHash('sha256').update(value).digest('hex');
const wait=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
const safe=(value)=>String(value).replace(/[^a-z0-9._-]+/gi,'_').slice(0,180);
const dayStart=(date)=>`${date}T00:00:00.000Z`;
const plusHours=(value,hours)=>new Date(Date.parse(value)+hours*3_600_000).toISOString();

function sizeBand(value){const area=Number(value);return area<1?'<1 ha':area<5?'1–5 ha':area<10?'5–10 ha':area<50?'10–50 ha':'>50 ha';}
function regionBand(coordinate){return coordinate[1]>=40?'north':coordinate[1]>=38.5?'central':'south';}
function frpBand(value){if(!Number.isFinite(value))return'no signal';return value<2?'low (<2 MW)':value<10?'medium (2–10 MW)':'high (≥10 MW)';}
function percentageRows(rows){
  const cohort=rows.length,granule=rows.filter((row)=>row.granuleProof).length,swath=rows.filter((row)=>row.insideSwath).length,valid=rows.filter((row)=>row.validOpportunity).length,signal=rows.filter((row)=>row.fireSignal).length,retained=rows.filter((row)=>row.providerRetained).length,accepted=rows.filter((row)=>row.policyAccepted).length,event=rows.filter((row)=>row.eventProduced).length;
  return {knownFires:cohort,productLevelGranuleProof:granule,insideSwath:swath,validOpportunity:valid,fireSignal:signal,providerRetained:retained,vigiaAccepted:accepted,event,granuleCoverage:ratio(granule,cohort),swathCoverage:ratio(swath,cohort),validOpportunityCoverage:ratio(valid,cohort),sensorDetectionGivenValidOpportunity:ratio(signal,valid),providerRetentionGivenFireSignal:ratio(retained,signal),policyRecallGivenRetainedSignal:ratio(accepted,retained),eventGivenPolicyAccepted:ratio(event,accepted),endToEndRate:ratio(event,cohort)};
}
function memory(rows,asOf){
  const causal=rows.filter((item)=>Date.parse(item.at??item.observedAt)<=Date.parse(asOf)).sort((a,b)=>Date.parse(a.at??a.observedAt)-Date.parse(b.at??b.observedAt));
  if(!causal.length)return{observationCount:0,distinctObservationDays:0,durationHours:0,stationarityRadiusKm:null,frpP90Mw:null};
  const centroid=[causal.reduce((sum,item)=>sum+item.coordinate[0],0)/causal.length,causal.reduce((sum,item)=>sum+item.coordinate[1],0)/causal.length],frp=causal.map((item)=>Number(item.frpMw)).filter(Number.isFinite).sort((a,b)=>a-b);
  return{observationCount:causal.length,distinctObservationDays:new Set(causal.map((item)=>(item.at??item.observedAt).slice(0,10))).size,durationHours:(Date.parse(causal.at(-1).at??causal.at(-1).observedAt)-Date.parse(causal[0].at??causal[0].observedAt))/3_600_000,stationarityRadiusKm:Math.max(...causal.map((item)=>haversineKm(centroid,item.coordinate))),frpP90Mw:frp[Math.min(frp.length-1,Math.ceil(frp.length*.9)-1)]??null};
}
async function retry(operation,{attempts=4,label='operation'}={}){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt+=1){try{return await operation(attempt);}catch(error){lastError=error;const transient=error?.name==='AbortError'||error?.status===429||Number(error?.status)>=500||/fetch|timeout|ECONN|EAI_AGAIN/i.test(String(error?.message));if(!transient||attempt===attempts-1)throw error;await wait(Math.min(10_000,750*2**attempt));}}
  throw new Error(`${label}_failed:${lastError?.message??lastError}`);
}
async function boundedMap(values,concurrency,operation){
  const results=new Array(values.length);let cursor=0;
  async function worker(){while(cursor<values.length){const index=cursor;cursor+=1;results[index]=await operation(values[index],index);}}
  await Promise.all(Array.from({length:Math.min(concurrency,values.length)},worker));return results;
}
async function acquireActiveGranule(http,granule){
  return retry(async()=>{
    const result=await http.acquire({
      sourceId:`viirs:${granule.shortName.toLowerCase()}:${granule.version}`,provider:'nasa-lpdaac',url:granule.downloadUrl,archiveUri:`cmr:${granule.conceptId}`,
      accept:'application/x-netcdf,application/octet-stream',headers:{authorization:`Bearer ${config.earthdataToken}`},parserVersion:'viirs-375m-active-fire-netcdf-v2',
      validateUrl:assertTrustedEarthdataUrl,maxBytes:64*1024*1024,
      requestWindow:{cmrConceptId:granule.conceptId,nativeId:granule.nativeId,start:granule.startAt,end:granule.endAt,selectionMode:'report_blind_stratified_small_fire_opportunity'},
      licenceMetadata:{state:'nasa_open_data',provider:'NASA LP DAAC'},
      parse:async(_text,raw)=>{const hdf5=raw.body.length>=8&&raw.body.subarray(0,8).equals(Buffer.from([137,72,68,70,13,10,26,10]));if(!hdf5)throw new Error('viirs_active_payload_not_hdf5');return{value:{ok:true,hdf5},sourceTimestamp:granule.startAt,sourceTimestampRange:{start:granule.startAt,end:granule.endAt},providerProductId:granule.nativeId,normalizerVersion:'viirs-375m-opportunity-v1'};}
    });
    return{...granule,evidenceId:granuleEvidenceId(granule),downloadState:'DOWNLOADED',rawSourceProduct:result.rawSourceProduct,duplicate:result.duplicate,activePath:path.join(rawDirectory,result.rawSourceProduct.originalUriOrObjectKey)};
  },{label:`active_${granule.nativeId}`});
}
async function downloadGeo(geo,url){
  await rm(geo,{force:true});
  return retry(async()=>{
    const response=await fetchRaw(url,{headers:{authorization:`Bearer ${config.earthdataToken}`,accept:'application/x-netcdf,application/octet-stream'},userAgent:'VIGIA physical-sensing gold/1',timeoutMs:120_000,maxBytes:256*1024*1024,validateUrl:assertTrustedEarthdataUrl});
    if(!response.ok){const error=new Error(`earthdata_geo_http_${response.status}`);error.status=response.status;throw error;}
    if(!response.body.subarray(0,8).equals(Buffer.from([137,72,68,70,13,10,26,10])))throw new Error('viirs_geolocation_payload_not_hdf5');
    try{await writeFile(geo,response.body,{flag:'wx'});}catch(error){await rm(geo,{force:true});throw error;}
    return{bytes:response.body.length,checksumSha256:createHash('sha256').update(response.body).digest('hex'),contentType:response.contentType};
  },{label:`geo_${path.basename(geo)}`});
}
async function runParser(activePath,geoPath,casesPath){
  const [active,geo,cases]=await Promise.all([stat(activePath),stat(geoPath),stat(casesPath)]);
  if(!active.isFile()||active.size>64*1024*1024)throw new Error('viirs_active_parser_input_too_large');
  if(!geo.isFile()||geo.size>256*1024*1024)throw new Error('viirs_geo_parser_input_too_large');
  if(!cases.isFile()||cases.size>2*1024*1024)throw new Error('viirs_cases_parser_input_too_large');
  const value=await runBoundedJsonProcess({command:config.geoPython,args:[parserPath,activePath,geoPath,casesPath],filePath:activePath,timeoutMs:60_000,maxFileBytes:64*1024*1024,maxOutputBytes:4*1024*1024,maxErrorBytes:128*1024});
  if(!value.ok)throw new Error(value.error??'viirs_parser_failed');
  if(!Array.isArray(value.evaluations)||value.evaluations.length>1000)throw new Error('viirs_parser_evaluation_limit_exceeded');
  return value;
}
async function evaluateGranule(active,assignedCases,collection){
  const geo=await discoverCompanionGeolocation(active,collection);if(!geo)throw new Error(`companion_geolocation_not_found:${active.nativeId}`);
  const geoPath=path.join(tempDirectory,`${safe(geo.nativeId??path.basename(geo.downloadUrl))}.nc`),casesPath=path.join(tempDirectory,`${safe(active.nativeId)}.cases.json`);
  await writeFile(casesPath,JSON.stringify(assignedCases.map((item)=>({caseId:item.caseId,coordinate:item.geometry.coordinates}))));
  let downloaded;
  try{downloaded=await downloadGeo(geoPath,geo.downloadUrl);const parsed=await runParser(active.activePath,geoPath,casesPath);return{active,geo:{conceptId:geo.conceptId,nativeId:geo.nativeId,shortName:geo.shortName,version:geo.version,downloadUrl:geo.downloadUrl,byteLength:downloaded.bytes,checksumSha256:downloaded.checksumSha256,archived:false,derivedEvidencePersisted:true},product:parsed.product,sourceFirePixels:parsed.sourceFirePixels,evaluations:parsed.evaluations};}
  finally{await rm(geoPath,{force:true});await rm(casesPath,{force:true});}
}
async function cdsePreflight(){
  if(!config.cdseAccessToken&&!(config.cdseUsername&&config.cdsePassword))return{authentication:'NOT_CONFIGURED',protectedDownload:'NOT_ATTEMPTED',providerStatus:null,providerError:'credentials_missing'};
  if(config.cdseAccessToken)return{authentication:'TOKEN_PRESENT_NOT_REVALIDATED',protectedDownload:'NOT_ATTEMPTED_IN_VIIRS_RUN',providerStatus:null,providerError:null};
  try{
    const response=await fetchRaw('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({client_id:'cdse-public',username:config.cdseUsername,password:config.cdsePassword,grant_type:'password'}),timeoutMs:30_000,maxBytes:1024*1024});let body={};try{body=JSON.parse(response.body.toString('utf8'));}catch{}
    return{authentication:response.ok&&body.access_token?'SUCCEEDED':'REJECTED',protectedDownload:response.ok&&body.access_token?'NOT_ATTEMPTED_IN_VIIRS_RUN':'BLOCKED_BY_AUTHENTICATION',providerStatus:response.status,providerError:body.error??null,providerDescription:body.error_description??null};
  }catch(error){return{authentication:'FAILED_NETWORK',protectedDownload:'BLOCKED_BY_AUTHENTICATION',providerStatus:null,providerError:String(error.message??error)};}
}
function errorRecord(row){
  let type=null;
  const evaluated=row.opportunities.filter((item)=>item.evaluation);
  if(!row.granuleProof)type='SOURCE PRODUCT FAILURE';
  else if(evaluated.some((item)=>item.evaluation.state==='GEOLOCATION_FAILURE'))type='GEOLOCATION FAILURE';
  else if(evaluated.some((item)=>item.evaluation.state==='EDGE OF SWATH'))type='EDGE OF SWATH';
  else if(!row.validOpportunity&&evaluated.some((item)=>item.evaluation.state==='UNUSABLE QUALITY'))type='QUALITY FAILURE';
  else if(row.validOpportunity&&!row.fireSignal)type='VALID OPPORTUNITY / NO SIGNAL';
  else if(row.fireSignal&&!row.providerRetained)type=row.maxNativeFrpMw!==null&&row.maxNativeFrpMw<2?'LOW SIGNAL':'UNKNOWN';
  else if(row.providerRetained&&!row.policyAccepted)type='SIGNAL / VIGIA REJECTED';
  else if(!row.eventProduced)type='UNKNOWN';
  if(!type)return null;
  return{id:`physical-error:${sha(`${row.caseId}:${type}`).slice(0,20)}`,type,unknownReason:type==='UNKNOWN'?'Native L2 fire signal is present, but no matching row exists in the retained FIRMS yearly archive; the available provider artifacts do not expose whether this was a transformation, timing, or retention decision.':null,referenceEvent:{caseId:row.caseId,alertAt:row.alertAt,burnedAreaHa:row.burnedAreaHa,region:row.region},granules:row.opportunities.map((item)=>({platform:item.platform,conceptId:item.conceptId,nativeId:item.nativeId,timeSeparationHours:item.timeSeparationHours,state:item.state})),geometry:{coordinate:row.coordinate,matchingRadiusKm:3},sensorData:{fireSignal:row.fireSignal,maxNativeFrpMw:row.maxNativeFrpMw,providerRetained:row.providerRetained},quality:evaluated.map((item)=>({platform:item.platform,fireMaskCode:item.evaluation.fireMaskCode,fireMaskLabel:item.evaluation.fireMaskLabel,geolocationQuality:item.evaluation.geolocationQuality,sensorZenithDeg:item.evaluation.sensorZenithDeg,algorithmQa:item.evaluation.algorithmQa})),decision:{validOpportunity:row.validOpportunity,policyAccepted:row.policyAccepted,eventProduced:row.eventProduced,policyDecision:row.policyDecision},rawProvenance:row.opportunities.filter((item)=>item.provenance).map((item)=>item.provenance)};
}

await mkdir(physicalDirectory,{recursive:true});await mkdir(rawDirectory,{recursive:true});await mkdir(tempDirectory,{recursive:true});
if(!config.earthdataToken)throw new Error('earthdata_token_not_loaded_from_secure_vigia_configuration');
const corpusBody=await readFile(corpusPath),corpus=JSON.parse(corpusBody),contextBody=await readFile(contextPath),resolveContext=buildThermalContextResolver(JSON.parse(contextBody));
const cohort=selectReportStratifiedCohort(corpus.cases);
console.log(JSON.stringify({stage:'cohort_selected',cases:cohort.cases.length,dates:cohort.selectedDates}));

const discovered=[];
for(const collection of VIIRS_ACTIVE_FIRE_COLLECTIONS)for(const date of cohort.selectedDates){const start=dayStart(date),end=plusHours(start,48),rows=await discoverViirsGranules({collection,start,end});discovered.push(...rows);}
const granuleMap=new Map(discovered.map((item)=>[item.conceptId,item])),granules=[...granuleMap.values()];
const assignments=new Map();
for(const item of cohort.cases){const perPlatform=[];for(const collection of VIIRS_ACTIVE_FIRE_COLLECTIONS){const candidates=granules.filter((granule)=>granule.shortName===collection.shortName),choice=chooseOpportunityGranule({alertAt:item.alertAt,timeWindow:item.timeWindow,coordinate:item.geometry.coordinates},candidates);perPlatform.push({platform:collection.platform,shortName:collection.shortName,...choice});}assignments.set(item.caseId,perPlatform);}
const selectedMap=new Map();for(const rows of assignments.values())for(const row of rows)if(row.selected)selectedMap.set(row.selected.conceptId,row.selected);const selected=[...selectedMap.values()];
console.log(JSON.stringify({stage:'cmr_discovery_complete',cmrGranules:granules.length,selectedUniqueGranules:selected.length,assignedCases:[...assignments.values()].filter((rows)=>rows.some((row)=>row.selected)).length}));

const acquisitionStore=new AcquisitionStore({filePath:path.join(physicalDirectory,'acquisition-state.json'),archiveDir:rawDirectory});await acquisitionStore.initialize();
const http=new HttpAcquirer({store:acquisitionStore,timeoutMs:120_000,userAgent:'VIGIA physical-sensing gold/1'}),activeResults=new Map(),activeFailures=[];
await boundedMap(selected,2,async(granule)=>{try{const value=await acquireActiveGranule(http,granule);activeResults.set(granule.conceptId,value);}catch(error){activeFailures.push({conceptId:granule.conceptId,nativeId:granule.nativeId,error:String(error.message??error)});} });
console.log(JSON.stringify({stage:'active_granules_acquired',downloaded:activeResults.size,failed:activeFailures.length,bytes:[...activeResults.values()].reduce((sum,item)=>sum+Number(item.rawSourceProduct.byteLength??0),0)}));

const evaluationByGranule=new Map(),granuleEvidence=[],geoFailures=[];
for(const active of activeResults.values()){
  const assignedCases=cohort.cases.filter((item)=>(assignments.get(item.caseId)??[]).some((row)=>row.selected?.conceptId===active.conceptId));
  const collection=VIIRS_ACTIVE_FIRE_COLLECTIONS.find((item)=>item.shortName===active.shortName);
  try{const result=await evaluateGranule(active,assignedCases,collection);granuleEvidence.push(result);evaluationByGranule.set(active.conceptId,new Map(result.evaluations.map((row)=>[row.caseId,row])));console.log(JSON.stringify({stage:'granule_evaluated',nativeId:active.nativeId,cases:assignedCases.length,firePixels:result.sourceFirePixels,geoBytes:result.geo.byteLength}));}
  catch(error){geoFailures.push({conceptId:active.conceptId,nativeId:active.nativeId,error:String(error.message??error)});console.log(JSON.stringify({stage:'granule_evaluation_failed',nativeId:active.nativeId,error:String(error.message??error)}));}
}

const rows=[];
for(const item of cohort.cases){
  const opportunities=(assignments.get(item.caseId)??[]).map((assignment)=>{
    const active=assignment.selected?activeResults.get(assignment.selected.conceptId):null,evaluation=assignment.selected?evaluationByGranule.get(assignment.selected.conceptId)?.get(item.caseId)??null:null;
    const state=!assignment.selected?assignment.state:!active?'SOURCE PRODUCT FAILURE':!evaluation?'UNKNOWN':evaluation.state;
    return{platform:assignment.platform,shortName:assignment.shortName,state,temporalGranules:assignment.temporalGranules,insideSwathGranules:assignment.insideSwathGranules,timeSeparationHours:assignment.timeSeparationHours,conceptId:assignment.selected?.conceptId??null,nativeId:assignment.selected?.nativeId??null,startAt:assignment.selected?.startAt??null,endAt:assignment.selected?.endAt??null,evaluation,provenance:active?{rawSourceProductId:active.rawSourceProduct.id,checksumSha256:active.rawSourceProduct.checksumSha256,byteLength:active.rawSourceProduct.byteLength,originalUri:active.rawSourceProduct.originalUri,cmrConceptId:active.conceptId,providerProductId:active.nativeId}:null};
  });
  const granuleProof=opportunities.some((row)=>row.provenance&&row.evaluation),insideSwath=opportunities.some((row)=>row.conceptId),validOpportunity=opportunities.some((row)=>row.evaluation?.validOpportunity),fireSignal=opportunities.some((row)=>row.evaluation?.nativeFireSignal),frps=opportunities.map((row)=>row.evaluation?.nearestFirePixel?.frpMw).filter(Number.isFinite),maxNativeFrpMw=frps.length?Math.max(...frps):null;
  const signalPasses=opportunities.filter((row)=>row.evaluation?.nativeFireSignal),retainedObservations=[];
  for(const observation of item.observations??[])for(const pass of signalPasses)if(observation.satellite===pass.platform&&Math.abs(Date.parse(observation.at??observation.observedAt)-Date.parse(pass.startAt))/60_000<=10&&haversineKm(observation.coordinate,item.geometry.coordinates)<=3){retainedObservations.push(observation);break;}
  const uniqueRetained=[...new Map(retainedObservations.map((observation)=>[observation.id,observation])).values()],providerRetained=uniqueRetained.length>0;
  let assessment=null,policyAccepted=false,eventProduced=false,eventId=null;
  if(providerRetained){
    const decisionAt=[...uniqueRetained].sort((a,b)=>Date.parse(a.at??a.observedAt)-Date.parse(b.at??b.observedAt)).at(-1).at,causal=(item.observations??[]).filter((observation)=>Date.parse(observation.at??observation.observedAt)<=Date.parse(decisionAt)&&Date.parse(observation.at??observation.observedAt)>=Date.parse(item.timeWindow.start)&&haversineKm(observation.coordinate,item.geometry.coordinates)<=3),siteContext=resolveContext(item.geometry.coordinates);
    assessment=assessThermalCandidateV4({observations:causal,thermal:thermalTrend(causal,{now:new Date(Date.parse(decisionAt)+300_000)}),thermalMemory:memory(item.observations??[],decisionAt),siteContext},{now:new Date(Date.parse(decisionAt)+300_000)});policyAccepted=Boolean(assessment?.qualifiesAsFireCandidate);
    if(policyAccepted){const events=buildFireEvents({fires:[{id:item.caseId,coordinate:item.geometry.coordinates,startedAt:item.alertAt,updatedAt:item.alertAt,municipality:item.region?.municipality,district:item.region?.district,parish:item.region?.parish,burnedAreaHa:item.burnedAreaHa,status:'known_reference_fire',provenance:{synthetic:false,provider:'ICNF SGIF',rawSourceProductId:item.evidenceProvenance?.rawSourceProductId??item.caseId}}],thermalDetections:uniqueRetained},{now:new Date(Date.parse(decisionAt)+300_000)}),event=events.find((candidate)=>candidate.incidentIds.includes(item.caseId)&&candidate.observations.some((observation)=>observation.type==='thermal'));eventProduced=Boolean(event);eventId=event?.id??null;}
  }
  rows.push({caseId:item.caseId,alertAt:item.alertAt,timeWindow:item.timeWindow,burnedAreaHa:item.burnedAreaHa,sizeBand:sizeBand(item.burnedAreaHa),regionBand:regionBand(item.geometry.coordinates),region:item.region,coordinate:item.geometry.coordinates,granuleProof,insideSwath,validOpportunity,fireSignal,maxNativeFrpMw,frpBand:frpBand(maxNativeFrpMw),providerRetained,retainedObservationIds:uniqueRetained.map((observation)=>observation.id),policyAccepted,policyDecision:assessment?.decision??null,policyVersion:assessment?.policyVersion??null,eventProduced,eventId,opportunities});
}

const errors=rows.map(errorRecord).filter(Boolean),metrics=percentageRows(rows);
const by=(labels,selector)=>Object.fromEntries(labels.map((label)=>[label,percentageRows(rows.filter((row)=>selector(row)===label))]));
const sizeStrata=by(['<1 ha','1–5 ha','5–10 ha'],(row)=>row.sizeBand),geographicStrata=by(['north','central','south'],(row)=>row.regionBand),signalStrata=by(['no signal','low (<2 MW)','medium (2–10 MW)','high (≥10 MW)'],(row)=>row.frpBand);
const platformPerformance=Object.fromEntries(VIIRS_ACTIVE_FIRE_COLLECTIONS.map((collection)=>{const opportunities=rows.map((row)=>row.opportunities.find((item)=>item.platform===collection.platform)).filter(Boolean),proof=opportunities.filter((item)=>item.provenance&&item.evaluation),valid=opportunities.filter((item)=>item.evaluation?.validOpportunity),signal=opportunities.filter((item)=>item.evaluation?.nativeFireSignal);return[collection.platform,{productLevelGranuleProof:proof.length,validOpportunities:valid.length,fireSignals:signal.length,sensorDetectionGivenValidOpportunity:ratio(signal.length,valid.length),granulesAcquired:new Set(proof.map((item)=>item.conceptId)).size}];}));
const stateCounts=Object.fromEntries([...new Set(rows.flatMap((row)=>row.opportunities.map((item)=>item.state)))].sort().map((state)=>[state,rows.flatMap((row)=>row.opportunities).filter((item)=>item.state===state).length]));
const sourceArtifacts=[corpusPath,contextPath,path.join(root,'data/replay/raw/nasa-firms/viirs-jpss1_2024_Portugal.csv'),path.join(root,'data/replay/raw/nasa-firms/viirs-snpp_2024_Portugal.csv')].map(async(file)=>({path:path.relative(root,file),checksumSha256:sha(await readFile(file))}));
const cdse=await cdsePreflight(),sentinelManifest=JSON.parse(await readFile(sentinelManifestPath,'utf8'));
const artifact={schema:'vigia.small-fire-product-opportunity.v3',generatedAt:new Date().toISOString(),before:{knownSmallFires:5927,nearbyPassProxy:4819,productLevelGranuleProof:0,validPhysicalOpportunities:0,sensorDetectionGivenValidOpportunity:null,policyRecallGivenRetainedSignal:.9725},selection:{policy:cohort.policy,selectedDates:cohort.selectedDates,caseCount:cohort.cases.length,blindToViirsSignal:true},providerPreflight:{earthdata:{authentication:'SUCCEEDED',cmrDiscovery:'SUCCEEDED',scienceProductDownload:activeResults.size?'SUCCEEDED':'FAILED'},cdse},collections:VIIRS_ACTIVE_FIRE_COLLECTIONS,granuleSummary:{cmrGranulesDiscovered:granules.length,uniqueGranulesSelected:selected.length,activeFireGranulesAcquired:activeResults.size,activeFireGranulesFailed:activeFailures.length,activeFireBytes:[...activeResults.values()].reduce((sum,item)=>sum+Number(item.rawSourceProduct.byteLength??0),0),geolocationGranulesAcquired:granuleEvidence.length,geolocationBytes:granuleEvidence.reduce((sum,item)=>sum+item.geo.byteLength,0),geolocationGranulesRetained:0,derivedPixelEvidencePersisted:granuleEvidence.length,activeFailures,geolocationFailures:geoFailures},cascade:metrics,sizeStrata,geographicStrata,signalStrata,platformPerformance,stateCounts,errorTaxonomy:Object.fromEntries([...new Set(errors.map((item)=>item.type))].sort().map((type)=>[type,errors.filter((item)=>item.type===type).length])),granules:granuleEvidence.map((item)=>({evidenceId:item.active.evidenceId,platform:item.active.platform,active:{conceptId:item.active.conceptId,nativeId:item.active.nativeId,startAt:item.active.startAt,endAt:item.active.endAt,rawSourceProductId:item.active.rawSourceProduct.id,byteLength:item.active.rawSourceProduct.byteLength,checksumSha256:item.active.rawSourceProduct.checksumSha256,archiveObjectKey:item.active.rawSourceProduct.originalUriOrObjectKey},geolocation:item.geo,sourceFirePixels:item.sourceFirePixels,product:item.product,evaluatedCases:item.evaluations.length})),sourceArtifacts:await Promise.all(sourceArtifacts),errors,cases:rows};
artifact.evidenceHash=`sha256:${sha(JSON.stringify(artifact))}`;
await writeFile(outputPath,`${JSON.stringify(artifact)}\n`);await writeFile(canonicalOutputPath,`${JSON.stringify(artifact)}\n`);

const unknowns={count:errors.filter((item)=>item.type==='UNKNOWN').length,state:'NATIVE_L2_SIGNAL_NOT_FOUND_IN_RETAINED_FIRMS_ARCHIVE',reason:'The native VNP14IMG/VJ114IMG Level-2 product contains a fire signal inside the governed 3 km reference radius, but no matching row exists in the retained FIRMS yearly archive. Available provider artifacts do not expose whether this difference came from transformation, timing, or provider-retention logic, so these cases remain UNKNOWN rather than being labelled provider false negatives.'};
const handoff={schema:'vigia.physical-sensing-gold-handoff.v1',generatedAt:new Date().toISOString(),criticalDelta:{before:{sentinel3PayloadsDownloaded:0,sentinel3Parsed:0,sentinel3PositiveObservations:0,viirsProductLevelCases:0,viirsValidOpportunities:0,viirsSensorRecall:null},after:{sentinel3PayloadsDownloaded:0,sentinel3Parsed:0,sentinel3PositiveObservations:0,viirsGranulesAcquired:artifact.granuleSummary.activeFireGranulesAcquired,viirsProductLevelCases:metrics.productLevelGranuleProof,viirsValidOpportunities:metrics.validOpportunity,viirsSensorRecall:metrics.sensorDetectionGivenValidOpportunity}},sentinel3:{preflight:cdse,attemptedProducts:1,candidateProducts:sentinelManifest.summary.returnedUniqueProducts,protectedAssetsResolved:sentinelManifest.summary.protectedAssetsResolved,downloadedProducts:0,parsedProducts:0,positiveProducts:0,nativeFrpRecords:0,portugalFrpRecords:0,observationIds:[],sentinel3EventIds:[],twoFamilyEventIds:[],ambiguousAssociations:[],unassignedAssociations:[],blocker:cdse.authentication==='REJECTED'?{state:'EXTERNAL_PROVIDER_REJECTED_CONFIGURED_CREDENTIALS',providerStatus:cdse.providerStatus,providerError:cdse.providerError,providerDescription:cdse.providerDescription}:null},viirs:{earthdataPreflight:artifact.providerPreflight.earthdata,granuleMetrics:artifact.granuleSummary,smallFireOpportunityMetrics:metrics,sizeStrata,geographicStrata,signalStrata,platformPerformance,stateCounts,errorTaxonomy:artifact.errorTaxonomy,unknowns,errorRecords:errors},apiDomainAdditions:[{kind:'config',field:'earthdataToken',source:'secure VIGIA allowlisted secret configuration'},{kind:'module',path:'apps/api/src/modules/world/viirs/viirs-granule-opportunity.mjs'},{kind:'native-parser',path:'apps/api/src/modules/world/viirs/evaluate_viirs_granule.py'}],artifacts:{opportunity:path.relative(root,outputPath),canonicalOpportunity:path.relative(root,canonicalOutputPath),acquisitionState:path.relative(root,path.join(physicalDirectory,'acquisition-state.json'))},remainingBlockers:[...(cdse.authentication==='REJECTED'?['CDSE configured username/password are rejected by the provider identity service, so protected Sentinel-3 payload acquisition and S3/VIIRS physical association remain blocked.']:[]),...(unknowns.count?['For native VIIRS Level-2 signals absent from the retained FIRMS yearly archives, provider transformation/retention causality is not available in the acquired artifacts and remains UNKNOWN.']:[]),...(geoFailures.length?['Some selected VIIRS companion geolocation products failed; affected cases remain UNKNOWN or lack product proof.']:[])]};handoff.evidenceHash=`sha256:${sha(JSON.stringify(handoff))}`;
await writeFile(handoffPath,`${JSON.stringify(handoff,null,2)}\n`);
console.log(JSON.stringify({stage:'complete',outputPath,canonicalOutputPath,handoffPath,evidenceHash:artifact.evidenceHash,cascade:metrics,granules:artifact.granuleSummary,errorTaxonomy:artifact.errorTaxonomy},null,2));
