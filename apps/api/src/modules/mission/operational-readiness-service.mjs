import {operationalSourceFamilies} from './operational-source-families.mjs';
function check(id, ok, state, evidence, blocking = true) { return { id, ok: Boolean(ok), state, blocking, evidence }; }
function sourceCurrent(source) { return source?.state === 'current' && Number(source?.accepted ?? 0) > 0; }
export function publicOperationalReadiness(value={}){
  const capabilities=value.capabilities??{};
  return{schemaVersion:'vigia.public-operational-readiness.v1',ready:value.ready===true,status:value.status??'not_ready',checkedAt:value.checkedAt??null,checks:(value.checks??[]).map((item)=>({id:item.id,ok:item.ok===true,state:item.state,blocking:item.blocking!==false,evidencePresent:item.evidence!=null})),capabilities:{productionReality:{state:capabilities.productionReality?.state??'unknown',syntheticObservations:Number(capabilities.productionReality?.syntheticObservations??0),demoIdentities:Number(capabilities.productionReality?.demoIdentities??0)},evidenceAcquisition:{state:capabilities.evidenceAcquisition?.state??'unknown',unresolved:Number(capabilities.evidenceAcquisition?.unresolved??0)},currentPhysicalCoverage:{state:capabilities.currentPhysicalCoverage?.state??'unknown',physicallyCurrentEvents:Number(capabilities.currentPhysicalCoverage?.physicallyCurrentEvents??0),activeEvents:Number(capabilities.currentPhysicalCoverage?.activeEvents??0)},observationOpportunities:{state:capabilities.observationOpportunities?.state??'unknown',confirmedFutureRecords:Number(capabilities.observationOpportunities?.confirmedFutureRecords??0)},fusion:{state:capabilities.fusion?.state??'unknown',probability:capabilities.fusion?.probability??'disabled'},thermalGeometry:{state:capabilities.thermalGeometry?.state??'unknown',perimeterAuthority:capabilities.thermalGeometry?.perimeterAuthority===true},nativePixels:{state:capabilities.nativePixels?.state??'unknown',persistedProofs:Number(capabilities.nativePixels?.persistedProofs??0)},portugalValidation:{state:capabilities.portugalValidation?.state??'unmeasured',cases:Number(capabilities.portugalValidation?.cases??0)}}};
}

