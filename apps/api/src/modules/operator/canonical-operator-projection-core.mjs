import { capabilitiesFor } from '../../../../../packages/domain/src/authorization.mjs';

export const ready=(value,authority)=>({state:'READY',authority,value});
export const degraded=(value,reason,authority)=>({state:'DEGRADED',authority,reason:String(reason??'dependency_degraded'),value});
export const unavailable=(reason,authority)=>({state:'UNAVAILABLE',authority,reason:String(reason??'dependency_unavailable'),value:null});
export const kinds=(objects={},matcher)=>Object.entries(objects).filter(([kind])=>matcher.test(kind)).flatMap(([,rows])=>rows);
export const array=value=>Array.isArray(value)?value:[];
export const records=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];
export const values=value=>Array.isArray(value)?value:Object.values(value??{});
export const uniqueBy=(items,keyOf)=>[...new Map(array(items).map((item,index)=>[String(keyOf(item,index)),item])).values()];
export const OPERATOR_WIRE_LIMITS=Object.freeze({portfolioActivities:24,portfolioDecisions:16,portfolioWatch:16,portfolioBlocked:16,portfolioAnomalies:16,decisionBlockers:12,humanAttentionReferences:12,informationRequirements:30,collectionTasksPerRequirement:12,responseMapFeatures:24});
export const wireInventory=(source,returned,{reference=null}={})=>{const rows=array(source),bounded=array(returned);return{total:rows.length,returned:bounded.length,truncated:rows.length>bounded.length,...(reference?{reference}: {})};};
export const boundedWireRows=(source,limit,projector=value=>value,{reference=null}={})=>{const rows=array(source),bounded=rows.slice(0,Math.max(0,limit)).map(projector);return{rows:bounded,inventory:wireInventory(rows,bounded,{reference})};};
export const compactReferenceRows=(source,limit=OPERATOR_WIRE_LIMITS.humanAttentionReferences,reference=null)=>boundedWireRows(source,limit,value=>String(value),{reference});
export const actorAuthority=(actor)=>({principalId:actor?.id??null,role:actor?.role??null,capabilities:Array.isArray(actor?.capabilities)?actor.capabilities:capabilitiesFor(actor?.role),incidentScopes:Array.isArray(actor?.incidentScopes)?actor.incidentScopes:[],authenticationMode:actor?.authentication?.mode??null,authenticated:actor?.authentication?.authenticated===true});
export const objectOrNull=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
export const textOrNull=(value)=>typeof value==='string'&&value.trim()?value:null;
export const finiteOrNull=(value)=>typeof value==='number'&&Number.isFinite(value)?value:null;
export const firstText=(...values)=>values.map(textOrNull).find((value)=>value!==null)??null;
export const firstFinite=(...values)=>values.map(finiteOrNull).find((value)=>value!==null)??null;
export const coordinateOrNull=(value)=>Array.isArray(value)&&value.length===2&&value.every((item)=>finiteOrNull(item)!==null)?[...value]:null;
export const coordinatesOrNull=(value)=>Array.isArray(value)&&value.every((item)=>coordinateOrNull(item))?value.map((item)=>[...item]):null;
export const bboxOrNull=(value)=>{if(Array.isArray(value)&&value.length===4&&value.every((item)=>finiteOrNull(item)!==null))return[...value];const source=objectOrNull(value);if(!source)return null;const result={west:finiteOrNull(source.west),east:finiteOrNull(source.east),south:finiteOrNull(source.south),north:finiteOrNull(source.north)};return Object.values(result).every((item)=>item!==null)?result:null;};
export const timestampParts=(value)=>{const timestamp=textOrNull(value),match=timestamp?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})$/);return match?{date:match[1],time:match[2],timezone:match[3]==='Z'?'UTC':match[3]}:{date:null,time:null,timezone:null};};
export const compactAttemptResult=value=>{const source=value&&typeof value==='object'&&!Array.isArray(value)?value:null;if(!source)return source??null;return{state:source.state??source.status??null,outcome:source.outcome??source.resultState??null,reason:source.reason??source.message??null,checkedAt:source.checkedAt??source.lastCheckedAt??source.retrievedAt??source.at??null,observedAt:source.observedAt??source.validAt??null,providerId:source.providerId??source.provider?.id??null,sourceRecordId:source.sourceRecordId??source.recordId??source.providerProductId??null,evidenceId:source.evidenceId??source.evidence?.id??null,receiptId:source.receiptId??source.receipt?.id??source.durableReceipt?.receiptId??null,admissionState:source.admissionState??source.admission?.state??null};};
export const compactTerrainContext=value=>{const source=objectOrNull(value);return source?{state:source.state??null,elevationM:source.elevationM??null,elevationRangeM:source.elevationRangeM??null,slopeDeg:source.slopeDeg??null,aspectDeg:source.aspectDeg??null,localReliefM:source.localReliefM??null,ruggednessM:source.ruggednessM??null,provider:source.provider??null,sourceOwner:source.sourceOwner??null,product:source.product??null,productVersion:source.productVersion??null,resolutionM:source.resolutionM??null,retrievedAt:source.retrievedAt??null,precisionBoundary:source.precisionBoundary??null,decisionBoundary:source.decisionBoundary??null}:source??null;};
export const compactPointContext=value=>{const source=objectOrNull(value);return source?{id:source.id??null,label:source.label??null,kind:source.kind??null,coordinate:coordinateOrNull(source.coordinate),distanceKm:source.distanceKm??null,source:source.source??null,retrievedAt:source.retrievedAt??null,preliminary:source.preliminary===true,method:source.method??null,limitation:source.limitation??null}:source??null;};

export async function safeBounded(authority,operation,timeoutMs){
  let timer;
  try{
    const value=await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(`canonical_dependency_timeout_${timeoutMs}ms`),{code:`canonical_dependency_timeout_${timeoutMs}ms`})),timeoutMs);timer.unref?.();})
    ]);
    return value===null||value===undefined?unavailable('canonical_projection_not_available',authority):ready(value,authority);
  }catch(error){return unavailable(error?.code??error?.message??error,authority);}
  finally{if(timer)clearTimeout(timer);}
}
