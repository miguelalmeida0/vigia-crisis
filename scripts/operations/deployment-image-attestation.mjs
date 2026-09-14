import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { canonical } from '../../packages/domain/src/fieldnet/contracts.mjs';
import { computeOperatorAssetTree } from '../../apps/operator-console/asset-integrity.mjs';
import { sha256 } from '../release/release_statement.mjs';

const IMAGE_ID=/^sha256:[a-f0-9]{64}$/;
const PROFILE=Object.freeze({
  api:{directories:['apps/api','apps/field-node','packages','scripts','data/config','data/reference','data/replay/corpus','data/replay/results','data/validation/measurement-debt','data/validation/fieldnet','data/validation/pilot'],files:['package.json','package-lock.json','data/validation/detection/portugal-2023-v4-confirmatory-benchmark.json','data/validation/detection/portugal-2024-small-fire-opportunity.json','data/validation/detection/sentinel3-portugal-2024-product-manifest.json','data/validation/physical-sensing/gold-specialist-handoff.json','data/validation/prevention/portugal-sentinel2-review-corpus-v3.json','data/validation/prevention/portugal-sentinel2-expert-review-pack-v1.json','data/validation/prevention/portugal-sentinel2-expert-review-key-v1.json','data/validation/prevention/consensus-topology-evaluation-v1.json'],exclude:[]},
  operator:{directories:['apps/operator-console'],files:['packages/domain/src/operator-proxy/request-auth.mjs','data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json'],exclude:['apps/operator-console/dist']}
});
const LIMITS=Object.freeze({maxFiles:20_000,maxFileBytes:64*1024*1024,maxAggregateBytes:1024*1024*1024});
const excluded=(name,profile)=>/(?:^|\/)(?:\.cache|\.next|\.tmp|\.venv|__pycache__|node_modules|coverage|dist|build|playwright-report|test-results)(?:\/|$)|(?:^|\/)\.DS_Store$|\.(?:log|pid|sock|tmp)$/i.test(name)||profile.exclude.some((prefix)=>name===prefix||name.startsWith(`${prefix}/`));

async function lockedRead(file,relative){let handle;try{handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);const metadata=await handle.stat();if(!metadata.isFile()||metadata.size>LIMITS.maxFileBytes)throw new Error(`deployment_image_file_invalid:${relative}`);return{bytes:await handle.readFile(),metadata};}catch(error){if(error?.code==='ELOOP')throw new Error(`deployment_image_symlink_forbidden:${relative}`);throw error;}finally{await handle?.close();}}
async function walk(root,directory,profile,output){for(const entry of await readdir(directory,{withFileTypes:true})){const absolute=path.join(directory,entry.name),relative=path.relative(root,absolute).replaceAll(path.sep,'/');if(excluded(relative,profile))continue;const metadata=await lstat(absolute);if(metadata.isSymbolicLink())throw new Error(`deployment_image_symlink_forbidden:${relative}`);if(metadata.isDirectory()){await walk(root,absolute,profile,output);continue;}if(!metadata.isFile())throw new Error(`deployment_image_entry_invalid:${relative}`);output.push(absolute);if(output.length>LIMITS.maxFiles)throw new Error('deployment_image_file_count_exceeded');}}

export async function verifyExtractedApplicationImage({extractedRoot,profile:profileName,releaseSource,expectedReleaseDocuments={},expectedOperatorBuild=null}){
  const root=path.resolve(extractedRoot),profile=PROFILE[profileName];if(!profile)throw new Error('deployment_image_profile_invalid');
  const selected=(name)=>profile.files.includes(name)||profile.directories.some((prefix)=>name===prefix||name.startsWith(`${prefix}/`))&&!excluded(name,profile);
  const expected=new Map((releaseSource?.entries??[]).filter((item)=>selected(item.path)).map((item)=>[item.path,item]));if(!expected.size)throw new Error('deployment_image_expected_source_empty');
  const actual=[];for(const directory of profile.directories)await walk(root,path.join(root,directory),profile,actual);for(const file of profile.files)actual.push(path.join(root,file));
  let aggregateBytes=0;const seen=new Set(),verified=[];
  for(const file of actual.sort()){const name=path.relative(root,file).replaceAll(path.sep,'/');if(seen.has(name))continue;seen.add(name);const expectedEntry=expected.get(name);if(!expectedEntry)throw new Error(`deployment_image_unexpected_file:${name}`);const{bytes,metadata}=await lockedRead(file,name);aggregateBytes+=bytes.length;if(aggregateBytes>LIMITS.maxAggregateBytes)throw new Error('deployment_image_aggregate_bytes_exceeded');const mode=(metadata.mode&0o111)?'0755':'0644';if(mode!==expectedEntry.mode||sha256(bytes)!==expectedEntry.sha256)throw new Error(`deployment_image_digest_mismatch:${name}`);verified.push({path:name,sha256:expectedEntry.sha256});}
  for(const name of expected.keys())if(!seen.has(name))throw new Error(`deployment_image_missing_file:${name}`);
  for(const[name,expectedHash]of Object.entries(expectedReleaseDocuments)){const{bytes}=await lockedRead(path.join(root,name),name);if(sha256(bytes)!==expectedHash)throw new Error(`deployment_image_release_document_mismatch:${name}`);}
  let operatorAssets=null;
  if(profileName==='operator'){
    const buildFile='apps/operator-console/dist/build-manifest.json',{bytes}=await lockedRead(path.join(root,buildFile),buildFile),build=JSON.parse(bytes.toString('utf8'));
    operatorAssets=computeOperatorAssetTree(path.join(root,'apps/operator-console/dist'));
    if(!expectedOperatorBuild||build.releaseId!==expectedOperatorBuild.releaseId||build.codeStateHash!==expectedOperatorBuild.codeStateHash||build.operationalDataHash!==expectedOperatorBuild.operationalDataHash||build.releaseStatementHash!==expectedOperatorBuild.releaseStatementHash||build.operatorSourceHash!==expectedOperatorBuild.operatorSourceHash||build.assetDigest!==expectedOperatorBuild.assetDigest||operatorAssets.assetDigest!==build.assetDigest)throw new Error('deployment_operator_final_asset_identity_mismatch');
  }
  return{schemaVersion:'vigia.deployment-image-filesystem-verification.v1',state:'PASS',profile:profileName,verifiedFiles:verified.length,verifiedBytes:aggregateBytes,verifiedSourceDigest:sha256(verified.map((item)=>`${item.path}\0${item.sha256}`).join('\n')),operatorAssets};
}

