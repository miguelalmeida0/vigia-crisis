import { randomUUID } from 'node:crypto';
import { assertCan, assertGlobalIncidentScope, assertIncidentScope, hasGlobalIncidentScope, incidentIdForResource, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';
import { createEvidenceEnvelope } from '../../../../../packages/domain/src/evidence-envelope.mjs';
import { createEvidenceRequest, transitionEvidenceRequest } from '../../../../../packages/domain/src/evidence-request.mjs';
import { requireCoordinate, requireObject, requireText } from '../../shared/validation.mjs';
function receiptResponse(state, receipt) {
  if (receipt.response) return receipt.response;
  const request = state.evidenceRequests.find((item) => item.id === receipt.requestId);
  if (receipt.operationType !== 'submit_evidence') return { clientId: receipt.clientId, ok: true, result: request };
  const evidencePackage = state.evidencePackages.find((item) => item.id === receipt.evidencePackageId);
  return { clientId: receipt.clientId, ok: true, result: { request, evidencePackage } };
}
const requestBinding=(value)=>JSON.stringify({evidenceNeedId:value.evidenceNeedId??null,targetType:value.targetType,targetId:value.targetId,title:value.title,coordinate:value.coordinate??null,ownerId:value.ownerId,priority:value.priority,dueAt:value.dueAt,acknowledgementDueAt:value.acknowledgementDueAt??null,observationDueAt:value.observationDueAt??null,requirements:value.requirements??[],missingQuantity:value.missingQuantity??null,requestedMethodId:value.requestedMethodId??null,serviceLevelPolicyId:value.serviceLevelPolicyId??null,scheduleCommitment:value.scheduleCommitment??null});
const ACTIVE_NEED_STATES=new Set(['REQUEST_ACTIVE','WAITING_FOR_SCHEDULED_OBSERVATION','WAITING_FOR_OBSERVATION','MANUAL_ESCALATION_REQUIRED','FIELD_CAPACITY_NOT_CONFIGURED','NO_AVAILABLE_OBSERVATION']);
function staleNeed(need,reason){return Object.assign(new Error('evidence_need_refresh_required'),{statusCode:409,details:{reason,refreshRequired:true,currentVersion:need?.version??null,currentBindingHash:need?.bindingHash??null,currentState:need?.state??null}});}
function requestInScope(actor, request) { const incidentId = incidentIdForResource(request?.targetType, request?.targetId); return incidentId ? incidentInScope(actor, incidentId) : hasGlobalIncidentScope(actor); }
function assertRequestScope(actor, request) { const incidentId = incidentIdForResource(request?.targetType, request?.targetId); if (incidentId) assertIncidentScope(actor, incidentId); else assertGlobalIncidentScope(actor); }
const encodedBytes=(value)=>Buffer.byteLength(JSON.stringify(value));
const capacityError=(kind,scope,details)=>Object.assign(new Error(`${kind}_history_capacity_exceeded`),{statusCode:507,details:{scope,...details}});
export class EvidenceRequestService {
  constructor({ repository, auditService, clock = () => new Date(), onChanging = () => {},onChanged = () => {},onChangeFailed=()=>{}, maxRequestsGlobal=10_000,maxRequestsPerIncident=500,maxRequestsPerPrincipal=1_000,maxRequestBytesGlobal=64*1024*1024,maxRequestBytesPerIncident=8*1024*1024,maxRequestBytesPerPrincipal=16*1024*1024,maxPackagesGlobal=10_000,maxPackagesPerIncident=500,maxPackagesPerPrincipal=1_000,maxPackageBytesGlobal=256*1024*1024,maxPackageBytesPerIncident=32*1024*1024,maxPackageBytesPerPrincipal=64*1024*1024,maxSnapshotRows=500,maxSnapshotBytes=4*1024*1024 }) {
    Object.assign(this,{repository,auditService,clock,onChanging,onChanged,onChangeFailed});
    const bounded=(value,fallback)=>Math.max(1,Number.isFinite(Number(value))?Number(value):fallback);
    Object.assign(this,{maxRequestsGlobal:bounded(maxRequestsGlobal,10_000),maxRequestsPerIncident:bounded(maxRequestsPerIncident,500),maxRequestsPerPrincipal:bounded(maxRequestsPerPrincipal,1_000),maxRequestBytesGlobal:bounded(maxRequestBytesGlobal,64*1024*1024),maxRequestBytesPerIncident:bounded(maxRequestBytesPerIncident,8*1024*1024),maxRequestBytesPerPrincipal:bounded(maxRequestBytesPerPrincipal,16*1024*1024),maxPackagesGlobal:bounded(maxPackagesGlobal,10_000),maxPackagesPerIncident:bounded(maxPackagesPerIncident,500),maxPackagesPerPrincipal:bounded(maxPackagesPerPrincipal,1_000),maxPackageBytesGlobal:bounded(maxPackageBytesGlobal,256*1024*1024),maxPackageBytesPerIncident:bounded(maxPackageBytesPerIncident,32*1024*1024),maxPackageBytesPerPrincipal:bounded(maxPackageBytesPerPrincipal,64*1024*1024),maxSnapshotRows:bounded(maxSnapshotRows,500),maxSnapshotBytes:bounded(maxSnapshotBytes,4*1024*1024)});
  }
  snapshot(actor) {
    assertCan(actor, 'read:evidence');
    const state=this.repository.snapshot(),visible=(state.evidenceRequests??[]).filter((item)=>requestInScope(actor,item)),packages=state.evidencePackages??[],requests=[],selectedPackages=[];
    for(const request of visible){
      if(requests.length>=this.maxSnapshotRows)break;
      const related=packages.filter((item)=>item.requestId===request.id),candidateRequests=[...requests,request],candidatePackages=[...selectedPackages,...related],candidate={requests:candidateRequests,packages:candidatePackages,page:{limit:this.maxSnapshotRows,returned:candidateRequests.length,totalVisible:visible.length,hasMore:candidateRequests.length<visible.length,responseBytes:0}};
      candidate.page.responseBytes=encodedBytes(candidate);
      if(candidate.page.responseBytes>this.maxSnapshotBytes){if(!requests.length)throw capacityError('evidence_snapshot','single_item',{requestId:request.id,maxBytes:this.maxSnapshotBytes});break;}
      requests.push(request);selectedPackages.push(...related);
    }
    const result={requests,packages:selectedPackages,page:{limit:this.maxSnapshotRows,returned:requests.length,totalVisible:visible.length,hasMore:requests.length<visible.length,responseBytes:0}};
    result.page.responseBytes=encodedBytes(result);return result;
  }
  find(id) { return this.repository.snapshot().evidenceRequests.find((item) => item.id === id) ?? null; }
  #assertRequestCapacity(state,request){
    const rows=state.evidenceRequests??[],incidentId=incidentIdForResource(request.targetType,request.targetId),principal=String(request.requestedBy),incidentRows=rows.filter((item)=>incidentIdForResource(item.targetType,item.targetId)===incidentId),principalRows=rows.filter((item)=>String(item.requestedBy)===principal),nextBytes=encodedBytes(request),globalBytes=encodedBytes(rows)+nextBytes,incidentBytes=encodedBytes(incidentRows)+nextBytes,principalBytes=encodedBytes(principalRows)+nextBytes;
    if(rows.length+1>this.maxRequestsGlobal)throw capacityError('evidence_request','global',{maximum:this.maxRequestsGlobal});
    if(incidentRows.length+1>this.maxRequestsPerIncident)throw capacityError('evidence_request','incident',{incidentId,maximum:this.maxRequestsPerIncident});
    if(principalRows.length+1>this.maxRequestsPerPrincipal)throw capacityError('evidence_request','principal',{principal,maximum:this.maxRequestsPerPrincipal});
    if(globalBytes>this.maxRequestBytesGlobal)throw capacityError('evidence_request','global_bytes',{maximumBytes:this.maxRequestBytesGlobal});
    if(incidentBytes>this.maxRequestBytesPerIncident)throw capacityError('evidence_request','incident_bytes',{incidentId,maximumBytes:this.maxRequestBytesPerIncident});
    if(principalBytes>this.maxRequestBytesPerPrincipal)throw capacityError('evidence_request','principal_bytes',{principal,maximumBytes:this.maxRequestBytesPerPrincipal});
  }
  #assertPackageCapacity(state,evidencePackage,request){
    const rows=state.evidencePackages??[],requests=new Map((state.evidenceRequests??[]).map((item)=>[item.id,item])),incidentId=incidentIdForResource(request.targetType,request.targetId),principal=String(evidencePackage.observerId),incidentRows=rows.filter((item)=>{const owner=requests.get(item.requestId);return owner&&incidentIdForResource(owner.targetType,owner.targetId)===incidentId;}),principalRows=rows.filter((item)=>String(item.observerId)===principal),nextBytes=encodedBytes(evidencePackage),globalBytes=encodedBytes(rows)+nextBytes,incidentBytes=encodedBytes(incidentRows)+nextBytes,principalBytes=encodedBytes(principalRows)+nextBytes;
    if(rows.length+1>this.maxPackagesGlobal)throw capacityError('evidence_package','global',{maximum:this.maxPackagesGlobal});
    if(incidentRows.length+1>this.maxPackagesPerIncident)throw capacityError('evidence_package','incident',{incidentId,maximum:this.maxPackagesPerIncident});
    if(principalRows.length+1>this.maxPackagesPerPrincipal)throw capacityError('evidence_package','principal',{principal,maximum:this.maxPackagesPerPrincipal});
    if(globalBytes>this.maxPackageBytesGlobal)throw capacityError('evidence_package','global_bytes',{maximumBytes:this.maxPackageBytesGlobal});
    if(incidentBytes>this.maxPackageBytesPerIncident)throw capacityError('evidence_package','incident_bytes',{incidentId,maximumBytes:this.maxPackageBytesPerIncident});
    if(principalBytes>this.maxPackageBytesPerPrincipal)throw capacityError('evidence_package','principal_bytes',{principal,maximumBytes:this.maxPackageBytesPerPrincipal});
  }
  async create(actor, input) {
    assertCan(actor, 'request:evidence'); requireObject(input); assertRequestScope(actor, input); const createdAt = this.clock().toISOString();
    const evidenceNeedId = input.evidenceNeedId ? requireText(input.evidenceNeedId, 'evidenceNeedId', { max: 180 }) : null;
    let request = createEvidenceRequest({
      id: `evidence-request:${randomUUID()}`, targetType: requireText(input.targetType, 'targetType', { max: 60 }), targetId: requireText(input.targetId, 'targetId', { max: 180 }),
      title: requireText(input.title, 'title', { max: 180 }), coordinate: input.coordinate ? requireCoordinate(input.coordinate) : null,
      ownerId: requireText(input.ownerId, 'ownerId', { max: 100 }), requestedBy: actor.id, priority: String(input.priority ?? 'high'),
      dueAt: requireText(input.dueAt, 'dueAt', { max: 60 }), acknowledgementDueAt: input.acknowledgementDueAt, observationDueAt: input.observationDueAt,
      requirements: input.requirements ?? [], evidenceNeedId, missingQuantity: input.missingQuantity, requestedMethodId: input.requestedMethodId,
      serviceLevelPolicyId: input.serviceLevelPolicyId, scheduleCommitment: input.scheduleCommitment, createdAt
    });
    let replay=false,changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state) => {
      if(evidenceNeedId){
        const need=(state.evidenceNeeds??[]).find((item)=>item.id===evidenceNeedId);
        if(!need)throw Object.assign(new Error('evidence_need_not_found'),{statusCode:404});
        if(!ACTIVE_NEED_STATES.has(need.state))throw staleNeed(need,'need_not_unresolved');
        if(!need.bindingHash||input.evidenceNeedBindingHash!==need.bindingHash||Number(input.evidenceNeedVersion)!==Number(need.version))throw staleNeed(need,'need_version_changed');
        if(typeof input.evidenceNeedSubjectVersion!=='string'||input.evidenceNeedSubjectVersion!==need.subjectVersion)throw staleNeed(need,'subject_version_changed');
        if(typeof input.evidenceNeedPolicyVersion!=='string'||input.evidenceNeedPolicyVersion!==need.policyVersion)throw staleNeed(need,'policy_version_changed');
        if(String(input.missingQuantity??'')!==String(need.missingQuantity??''))throw staleNeed(need,'missing_quantity_changed');
        const requestIncidentId=incidentIdForResource(request.targetType,request.targetId),needIncidentId=incidentIdForResource(need.subjectType,need.subjectId);
        if(!requestIncidentId||!needIncidentId||requestIncidentId!==needIncidentId)throw Object.assign(new Error('evidence_need_target_mismatch'),{statusCode:409});
      }
      const existing=evidenceNeedId?state.evidenceRequests.find((item)=>item.evidenceNeedId===evidenceNeedId&&['requested','acknowledged','in_progress','submitted'].includes(item.state)):null;
      if(existing){if(requestBinding(existing)!==requestBinding(request))throw Object.assign(new Error('evidence_request_idempotency_conflict'),{statusCode:409});request={...existing,idempotentReplay:true};replay=true;return state;}
      this.#assertRequestCapacity(state,request);
      changeEvent={type:'evidence.requesting',request};changeLease=await this.onChanging(changeEvent);
      if(evidenceNeedId){const needIndex=(state.evidenceNeeds??[]).findIndex((item)=>item.id===evidenceNeedId);const evidenceNeeds=[...(state.evidenceNeeds??[])];evidenceNeeds[needIndex]={...evidenceNeeds[needIndex],evidenceRequestId:request.id};return { ...state, evidenceNeeds,evidenceRequests: [request, ...state.evidenceRequests] };}
      return { ...state, evidenceRequests: [request, ...state.evidenceRequests] };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    if(replay)return request;
    await this.onChanged({ type: 'evidence.requested', request },changeLease);
    await this.auditService.record({ actor, type: 'evidence.requested', entityType: 'evidence_request', entityId: request.id, payload: { targetId: request.targetId, ownerId: request.ownerId } });
    return request;
  }

  async transition(actor, id, input) {
    requireObject(input); const requestedState = requireText(input.state, 'state', { max: 40 });
    if (requestedState === 'acknowledged' || requestedState === 'in_progress') assertCan(actor, 'ack:evidence_request');
    else if (requestedState === 'cancelled') assertCan(actor, 'request:evidence');
    else throw new Error('invalid_evidence_request_transition');
    let updated,changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state) => {
      const index = state.evidenceRequests.findIndex((item) => item.id === id); if (index < 0) throw new Error('evidence_request_not_found');
      assertRequestScope(actor, state.evidenceRequests[index]);
      if (['acknowledged', 'in_progress'].includes(requestedState) && state.evidenceRequests[index].ownerId !== actor.id) throw new Error('forbidden');
      updated = transitionEvidenceRequest(state.evidenceRequests[index], requestedState, { actorId: actor.id, at: this.clock().toISOString(), note: input.note });
      changeEvent={type:'evidence.updating',request:state.evidenceRequests[index]};changeLease=await this.onChanging(changeEvent);
      const evidenceRequests = [...state.evidenceRequests]; evidenceRequests[index] = updated; return { ...state, evidenceRequests };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    await this.onChanged({ type: 'evidence.updated', request: updated },changeLease);
    await this.auditService.record({ actor, type: `evidence.${requestedState}`, entityType: 'evidence_request', entityId: id });
    return updated;
  }

  async submit(actor, id, input) {
    assertCan(actor, 'submit:evidence'); requireObject(input); let request; let evidencePackage;let changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state) => {
      const index = state.evidenceRequests.findIndex((item) => item.id === id); if (index < 0) throw new Error('evidence_request_not_found');
      request = state.evidenceRequests[index]; assertRequestScope(actor, request); if (request.ownerId !== actor.id && actor.role !== 'integration_service') throw new Error('forbidden');
      evidencePackage = createEvidenceEnvelope({
        ...input, id: `evidence-package:${randomUUID()}`, requestId: id, observerId: actor.id, observerRole: actor.role,
        receivedAt: this.clock().toISOString(), coordinate: input.coordinate ?? request.coordinate
      });
      this.#assertPackageCapacity(state,evidencePackage,request);
      let current = request; if (current.state === 'acknowledged') current = transitionEvidenceRequest(current, 'in_progress', { actorId: actor.id, at: this.clock().toISOString(), note: 'Evidence capture started.' });
      const updated = transitionEvidenceRequest(current, 'submitted', { actorId: actor.id, at: this.clock().toISOString(), evidencePackageId: evidencePackage.id, note: input.note });
      changeEvent={type:'evidence.submitting',request};changeLease=await this.onChanging(changeEvent);
      const evidenceRequests = [...state.evidenceRequests]; evidenceRequests[index] = updated; request = updated;
      return { ...state, evidenceRequests, evidencePackages: [evidencePackage, ...state.evidencePackages] };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    await this.onChanged({ type: 'evidence.submitted', request, evidencePackage },changeLease);
    await this.auditService.record({ actor, type: 'evidence.submitted', entityType: 'evidence_package', entityId: evidencePackage.id, payload: { requestId: id, checksum: evidencePackage.checksum } });
    return { request, evidencePackage };
  }

  async sync(actor, operations) {
    if (!Array.isArray(operations) || operations.length > 100) throw new Error('invalid_field_sync_batch');
    const results = [];
    for (const operation of operations) {
      try { results.push(await this.#syncOne(actor, operation)); }
      catch (error) { results.push({ clientId: operation?.clientId, ok: false, error: String(error.message ?? error) }); }
    }
    return results;
  }

  async #syncOne(actor, operation) {
    requireObject(operation);
    const clientId = requireText(operation.clientId, 'clientId', { max: 180 });
    const requestId = requireText(operation.requestId, 'requestId', { max: 180 });
    const type = requireText(operation.type, 'type', { max: 40 });
    if (!['acknowledge', 'start', 'submit_evidence'].includes(type)) throw new Error('invalid_field_operation');
    if (type === 'submit_evidence') assertCan(actor, 'submit:evidence');
    else assertCan(actor, 'ack:evidence_request');
    const receiptKey = `${actor.id}:${clientId}`;
    let response;
    let replay = false;
    let changedRequest;
    let changedPackage;
    let changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state) => {
      const existing = (state.fieldOperationReceipts ?? []).find((item) => item.key === receiptKey);
      if (existing) { response = receiptResponse(state, existing); replay = true; return state; }
      const index = state.evidenceRequests.findIndex((item) => item.id === requestId);
      if (index < 0) throw new Error('evidence_request_not_found');
      const current = state.evidenceRequests[index];
      assertRequestScope(actor, current);
      if (current.ownerId !== actor.id && actor.role !== 'integration_service') throw new Error('forbidden');
      const at = this.clock().toISOString();
      const evidenceRequests = [...state.evidenceRequests];
      const evidencePackages = [...(state.evidencePackages ?? [])];
      let result;
      if (type === 'submit_evidence') {
        changedPackage = createEvidenceEnvelope({
          ...(operation.payload ?? {}), id: `evidence-package:${randomUUID()}`, requestId, observerId: actor.id, observerRole: actor.role,
          receivedAt: at, coordinate: operation.payload?.coordinate ?? current.coordinate
        });
        this.#assertPackageCapacity(state,changedPackage,current);
        let next = current;
        if (next.state === 'acknowledged') next = transitionEvidenceRequest(next, 'in_progress', { actorId: actor.id, at, note: 'Evidence capture started.' });
        changedRequest = transitionEvidenceRequest(next, 'submitted', { actorId: actor.id, at, evidencePackageId: changedPackage.id, note: operation.payload?.note });
        evidenceRequests[index] = changedRequest;
        evidencePackages.unshift(changedPackage);
        result = { request: changedRequest, evidencePackage: changedPackage };
      } else {
        const requestedState = type === 'acknowledge' ? 'acknowledged' : 'in_progress';
        changedRequest = transitionEvidenceRequest(current, requestedState, { actorId: actor.id, at, note: operation.payload?.note });
        evidenceRequests[index] = changedRequest;
        result = changedRequest;
      }
      changeEvent={type:'evidence.syncing',request:current};changeLease=await this.onChanging(changeEvent);
      response = { clientId, ok: true, result };
      const receipt = { key: receiptKey, actorId: actor.id, clientId, requestId, operationType: type, evidencePackageId: changedPackage?.id ?? null, at };
      return { ...state, evidenceRequests, evidencePackages, fieldOperationReceipts: [receipt, ...(state.fieldOperationReceipts ?? [])].slice(0, 2_000) };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    if (!replay) {
      await this.onChanged({ type: type === 'submit_evidence' ? 'evidence.submitted' : 'evidence.updated', request: changedRequest, evidencePackage: changedPackage },changeLease);
      const auditType = type === 'submit_evidence' ? 'evidence.submitted' : type === 'acknowledge' ? 'evidence.acknowledged' : 'evidence.in_progress';
      await this.auditService.record({ actor, type: auditType, entityType: type === 'submit_evidence' ? 'evidence_package' : 'evidence_request', entityId: changedPackage?.id ?? requestId, payload: { requestId, clientId } });
    }
    return response;
  }

  async review(actor, id, input) {
    assertCan(actor, 'verify:hazard'); requireObject(input); const decision = String(input.decision ?? ''); if (!['accepted', 'rejected'].includes(decision)) throw new Error('invalid_evidence_review');
    let request; let evidencePackage;let changeEvent=null,changeLease=null;
    try{await this.repository.mutate(async(state) => {
      const index = state.evidenceRequests.findIndex((item) => item.id === id); if (index < 0) throw new Error('evidence_request_not_found');
      assertRequestScope(actor, state.evidenceRequests[index]);
      request = transitionEvidenceRequest(state.evidenceRequests[index], decision, { actorId: actor.id, at: this.clock().toISOString(), note: input.note, review: { actorId: actor.id, note: String(input.note ?? ''), decision } });
      const evidenceRequests = [...state.evidenceRequests]; evidenceRequests[index] = request;
      const packageIndex = state.evidencePackages.findIndex((item) => item.id === request.evidencePackageId); const evidencePackages = [...state.evidencePackages];
      if (packageIndex >= 0) { evidencePackage = { ...evidencePackages[packageIndex], state: decision, review: request.review }; evidencePackages[packageIndex] = evidencePackage; }
      changeEvent={type:'evidence.reviewing',request:state.evidenceRequests[index]};changeLease=await this.onChanging(changeEvent);
      return { ...state, evidenceRequests, evidencePackages };
    });}catch(error){if(changeEvent)await this.onChangeFailed(changeEvent,changeLease);throw error;}
    await this.onChanged({ type: 'evidence.reviewed', request, evidencePackage },changeLease);
    await this.auditService.record({ actor, type: `evidence.${decision}`, entityType: 'evidence_request', entityId: id, payload: { note: input.note } });
    return { request, evidencePackage };
  }
}
