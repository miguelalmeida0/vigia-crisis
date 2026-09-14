import { LIFE_SAFETY_INCIDENT_COMMAND_TYPES } from '../../../packages/domain/src/incident-command/contracts.mjs';

export function initializeFieldNodeSchema({ db, clock, nodeId, getMeta, setMeta }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS incident(id TEXT PRIMARY KEY,package_id TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,imported_at TEXT NOT NULL,last_sync_cursor TEXT);
    CREATE TABLE IF NOT EXISTS device(id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS observation(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,device_id TEXT NOT NULL,observed_at TEXT NOT NULL,received_at TEXT NOT NULL,observation_type TEXT NOT NULL,subject_key TEXT,claim_field TEXT,claim_value TEXT,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,sync_state TEXT NOT NULL,FOREIGN KEY(incident_id) REFERENCES incident(id));
    CREATE INDEX IF NOT EXISTS observation_incident_idx ON observation(incident_id,received_at,id);
    CREATE TABLE IF NOT EXISTS task(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,version INTEGER NOT NULL,state TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(incident_id) REFERENCES incident(id));
    CREATE TABLE IF NOT EXISTS task_version(task_id TEXT NOT NULL,version INTEGER NOT NULL,mutation_id TEXT,actor TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(task_id,version));
    CREATE TABLE IF NOT EXISTS acknowledgement(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,incident_id TEXT NOT NULL,actor TEXT NOT NULL,task_version INTEGER NOT NULL,node_id TEXT NOT NULL,note TEXT,created_at TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT);
    CREATE TABLE IF NOT EXISTS alert_acknowledgement(id TEXT PRIMARY KEY,alert_id TEXT NOT NULL,incident_id TEXT NOT NULL,actor TEXT NOT NULL,alert_version INTEGER NOT NULL,node_id TEXT NOT NULL,note TEXT,created_at TEXT NOT NULL,payload_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mutation(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,origin_node TEXT NOT NULL,actor TEXT NOT NULL,type TEXT NOT NULL,priority TEXT NOT NULL,local_sequence INTEGER NOT NULL,wall_clock_at TEXT NOT NULL,clock_quality TEXT NOT NULL,causal_metadata TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,sync_state TEXT NOT NULL,UNIQUE(origin_node,local_sequence));
    CREATE INDEX IF NOT EXISTS mutation_sync_idx ON mutation(sync_state,local_sequence);
    CREATE TABLE IF NOT EXISTS conflict(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,state TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT);
    CREATE TABLE IF NOT EXISTS evidence_debt(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(incident_id) REFERENCES incident(id));
    CREATE INDEX IF NOT EXISTS evidence_debt_incident_idx ON evidence_debt(incident_id,state,updated_at);
    CREATE TABLE IF NOT EXISTS truth_edge(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,from_id TEXT NOT NULL,to_id TEXT NOT NULL,relation TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sync_queue(id TEXT PRIMARY KEY,mutation_id TEXT NOT NULL UNIQUE,priority TEXT NOT NULL,payload_bytes INTEGER NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(mutation_id) REFERENCES mutation(id));
    CREATE TABLE IF NOT EXISTS mutation_compaction_checkpoint(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,previous_hash TEXT,payload_hash TEXT NOT NULL,record_hash TEXT NOT NULL,first_local_sequence INTEGER NOT NULL,last_local_sequence INTEGER NOT NULL,mutation_count INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,incident_id TEXT,record_type TEXT NOT NULL,actor TEXT NOT NULL,payload_hash TEXT NOT NULL,previous_hash TEXT,record_hash TEXT NOT NULL,created_at TEXT NOT NULL);
  `);
  const mutationColumns = new Set(db.prepare('PRAGMA table_info(mutation)').all().map((column) => column.name));
  if (!mutationColumns.has('priority')) db.exec("ALTER TABLE mutation ADD COLUMN priority TEXT NOT NULL DEFAULT 'P3_TASK'");
  const acknowledgementColumns = new Set(db.prepare('PRAGMA table_info(acknowledgement)').all().map((column) => column.name));
  if (!acknowledgementColumns.has('payload')) db.exec('ALTER TABLE acknowledgement ADD COLUMN payload TEXT');
  db.exec("UPDATE mutation SET priority=(SELECT priority FROM sync_queue WHERE mutation_id=mutation.id) WHERE EXISTS (SELECT 1 FROM sync_queue WHERE mutation_id=mutation.id); UPDATE mutation SET priority='P3_TASK' WHERE type IN ('INCIDENT_PACKAGE_IMPORTED','INCIDENT_PACKAGE_UPDATED'); UPDATE mutation SET priority='P1_COMMAND' WHERE type IN ('COMMAND_SURVIVAL_EVENT','CONFLICT_CREATED','CONFLICT_RESOLVED','LOCAL_ALERT_ACKNOWLEDGED');");
  db.prepare(`UPDATE mutation SET priority='P0_LIFE_SAFETY' WHERE type='COMMAND_SURVIVAL_EVENT' AND json_extract(payload,'$.event.type') IN (${LIFE_SAFETY_INCIDENT_COMMAND_TYPES.map(() => '?').join(',')})`).run(...LIFE_SAFETY_INCIDENT_COMMAND_TYPES);
  db.exec('UPDATE sync_queue SET priority=(SELECT priority FROM mutation WHERE mutation.id=sync_queue.mutation_id) WHERE EXISTS (SELECT 1 FROM mutation WHERE mutation.id=sync_queue.mutation_id);');
  const recoveredAt = clock().toISOString();
  db.prepare("UPDATE sync_queue SET state='RETRY_EXHAUSTED',next_attempt_at=COALESCE(next_attempt_at,?),updated_at=? WHERE state='FAILED'").run(recoveredAt, recoveredAt);
  if (!getMeta('connection_state')) setMeta('connection_state', 'REGIONAL_DISCONNECTED');
  if (!getMeta('sync_cursor')) setMeta('sync_cursor', '0');
  if (!getMeta('local_sequence')) setMeta('local_sequence', String(db.prepare('SELECT COALESCE(max(local_sequence),0) value FROM mutation WHERE origin_node=?').get(nodeId).value));
}