function validateImage(image){if(!image||!IMAGE_ID.test(image.imageId??'')||!Number.isInteger(image.baseLayerCount)||image.baseLayerCount<1||!Array.isArray(image.rootfsLayers)||image.rootfsLayers.length<image.baseLayerCount||!image.rootfsLayers.every((value)=>IMAGE_ID.test(value)))throw new Error('deployment_image_attestation_image_invalid');return image;}
function attestationPayload({release,images,verifications,issuedAt,nonce}){
  if(!release||!/^sha256:[a-f0-9]{64}$/.test(release.releaseStatementHash??'')||!release.releaseId||!/^sha256:[a-f0-9]{64}$/.test(release.codeStateHash??'')||!/^sha256:[a-f0-9]{64}$/.test(release.operationalDataHash??''))throw new Error('deployment_image_attestation_release_invalid');
  if(!/^[a-f0-9]{64}$/.test(nonce??'')||Number.isNaN(Date.parse(issuedAt??'')))throw new Error('deployment_image_attestation_freshness_invalid');
  const api=validateImage(images?.api),operator=validateImage(images?.operator);if(api.component!=='api-fieldnode'||operator.component!=='operator-console'||verifications?.api?.state!=='PASS'||verifications?.operator?.state!=='PASS')throw new Error('deployment_image_attestation_verification_invalid');
  return{schemaVersion:'vigia.detached-deployment-image-attestation.v1',issuedAt,nonce,release:{releaseId:release.releaseId,codeStateHash:release.codeStateHash,operationalDataHash:release.operationalDataHash,releaseStatementHash:release.releaseStatementHash},images:{api,operator},verifications};
}
export function createDetachedImageAttestation(input,key){if(!key||Buffer.byteLength(key)<32)throw new Error('deployment_image_attestation_key_invalid');const payload=attestationPayload(input),mac=`hmac-sha256:${createHmac('sha256',key).update(canonical(payload)).digest('hex')}`;return{...payload,mac};}
export function verifyDetachedImageAttestation(document,key,{release,actualImageIds}={}){
  if(!document||!key||Buffer.byteLength(key)<32||!/^hmac-sha256:[a-f0-9]{64}$/.test(document.mac??''))throw new Error('deployment_image_attestation_invalid');const{mac,...unsigned}=document,payload=attestationPayload(unsigned),expected=`hmac-sha256:${createHmac('sha256',key).update(canonical(payload)).digest('hex')}`,left=Buffer.from(mac),right=Buffer.from(expected);if(left.length!==right.length||!timingSafeEqual(left,right))throw new Error('deployment_image_attestation_mac_invalid');
  for(const field of ['releaseId','codeStateHash','operationalDataHash','releaseStatementHash'])if(release&&payload.release[field]!==release[field])throw new Error(`deployment_image_attestation_${field}_mismatch`);
  if(actualImageIds&&(payload.images.api.imageId!==actualImageIds.api||payload.images.operator.imageId!==actualImageIds.operator))throw new Error('deployment_image_attestation_runtime_image_mismatch');
  return payload;
}

export function assertPinnedBaseLayers(image,base){const layers=image?.RootFS?.Layers??[],baseLayers=base?.RootFS?.Layers??[];if(!baseLayers.length||layers.length<baseLayers.length||baseLayers.some((value,index)=>layers[index]!==value))throw new Error('deployment_image_base_layers_mismatch');return{baseLayerCount:baseLayers.length,rootfsLayers:layers};}

export function imageInspectionRecord({component,image,base}){if(!IMAGE_ID.test(image?.Id??''))throw new Error('deployment_image_id_invalid');const layers=assertPinnedBaseLayers(image,base);return{component,imageId:image.Id,baseLayerCount:layers.baseLayerCount,rootfsLayers:layers.rootfsLayers,created:image.Created??null,architecture:image.Architecture??null,os:image.Os??null};}
