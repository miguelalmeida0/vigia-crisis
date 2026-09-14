import { json } from '../../http/responses.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../../config/env.mjs';
import { hasGlobalIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

const sensitiveProvenanceKey=/(?:token|secret|credential|authorization|cookie|password|headers?|localPath|filesystem)/i;
const locatorKey=/(?:url|href|uri|path)$/i;
function publicLocator(value){try{const url=new URL(String(value));if(!['http:','https:'].includes(url.protocol))return null;url.username='';url.password='';url.search='';url.hash='';return url.toString();}catch{return null;}}
function compactProvenance(value,depth=0){if(depth>3)return null;if(value==null||typeof value==='boolean'||typeof value==='number')return value;if(typeof value==='string')return /^https?:\/\//i.test(value)?publicLocator(value):value.slice(0,240);if(Array.isArray(value))return value.slice(0,20).map(item=>compactProvenance(item,depth+1)).filter(item=>item!==null);if(typeof value!=='object')return null;return Object.fromEntries(Object.entries(value).slice(0,40).flatMap(([key,item])=>{if(sensitiveProvenanceKey.test(key))return[];if(locatorKey.test(key)){const locator=publicLocator(item);return locator?[[key,locator]]:[];}const compacted=compactProvenance(item,depth+1);return compacted===null?[]:[[key,compacted]];}));}
function compactFinding(item){return{findingId:item.findingId,kind:item.kind,place:item.place,municipality:item.municipality,district:item.district,coordinate:item.coordinate,affectedAreaHa:item.affectedAreaHa,corridorLengthM:item.corridorLengthM,nearestStructureM:item.nearestStructureM,structuresWithinPolicyRadius:item.structuresWithinPolicyRadius,firstObservableInterval:item.firstObservableInterval,currentObservationId:item.currentObservationId,comparisonObservationId:item.comparisonObservationId,detectorVersion:item.detectorVersion,attentionPriority:item.attentionPriority,reviewSummary:item.reviewSummary,sourceQuality:item.sourceQuality,rationale:item.rationale,evidenceNeedId:item.evidenceNeedId,evidenceRequestId:item.evidenceRequestId,provenance:compactProvenance(item.provenance)};}
function compactNeed(item){const methods=item.candidateMethods??[],selected=methods.find((method)=>method.id===item.selectedMethodId)??methods.find((method)=>['AVAILABLE_NOW','MANUAL_REQUEST','SCHEDULED_CONFIRMED'].includes(method.availability))??methods[0];return{id:item.id,kind:item.kind,subjectId:item.subjectId,subjectLabel:item.subjectLabel,state:item.state,missingQuantity:item.missingQuantity,reason:item.reason,ownerId:item.ownerId,evidenceRequestId:item.evidenceRequestId,selectedMethodId:item.selectedMethodId,candidateMethods:selected?[{id:selected.id,label:selected.label,availability:selected.availability}]:[],serviceLevel:item.serviceLevel?{acknowledgementDueAt:item.serviceLevel.acknowledgementDueAt}:null,nextObservationAt:item.nextObservationAt};}
function compactRequest(item){return{id:item.id,evidenceNeedId:item.evidenceNeedId,targetId:item.targetId,targetType:item.targetType,title:item.title,state:item.state,priority:item.priority,ownerId:item.ownerId,dueAt:item.dueAt,createdAt:item.createdAt,acknowledgedAt:item.acknowledgedAt,resolvedAt:item.resolvedAt,evidencePackageId:item.evidencePackageId,actionDisposition:item.actionDisposition};}

export function commandProjection(full,operationsHandoff=null){
  const operations=full.operations??{},prevention=full.prevention??{};
  const evidenceNeeds=(operations.evidenceNeeds??[]).filter((item)=>item.state!=='RESOLVED'),needIds=new Set(evidenceNeeds.map((item)=>item.id)),evidenceRequests=(operations.evidenceRequests??[]).filter((item)=>needIds.has(item.evidenceNeedId)&&!['accepted','rejected','cancelled'].includes(item.state));
  return{meta:{...full.meta,projection:'command-core.v1'},actor:full.actor,control:{actors:full.control?.actors??[]},sources:full.sources??{},world:{projection:{kind:'command-core',detail:'Risk rasters and historical geometry load only inside their dedicated workspaces.'}},prevention:{summary:prevention.summary??{},validation:prevention.validation??{},findings:(prevention.findings??[]).map(compactFinding),candidates:[]},detection:{incidents:[]},operations:{restricted:operations.restricted===true,evidenceNeeds:evidenceNeeds.map(compactNeed),evidenceRequests:evidenceRequests.map(compactRequest),evidencePackages:[],hazards:[],remediations:[],reobservations:[],watchPlaces:[],watchedEventIds:operations.watchedEventIds??[],effectiveness:operations.effectiveness??{},systemActionability:operations.systemActionability??{},traceCompleteness:operations.traceCompleteness??null},operationsHandoff,outcomes:{restricted:true,metrics:null,loops:[]}};
}

async function readOperationsHandoff(){
  const directory=path.join(projectRoot,'data/validation/operations'),read=async(name)=>{try{return JSON.parse(await readFile(path.join(directory,name),'utf8'));}catch{return null;}};
  const [category,live,truthAutopilot]=await Promise.all(['category-leadership-operations-handoff.json','live-operations-handoff.json','truth-autopilot-handoff.json'].map(read));
  const base=category??live??{};
  return Object.keys(base).length||truthAutopilot?{...base,truthAutopilot}:null;
}

export function scopedOperationsHandoff(actor,handoff){return hasGlobalIncidentScope(actor)?handoff:(handoff?{restricted:true,reason:'Global validation handoff requires wildcard incident scope.'}:null);}
export function commandAuthorizationFingerprint(actor={}){return JSON.stringify({id:actor.id??null,role:actor.role??null,incidentScopes:[...(actor.incidentScopes??[])].sort(),capabilities:[...(actor.capabilities??[])].sort(),authenticationMode:actor.authentication?.mode??null});}

export function registerCommandProjectionRoutes(router,{groundTruthService}){
  const cache=new Map();
  router.get('/api/v10/workspaces/command',async({res,context})=>{const key=commandAuthorizationFingerprint(context.actor),cached=cache.get(key);if(cached&&cached.expiresAt>Date.now())return json(res,200,cached.value);const handoff=hasGlobalIncidentScope(context.actor)?await readOperationsHandoff():null,value=commandProjection(await groundTruthService.bootstrap(context.actor),scopedOperationsHandoff(context.actor,handoff));cache.set(key,{value,expiresAt:Date.now()+5_000});if(cache.size>128)cache.delete(cache.keys().next().value);json(res,200,value);});
}
