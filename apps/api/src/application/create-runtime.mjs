async function refreshOperationalState(services, hub, clock,{forceIntelligence=false}={}) {
  try {
    await services.sensorRegistryService?.refresh?.();
    await services.observationOpportunityService?.refresh?.();
    await services.scientificRuntimeService?.refresh?.();
    const cycle=services.livePhysicalIntelligenceService?await services.livePhysicalIntelligenceService.cycle():null;
    const live = cycle?.live??await services.operationalEventService?.snapshot?.({ force: true });
    const operationalTwin=await services.operationalIntelligenceService?.getCurrentTwin?.();
    if(operationalTwin)await services.repository?.operationalRecoveryService?.synchronize?.(operationalTwin);
    if(operationalTwin)await services.responseCapabilityReconciler?.reconcile?.({twin:operationalTwin});
    await services.operationalIntelligenceService?.retryAcceptedEventHandlers?.();
    await services.crisisAutopilotCoordinator?.retryPending?.();
    if(forceIntelligence||cycle?.status?.lastCycle?.worldChanged)for(const event of (live?.events??[]).slice(0,40))try{services.intelligenceService?.schedule?.(event.id);}catch{}
    const created = live ? await services.alertService?.sync?.(live) : [];
    await services.liveShadowCampaignService?.capture?.({live,cycle:cycle?.status??null});
    if (created?.length) hub.publish('alerts.updated', { at: clock().toISOString(), count: created.length });
    return{live,cycle:cycle?.status??null};
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', component: 'operational_refresh', at: clock().toISOString(), error: String(error.message ?? error) }));
    hub.publish('operational.error', { at: clock().toISOString(), error: 'operational_cycle_failed' });
    throw error;
  }
}

export function createRuntime({ config, services, hub, startup = null, clock = () => new Date() }) {
  let refreshTimer = null;
  let heartbeatTimer = null;
  let knowledgeTimer = null;
  let situationTimer = null;
  const scheduleSituation=()=>{if(stopped)return;situationTimer=setTimeout(async()=>{try{await services.situationService?.tick();}catch(error){console.error(JSON.stringify({component:'situation_worker',error:String(error.message)}));}finally{scheduleSituation();}},10000);situationTimer.unref?.();};
  const scheduleKnowledge=()=>{if(stopped)return;knowledgeTimer=setTimeout(async()=>{try{await services.roadStateService?.tick();await services.worldKnowledgeService?.tick();}catch(error){console.error(JSON.stringify({component:'world_knowledge_worker',error:String(error.message)}));}finally{scheduleKnowledge();}},15000);knowledgeTimer.unref?.();};
  let stopped = false;
  const scheduleRefresh = () => {
    if (stopped) return;
    refreshTimer = setTimeout(async () => {
      try {
        const result = await refreshOperationalState(services, hub, clock);
        runtime.refreshState = 'ready';
        runtime.metrics.refreshSuccesses += 1; runtime.metrics.lastSuccessAt = clock().toISOString(); runtime.metrics.lastError = null;
        if (result.cycle?.lastCycle?.worldChanged) hub.publish('world.updated', { at: clock().toISOString(), reason: 'source-refresh' });
      } catch (error) {
        runtime.refreshState = 'degraded';
        runtime.metrics.refreshFailures += 1; runtime.metrics.lastFailureAt = clock().toISOString(); runtime.metrics.lastError = String(error.message ?? error);
        console.error(JSON.stringify({ level: 'error', component: 'runtime_refresh', at: runtime.metrics.lastFailureAt, error: runtime.metrics.lastError }));
        hub.publish('world.error', { at: clock().toISOString(), error: 'source_refresh_failed' });
      } finally { scheduleRefresh(); }
    }, config.refreshMs);
    refreshTimer.unref?.();
  };
  const runtime = {
    config,
    startup,
    startedAt: clock().toISOString(),
    refreshState: 'initializing',
    metrics: { refreshSuccesses: 0, refreshFailures: 0, lastSuccessAt: null, lastFailureAt: null, lastError: null },
    async initialize() {
      try {
        await services.worldService.loadCache?.();
        // The listener and cached read plane are already available at this point.
        // Finish local reconciliation before the first provider transaction so
        // PostGIS writers cannot contend with one another during cold start.
        await services.initializeBackground?.();
        await refreshOperationalState(services, hub, clock,{forceIntelligence:true});
        // Replay is lower-priority historical evidence. Start it only after the
        // first live provider→event transaction so the two background writers
        // never contend during listener-first startup.
        void services.replayService?.initialize?.().catch((error)=>console.error(JSON.stringify({level:'error',component:'replay_background_initialize',at:clock().toISOString(),error:String(error.message??error)})));
        runtime.refreshState = 'ready';
        runtime.metrics.refreshSuccesses += 1; runtime.metrics.lastSuccessAt = clock().toISOString(); runtime.metrics.lastError = null;
        hub.publish('world.updated', { at: clock().toISOString(), reason: 'initial-load' });
      } catch (error) {
        runtime.refreshState = 'degraded';
        runtime.metrics.refreshFailures += 1; runtime.metrics.lastFailureAt = clock().toISOString(); runtime.metrics.lastError = String(error.message ?? error);
        console.error(JSON.stringify({ level: 'error', component: 'runtime_initialize', at: runtime.metrics.lastFailureAt, error: runtime.metrics.lastError }));
        hub.publish('world.error', { at: clock().toISOString(), error: 'initial_source_load_failed' });
      }
    },
    startTimers() {
      stopped = false;
      scheduleRefresh();
      scheduleKnowledge();
      scheduleSituation();
      heartbeatTimer = setInterval(() => hub.publish('heartbeat', { at: clock().toISOString() }), 25_000);
      heartbeatTimer.unref?.();
    },
    stop() {
      stopped = true;
      clearTimeout(refreshTimer);
      clearTimeout(knowledgeTimer);
      clearTimeout(situationTimer);
      clearInterval(heartbeatTimer);
      services.firmsGateway?.stop?.();
      services.sentinel3FrpGateway?.stop?.();
      services.replaySentinel3FrpGateway?.stop?.();
      void services.operationsStore?.close?.().catch((error) => console.error(JSON.stringify({ level: 'error', component: 'operations_postgres_shutdown', error: String(error.message ?? error) })));
      void services.physicalTruthStore?.close?.().catch((error) => console.error(JSON.stringify({ level: 'error', component: 'postgres_shutdown', error: String(error.message ?? error) })));
      void services.intelligenceSnapshotRepository?.close?.().catch((error) => console.error(JSON.stringify({ level: 'error', component: 'intelligence_postgres_shutdown', error: String(error.message ?? error) })));
      void services.deploymentIdentityStore?.close?.().catch((error) => console.error(JSON.stringify({ level: 'error', component: 'deployment_identity_postgres_shutdown', error: String(error.message ?? error) })));
      // The stores above no longer own their pool (they all share one — see
      // createServices) so their close() calls above are now no-ops for the
      // connection itself; this is the one place that actually ends it.
      void services.sharedDatabasePool?.end?.().catch((error) => console.error(JSON.stringify({ level: 'error', component: 'shared_postgres_shutdown', error: String(error.message ?? error) })));
      hub.close();
    }
  };
  return runtime;
}
