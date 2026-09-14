import { assertGlobalIncidentScope, assertIncidentScope } from '../../../../../packages/domain/src/authorization.mjs';

function compactEvent(event) {
  if (!event) return null;
  return {
    id: event.id, label: event.label, coordinate: event.coordinate, locationLabel: event.locationLabel,
    physicalOperationalState: event.physicalOperationalState, evidenceState: event.evidenceState,
    physicalState: event.physicalState, reportState: event.reportState, physicalSourceProfile: event.physicalSourceProfile,
    candidateAssessment: event.candidateAssessment, priority: event.priority, actionNeed: event.actionNeed,
    observedGeometry: event.observedGeometry, geometryFreshness: event.geometryFreshness, movement: event.movement,
    firstSeenAt: event.firstSeenAt, lastSeenAt: event.lastSeenAt,
    recentObservations: (event.observations ?? []).slice(-10).map((item) => ({ id: item.id, at: item.at, type: item.type, source: item.source, sourceFamily: item.sourceFamily, satellite: item.satellite, instrument: item.instrument, frpMw: item.frpMw, confidence: item.confidence, coordinate: item.coordinate })),
    timing: event.prospectiveDetectionTiming ?? null,
    forensics: { event: `/api/v10/events/${encodeURIComponent(event.id)}`, evidenceGraph: `/api/v10/events/${encodeURIComponent(event.id)}/evidence` }
  };
}
function compactPhysicalStatus(status={}){
  const sources=Object.fromEntries(Object.entries(status.sources??{}).map(([id,source])=>[id,{configured:source.configured,authenticated:source.authenticated,state:source.state,latestPoll:source.latestPoll,latestSuccess:source.latestSuccess,latestProduct:source.latestProduct?{id:source.latestProduct.id??null,observedAt:source.latestProduct.observedAt??null}:null,latestPhysicalObservation:source.latestPhysicalObservation,acceptedObservations:source.acceptedObservations,errorPresent:Boolean(source.error)}]));
  return{state:status.lastCycle?.error?'DEGRADED':status.lastCycle?.completedAt?'READY':'INITIALIZING',current:status.current??null,updatedAt:status.updatedAt??null,lastCycle:status.lastCycle?{startedAt:status.lastCycle.startedAt,completedAt:status.lastCycle.completedAt,durationMs:status.lastCycle.durationMs,worldChanged:status.lastCycle.worldChanged,eventCount:status.lastCycle.eventCount,error:status.lastCycle.error??null}:null,sources};
}

