import path from 'node:path';
import { readdir,readFile,stat } from 'node:fs/promises';

const stateKey=(state)=>[state.providerId,state.providerFeatureId,state.revision,state.originalGeometryHash].join(':');
const observationKey=(item)=>item.causalRoot??item.id;
const score=(item)=>Number(Boolean(item.fuelPack))+Number(Boolean(item.terrainPack))+Number((item.weatherRuns??[]).length>0)+Number((item.physicalObservations??[]).length>0)+Number(Boolean(item.terrainPack?.verticalDatum))+Number(item.terrainPack?.solverCompatibility==='CERTIFIED_CONTEXT_INPUT')*2+Number((item.weatherRuns??[]).some((run)=>run.valuesDecoded===true))*2+Number((item.weatherRuns??[]).length>0&&(item.weatherRuns??[]).every((run)=>run.archiveIdentity&&run.retrievedAt));

export function mergeSilverIncident(prior,incoming){
  if(!prior)return incoming;
  const preferred=score(incoming)>=score(prior)?incoming:prior,other=preferred===incoming?prior:incoming;
  const result={...preferred};
  result.perimeterStates=[...new Map([...(other.perimeterStates??[]),...(preferred.perimeterStates??[])].map((state)=>[stateKey(state),state])).values()].sort((left,right)=>left.revision-right.revision);
  result.weatherRuns=[...new Map([...(other.weatherRuns??[]),...(preferred.weatherRuns??[])].map((run)=>[run.runId,run])).values()].sort((left,right)=>left.runId.localeCompare(right.runId));
  result.physicalObservations=[...new Map([...(other.physicalObservations??[]),...(preferred.physicalObservations??[])].map((item)=>[observationKey(item),item])).values()].sort((left,right)=>observationKey(left).localeCompare(observationKey(right)));
  result.upstreamObservationIds=[...new Set(result.physicalObservations.map((item)=>item.causalRoot).filter(Boolean))].sort();
  result.physicalPixelIds=[...result.upstreamObservationIds];
  result.causalFamilies=[...new Set(result.physicalObservations.map((item)=>item.instrumentFamily).filter(Boolean))].sort();
  return result;
}

export async function loadMergedSilverIncidents(directory,{include=(file)=>file.endsWith('.json'),maximumPartitionBytes=64*1024*1024,maximumRssBytes=768*1024*1024}={}){
  const files=(await readdir(directory).catch(()=>[])).filter((file)=>include(file)&&!file.endsWith('.index.json')).sort(),incidents=new Map(),manifestFingerprints=new Set(),partitionStats=[];
  for(const file of files){
    const metadata=await stat(path.join(directory,file));if(metadata.size>maximumPartitionBytes)throw Object.assign(new Error(`silver_partition_memory_budget_exceeded:${file}`),{code:'MEMORY_CIRCUIT_BREAKER',partition:file,bytes:metadata.size,maximumPartitionBytes});
    const bytes=await readFile(path.join(directory,file)),silver=JSON.parse(bytes);
    if(silver.manifestFingerprint)manifestFingerprints.add(silver.manifestFingerprint);
    for(const incident of silver.incidents??[])incidents.set(incident.id,mergeSilverIncident(incidents.get(incident.id),incident));
    const rssBytes=process.memoryUsage().rss;if(rssBytes>maximumRssBytes)throw Object.assign(new Error(`silver_loader_rss_budget_exceeded:${file}`),{code:'MEMORY_CIRCUIT_BREAKER',partition:file,rssBytes,maximumRssBytes});
    partitionStats.push({file,bytes:bytes.byteLength,incidents:(silver.incidents??[]).length,providers:[...(silver.providers??[])].sort(),rssBytes});
  }
  return{files,incidents:[...incidents.values()].sort((left,right)=>left.id.localeCompare(right.id)),manifestFingerprints:[...manifestFingerprints].sort(),partitionStats,backpressure:{maximumConcurrentPartitions:1,maximumPartitionBytes,maximumRssBytes,memoryCircuitBreaker:true}};
}
