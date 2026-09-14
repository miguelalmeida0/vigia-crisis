import { createHash } from 'node:crypto';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { assertObservationAllowed, productionObservationReality } from '../../../../../packages/domain/src/production-integrity.mjs';

// Wildfire identity must outlive satellite revisit gaps and multi-day incidents.
// Thirty days preserves the evidence chain while operational products enforce
// their own freshness semantics at presentation time.
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_MAX_OBSERVATIONS = 75_000;
const DEFAULT_MAX_STATE_BYTES = 192 * 1024 * 1024;
const DEFAULT_MAX_PRINCIPAL_OBSERVATIONS = 10_000;
const DEFAULT_MAX_PRINCIPAL_BYTES = 8 * 1024 * 1024;
const validObservation = (item) => item && typeof item.id === 'string' && Number.isFinite(Date.parse(item.at));
const receivedAt = (item, fallback) => Number.isFinite(Date.parse(item?.receivedAt)) ? item.receivedAt : fallback.toISOString();
const distanceKm=(a,b)=>{if(!Array.isArray(a)||!Array.isArray(b))return Infinity;const rad=Math.PI/180,dy=(b[1]-a[1])*111.32,dx=(b[0]-a[0])*111.32*Math.cos((a[1]+b[1])/2*rad);return Math.hypot(dx,dy);};
const percentile=(values,p)=>{const rows=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!rows.length)return null;return rows[Math.min(rows.length-1,Math.max(0,Math.ceil(rows.length*p)-1))];};
const digest = (value, length = 10) => createHash('sha256').update(value).digest('hex').slice(0, length).toUpperCase();
const REPEAT_LIFECYCLE_FIELDS=new Set(['vigiaAcquisitionStartedAt','downloadStartedAt','downloadCompletedAt','archivePersistedAt','parseStartedAt','vigiaAcquiredAt','vigiaParsedAt','vigiaCanonicalizedAt','vigiaIngestedAt']);
const TRACE_ORDER_LIMIT={vigiaAcquisitionStartedAt:'vigiaAcquiredAt',downloadStartedAt:'vigiaAcquiredAt',downloadCompletedAt:'vigiaAcquiredAt',archivePersistedAt:'vigiaParsedAt',parseStartedAt:'vigiaParsedAt',vigiaCanonicalizedAt:'vigiaIngestedAt'};
const IDENTITY_FIELDS=['identityVersion','canonicalObservationId','externalObservationId','principalId','agencyId','nodeOrProviderId','incidentId','sourceFamily','schemaVersion'];
function observationIdentity(item){return item?.provenance?.observationIdentity??item?.metadata?.observationIdentity??null;}
function immutableIdentityEqual(left,right){return IDENTITY_FIELDS.every((field)=>left?.[field]===right?.[field]);}
function bindImmutableObservationIdentity(prior,incoming){const priorIdentity=observationIdentity(prior),nextIdentity=observationIdentity(incoming);if(!priorIdentity&&!nextIdentity)return incoming;if(!priorIdentity||!nextIdentity||!immutableIdentityEqual(priorIdentity,nextIdentity)||priorIdentity.payloadHash!==nextIdentity.payloadHash)throw Object.assign(new Error('observation_identity_conflict'),{statusCode:409});const identity=structuredClone(priorIdentity);return{...incoming,canonicalObservationId:identity.canonicalObservationId,externalObservationId:identity.externalObservationId,metadata:{...(incoming.metadata??{}),observationIdentity:identity},provenance:{...(incoming.provenance??{}),observationIdentity:identity}};}
function canonicalFirstClock(prior,field){
  const value=prior?.[field]??null,latest=prior?.latestAcquisition,limit=TRACE_ORDER_LIMIT[field];if(!value)return null;
  const orderBroken=limit&&Number.isFinite(Date.parse(prior?.[limit]??''))&&Date.parse(value)>Date.parse(prior[limit]);
  // A repeat stays in latestAcquisition; it cannot rewrite the first trace.
  const mixed=REPEAT_LIFECYCLE_FIELDS.has(field)&&latest?.rawSourceProductId&&value===latest[field]&&(prior?.provenance?.rawSourceProductId!==latest.rawSourceProductId||orderBroken);
  return mixed?null:value;
}
function generatedEventId(event) {
  const first = [...(event.observations ?? [])].sort((a, b) => Date.parse(a.receivedAt ?? a.at) - Date.parse(b.receivedAt ?? b.at) || a.id.localeCompare(b.id))[0];
  const year = new Date(first?.at ?? Date.now()).getUTCFullYear();
  return `PT-${year}-${digest(`physical-event:${first?.id ?? `${year}:unknown`}`)}`;
}
function splitEventId(source, observationIds, now) { return `PT-${now.getUTCFullYear()}-${digest(`split:${source}:${[...observationIds].sort().join('|')}:${now.toISOString()}`)}`; }
function collisionEventId(source,observationIds,event){const first=event.firstSeenAt??event.observations?.[0]?.at,year=new Date(first??0).getUTCFullYear();return`PT-${year}-${digest(`identity-collision:${source}:${[...observationIds].sort().join('|')}`)}`;}
function retainsIdentity(candidate,incumbent){const score=(row)=>[Number(row.manual.length>0),row.event.observations?.filter((item)=>['thermal','camera','ground_sensor','drone','field'].includes(item.type)).length??0,row.observationIds.length];const a=score(candidate),b=score(incumbent);for(let i=0;i<a.length;i+=1)if(a[i]!==b[i])return a[i]>b[i];const at=Date.parse(candidate.event.firstSeenAt??candidate.event.observations?.[0]?.at??0),bt=Date.parse(incumbent.event.firstSeenAt??incumbent.event.observations?.[0]?.at??0);return at!==bt?at<bt:candidate.observationIds.join('|').localeCompare(incumbent.observationIds.join('|'))<0;}

