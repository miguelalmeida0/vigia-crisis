#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/api/src/config/env.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),inputPath=path.join(root,'data/validation/detection/sentinel3-portugal-2024-search.json'),outputPath=path.join(root,'data/validation/detection/sentinel3-portugal-2024-product-manifest.json');
const sha=(value)=>createHash('sha256').update(String(value)).digest('hex'),config=loadConfig(),credentials={accessToken:Boolean(config.cdseAccessToken),usernamePassword:Boolean(config.cdseUsername&&config.cdsePassword)};
const wait=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
const input=JSON.parse(await readFile(inputPath,'utf8')),products=new Map();
for(const row of input.matrix??[])for(const product of row.catalogue?.products??[]){const current=products.get(product.id)??{...product,targetCaseIds:[]};current.targetCaseIds.push(row.caseId);products.set(product.id,current);}
async function validate(product){
  try{
    let response=null;
    for(let attempt=0;attempt<8;attempt+=1){response=await fetch(product.officialItemUrl,{headers:{accept:'application/geo+json,application/json'}});if(response.status!==429)break;await response.body?.cancel();await wait(Math.min(12_000,750*2**attempt));}
    if(!response.ok)return{...product,targetCaseIds:[...new Set(product.targetCaseIds)].sort(),catalogueValidation:'FAILED',httpStatus:response.status,error:`catalogue_http_${response.status}`};
    const item=await response.json(),asset=item.assets?.FRP_in??item.assets?.FRP_MWIR1km_STANDARD??null,href=asset?.alternate?.https?.href??(/^https:/i.test(asset?.href??'')?asset.href:null);
    return{...product,targetCaseIds:[...new Set(product.targetCaseIds)].sort(),catalogueValidation:item.id===product.id?'VALID':'IDENTITY_MISMATCH',httpStatus:response.status,collection:item.collection??null,observedAt:item.properties?.datetime??item.properties?.start_datetime??product.observedAt,asset:{name:item.assets?.FRP_in?'FRP_in':item.assets?.FRP_MWIR1km_STANDARD?'FRP_MWIR1km_STANDARD':null,mediaType:asset?.type??null,sizeBytes:asset?.['file:size']??null,checksum:asset?.['file:checksum']??null,protectedHttpsAvailable:Boolean(href),authenticationReference:asset?.alternate?.https?.['auth:refs']??asset?.['auth:refs']??[]},payloadProcessingState:'NOT_ACQUIRED_PROTECTED_ASSET'};
  }catch(error){return{...product,targetCaseIds:[...new Set(product.targetCaseIds)].sort(),catalogueValidation:'FAILED',httpStatus:null,error:String(error.message??error),payloadProcessingState:'NOT_ACQUIRED_PROTECTED_ASSET'};}
}
const rows=[];for(const product of products.values()){rows.push(await validate(product));await wait(400);}
rows.sort((a,b)=>a.id.localeCompare(b.id));
const valid=rows.filter((item)=>item.catalogueValidation==='VALID'),assetReady=valid.filter((item)=>item.asset?.protectedHttpsAvailable),artifact={schema:'vigia.sentinel3-catalogue-product-manifest.v1',generatedAt:new Date().toISOString(),input:{path:path.relative(root,inputPath),checksumSha256:sha(await readFile(inputPath))},credentialAvailability:{configured:Boolean(credentials.accessToken||credentials.usernamePassword),fieldsPresent:credentials,secretValuesRecorded:false},summary:{returnedUniqueProducts:products.size,catalogueProductsProcessed:rows.length,catalogueProductsValidated:valid.length,protectedAssetsResolved:assetReady.length,rawProductsDownloaded:0,rawProductsArchived:0,scienceProductsParsed:0,positiveSentinel3Observations:0,twoFamilyEvents:0},providerBlocker:{scope:'CDSE_PROTECTED_PAYLOAD_ONLY',state:credentials.accessToken||credentials.usernamePassword?'UNEXPECTED_NO_ACQUISITION':'BLOCKED_CREDENTIALS_NOT_DURABLY_AVAILABLE',evidence:'Public STAC metadata is readable, while FRP_in protected HTTPS assets declare OIDC authentication and cannot be fetched without a token. No secret was printed or persisted.',independentWorkContinues:true},products:rows};
artifact.evidenceHash=`sha256:${sha(JSON.stringify(artifact))}`;
await writeFile(outputPath,`${JSON.stringify(artifact)}\n`);
console.log(JSON.stringify({outputPath,evidenceHash:artifact.evidenceHash,summary:artifact.summary,providerBlocker:artifact.providerBlocker},null,2));