export class IncidentOperationsService {
  constructor({ operationalEventService, alertService, operationsStore, monitoredTerritoryService, evidenceNeedService,evidenceClosureService, livePhysicalIntelligenceService, deliveryAdapters, clock = () => new Date() } = {}) { Object.assign(this, { operationalEventService, alertService, operationsStore, monitoredTerritoryService, evidenceNeedService,evidenceClosureService, livePhysicalIntelligenceService, deliveryAdapters, clock }); }
  async incident(eventId, actor = null) {
    assertIncidentScope(actor,eventId);
    await this.operationsStore.recoverIfNeeded?.();
    const projected = await this.operationalEventService.operatorEvent?.(eventId) ?? null;
    let event = projected?.event ?? projected;
    if (!event) { const snapshot = await this.operationalEventService.snapshot(); event = snapshot.events?.find((item) => String(item.id) === String(eventId)); }
    if (!event) throw new Error('incident_not_found');
    const [alerts, opportunities, opportunityResults, territoryContext,closurePlans,coverage,decisionLedger,truthStates,evidenceRaces,operationalLatency] = await Promise.all([
      this.operationsStore.listAlerts({ eventId, limit: 100 }), this.operationsStore.listOpportunities({ eventId }), this.operationsStore.listOpportunityResults({eventId}),this.monitoredTerritoryService.context(event),
      this.evidenceClosureService?.plans?.({subjectType:'EVENT',subjectId:eventId})??{plans:[]},this.evidenceClosureService?.coverage?.(eventId)??null,this.evidenceClosureService?.ledger?.({subjectId:eventId,limit:300})??{decisions:[]},
      this.evidenceClosureService?.truthStates?.({eventId,limit:20})??{truthStates:[]},this.evidenceClosureService?.races?.({eventId,limit:20})??{evidenceRaces:[]},this.evidenceClosureService?.latency?.({eventId})??{latency:{}}
    ]);
    const needs = actor?.authentication?.authenticated ? this.evidenceNeedService.snapshot(actor).filter((item) => String(item.subjectId) === String(eventId)) : [];
    return {
      schemaVersion: 'vigia.incident-operations.v1', generatedAt: this.clock().toISOString(), incident: compactEvent(event),
      alerts, alertSummary: { total: alerts.length, active: alerts.filter((item) => !['RESOLVED', 'SUPPRESSED'].includes(item.lifecycleState)).length, unacknowledged: alerts.filter((item) => !item.acknowledgedAt && !['RESOLVED', 'SUPPRESSED'].includes(item.lifecycleState)).length },
      territoryContext, evidenceNeeds: needs, observationOpportunities: opportunities, observationOpportunityResults:opportunityResults,
      evidenceClosurePlans:closurePlans.plans,coverageIntelligence:coverage,fireTruthStates:truthStates.truthStates,evidenceRaces:evidenceRaces.evidenceRaces,operationalLatency:operationalLatency.latency,decisionLedger:decisionLedger.decisions,
      notices: ['This is a shadow operational projection, not an emergency dispatch product.', 'Stale physical evidence is retained but is not treated as a current fire alert.']
    };
  }
  async status() {
    let recoveryError=null,operational=null,metrics=null,evidenceClosure=null;
    try{await this.operationsStore.recoverIfNeeded?.();await this.monitoredTerritoryService.ensurePersisted?.();operational=await this.operationsStore.operationsStatus();metrics=await this.alertService.metrics();evidenceClosure=await this.evidenceClosureService?.status?.()??null;}catch(error){recoveryError=error;}
    const persistence=this.operationsStore.status(),ready=persistence.state==='ready'&&!recoveryError;
    const physicalSensing=compactPhysicalStatus(this.livePhysicalIntelligenceService.status()),degradedReasons=[];
    if(!ready)degradedReasons.push({dependency:'postgis',capability:'operations',code:recoveryError?.code??'operations_postgis_unavailable',retryable:true});
    if(this.monitoredTerritoryService.snapshot().state!=='READY')degradedReasons.push({dependency:'postgis',capability:'territory_registry',code:'territory_registry_not_persisted',retryable:true});
    return {
      schemaVersion: 'vigia.live-operations-status.v2', generatedAt: this.clock().toISOString(), mode: 'SHADOW_OPERATIONAL_PERFORMANCE',status:ready?'ready':'degraded',overallStatus:ready?'READY':persistence.state==='initializing'?'INITIALIZING':'DEGRADED',
      database:persistence,persistence,alertEngine:{state:ready?'READY':'DEGRADED',alerts:operational?.alerts??null},outbox:operational?.outbox??{states:null,backlog:null},
      opportunityEngine:{state:ready?'READY':'DEGRADED',opportunities:operational?.opportunities??null,results:operational?.opportunityResults??null},
      evidenceClosureEngine:{state:ready?'READY':'DEGRADED',plans:evidenceClosure},
      territoryRegistry: this.monitoredTerritoryService.snapshot(),assetRegistry:{state:this.monitoredTerritoryService.snapshot().state,count:this.monitoredTerritoryService.snapshot().assetCount},
      auditChain:operational?.audit??{count:null,headSequence:null,lastAppendAt:null},roster:operational?.roster??null,
      workers:{delivery:this.alertService.deliveryWorker?.status?.()??{state:'UNKNOWN'},physicalCycle:{state:physicalSensing.lastCycle?.completedAt?'IDLE':'INITIALIZING',lastSuccessfulCycleAt:physicalSensing.lastCycle?.completedAt??null}},
      currentBacklog:{outbox:operational?.outbox?.backlog??null,unacknowledged:(operational?.alerts?.OPEN??0)+(operational?.alerts?.ESCALATED??0)},
      delivery: this.deliveryAdapters.configuration(), metrics,physicalSensing,degradedReasons,scope: { mtg: 'OUT_OF_SCOPE' },
      notice: 'Shadow operational workflow; not validated or authorized for emergency production use.'
    };
  }
  #assertOptionsScope(actor,options,key='eventId'){const id=options?.[key];if(id)assertIncidentScope(actor,id);else assertGlobalIncidentScope(actor);}
  async opportunities(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return{opportunities:await this.operationsStore.listOpportunities(options)};}
  async opportunityResults(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return{results:await this.operationsStore.listOpportunityResults(options)};}
  async roster(options={},actor=null){if(actor?.authentication?.authenticated!==true)throw new Error('forbidden');assertGlobalIncidentScope(actor);await this.operationsStore.recoverIfNeeded?.();return{roster:await this.operationsStore.listRoster(options),qualification:'Explicit local SHADOW identities; no external organization or real personnel are asserted.'};}
  async statusProjection(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return{alerts:await this.operationsStore.alertStatusProjection(options)};}
  async alertTimeline(alertId,actor,eventId){assertIncidentScope(actor,eventId);await this.operationsStore.recoverIfNeeded?.();return this.operationsStore.alertTimeline(alertId);}
  async closurePlans(options={},actor){this.#assertOptionsScope(actor,options,'subjectId');await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.plans(options);}
  async coverage(subjectId,actor){assertIncidentScope(actor,subjectId);await this.operationsStore.recoverIfNeeded?.();return{coverage:await this.evidenceClosureService.coverage(subjectId)};}
  async decisionLedger(options={},actor){this.#assertOptionsScope(actor,options,'subjectId');await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.ledger(options);}
  async truthStates(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.truthStates(options);}
  async evidenceRaces(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.races(options);}
  async operationalLatency(options={},actor){this.#assertOptionsScope(actor,options);await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.latency(options);}
  async applyPreventionReview(planId,body,actor){assertGlobalIncidentScope(actor);await this.operationsStore.recoverIfNeeded?.();return this.evidenceClosureService.applyPreventionReview(planId,body,actor);}
}
