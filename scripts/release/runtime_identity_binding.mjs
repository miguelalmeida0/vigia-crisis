import { get as httpGet } from 'node:http';

export const RELEASE_IDENTITY_KEYS=Object.freeze(['releaseId','codeStateHash','operationalDataHash','releaseStatementHash']);

export function releaseIdentityOf(value={}){
  const candidate=value?.releaseIdentity??value;
  return Object.fromEntries(RELEASE_IDENTITY_KEYS.map((key)=>[key,candidate?.[key]??null]));
}

export function assertReleaseIdentity(actual,expected,label='release_identity'){
  const left=releaseIdentityOf(actual),right=releaseIdentityOf(expected),failures=RELEASE_IDENTITY_KEYS.filter((key)=>!right[key]||left[key]!==right[key]);
  if(failures.length)throw new Error(`${label}_mismatch:${failures.join(',')}`);
  return left;
}

export function bindReleaseIdentity(value,identity){return{...value,...releaseIdentityOf(identity)};}

async function jsonProbe(url){
  return new Promise((resolve,reject)=>{
    const request=httpGet(url,{headers:{accept:'application/json'}},response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>1024*1024)request.destroy(new Error('runtime_identity_probe_response_too_large'));
        else chunks.push(chunk);
      });
      response.on('end',()=>{
        const status=Number(response.statusCode??0);let body;
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
        catch{return reject(new Error(`runtime_identity_probe_invalid_json:${url}:${status}`));}
        if(status<200||status>=300)return reject(new Error(`runtime_identity_probe_not_ready:${url}:${status}:${body?.error??body?.ready??'unknown'}`));
        resolve({url,status,ok:true,body});
      });
    });
    request.setTimeout(10_000,()=>request.destroy(new Error('runtime_identity_probe_timeout')));
    request.once('error',error=>reject(new Error(`runtime_identity_probe_failed:${url}:${error.message}`)));
  });
}

export async function probeCanonicalRuntimeIdentity({manifest,apiOrigin='http://127.0.0.1:4177',fieldOrigin='http://127.0.0.1:4188',operatorOrigin='http://127.0.0.1:4190'}={}){
  const [api,fieldnet,fieldnetReadiness,operator]=await Promise.all([
    jsonProbe(`${apiOrigin}/api/v10/release`),
    jsonProbe(`${fieldOrigin}/api/fieldnet/release`),
    jsonProbe(`${fieldOrigin}/ready`),
    jsonProbe(`${operatorOrigin}/__operator/ready`)
  ]);
  const identity=assertReleaseIdentity(api.body,manifest,'api_manifest_release_identity');
  assertReleaseIdentity(fieldnet.body,identity,'fieldnet_api_release_identity');
  assertReleaseIdentity(fieldnet.body?.schema?.deploymentIdentity,identity,'fieldnet_deployment_release_identity');
  assertReleaseIdentity(operator.body,identity,'operator_api_release_identity');
  if(api.body?.process?.servicesReady!==true||api.body?.process?.startup?.ready!==true)throw new Error('api_runtime_not_ready_for_certification');
  if(fieldnet.body?.process?.servicesReady!==true||fieldnet.body?.process?.startup?.ready!==true)throw new Error('fieldnet_release_lifecycle_not_ready_for_certification');
  if(fieldnetReadiness.body?.ready!==true)throw new Error('fieldnet_authoritative_readiness_not_ready_for_certification');
  if(operator.body?.ok!==true||operator.body?.frontend!=='operator-console')throw new Error('operator_runtime_not_ready_for_certification');
  return{identity,api:api.body,fieldnet:fieldnet.body,fieldnetReadiness:fieldnetReadiness.body,operator:operator.body,probedAt:new Date().toISOString()};
}
