import { EVIDENCE_NEED_STATES, createEvidenceNeed, transitionEvidenceNeed } from '../../../../../packages/domain/src/evidence-need.mjs';
import { transitionEvidenceRequest } from '../../../../../packages/domain/src/evidence-request.mjs';
import { assertCan, hasGlobalIncidentScope, incidentIdForResource, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';
import { ACTIVE_REQUEST_STATES, acceptedObservation, actorById, candidateMethods, createRequestForNeed, eligibleForEventGraph, evidenceNeedId, escalationActor, fieldActor, needDisposition, rankingFor, selectMethod, targetId } from './evidence-need-policy.mjs';

function linkedRequest(requests, event, needId) {
  return requests.find((item) => item.evidenceNeedId === needId)
    ?? requests.find((item) => item.targetId === targetId(event.id) && ACTIVE_REQUEST_STATES.has(item.state)) ?? null;
}
function selectedForExisting(methods, request) { return methods.find((item) => item.id === request?.requestedMethodId) ?? null; }
const INTERNAL_METHODS=new Set(['manual-association-review','existing-evidence-review','repository-evidence-link']);
const BLOCKED_CLASSES=new Set(['WAITING_REMOTE_SENSOR','WAITING_EXPERT_REVIEW','EXTERNALLY_BLOCKED','UNRESOLVABLE']);
function cancelledDisposition(request){
  const note=String(request.history?.at(-1)?.note??'').toLowerCase();
  if(note.includes('duplicate')||note.includes('superseded')||note.includes('no longer contains'))return{class:'SUPERSEDED',reason:request.history?.at(-1)?.note??'A newer canonical request or domain state superseded this work.'};
  if(note.includes('not configured')||note.includes('unobtainable')||note.includes('provider'))return{class:'EXTERNALLY_BLOCKED',reason:request.history?.at(-1)?.note??'A required external capability was unavailable.'};
  return{class:'STALE',reason:request.history?.at(-1)?.note??'The request expired or was cancelled without attributable evidence.'};
}
function activeDisposition({request,hasFieldCapacity}){
  if(request.targetType==='prevention_finding')return{class:'WAITING_EXPERT_REVIEW',reason:'The native Sentinel-2 scene pair is ready, but an attributable qualified human label is mandatory.'};
  if(String(request.missingQuantity??'').includes('association'))return{class:'ASSOCIATION_CLOSABLE',reason:'The uncertainty is an internal evidence-association decision and requires attributable operator review.'};
  if(INTERNAL_METHODS.has(request.requestedMethodId))return{class:'INTERNALLY_CLOSABLE_NOW',reason:'All required evidence is already retained; only an attributable internal lifecycle action remains.'};
  if(request.requestedMethodId==='manual-field-dispatch'&&!hasFieldCapacity)return{class:'EXTERNALLY_BLOCKED',reason:'No field-inspector capacity or confirmed observation schedule is configured.'};
  if(/sentinel|remote|satellite|sensor/i.test(request.requestedMethodId??''))return{class:'WAITING_REMOTE_SENSOR',reason:'The request requires a future or pending remote-sensor observation.'};
  if(request.requestedMethodId==='manual-field-dispatch')return{class:'EXTERNALLY_BLOCKED',reason:'Attributable field acquisition remains a human/external operation, not an internally executable repository action.'};
  return{class:'UNRESOLVABLE',reason:'No evidence-producing method is configured for this open request.'};
}
const NEED_POLICY_VERSION='vigia.evidence-need-policy.v2';
function bindNeed(need,prior,event,at){
  const subjectVersion=String(event?.version??event?.updatedAt??event?.lastSeenAt??event?.physicalState?.lastAt??'unknown');
  const material={subjectType:need.subjectType,subjectId:need.subjectId,subjectVersion,missingQuantity:need.missingQuantity,state:need.state,ownerId:need.ownerId??null,selectedMethodId:need.selectedMethodId??null,policyVersion:NEED_POLICY_VERSION};
  const bindingHash=`sha256:${createHash('sha256').update(JSON.stringify(material)).digest('hex')}`;
  if(prior?.bindingHash===bindingHash)return{...need,version:Number(prior.version??1),bindingHash,subjectVersion,policyVersion:NEED_POLICY_VERSION,updatedAt:prior.updatedAt};
  return{...need,version:Number(prior?.version??0)+1,bindingHash,subjectVersion,policyVersion:NEED_POLICY_VERSION,updatedAt:at};
}

export class EvidenceNeedService {
  constructor({ repository, eventRepository = null, auditService, fallbackOwner = null, automaticRequestCreation = true, clock = () => new Date(), onChanging=()=>{},onChanged = () => {},onChangeFailed=()=>{} }) {
    Object.assign(this, { repository, eventRepository, auditService, fallbackOwner, automaticRequestCreation, clock,onChanging,onChanged,onChangeFailed });
  }
  snapshot(actor = null) { if (actor) assertCan(actor, 'read:evidence'); const needs = (this.repository.snapshotFields?.(['evidenceNeeds']) ?? this.repository.snapshot()).evidenceNeeds ?? []; return actor ? needs.filter((item) => { const incidentId = incidentIdForResource(item.subjectType, item.subjectId); return incidentId ? incidentInScope(actor, incidentId) : hasGlobalIncidentScope(actor); }) : needs; }

  async sync(events = []) {
    const now = this.clock(), at = now.toISOString(), audit = [],affectedIncidentIds=new Set(events.filter((item)=>item?.id).map((item)=>String(item.id)));
    let changeEvent=null,changeLease=null;try{await this.repository.mutate(async(state) => {
      const needs = [...(state.evidenceNeeds ?? [])], requests = [...(state.evidenceRequests ?? [])], unresolvedSubjects = new Set();
      const planningState=this.fallbackOwner&&!actorById(state,this.fallbackOwner.id)?{...state,actors:[...(state.actors??[]),this.fallbackOwner]}:state;
      for (const event of events.filter((item) => item?.id && item.actionNeed?.needsRouting)) {
        unresolvedSubjects.add(String(event.id));
        const needId = evidenceNeedId(event), index = needs.findIndex((item) => item.id === needId), methods = candidateMethods(event);
        let request = linkedRequest(requests, event, needId), method = selectedForExisting(methods, request), owner = actorById(planningState, request?.ownerId);
        if (!request || !ACTIVE_REQUEST_STATES.has(request.state)) ({ method, owner } = selectMethod(planningState, methods));
        if (!request && owner && this.automaticRequestCreation) {
          request = createRequestForNeed({ needId, event, owner, method, now }); requests.unshift(request);
          audit.push({ type: 'evidence.requested', entityType: 'evidence_request', entityId: request.id, payload: { targetId: request.targetId, evidenceNeedId: needId, ownerId: owner.id } });
        }
        if (request && !request.evidenceNeedId) {
          const requestIndex = requests.findIndex((item) => item.id === request.id);
          request = { ...request, evidenceNeedId: needId, missingQuantity: event.actionNeed.kind, requestedMethodId: method?.id ?? request.requestedMethodId };
          requests[requestIndex] = request;
        }
        const disposition = needDisposition({ request, method, owner, now });
        const operationalOwner = disposition.state === EVIDENCE_NEED_STATES.MANUAL_ESCALATION_REQUIRED ? escalationActor(planningState) ?? owner : owner;
        if (request && disposition.escalationReason && !request.escalation) {
          const requestIndex = requests.findIndex((item) => item.id === request.id);
          request = { ...request, escalation: { at, reason: disposition.escalationReason, ownerId: operationalOwner?.id ?? null } };
          requests[requestIndex] = request;
          audit.push({ type: 'evidence.escalated', entityType: 'evidence_request', entityId: request.id, payload: request.escalation });
        }
        const context = {
          at, ownerId: operationalOwner?.id ?? null, evidenceRequestId: request?.id ?? null, selectedMethodId: method?.id ?? null,
          nextObservationAt: method?.scheduledAt ?? null, serviceLevel: disposition.serviceLevel, escalationReason: disposition.escalationReason, reason: event.actionNeed.reason
        };
        if (index < 0) {
          const need = createEvidenceNeed({
            id: needId, subjectType: 'fire_event', subjectId: event.id, missingQuantity: event.actionNeed.kind, reason: event.actionNeed.reason,
            candidateMethods: methods, ranking: rankingFor(event, methods), state: disposition.state, ownerId: context.ownerId,
            evidenceRequestId: context.evidenceRequestId, selectedMethodId: context.selectedMethodId, nextObservationAt: context.nextObservationAt,
            serviceLevel: context.serviceLevel, escalationReason: context.escalationReason, createdAt: at
          });
          const bound=bindNeed(need,null,event,at);needs.unshift(bound); audit.push({ type: 'evidence_need.created', entityType: 'evidence_need', entityId: need.id, payload: { subjectId: need.subjectId, state: need.state } });
        } else {
          const prior = needs[index], transitioned = transitionEvidenceNeed(prior, disposition.state, context);
          const next = { ...transitioned, reason: event.actionNeed.reason, missingQuantity: event.actionNeed.kind, candidateMethods: methods, ranking: rankingFor(event, methods), ownerId:context.ownerId,evidenceRequestId:context.evidenceRequestId,selectedMethodId:context.selectedMethodId,nextObservationAt:context.nextObservationAt,serviceLevel:context.serviceLevel,escalationReason:context.escalationReason,history: transitioned.history };
          needs[index] = bindNeed(next,prior,event,at);
          if (next.state !== prior.state || next.escalationReason !== prior.escalationReason) audit.push({ type: 'evidence_need.transitioned', entityType: 'evidence_need', entityId: next.id, payload: { from: prior.state, state: next.state, reason: next.escalationReason } });
        }
      }
      for (let index = 0; index < needs.length; index += 1) {
        const need = needs[index];
        if (need.subjectType !== 'fire_event' || need.state === EVIDENCE_NEED_STATES.RESOLVED || unresolvedSubjects.has(need.subjectId)) continue;
        affectedIncidentIds.add(String(need.subjectId));
        needs[index] = transitionEvidenceNeed(need, EVIDENCE_NEED_STATES.RESOLVED, { at, reason: 'The recomputed event state no longer reports this missing quantity.', escalationReason: null });
        audit.push({ type: 'evidence_need.resolved', entityType: 'evidence_need', entityId: need.id, payload: { subjectId: need.subjectId } });
      }
      const resolvedNeedIds=new Set(needs.filter((item)=>item.state===EVIDENCE_NEED_STATES.RESOLVED).map((item)=>item.id));
      for(let index=0;index<requests.length;index+=1){
        const request=requests[index];
        if(!resolvedNeedIds.has(request.evidenceNeedId)||!['requested','acknowledged','in_progress'].includes(request.state)||request.evidencePackageId)continue;
        requests[index]=transitionEvidenceRequest(request,'cancelled',{actorId:'system',at,note:'Superseded: the recomputed domain state no longer contains the linked unknown.'});
        audit.push({type:'evidence.cancelled',entityType:'evidence_request',entityId:request.id,payload:{evidenceNeedId:request.evidenceNeedId,reason:'linked_unknown_resolved'}});
      }
      if(audit.length){changeEvent={type:'evidence_needs.changing',incidentIds:[...affectedIncidentIds]};changeLease=await this.onChanging(changeEvent);}
      return { ...state, evidenceNeeds: needs, evidenceRequests: requests };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    for (const entry of audit) await this.auditService.record({ actor: null, ...entry });
    if (audit.length) await this.onChanged({ type: 'evidence_needs.changed', count: audit.length,incidentIds:[...affectedIncidentIds] },changeLease);
    return this.snapshot();
  }

  async reconcileBacklog(){
    const at=this.clock().toISOString();let summary=null,changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state)=>{
      const requests=[...(state.evidenceRequests??[])],needs=[...(state.evidenceNeeds??[])],findings=new Map((state.preventionFindings??[]).map((item)=>[String(item.findingId),item])),hasFieldCapacity=Boolean(fieldActor(state));
      const activeByTarget=new Map();for(const request of requests.filter((item)=>ACTIVE_REQUEST_STATES.has(item.state))){const key=`${request.targetType}:${request.targetId}`;if(!activeByTarget.has(key))activeByTarget.set(key,[]);activeByTarget.get(key).push(request);}
      const counts={classified:0,classifiedOpen:0,internallyActionable:0,actionableNow:0,evidenceProducingCompleted:0,waitingRemoteSensor:0,waitingExpertReview:0,associationClosable:0,externallyBlocked:0,stale:0,superseded:0,unresolvable:0,blocked:0,unobtainable:0,staleOrSuperseded:0,duplicatesClosed:0,unobtainableRequestsClosed:0};
      for(let index=0;index<requests.length;index+=1){
        let request=requests[index],disposition=null;
        if(request.state==='accepted'&&request.evidencePackageId){disposition={class:'EVIDENCE_PRODUCING_COMPLETED',reason:'Accepted attributable evidence package is attached.'};counts.evidenceProducingCompleted+=1;}
        else if(request.state==='cancelled'){disposition=cancelledDisposition(request);counts[disposition.class==='SUPERSEDED'?'superseded':disposition.class==='EXTERNALLY_BLOCKED'?'externallyBlocked':'stale']+=1;counts.staleOrSuperseded+=Number(['SUPERSEDED','STALE'].includes(disposition.class));}
        else if(ACTIVE_REQUEST_STATES.has(request.state)&&request.targetType==='prevention_finding'){
          const peers=activeByTarget.get(`${request.targetType}:${request.targetId}`)??[],preferred=findings.get(String(request.targetId))?.evidenceRequestId,keeper=peers.find((item)=>item.id===preferred)??[...peers].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))[0];
          if(keeper?.id!==request.id){request=transitionEvidenceRequest(request,'cancelled',{actorId:'system',at,note:`Duplicate request closed; canonical request ${keeper.id} owns this finding review.`});disposition={class:'SUPERSEDED',reason:`Canonical request: ${keeper.id}`};counts.duplicatesClosed+=1;counts.superseded+=1;counts.staleOrSuperseded+=1;}
          else{disposition=activeDisposition({request,hasFieldCapacity});counts.waitingExpertReview+=1;counts.classifiedOpen+=1;}
        }else if(ACTIVE_REQUEST_STATES.has(request.state)&&request.requestedMethodId==='manual-field-dispatch'&&!hasFieldCapacity){request=transitionEvidenceRequest(request,'cancelled',{actorId:'system',at,note:'Request closed as unobtainable: no configured field-inspector capacity or confirmed schedule exists. The underlying unknown remains explicit.'});disposition={class:'EXTERNALLY_BLOCKED',reason:'No field-inspector actor or confirmed observation schedule is configured.'};counts.externallyBlocked+=1;counts.unobtainable+=1;counts.unobtainableRequestsClosed+=1;const needIndex=needs.findIndex((item)=>item.id===request.evidenceNeedId&&item.state!==EVIDENCE_NEED_STATES.RESOLVED);if(needIndex>=0)needs[needIndex]=transitionEvidenceNeed(needs[needIndex],EVIDENCE_NEED_STATES.FIELD_CAPACITY_NOT_CONFIGURED,{at,ownerId:null,escalationReason:'field_capacity_not_configured',reason:'The request was closed as unobtainable; the evidence unknown is not resolved.'});}
        else if(ACTIVE_REQUEST_STATES.has(request.state)){disposition=activeDisposition({request,hasFieldCapacity});counts.classifiedOpen+=1;const countKey={INTERNALLY_CLOSABLE_NOW:'internallyActionable',WAITING_REMOTE_SENSOR:'waitingRemoteSensor',WAITING_EXPERT_REVIEW:'waitingExpertReview',ASSOCIATION_CLOSABLE:'associationClosable',EXTERNALLY_BLOCKED:'externallyBlocked',UNRESOLVABLE:'unresolvable'}[disposition.class];if(countKey)counts[countKey]+=1;}
        else{disposition={class:'UNRESOLVABLE',reason:`Terminal lifecycle state ${request.state} contains no accepted evidence package.`};counts.unresolvable+=1;}
        requests[index]={...request,actionDisposition:{...disposition,classifiedAt:at}};counts.classified+=1;
      }
      counts.actionableNow=counts.internallyActionable+counts.associationClosable;counts.blocked=requests.filter((item)=>ACTIVE_REQUEST_STATES.has(item.state)&&BLOCKED_CLASSES.has(item.actionDisposition?.class)).length;
      const evidenceNeedIds=new Set(requests.filter((item)=>item.evidencePackageId).map((item)=>item.evidenceNeedId).filter(Boolean));
      summary={...counts,unknownsClosedWithEvidence:needs.filter((item)=>item.state===EVIDENCE_NEED_STATES.RESOLVED&&evidenceNeedIds.has(item.id)).length,overdue:requests.filter((item)=>ACTIVE_REQUEST_STATES.has(item.state)&&Number.isFinite(Date.parse(item.dueAt??''))&&Date.parse(item.dueAt)<Date.parse(at)).length,globalEvidenceYieldPercent:requests.length?Number((requests.filter((item)=>item.evidencePackageId).length/requests.length*100).toFixed(1)):null,actionableEvidenceYieldPercent:counts.evidenceProducingCompleted+counts.internallyActionable?Number((counts.evidenceProducingCompleted/(counts.evidenceProducingCompleted+counts.internallyActionable)*100).toFixed(1)):null,automaticRequestCreation:this.automaticRequestCreation?'ENABLED':'FROZEN'};
      const incidentIds=[...new Set([...requests.map((item)=>incidentIdForResource(item.targetType,item.targetId)),...needs.map((item)=>incidentIdForResource(item.subjectType,item.subjectId))].filter(Boolean))];changeEvent={type:'evidence_backlog.changing',incidentIds};if(incidentIds.length)changeLease=await this.onChanging(changeEvent);return{...state,evidenceRequests:requests,evidenceNeeds:needs,actionBacklogReconciliation:{...summary,reconciledAt:at}};
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    await this.auditService.record({actor:null,type:'evidence.backlog.reconciled',entityType:'evidence_backlog',entityId:'current',payload:summary});
    if(changeEvent?.incidentIds.length)await this.onChanged({type:'evidence_backlog.changed',incidentIds:changeEvent.incidentIds},changeLease);
    return summary;
  }

  enrich(snapshot) {
    const needs = this.snapshot(), unresolved = needs.filter((item) => item.state !== EVIDENCE_NEED_STATES.RESOLVED);
    const byEvent = new Map(unresolved.filter((item) => item.subjectType === 'fire_event').map((item) => [item.subjectId, item]));
    const events = (snapshot.events ?? []).map((event) => ({ ...event, evidenceNeed: byEvent.get(String(event.id)) ?? null }));
    const counts = Object.fromEntries(Object.values(EVIDENCE_NEED_STATES).map((state) => [state, needs.filter((item) => item.state === state).length]));
    const untracked = events.filter((event) => event.actionNeed?.needsRouting && !event.evidenceNeed);
    const orphaned = unresolved.filter((need) => need.subjectType === 'fire_event' && !events.some((event) => String(event.id) === String(need.subjectId)));
    return { ...snapshot, summary: { ...(snapshot.summary ?? {}), evidenceAcquisition: counts, unresolvedEvidenceNeeds: unresolved.length, untrackedRoutingNeeds: untracked.length, orphanedEvidenceNeeds: orphaned.length, acquisitionInvariantHolds: untracked.length === 0 && orphaned.length === 0,automaticEvidenceRequestCreation:this.automaticRequestCreation?'ENABLED':'FROZEN' }, evidenceNeeds: needs, events };
  }

  async ingestAcceptedEvidence() {
    if (!this.eventRepository) return { considered: 0, attached: 0, ineligible: 0, replayed: 0 };
    const state = this.repository.snapshot(), receipts = new Set(state.eventEvidenceIngestReceipts ?? []);
    const packages = new Map((state.evidencePackages ?? []).filter((item) => item.state === 'accepted').map((item) => [item.id, item]));
    const accepted = (state.evidenceRequests ?? []).filter((request) => request.targetType === 'fire_event' && request.state === 'accepted' && packages.has(request.evidencePackageId));
    let attached = 0, ineligible = 0, replayed = 0; const added = [];
    for (const request of accepted) {
      const receipt = request.evidencePackageId; if (receipts.has(receipt)) { replayed += 1; continue; }
      const evidencePackage = packages.get(receipt); if (!eligibleForEventGraph(evidencePackage)) { ineligible += 1; continue; }
      await this.eventRepository.attachObservationToEvent(acceptedObservation(request, evidencePackage), String(request.targetId).replace(/^event:/, ''), this.clock());
      receipts.add(receipt); added.push(receipt); attached += 1;
    }
    if (added.length) await this.repository.mutate((current) => ({ ...current, eventEvidenceIngestReceipts: [...new Set([...(current.eventEvidenceIngestReceipts ?? []), ...added])].slice(-2_000) }));
    return { considered: accepted.length, attached, ineligible, replayed };
  }
}
import { createHash } from 'node:crypto';
