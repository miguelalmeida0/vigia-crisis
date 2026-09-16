import pg from 'pg';
import {TeamService} from '../modules/mission/team-service.mjs';
import {centralTeamTransport} from '../modules/mission/team-central-link.mjs';
import {TeamStore} from '../modules/mission/team-store.mjs';
import {RetainedFireObservationReconciler} from '../modules/intelligence/retained-fire-observations.mjs';
import {RealityQuestions} from '../modules/intelligence/reality-questions.mjs';
import {RoadStateService} from "../modules/intelligence/road-state-service.mjs";
import {createLanguageModel} from '../modules/intelligence/intelligence-language-model.mjs';
import {SituationAsk} from '../modules/intelligence/situation-ask.mjs';
import {SituationDocuments} from '../modules/intelligence/situation-documents.mjs';
import * as dependencies from './service-dependencies.mjs';
import { WorldKnowledgeStore } from '../modules/intelligence/world-knowledge-store.mjs';
import { SituationStore } from '../modules/intelligence/situation-store.mjs';
import { SituationService } from '../modules/intelligence/situation-service.mjs';
import { WorldKnowledgeService } from '../modules/intelligence/world-knowledge-service.mjs';
import { IncidentContextService } from '../modules/intelligence/incident-context-service.mjs';
import { GovernedReferenceInventory } from '../modules/intelligence/governed-reference-inventory.mjs';
import { GovernedArchiveCache } from '../shared/governed-archive-cache.mjs';

