import { EventEmitter } from 'node:events';
import {
  FIELDNET_STATES,
  createDevice,
  createFieldObservation,
  createFieldTask,
  sourceFreshness
} from '../../../packages/domain/src/fieldnet/contracts.mjs';
import { commandEvent } from '../../../packages/domain/src/incident-command/contracts.mjs';
import { signFieldRequest,verifyFieldResponse } from '../../../packages/domain/src/fieldnet/request-auth.mjs';
import {
  createFieldObserver,
  createFieldTaskAcknowledgement,
  createFieldTaskCompletion,
  createFieldVerificationTask,
  createStructuredFieldReport
} from '../../../packages/domain/src/fieldnet/field-reports.mjs';
import { boundedSyncCursor, readBoundedCentralJson, validateCentralSyncPayload } from './bounded-central-response.mjs';

const CENTRAL_RELEASE_MAX_BYTES=64*1024;
const CENTRAL_SYNC_MAX_BYTES=2*1024*1024;

const nowDate = (clock) => clock();

export class FieldNetService extends EventEmitter {
  constructor({ store, centralUrl = null, nodeKey = null,releaseIdentity=null,incidentId=null, fetchFn = globalThis.fetch, clock = () => new Date(), requestTimeoutMs = 2_000 } = {}) {
    super();
    if (!store) throw new Error('fieldnet_store_required');
    this.store = store;
    this.centralUrl = centralUrl?.replace(/\/$/, '') || null;
    this.nodeKey=nodeKey||null;
    this.releaseIdentity=releaseIdentity;
    this.incidentId=incidentId?String(incidentId):null;
    this.releaseCompatibility={state:releaseIdentity?'NOT_CHECKED':'UNVERSIONED_TEST_RUNTIME',checkedAt:null,failures:[]};
    this.fetchFn = fetchFn;
    this.clock = clock;
    this.requestTimeoutMs = requestTimeoutMs;
    this.syncPromise = null;
  }

  snapshot() {
    return {
      schemaVersion: 'vigia.fieldnet-node-state.v1',
      ...this.store.state(),
      centralUrlConfigured: Boolean(this.centralUrl),
      releaseId:this.releaseIdentity?.releaseId??null,releaseCompatibility:this.releaseCompatibility,
      incidents: this.store.incidents().map(({ incidentId, packageId, evidenceHash }) => ({ incidentId, packageId, evidenceHash })),
      generatedAt: this.clock().toISOString()
    };
  }

