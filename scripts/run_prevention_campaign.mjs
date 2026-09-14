#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { signOperatorProxyRequest } from '../packages/domain/src/operator-proxy/request-auth.mjs';

const root=path.resolve(import.meta.dirname,'..');
const baseUrl=String(process.env.VIGIA_BASE_URL||'http://127.0.0.1:4177').replace(/\/$/,'');
const proxyKey=String(process.env.VIGIA_OPERATOR_PROXY_KEY||process.env.VIGIA_OPERATOR_TOKEN||'').trim(),releaseId=String(process.env.VIGIA_RELEASE_ID||'').trim();
const timeoutMs=Math.max(20_000,Number(process.env.VIGIA_CAMPAIGN_TIMEOUT_MS||120_000));
const concurrency=Math.max(1,Math.min(3,Number(process.env.VIGIA_CAMPAIGN_CONCURRENCY||2)));
const outputFile=path.resolve(process.env.VIGIA_CAMPAIGN_OUTPUT||path.join(root,'data/validation/prevention/portugal-sentinel2-campaign-v1.json'));
if(proxyKey.length<32||!releaseId)throw new Error('VIGIA_OPERATOR_PROXY_KEY and VIGIA_RELEASE_ID are required; the campaign persists attributable detector work.');

function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
async function request(route,{method='GET',body=null,authenticated=false}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('campaign_request_timeout')),timeoutMs);
  try{
    const bodyText=body?JSON.stringify(body):undefined,headers={accept:'application/json',...(body?{'content-type':'application/json'}:{})};
    if(authenticated)Object.assign(headers,signOperatorProxyRequest({key:proxyKey,releaseId,method,path:route,bodyBytes:bodyText?Buffer.from(bodyText):Buffer.alloc(0),intent:'operator-console'}));
    const response=await fetch(`${baseUrl}${route}`,{method,signal:controller.signal,headers,body:bodyText});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`${route} HTTP ${response.status}: ${payload.message||payload.error||'unknown_error'}`);
    return payload;
  }finally{clearTimeout(timer);}
}

const bootstrap=await request('/api/v2/bootstrap');
const candidates=(bootstrap.prevention?.candidates??[]).map((item)=>({id:item.id,municipality:item.municipality,coordinate:item.coordinate.map(Number)})).sort((a,b)=>a.id.localeCompare(b.id));
if(!candidates.length)throw new Error('No current inspection candidates were returned; refusing to manufacture a campaign dataset.');
const datasetIdentity=candidates.map(({id,municipality,coordinate})=>({id,municipality,coordinate}));
const datasetHash=`sha256:${digest(datasetIdentity)}`;
const campaignId=`prevention-campaign:${datasetHash.slice(7,23)}`;
const results=new Array(candidates.length);
let cursor=0;
async function worker(){
  while(cursor<candidates.length){
    const index=cursor++,candidate=candidates[index];
    try{
      const response=await request('/api/v10/prevention/fuel-continuity/run',{method:'POST',authenticated:true,body:{coordinate:candidate.coordinate,radiusKm:3,territoryLabel:candidate.municipality,campaign:{id:campaignId,datasetHash,datasetPolicy:'ALL_CURRENT_INSPECTION_CANDIDATES',candidateId:candidate.id,candidateIndex:index}}});
      results[index]={candidate,...responseSummary(response)};
    }catch(error){results[index]={candidate,state:'failed',error:String(error.message??error)};}
  }
}
await Promise.all(Array.from({length:Math.min(concurrency,candidates.length)},()=>worker()));
const completedAt=new Date().toISOString(),failed=results.filter((item)=>item.state==='failed');
const evidenceInputHash=`sha256:${digest(results.map((item)=>({candidateId:item.candidate.id,currentObservationId:item.currentObservationId??null,comparisonObservationId:item.comparisonObservationId??null,sourceQuality:item.sourceQuality??null})))}`;
const artifact={
  schema:'vigia.prevention.prospective-campaign.v1',campaignId,executionType:'GOVERNED_PROSPECTIVE_SCREENING',generatedAt:completedAt,
  dataset:{region:'Portugal mainland',policy:'ALL_CURRENT_INSPECTION_CANDIDATES',sourceEndpoint:'/api/v2/bootstrap',candidateCount:candidates.length,datasetHash,candidates:datasetIdentity,exclusions:[]},
  reproducibility:{repositoryCommit:gitCommit(),evidenceInputHash,baseUrlRedacted:'local-vigia-runtime',detectorVersion:'fuel_continuity_change_screen_v1',radiusKm:3,concurrency,requestTimeoutMs:timeoutMs,command:'VIGIA_OPERATOR_PROXY_KEY=<redacted> VIGIA_RELEASE_ID=<release> npm run prevention:campaign'},
  integrity:{manualCandidateSelection:false,syntheticLabels:false,expertGroundTruthAvailable:false,operationalClaimAllowed:false,failedCandidates:failed.length},
  summary:{completed:candidates.length-failed.length,failed:failed.length,screened:results.filter((item)=>['screened','screened_no_candidate'].includes(item.state)).length,screenedNoCandidate:results.filter((item)=>item.state==='screened_no_candidate').length,abstained:results.filter((item)=>item.state==='abstained').length,findings:results.reduce((sum,item)=>sum+(item.outputCount??0),0),negativeComponentsRejected:results.reduce((sum,item)=>sum+(item.negativeMining?.rejectedComponents??0),0),negativeSamples:results.reduce((sum,item)=>sum+(item.negativeMining?.samples?.length??0),0)},
  results
};
await mkdir(path.dirname(outputFile),{recursive:true});
await writeFile(outputFile,`${JSON.stringify(artifact,null,2)}\n`);
console.log(JSON.stringify({campaignId,datasetHash,outputFile,summary:artifact.summary},null,2));
if(failed.length)process.exitCode=1;

function responseSummary(response){
  const run=response.run??{},findings=response.findings??[];
  return {state:run.state??response.analysis?.state??'unknown',runId:run.id??null,currentObservationId:run.currentObservationId??null,comparisonObservationId:run.comparisonObservationId??null,outputCount:findings.length,abstentionReason:run.abstentionReason??null,noCandidateReason:run.noCandidateReason??null,sourceQuality:run.sourceQuality??null,negativeMining:run.negativeMining??null,screeningDiagnostics:run.screeningDiagnostics??null,findings:findings.map((item)=>({findingId:item.findingId,affectedAreaHa:item.affectedAreaHa,corridorLengthM:item.corridorLengthM,newFuelFraction:item.newFuelFraction,nearestStructureM:item.nearestStructureM,structuresWithinPolicyRadius:item.structuresWithinPolicyRadius,attentionPriority:item.attentionPriority,unmeasured:item.attentionPriority?.unmeasured??[],sourceQuality:item.sourceQuality,landCoverContext:item.landCoverContext,calibrationState:item.calibrationState}))};
}
function gitCommit(){try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return'UNAVAILABLE';}}
