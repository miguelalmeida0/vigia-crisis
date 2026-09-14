import { incidentIdForResource } from '../../../../../packages/domain/src/authorization.mjs';

export const DEFAULT_OPERATOR_STATE_CAPACITY=Object.freeze({
  maxEvidenceRequests:10_000,maxEvidenceRequestsPerIncident:500,maxEvidenceRequestsPerPrincipal:1_000,maxEvidenceRequestBytes:64*1024*1024,maxEvidenceRequestBytesPerIncident:8*1024*1024,maxEvidenceRequestBytesPerPrincipal:16*1024*1024,
  maxEvidencePackages:10_000,maxEvidencePackagesPerIncident:500,maxEvidencePackagesPerPrincipal:1_000,maxEvidencePackageBytes:256*1024*1024,maxEvidencePackageBytesPerIncident:32*1024*1024,maxEvidencePackageBytesPerPrincipal:64*1024*1024
});

const bytes=(value)=>Buffer.byteLength(JSON.stringify(value));
const positive=(value,fallback)=>Math.max(1,Number.isFinite(Number(value))?Number(value):fallback);
const capacityError=(collection,scope,details)=>Object.assign(new Error(`operator_state_${collection}_capacity_reached`),{statusCode:507,details:{scope,...details}});
const databaseInvalidText=()=>Object.assign(new Error('operator_state_database_invalid_text'),{statusCode:400});
export function assertOperatorStatePersistenceSafe(state){
  const pending=[state],seen=new WeakSet();
  while(pending.length){
    const value=pending.pop();
    if(typeof value==='string'){
      if(value.includes('\u0000'))throw databaseInvalidText();
      continue;
    }
    if(!value||typeof value!=='object'||seen.has(value))continue;
    seen.add(value);
    for(const[key,child]of Object.entries(value)){
      if(key.includes('\u0000'))throw databaseInvalidText();
      pending.push(child);
    }
  }
  return true;
}
function usage(rows,keyFor){const buckets=new Map();for(const row of rows){const key=String(keyFor(row)??'UNBOUND'),current=buckets.get(key)??{rows:0,bytes:2};current.rows+=1;current.bytes+=bytes(row)+1;buckets.set(key,current);}return buckets;}
function enforceBuckets(collection,buckets,{maxRows,maxBytes,scope}){for(const[key,value]of buckets){if(value.rows>maxRows)throw capacityError(collection,scope,{key,rows:value.rows,maximum:maxRows});if(value.bytes>maxBytes)throw capacityError(collection,`${scope}_bytes`,{key,bytes:value.bytes,maximumBytes:maxBytes});}}

export function assertOperatorStateCapacity(state,overrides={}){
  assertOperatorStatePersistenceSafe(state);
  const policy=Object.fromEntries(Object.entries(DEFAULT_OPERATOR_STATE_CAPACITY).map(([key,fallback])=>[key,positive(overrides[key],fallback)])),requests=Array.isArray(state.evidenceRequests)?state.evidenceRequests:[],packages=Array.isArray(state.evidencePackages)?state.evidencePackages:[];
  if(requests.length>policy.maxEvidenceRequests)throw capacityError('evidence_request','global',{rows:requests.length,maximum:policy.maxEvidenceRequests});
  const requestBytes=bytes(requests);if(requestBytes>policy.maxEvidenceRequestBytes)throw capacityError('evidence_request','global_bytes',{bytes:requestBytes,maximumBytes:policy.maxEvidenceRequestBytes});
  const incidentForRequest=(row)=>incidentIdForResource(row?.targetType,row?.targetId)??'GLOBAL',principalForRequest=(row)=>row?.requestedBy??'UNKNOWN';
  enforceBuckets('evidence_request',usage(requests,incidentForRequest),{maxRows:policy.maxEvidenceRequestsPerIncident,maxBytes:policy.maxEvidenceRequestBytesPerIncident,scope:'incident'});
  enforceBuckets('evidence_request',usage(requests,principalForRequest),{maxRows:policy.maxEvidenceRequestsPerPrincipal,maxBytes:policy.maxEvidenceRequestBytesPerPrincipal,scope:'principal'});
  if(packages.length>policy.maxEvidencePackages)throw capacityError('evidence_package','global',{rows:packages.length,maximum:policy.maxEvidencePackages});
  const packageBytes=bytes(packages);if(packageBytes>policy.maxEvidencePackageBytes)throw capacityError('evidence_package','global_bytes',{bytes:packageBytes,maximumBytes:policy.maxEvidencePackageBytes});
  const requestsById=new Map(requests.map((row)=>[String(row?.id),row])),incidentForPackage=(row)=>{const request=requestsById.get(String(row?.requestId));return request?incidentForRequest(request):'UNBOUND';},principalForPackage=(row)=>row?.observerId??'UNKNOWN';
  enforceBuckets('evidence_package',usage(packages,incidentForPackage),{maxRows:policy.maxEvidencePackagesPerIncident,maxBytes:policy.maxEvidencePackageBytesPerIncident,scope:'incident'});
  enforceBuckets('evidence_package',usage(packages,principalForPackage),{maxRows:policy.maxEvidencePackagesPerPrincipal,maxBytes:policy.maxEvidencePackageBytesPerPrincipal,scope:'principal'});
  return true;
}
