import { evaluateAlertPolicies,evaluatePreventionReviewQueue,evaluateSourceCoverage } from '../../../../../packages/domain/src/alert-domain.mjs';
import { assertCan, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';

function authenticated(actor) { return actor?.authentication?.authenticated === true; }
function actorId(actor) { return String(actor?.id ?? 'unknown-actor'); }
function incidentAuthorized(actor,incidentId){return incidentInScope(actor,incidentId);}
function priorityDecision(event, territoryContext, policyPriority) {
  const factors=[];
  if(event.physicalState?.freshness==='current')factors.push({code:'CURRENT_PHYSICAL_EVIDENCE',weight:1});
  const families=new Set(event.physicalSourceProfile?.families??(event.observations??[]).map((item)=>item.sourceFamily).filter(Boolean));
  if(families.size>=2)factors.push({code:'INDEPENDENT_PHYSICAL_SOURCES',weight:2});
  if(event.physicalFirst===true&&!event.reportState?.firstAt)factors.push({code:'PHYSICAL_FIRST_UNREPORTED',weight:2});
  if(event.evidenceState==='association-uncertain'||event.associationState==='ambiguous')factors.push({code:'EVIDENCE_CONFLICT',weight:3});
  const nearest=Math.min(...(territoryContext?.assets??[]).map((item)=>Number(item.distanceMeters)).filter(Number.isFinite),Number.POSITIVE_INFINITY);
  if(nearest<=1000)factors.push({code:'MONITORED_ASSET_WITHIN_1KM',weight:2,valueMeters:nearest});
  else if(nearest<=5000)factors.push({code:'MONITORED_ASSET_WITHIN_POLICY_RADIUS',weight:1,valueMeters:nearest});
  if(territoryContext?.policies?.length)factors.push({code:'MONITORED_TERRITORY_POLICY_MATCH',weight:1});
  if(policyPriority==='HIGH')factors.push({code:'HIGH_PRECEDENCE_POLICY',weight:2});
  const score=factors.reduce((sum,item)=>sum+item.weight,0),level=score>=5?'HIGH':score>=2?'MEDIUM':'REVIEW';
  return{level,algorithmVersion:'vigia.transparent-operational-priority.v1',factors,scoreQualification:'Transparent ordinal rule weights; not a probability or calibrated risk score.'};
}

export class AlertService {
  constructor({ store = null, territoryService = null, deliveryWorker = null, repository = null,evidenceClosureService=null, supervisorActorId = null, requireAuthenticatedMutations = false, clock = () => new Date() } = {}) {
    Object.assign(this, { store, territoryService, deliveryWorker, repository,evidenceClosureService, supervisorActorId, requireAuthenticatedMutations, clock });
    this.cache = []; this.legacyAlerts = [];
  }
  async initialize() {
    if (this.store) {
      try { await this.store.recoverIfNeeded?.(); this.cache = await this.store.listAlerts({ limit: 300 }); }
      catch(error){if(error?.statusCode!==503)throw error;}
    }
    return this.snapshot();
  }
  snapshot() { return { alerts: (this.store ? this.cache : this.legacyAlerts).slice(0, 300) }; }
  #authorize(actor) { if (this.requireAuthenticatedMutations && !authenticated(actor)) throw new Error('forbidden'); }
  async #authorizeAlert(id,actor,capability){this.#authorize(actor);assertCan(actor,capability);const alert=await this.get(id);if(!incidentAuthorized(actor,alert.eventId))throw Object.assign(new Error('incident_scope_forbidden'),{statusCode:403,details:{incidentId:alert.eventId,actorId:actorId(actor)}});return alert;}
  async sync(live = {}) {
    if (!this.store) return this.#legacySync(live);
    await this.store.recoverIfNeeded?.();
    await this.territoryService.ensurePersisted?.();
    const changed = [];
    for (const event of live.events ?? []) {
      if (!event?.id) continue;
      const evaluatedAt = this.clock();
      const territoryContext = await this.territoryService.context(event);
      const autonomousEvidence=await this.evidenceClosureService?.reconcileEvent?.({...event,territoryContext},live)??null;
      const { alert, decisions } = evaluateAlertPolicies(event, { evaluatedAt });
      await this.store.recordDecisions(decisions, event);
      if (!alert) continue;
      if (!territoryContext.territories.length) continue;
      const recipients = this.territoryService.recipients({ territoryContext,eventId:event.id });
      alert.payload = {
        ...alert.payload, territoryContext, routingState: recipients.length ? 'RECIPIENTS_RESOLVED' : 'NO_AUTHENTICATED_RECIPIENT',
        traceId: event.prospectiveDetectionTiming?.traceId ?? null,
        timing:{providerObservationAt:event.prospectiveDetectionTiming?.providerObservationAt??null,eventCreatedAt:event.prospectiveDetectionTiming?.eventCreatedAt??event.createdAt??null},
        evidenceClosure:autonomousEvidence?{planId:autonomousEvidence.plan.id,state:autonomousEvidence.plan.resolutionState,result:autonomousEvidence.result,nextEvidence:autonomousEvidence.nextEvidence,watch:autonomousEvidence.watch,coverageGaps:autonomousEvidence.coverage.gaps,coverageForecast:autonomousEvidence.coverage.forecasts,truthStateId:autonomousEvidence.truthState?.id??null,confirmationState:autonomousEvidence.truthState?.physicalTruth?.confirmationState??null,evidenceRaceId:autonomousEvidence.evidenceRace?.id??null,evidenceRaceState:autonomousEvidence.evidenceRace?.state??null}:null
      };
      const priority=priorityDecision(event,territoryContext,alert.priority);alert.priority=priority.level;alert.payload.priorityDecision=priority;
      const result = await this.store.upsertAlert(alert, { territoryId: territoryContext.territories[0].id, recipients });
      await this.evidenceClosureService?.recordAlertDecision?.(result.alert,result);
      if (result.created || result.materialChange) changed.push({ ...result.alert, watched: new Set(this.repository?.snapshot?.().watchedEventIds ?? []).has(event.id) });
    }
    const registryContext={territories:this.territoryService.registry?[{id:this.territoryService.registry.territory.id}]:[],assets:[]};
    for(const [sourceFamily,source] of [['viirs',live.sources?.firms],['sentinel3_slstr',live.sources?.sentinel3Pixels]]){
      if(!source)continue;const evaluated=evaluateSourceCoverage(sourceFamily,source,{evaluatedAt:this.clock()});await this.store.recordDecisions([evaluated.decision],{id:evaluated.decision.eventId});if(!evaluated.alert)continue;const registryRecipients=this.territoryService.recipients({territoryContext:registryContext,eventId:evaluated.alert.eventId});
      const result=await this.store.upsertAlert(evaluated.alert,{territoryId:this.territoryService.registry?.territory.id??null,recipients:registryRecipients});if(result.created||result.materialChange)changed.push(result.alert);
    }
    const prevention=evaluatePreventionReviewQueue(this.repository?.snapshot?.().evidenceRequests??[],{evaluatedAt:this.clock(),territoryId:this.territoryService.registry?.territory.id});
    await this.store.recordDecisions([prevention.decision],{id:prevention.decision.eventId});if(prevention.alert){const closurePlan=await this.evidenceClosureService?.createPreventionPlan?.(prevention.alert);if(closurePlan)prevention.alert.payload.evidenceClosure={planId:closurePlan.id,state:closurePlan.resolutionState,nextEvidence:closurePlan.preferredNextFamily,deadlineAt:closurePlan.deadlineAt};const registryRecipients=this.territoryService.recipients({territoryContext:registryContext,eventId:prevention.alert.eventId});const result=await this.store.upsertAlert(prevention.alert,{territoryId:this.territoryService.registry?.territory.id??null,recipients:registryRecipients});await this.evidenceClosureService?.recordAlertDecision?.(result.alert,result);if(result.created||result.materialChange)changed.push(result.alert);}
    await this.store.escalateDue({ supervisorActorId: this.supervisorActorId });
    await this.deliveryWorker?.drain?.();
    this.cache = await this.store.listAlerts({ limit: 300 });
    return changed;
  }
  async list(options = {},actor=null) { if (!this.store){const value=this.snapshot();return actor?{alerts:value.alerts.filter((item)=>incidentAuthorized(actor,item.eventId))}:value;} await this.store.recoverIfNeeded?.();this.cache = await this.store.listAlerts(options); return { alerts: actor?this.cache.filter((item)=>incidentAuthorized(actor,item.eventId)):this.cache }; }
  async get(id,actor=null) { if(this.store)await this.store.recoverIfNeeded?.();const value = this.store ? await this.store.getAlert(id) : this.legacyAlerts.find((item) => item.id === id); if (!value) throw new Error('alert_not_found');if(actor&&!incidentAuthorized(actor,value.eventId))throw Object.assign(new Error('incident_scope_forbidden'),{statusCode:403,details:{incidentId:value.eventId,actorId:actorId(actor)}}); return value; }
  async acknowledge(id, actor, note = null) {
    await this.#authorizeAlert(id,actor,'alert:acknowledge');
    if (!this.store) { const item = this.legacyAlerts.find((value) => value.id === id); if (!item) throw new Error('alert_not_found'); item.acknowledgedAt = this.clock().toISOString(); item.acknowledgedBy = actorId(actor); return { ...item }; }
    await this.store.recoverIfNeeded?.(); const result = await this.store.mutate(id, { action: 'ACKNOWLEDGE', actorId: actorId(actor), note }); return this.#refresh(result);
  }
  async assign(id, actor, ownerActorId, note = null) { await this.#authorizeAlert(id,actor,'alert:assign');if (!ownerActorId) throw new Error('owner_actor_id_required');await this.store.recoverIfNeeded?.(); return this.#refresh(await this.store.mutate(id, { action: 'ASSIGN', actorId: actorId(actor), ownerActorId, note })); }
  async reassign(id, actor, ownerActorId, note = null) { await this.#authorizeAlert(id,actor,'alert:assign');if (!ownerActorId) throw new Error('owner_actor_id_required');await this.store.recoverIfNeeded?.(); return this.#refresh(await this.store.mutate(id, { action: 'REASSIGN', actorId: actorId(actor), ownerActorId, note })); }
  async resolve(id, actor, resolutionCode, note = null) { await this.#authorizeAlert(id,actor,'alert:resolve');if (!resolutionCode) throw new Error('resolution_code_required');await this.store.recoverIfNeeded?.(); return this.#refresh(await this.store.mutate(id, { action: 'RESOLVE', actorId: actorId(actor), resolutionCode, note })); }
  async suppress(id, actor, suppressUntil, note = null) {
    await this.#authorizeAlert(id,actor,'alert:suppress');if (!Number.isFinite(Date.parse(suppressUntil ?? '')) || Date.parse(suppressUntil) <= this.clock().getTime()) throw new Error('invalid_suppression_until');await this.store.recoverIfNeeded?.();
    return this.#refresh(await this.store.mutate(id, { action: 'SUPPRESS', actorId: actorId(actor), suppressUntil, note }));
  }
  async audit(id,actor=null) { await this.get(id,actor); return { records: this.store ? await this.store.audit(id) : [] }; }
  async metrics() { if(this.store)await this.store.recoverIfNeeded?.();if(!this.store)return{generatedAt:this.clock().toISOString(),alerts:{OPEN:this.legacyAlerts.filter((item)=>!item.acknowledgedAt).length},delivery:{},latency:{}};const metrics=await this.store.metrics(),evidenceClosure=await this.evidenceClosureService?.status?.()??null;return{...metrics,evidenceClosure}; }
  async notificationFeed(channel,actor,options={}){this.#authorize(actor);if(!['IN_APP','BROWSER_NOTIFICATION'].includes(channel))throw new Error('invalid_notification_channel');await this.store.recoverIfNeeded?.();const scopes=Array.isArray(actor?.incidentScopes)?actor.incidentScopes.map(String):[],incidentIds=scopes.includes('*')?null:[...new Set(scopes.flatMap((value)=>[value,value.replace(/^(?:incident|event):/, '')]))],notifications=await this.store.listNotificationFeed({actorId:actorId(actor),channel,incidentIds,...options});return{channel,notifications:notifications.filter((item)=>incidentAuthorized(actor,item.alert?.eventId))};}
  deliveryConfiguration() { return this.deliveryWorker?.adapters?.configuration?.() ?? {}; }
  async #refresh(result) { this.cache = await this.store.listAlerts({ limit: 300 }); return result; }
  async #legacySync(live) {
    const existing = new Set(this.legacyAlerts.map((item) => item.id)), watched = new Set(this.repository?.snapshot?.().watchedEventIds ?? []), created = [];
    for (const item of live.alerts ?? []) {
      const id = `${item.id}:${item.eventId}`; if (existing.has(id)) continue;
      const alert = { ...item, id, eventId: item.eventId, watched: watched.has(item.eventId), createdAt: this.clock().toISOString(), acknowledgedAt: null, acknowledgedBy: null };
      this.legacyAlerts.unshift(alert); existing.add(id); created.push(alert);
    }
    this.legacyAlerts = this.legacyAlerts.slice(0, 500); return created;
  }
}
