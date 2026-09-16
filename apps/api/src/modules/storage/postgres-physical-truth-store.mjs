import pg from 'pg';
import { assertObservationAllowed } from '../../../../../packages/domain/src/production-integrity.mjs';
import { runPostgresMigrations } from './postgres-migration-runner.mjs';
import { guardPostgresClient,guardPostgresPool,postgresClientFailure,releasePostgresClient } from './postgres-client-guard.mjs';
const json = (value, fallback = null) => JSON.stringify(value ?? fallback);
const point = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? value : null;
const geoJson = (value) => { const geometry=value?.type==='Feature'?value.geometry:value; return geometry?.type && geometry?.coordinates ? JSON.stringify(geometry) : null; };
const rawId = (observation) => observation?.provenance?.rawSourceProductId ?? observation?.rawSourceProductId ?? null;
const physical = (observation) => ['thermal','camera','ground_sensor','drone','field'].includes(observation?.type);

export class PostgresPhysicalTruthStore {
  #pool = null;
  #status;
  #initialization = null;
  #closed = false;
  constructor({ databaseUrl = '', clock = () => new Date(), pool = null, universe = 'production', connectionTimeoutMs = 3_000, statementTimeoutMs = 15_000, lockTimeoutMs = 3_000 } = {}) {
    this.databaseUrl = databaseUrl; this.clock = clock; this.#pool = pool; this.ownsPool = !pool; this.universe = universe;
    this.timeouts = { connectionTimeoutMs, statementTimeoutMs, lockTimeoutMs };
    this.#status = { configured: Boolean(databaseUrl || pool), state: databaseUrl || pool ? 'initializing' : 'not_configured', postgis: false, lastCommitAt: null, lastError: databaseUrl || pool ? null : 'Set VIGIA_DATABASE_URL to enable transactional physical-truth persistence.' };
    this.#guardPool();
  }
  #guardPool(){guardPostgresPool(this.#pool,(error)=>{this.#status={...this.#status,state:'failed',postgis:false,lastFailureAt:this.clock().toISOString(),lastError:String(error?.message??error)};});}
  async initialize() {
    if (!this.#status.configured || this.#closed) return this.status();
    if (this.#initialization) return this.#initialization;
    this.#status = { ...this.#status, state: 'initializing' };
    this.#initialization = (async () => {
      try {
        if (!this.#pool) {
          this.#pool = new pg.Pool({
            connectionString: this.databaseUrl,
            application_name: 'vigia-physical-truth',
            connectionTimeoutMillis: this.timeouts.connectionTimeoutMs,
            query_timeout: this.timeouts.statementTimeoutMs,
            statement_timeout: this.timeouts.statementTimeoutMs,
            lock_timeout: this.timeouts.lockTimeoutMs,
            idle_in_transaction_session_timeout: this.timeouts.statementTimeoutMs
          });
          this.#pool.on('error', (error) => { this.#status = { ...this.#status, state: 'failed', postgis: false, lastFailureAt: this.clock().toISOString(), lastError: String(error.message ?? error) }; });
          this.#guardPool();
        }
        const migration = await runPostgresMigrations(this.#pool, { clock: this.clock });
        this.#status = { ...this.#status, state: 'ready', postgis: true, postgisVersion: migration.postgisVersion, migration, lastRecoveredAt: this.clock().toISOString(), lastError: null };
      } catch (error) {
        this.#status = { ...this.#status, state: 'failed', postgis: false, lastFailureAt: this.clock().toISOString(), lastError: String(error.message ?? error) };
      } finally {
        this.#initialization = null;
      }
      return this.status();
    })();
    return this.#initialization;
  }
  status() { return structuredClone(this.#status); }
  async close() { this.#closed = true; if (this.ownsPool) await this.#pool?.end?.(); this.#status = { ...this.#status, state: 'closed', postgis: false }; }
  async #ensureReady() {
    if (this.#status.state === 'ready') return true;
    if (!this.#status.configured || this.#closed) return false;
    await this.initialize();
    return this.#status.state === 'ready';
  }
  async #transaction(operation) {
    for(let attempt=0;attempt<3;attempt+=1){
      let client=null;
      try{client=await this.#pool.connect();guardPostgresClient(client);await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');const failure=postgresClientFailure(client);if(failure)throw failure;this.#status={...this.#status,state:'ready',lastError:null};return result;}
      catch(error){const failure=postgresClientFailure(client,error);await client?.query('ROLLBACK').catch(()=>undefined);const message=String(failure.message??failure),retryable=['55P03','40P01','40001'].includes(failure.code)||/lock timeout|deadlock|serialization failure/i.test(message);if(!retryable||attempt===2){this.#status={...this.#status,state:'failed',postgis:false,lastFailureAt:this.clock().toISOString(),lastError:message};throw failure;}await new Promise((resolve)=>setTimeout(resolve,75*2**attempt));}
      finally{releasePostgresClient(client);}
    }
  }
  async commitOperatorAction(action) {
    if (!(await this.#ensureReady())) return { persisted: false, state: this.#status.state };
    const result = await this.#transaction(async (client) => {
      await client.query(`INSERT INTO operator_action(id,action_at,actor_id,actor_role,action_type,entity_type,entity_id,payload,previous_hash,action_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,[action.id,action.at,action.actorId,action.actorRole,action.type,action.entityType,action.entityId,json(action.payload,{}),action.previousHash,action.hash]);
      return { persisted:true,state:'ready',id:action.id };
    });
    this.#status={...this.#status,state:'ready',lastOperatorActionAt:action.at,lastError:null};
    return result;
  }
  async recordUiFirstSeen(acknowledgement){
    if(!(await this.#ensureReady()))return{persisted:false,state:this.#status.state};
    const timingPatch={traceId:acknowledgement.traceId,apiAvailableAt:acknowledgement.apiAvailableAt,uiFirstSeenAt:acknowledgement.uiFirstSeenAt,uiClientObservedAt:acknowledgement.uiClientObservedAt,uiFirstSeenSource:acknowledgement.source,uiAvailableAt:acknowledgement.uiFirstSeenAt};
    const result=await this.#transaction(async(client)=>{
      const update=await client.query(`UPDATE prospective_detection_capture SET api_available_at=COALESCE(api_available_at,$6),ui_first_seen_at=LEAST(COALESCE(ui_first_seen_at,$2),$2),ui_first_seen_trace_id=COALESCE(ui_first_seen_trace_id,$3),ui_client_observed_at=COALESCE(ui_client_observed_at,$4),ui_available_at=LEAST(COALESCE(ui_available_at,$2),$2),timing=timing||$5::jsonb,updated_at=now() WHERE event_id=$1 AND (ui_first_seen_trace_id IS NULL OR ui_first_seen_trace_id=$3)`,[acknowledgement.eventId,acknowledgement.uiFirstSeenAt,acknowledgement.traceId,acknowledgement.uiClientObservedAt,json(timingPatch,{}),acknowledgement.apiAvailableAt]);
      if(update.rowCount!==1)throw new Error('prospective_trace_postgis_mismatch');
      return{persisted:true,state:'ready',eventId:acknowledgement.eventId};
    });
    this.#status={...this.#status,lastUiFirstSeenAt:acknowledgement.uiFirstSeenAt,lastError:null};return result;
  }
  async commitOperationalState(state = {}) {
    if (!(await this.#ensureReady())) return { persisted: false, state: this.#status.state };
    const result = await this.#transaction(async (client) => {
      for (const finding of state.preventionFindings ?? []) {
        const coordinate=point(finding.coordinate),geometry=geoJson(finding.geometry);
        if(!coordinate||!geometry)throw new Error(`invalid_prevention_finding_geometry:${finding.findingId}`);
        await client.query(`INSERT INTO prevention_finding(id,finding_kind,finding_state,calibration_state,geometry,position,current_observation_id,comparison_observation_id,first_observable_start,first_observable_end,measurements,infrastructure_interactions,source_quality,detector_version,validation,provenance,evidence_need_id,evidence_request_id,created_at,updated_at) VALUES($1,$2,$3,$4,ST_SetSRID(ST_GeomFromGeoJSON($5),4326),ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) ON CONFLICT(id) DO UPDATE SET finding_state=EXCLUDED.finding_state,calibration_state=EXCLUDED.calibration_state,measurements=EXCLUDED.measurements,infrastructure_interactions=EXCLUDED.infrastructure_interactions,source_quality=EXCLUDED.source_quality,validation=EXCLUDED.validation,provenance=EXCLUDED.provenance,evidence_need_id=EXCLUDED.evidence_need_id,evidence_request_id=EXCLUDED.evidence_request_id,updated_at=EXCLUDED.updated_at`,[
          finding.findingId,finding.kind,finding.state,finding.calibrationState,geometry,coordinate[0],coordinate[1],finding.currentObservationId,finding.comparisonObservationId,finding.firstObservableInterval.start,finding.firstObservableInterval.end,json({affectedAreaHa:finding.affectedAreaHa,corridorLengthM:finding.corridorLengthM,nearestStructureM:finding.nearestStructureM,structuresWithinPolicyRadius:finding.structuresWithinPolicyRadius,newFuelFraction:finding.newFuelFraction,medianNdmi:finding.medianNdmi,roadCrossings:finding.roadCrossings,criticalAssetProximityM:finding.criticalAssetProximityM,attentionPriority:finding.attentionPriority,rationale:finding.rationale,terrainContext:finding.terrainContext,landCoverContext:finding.landCoverContext},{}),json(finding.infrastructureInteractions,[]),json(finding.sourceQuality,{}),finding.detectorVersion,json(finding.validation,{}),json(finding.provenance,{}),finding.evidenceNeedId,finding.evidenceRequestId,finding.createdAt,finding.updatedAt
        ]);
      }
      for(const run of state.detectorRuns??[])await client.query(`INSERT INTO detector_run(id,detector_version,run_state,current_observation_id,comparison_observation_id,output_count,abstention_reason,source_quality,provenance,started_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET run_state=EXCLUDED.run_state,output_count=EXCLUDED.output_count,abstention_reason=EXCLUDED.abstention_reason,source_quality=EXCLUDED.source_quality,provenance=EXCLUDED.provenance,completed_at=EXCLUDED.completed_at`,[run.id,run.detectorVersion,run.state,run.currentObservationId,run.comparisonObservationId,run.outputCount,run.abstentionReason,json(run.sourceQuality,{}),json(run.provenance,{}),run.startedAt,run.completedAt]);
      for(const review of state.preventionReviews??[])await client.query(`INSERT INTO prevention_finding_review(id,finding_id,detector_version,reviewer_type,reviewer_id,decision,reason,note,reviewed_at,reviewer_qualifications,model_version,scene_pair,finding_version,source_quality,land_cover_context) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET reviewer_type=EXCLUDED.reviewer_type,reviewer_id=EXCLUDED.reviewer_id,decision=EXCLUDED.decision,reason=EXCLUDED.reason,note=EXCLUDED.note,reviewed_at=EXCLUDED.reviewed_at,reviewer_qualifications=EXCLUDED.reviewer_qualifications,model_version=EXCLUDED.model_version,scene_pair=EXCLUDED.scene_pair,finding_version=EXCLUDED.finding_version,source_quality=EXCLUDED.source_quality,land_cover_context=EXCLUDED.land_cover_context`,[review.id,review.findingId,review.detectorVersion,review.reviewerType,review.reviewerId,review.decision,review.reason,review.note,review.reviewedAt,json(review.reviewerQualifications,[]),review.modelVersion??review.detectorVersion,json(review.scenePair,{}),review.findingVersion??null,json(review.sourceQuality,{}),json(review.landCoverContext,{state:'UNMEASURED'})]);
      for (const need of state.evidenceNeeds ?? []) {
        await client.query(`INSERT INTO evidence_need(id,subject_type,subject_id,missing_quantity,reason,state,owner_id,evidence_request_id,selected_method_id,next_observation_at,candidate_methods,ranking,service_level,escalation_reason,created_at,updated_at,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(id) DO UPDATE SET missing_quantity=EXCLUDED.missing_quantity,reason=EXCLUDED.reason,state=EXCLUDED.state,owner_id=EXCLUDED.owner_id,evidence_request_id=EXCLUDED.evidence_request_id,selected_method_id=EXCLUDED.selected_method_id,next_observation_at=EXCLUDED.next_observation_at,candidate_methods=EXCLUDED.candidate_methods,ranking=EXCLUDED.ranking,service_level=EXCLUDED.service_level,escalation_reason=EXCLUDED.escalation_reason,updated_at=EXCLUDED.updated_at,resolved_at=EXCLUDED.resolved_at`,[
          need.id,need.subjectType,need.subjectId,need.missingQuantity,need.reason,need.state,need.ownerId,need.evidenceRequestId,need.selectedMethodId,need.nextObservationAt,json(need.candidateMethods,[]),json(need.ranking,{}),need.serviceLevel?json(need.serviceLevel):null,need.escalationReason,need.createdAt,need.updatedAt??need.createdAt,need.resolvedAt
        ]);
      }
      for (const request of state.evidenceRequests ?? []) {
        const coordinate=point(request.coordinate);
        await client.query(`INSERT INTO evidence_request(id,evidence_need_id,target_type,target_id,title,state,owner_id,requested_by,priority,position,due_at,acknowledgement_due_at,observation_due_at,requested_method_id,service_level_policy_id,schedule_commitment,requirements,history,escalation,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $10::float8 IS NULL OR $11::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($10,$11),4326)::geography END,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) ON CONFLICT(id) DO UPDATE SET evidence_need_id=EXCLUDED.evidence_need_id,state=EXCLUDED.state,owner_id=EXCLUDED.owner_id,priority=EXCLUDED.priority,position=EXCLUDED.position,due_at=EXCLUDED.due_at,acknowledgement_due_at=EXCLUDED.acknowledgement_due_at,observation_due_at=EXCLUDED.observation_due_at,requested_method_id=EXCLUDED.requested_method_id,service_level_policy_id=EXCLUDED.service_level_policy_id,schedule_commitment=EXCLUDED.schedule_commitment,requirements=EXCLUDED.requirements,history=EXCLUDED.history,escalation=EXCLUDED.escalation,updated_at=EXCLUDED.updated_at`,[
          request.id,request.evidenceNeedId,request.targetType,request.targetId,request.title,request.state,request.ownerId,request.requestedBy,request.priority,coordinate?.[0]??null,coordinate?.[1]??null,request.dueAt,request.acknowledgementDueAt,request.observationDueAt,request.requestedMethodId,request.serviceLevelPolicyId,request.scheduleCommitment?json(request.scheduleCommitment):null,json(request.requirements,[]),json(request.history,[]),request.escalation?json(request.escalation):null,request.createdAt,request.updatedAt??request.createdAt
        ]);
      }
      return { persisted:true,state:'ready',preventionFindings:(state.preventionFindings??[]).length,preventionReviews:(state.preventionReviews??[]).length,detectorRuns:(state.detectorRuns??[]).length,evidenceNeeds:(state.evidenceNeeds??[]).length,evidenceRequests:(state.evidenceRequests??[]).length };
    });
    this.#status={...this.#status,state:'ready',lastOperationalCommitAt:this.clock().toISOString(),lastError:null};
    return result;
  }
  async commitFieldResources(resources = []) {
    if (!(await this.#ensureReady())) return { persisted:false,state:this.#status.state };
    const result=await this.#transaction(async(client)=>{
      for(const resource of resources.filter((item)=>item.type==='field_unit')){
        const coordinate=point(resource.lastKnownLocation?.coordinate??resource.coordinate);
        await client.query(`INSERT INTO field_resource(id,organization_id,name,resource_type,capabilities,current_availability,last_known_position,last_known_at,shift,owner_id,configuration,updated_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $7::float8 IS NULL OR $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7,$8),4326)::geography END,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET organization_id=EXCLUDED.organization_id,name=EXCLUDED.name,capabilities=EXCLUDED.capabilities,current_availability=EXCLUDED.current_availability,last_known_position=EXCLUDED.last_known_position,last_known_at=EXCLUDED.last_known_at,shift=EXCLUDED.shift,owner_id=EXCLUDED.owner_id,configuration=EXCLUDED.configuration,updated_at=EXCLUDED.updated_at`,[resource.id,resource.organizationId,resource.name,resource.type,json(resource.capabilities,[]),resource.currentAvailability,coordinate?.[0]??null,coordinate?.[1]??null,resource.lastKnownLocation?.at??resource.updatedAt,resource.shift?json(resource.shift):null,resource.ownerId,json({viewRadiusKm:resource.viewRadiusKm,speedKph:resource.speedKph,launchMinutes:resource.launchMinutes},{}),resource.updatedAt??this.clock().toISOString()]);
      }
      return{persisted:true,state:'ready',fieldResources:resources.filter((item)=>item.type==='field_unit').length};
    });
    return result;
  }
  async commitManualCorrections(corrections = []) {
    if (!(await this.#ensureReady())) return { persisted:false,state:this.#status.state };
    return this.#transaction(async(client)=>{
      for(const correction of corrections)await client.query(`INSERT INTO manual_event_correction(id,correction_at,correction_kind,source_event_id,target_event_id,observation_ids,actor_id,reason,correction) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,[correction.id,correction.at,correction.kind,correction.sourceEventId,correction.targetEventId,json(correction.observationIds,[]),correction.actorId,correction.reason,json(correction,{})]);
      return{persisted:true,state:'ready',corrections:corrections.length};
    });
  }
  async commitObservationIdentities(observations = []) {
    const identities=observations.map((item)=>item?.provenance?.observationIdentity??item?.metadata?.observationIdentity).filter(Boolean);
    if(!identities.length)return{persisted:true,state:this.#status.state,identities:0};
    if(!(await this.#ensureReady()))throw new Error(`postgres_observation_identity_${this.#status.state}`);
    return this.#transaction(async(client)=>{
      for(const identity of identities){
        const result=await client.query(`INSERT INTO observation_identity_binding(canonical_observation_id,external_observation_id,principal_id,agency_id,node_or_provider_id,incident_id,source_family,schema_version,identity_version,payload_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(canonical_observation_id) DO UPDATE SET canonical_observation_id=EXCLUDED.canonical_observation_id WHERE observation_identity_binding.external_observation_id=EXCLUDED.external_observation_id AND observation_identity_binding.principal_id=EXCLUDED.principal_id AND observation_identity_binding.agency_id=EXCLUDED.agency_id AND observation_identity_binding.node_or_provider_id=EXCLUDED.node_or_provider_id AND observation_identity_binding.incident_id=EXCLUDED.incident_id AND observation_identity_binding.source_family=EXCLUDED.source_family AND observation_identity_binding.schema_version=EXCLUDED.schema_version AND observation_identity_binding.identity_version=EXCLUDED.identity_version AND observation_identity_binding.payload_hash=EXCLUDED.payload_hash RETURNING canonical_observation_id`,[identity.canonicalObservationId,identity.externalObservationId,identity.principalId,identity.agencyId,identity.nodeOrProviderId,identity.incidentId,identity.sourceFamily,identity.schemaVersion,identity.identityVersion,identity.payloadHash,identity.createdAt]);
        if(result.rowCount===0)throw Object.assign(new Error('observation_identity_conflict'),{statusCode:409});
      }
      return{persisted:true,state:'ready',identities:identities.length};
    });
  }
  async commitSnapshot({ products = [], events = [], checkpoints = [] } = {}) {
    if (!(await this.#ensureReady())) throw new Error(`postgres_physical_truth_${this.#status.state}`);
    const persistedAt=this.clock().toISOString();
    const productMap = new Map(products.map((item) => [item.id, item]));
    const observations = new Map();
    for (const event of events) for (const observation of event.observations ?? []) if (physical(observation) && rawId(observation) && productMap.has(rawId(observation))) { assertObservationAllowed(observation, this.universe); observations.set(observation.id, observation); }
    const result = await this.#transaction(async (client) => {
      for (const product of productMap.values()) await this.#writeProduct(client, product, persistedAt);
      for (const observation of observations.values()) await this.#writeObservation(client, observation);
      for (const event of events) await this.#writeEvent(client, event, observations, persistedAt);
      for (const event of events) await this.#writeObservationOpportunities(client, event);
      for (const checkpoint of checkpoints) await this.#writeCheckpoint(client, checkpoint, productMap);
      return { products: productMap.size, observations: observations.size, events: events.length, checkpoints: checkpoints.length };
    });
    this.#status = { ...this.#status, state: 'ready', lastCommitAt: persistedAt, lastError: null, lastCommit: result };
    return structuredClone(result);
  }
  async #writeProduct(client, item, persistedAt) {
    const values=[item.id,item.sourceId,item.provider,item.providerProductId,item.requestWindow,item.requestedAt,item.receivedAt,item.sourceTimestamp,item.sourceTimestampRange,item.contentType,item.byteLength,item.checksumSha256,item.originalUriOrObjectKey,item.httpStatus,item.acquisitionRunId,item.parserVersion,item.normalizerVersion,item.licenceMetadata,item.parsedAt,persistedAt];
    await client.query(`INSERT INTO raw_source_product(id,source_id,provider,provider_product_id,request_window,requested_at,received_at,source_timestamp,source_timestamp_range,content_type,byte_length,checksum_sha256,object_key,http_status,acquisition_run_id,parser_version,normalizer_version,processing_state,licence_metadata,parsed_at,ingested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'ingested',$18,$19,$20) ON CONFLICT(id) DO UPDATE SET provider_product_id=EXCLUDED.provider_product_id,source_timestamp=EXCLUDED.source_timestamp,source_timestamp_range=EXCLUDED.source_timestamp_range,parser_version=EXCLUDED.parser_version,normalizer_version=EXCLUDED.normalizer_version,processing_state='ingested',parsed_at=COALESCE(raw_source_product.parsed_at,EXCLUDED.parsed_at),ingested_at=COALESCE(raw_source_product.ingested_at,EXCLUDED.ingested_at)`,values);
  }
  async #writeObservation(client, item) {
    const coordinate=point(item.coordinate); if(!coordinate)throw new Error(`invalid_observation_position:${item.id}`);
    const measurements={measurementType:item.measurementType??null,frpMw:item.frpMw??null,frpUncertaintyMw:item.frpUncertaintyMw??null,brightnessK:item.brightnessK??null,scanKm:item.scanKm??null,trackKm:item.trackKm??null,nominalResolutionKm:item.nominalResolutionKm??null,hotspotType:item.hotspotType??null,hotspotClass:item.hotspotClass??null};
    const values=[item.id,item.type,item.source,item.at,item.receivedAt,coordinate[0],coordinate[1],geoJson(item.footprint),item.sourceFamily,item.independenceGroup,item.instrument,item.satellite,json(item.confidence),json(measurements,{}),json(item.qualityFlags,[]),rawId(item),item.provenance?.normalizerVersion??null,json(item.provenance,{})];
    await client.query(`INSERT INTO physical_observation(id,observation_type,source,sensed_at,received_at,position,support_geometry,source_family,independence_group,instrument,platform,native_confidence,measurements,quality_flags,raw_source_product_id,normalizer_version,provenance) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,CASE WHEN $8::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($8),4326) END,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(id) DO UPDATE SET received_at=EXCLUDED.received_at,position=EXCLUDED.position,support_geometry=EXCLUDED.support_geometry,native_confidence=EXCLUDED.native_confidence,measurements=EXCLUDED.measurements,quality_flags=EXCLUDED.quality_flags,provenance=EXCLUDED.provenance`,values);
    await client.query(`INSERT INTO provenance_lineage(parent_kind,parent_id,child_kind,child_id,relation) VALUES('raw_source_product',$1,'physical_observation',$2,'normalized_as') ON CONFLICT DO NOTHING`,[rawId(item),item.id]);
  }
  async #writeEvent(client, event, observations, persistedAt) {
    const coordinate=point(event.coordinate); if(!coordinate)throw new Error(`invalid_event_position:${event.id}`);
    const persistedPhysical=(event.observations??[]).filter((item)=>observations.has(item.id)),hasPersistedPhysical=persistedPhysical.length>0,timing=event.prospectiveDetectionTiming?{...event.prospectiveDetectionTiming,...(hasPersistedPhysical?{vigiaRawProductIngestedAt:event.prospectiveDetectionTiming.vigiaRawProductIngestedAt??persistedAt,observationPersistedAt:event.prospectiveDetectionTiming.observationPersistedAt??persistedAt}:{})}:null;
    const derived={physicalState:event.physicalState,reportState:event.reportState,thermal:event.thermal,geometryFreshness:event.geometryFreshness,movement:event.movement,candidateAssessment:event.candidateAssessment??null,prospectiveDetectionTiming:timing};
    const values=[event.id,event.firstSeenAt,event.lastSeenAt,coordinate[0],coordinate[1],geoJson(event.observedGeometry),event.evidenceState,event.evolutionState,event.knowledgeState,event.behaviorState,json(event.association,{}),json(derived,{}),event.createdAt??this.clock().toISOString()];
    await client.query(`INSERT INTO fire_event(id,first_seen_at,last_seen_at,position,observed_geometry,evidence_state,evolution_state,knowledge_state,behavior_state,association_state,derived_state,created_at) VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,CASE WHEN $6::text IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($6),4326) END,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,position=EXCLUDED.position,observed_geometry=EXCLUDED.observed_geometry,evidence_state=EXCLUDED.evidence_state,evolution_state=EXCLUDED.evolution_state,knowledge_state=EXCLUDED.knowledge_state,behavior_state=EXCLUDED.behavior_state,association_state=EXCLUDED.association_state,derived_state=EXCLUDED.derived_state,created_at=LEAST(fire_event.created_at,EXCLUDED.created_at),updated_at=now()`,values);
    const firstPhysical=[...(event.observations??[])].filter(physical).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0]??null;
    if(timing?.providerObservationAt&&firstPhysical)await client.query(`INSERT INTO prospective_detection_capture(event_id,provider_product_id,source_family,provider_observation_at,provider_availability_at,vigia_acquired_at,parse_complete_at,observation_persisted_at,candidate_decision_at,event_created_at,api_available_at,ui_available_at,ui_first_seen_at,ui_first_seen_trace_id,ui_client_observed_at,first_report_at,second_physical_family_at,operator_acknowledged_at,policy_version,threshold_version,decision,timing,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT(event_id) DO UPDATE SET provider_product_id=COALESCE(prospective_detection_capture.provider_product_id,EXCLUDED.provider_product_id),source_family=COALESCE(prospective_detection_capture.source_family,EXCLUDED.source_family),provider_observation_at=LEAST(prospective_detection_capture.provider_observation_at,EXCLUDED.provider_observation_at),provider_availability_at=COALESCE(prospective_detection_capture.provider_availability_at,EXCLUDED.provider_availability_at),vigia_acquired_at=COALESCE(prospective_detection_capture.vigia_acquired_at,EXCLUDED.vigia_acquired_at),parse_complete_at=COALESCE(prospective_detection_capture.parse_complete_at,EXCLUDED.parse_complete_at),observation_persisted_at=COALESCE(prospective_detection_capture.observation_persisted_at,EXCLUDED.observation_persisted_at),candidate_decision_at=COALESCE(prospective_detection_capture.candidate_decision_at,EXCLUDED.candidate_decision_at),event_created_at=LEAST(prospective_detection_capture.event_created_at,EXCLUDED.event_created_at),api_available_at=COALESCE(prospective_detection_capture.api_available_at,EXCLUDED.api_available_at),ui_available_at=COALESCE(prospective_detection_capture.ui_available_at,EXCLUDED.ui_available_at),ui_first_seen_at=COALESCE(prospective_detection_capture.ui_first_seen_at,EXCLUDED.ui_first_seen_at),ui_first_seen_trace_id=COALESCE(prospective_detection_capture.ui_first_seen_trace_id,EXCLUDED.ui_first_seen_trace_id),ui_client_observed_at=COALESCE(prospective_detection_capture.ui_client_observed_at,EXCLUDED.ui_client_observed_at),first_report_at=COALESCE(prospective_detection_capture.first_report_at,EXCLUDED.first_report_at),second_physical_family_at=COALESCE(prospective_detection_capture.second_physical_family_at,EXCLUDED.second_physical_family_at),operator_acknowledged_at=COALESCE(prospective_detection_capture.operator_acknowledged_at,EXCLUDED.operator_acknowledged_at),policy_version=EXCLUDED.policy_version,threshold_version=EXCLUDED.threshold_version,decision=EXCLUDED.decision,timing=prospective_detection_capture.timing||EXCLUDED.timing,updated_at=EXCLUDED.updated_at`,[event.id,firstPhysical.provenance?.providerProductId??firstPhysical.provenance?.rawSourceProductId??null,firstPhysical.sourceFamily??null,timing.providerObservationAt,timing.providerReceivedAt,timing.vigiaAcquiredAt,timing.vigiaParsedAt,timing.observationPersistedAt,timing.candidateDecisionAt,timing.eventCreatedAt,timing.apiAvailableAt,timing.uiFirstSeenAt,timing.uiFirstSeenAt,timing.traceId,timing.uiClientObservedAt,timing.firstPublicReportAt,timing.firstIndependentFamilyCorroborationAt,timing.operatorAcknowledgedAt,event.candidateAssessment?.policyVersion??null,event.candidateAssessment?.thresholdVersion??null,event.candidateAssessment?.decision??null,json(timing,{}),persistedAt]);
    for(const observation of event.observations??[]){if(!observations.has(observation.id))continue;const decision={state:event.association?.state??'single_physical_source',grade:event.association?.grade??null,method:'vigia-spatiotemporal-association-v1'};await client.query(`INSERT INTO event_observation(event_id,observation_id,association_decision) VALUES($1,$2,$3) ON CONFLICT(event_id,observation_id) DO UPDATE SET association_decision=EXCLUDED.association_decision`,[event.id,observation.id,json(decision,{})]);await client.query(`INSERT INTO provenance_lineage(parent_kind,parent_id,child_kind,child_id,relation) VALUES('physical_observation',$1,'fire_event',$2,'associated_with') ON CONFLICT DO NOTHING`,[observation.id,event.id]);}
  }
  async #writeObservationOpportunities(client,event){
    for(const opportunity of event.observationPlan?.options??[]){
      const dimensions={informationGain:opportunity.informationGain,latency:opportunity.latency,reliability:opportunity.reliability,cost:opportunity.cost,evidenceRole:opportunity.evidenceRole};
      await client.query(`INSERT INTO observation_opportunity(id,event_id,source_id,label,kind,method_type,availability,owner_id,scheduled_at,commitment,coverage,operational_dimensions,limitation,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT(id,event_id) DO UPDATE SET source_id=EXCLUDED.source_id,label=EXCLUDED.label,kind=EXCLUDED.kind,method_type=EXCLUDED.method_type,availability=EXCLUDED.availability,owner_id=EXCLUDED.owner_id,scheduled_at=EXCLUDED.scheduled_at,commitment=EXCLUDED.commitment,coverage=EXCLUDED.coverage,operational_dimensions=EXCLUDED.operational_dimensions,limitation=EXCLUDED.limitation,observed_at=EXCLUDED.observed_at`,[opportunity.id,event.id,opportunity.sourceId,opportunity.label,opportunity.kind,opportunity.methodType,opportunity.availability,opportunity.ownerId,opportunity.scheduledAt,opportunity.commitment?json(opportunity.commitment):null,opportunity.coverage?json(opportunity.coverage):null,json(dimensions,{}),opportunity.limitation,this.clock().toISOString()]);
    }
  }
  async #writeCheckpoint(client, item, products) {
    const candidates=[...products.values()].filter((product)=>product.sourceId===item.sourceId).sort((a,b)=>Date.parse(a.sourceTimestamp??a.receivedAt)-Date.parse(b.sourceTimestamp??b.receivedAt));const latest=candidates.at(-1);if(!latest)return;
    const cursor=latest.sourceTimestamp??item.cursor??latest.receivedAt,metadata={...item,pendingProductIds:(item.pendingProductIds??[]).filter((id)=>!products.has(id))};
    await client.query(`INSERT INTO source_checkpoint(source_id,last_product_id,cursor,last_successful_poll_at,health_state,metadata) VALUES($1,$2,$3,$4,'healthy',$5) ON CONFLICT(source_id) DO UPDATE SET last_product_id=EXCLUDED.last_product_id,cursor=GREATEST(source_checkpoint.cursor,EXCLUDED.cursor),last_successful_poll_at=EXCLUDED.last_successful_poll_at,health_state='healthy',metadata=EXCLUDED.metadata,updated_at=now()`,[item.sourceId,latest.id,cursor,item.lastSuccessfulPollAt??this.clock().toISOString(),json(metadata,{})]);
  }
}