export class OperationalReadinessService {
  constructor({ config, repository, eventRepository, physicalTruthStore, operationsStore = null, auditService, operationalEventService, scientificRuntimeService, geoIntegrityProofRepository, sensorRegistryService, replayService = null,worldKnowledgeService=null,roadStateService=null, clock = () => new Date() }) {
    Object.assign(this, { config, repository, eventRepository, physicalTruthStore, operationsStore, auditService, operationalEventService, scientificRuntimeService, geoIntegrityProofRepository, sensorRegistryService, replayService,worldKnowledgeService,roadStateService, clock });
  }
  async snapshot() {
    const live = this.operationalEventService.commandSnapshot
      ? await this.operationalEventService.commandSnapshot()
      : await this.operationalEventService.snapshot(), acquisition = live.summary?.evidenceAcquisition ?? {};
    const registry=this.sensorRegistryService.snapshot(),assetFamilies=[...new Set((registry.assets??[]).filter((asset)=>['available','online','ready'].includes(String(asset.status).toLowerCase())).map((asset)=>asset.type))];
    const physicalSourceFamilies = [...[live.sources?.firms, live.sources?.mtgPixels, live.sources?.sentinel3Pixels].map((source,index)=>sourceCurrent(source)?['viirs','mtg_fci','sentinel3_slstr'][index]:null).filter(Boolean),...assetFamilies];
    const reality=this.eventRepository.productionIntegrityStatus(),demoIdentities=((this.repository.snapshotFields?.(['actors'])??this.repository.snapshot()).actors??[]).filter((actor)=>/^actor-(?:supervisor|analyst|field|viewer)$/.test(actor.id));
    const auditChain=this.auditService.verifyChain(),operationalFamilies=operationalSourceFamilies({knowledge:this.worldKnowledgeService,roadState:this.roadStateService,at:this.clock().toISOString()});
    const checks = [
      check('production_synthetic_observations', reality.syntheticObservations === 0, reality.syntheticObservations === 0 ? 'zero' : 'violation', reality),
      check('demo_identities', demoIdentities.length === 0, demoIdentities.length === 0 ? 'zero' : 'violation', { count: demoIdentities.length, ids: demoIdentities.map((item)=>item.id) }),
      check('authenticated_operator_boundary', Boolean(this.config.operatorProxyKey??this.config.operatorBearerToken), (this.config.operatorProxyKey??this.config.operatorBearerToken) ? 'operator_proxy_assertion_configured' : 'not_configured', { oidcConfigured: false, proxyAssertionKeyConfigured: Boolean(this.config.operatorProxyKey??this.config.operatorBearerToken), productionMutationsEnabled: Boolean(this.config.operatorProxyKey??this.config.operatorBearerToken), principalConfigured:Boolean(this.config.operatorActorId),authorizationProfileConfigured:Boolean(this.config.operatorActorRole) }),
      check('operator_state_persistence', this.repository.persistenceStatus().state === 'ready', this.repository.persistenceStatus().state, this.repository.persistenceStatus()),
      check('event_state_persistence', this.eventRepository.persistenceStatus().state === 'ready', this.eventRepository.persistenceStatus().state, this.eventRepository.persistenceStatus()),
      check('postgres_physical_truth', this.physicalTruthStore?.status().state === 'ready', this.physicalTruthStore?.status().state ?? 'not_configured', this.physicalTruthStore?.status() ?? { configured: false }),
      check('postgres_live_operations', this.operationsStore?.status().state === 'ready', this.operationsStore?.status().state ?? 'not_configured', this.operationsStore?.status() ?? { configured: false },Boolean(this.operationsStore)),
      check('audit_chain', auditChain.valid, auditChain.valid ? 'valid_local_chain' : 'invalid', auditChain),
      check('operational_source_families',operationalFamilies.count>=2,operationalFamilies.count>=2?'multiple_accepted_operational_families':'insufficient',operationalFamilies,false),
      check('unknown_to_work_invariant', live.summary?.acquisitionInvariantHolds === true, live.summary?.acquisitionInvariantHolds ? 'holding' : 'violated', { untrackedRoutingNeeds: live.summary?.untrackedRoutingNeeds, orphanedEvidenceNeeds: live.summary?.orphanedEvidenceNeeds, needsOwnerOrFieldCapacity: acquisition.FIELD_CAPACITY_NOT_CONFIGURED ?? 0, waitingOnObservation: (acquisition.WAITING_FOR_OBSERVATION ?? 0) + (acquisition.WAITING_FOR_SCHEDULED_OBSERVATION ?? 0), noAvailableObservation: acquisition.NO_AVAILABLE_OBSERVATION ?? 0 }),
      check('physical_source_families', physicalSourceFamilies.length >= 2, physicalSourceFamilies.length >= 2 ? 'minimum_current_physical_families' : 'insufficient', { families: physicalSourceFamilies, count: physicalSourceFamilies.length, criterion:'current source with at least one accepted point observation',assetRegistryState: registry.state, required: 2 }),
      check('scientific_runtime', this.scientificRuntimeService.snapshot().ok, this.scientificRuntimeService.snapshot().state, this.scientificRuntimeService.snapshot()),
      check('geo_proof_persistence', this.geoIntegrityProofRepository.snapshot().persistence.state === 'ready', this.geoIntegrityProofRepository.snapshot().persistence.state, this.geoIntegrityProofRepository.snapshot().persistence),
      check('external_validation', Boolean(this.replayService), this.replayService ? 'official_archive_report_reference_measured' : 'unmeasured', this.replayService ? { corpusId: this.replayService.overview().corpus.id, caseCount: this.replayService.overview().cases.length, benchmarkState: this.replayService.overview().benchmark.validation.state, prospectivePilot: false } : { portugalOfficialCorpus: false, prospectivePilot: false }, false)
    ];
    const ready = checks.filter((item) => item.blocking).every((item) => item.ok);
    return {
      ready, status: ready ? 'ready' : 'not_ready', checkedAt: this.clock().toISOString(), checks,
      capabilities: {
        productionReality: { state: reality.syntheticObservations === 0 ? 'fixture_free' : 'violation', ...reality, demoIdentities: demoIdentities.length },
        evidenceAcquisition: { state: live.summary?.acquisitionInvariantHolds ? 'engineering_loop_holding' : 'degraded', unresolved: live.summary?.unresolvedEvidenceNeeds ?? 0, states: acquisition },
        currentPhysicalCoverage: { state: 'explicit_per_event', physicallyCurrentEvents: live.summary?.currentPhysicalEvents ?? 0, activeEvents: live.summary?.currentEvents ?? 0 },
        observationOpportunities: { state: live.sources?.observationSchedule?.state ?? 'not_configured', confirmedFutureRecords: live.sources?.observationSchedule?.confirmedCount ?? 0 },
        fusion: { state: 'engineering_ready_unvalidated', probability: 'disabled_without_approved_calibration_evidence' },
        thermalGeometry: { state: 'support_geometry_only_unvalidated', perimeterAuthority: false },
        nativePixels: { state: this.scientificRuntimeService.snapshot().ok ? 'engineering_runtime_ready' : 'runtime_unavailable', persistedProofs: this.geoIntegrityProofRepository.snapshot().count },
        portugalValidation: this.replayService ? { state: 'official_archive_report_reference_measured', corpusId: this.replayService.overview().corpus.id, cases: this.replayService.overview().cases.length, qualification: this.replayService.overview().benchmark.validation.qualification } : { state: 'unmeasured' }
      }
    };
  }
}