const {
  PtDataGateway, IpmaGateway, CopernicusGateway, Sentinel1Gateway, FirmsGateway, LiveSourceGateway, ThermalWmsAdapter, WorldService,
  ImageryService, CurrentImageryService, ObservationFabricService, EarthSearchGateway, HighResStacGateway, GeoIntegrityService,
  GeoIntegrityProofRepository, ScientificRuntimeService, GeospatialAnalysisService, BasemapService, ExposureService, OperatorStateRepository,
  CommandService, RemediationService, ControlService, AuditService, EvidenceRequestService, EvidenceNeedService, IncidentReviewService,
  DetectorRegistry, HazardService, PreventionService, PreventionFindingService, PreventionReviewContextService, PreventionReviewExchange,
  DetectionService, ScreeningSpreadProvider, ExternalSpreadProvider, ResponseService, GovernedResponseFacilityRepository, OsrmRoutingAdapter,
  ResponseCapabilityService, ResponseCapabilityReconciler, FieldNetCapacityTaskClient, OutcomeService, MissionService, GroundTruthService, OperationalReadinessService,
  LiveThermalAdapter, LiveFireService, FireEventService, ThermalSiteContextService, OperationalEventService, TerritoryCommandService,
  ObservationOpportunityService, EventObservationRepository, EventCorrectionService, SensorIngestService, SensorRegistryService,
  ActivePerceptionService, SensorTaskService, MtgFrpGateway, MtgFeatureInfoGateway, Sentinel3FrpGateway, AlertService, PostgresAlertStore,
  IncidentOperationsService, EvidenceClosureService, PostgresEvidenceOperationsStore, MonitoredTerritoryService, DeliveryAdapters,
  AlertDeliveryWorker, AcquisitionStore, ReplayService, PostgresPhysicalTruthStore, LivePhysicalIntelligenceService, CentralFieldNetService,
  LiveShadowCampaignService, FieldSensorQualificationService, PostgresIncidentCommandRepository, IncidentCommandService,
  OperationalIntelligenceQueryServiceV2, path, existsSync, RasterAssetBroker, PostgresIntelligenceRepository,
  PostgresOperationalIntelligenceRepository, OperationalRecoveryService, FinalGapClosureService, OperationalProofService,
  CrisisAutopilotCoordinator, CapFeedAdapter, FileCapIntegrationRepository, readJson, OperationalPeriodService, SourceResolutionRouter,
  ProtectionWorkflowService, ShiftHandoffService, HumanAttentionService, AppendOnlyOperationalEventJournal, OperationalIntelligenceService,
  Agent1CompatibilityReconciler, initializeCanonicalTwin, Agent1OperationalProjectionAdapter, CapOperationalAdapter,
  FieldNetOperationalAdapter, FirmsOperationalAdapter, createSourceRegistry, FieldCapacityReportProvider, assertCan, assertIncidentScope,
  FieldCapacityAdmissionService, IntelligenceService, createPinnedHttpsFetch, ProductionIntegrityViolation, PostgresReleaseDeploymentIdentityStore
} = dependencies;
export async function createServices({ config, hub, releaseIdentity, fetchImpl = null, clock = () => new Date(), onStartupPhase = null }) {
  const reportStartupPhase=(phase,state,details={})=>{if(typeof onStartupPhase!=='function')return;try{const{at,...metadata}=details;onStartupPhase({phase,state,at:at??clock().toISOString(),...metadata});}catch{}};
  const beginStartupPhase=(phase,details={})=>reportStartupPhase(phase,'started',details);
  const completeStartupPhase=(phase,details={})=>reportStartupPhase(phase,'completed',details);
  const verifiedReleaseId=releaseIdentity?.releaseId;
  if(!verifiedReleaseId)throw new ProductionIntegrityViolation('verified_release_identity_required: evidence services require immutable manifest identity.');
  if(config.releaseId!==verifiedReleaseId)throw new ProductionIntegrityViolation('verified_release_identity_mismatch: runtime configuration and immutable manifest identity disagree.',{configuredReleaseId:config.releaseId,verifiedReleaseId});
  beginStartupPhase('core_storage');
  // One shared pool for every Postgres-backed store in this process. Each of
  // these stores used to open its own independent pg.Pool (up to 24, 12, 10,
  // 8, 4 connections apiece) against the same VIGIA_DATABASE_URL — on a
  // connection-constrained managed Postgres (e.g. Neon's free tier) that
  // aggregate ceiling routinely exceeded what the server would actually
  // grant, surfacing as sporadic "operations_postgis_unavailable" and
  // "connection terminated" errors under completely ordinary load. A single
  // bounded pool, sized for this service's real concurrency, removes that
  // ceiling entirely instead of tuning around it.
  // lock_timeout matters as much as statement_timeout on a shared pool: without
  // it, a session blocked acquiring a row/advisory lock (e.g. WorldKnowledgeStore's
  // global advisory lock) occupies one of the 10 shared connections for the full
  // statement_timeout instead of failing fast, which is what let world-knowledge
  // lock contention starve unrelated queries (operational_refresh, runtime_refresh)
  // sharing this same pool.
  const sharedDatabasePool=config.databaseUrl?new pg.Pool({connectionString:config.databaseUrl,application_name:'vigia-api',max:10,connectionTimeoutMillis:config.databaseConnectionTimeoutMs,statement_timeout:config.databaseStatementTimeoutMs,query_timeout:config.databaseStatementTimeoutMs,lock_timeout:config.databaseLockTimeoutMs,idle_in_transaction_session_timeout:config.databaseStatementTimeoutMs}):null;
  const physicalTruthStore=new PostgresPhysicalTruthStore({pool:sharedDatabasePool,clock,connectionTimeoutMs:config.databaseConnectionTimeoutMs,statementTimeoutMs:config.databaseStatementTimeoutMs,lockTimeoutMs:config.databaseLockTimeoutMs}),physicalTruthStatus=await physicalTruthStore.initialize();
  const deploymentIdentityStore=new PostgresReleaseDeploymentIdentityStore({pool:sharedDatabasePool,releaseIdentity,clock,connectionTimeoutMs:config.databaseConnectionTimeoutMs,statementTimeoutMs:config.databaseStatementTimeoutMs});await deploymentIdentityStore.initialize();
  const operationsStore=new PostgresAlertStore({pool:sharedDatabasePool,clock,connectionTimeoutMs:config.databaseConnectionTimeoutMs,statementTimeoutMs:config.databaseStatementTimeoutMs});await operationsStore.initialize();
  const repository = new OperatorStateRepository({ filePath: config.stateFile, clock, mirrorStore:physicalTruthStatus.configured?physicalTruthStore:null }); await repository.initialize();
  completeStartupPhase('core_storage');beginStartupPhase('acquisition_archive_index');
  const acquisitionStore=new AcquisitionStore({filePath:config.acquisitionStateFile??path.join(path.dirname(config.stateFile),'acquisition-state.json'),archiveDir:config.rawArchiveDir??path.join(path.dirname(config.stateFile),'raw-source-products'),clock});await acquisitionStore.initialize();
  completeStartupPhase('acquisition_archive_index');beginStartupPhase('world_and_geospatial_state');
  const networkFetch=fetchImpl??globalThis.fetch;
  const pinnedProviderFetch=fetchImpl??createPinnedHttpsFetch({timeoutMs:config.requestTimeoutMs});
  const common = { fetchImpl:pinnedProviderFetch, timeoutMs: config.requestTimeoutMs, userAgent: config.userAgent, clock };
  const firmsGateway=new FirmsGateway({ ...common, mapKey: config.firmsMapKey, acquisitionStore, pollIntervalMs: config.firmsPollIntervalMs, maxBackoffMs: config.firmsMaxBackoffMs });
  const sourceGateway = new LiveSourceGateway({ ptdata: new PtDataGateway({ ...common, currentYear: config.currentYear,acquisitionStore }), ipma: new IpmaGateway({ ...common, acquisitionStore }), copernicus: new CopernicusGateway(common), firms: firmsGateway });
  const worldService = new WorldService({ sourceGateway, acquisitionStore, clock, refreshMs: config.refreshMs, stateFile: config.stateFile });
  await worldService.loadCache();
  const imageryService = new ImageryService({ fetchImpl:pinnedProviderFetch });
  const currentImageryService = new CurrentImageryService(fetchImpl?{fetchImpl}:{});
  const sentinel1Gateway = new Sentinel1Gateway(common);
  const earthSearchGateway = new EarthSearchGateway(common);
  const highResStacGateway = new HighResStacGateway({ endpoint: config.highResStacUrl, collection: config.highResStacCollection, token: config.highResStacToken,assetHosts:config.highResStacAssetHosts, ...common });
  const runtimeProjectRoot = config.projectRoot ?? path.resolve(config.webRoot ?? path.join(process.cwd(),'apps/web'),'../..');
  const geoProofStateFile = config.geoProofStateFile ?? path.join(path.dirname(config.stateFile), 'geo-integrity-proofs.json');
  const managedPython = path.join(runtimeProjectRoot,'.venv','bin','python');
  const geoPython = config.geoPython ?? (existsSync(managedPython)?managedPython:'python3');
  const geoIntegrityProofRepository = new GeoIntegrityProofRepository({ filePath: geoProofStateFile, clock }); await geoIntegrityProofRepository.initialize();
  const scientificRuntimeService = new ScientificRuntimeService({ projectRoot: runtimeProjectRoot, python: geoPython, timeoutMs: Math.max(config.requestTimeoutMs, 20_000), clock });
  const rasterAssetBroker=new RasterAssetBroker();
  const geoIntegrityService = new GeoIntegrityService({ projectRoot: runtimeProjectRoot, python: geoPython, timeoutMs: Math.max(config.requestTimeoutMs, 20_000), proofRepository: geoIntegrityProofRepository, runtimeService: scientificRuntimeService,rasterAssetBroker });
  const observationFabricService = new ObservationFabricService({ worldService, sentinel1Gateway, earthSearchGateway, highResStacGateway, currentImageryService, imageryService, geoIntegrityService, clock });
  const exposureService = new ExposureService({ fetchImpl:pinnedProviderFetch, clock, worldService });
  const geospatialAnalysisService = new GeospatialAnalysisService({ observationFabricService, geoIntegrityService, exposureService, projectRoot: runtimeProjectRoot, python: geoPython, timeoutMs: Math.max(config.requestTimeoutMs, 65_000) });
  const basemapService = new BasemapService({ cacheDirectory:path.join(runtimeProjectRoot,'.tmp','basemap-cache'),fetchImpl:fetchImpl??createPinnedHttpsFetch({timeoutMs:4_500}),clock });
  completeStartupPhase('world_and_geospatial_state');beginStartupPhase('operator_reference_state');
  const publicHubEvent=(event,fallback)=>({type:String(event?.type??fallback),at:clock().toISOString()});
  let intelligenceService=null,operationalEventService=null,operationalIntelligenceService=null,agent1CompatibilityReconciler=null,retainedFireObservationReconciler=null;
  const projectCanonicalTwin=async(snapshot)=>{
    if(!agent1CompatibilityReconciler||!Array.isArray(snapshot?.events))return null;
    try{await retainedFireObservationReconciler?.reconcile(snapshot.events);return await agent1CompatibilityReconciler.reconcile(snapshot.events,{receivedAt:clock(),projectedAt:clock(),budgetMs:config.agent1CompatibilityBudgetMs});}
    catch(error){agent1CompatibilityReconciler.markDegraded(error);return{state:'DEGRADED',error:{code:error?.code??'COMPATIBILITY_RECONCILIATION_FAILED',message:String(error?.message??error)}};}
  };
  const affectedIncidentIds=(event)=>{const values=[event?.incidentId,event?.subjectId,event?.eventId,event?.id,event?.targetId,event?.request?.incidentId,event?.request?.subjectId,event?.request?.targetId,event?.correction?.incidentId,event?.correction?.sourceEventId,event?.correction?.targetEventId,...(event?.incidentIds??[])],normalized=values.filter(Boolean).map((value)=>String(value).replace(/^(?:event|incident):/,''));return[...new Set(normalized)];};
  const changing=async(event)=>{const mutations=[];try{for(const incidentId of affectedIncidentIds(event)){const authority=await intelligenceService?.beginInputMutation?.(incidentId);if(authority?.mutationToken)mutations.push({incidentId,mutationToken:authority.mutationToken});}return{schemaVersion:'vigia.intelligence-mutation-lease.v1',mutations};}catch(error){await Promise.allSettled(mutations.map(({incidentId,mutationToken})=>intelligenceService?.abortInputMutation?.(incidentId,mutationToken)));throw error;}};
  const finishAffected=(event,committed,lease=null)=>{if(lease){if(lease.schemaVersion!=='vigia.intelligence-mutation-lease.v1'||!Array.isArray(lease.mutations))throw new Error('intelligence_mutation_lease_invalid');return Promise.all(lease.mutations.map(({incidentId,mutationToken})=>intelligenceService?.finishInputMutation?.(incidentId,{committed,mutationToken})));}if(!committed)return Promise.resolve([]);return Promise.all(affectedIncidentIds(event).map((incidentId)=>intelligenceService?.invalidateInput?.(incidentId)));};
  const changeFailed=(event,lease)=>finishAffected(event,false,lease);
  const changed = async(event,lease) => {hub.publish('operator.changed', publicHubEvent(event,'operator.changed'));await finishAffected(event,true,lease);};
  const refreshChangedInputs=async(event,lease)=>{hub.publish('world.updated',publicHubEvent(event,'world.updated'));operationalEventService?.invalidate?.();const snapshot=await operationalEventService?.snapshot?.({force:true}).catch(()=>null);if(snapshot)await projectCanonicalTwin(snapshot).catch(()=>undefined);await finishAffected(event,true,lease);};
  const controlService = new ControlService({ repository });
  const auditService = new AuditService({ repository, actionStore: physicalTruthStore, clock });
  const evidenceRequestService = new EvidenceRequestService({ repository, auditService, clock, onChanging:changing,onChanged: changed,onChangeFailed:changeFailed });
  const incidentReviewService = new IncidentReviewService({ repository, auditService, clock, onChanged: changed });
  const detectorRegistry = new DetectorRegistry({ clock });
  const hazardService = new HazardService({ repository, auditService, clock, onChanged: changed });
  const remediationService = new RemediationService({ repository, auditService, clock, onChanged: changed });
  const commandService = new CommandService({ repository, auditService, clock, onChanged: changed });
  const preventionReviewContextService = new PreventionReviewContextService({filePath:config.preventionContextFile});await preventionReviewContextService.initialize();
  const preventionReviewExchange=new PreventionReviewExchange({packFile:config.preventionExpertReviewPackFile,keyFile:config.preventionExpertReviewKeyFile});await preventionReviewExchange.initialize();
  const preventionService = new PreventionService({ worldService, repository, detectorRegistry,preventionReviewContextService,preventionReviewExchange });
  const preventionFindingService = new PreventionFindingService({ repository, geospatialAnalysisService, auditService, preventionReviewContextService,preventionReviewExchange, clock, onChanged:changed });
  const detectionService = new DetectionService({ worldService, repository, clock, benchmarkFile:config.detectionBenchmarkFile,smallFireOpportunityFile:config.smallFireOpportunityFile,physicalSensingHandoffFile:config.physicalSensingHandoffFile,sentinel3ProductManifestFile:config.sentinel3ProductManifestFile,preventionReviewCorpusFile:config.preventionReviewCorpusFile });
  const screeningSpreadProvider = new ScreeningSpreadProvider();
  const externalSpreadProvider = new ExternalSpreadProvider({ endpoint: config.spreadProviderUrl, apiKey: config.spreadProviderApiKey, fetchImpl:pinnedProviderFetch, timeoutMs: config.requestTimeoutMs });
  const responseService = new ResponseService({ worldService, detectionService, exposureService, screeningSpreadProvider, externalSpreadProvider });
  // Shared for the process lifetime by every consumer that resolves governed
  // reference archives — GovernedResponseFacilityRepository here and
  // GovernedReferenceInventory (constructed below, inside IncidentContextService)
  // both parse governed-incident-context.json and the same OSM
  // response-facilities archive; without this they each read and JSON.parse
  // that ~5MB file independently. createServices is the lifecycle owner for
  // both, so it owns this cache too rather than either class defaulting to a
  // private one.
  const governedArchiveCache = new GovernedArchiveCache();
  const responseFacilityRepository = new GovernedResponseFacilityRepository({ projectRoot: runtimeProjectRoot, archiveCache: governedArchiveCache });
  await responseFacilityRepository.initialize();
  const responseRoutingAdapter = new OsrmRoutingAdapter({ fetchImpl:pinnedProviderFetch, timeoutMs:Math.min(config.requestTimeoutMs,6_000), clock });
  const outcomeService = new OutcomeService({ repository,clock });
  const protectionWorkflowService=new ProtectionWorkflowService({repository,externalDispatch:null,clock});
  const missionService = new MissionService({ worldService, preventionService, detectionService, commandService });
  const thermalAdapter = new ThermalWmsAdapter({ fetchImpl:pinnedProviderFetch, timeoutMs: config.requestTimeoutMs });
  const liveThermalAdapter = new LiveThermalAdapter({ fetchImpl:pinnedProviderFetch, timeoutMs: config.requestTimeoutMs, clock });
  const liveFireService = new LiveFireService({ worldService, thermalAdapter: liveThermalAdapter, clock });
  const eventHistoryName = 'fire-event-observations.production.json';
  const eventRepository = new EventObservationRepository({ filePath: path.join(path.dirname(config.stateFile), eventHistoryName), mirrorStore:physicalTruthStore, universe: 'production' });
  const thermalSiteContextService = new ThermalSiteContextService({ filePath: config.thermalSiteContextFile }); await thermalSiteContextService.initialize();
  const eventCorrectionService = new EventCorrectionService({ eventRepository, auditService, clock, onChanging:changing,onChanged:refreshChangedInputs,onChangeFailed:changeFailed });
  const sensorRegistryService = new SensorRegistryService({ filePath: config.sensorRegistryFile, clock, mirrorStore:physicalTruthStore }); await sensorRegistryService.refresh();
  const activePerceptionService = new ActivePerceptionService({ registry: sensorRegistryService });
  const observationOpportunityService = new ObservationOpportunityService({ filePath: config.observationOpportunityFile, orbitFile:path.join(runtimeProjectRoot,'data/reference/orbits/sentinel3-current.json'), clock, operationsStore }); await observationOpportunityService.refresh();
  completeStartupPhase('operator_reference_state');const sensorTaskService = new SensorTaskService({ registry: sensorRegistryService, token: config.sensorTaskToken, clock, timeoutMs: config.requestTimeoutMs });
  const mtgFrpGateway = new MtgFrpGateway({ directory: config.mtgFrpDir, jsonUrl: config.mtgFrpJsonUrl, ...common });
  const mtgFeatureInfoGateway = new MtgFeatureInfoGateway(common);
  const sentinel3FrpGateway = new Sentinel3FrpGateway({ directory: config.sentinel3FrpDir, jsonUrl: config.sentinel3FrpJsonUrl, cdseUsername:config.cdseUsername, cdsePassword:config.cdsePassword, cdseAccessToken:config.cdseAccessToken, cdseCollection:config.cdseCollection, cdseSearchStart:config.cdseSearchStart, cdseSearchEnd:config.cdseSearchEnd, cdseLookbackHours:config.cdseLookbackHours, cdseMaxProducts:config.cdseMaxProducts, cdseDownloadTimeoutMs:config.cdseDownloadTimeoutMs, acquisitionStore, pythonBinary:geoPython, ...common,cdseFetchImpl:pinnedProviderFetch });
  const replaySentinel3FrpGateway = new Sentinel3FrpGateway({ cdseUsername:config.cdseUsername, cdsePassword:config.cdsePassword, cdseAccessToken:config.cdseAccessToken, cdseCollection:config.cdseReplayCollection, cdseSearchStart:config.cdseReplaySearchStart, cdseSearchEnd:config.cdseReplaySearchEnd, cdseLookbackHours:config.cdseLookbackHours, cdseMaxProducts:config.cdseReplayMaxProducts, cdseDownloadTimeoutMs:config.cdseDownloadTimeoutMs, acquisitionStore, pythonBinary:geoPython, ...common,cdseFetchImpl:pinnedProviderFetch });
  const fireEventService = new FireEventService({ worldService, thermalAdapter: liveThermalAdapter, eventRepository, acquisitionStore, physicalTruthStore, mtgFrpGateway, sentinel3FrpGateway, mtgFeatureInfoGateway, activePerceptionService, observationOpportunityService, thermalSiteContextService, clock });
  const fallbackOwner=config.operatorBearerToken?{id:config.operatorActorId,name:config.operatorActorName,title:config.operatorActorTitle,role:config.operatorActorRole}:null;
  const evidenceNeedService = new EvidenceNeedService({ repository, eventRepository, auditService, fallbackOwner, automaticRequestCreation:config.automaticEvidenceRequestCreation, clock, onChanging:changing,onChanged: changed,onChangeFailed:changeFailed });
  beginStartupPhase('operational_event_projection');operationalEventService = new OperationalEventService({ fireEventService, evidenceNeedService, projectionFile:path.join(path.dirname(config.stateFile),'event-projections.production.json'),clock, cacheMs: config.refreshMs,onProjectionChanged:({incidentIds,compatibilityEvents})=>{for(const incidentId of incidentIds??[])if(intelligenceService?.isDirty?.(incidentId))try{intelligenceService.recompute(incidentId);}catch{}if(agent1CompatibilityReconciler&&Array.isArray(compatibilityEvents))void projectCanonicalTwin({events:compatibilityEvents});} });await operationalEventService.initialize();
  completeStartupPhase('operational_event_projection');const canonicalSourceRegistry=createSourceRegistry([
    {sourceId:'ptdata-public-reports',familyId:'report.ptdata-anepc',familyClass:'REPORT',label:'ANEPC-derived public reports via PTData',producerId:'ptdata',upstreamOrigin:'PTData public reports',staleAfterMs:3600000,initialStatus:'UNKNOWN',registeredAt:'2026-08-25T00:00:00.000Z'},
    {sourceId:'agent1-operational-projection',familyId:'system.agent1-operational-projection',familyClass:'SYSTEM',sourceClass:'SYSTEM',label:'Agent 1 reliability compatibility projection',provider:'VIGIA',producerId:'vigia-agent1-runtime',upstreamOrigin:'VIGIA Agent 1 certified runtime',staleAfterMs:120_000,initialStatus:'ACTIVE',registeredAt:'2026-08-25T00:00:00.000Z',capabilities:['RELIABILITY_PROJECTION']},
    {sourceId:'fieldnet',familyId:'physical.fieldnet',familyClass:'PHYSICAL',sourceClass:'FIELDNET',label:'VIGIA FieldNet',provider:'VIGIA',producerId:'fieldnet',upstreamOrigin:'VIGIA FieldNet',staleAfterMs:3_600_000,initialStatus:'UNKNOWN',registeredAt:'2026-08-25T00:00:00.000Z',capabilities:['PHYSICAL_OBSERVATION']},
    {sourceId:'nasa-firms',familyId:'physical.satellite-thermal',familyClass:'PHYSICAL',sourceClass:'SATELLITE',label:'NASA FIRMS VIIRS + MODIS',provider:'NASA FIRMS',producerId:'NASA-FIRMS',upstreamOrigin:'NASA FIRMS VIIRS and MODIS',staleAfterMs:21_600_000,initialStatus:'UNKNOWN',registeredAt:'2026-08-25T00:00:00.000Z',capabilities:['THERMAL_OBSERVATION']},
    {sourceId:'sentinel3-slstr',familyId:'physical.slstr',familyClass:'PHYSICAL',sourceClass:'SATELLITE',label:'Sentinel-3A/3B SLSTR FRP',provider:'Copernicus Data Space Ecosystem',producerId:'ESA-COPERNICUS',upstreamOrigin:'Sentinel-3 SLSTR L2 FRP',staleAfterMs:14_400_000,initialStatus:'UNKNOWN',registeredAt:'2026-08-25T00:00:00.000Z',capabilities:['THERMAL_OBSERVATION']},
    {sourceId:'cap-authority',familyId:'official.cap-alert',familyClass:'OFFICIAL',sourceClass:'OFFICIAL',label:'Governed CAP authority',provider:'Configured CAP authority',producerId:'civil-protection-authority',upstreamOrigin:'OASIS CAP feed',staleAfterMs:3_600_000,initialStatus:'UNKNOWN',registeredAt:'2026-08-25T00:00:00.000Z',capabilities:['CAP_LIFECYCLE']}
  ]);
  const operationalEventJournal=new AppendOnlyOperationalEventJournal({filePath:path.join(path.dirname(config.stateFile),'operational-event-fabric.jsonl'),clock}),agent1Adapter=new Agent1OperationalProjectionAdapter();
  beginStartupPhase('canonical_twin_projection');operationalIntelligenceService=new OperationalIntelligenceService({currentnessPolicy:JSON.parse(process.env.VIGIA_CURRENTNESS_POLICY_JSON??'{}'),journal:operationalEventJournal,sourceRegistry:canonicalSourceRegistry,adapters:[agent1Adapter,new FieldNetOperationalAdapter(),new FirmsOperationalAdapter(),new FirmsOperationalAdapter({id:'sentinel3-slstr',sourceId:'sentinel3-slstr',upstreamOrigin:'Sentinel-3 SLSTR L2 FRP',authority:'Copernicus Data Space Ecosystem / ESA',producerId:'ESA-COPERNICUS'}),new CapOperationalAdapter()],clock});
  agent1CompatibilityReconciler=new Agent1CompatibilityReconciler({service:operationalIntelligenceService,journal:operationalEventJournal,adapter:agent1Adapter,clock});
  const canonicalTwinStartup=await initializeCanonicalTwin({service:operationalIntelligenceService,journal:operationalEventJournal,reconciler:agent1CompatibilityReconciler,loadSnapshotEvents:async()=>(await operationalEventService.compatibilitySnapshot()).events,clock,canonicalBudgetMs:config.canonicalTwinProjectionBudgetMs,compatibilityBudgetMs:config.agent1CompatibilityBudgetMs,onPhase:({phase,state,at,...details})=>reportStartupPhase(phase,state,{at,...details})});
  retainedFireObservationReconciler=new RetainedFireObservationReconciler({service:operationalIntelligenceService,clock});
  await retainedFireObservationReconciler.reconcile((await operationalEventService.compatibilitySnapshot()).events);
  completeStartupPhase('canonical_twin_projection',{compatibilityState:canonicalTwinStartup.compatibilityState,acceptedJournalEventCount:operationalEventJournal.status().eventCount});beginStartupPhase('command_and_intelligence_state');
  const incidentCommandRepository=new PostgresIncidentCommandRepository({pool:sharedDatabasePool,clock});
  const incidentCommandService=new IncidentCommandService({repository:incidentCommandRepository,releaseId:verifiedReleaseId,canonicalEventResolver:(eventId)=>operationalEventService.operatorEvent(eventId),clock});await incidentCommandService.initialize();
  const operationalIntelligenceRepository=sharedDatabasePool?new PostgresOperationalIntelligenceRepository({pool:sharedDatabasePool,clock}):null;
  // GovernedReferenceInventory.initialize() reads all 13 governed road-band
  // archives (plus the response-facilities archive shared with
  // responseFacilityRepository above via governedArchiveCache) and builds a
  // nationwide spatial `cells` index — measured in isolation at ~62MB
  // heapUsed, even after archive-sharing removed the one duplicate read. On
  // a 256MB ceiling that is too large to pay unconditionally at boot for a
  // service only IncidentContextService.project() calls (governed
  // perimeter/spatial-relationship context for one incident at a time).
  // Deliberately NOT initialized here at all — unlike replayService below
  // ("start once, in the background, right away"), this is genuinely lazy:
  // IncidentContextService.project() triggers and single-flights it itself,
  // on first real demand, and its existing graceful-degradation contract
  // (`inventory.state !== 'CACHED'` → UNAVAILABLE) already covers "not ready
  // yet" for any caller that arrives before that first load settles.
  const incidentContextService=new IncidentContextService({pool:operationalIntelligenceRepository?.pool,repository:operationalIntelligenceRepository,projectRoot:runtimeProjectRoot,clock,inventory:new GovernedReferenceInventory({projectRoot:runtimeProjectRoot,archiveCache:governedArchiveCache})});
  const operationalIntelligenceQueryService=new OperationalIntelligenceQueryServiceV2({projectRoot:runtimeProjectRoot,repository:operationalIntelligenceRepository,clock});await operationalIntelligenceQueryService.initialize();
  const centralFieldNetService=new CentralFieldNetService({filePath:config.fieldnetCentralStateFile,operationalEventService,incidentCommandService,nodeRegistry:config.fieldNetNodeRegistry,clock,onChanging:changing,onChanged:async(event,lease)=>{hub.publish('world.updated',publicHubEvent(event,'fieldnet.reconciled'));await finishAffected(event,true,lease);},onChangeFailed:changeFailed});await centralFieldNetService.initialize();
  const fieldCapacityAdmissionService=new FieldCapacityAdmissionService({filePath:config.fieldCapacityAdmissionFile??path.join(path.dirname(config.stateFile),'field-capacity-admissions.json'),snapshotForIncident:(incidentId,options)=>centralFieldNetService.snapshot(incidentId,options),authorizeAdmission:({actor,scope,action,incidentId,truthEnvironment})=>{assertCan(actor,'fieldnet:capacity-admit');assertIncidentScope(actor,incidentId);return{authorized:true,scope,action,incidentId,truthEnvironment,principalId:String(actor.id),authorityReference:`operator-session:${String(actor.id)}:${String(actor.role)}`};},clock});await fieldCapacityAdmissionService.initialize();
  const fieldCapacityReportProvider=new FieldCapacityReportProvider({snapshotForIncident:(incidentId,options)=>fieldCapacityAdmissionService.decorateSnapshot(incidentId,centralFieldNetService.snapshot(incidentId,options)),clock});
  let fieldNetCapacityTaskClient=null;
  const capacityTaskScopes=config.fieldNetCapacityTaskIncidentScopes??[],capacityTaskNodeId=config.fieldNetCapacityTaskNodeId,capacityTaskDestination=capacityTaskNodeId?config.fieldNetNodeRegistry?.[capacityTaskNodeId]:null;
  if(config.fieldNetCapacityTaskSocket&&config.fieldNetCapacityTaskKey&&config.fieldNetCapacityTaskKeyId&&capacityTaskScopes.length===1&&capacityTaskScopes[0]!=='*'&&capacityTaskDestination){
    try{fieldNetCapacityTaskClient=new FieldNetCapacityTaskClient({socketPath:config.fieldNetCapacityTaskSocket,keyId:config.fieldNetCapacityTaskKeyId,key:config.fieldNetCapacityTaskKey,incidentId:capacityTaskScopes[0],destination:{nodeId:capacityTaskNodeId,...capacityTaskDestination},expectedReleaseIdentity:releaseIdentity,centralSnapshotForIncident:(incidentId)=>centralFieldNetService.snapshot(incidentId,{limit:250}),clock,timeoutMs:config.fieldNetCapacityTaskTimeoutMs});}catch{fieldNetCapacityTaskClient=null;}
  }
  const worldKnowledgeService=new WorldKnowledgeService({model:createLanguageModel(),store:new WorldKnowledgeStore({pool:operationalIntelligenceRepository?.pool,filePath:path.join(path.dirname(config.stateFile),'world-knowledge.json')}),clock});await worldKnowledgeService.initialize();responseFacilityRepository.attachKnowledge(worldKnowledgeService);incidentContextService.knowledgeService=worldKnowledgeService;
  const responseCapabilityService=new ResponseCapabilityService({detectionService,facilityRepository:responseFacilityRepository,routingAdapter:responseRoutingAdapter,capacityReportProvider:fieldCapacityReportProvider,capacityTaskDispatcher:fieldNetCapacityTaskClient,recommendationRepository:repository,clock});
  const situationStore=new SituationStore({pool:operationalIntelligenceRepository?.pool,filePath:path.join(path.dirname(config.stateFile),'incident-situations.json')});await situationStore.initialize();
  const roadStateService=new RoadStateService({pool:operationalIntelligenceRepository?.pool,filePath:path.join(path.dirname(config.stateFile),'road-sources.json'),clock});await roadStateService.initialize();
  const situationService=new SituationService({store:situationStore,knowledge:worldKnowledgeService,routingAdapter:responseRoutingAdapter,clock});
  const teamService=new TeamService({store:new TeamStore({filePath:path.join(path.dirname(config.stateFile),'team-command.sqlite')}),situation:situationService,clock});
  situationService.onSnapshotChanged=id=>teamService.refreshIncident(id);
  if(process.env.VIGIA_TEAM_CENTRAL_URL&&process.env.VIGIA_TEAM_CENTRAL_OPERATOR_TOKEN)teamService.centralTransport=centralTeamTransport({url:process.env.VIGIA_TEAM_CENTRAL_URL,token:process.env.VIGIA_TEAM_CENTRAL_OPERATOR_TOKEN});
  situationService.roadStateService=roadStateService;roadStateService.onChanged=async()=>{for(const s of await situationStore.recent())await situationStore.enqueue(s.incident.id,{reason:'ROAD_SOURCE_CHANGED'},clock().toISOString());};
  await situationService.initialize();const situationAsk=new SituationAsk(situationService),situationDocuments=new SituationDocuments({service:situationService,knowledge:worldKnowledgeService,clock});
  responseCapabilityService.situationService=situationService;incidentContextService.situationService=situationService;worldKnowledgeService.onEntitiesChanged=ids=>situationService.changedEntities(ids);worldKnowledgeService.onSourceStateChanged=id=>situationService.sourceStateChanged(id);
  const capIntegrationRepository=new FileCapIntegrationRepository({filePath:path.join(path.dirname(config.stateFile),'cap-integration-state.json')});
  const capFeedAdapter=new CapFeedAdapter({endpoint:config.capPartnerUrl,bearerToken:config.capPartnerToken,repository:capIntegrationRepository,clock,bindIncident:async alert=>{if(!config.capIncidentBindingsFile)return null;const bindings=await readJson(config.capIncidentBindingsFile,{});const incidentId=String(bindings?.[alert.identifier]??'').trim();return incidentId?{incidentId}:null;},projectIncident:async projection=>operationalIntelligenceService.ingestRawProviderPayload('cap',{identifier:projection.externalIncidentId,sender:projection.provenance?.sender??'configured-cap-authority',sent:projection.alert.sent,status:projection.alert.status,scope:'Public',msgType:projection.alert.messageType,coordinate:projection.alert.coordinate,info:{event:projection.alert.event,category:'wildfire',urgency:projection.alert.urgency,severity:projection.alert.severity,certainty:projection.alert.certainty,headline:projection.alert.headline,description:projection.alert.description,area:{coordinate:projection.alert.coordinate}}},{receivedAt:clock(),projectedAt:clock(),context:{targetEventId:projection.incidentId,correlationKeys:[`incident:${String(projection.incidentId).replace(/^incident:/,'')}`]}})});
  const sourceResolutionRouter=new SourceResolutionRouter({firmsGateway,sentinel3FrpGateway,centralFieldNetService,operationalEventService,operationalIntelligenceService,capFeedAdapter,clock});
  const operationalRecoveryService=new OperationalRecoveryService({repository,projectRoot:runtimeProjectRoot,clock,sourceResolutionRouter});
  const responseCapabilityReconciler=new ResponseCapabilityReconciler({responseCapabilityService,clock});
  const crisisAutopilotCoordinator=new CrisisAutopilotCoordinator({repository,canonicalEventResolver:async({eventId})=>operationalIntelligenceService.getEvent(eventId),clock,onChanged:changed});
  const finalGapClosureService=new FinalGapClosureService({worldService,repository,projectRoot:runtimeProjectRoot,clock});
  const operationalProofService=new OperationalProofService({projectRoot:runtimeProjectRoot});
  const operationalPeriodService=new OperationalPeriodService({repository,clock});
  repository.operationalRecoveryService=operationalRecoveryService;
  situationAsk.reality=new RealityQuestions({intelligence:operationalIntelligenceService,world:worldService,recovery:operationalRecoveryService,situation:situationService,context:incidentContextService,identityResolver:id=>operationalEventService.operatorEvent(id),clock});
  const shiftHandoffService=new ShiftHandoffService({repository,operationalIntelligenceService,operationalRecoveryService,clock});
  const humanAttentionService=new HumanAttentionService({repository,operationalIntelligenceService,operationalRecoveryService,clock});
  const fieldSensorQualificationService=new FieldSensorQualificationService({hardwareInventoryFile:config.fieldSensorHardwareInventoryFile,clock});
  const territoryCommandService = new TerritoryCommandService({ preventionService, operationalEventService, clock });
  const replayService = new ReplayService({ corpusFile: config.replayCorpusFile, sourceManifestFile: config.replaySourceManifestFile, benchmarkFile: config.replayBenchmarkFile, sentinel3FrpGateway:replaySentinel3FrpGateway, acquisitionStore, physicalTruthStore });await replayService.initializeLocal();
  const livePhysicalIntelligenceService=new LivePhysicalIntelligenceService({filePath:config.livePhysicalStateFile??path.join(path.dirname(config.stateFile),'live-physical-intelligence.json'),worldService,operationalEventService,acquisitionStore,physicalTruthStore,sentinel3FrpGateway,thermalAdapter:liveThermalAdapter,clock});await livePhysicalIntelligenceService.initialize();
  const intelligenceSnapshotRepository=new PostgresIntelligenceRepository({pool:sharedDatabasePool,clock});
  intelligenceService=new IntelligenceService({snapshotRepository:intelligenceSnapshotRepository,operationalEventService,evidenceNeedService,stateRepository:repository,replayService,preventionFindingService,centralFieldNetService,clock});await intelligenceService.initialize();
  completeStartupPhase('command_and_intelligence_state');beginStartupPhase('operations_and_alert_state');
  await operationsStore.recoverIfNeeded();const operationalReadinessService = new OperationalReadinessService({ config, repository, eventRepository, physicalTruthStore,operationsStore, auditService, operationalEventService, scientificRuntimeService, geoIntegrityProofRepository, sensorRegistryService, replayService, worldKnowledgeService, roadStateService, clock });
  const groundTruthService = new GroundTruthService({ controlService, worldService, preventionService, detectionService, outcomeService, repository, detectorRegistry, auditService, operationalEventService,livePhysicalIntelligenceService, featureFlags:config.featureFlags });
  const sensorIngestService = new SensorIngestService({ eventRepository, registry: sensorRegistryService, token: config.sensorIngestToken, clock, onChanging:changing,onChanged:refreshChangedInputs,onChangeFailed:changeFailed });
  const authenticatedLocalOperator=Boolean(config.operatorBearerToken||config.localOperatorSession?.enabled);
  const monitoredTerritoryService=new MonitoredTerritoryService({store:operationsStore,referenceFile:config.thermalSiteContextFile,operatorActorId:config.operatorActorId,operatorConfigured:authenticatedLocalOperator,operatorIncidentScopes:config.operatorIncidentScopes,clock});await monitoredTerritoryService.initialize();
  const deliveryAdapters=new DeliveryAdapters({fetchImpl:networkFetch,pinnedHttpsFetch:createPinnedHttpsFetch({timeoutMs:Math.min(config.requestTimeoutMs,10_000)}),webhookUrl:config.alertWebhookUrl,emailProviderUrl:config.alertEmailProviderUrl,emailToken:config.alertEmailToken,emailFrom:config.alertEmailFrom,emailTo:config.alertEmailTo,timeoutMs:Math.min(config.requestTimeoutMs,10_000)});
  const alertDeliveryWorker=new AlertDeliveryWorker({store:operationsStore,adapters:deliveryAdapters,clock});
  const evidenceOperationsStore=new PostgresEvidenceOperationsStore({operationsStore,clock});
  const evidenceClosureService=new EvidenceClosureService({store:evidenceOperationsStore,clock});
  const alertService = new AlertService({ store:operationsStore,territoryService:monitoredTerritoryService,deliveryWorker:alertDeliveryWorker,repository,evidenceClosureService,supervisorActorId:authenticatedLocalOperator?config.operatorActorId:'shadow:supervisor-duty',requireAuthenticatedMutations:true,clock }); await alertService.initialize();
  const liveShadowCampaignService=new LiveShadowCampaignService({filePath:path.join(runtimeProjectRoot,'data/runtime/live-shadow-campaign.json'),acquisitionStore,alertService,centralFieldNetService,evidenceClosureService,releaseId:verifiedReleaseId,clock});await liveShadowCampaignService.initialize();
  const incidentOperationsService=new IncidentOperationsService({operationalEventService,alertService,operationsStore,monitoredTerritoryService,evidenceNeedService,evidenceClosureService,livePhysicalIntelligenceService,deliveryAdapters,clock});
  completeStartupPhase('operations_and_alert_state');let backgroundInitialization=null;
  const initializeBackground=()=>backgroundInitialization??=(async()=>{const results=await Promise.allSettled([scientificRuntimeService.refresh(),(async()=>{await preventionFindingService.reconcileReviewVersionGaps();await preventionFindingService.reconcileEvidenceClosures();})(),evidenceNeedService.reconcileBacklog(),operationalRecoveryService.synchronize(await operationalIntelligenceService.getCurrentTwin()),(async()=>crisisAutopilotCoordinator.reconcile(await operationalIntelligenceService.getOperationalEvents()))()]);
    const failures=results.filter((item)=>item.status==='rejected');
    if(failures.length)throw new Error(`background_service_initialization_failed:${failures.map((item)=>String(item.reason?.message??item.reason)).join('|')}`);
    return{state:'ready',completedAt:clock().toISOString()};})();
  return {teamService,roadStateService,situationService,situationStore,situationAsk,situationDocuments,worldKnowledgeService,incidentContextService, projectRoot:runtimeProjectRoot,repository, acquisitionStore, sharedDatabasePool, physicalTruthStore, deploymentIdentityStore,operationsStore,evidenceOperationsStore,evidenceClosureService, firmsGateway, worldService, imageryService, currentImageryService, observationFabricService, observationOpportunityService, geoIntegrityService, geoIntegrityProofRepository, scientificRuntimeService, geospatialAnalysisService, earthSearchGateway, highResStacGateway, basemapService, exposureService, commandService, remediationService, controlService, auditService, evidenceRequestService, evidenceNeedService, incidentReviewService, detectorRegistry, hazardService, preventionService, preventionFindingService, preventionReviewContextService,preventionReviewExchange, detectionService, responseService, responseFacilityRepository,responseRoutingAdapter,responseCapabilityService,responseCapabilityReconciler, outcomeService,protectionWorkflowService,shiftHandoffService,humanAttentionService, missionService, groundTruthService, operationalReadinessService, thermalAdapter, liveThermalAdapter, liveFireService, fireEventService, operationalEventService, operationalEventJournal,operationalIntelligenceService,agent1CompatibilityReconciler,canonicalTwinStartup,canonicalSourceRegistry,centralFieldNetService,fieldCapacityAdmissionService,fieldCapacityReportProvider,fieldSensorQualificationService,incidentCommandRepository,incidentCommandService,operationalIntelligenceRepository,operationalIntelligenceQueryService,liveShadowCampaignService, territoryCommandService, eventCorrectionService, sensorIngestService, sensorRegistryService, activePerceptionService, sensorTaskService, mtgFrpGateway, sentinel3FrpGateway, replaySentinel3FrpGateway, mtgFeatureInfoGateway, thermalSiteContextService, monitoredTerritoryService,deliveryAdapters,alertDeliveryWorker,alertService,incidentOperationsService,replayService,livePhysicalIntelligenceService,intelligenceSnapshotRepository,intelligenceService,operationalRecoveryService,crisisAutopilotCoordinator,finalGapClosureService,operationalProofService,operationalPeriodService,initializeBackground };
}
