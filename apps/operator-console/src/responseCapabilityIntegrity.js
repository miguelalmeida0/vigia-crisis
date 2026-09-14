import { esc } from './components.js?v=2.1.0';
import { operatorText, timeLabel } from './canonicalViewModel.js?v=3.0.0';
import { relativeTimeLabel, vigiaStateLabel } from './operatorPrimitives.js?v=3.2.0';
import { domainActionLabel } from './domainActions.js?v=1.0.0';

const rows=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const present=value=>value!==null&&value!==undefined&&String(value).trim()?String(value).trim():null;
const fact=(name,value)=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`;
const exactTime=(value,projectionAt)=>value?`${timeLabel(value)} · ${relativeTimeLabel(value,projectionAt??Date.now())}`:'No governed time recorded';
const humanState=(value,fallback='Not recorded')=>present(value)?operatorText(value):fallback;
const numberOrNull=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const fieldLabel=value=>operatorText(String(value).replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase()).replace(/\bIcu\b/g,'ICU').replace(/\bEms\b/g,'EMS');

function provenance(value,{fallback,referenceKeys=[]}={}){
  if(typeof value==='string'&&value.trim())return value.trim();
  const source=object(value),name=present(source.provider??source.name??source.label??source.sourceId),references=referenceKeys.map(key=>present(source[key])).filter(Boolean),values=[name,...(references.length?references:[present(source.reference??source.sourceReference??source.sourceRecordId)])].filter(Boolean);
  return[...new Set(values)].join(' · ')||fallback;
}

export function responseFacilityIntegrityFacts(facility,projectionAt){
  const reach=object(facility?.reachability),capacity=object(facility?.dynamicCapacity),freshness=object(facility?.freshness),staticAt=freshness.retrievedAt??freshness.sourceObservedAt??facility?.provenance?.retrievedAt??facility?.provenance?.observedAt,capacityAt=capacity.lastUpdatedAt,routeAt=reach.checkedAt;
  const facilityFreshness=staticAt?`${humanState(freshness.state,'Static snapshot')} · ${exactTime(staticAt,projectionAt)}`:humanState(freshness.state,'Static snapshot time not reported');
  const capacityFreshness=capacityAt?`${humanState(capacity.state,'Capacity report')} · ${exactTime(capacityAt,projectionAt)}`:humanState(capacity.state,'No admitted capacity report');
  return[
    fact('Route provenance',provenance(reach.source,{fallback:'No governed route source',referenceKeys:['reference','routeId']})),
    fact('Static facility provenance',provenance(facility?.provenance,{fallback:'No governed static-facility source',referenceKeys:['sourceRecordId','archivePath']})),
    fact('Dynamic capacity provenance',provenance(capacity.source,{fallback:'No admitted dynamic-capacity source',referenceKeys:['reference','admissionReference']})),
    fact('Facility freshness',facilityFreshness),
    fact('Capacity freshness',capacityFreshness),
    fact('Next expected update',capacity.nextExpectedUpdateAt?exactTime(capacity.nextExpectedUpdateAt,projectionAt):'Not reported by the capacity source'),
    fact('Route checked',exactTime(routeAt,projectionAt))
  ].join('');
}

function capabilityValue(raw){
  const source=object(raw),value=Object.hasOwn(source,'value')?source.value:raw,parts=[];
  if(typeof value==='boolean')parts.push(value?'Yes':'No');
  else if(Array.isArray(value))parts.push(value.length?value.map(item=>humanState(item)).join(' · '):'None recorded');
  else if(value!==null&&value!==undefined&&typeof value!=='object')parts.push(humanState(value));
  else if(value&&typeof value==='object')parts.push(Object.entries(value).map(([key,item])=>`${fieldLabel(key)} ${humanState(item)}`).join(' · '));
  if(source.state)parts.push(humanState(source.state));
  if(source.sourceTag)parts.push(`source ${humanState(source.sourceTag)}`);
  return parts.join(' · ')||'Not reported';
}

function routeSummary(route,fallbackMinutes,fallbackDistance){
  const source=object(route),minutes=numberOrNull(source.travelTimeMinutes??fallbackMinutes),distance=numberOrNull(source.distanceKm??source.routeDistanceKm??fallbackDistance),parts=[];
  if(minutes!==null)parts.push(`${minutes} min`);
  if(distance!==null)parts.push(`${distance} km`);
  if(source.geometryState)parts.push(humanState(source.geometryState));
  return parts.join(' · ')||'No governed route estimate';
}

function constraintSummary(section,{empty}){
  const source=object(section),records=rows(source.closures??source.constraints),descriptions=records.map(item=>present(item?.description??item?.reason??item?.label??item?.id??item)).filter(Boolean);
  return [humanState(source.state,empty),present(source.reason),descriptions.length?descriptions.join(' · '):null].filter(Boolean).join(' · ');
}

export function responseFacilityInspection(facility,projectionAt){
  const reach=object(facility?.reachability),alternate=object(reach.alternativeRoute),confidence=object(reach.confidence),staticEntries=Object.entries(object(facility?.staticCapability));
  return`<details class="response-facility-row__inspection"><summary>Inspect routes, capability, source and constraints</summary><dl>${fact('Current road route',routeSummary(reach.currentRoute,reach.travelTimeMinutes,reach.routeDistanceKm))}${fact('Alternative road route',Object.keys(alternate).length?routeSummary(alternate):humanState(reach.alternativeRouteState,'Not returned'))}${fact('Routing confidence',`${humanState(confidence.state,'Not assessed')}${numberOrNull(confidence.score)===null?'':` · score ${confidence.score}`}`)}${fact('Road closure impact',constraintSummary(reach.roadClosureImpact,{empty:'Not assessed'}))}${fact('Terrain / access constraints',constraintSummary(reach.terrainAccessConstraints,{empty:'Not assessed'}))}${staticEntries.map(([key,value])=>fact(`Static · ${fieldLabel(key)}`,capabilityValue(value))).join('')}${responseFacilityIntegrityFacts(facility,projectionAt)}</dl><p>Static capability is not current availability. Road estimates are not dispatch, assignment, acknowledgement, or arrival.</p></details>`;
}

function lifecycleStage(label,stage,{receiptId=null,secondaryId=null}={}){
  const source=object(stage),identifiers=[receiptId?`receipt ${receiptId}`:null,secondaryId].filter(Boolean).join(' · '),reason=present(source.reason),at=source.recordedAt??source.acknowledgedAt??source.completedAt;
  return`<em><strong>${esc(label)}</strong> · ${esc(humanState(source.state))}${at?` · ${esc(timeLabel(at))}`:''}${identifiers?` · ${esc(identifiers)}`:''}${reason?` · ${esc(reason)}`:''}</em>`;
}

function fieldNetTasks(requirements){
  return rows(requirements).flatMap(requirement=>{
    const executions=rows(requirement?.collectionPlan?.executions),byId=new Map(executions.map(item=>[String(item.collectionTaskId??''),item])),tasks=rows(requirement?.collectionTasks).filter(task=>task?.collectorType==='FIELDNET_TASK'||/fieldnet/i.test(String(task?.strategyId??task?.provider?.id??'')));
    const projected=tasks.map(task=>({requirement,task:{...byId.get(String(task.id??'')),...task}})),known=new Set(tasks.map(task=>String(task.id??'')));
    return projected.concat(executions.filter(item=>/fieldnet/i.test(String(item.strategyId??''))&&!known.has(String(item.collectionTaskId??''))).map(task=>({requirement,task})));
  });
}

function fieldNetLauncher(requirement,task){
  const launcher=object(task?.fieldNetLiteLauncher??task?.fieldNetLite?.launcher??requirement?.fieldNetLiteLauncher),candidate=present(launcher.url),state=String(launcher.state??'').toUpperCase(),authorization=String(launcher.authorizationState??'').toUpperCase(),taskIncident=present(task?.incidentId??requirement?.incidentId),launcherIncident=present(launcher.incidentId);
  if(!candidate||!['READY','AVAILABLE'].includes(state)||!(launcher.authorized===true||authorization==='AUTHORIZED')||(taskIncident&&launcherIncident&&taskIncident!==launcherIncident))return null;
  try{const parsed=new URL(candidate);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||!parsed.pathname.startsWith('/fieldnet-lite/'))return null;return candidate;}catch{return null;}
}

export function responseTaskLifecycle(requirements,projectionAt){
  const tasks=fieldNetTasks(requirements);
  if(!tasks.length)return'';
  return`<section class="operation-inspector__collection response-capability__fieldnet" data-vqa="operations.fieldnet-capacity-lifecycle"><h3>FieldNet capacity-task lifecycle</h3><ol>${tasks.map(({requirement,task})=>{
    const id=task.id??task.collectionTaskId??task.receipt?.sourceRecordId??'not-recorded',delivery=Object.keys(object(task.delivery)).length?object(task.delivery):{state:task.localPersistenceState},ack=object(task.acknowledgement),completion=Object.keys(object(task.localCompletion)).length?object(task.localCompletion):{state:task.localCompletionState},central=Object.keys(object(task.centralReconciliation)).length?object(task.centralReconciliation):{state:task.centralReconciliationState},attempt=`${task.attemptCount??0} attempt${Number(task.attemptCount??0)===1?'':'s'}`,last=task.lastAttempt?`last ${exactTime(task.lastAttempt,projectionAt)}`:'no attempt time',next=task.nextAttempt?`next ${exactTime(task.nextAttempt,projectionAt)}`:'no scheduled retry',deadline=task.deadline?`deadline ${exactTime(task.deadline,projectionAt)}`:'no task deadline',escalation=object(task.escalation);
    const launcher=fieldNetLauncher(requirement,task),launcherState=launcher?'AUTHORIZED_LAUNCHER_PROJECTED':'NOT_PROJECTED';
    return`<li data-fieldnet-task="${esc(id)}"><span><strong>${esc(task.provider?.label??requirement?.question??'Governed FieldNet capacity task')}</strong><small>${esc(`${attempt} · ${last} · ${next} · ${deadline}`)}</small></span>${vigiaStateLabel(task.state??'NOT_RECORDED',{compact:true})}${lifecycleStage('Delivery',delivery,{receiptId:task.receipt?.receiptId??task.receiptId,secondaryId:delivery.recordedTaskId?`task ${delivery.recordedTaskId}`:null})}${lifecycleStage('Acknowledgement',ack,{receiptId:ack.receiptId,secondaryId:ack.acknowledgementId?`acknowledgement ${ack.acknowledgementId}`:null})}${lifecycleStage('Local completion',completion,{receiptId:completion.receiptId??completion.completionReceiptId,secondaryId:completion.completionId?`completion ${completion.completionId}`:null})}${lifecycleStage('Central reconciliation',central,{receiptId:central.receiptId,secondaryId:central.centralRecordId?`record ${central.centralRecordId}`:central.centralCursor?`cursor ${central.centralCursor}`:null})}<em><strong>Escalation</strong> · ${esc(humanState(escalation.state))} · ${esc(humanState(escalation.escalateTo,'Owner not reported'))}</em><em data-vqa="operations.fieldnet-lite-launcher" data-launcher-state="${launcherState}"><strong>FieldNet Lite</strong> · ${launcher?`<a href="${esc(launcher)}" target="_blank" rel="noopener">Open authorized task interface</a>`:'Authorized launcher not projected; no port, token, readiness, or interface URL is inferred.'}</em></li>`;
  }).join('')}</ol><small>Persistence, acknowledgement, completion, and reconciliation are separate receipts. None proves resource availability until an attributable report is admitted.</small></section>`;
}

const reviewItems=value=>rows(value?.items??value);
function reviewBinding(receipt,recommendation,projection){const sameSemantic=String(receipt?.recommendationVersion??'')===String(recommendation?.recommendationVersion??'')&&String(receipt?.recommendationHash??'')===String(recommendation?.recommendationHash??'');return!receipt?.receiptId?'UNREVIEWED':String(receipt.projectionId)===String(projection?.projectionId)&&sameSemantic?'CURRENT_PROJECTION_EXACT_BINDING':sameSemantic?'PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION':'SUPERSEDED_BY_CURRENT_RECOMMENDATION_REVIEW_REQUIRED';}
function matchingReview(reviews,recommendation,projection){const matches=reviewItems(reviews).filter(item=>String((item?.receipt??item)?.recommendationId??'')===String(recommendation?.recommendationId??recommendation?.id??'')),exact=matches.find(item=>reviewBinding(item?.receipt??item,recommendation,projection)==='CURRENT_PROJECTION_EXACT_BINDING');return exact??matches.at(-1)??null;}
function receiptFor(review,transient){return review?.receipt??review?.reviewReceipt??(review?.receiptId?review:null)??transient??null;}

export function responseRecommendationCard(item,{projection,reviews,interactive=false,pendingRecommendationId=null,transientReviewReceipts={}}={}){
  const recommendationId=item?.recommendationId??item?.id,review=matchingReview(reviews,item,projection),receipt=receiptFor(review,recommendationId?transientReviewReceipts[recommendationId]:null),bindingState=reviewBinding(receipt,item,projection),currentReview=bindingState==='CURRENT_PROJECTION_EXACT_BINDING',pending=String(pendingRecommendationId??'')===String(recommendationId??''),bound=Boolean(recommendationId&&projection?.projectionId&&item?.recommendationVersion&&item?.recommendationHash),validUntil=item?.validUntil??item?.expiresAt,expired=Number.isFinite(Date.parse(validUntil))&&Date.parse(validUntil)<=Date.now(),reviewable=interactive&&bound&&!expired&&!currentReview;
  const state=pending?'RECORDING_REVIEW':currentReview?(review?.disposition??receipt?.disposition??review?.state):item?.state??'AWAITING_REVIEW',recordedAt=receipt?.recordedAt??review?.recordedAt,receiptId=receipt?.receiptId,priorReview=receiptId&&!currentReview,priorReason=bindingState==='PRIOR_PROJECTION_SAME_SEMANTIC_RECOMMENDATION'?'projection binding changed; the current projection requires review':'supporting evidence changed; the current recommendation requires review';
  return`<article data-response-recommendation="${esc(recommendationId??'unbound')}" data-recommendation-version="${esc(item?.recommendationVersion??'unbound')}" data-response-review-binding="${esc(bindingState)}"><span>${vigiaStateLabel(state,{compact:true})}</span><strong>${esc(item?.recommendation??item?.label??'Response recommendation')}</strong><p>${esc(item?.basis??item?.reason??item?.why??item?.tradeOffs??'Recommendation basis not reported')}</p><small>Valid until ${esc(validUntil?exactTime(validUntil,projection?.generatedAt):'not established')} · freshness ${esc(humanState(item?.freshnessRequirement,'requirement not reported'))}</small><small>Invalidates when: ${esc(humanState(item?.nextInvalidatingCondition,'condition not reported'))}</small><small>Next source update: ${esc(item?.nextSourceUpdate?exactTime(item.nextSourceUpdate,projection?.generatedAt):humanState(item?.nextSourceUpdateState,'not scheduled'))}</small><small>${esc(operatorText(item?.authority??'PLANNING_SUPPORT_ONLY'))} · acknowledgement is review state only</small>${receiptId?`<small ${priorReview?'data-response-prior-review-receipt':'data-response-review-receipt'}="${esc(receiptId)}">${priorReview?`Prior review retained; ${priorReason}`:'Durable review receipt'} ${esc(receiptId)}${recordedAt?` · ${esc(timeLabel(recordedAt))}`:''}</small>`:''}${interactive&&!bound?'<small>Review unavailable: exact projection, version, and hash binding are not present.</small>':''}${reviewable?`<button class="button button--secondary" data-action="response-recommendation-review:${esc(encodeURIComponent(recommendationId))}" ${pending?'disabled':''}>${esc(pending?'Recording review…':domainActionLabel('AcknowledgeResponseRecommendation'))}</button>`:''}</article>`;
}