  importPackage(pkg, actor) { return this.#emit('INCIDENT_PACKAGE_IMPORTED', this.store.importPackage(pkg, actor)); }
  registerDevice(input, actor) {
    if (['IDENTITY_ATTESTED','ROLE_ATTESTED'].includes(input?.observer?.verificationState) && input.observer.attestedBy !== actor) throw new Error('field_observer_attester_principal_mismatch');
    const observer = input?.observer ? createFieldObserver(input.observer, { now: nowDate(this.clock) }) : null;
    return this.#emit('DEVICE_REGISTERED', this.store.registerDevice(createDevice({ ...input, observer }, { now: nowDate(this.clock) }), actor));
  }

  addObservation(input, actor) {
    const result = this.store.addObservation(createFieldObservation(input, { now: nowDate(this.clock), originNode: this.store.nodeId }), actor);
    return this.#emit('FIELD_OBSERVATION_ADDED', result);
  }

  addStructuredReport(input, actor) {
    const device = this.store.device(input?.deviceId);
    if (!device) throw new Error('device_not_registered');
    const report = createStructuredFieldReport(input, { now: nowDate(this.clock), originNode: this.store.nodeId, authenticatedPrincipal: actor, device });
    return this.#emit('STRUCTURED_FIELD_REPORT_ADDED', this.store.addObservation(report, actor));
  }

  createTask(input, actor) { const priority=['P2_POSITION','P3_TASK','P4_TELEMETRY','P5_THUMBNAIL','P6_BULK_MEDIA'].includes(input?.priority)?input.priority:'P3_TASK';return this.#emit('TASK_CREATED', this.store.createTask(createFieldTask({...input,priority}, { now: nowDate(this.clock) }), actor)); }
  createVerificationTask(input, actor) {
    const priority = ['P2_POSITION', 'P3_TASK'].includes(input?.priority) ? input.priority : 'P3_TASK';
    const task = createFieldVerificationTask({ ...input, priority }, { now: nowDate(this.clock), originNode: this.store.nodeId, authenticatedPrincipal: actor });
    return this.#emit('FIELD_VERIFICATION_TASK_CREATED', this.store.createTask(task, actor));
  }
  acknowledgeTask(taskId, input) { return this.#emit('TASK_ACKNOWLEDGED', this.store.acknowledgeTask(taskId, input)); }
  acknowledgeVerificationTask(taskId, input, actor) {
    const task = this.store.task(taskId), device = this.store.device(input?.deviceId);
    if (!task) throw new Error('task_not_found');
    if (!device) throw new Error('device_not_registered');
    const prior=this.store.taskAcknowledgements(taskId).find((item)=>item.taskVersion===Number(input?.taskVersion)&&item.observer?.observerId===device.observer?.observerId),normalizedInput={...input,acknowledgedAt:input?.acknowledgedAt??prior?.acknowledgedAt};
    const acknowledgement = createFieldTaskAcknowledgement(task, normalizedInput, { now: nowDate(this.clock), originNode: this.store.nodeId, authenticatedPrincipal: actor, device });
    return this.#emit('FIELD_VERIFICATION_TASK_ACKNOWLEDGED', this.store.acknowledgeTask(taskId, { ...acknowledgement, actor }));
  }
  completeVerificationTask(taskId, input, actor) {
    const task = this.store.task(taskId);
    if (!task) throw new Error('task_not_found');
    const normalizedInput={...input,completedAt:input?.completedAt??task.lastCompletion?.completedAt},completion = createFieldTaskCompletion(task, normalizedInput, { now: nowDate(this.clock), originNode: this.store.nodeId, authenticatedPrincipal: actor });
    return this.#emit('FIELD_VERIFICATION_TASK_COMPLETED', this.store.completeTask(taskId, { ...completion, actor }));
  }
  acknowledgeAlert(incidentId, alertId, input) { return this.#emit('LOCAL_ALERT_ACKNOWLEDGED', this.store.acknowledgeAlert(incidentId, alertId, input)); }
  mutateTask(taskId, input) { return this.#emit('TASK_UPDATED', this.store.mutateTask(taskId, input)); }
  addAnnotation(input) { return this.#emit('ANNOTATION_ADDED', this.store.addAnnotation(input)); }
  resolveConflict(conflictId, input) { return this.#emit('CONFLICT_RESOLVED', this.store.resolveConflict(conflictId, input)); }
  commandSurvival(incidentId) { return this.store.commandSurvival(incidentId); }
  addCommandSurvivalEvent(incidentId,input,actor) {
    const event=commandEvent({...input,incidentId,source:'FIELDNET_OFFLINE',author:actor,responsibleOwner:input.responsibleOwner??actor,releaseId:this.releaseIdentity?.releaseId??input.releaseId??'fieldnet-unversioned'}, {actor,owner:actor,source:'FIELDNET_OFFLINE',releaseId:this.releaseIdentity?.releaseId??input.releaseId??'fieldnet-unversioned',now:this.clock()});
    return this.#emit('COMMAND_SURVIVAL_EVENT',this.store.appendCommandSurvival(event,actor));
  }

  setConnectionState(state, actor) {
    if (!FIELDNET_STATES.includes(state)) throw new Error('invalid_fieldnet_connection_state');
    return this.#emit('CONNECTION_STATE_CHANGED', this.store.setConnectionState(state, actor));
  }

  incidentFreshness(incidentId) {
    const incident = this.store.incident(incidentId);
    if (!incident) throw new Error('incident_not_found');
    const state = this.store.state().connectionState;
    return {
      schemaVersion: 'vigia.fieldnet-source-freshness.v1',
      incidentId,
      connectionState: state,
      sources: Object.values(incident.sourceFreshness ?? {}).map((source) => sourceFreshness(source, { now: nowDate(this.clock) })),
      qualification: state === 'FULL'
        ? 'Regional source clocks are available; field observations retain independent local freshness.'
        : 'Regional source clocks are cached last-known values and never CURRENT_LOCAL while disconnected.'
    };
  }

  async checkCentral() {
    if (!this.centralUrl) {
      this.setConnectionState('REGIONAL_DISCONNECTED', 'fieldnet-connection-monitor');
      return { reachable: false, reason: 'central_url_not_configured' };
    }
    try {
      await this.#checkCentralRelease();
      const response = await this.fetchFn(`${this.centralUrl}/health`, { headers: this.#centralHeaders(), signal: AbortSignal.timeout(this.requestTimeoutMs) });
      if (!response.ok) throw new Error(`central_health_http_${response.status}`);
      const sync = await this.syncOnce();
      return { reachable: true, sync };
    } catch (error) {
      this.setConnectionState('REGIONAL_DISCONNECTED', 'fieldnet-connection-monitor');
      return { reachable: false, reason: String(error.message ?? error).slice(0, 200) };
    }
  }

  async syncOnce() {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.#syncOnce().finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  async #syncOnce() {
    if (!this.centralUrl) throw new Error('central_url_not_configured');
    await this.#checkCentralRelease();
    this.setConnectionState('RECOVERING', 'fieldnet-sync-engine');
    let acknowledged = 0;
    let inboundMerged = 0;
    let batches = 0;
    let cursor = this.store.state().syncCursor;
    while (batches < 100) {
      const batch = this.store.pendingSync({ mode: 'RECOVERING', limit: 100, maxBytes: 1_000_000,incidentId:this.incidentId });
      if (!batch.items.length) break;
      let response;
      try {
        const orderedItems=[...batch.items].sort((left,right)=>Number(left.mutation.localSequence)-Number(right.mutation.localSequence));
        const syncPath='/fieldnet/sync',syncBody={ schemaVersion: 'vigia.fieldnet-sync-request.v1', release:{releaseId:this.releaseIdentity?.releaseId??null,codeStateHash:this.releaseIdentity?.codeStateHash??null,fieldNodeContractVersion:this.releaseIdentity?.contracts?.fieldNodeContractVersion??null}, nodeId: this.store.nodeId, cursor, mutations: orderedItems.map((item) => item.mutation) };
        const signedRequest=signFieldRequest({method:'POST',path:'/api/v10/fieldnet/sync',keyId:this.store.nodeId,key:this.nodeKey,body:syncBody,now:this.clock()});response = await this.fetchFn(`${this.centralUrl}${syncPath}`, {
          method: 'POST',
          headers: this.#centralHeaders({ 'content-type': 'application/json',...signedRequest }),
          body: JSON.stringify(syncBody),
          signal: AbortSignal.timeout(this.requestTimeoutMs)
        });
        if (!response.ok) throw new Error(`central_sync_http_${response.status}`);
        const rawPayload=await readBoundedCentralJson(response,{maxBytes:CENTRAL_SYNC_MAX_BYTES});verifyFieldResponse({keyId:this.store.nodeId,key:this.nodeKey,requestNonce:signedRequest['x-vigia-field-nonce'],requestBodyHash:signedRequest['x-vigia-field-body-sha256'],body:rawPayload,headers:response.headers});const payload = validateCentralSyncPayload(rawPayload);
        const nextCursor=boundedSyncCursor(payload.cursor,{fallback:cursor});
        const accepted = new Set(payload.acceptedMutationIds ?? []);
        const acceptedItems = batch.items.filter((item) => accepted.has(item.mutationId));
        const missingItems = batch.items.filter((item) => !accepted.has(item.mutationId));
        if (acceptedItems.length) this.store.recordSyncAttempt(acceptedItems);
        if (missingItems.length) this.store.recordSyncAttempt(missingItems, 'central_ack_missing');
        if (payload.updates.length) inboundMerged += this.store.applyInbound(payload.updates).merged;
        cursor = nextCursor;
        this.store.updateCursor(cursor);
        acknowledged += acceptedItems.length;
        batches += 1;
        if (missingItems.length) throw new Error('central_ack_missing');
      } catch (error) {
        if (response === undefined) this.store.recordSyncAttempt(batch.items, error.message ?? error);
        throw error;
      }
    }
    const pending = this.store.pendingSync({ mode: 'RECOVERING', limit: 1,incidentId:this.incidentId }).pendingTotal;
    this.setConnectionState(pending === 0 ? 'FULL' : 'RECOVERING', 'fieldnet-sync-engine');
    const result = { acknowledged, inboundMerged, batches, pending, cursor, connectionState: this.store.state().connectionState };
    this.#emit('SYNC_COMPLETED', result);
    return result;
  }

  #emit(type, payload) {
    this.emit('field-event', { type, at: this.clock().toISOString(), payload });
    return payload;
  }
  async #checkCentralRelease(){
    if(!this.releaseIdentity)return{compatible:true,state:'UNVERSIONED_TEST_RUNTIME'};
    const response=await this.fetchFn(`${this.centralUrl}/release`,{headers:this.#centralHeaders(),signal:AbortSignal.timeout(this.requestTimeoutMs)});
    if(!response.ok)throw new Error(`central_release_http_${response.status}`);
    const central=await readBoundedCentralJson(response,{maxBytes:CENTRAL_RELEASE_MAX_BYTES}),failures=[];
    if(central.releaseId!==this.releaseIdentity.releaseId)failures.push('release_id_mismatch');
    if(central.codeStateHash!==this.releaseIdentity.codeStateHash)failures.push('code_state_hash_mismatch');
    if(central.contracts?.fieldNodeContractVersion!==this.releaseIdentity.contracts?.fieldNodeContractVersion)failures.push('fieldnode_contract_mismatch');
    this.releaseCompatibility={state:failures.length?'FIELDNET_UPDATE_REQUIRED':'COMPATIBLE',checkedAt:this.clock().toISOString(),centralReleaseId:central.releaseId??null,failures};
    if(failures.length)throw new Error(`fieldnet_release_incompatible:${failures.join(',')}`);
    return{compatible:true,central};
  }
  #centralHeaders(extra = {}) { const release=this.releaseIdentity?.releaseId?{'x-vigia-release-id':this.releaseIdentity.releaseId}:{};return{...extra,...release}; }
}