export class EventObservationRepository {
  #filePath; #retentionMs; #loaded = false; #observations = []; #observationEvents = {}; #eventRecords = {}; #manualObservationEvents = {}; #corrections = [];
  #derivedStates = {}; #writer; #mirrorStore; #universe; #capacity; #operationChain = Promise.resolve(); #persistence = { state: 'memory_only', lastPersistedAt: null, lastError: null };
  constructor({ filePath, retentionMs = DEFAULT_RETENTION_MS, writer = writeJsonAtomic, mirrorStore = null, universe = 'test', maxObservations = DEFAULT_MAX_OBSERVATIONS, maxStateBytes = DEFAULT_MAX_STATE_BYTES, maxPrincipalObservations = DEFAULT_MAX_PRINCIPAL_OBSERVATIONS, maxPrincipalBytes = DEFAULT_MAX_PRINCIPAL_BYTES } = {}) { this.#filePath = filePath; this.#retentionMs = retentionMs; this.#writer = writer; this.#mirrorStore = mirrorStore; this.#universe = universe; this.#capacity={maxObservations,maxStateBytes,maxPrincipalObservations,maxPrincipalBytes}; }

  async merge(incoming = [], now = new Date()) {
    return this.#transaction(() => {
      this.#mergeInMemory(incoming, now);
      return this.#observations.map((item) => ({ ...structuredClone(item), manualEventId: this.#manualObservationEvents[item.id] ?? null }));
    },{beforeSave:()=>this.#mirrorStore?.commitObservationIdentities?.(incoming)});
  }
  async reconcileEvents(events = [], now = new Date()) {
    await this.#load();
    const retained=events.map((event)=>{const ids=(event.observations??[]).map((item)=>item.id),mapped=[...new Set(ids.map((id)=>this.#observationEvents[id]).filter(Boolean))];if(!ids.length||mapped.length!==1||ids.some((id)=>!this.#observationEvents[id]))return null;const id=mapped[0],record=this.#eventRecords[id];if(!record||record.mergedInto)return null;return{...event,id,createdAt:record.createdAt,eventAliases:record.aliases??[],operatorCorrected:ids.some((observationId)=>Boolean(this.#manualObservationEvents[observationId]))};});
    if(retained.every(Boolean)&&new Set(retained.map((event)=>event.id)).size===retained.length)return retained;
    return this.#transaction(() => {
      const plans=events.map((event)=>{
        const observationIds = (event.observations ?? []).map((item) => item.id);
        const manual = [...new Set(observationIds.map((id) => this.#manualObservationEvents[id]).filter(Boolean))];
        const mapped = [...new Set(observationIds.map((id) => this.#observationEvents[id]).filter(Boolean))];
        const oldestMapped = mapped.sort((a, b) => Date.parse(this.#eventRecords[a]?.createdAt ?? now) - Date.parse(this.#eventRecords[b]?.createdAt ?? now) || a.localeCompare(b))[0];
        return{event,observationIds,manual,mapped,preferredId:manual[0]??oldestMapped??generatedEventId(event)};
      }),winners=new Map();
      for(const plan of plans){const incumbent=winners.get(plan.preferredId);if(!incumbent||retainsIdentity(plan,incumbent))winners.set(plan.preferredId,plan);}
      const output = [];
      for (const plan of plans) {
        const {event,observationIds,manual,mapped,preferredId}=plan,collision=winners.get(preferredId)!==plan,id=collision?collisionEventId(preferredId,observationIds,event):preferredId,aliases=collision?mapped.filter((item)=>item!==preferredId&&item!==id):mapped.filter((item)=>item!==id);
        const record = this.#eventRecords[id] ?? { id, createdAt: now.toISOString(), aliases: [], ...(collision?{splitFrom:preferredId}:{}) };
        record.aliases = [...new Set([...(record.aliases ?? []), ...aliases])]; record.lastSeenAt = event.lastSeenAt ?? now.toISOString(); this.#eventRecords[id] = record;
        for (const alias of aliases) { const prior = this.#eventRecords[alias]; if (prior) this.#eventRecords[alias] = { ...prior, mergedInto: id }; }
        for (const observationId of observationIds) this.#observationEvents[observationId] = id;
        output.push({ ...event, id, createdAt:record.createdAt, eventAliases: record.aliases, operatorCorrected: manual.length > 0 });
      }
      return output;
    });
  }
  async persistDerivedStates(events = [], now = new Date()) {
    await this.#load();
    const timingFields=['vigiaRawProductIngestedAt','observationPersistedAt','associationCompletedAt','postgisStartedAt','postgisCompletedAt','candidateDecisionAt','apiAvailableAt','uiFirstSeenAt'];
    const unchanged=events.every((event)=>{const ids=(event.observations??[]).map((item)=>item.id).sort(),digestValue=createHash('sha256').update(ids.join('|')).digest('hex'),prior=this.#derivedStates[event.id],currentTiming=event.prospectiveDetectionTiming??{},priorTiming=prior?.prospectiveDetectionTiming??{},timingSame=timingFields.every((field)=>!currentTiming[field]||currentTiming[field]===priorTiming[field]);return prior?.inputDigest===digestValue&&prior?.projectionVersion==='physical-state-v1'&&timingSame;});
    if(unchanged)return structuredClone(this.#derivedStates);
    return this.#transaction(() => {
      for (const event of events) {
        const inputObservationIds = (event.observations ?? []).map((item) => item.id).sort();
        const inputDigest = createHash('sha256').update(inputObservationIds.join('|')).digest('hex');
        const priorTiming=this.#derivedStates[event.id]?.prospectiveDetectionTiming??{},incomingTiming=event.prospectiveDetectionTiming??null;
        const prospectiveDetectionTiming=incomingTiming?{...incomingTiming,uiFirstSeenAt:priorTiming.uiFirstSeenAt??incomingTiming.uiFirstSeenAt??null,uiClientObservedAt:priorTiming.uiClientObservedAt??incomingTiming.uiClientObservedAt??null,uiFirstSeenSource:priorTiming.uiFirstSeenSource??incomingTiming.uiFirstSeenSource??null,uiAvailableAt:priorTiming.uiFirstSeenAt??incomingTiming.uiFirstSeenAt??null}:null;
        this.#derivedStates[event.id] = {
          eventId: event.id, projectionVersion: 'physical-state-v1', inputObservationIds, inputDigest, updatedAt: now.toISOString(),
          physicalState: event.physicalState ?? null, knowledgeState: event.knowledgeState ?? null, behaviorState: event.behaviorState ?? null,
          evidenceFusion: event.evidenceFusion ?? null, observedGeometry: event.observedGeometry ?? null, geometryFreshness: event.geometryFreshness ?? null,
          candidateAssessment:event.candidateAssessment??null,prospectiveDetectionTiming
        };
      }
      return structuredClone(this.#derivedStates);
    });
  }
  async recordUiFirstSeen({eventId,traceId,clientObservedAt=null},now=new Date()){
    const id=String(eventId??'').trim(),trace=String(traceId??'').trim();
    if(!id||!trace)throw new Error('invalid_ui_first_seen_acknowledgement');
    return this.#transaction(()=>{
      const projection=this.#derivedStates[id],timing=projection?.prospectiveDetectionTiming;
      if(!timing)throw new Error('prospective_trace_not_found');
      if(timing.traceId!==trace)throw new Error('prospective_trace_mismatch');
      const serverSeenAt=now.toISOString(),prior=Date.parse(timing.uiFirstSeenAt??''),next=Number.isFinite(prior)&&prior<=now.getTime()?timing.uiFirstSeenAt:serverSeenAt;
      const clientMs=Date.parse(clientObservedAt??''),clientClock=Number.isFinite(clientMs)?new Date(clientMs).toISOString():null;
      projection.prospectiveDetectionTiming={...timing,uiFirstSeenAt:next,uiAvailableAt:next,uiClientObservedAt:timing.uiClientObservedAt??clientClock,uiFirstSeenSource:'same_origin_browser_visible_render_ack'};
      projection.updatedAt=serverSeenAt;
      return{eventId:id,traceId:trace,apiAvailableAt:timing.apiAvailableAt??null,uiFirstSeenAt:next,uiClientObservedAt:projection.prospectiveDetectionTiming.uiClientObservedAt,source:projection.prospectiveDetectionTiming.uiFirstSeenSource,idempotent:Number.isFinite(prior)};
    });
  }
  derivedStates() { return structuredClone(this.#derivedStates); }
  thermalMemory(coordinate,asOf=new Date(),{radiusKm=1.5}={}){
    const limit=Date.parse(asOf),rows=this.#observations.filter((item)=>item.type==='thermal'&&Date.parse(item.at)<=limit&&distanceKm(coordinate,item.coordinate)<=radiusKm).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    if(!rows.length)return{asOf:new Date(limit).toISOString(),observationCount:0,distinctObservationDays:0,durationHours:0,stationarityRadiusKm:null,frpP90Mw:null,historyRetentionDays:this.#retentionMs/86_400_000,qualification:'Causal repository observations at or before the decision only.'};
    const centroid=[rows.reduce((sum,item)=>sum+item.coordinate[0],0)/rows.length,rows.reduce((sum,item)=>sum+item.coordinate[1],0)/rows.length],first=Date.parse(rows[0].at),last=Date.parse(rows.at(-1).at),stationarity=Math.max(...rows.map((item)=>distanceKm(centroid,item.coordinate))),p90=percentile(rows.map((item)=>Number(item.frpMw)),.9);
    return{asOf:new Date(limit).toISOString(),observationCount:rows.length,distinctObservationDays:new Set(rows.map((item)=>item.at.slice(0,10))).size,durationHours:Number((Math.max(0,last-first)/3_600_000).toFixed(3)),stationarityRadiusKm:Number(stationarity.toFixed(3)),frpP90Mw:Number.isFinite(p90)?Number(p90.toFixed(3)):null,historyRetentionDays:this.#retentionMs/86_400_000,qualification:'Causal repository observations within 1.5 km at or before the decision only; provider hotspot class and reference labels are not used.'};
  }
  productionIntegrityStatus() { return productionObservationReality(this.#observations, this.#universe); }
  async mergeEvents({ sourceEventId, targetEventId, actorId = 'unknown', reason = 'Operator merge' }, now = new Date()) {
    return this.#transaction(() => {
      if (!sourceEventId || !targetEventId || sourceEventId === targetEventId) throw new Error('invalid_event_merge');
      const source = this.#idsForEvent(sourceEventId), target = this.#idsForEvent(targetEventId); if (!source.length || !target.length) throw new Error('event_not_found');
      for (const id of [...source, ...target]) { this.#manualObservationEvents[id] = targetEventId; this.#observationEvents[id] = targetEventId; }
      const targetRecord = this.#eventRecords[targetEventId] ?? { id: targetEventId, createdAt: now.toISOString(), aliases: [] };
      targetRecord.aliases = [...new Set([...(targetRecord.aliases ?? []), sourceEventId])]; this.#eventRecords[targetEventId] = targetRecord;
      this.#eventRecords[sourceEventId] = { ...(this.#eventRecords[sourceEventId] ?? { id: sourceEventId, createdAt: now.toISOString(), aliases: [] }), mergedInto: targetEventId };
      return this.#recordCorrection({ kind: 'merge', sourceEventId, targetEventId, observationIds: source, actorId, reason }, now);
    });
  }
  async splitEvent(input, now = new Date()) { return this.#split({ ...input, kind: 'split' }, now); }
  async rejectAssociation({ sourceEventId, observationId, actorId = 'unknown', reason = 'Association rejected' }, now = new Date()) { return this.#split({ sourceEventId, observationIds: [observationId], actorId, reason, kind: 'reject_association' }, now); }
  async corrections() { await this.#load(); return structuredClone(this.#corrections); }
  persistenceStatus() { return structuredClone(this.#persistence); }
  async attachObservationToEvent(observation, eventId, now = new Date()) {
    if (!validObservation(observation) || !eventId) throw new Error('invalid_event_observation_attachment');
    return this.#transaction(() => {
      this.#mergeInMemory([observation], now); const target = String(eventId);
      for (const [observationId,mappedEventId] of Object.entries(this.#observationEvents)) {
        if (mappedEventId === target) this.#manualObservationEvents[observationId] = target;
      }
      this.#manualObservationEvents[observation.id] = target; this.#observationEvents[observation.id] = target;
      this.#eventRecords[target] = this.#eventRecords[target] ?? { id: target, createdAt: now.toISOString(), aliases: [] };
      return { observationId: observation.id, eventId: target };
    });
  }
  correctionLog() { return structuredClone(this.#corrections); }
  async clear() { return this.#transaction(() => { this.#observations = []; this.#observationEvents = {}; this.#eventRecords = {}; this.#manualObservationEvents = {}; this.#corrections = []; this.#derivedStates = {}; }); }

  async #split({ sourceEventId, observationIds, actorId = 'unknown', reason, kind }, now) {
    return this.#transaction(() => {
      const current = this.#idsForEvent(sourceEventId), selected = [...new Set(observationIds ?? [])];
      if (!current.length) throw new Error('event_not_found');
      if (!selected.length || selected.some((id) => !current.includes(id)) || selected.length === current.length) throw new Error('invalid_event_split');
      const newEventId = splitEventId(sourceEventId, selected, now);
      for (const id of current) { const target = selected.includes(id) ? newEventId : sourceEventId; this.#manualObservationEvents[id] = target; this.#observationEvents[id] = target; }
      this.#eventRecords[newEventId] = { id: newEventId, createdAt: now.toISOString(), aliases: [], splitFrom: sourceEventId };
      return this.#recordCorrection({ kind, sourceEventId, targetEventId: newEventId, observationIds: selected, actorId, reason }, now);
    });
  }
  #mergeInMemory(incoming, now) {
    const cutoff = now.getTime() - this.#retentionMs, byId = new Map(this.#observations.filter(validObservation).map((item) => [item.id, item]));
    for (const candidate of incoming.filter(validObservation)) {
      assertObservationAllowed(candidate, this.#universe);
      const prior = byId.get(candidate.id),raw=prior?bindImmutableObservationIdentity(prior,candidate):candidate;
      const firstReceivedAt = prior?.receivedAt ?? receivedAt(raw, now);
      const firstClock = (field) => canonicalFirstClock(prior,field);
      byId.set(raw.id,prior?{
        ...raw,receivedAt:firstReceivedAt,
        providerDiscoveredAt:firstClock('providerDiscoveredAt'),productSensingStartAt:firstClock('productSensingStartAt'),productSensingEndAt:firstClock('productSensingEndAt'),
        vigiaAcquisitionStartedAt:firstClock('vigiaAcquisitionStartedAt'),downloadStartedAt:firstClock('downloadStartedAt'),downloadCompletedAt:firstClock('downloadCompletedAt'),archivePersistedAt:firstClock('archivePersistedAt'),parseStartedAt:firstClock('parseStartedAt'),
        vigiaAcquiredAt:prior.vigiaAcquiredAt??prior.receivedAt??firstReceivedAt,vigiaParsedAt:firstClock('vigiaParsedAt'),vigiaCanonicalizedAt:firstClock('vigiaCanonicalizedAt'),vigiaIngestedAt:firstClock('vigiaIngestedAt'),
        vigiaObservationPersistedAt:prior.vigiaObservationPersistedAt??now.toISOString(),provenance:prior.provenance??raw.provenance,
        latestAcquisition:{receivedAt:receivedAt(raw,now),vigiaAcquisitionStartedAt:raw.vigiaAcquisitionStartedAt??null,downloadStartedAt:raw.downloadStartedAt??null,downloadCompletedAt:raw.downloadCompletedAt??null,archivePersistedAt:raw.archivePersistedAt??null,parseStartedAt:raw.parseStartedAt??null,vigiaAcquiredAt:raw.vigiaAcquiredAt??null,vigiaParsedAt:raw.vigiaParsedAt??null,vigiaCanonicalizedAt:raw.vigiaCanonicalizedAt??null,vigiaIngestedAt:raw.vigiaIngestedAt??null,repositoryPersistedAt:now.toISOString(),rawSourceProductId:raw.provenance?.rawSourceProductId??null}
      }:{...raw,receivedAt:firstReceivedAt,vigiaAcquiredAt:raw.vigiaAcquiredAt??firstReceivedAt,vigiaObservationPersistedAt:now.toISOString()});
    }
    this.#observations = [...byId.values()].filter((item) => Date.parse(item.at) >= cutoff && Date.parse(item.at) <= now.getTime() + 2 * 60_000).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
    const liveIds = new Set(this.#observations.map((item) => item.id));
    for (const id of Object.keys(this.#observationEvents)) if (!liveIds.has(id)) delete this.#observationEvents[id];
    for (const id of Object.keys(this.#manualObservationEvents)) if (!liveIds.has(id)) delete this.#manualObservationEvents[id];
  }
  #idsForEvent(eventId) { return Object.entries(this.#observationEvents).filter(([, id]) => id === eventId).map(([id]) => id); }
  #recordCorrection(input, now) { const seed = `${now.toISOString()}:${input.kind}:${input.sourceEventId}:${input.targetEventId ?? ''}:${(input.observationIds ?? []).join('|')}`; const correction = { id: `correction:${digest(seed, 16).toLowerCase()}`, at: now.toISOString(), ...input }; this.#corrections = [correction, ...this.#corrections].slice(0, 1000); return correction; }
  #state() { return structuredClone({ observations: this.#observations, observationEvents: this.#observationEvents, eventRecords: this.#eventRecords, manualObservationEvents: this.#manualObservationEvents, corrections: this.#corrections, derivedStates: this.#derivedStates }); }
  #assertCapacity(){const state=this.#state(),{maxObservations,maxStateBytes,maxPrincipalObservations,maxPrincipalBytes}=this.#capacity;if(state.observations.length>maxObservations)throw Object.assign(new Error('observation_repository_capacity_exceeded'),{statusCode:507});const stateBytes=Buffer.byteLength(JSON.stringify(state));if(stateBytes>maxStateBytes)throw Object.assign(new Error('observation_repository_capacity_exceeded'),{statusCode:507});const principals=new Map();for(const observation of state.observations){const principal=String(observation?.metadata?.ingestPrincipal??'');if(!principal)continue;const row=principals.get(principal)??{count:0,bytes:0};row.count+=1;row.bytes+=Buffer.byteLength(JSON.stringify(observation));principals.set(principal,row);}for(const row of principals.values())if(row.count>maxPrincipalObservations||row.bytes>maxPrincipalBytes)throw Object.assign(new Error('sensor_principal_capacity_exceeded'),{statusCode:429});}
  #restore(value) { this.#observations = value.observations; this.#observationEvents = value.observationEvents; this.#eventRecords = value.eventRecords; this.#manualObservationEvents = value.manualObservationEvents; this.#corrections = value.corrections; this.#derivedStates = value.derivedStates; }
  async #transaction(mutator,{beforeSave=null}={}) {
    const operation = this.#operationChain.then(async () => {
      await this.#load(); const before = this.#state();
      try { const result = mutator(); this.#assertCapacity(); await beforeSave?.(); await this.#save(); await this.#mirrorStore?.commitManualCorrections?.(this.#corrections); return structuredClone(result); }
      catch (error) { this.#restore(before); throw error; }
    });
    this.#operationChain = operation.catch(() => undefined); return operation;
  }
  async #save() {
    if (!this.#filePath) return;
    try { await this.#writer(this.#filePath, this.#state()); this.#persistence = { state: 'ready', lastPersistedAt: new Date().toISOString(), lastError: null }; }
    catch (error) { this.#persistence = { ...this.#persistence, state: 'failed', lastError: String(error.message ?? error) }; throw error; }
  }
  async #load() {
    if (this.#loaded) return; const value = this.#filePath ? await readJson(this.#filePath, { observations: [] }) : { observations: [] };
    this.#observations = Array.isArray(value?.observations) ? value.observations.filter(validObservation) : [];
    for (const observation of this.#observations) assertObservationAllowed(observation, this.#universe);
    this.#observationEvents = value?.observationEvents && typeof value.observationEvents === 'object' ? value.observationEvents : {};
    this.#eventRecords = value?.eventRecords && typeof value.eventRecords === 'object' ? value.eventRecords : {};
    this.#manualObservationEvents = value?.manualObservationEvents && typeof value.manualObservationEvents === 'object' ? value.manualObservationEvents : {};
    this.#corrections = Array.isArray(value?.corrections) ? value.corrections : []; this.#derivedStates = value?.derivedStates && typeof value.derivedStates === 'object' ? value.derivedStates : {}; this.#loaded = true;
  }
}
