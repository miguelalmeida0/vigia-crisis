import { createHash,randomUUID } from 'node:crypto';
import pg from 'pg';
import { assertAlertTransition } from '../../../../../packages/domain/src/alert-domain.mjs';
import { alertMutationAlreadyApplied,canonical,id,json,observationMatchesOpportunity,rowAlert,writeAudit } from './postgres-alert-store-support.mjs';
import { listAssets,listTerritories,seedTerritory,territoryContext } from './postgres-territory-store.mjs';
import { isPostgresAvailabilityError,operationsPostgisUnavailable } from '../storage/dependency-error.mjs';
import { inspectMigrationState,runPostgresMigrations } from '../storage/postgres-migration-runner.mjs';
import { listRoster,operationsStatus,seedRoster } from './postgres-operations-read-store.mjs';
import { guardPostgresClient,guardPostgresPool,postgresClientFailure,releasePostgresClient } from '../storage/postgres-client-guard.mjs';
const poolAcquireTimedOut=(error)=>!error?.code&&/timeout exceeded when trying to connect/i.test(String(error?.message??error));
export class PostgresAlertStore {
  constructor({ databaseUrl = '',pool=null, clock = () => new Date(), connectionTimeoutMs = 3000, statementTimeoutMs = 15000, poolMax = 24 } = {}) {const boundedPoolMax=Math.min(32,Math.max(4,Number.isInteger(Number(poolMax))?Number(poolMax):16));
    Object.assign(this, { databaseUrl, clock, poolMax:boundedPoolMax });
    this.runtimeInstanceId=`operations-runtime:${randomUUID()}`;this.monitoringStartedAt=clock().toISOString();
    this.pool = pool??(databaseUrl ? new pg.Pool({ connectionString: databaseUrl, application_name: 'vigia-live-operations', connectionTimeoutMillis: connectionTimeoutMs, query_timeout: statementTimeoutMs, statement_timeout: statementTimeoutMs, idle_in_transaction_session_timeout: statementTimeoutMs, max: boundedPoolMax }) : null);
    this.ownsPool = !pool && Boolean(this.pool);
    this.ready = false;this.closed = false;this.initialization = null;
    this.lastRecoveryAttemptMs = 0;
    this.readPool={query:(...args)=>this.#query(...args)};
    this.health = { configured: Boolean(this.pool), dependency: 'postgis', capability: 'operations', state: this.pool ? 'initializing' : 'not_configured', retryable: Boolean(this.pool), monitoringStartedAt:this.monitoringStartedAt,outageCount:0,observedDowntimeMs:0,lastSuccessfulConnectionAt: null, lastFailureAt: null, outageStartedAt: null, lastReconnectMs:null,lastErrorCode: this.pool ? null : 'operations_database_not_configured', migration: null };
    this.pool?.on('error', (error) => this.#markFailed(error));
    guardPostgresPool(this.pool,(error)=>this.#markFailed(error));
  }
  status(){const pool=this.pool?{max:Number(this.pool.options?.max??this.poolMax),total:Number(this.pool.totalCount??0),idle:Number(this.pool.idleCount??0),waiting:Number(this.pool.waitingCount??0)}:null;return{...structuredClone(this.health),pool};}
  #markFailed(error) {
    this.ready = false;
    const failedAt=this.clock().toISOString();
    this.health = { ...this.health, state: 'degraded', retryable: true, lastFailureAt: failedAt,outageStartedAt:this.health.outageStartedAt??failedAt,outageCount:this.health.outageStartedAt?this.health.outageCount:this.health.outageCount+1, lastErrorCode: String(error?.code ?? error?.message ?? error).slice(0, 120) };
  }
  async initialize({ force = false,migrate=true } = {}) {
    if (!this.pool || this.closed) return this.status();
    if (this.ready && !force) return this.status();
    if (this.initialization) return this.initialization;
    this.lastRecoveryAttemptMs = Date.now();
    this.health = { ...this.health, state: 'initializing', lastErrorCode: null };
    this.initialization = (async () => {
      try {
        const migration = migrate?await runPostgresMigrations(this.pool, { from: '008', through: '012', clock: this.clock }):await inspectMigrationState(this.pool);
        if(migration.state!=='current')throw new Error(`operations_migration_${migration.state}`);
        await this.pool.query('SELECT 1');
        const connectedAt=this.clock().toISOString(),reconnectMs=this.health.outageStartedAt?Math.max(0,Date.parse(connectedAt)-Date.parse(this.health.outageStartedAt)):null;
        await this.pool.query(`INSERT INTO operations_metric_event(id,trace_id,metric_name,occurred_at,dimensions) VALUES($1,$2,'operations_db_monitoring_window_start',$3,$4::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',this.runtimeInstanceId,'monitoring-window-start'),this.runtimeInstanceId,this.monitoringStartedAt,json({dependency:'postgis',scope:'current_runtime'})]);
        if(reconnectMs!==null)await this.pool.query(`INSERT INTO operations_metric_event(id,trace_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,'operations_db_reconnect',$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric','operations-db-reconnect',this.runtimeInstanceId,this.health.outageStartedAt),this.runtimeInstanceId,connectedAt,reconnectMs,json({dependency:'postgis',scope:'current_runtime'})]);
        this.ready = true;
        this.health = { ...this.health, state: 'ready', retryable: false, lastSuccessfulConnectionAt: connectedAt, lastReconnectMs:reconnectMs,observedDowntimeMs:this.health.observedDowntimeMs+(reconnectMs??0),outageStartedAt:null,lastErrorCode: null, migration };
      } catch (error) { this.#markFailed(error); }
      finally { this.initialization = null; }
      return this.status();
    })();
    return this.initialization;
  }
  async recoverIfNeeded({ minRetryIntervalMs = 1000 } = {}) {
    if (this.ready) return this.status();
    if (!this.pool || this.closed) throw operationsPostgisUnavailable(this.health);
    if (Date.now() - this.lastRecoveryAttemptMs >= minRetryIntervalMs || this.initialization) await this.initialize({ force: true,migrate:false });
    if (!this.ready) throw operationsPostgisUnavailable(this.health);
    return this.status();
  }
  async close() { this.ready = false; this.closed = true; if (this.ownsPool) await this.pool?.end(); this.health = { ...this.health, state: 'closed', retryable: false }; }
  #assertReady() { if (!this.ready) throw operationsPostgisUnavailable(this.health); }
  #rethrow(error){if(isPostgresAvailabilityError(error)){this.#markFailed(error);throw operationsPostgisUnavailable(this.health);}throw error;}
  async #query(sql,params){this.#assertReady();for(let attempt=0;attempt<2;attempt+=1){try{return await this.pool.query(sql,params);}catch(error){if(attempt===0&&poolAcquireTimedOut(error)){await new Promise((resolve)=>setTimeout(resolve,50));continue;}this.#rethrow(error);}}}
  async #tx(work) { this.#assertReady();let client=null;try{client=await this.pool.connect();guardPostgresClient(client);await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');const failure=postgresClientFailure(client);if(failure)throw failure;return value;}catch(error){const failure=postgresClientFailure(client,error);await client?.query('ROLLBACK').catch(()=>undefined);this.#rethrow(failure);}finally{releasePostgresClient(client);} }
  async #audit(client, { aggregateType, aggregateId, action, actorId, payload = {}, at = this.clock().toISOString() }) {
    return writeAudit(client,{aggregateType,aggregateId,action,actorId,payload,at});
  }
  async seedTerritory(payload){return seedTerritory({tx:(work)=>this.#tx(work),audit:(client,args)=>this.#audit(client,args)},payload);}
  async seedRoster(payload){return seedRoster({tx:(work)=>this.#tx(work)},payload);}
  async listRoster(options){this.#assertReady();return listRoster({pool:this.readPool},options);}
  async territoryContext(coordinate){return territoryContext({pool:this.readPool,assertReady:()=>this.#assertReady()},coordinate);}
  async listTerritories(){return listTerritories({pool:this.readPool,assertReady:()=>this.#assertReady()});}
  async listAssets(options){return listAssets({pool:this.readPool,assertReady:()=>this.#assertReady()},options);}
  async recordDecisions(decisions, event) {
    this.#assertReady();
    for (const decision of decisions) {
      const decisionId = id('decision', decision.eventId, decision.policyId, decision.policyVersion, decision.evidenceVersion);
      await this.#query(`INSERT INTO alert_policy_decision(id,canonical_event_id,policy_id,policy_version,evidence_version,fired,reason_code,evaluated_at,input)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT DO NOTHING`,
      [decisionId, decision.eventId, decision.policyId, decision.policyVersion, decision.evidenceVersion, decision.fired, decision.reasonCode, decision.evaluatedAt, json({ physicalOperationalState: event.physicalOperationalState, freshness: event.physicalState?.freshness, evidenceState: event.evidenceState })]);
    }
  }
  async upsertAlert(candidate, { territoryId = null, recipients = [] } = {}) {
    return this.#tx(async (client) => {
      const existingResult = await client.query('SELECT * FROM operational_alert WHERE dedupe_key=$1 FOR UPDATE', [candidate.dedupeKey]);
      const existing = existingResult.rows[0];
      const alertId = existing?.id ?? id('alert', candidate.dedupeKey);
      const materialChange = !existing || existing.material_key !== candidate.materialKey;
      if (!existing) {
        await client.query(`INSERT INTO operational_alert(id,subject_type,subject_id,canonical_event_id,territory_id,policy_id,policy_version,alert_type,evidence_version,dedupe_key,material_key,lifecycle_state,priority,title,reason_code,physical_state,freshness,payload,opened_at,acknowledge_due_at,escalate_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21)`,
        [alertId, candidate.subjectType, candidate.subjectId, candidate.eventId, territoryId, candidate.policyId, candidate.policyVersion, candidate.alertType, candidate.evidenceVersion, candidate.dedupeKey, candidate.materialKey, candidate.lifecycleState, candidate.priority, candidate.title, candidate.reasonCode, candidate.physicalState, candidate.freshness, json(candidate.payload), candidate.openedAt, candidate.acknowledgeDueAt, candidate.escalateAt]);
      } else if (materialChange) {
        const nextState = existing.lifecycle_state === 'RESOLVED' ? 'OPEN' : existing.lifecycle_state;
        await client.query(`UPDATE operational_alert SET territory_id=$2,policy_version=$3,evidence_version=$4,material_key=$5,lifecycle_state=$6,priority=$7,title=$8,reason_code=$9,physical_state=$10,freshness=$11,payload=$12::jsonb,acknowledge_due_at=$13,escalate_at=$14,resolution_code=CASE WHEN $6='OPEN' THEN NULL ELSE resolution_code END,resolved_at=CASE WHEN $6='OPEN' THEN NULL ELSE resolved_at END,updated_at=now() WHERE id=$1`,
        [alertId, territoryId, candidate.policyVersion, candidate.evidenceVersion, candidate.materialKey, nextState, candidate.priority, candidate.title, candidate.reasonCode, candidate.physicalState, candidate.freshness, json(candidate.payload), candidate.acknowledgeDueAt, candidate.escalateAt]);
      }
      if (materialChange) {
        for (const recipient of recipients) {
          const recipientId = id('recipient', alertId, recipient.actorId, recipient.channel, recipient.escalationLevel ?? 0);
          await client.query(`INSERT INTO alert_recipient(id,alert_id,actor_id,actor_role,channel,escalation_level,routing_reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(alert_id,actor_id,channel,escalation_level) DO UPDATE SET actor_role=excluded.actor_role,routing_reason=excluded.routing_reason`,
          [recipientId, alertId, recipient.actorId, recipient.actorRole, recipient.channel, recipient.escalationLevel ?? 0, recipient.routingReason,candidate.openedAt]);
          const deliveryId = id('delivery', alertId, recipientId, candidate.evidenceVersion, recipient.channel);
          await client.query(`INSERT INTO alert_delivery_outbox(id,alert_id,recipient_id,evidence_version,channel,state,next_attempt_at) VALUES($1,$2,$3,$4,$5,'PENDING',$6) ON CONFLICT(alert_id,recipient_id,evidence_version,channel) DO NOTHING`, [deliveryId, alertId, recipientId, candidate.evidenceVersion, recipient.channel,candidate.openedAt]);
        }
        await this.#audit(client, { aggregateType: 'ALERT', aggregateId: alertId, action: existing ? 'ALERT_EVIDENCE_UPDATED' : 'ALERT_OPENED', actorId: 'vigia-policy-engine', payload: { eventId: candidate.eventId, policyId: candidate.policyId, evidenceVersion: candidate.evidenceVersion, recipientCount: recipients.length } });
        const detectedAt = candidate.payload?.physicalLastAt;
        if (Number.isFinite(Date.parse(detectedAt ?? ''))) await client.query(`INSERT INTO operations_metric_event(id,trace_id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,$3,$4,'detection_to_alert',$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`, [id('metric', alertId, candidate.evidenceVersion, 'detection_to_alert'), candidate.payload?.traceId ?? null, candidate.eventId, alertId, candidate.openedAt, Math.max(0, Date.parse(candidate.openedAt) - Date.parse(detectedAt)), json({ policyId: candidate.policyId })]);
        const eventCreatedAt=candidate.payload?.timing?.eventCreatedAt,providerObservationAt=candidate.payload?.timing?.providerObservationAt;
        if(Number.isFinite(Date.parse(eventCreatedAt??'')))await client.query(`INSERT INTO operations_metric_event(id,trace_id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,$3,$4,'event_to_alert',$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',alertId,candidate.evidenceVersion,'event_to_alert'),candidate.payload?.traceId??null,candidate.eventId,alertId,candidate.openedAt,Math.max(0,Date.parse(candidate.openedAt)-Date.parse(eventCreatedAt)),json({policyId:candidate.policyId})]);
        if(Number.isFinite(Date.parse(providerObservationAt??''))&&Number.isFinite(Date.parse(eventCreatedAt??'')))await client.query(`INSERT INTO operations_metric_event(id,trace_id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,$3,$4,'physical_observation_to_event',$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',alertId,candidate.evidenceVersion,'physical_observation_to_event'),candidate.payload?.traceId??null,candidate.eventId,alertId,eventCreatedAt,Math.max(0,Date.parse(eventCreatedAt)-Date.parse(providerObservationAt)),json({source:'prospective_detection_timing'})]);
      }
      return { alert: rowAlert((await client.query('SELECT * FROM operational_alert WHERE id=$1', [alertId])).rows[0]), created: !existing, materialChange };
    });
  }
  async listAlerts({ eventId = null, states = null, limit = 300 } = {}) {
    this.#assertReady(); const stateList = Array.isArray(states) && states.length ? states : null;
    const result = await this.#query(`SELECT * FROM operational_alert WHERE ($1::text IS NULL OR canonical_event_id=$1) AND ($2::text[] IS NULL OR lifecycle_state=ANY($2)) ORDER BY opened_at DESC LIMIT $3`, [eventId, stateList, Math.min(1000, Math.max(1, Number(limit) || 300))]);
    return result.rows.map(rowAlert);
  }
  async getAlert(alertId) { this.#assertReady(); return rowAlert((await this.#query('SELECT * FROM operational_alert WHERE id=$1', [alertId])).rows[0]); }
  async listNotificationFeed({actorId,channel,incidentIds=null,since=null,limit=100}){
    this.#assertReady();const result=await this.#query(`SELECT d.id delivery_id,d.channel,d.delivered_at,d.provider_reference,a.* FROM alert_delivery_outbox d JOIN alert_recipient r ON r.id=d.recipient_id JOIN operational_alert a ON a.id=d.alert_id
      WHERE r.actor_id=$1 AND d.channel=$2 AND d.state='DELIVERED' AND ($3::timestamptz IS NULL OR d.delivered_at>$3) AND ($4::text[] IS NULL OR a.canonical_event_id=ANY($4)) ORDER BY d.delivered_at DESC LIMIT $5`,[actorId,channel,since,incidentIds,Math.min(500,Math.max(1,Number(limit)||100))]);
    return result.rows.map((row)=>({deliveryId:row.delivery_id,channel:row.channel,availableAt:row.delivered_at?.toISOString?.()??row.delivered_at,providerReference:row.provider_reference,alert:rowAlert(row)}));
  }
  async claimDeliveries(limit = 20) {
    return this.#tx(async (client) => {
      const at=this.clock().toISOString();
      const result = await client.query(`WITH due AS (SELECT id FROM alert_delivery_outbox WHERE state IN ('PENDING','RETRY_WAIT') AND next_attempt_at<=$2 ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1)
        UPDATE alert_delivery_outbox d SET state='ATTEMPTING',attempt_count=attempt_count+1,claimed_at=$2,updated_at=$2 FROM due WHERE d.id=due.id
        RETURNING d.*, (SELECT row_to_json(a) FROM operational_alert a WHERE a.id=d.alert_id) alert, (SELECT row_to_json(r) FROM alert_recipient r WHERE r.id=d.recipient_id) recipient`, [limit,at]);
      return result.rows;
    });
  }
  async completeDelivery(deliveryId, { state, providerReference = null, providerResponse = null, failureCode = null, failureMessage = null, retryAt = null }) {
    return this.#tx(async(client)=>{
      const at=this.clock().toISOString();
      const result = await client.query(`UPDATE alert_delivery_outbox SET state=$2,provider_reference=$3,provider_response=$4::jsonb,failure_code=$5,failure_message=$6,next_attempt_at=COALESCE($7,next_attempt_at),delivered_at=CASE WHEN $2='DELIVERED' THEN $8 ELSE delivered_at END,updated_at=$8 WHERE id=$1 RETURNING *`, [deliveryId, state, providerReference, json(providerResponse), failureCode, failureMessage?.slice(0, 500) ?? null, retryAt,at]);
      const row = result.rows[0]; if (!row) throw new Error('delivery_not_found');
      if (state === 'DELIVERED') await client.query(`INSERT INTO operations_metric_event(id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions)
        SELECT $1,a.canonical_event_id,a.id,CASE WHEN r.escalation_level=0 THEN 'alert_to_delivery' ELSE 'escalation_to_delivery' END,d.delivered_at,
        GREATEST(0,EXTRACT(EPOCH FROM(d.delivered_at-(CASE WHEN r.escalation_level=0 THEN a.opened_at ELSE r.created_at END)))*1000)::bigint,
        jsonb_build_object('channel',d.channel,'escalationLevel',r.escalation_level)
        FROM alert_delivery_outbox d JOIN operational_alert a ON a.id=d.alert_id JOIN alert_recipient r ON r.id=d.recipient_id WHERE d.id=$2 ON CONFLICT(id) DO NOTHING`, [id('metric', row.alert_id, deliveryId, 'delivery'), deliveryId]);
      await this.#audit(client,{aggregateType:'ALERT',aggregateId:row.alert_id,action:`DELIVERY_${state}`,actorId:'vigia-delivery-worker',payload:{deliveryId,channel:row.channel,failureCode,retryAt},at});
      return row;
    });
  }
  async mutate(alertId, { action, actorId, ownerActorId = null, note = null, resolutionCode = null, suppressUntil = null }) {
    return this.#tx(async (client) => {
      const current = (await client.query('SELECT * FROM operational_alert WHERE id=$1 FOR UPDATE', [alertId])).rows[0];
      if (!current) throw new Error('alert_not_found');
      if(alertMutationAlreadyApplied(current,{action,ownerActorId,resolutionCode,suppressUntil}))return rowAlert(current);
      const at = this.clock().toISOString();
      let next = current.lifecycle_state;
      if (action === 'ACKNOWLEDGE') next = current.owner_actor_id ? 'OWNED' : 'ACKNOWLEDGED';
      else if (action === 'ASSIGN' || action === 'REASSIGN') next = 'OWNED';
      else if (action === 'RESOLVE') next = 'RESOLVED';
      else if (action === 'SUPPRESS') next = 'SUPPRESSED';
      else throw new Error('invalid_alert_action');
      if (next !== current.lifecycle_state) assertAlertTransition(current.lifecycle_state, next);
      await client.query(`UPDATE operational_alert SET lifecycle_state=$2,acknowledged_at=CASE WHEN $3='ACKNOWLEDGE' THEN COALESCE(acknowledged_at,$4) ELSE acknowledged_at END,acknowledged_by=CASE WHEN $3='ACKNOWLEDGE' THEN COALESCE(acknowledged_by,$5) ELSE acknowledged_by END,owner_actor_id=CASE WHEN $3 IN ('ASSIGN','REASSIGN') THEN $6 ELSE owner_actor_id END,suppression_until=CASE WHEN $3='SUPPRESS' THEN $7 ELSE suppression_until END,resolution_code=CASE WHEN $3='RESOLVE' THEN $8 ELSE resolution_code END,resolved_at=CASE WHEN $3='RESOLVE' THEN $4 ELSE resolved_at END,resolved_by=CASE WHEN $3='RESOLVE' THEN $5 ELSE resolved_by END,updated_at=now() WHERE id=$1`, [alertId, next, action, at, actorId, ownerActorId, suppressUntil, resolutionCode]);
      if (['ACKNOWLEDGE','ASSIGN','REASSIGN'].includes(action)) await client.query(`INSERT INTO alert_acknowledgement(id,alert_id,state,actor_id,prior_owner_actor_id,owner_actor_id,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id('ack', alertId, action, actorId, at), alertId, action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : action === 'ASSIGN' ? 'OWNED' : 'REASSIGNED', actorId, current.owner_actor_id, action === 'ACKNOWLEDGE' ? current.owner_actor_id : ownerActorId, note, at]);
      if (action === 'RESOLVE') await client.query(`INSERT INTO alert_resolution(id,alert_id,resolution_code,actor_id,note,evidence_version,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [id('resolution', alertId, actorId, at), alertId, resolutionCode, actorId, note, current.evidence_version, at]);
      await this.#audit(client, { aggregateType: 'ALERT', aggregateId: alertId, action, actorId, payload: { from: current.lifecycle_state, to: next, ownerActorId, resolutionCode, suppressUntil, note } });
      if (action === 'ACKNOWLEDGE') await client.query(`INSERT INTO operations_metric_event(id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,$3,'alert_to_acknowledgement',$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING`, [id('metric', alertId, 'ack'), current.canonical_event_id, alertId, at, Math.max(0, Date.parse(at)-Date.parse(current.opened_at)), json({ actorId })]);
      if(action==='ACKNOWLEDGE')await client.query(`INSERT INTO operations_metric_event(id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions)
        SELECT $1,$2,$3,'delivery_to_acknowledgement',$4,GREATEST(0,EXTRACT(EPOCH FROM($4::timestamptz-min(delivered_at)))*1000)::bigint,$5::jsonb FROM alert_delivery_outbox WHERE alert_id=$3 AND delivered_at IS NOT NULL HAVING min(delivered_at) IS NOT NULL ON CONFLICT(id) DO NOTHING`,[id('metric',alertId,'delivery_to_acknowledgement'),current.canonical_event_id,alertId,at,json({actorId})]);
      if(action==='RESOLVE'&&current.acknowledged_at)await client.query(`INSERT INTO operations_metric_event(id,event_id,alert_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,$3,'acknowledgement_to_resolution',$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',alertId,'acknowledgement_to_resolution'),current.canonical_event_id,alertId,at,Math.max(0,Date.parse(at)-Date.parse(current.acknowledged_at)),json({actorId,resolutionCode})]);
      return rowAlert((await client.query('SELECT * FROM operational_alert WHERE id=$1', [alertId])).rows[0]);
    });
  }
  async escalateDue({ supervisorActorId, supervisorRole = 'supervisor', channels = ['IN_APP', 'BROWSER_NOTIFICATION'] }) {
    if (!supervisorActorId) return [];
    return this.#tx(async (client) => {
      const due = await client.query(`SELECT * FROM operational_alert WHERE lifecycle_state IN ('OPEN','ACKNOWLEDGED') AND escalate_at<=$1 AND acknowledged_at IS NULL FOR UPDATE SKIP LOCKED`,[this.clock().toISOString()]);
      const escalated = [];
      for (const alert of due.rows) {
        const existing = await client.query('SELECT 1 FROM alert_escalation WHERE alert_id=$1 AND level=1', [alert.id]); if (existing.rowCount) continue;
        const at = this.clock().toISOString();
        await client.query(`INSERT INTO alert_escalation(id,alert_id,level,state,from_actor_id,to_actor_id,reason_code,created_at) VALUES($1,$2,1,'ESCALATED',$3,$4,'ACKNOWLEDGEMENT_OVERDUE',$5)`, [id('escalation', alert.id, 1), alert.id, alert.owner_actor_id, supervisorActorId, at]);
        await client.query(`UPDATE operational_alert SET lifecycle_state='ESCALATED',updated_at=now() WHERE id=$1`, [alert.id]);
        for (const channel of channels) {
          const recipientId = id('recipient', alert.id, supervisorActorId, channel, 1);
          await client.query(`INSERT INTO alert_recipient(id,alert_id,actor_id,actor_role,channel,escalation_level,routing_reason,created_at) VALUES($1,$2,$3,$4,$5,1,'ACKNOWLEDGEMENT_OVERDUE',$6) ON CONFLICT(alert_id,actor_id,channel,escalation_level) DO NOTHING`, [recipientId, alert.id, supervisorActorId, supervisorRole, channel,at]);
          await client.query(`INSERT INTO alert_delivery_outbox(id,alert_id,recipient_id,evidence_version,channel,state,next_attempt_at) VALUES($1,$2,$3,$4,$5,'PENDING',$6) ON CONFLICT(alert_id,recipient_id,evidence_version,channel) DO NOTHING`, [id('delivery', alert.id, recipientId, alert.evidence_version, channel), alert.id, recipientId, alert.evidence_version, channel,at]);
        }
        await this.#audit(client, { aggregateType: 'ALERT', aggregateId: alert.id, action: 'ESCALATED', actorId: 'vigia-escalation-worker', payload: { toActorId: supervisorActorId, reasonCode: 'ACKNOWLEDGEMENT_OVERDUE' }, at });
        escalated.push(alert.id);
      }
      return escalated;
    });
  }
  async upsertOpportunities(opportunities = []) {
    this.#assertReady();
    for (const item of opportunities) await this.#query(`INSERT INTO operational_observation_opportunity(id,event_id,source_family,platform,window_start,window_end,opportunity_type,authority,coverage_assumptions,quality_dependencies,blocker_reason,calculation_version,can_close_evidence_need,payload,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14::jsonb,$15,$16)
      ON CONFLICT(id) DO UPDATE SET window_start=excluded.window_start,window_end=excluded.window_end,opportunity_type=excluded.opportunity_type,authority=excluded.authority,coverage_assumptions=excluded.coverage_assumptions,quality_dependencies=excluded.quality_dependencies,blocker_reason=excluded.blocker_reason,can_close_evidence_need=excluded.can_close_evidence_need,payload=excluded.payload,expires_at=excluded.expires_at,updated_at=now()`,
    [item.id, item.eventId, item.sourceFamily, item.platform, item.windowStart, item.windowEnd, item.opportunityType, item.authority, json(item.coverageAssumptions), json(item.qualityDependencies), item.blockerReason, item.calculationVersion, item.canCloseEvidenceNeed, json(item), item.createdAt, item.expiresAt]);
  }
  async listOpportunities({ eventId = null, activeAt = this.clock().toISOString(), limit = 300 } = {}) { this.#assertReady(); const result = await this.#query(`SELECT payload FROM operational_observation_opportunity WHERE ($1::text IS NULL OR event_id=$1) AND expires_at>$2 ORDER BY window_start NULLS LAST,source_family LIMIT $3`, [eventId, activeAt,Math.min(1000,Math.max(1,Number(limit)||300))]); return result.rows.map((row) => row.payload); }
  async reconcileOpportunityResults(event) {
    this.#assertReady(); if (!event?.id) return [];
    const opportunities=(await this.#query(`SELECT * FROM operational_observation_opportunity WHERE event_id=$1 AND can_close_evidence_need`,[event.id])).rows;
    const observations=(event.observations??[]).filter((item)=>item?.id&&Number.isFinite(Date.parse(item.at??''))&&['thermal','camera','ground_sensor','drone','field'].includes(item.type));
    const results=[];
    for(const opportunity of opportunities){
      const observation=observations.find((item)=>observationMatchesOpportunity(item,opportunity));
      const evidenceNeedId=opportunity.payload?.evidenceNeedId??(event.actionNeed?.needsRouting&&event.actionNeed?.kind?`evidence-need:${createHash('sha256').update(`${event.id}:${event.actionNeed.kind}`).digest('hex').slice(0,18)}`:null);
      const conclusion=String(opportunity.payload?.coverageAssumptions?.providerConclusion??'').toLowerCase(),providerState=String(opportunity.payload?.coverageAssumptions?.providerState??'').toLowerCase();
      let resultState=null,reasonCode=null,observationId=observation?.id??null;
      if(observation){resultState=Number(event.physicalSourceProfile?.familyCount??0)>=2?'CORROBORATED':'AMBIGUOUS';reasonCode=resultState==='CORROBORATED'?'INDEPENDENT_SOURCE_MATCHED_GOVERNED_WINDOW':'MATCHED_OBSERVATION_DID_NOT_ESTABLISH_INDEPENDENCE';}
      else if(opportunity.opportunity_type==='CONFIRMED_PROVIDER_PRODUCT'&&/no_positive|no_detection|empty_aoi/.test(conclusion)){resultState='VALID_OPPORTUNITY_NO_SIGNAL';reasonCode='ATTRIBUTABLE_PRODUCT_PARSED_WITH_NO_QUALIFYING_OBSERVATION';}
      else if(opportunity.opportunity_type==='CONFIRMED_PROVIDER_PRODUCT'&&/quality_unusable|invalid_quality/.test(conclusion)){resultState='QUALITY_UNUSABLE';reasonCode='ATTRIBUTABLE_PRODUCT_FAILED_QUALITY_REQUIREMENTS';}
      else if(opportunity.opportunity_type==='CONFIRMED_PROVIDER_PRODUCT'&&/no_coverage|outside_aoi/.test(conclusion)){resultState='NO_COVERAGE';reasonCode='ATTRIBUTABLE_PRODUCT_DID_NOT_COVER_TARGET';}
      else if(['failed','unavailable','error'].includes(providerState)){resultState='SOURCE_FAILURE';reasonCode='SOURCE_FAILED_DURING_GOVERNED_OPPORTUNITY';}
      else if(Date.parse(opportunity.expires_at)<=this.clock().getTime()){resultState='EXPIRED';reasonCode='OPPORTUNITY_EXPIRED_WITHOUT_ATTRIBUTABLE_CONCLUSION';}
      if(!resultState)continue;
      const resultId=id('opportunity-result',opportunity.id,observationId??'none',resultState);
      const payload={sourceFamily:observation?.sourceFamily??opportunity.source_family,observedAt:observation?.at??null,opportunityType:opportunity.opportunity_type,authority:opportunity.authority,providerConclusion:conclusion||null,domainRecomputation:event.actionNeed?.needsRouting?'UNKNOWN_REMAINS_OPEN':'UNKNOWN_NO_LONGER_PRESENT'};
      const inserted=await this.#query(`INSERT INTO evidence_opportunity_result(id,opportunity_id,event_id,evidence_need_id,result_state,attributable_observation_id,reason_code,payload,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT DO NOTHING RETURNING *`,[resultId,opportunity.id,event.id,evidenceNeedId,resultState,observationId,reasonCode,json(payload),this.clock().toISOString()]);
      if(inserted.rows[0]){
        results.push(inserted.rows[0]);
        const resultAt=inserted.rows[0].created_at?.toISOString?.()??inserted.rows[0].created_at;
        await this.#query(`INSERT INTO operations_metric_event(id,event_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,'opportunity_to_evidence_result',$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',resultId,'opportunity_to_evidence_result'),event.id,resultAt,Math.max(0,Date.parse(resultAt)-Date.parse(opportunity.created_at)),json({resultState,opportunityType:opportunity.opportunity_type})]);
        if(!event.actionNeed?.needsRouting)await this.#query(`INSERT INTO operations_metric_event(id,event_id,metric_name,occurred_at,value_ms,dimensions) VALUES($1,$2,'evidence_result_to_unknown_closure',$3,0,$4::jsonb) ON CONFLICT(id) DO NOTHING`,[id('metric',resultId,'evidence_result_to_unknown_closure'),event.id,resultAt,json({resultState,evidenceNeedId})]);
      }
    }
    return results;
  }
  async listOpportunityResults({eventId=null,limit=300}={}){this.#assertReady();const result=await this.#query(`SELECT id,opportunity_id,event_id,evidence_need_id,result_state,attributable_observation_id,reason_code,payload,created_at FROM evidence_opportunity_result WHERE ($1::text IS NULL OR event_id=$1) ORDER BY created_at DESC,id LIMIT $2`,[eventId,Math.min(1000,Math.max(1,Number(limit)||300))]);return result.rows;}
  async alertStatusProjection({ eventId = null, limit = 300 } = {}) {
    this.#assertReady();
    const result=await this.#query(`SELECT * FROM operational_alert_status_projection WHERE ($1::text IS NULL OR canonical_event_id=$1) ORDER BY opened_at DESC LIMIT $2`,[eventId,Math.min(1000,Math.max(1,Number(limit)||300))]);
    return result.rows;
  }
  async alertTimeline(alertId) {
    this.#assertReady();
    const [alert,deliveries,acknowledgements,escalations,resolutions,audit]=await Promise.all([
      this.#query('SELECT * FROM operational_alert_status_projection WHERE id=$1',[alertId]),
      this.#query('SELECT id,channel,state,attempt_count,max_attempts,next_attempt_at,delivered_at,failure_code,created_at,updated_at FROM alert_delivery_outbox WHERE alert_id=$1 ORDER BY created_at,id',[alertId]),
      this.#query('SELECT id,state,actor_id,prior_owner_actor_id,owner_actor_id,note,created_at FROM alert_acknowledgement WHERE alert_id=$1 ORDER BY created_at,id',[alertId]),
      this.#query('SELECT id,level,state,from_actor_id,to_actor_id,reason_code,created_at FROM alert_escalation WHERE alert_id=$1 ORDER BY level,created_at',[alertId]),
      this.#query('SELECT id,resolution_code,actor_id,note,evidence_version,created_at FROM alert_resolution WHERE alert_id=$1 ORDER BY created_at,id',[alertId]),this.audit(alertId)
    ]);
    if(!alert.rows[0])throw new Error('alert_not_found');
    return{alert:alert.rows[0],deliveries:deliveries.rows,acknowledgements:acknowledgements.rows,escalations:escalations.rows,resolutions:resolutions.rows,audit};
  }
  async operationsStatus(){this.#assertReady();return operationsStatus(this.readPool);}
  async metrics() {
    this.#assertReady();
    const [counts, latency, delivery,policy,escalation,opportunities,results,databaseAvailability] = await Promise.all([
      this.#query(`SELECT lifecycle_state,count(*)::int count FROM operational_alert GROUP BY lifecycle_state`),
      this.#query(`SELECT metric_name,count(*)::int sample_count,percentile_cont(0.5) WITHIN GROUP(ORDER BY value_ms)::bigint median_ms,percentile_cont(0.95) WITHIN GROUP(ORDER BY value_ms)::bigint p95_ms FROM operations_metric_event WHERE value_ms IS NOT NULL GROUP BY metric_name`),
      this.#query(`SELECT state,count(*)::int count,sum(attempt_count)::int attempts,count(*) FILTER(WHERE attempt_count>1)::int retried FROM alert_delivery_outbox GROUP BY state`),
      this.#query(`SELECT count(*) FILTER(WHERE fired)::int fired,count(*)::int evaluated FROM alert_policy_decision`),
      this.#query(`SELECT count(*)::int count FROM alert_escalation`),
      this.#query(`SELECT count(*)::int count FROM operational_observation_opportunity`),
      this.#query(`SELECT count(*)::int count,count(*) FILTER(WHERE result_state IN ('CORROBORATED','VALID_OPPORTUNITY_NO_SIGNAL'))::int evidence_producing FROM evidence_opportunity_result`),
      this.#query(`SELECT min(occurred_at) FILTER(WHERE metric_name='operations_db_monitoring_window_start') window_start,COALESCE(sum(value_ms) FILTER(WHERE metric_name='operations_db_reconnect'),0)::bigint downtime_ms,count(*) FILTER(WHERE metric_name='operations_db_reconnect')::int outage_count FROM operations_metric_event WHERE trace_id=$1`,[this.runtimeInstanceId])
    ]);
    const alertCount=counts.rows.reduce((sum,row)=>sum+row.count,0),deliveryCount=delivery.rows.reduce((sum,row)=>sum+row.count,0);
    const fired=policy.rows[0]?.fired??0,retried=delivery.rows.reduce((sum,row)=>sum+(row.retried??0),0),opportunityCount=opportunities.rows[0]?.count??0,resultCount=results.rows[0]?.count??0;
    const availabilityRow=databaseAvailability.rows[0]??{},windowStart=availabilityRow.window_start?.toISOString?.()??availabilityRow.window_start,windowMs=Number.isFinite(Date.parse(windowStart??''))?Math.max(0,this.clock().getTime()-Date.parse(windowStart)):0,downtimeMs=Number(availabilityRow.downtime_ms??0),uptimeMs=Math.max(0,windowMs-downtimeMs);
    return { generatedAt: this.clock().toISOString(), denominators:{alerts:alertCount,policyEvaluations:policy.rows[0]?.evaluated??0,firedPolicyDecisions:fired,deliveries:deliveryCount,opportunities:opportunityCount,opportunityResults:resultCount,operationsDatabaseObservedWindowMs:windowMs,externallyLabeledAlerts:0,externallyLabeledMissOpportunities:0},alerts: Object.fromEntries(counts.rows.map((row) => [row.lifecycle_state, row.count])), delivery: Object.fromEntries(delivery.rows.map((row) => [row.state, row.count])), latency: Object.fromEntries(latency.rows.map((row) => [row.metric_name, { sampleCount: row.sample_count, medianMs: Number(row.median_ms), p95Ms: Number(row.p95_ms) }])),rates:{operationsDatabaseAvailability:{state:windowMs>0?'MEASURED_CURRENT_RUNTIME':'INSUFFICIENT_WINDOW',numerator:windowMs>0?uptimeMs:null,denominator:windowMs,value:windowMs>0?Number((uptimeMs/windowMs).toFixed(6)):null,observedDowntimeMs:downtimeMs,outageCount:availabilityRow.outage_count??0,windowStart:windowStart??null},alertDedupe:{numerator:Math.max(0,fired-alertCount),denominator:fired,value:fired?Number((Math.max(0,fired-alertCount)/fired).toFixed(4)):null},escalation:{numerator:escalation.rows[0]?.count??0,denominator:alertCount,value:alertCount?Number(((escalation.rows[0]?.count??0)/alertCount).toFixed(4)):null},outboxRetry:{numerator:retried,denominator:deliveryCount,value:deliveryCount?Number((retried/deliveryCount).toFixed(4)):null},opportunityEvidenceYield:{numerator:results.rows[0]?.evidence_producing??0,denominator:opportunityCount,value:opportunityCount?Number(((results.rows[0]?.evidence_producing??0)/opportunityCount).toFixed(4)):null}},quality:{falseAlertRate:{state:'UNMEASURED',numerator:null,denominator:0,reason:'No attributable external false-alert labels are linked to operational alerts.'},actionableAlertPrecision:{state:'UNMEASURED',numerator:null,denominator:0,reason:'No externally adjudicated actionable-alert labels are linked.'},missedAlertRate:{state:'UNMEASURED',numerator:null,denominator:0,reason:'No governed externally labelled observation-opportunity denominator exists for missed alerts.'}} };
  }
  async audit(alertId) { this.#assertReady(); const result = await this.#query(`SELECT id,sequence,action,actor_id,previous_hash,record_hash,payload,created_at FROM operations_audit_record WHERE aggregate_type='ALERT' AND aggregate_id=$1 ORDER BY sequence`, [alertId]); return result.rows; }
  async operationalProof() {
    this.#assertReady();
    const result = await this.#query(`SELECT
      (SELECT count(*)::int FROM alert_policy_decision) decisions,
      (SELECT count(*)::int FROM alert_policy_decision WHERE fired) fired_decisions,
      (SELECT count(*)::int FROM operational_alert) alerts,
      (SELECT count(*)::int FROM alert_recipient) recipients,
      (SELECT count(*)::int FROM alert_delivery_outbox) deliveries,
      (SELECT count(*)::int FROM alert_acknowledgement) acknowledgements,
      (SELECT count(*)::int FROM alert_escalation) escalations,
      (SELECT count(*)::int FROM alert_resolution) resolutions,
      (SELECT count(*)::int FROM operational_observation_opportunity) opportunities,
      (SELECT count(*)::int FROM evidence_opportunity_result) opportunity_results,
      (SELECT count(*)::int FROM monitored_asset) assets`);
    const deliveries = await this.#query(`SELECT channel,state,count(*)::int count FROM alert_delivery_outbox GROUP BY channel,state ORDER BY channel,state`);
    const decisions = await this.#query(`SELECT reason_code,fired,count(*)::int count FROM alert_policy_decision GROUP BY reason_code,fired ORDER BY reason_code,fired`);
    return { ...result.rows[0], deliveries: deliveries.rows, decisions: decisions.rows };
  }
  async verifyAudit(alertId) {
    const rows = await this.audit(alertId); let previousHash = null;
    for (const row of rows) {
      if (row.previous_hash !== previousHash) return { valid: false, count: rows.length, failure: 'PREVIOUS_HASH_MISMATCH', recordId: row.id };
      const at=row.created_at?.toISOString?.()??row.created_at;
      const material={recordId:row.id,aggregateType:'ALERT',aggregateId:alertId,action:row.action,actorId:row.actor_id,previousHash:row.previous_hash,payload:row.payload,at};
      const expected=`sha256:${createHash('sha256').update(canonical(material)).digest('hex')}`;
      if(expected!==row.record_hash)return{valid:false,count:rows.length,failure:'RECORD_HASH_MISMATCH',recordId:row.id};
      previousHash=row.record_hash;
    }
    return { valid: true, count: rows.length, head: previousHash };
  }
}
