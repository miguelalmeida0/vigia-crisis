import pg from 'pg';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { runPostgresMigrations } from '../storage/postgres-migration-runner.mjs';
import { guardPostgresClient,guardPostgresPool,postgresClientFailure,releasePostgresClient } from '../storage/postgres-client-guard.mjs';

const json = (value) => JSON.stringify(value ?? {});
const rowObject = (row) => row ? ({ kind: row.object_kind, objectId: row.object_id, incidentId: row.incident_id, schemaVersion: row.schema_version, semanticIdentity: row.semantic_identity, revision: Number(row.revision), knowledgeTime: row.knowledge_time?.toISOString?.() ?? row.knowledge_time, projectionVersion: Number(row.projection_version), payload: row.payload, payloadHash: row.payload_hash, rights: row.rights, updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at }) : null;

export class PostgresOperationalIntelligenceRepository {
  constructor({ databaseUrl, pool, clock = () => new Date() } = {}) { if (!databaseUrl && !pool) throw new Error('postgres_intelligence_database_required'); this.pool = pool ?? new pg.Pool({ connectionString: databaseUrl, application_name: 'vigia-intelligence-repository', max: 8, connectionTimeoutMillis: 3_000, statement_timeout: 30_000 }); this.ownsPool = !pool; this.clock = clock;guardPostgresPool(this.pool); }
  async initialize() { const migration = await runPostgresMigrations(this.pool); return { adapter: 'POSTGRES_POSTGIS', state: 'READY', migration }; }
  async close() { if (this.ownsPool) await this.pool.end(); }
  async transact(operation, { retries = 3 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const client = await this.pool.connect();guardPostgresClient(client);
      try { await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE'); const result = await operation(client); await client.query('COMMIT');const failure=postgresClientFailure(client);if(failure)throw failure;return result; }
      catch (error) { const failure=postgresClientFailure(client,error);await client.query('ROLLBACK').catch(() => undefined); if (failure.code === '40001' && attempt < retries) continue; throw failure; }
      finally { releasePostgresClient(client); }
    }
    throw new Error('postgres_intelligence_retry_exhausted');
  }
  async appendEvent(event) {
    if (!event?.id || !event.semanticIdentity || !event.type) throw new Error('intelligence_event_invalid');
    const payloadHash = semanticHash('intelligence-event-payload', event.payload ?? {});
    return this.transact(async (client) => {
      const result = await client.query(`INSERT INTO intelligence_event(event_id,semantic_identity,incident_id,event_type,effective_at,received_at,payload,payload_hash,rights)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb) ON CONFLICT DO NOTHING RETURNING event_sequence`, [event.id, event.semanticIdentity, event.incidentId ?? null, event.type, event.effectiveAt, event.receivedAt, json(event.payload), payloadHash, json(event.rights)]);
      if (result.rowCount) return { state: 'ACCEPTED', sequence: Number(result.rows[0].event_sequence) };
      const prior = await client.query('SELECT event_id,payload_hash,event_sequence FROM intelligence_event WHERE event_id=$1 OR semantic_identity=$2', [event.id, event.semanticIdentity]);
      if (prior.rows[0]?.payload_hash !== payloadHash) throw new Error('intelligence_event_identity_conflict');
      return { state: 'DUPLICATE', sequence: Number(prior.rows[0].event_sequence) };
    });
  }
  async putObject(kind, objectId, payload, options = {}) {
    if (!kind || !objectId || !payload?.schemaVersion) throw new Error('intelligence_object_invalid');
    const payloadHash = semanticHash('intelligence-object-payload', payload), expected = options.expectedRevision;
    return this.transact((client) => this.#putObject(client, kind, objectId, payload, options, payloadHash, expected));
  }
  async getObject(kind, objectId, { projectionVersion = null } = {}) { await this.#assertVersion(projectionVersion); return rowObject((await this.pool.query('SELECT * FROM intelligence_object WHERE object_kind=$1 AND object_id=$2', [kind, objectId])).rows[0]); }
  async listObjects({ kind = null, incidentId = null, limit = 100, cursor = null, projectionVersion = null } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('intelligence_query_limit_invalid'); const version = await this.#assertVersion(projectionVersion);
    let afterKind = '', afterId = ''; if (cursor) { try { const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); if (decoded.version !== version) throw Object.assign(new Error('intelligence_cursor_projection_mismatch'), { code: 'CONSISTENCY_TOKEN_MISMATCH', currentVersion: version }); afterKind = decoded.kind; afterId = decoded.id; } catch (error) { if (error.code === 'CONSISTENCY_TOKEN_MISMATCH') throw error; throw new Error('intelligence_cursor_invalid'); } }
    const result = await this.pool.query(`SELECT * FROM intelligence_object WHERE ($1::text IS NULL OR object_kind=$1) AND ($2::text IS NULL OR incident_id=$2) AND ((object_kind,object_id)>($3,$4)) ORDER BY object_kind,object_id LIMIT $5`, [kind, incidentId, afterKind, afterId, limit + 1]);
    const rows = result.rows.slice(0, limit).map(rowObject), last = rows.at(-1), nextCursor = result.rows.length > limit && last ? Buffer.from(JSON.stringify({ kind: last.kind, id: last.objectId, version })).toString('base64url') : null;
    return { schemaVersion: 'vigia.intelligence-object-page.v1', projectionVersion: version, consistencyToken: `projection:${version}`, results: rows, nextCursor, partial: false };
  }
  async linkLineage(edge) { return this.transact((client) => client.query(`INSERT INTO intelligence_lineage_edge(parent_kind,parent_id,child_kind,child_id,relationship,rights) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`, [edge.parentKind, edge.parentId, edge.childKind, edge.childId, edge.relationship, json(edge.rights)])); }
  async persistDecisionPacket(packet, options = {}) {
    const objectOptions = { ...options, incidentId: packet.incident.id, knowledgeTime: packet.knowledgeTime, semanticIdentity: packet.replayFingerprint }, payloadHash = semanticHash('intelligence-object-payload', packet);
    return this.transact(async (client) => { const object = (await this.#putObject(client, 'DECISION_PACKET', packet.replayFingerprint, packet, objectOptions, payloadHash, objectOptions.expectedRevision)).object; await client.query(`INSERT INTO crisis_decision_packet(packet_fingerprint,incident_id,knowledge_time,schema_version,projection_version,proof_fingerprint,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`, [packet.replayFingerprint, packet.incident.id, packet.knowledgeTime, packet.schemaVersion, object.projectionVersion, packet.proof?.fingerprint ?? null, json(packet)]); return object; });
  }
  async persistReceipt(receipt, options = {}) {
    const objectOptions = { ...options, incidentId: receipt.incidentId }, objectPayloadHash = semanticHash('intelligence-object-payload', receipt), receiptPayloadHash = semanticHash('intelligence-receipt-payload', receipt);
    return this.transact(async (client) => { const object = (await this.#putObject(client, 'RECEIPT', receipt.id, receipt, objectOptions, objectPayloadHash, objectOptions.expectedRevision)).object; await client.query('INSERT INTO intelligence_receipt(receipt_id,incident_id,action_id,payload_hash,payload) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING', [receipt.id, receipt.incidentId ?? null, receipt.actionId ?? null, receiptPayloadHash, json(receipt)]); return object; });
  }
  async persistArchiveSnapshot(snapshot, options = {}) {
    const objectOptions = { ...options, incidentId: snapshot.incidentId, knowledgeTime: snapshot.vigiaReceivedAt, semanticIdentity: snapshot.fingerprint }, payloadHash = semanticHash('intelligence-object-payload', snapshot);
    return this.transact(async (client) => { const object = (await this.#putObject(client, 'PROSPECTIVE_ARCHIVE_SNAPSHOT', snapshot.fingerprint, snapshot, objectOptions, payloadHash, objectOptions.expectedRevision)).object; await client.query(`INSERT INTO prospective_archive_snapshot(snapshot_fingerprint,manifest_id,sequence,incident_id,provider_id,product_id,provider_published_at,vigia_received_at,raw_object_reference,raw_object_hash,previous_snapshot_fingerprint,rights,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb) ON CONFLICT DO NOTHING`, [snapshot.fingerprint, snapshot.manifestId, snapshot.sequence, snapshot.incidentId, snapshot.providerId, snapshot.productId, snapshot.providerPublishedAt, snapshot.vigiaReceivedAt, snapshot.rawObjectReference, snapshot.rawObjectHash, snapshot.previousSnapshotFingerprint, json(snapshot.rights), json(snapshot)]); return object; });
  }
  async persistDecisionOutcome(outcome, options = {}) {
    const objectOptions = { ...options, incidentId: outcome.incidentId, knowledgeTime: outcome.adjudicatedAt ?? outcome.decisionTime }, objectPayloadHash = semanticHash('intelligence-object-payload', outcome), outcomePayloadHash = semanticHash('decision-outcome-payload', outcome);
    return this.transact(async (client) => { const object = (await this.#putObject(client, 'DECISION_OUTCOME', outcome.id, outcome, objectOptions, objectPayloadHash, objectOptions.expectedRevision)).object; await client.query(`INSERT INTO decision_outcome_ledger(outcome_id,packet_fingerprint,incident_id,decision_time,adjudicated_at,projection_version,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT DO NOTHING`, [outcome.id, outcome.packetFingerprint, outcome.incidentId, outcome.decisionTime, outcome.adjudicatedAt, object.projectionVersion, json(outcome), outcomePayloadHash]); return object; });
  }
  async persistInformationValueOutcome(outcome, options = {}) {
    const objectOptions = { ...options, incidentId: outcome.incidentId }, objectPayloadHash = semanticHash('intelligence-object-payload', outcome), outcomePayloadHash = semanticHash('information-value-outcome-payload', outcome);
    return this.transact(async (client) => { const object = (await this.#putObject(client, 'INFORMATION_VALUE_OUTCOME', outcome.id, outcome, objectOptions, objectPayloadHash, objectOptions.expectedRevision)).object; await client.query(`INSERT INTO information_value_outcome(outcome_id,acquisition_id,incident_id,provider_id,acquisition_type,payload,payload_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT DO NOTHING`, [outcome.id, outcome.acquisitionId, outcome.incidentId, outcome.providerId, outcome.acquisitionType, json(outcome), outcomePayloadHash]); return object; });
  }
  async semanticSnapshot() { const [events, objects, lineage] = await Promise.all([this.pool.query('SELECT event_id id,semantic_identity,incident_id,event_type type,effective_at,received_at,payload,payload_hash,rights FROM intelligence_event ORDER BY event_id'), this.pool.query('SELECT * FROM intelligence_object ORDER BY object_kind,object_id'), this.pool.query('SELECT parent_kind,parent_id,child_kind,child_id,relationship,rights FROM intelligence_lineage_edge ORDER BY parent_kind,parent_id,child_kind,child_id,relationship')]); return { events: events.rows, objects: objects.rows.map(rowObject).map(({ updatedAt, projectionVersion, ...item }) => item), lineage: lineage.rows }; }
  async #putObject(client, kind, objectId, payload, options, payloadHash, expected) {
    await client.query("INSERT INTO intelligence_projection_state(projection_name,projection_version,source_event_sequence) VALUES('GLOBAL',0,0) ON CONFLICT DO NOTHING");
    const projection = await client.query("UPDATE intelligence_projection_state SET projection_version=projection_version+1,updated_at=now() WHERE projection_name='GLOBAL' RETURNING projection_version");
    const version = Number(projection.rows[0].projection_version), prior = await client.query('SELECT * FROM intelligence_object WHERE object_kind=$1 AND object_id=$2 FOR UPDATE', [kind, objectId]);
    if (prior.rows[0]?.payload_hash === payloadHash) return { state: 'DUPLICATE', object: rowObject(prior.rows[0]) };
    if (expected !== undefined && Number(prior.rows[0]?.revision ?? 0) !== expected) throw Object.assign(new Error('intelligence_object_revision_conflict'), { code: 'OPTIMISTIC_CONFLICT' });
    const revision = Number(prior.rows[0]?.revision ?? 0) + 1;
    try {
      const result = await client.query(`INSERT INTO intelligence_object(object_kind,object_id,incident_id,schema_version,semantic_identity,revision,knowledge_time,projection_version,payload,payload_hash,rights,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12)
        ON CONFLICT(object_kind,object_id) DO UPDATE SET incident_id=EXCLUDED.incident_id,schema_version=EXCLUDED.schema_version,revision=EXCLUDED.revision,knowledge_time=EXCLUDED.knowledge_time,projection_version=EXCLUDED.projection_version,payload=EXCLUDED.payload,payload_hash=EXCLUDED.payload_hash,rights=EXCLUDED.rights,updated_at=EXCLUDED.updated_at RETURNING *`,
      [kind, objectId, options.incidentId ?? prior.rows[0]?.incident_id ?? null, payload.schemaVersion, options.semanticIdentity ?? `${kind}:${objectId}`, revision, options.knowledgeTime ?? null, version, json(payload), payloadHash, json(options.rights ?? prior.rows[0]?.rights), this.clock().toISOString()]);
      return { state: prior.rowCount ? 'UPDATED' : 'CREATED', object: rowObject(result.rows[0]) };
    } catch (error) { if (error.code === '23505') throw new Error('intelligence_object_semantic_identity_conflict'); throw error; }
  }
  async #assertVersion(requested) { const row = (await this.pool.query("SELECT projection_version FROM intelligence_projection_state WHERE projection_name='GLOBAL'")).rows[0], current = Number(row?.projection_version ?? 0); if (requested !== null && Number(requested) !== current) throw Object.assign(new Error('intelligence_consistency_token_mismatch'), { code: 'CONSISTENCY_TOKEN_MISMATCH', currentVersion: current }); return current; }
}
