CREATE TABLE IF NOT EXISTS vigia_capacity_counter (
  ledger text NOT NULL,
  scope_kind text NOT NULL,
  scope_id text NOT NULL,
  rows bigint NOT NULL DEFAULT 0 CHECK (rows >= 0),
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger, scope_kind, scope_id)
);

CREATE TABLE IF NOT EXISTS vigia_release_deployment_identity (
  singleton text PRIMARY KEY CHECK (singleton = 'current'),
  release_id text NOT NULL,
  code_state_hash text NOT NULL CHECK (code_state_hash ~ '^sha256:[a-f0-9]{64}$'),
  migration_head text NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS operator_intelligence_decision_principal_idx
  ON operator_intelligence_decision(principal_id, created_at DESC, decision_id DESC);
CREATE INDEX IF NOT EXISTS incident_command_event_actor_idx
  ON incident_command_event(actor_id, received_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS incident_command_offline_receipt_node_idx
  ON incident_command_offline_receipt(origin_node, received_at DESC, mutation_id DESC);

INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
VALUES
  ('intelligence_snapshot','global','*',0,0),
  ('operator_intelligence_decision','global','*',0,0),
  ('incident_command_event','global','*',0,0),
  ('incident_command_offline_receipt','global','*',0,0)
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;

INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'intelligence_snapshot','incident',incident_id,count(*)::bigint,COALESCE(sum(octet_length(state::text)),0)::bigint
FROM intelligence_snapshot GROUP BY incident_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
UPDATE vigia_capacity_counter SET
  rows=(SELECT count(*)::bigint FROM intelligence_snapshot),
  bytes=(SELECT COALESCE(sum(octet_length(state::text)),0)::bigint FROM intelligence_snapshot),
  updated_at=now()
WHERE ledger='intelligence_snapshot' AND scope_kind='global' AND scope_id='*';

INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'operator_intelligence_decision','incident',incident_id,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(d)::text)),0)::bigint
FROM operator_intelligence_decision d GROUP BY incident_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'operator_intelligence_decision','principal',principal_id,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(d)::text)),0)::bigint
FROM operator_intelligence_decision d GROUP BY principal_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
UPDATE vigia_capacity_counter SET
  rows=(SELECT count(*)::bigint FROM operator_intelligence_decision),
  bytes=(SELECT COALESCE(sum(octet_length(to_jsonb(d)::text)),0)::bigint FROM operator_intelligence_decision d),
  updated_at=now()
WHERE ledger='operator_intelligence_decision' AND scope_kind='global' AND scope_id='*';

INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'incident_command_event','incident',incident_id,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(e)::text)),0)::bigint
FROM incident_command_event e GROUP BY incident_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'incident_command_event','actor',actor_id,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(e)::text)),0)::bigint
FROM incident_command_event e GROUP BY actor_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
UPDATE vigia_capacity_counter SET
  rows=(SELECT count(*)::bigint FROM incident_command_event),
  bytes=(SELECT COALESCE(sum(octet_length(to_jsonb(e)::text)),0)::bigint FROM incident_command_event e),
  updated_at=now()
WHERE ledger='incident_command_event' AND scope_kind='global' AND scope_id='*';

INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'incident_command_offline_receipt','incident',incident_id,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(r)::text)),0)::bigint
FROM incident_command_offline_receipt r GROUP BY incident_id
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes)
SELECT 'incident_command_offline_receipt','node',origin_node,count(*)::bigint,COALESCE(sum(octet_length(to_jsonb(r)::text)),0)::bigint
FROM incident_command_offline_receipt r GROUP BY origin_node
ON CONFLICT (ledger,scope_kind,scope_id) DO NOTHING;
UPDATE vigia_capacity_counter SET
  rows=(SELECT count(*)::bigint FROM incident_command_offline_receipt),
  bytes=(SELECT COALESCE(sum(octet_length(to_jsonb(r)::text)),0)::bigint FROM incident_command_offline_receipt r),
  updated_at=now()
WHERE ledger='incident_command_offline_receipt' AND scope_kind='global' AND scope_id='*';

CREATE OR REPLACE FUNCTION vigia_increment_capacity_counter() RETURNS trigger AS $$
DECLARE
  counter_bytes bigint;
  secondary_kind text;
  secondary_id text;
BEGIN
  IF TG_TABLE_NAME = 'intelligence_snapshot' THEN
    counter_bytes := octet_length(NEW.state::text);
    secondary_kind := 'incident'; secondary_id := NEW.incident_id;
  ELSIF TG_TABLE_NAME = 'operator_intelligence_decision' THEN
    counter_bytes := octet_length(to_jsonb(NEW)::text);
    secondary_kind := 'incident'; secondary_id := NEW.incident_id;
  ELSIF TG_TABLE_NAME = 'incident_command_event' THEN
    counter_bytes := octet_length(to_jsonb(NEW)::text);
    secondary_kind := 'incident'; secondary_id := NEW.incident_id;
  ELSIF TG_TABLE_NAME = 'incident_command_offline_receipt' THEN
    counter_bytes := octet_length(to_jsonb(NEW)::text);
    secondary_kind := 'incident'; secondary_id := NEW.incident_id;
  ELSE
    RAISE EXCEPTION 'unsupported_capacity_ledger:%', TG_TABLE_NAME;
  END IF;

  INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes,updated_at)
  VALUES(TG_TABLE_NAME,'global','*',1,counter_bytes,now()),(TG_TABLE_NAME,secondary_kind,secondary_id,1,counter_bytes,now())
  ON CONFLICT (ledger,scope_kind,scope_id) DO UPDATE SET rows=vigia_capacity_counter.rows+1,bytes=vigia_capacity_counter.bytes+excluded.bytes,updated_at=excluded.updated_at;

  IF TG_TABLE_NAME = 'operator_intelligence_decision' THEN
    INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes,updated_at)
    VALUES(TG_TABLE_NAME,'principal',NEW.principal_id,1,counter_bytes,now())
    ON CONFLICT (ledger,scope_kind,scope_id) DO UPDATE SET rows=vigia_capacity_counter.rows+1,bytes=vigia_capacity_counter.bytes+excluded.bytes,updated_at=excluded.updated_at;
  ELSIF TG_TABLE_NAME = 'incident_command_event' THEN
    INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes,updated_at)
    VALUES(TG_TABLE_NAME,'actor',NEW.actor_id,1,counter_bytes,now())
    ON CONFLICT (ledger,scope_kind,scope_id) DO UPDATE SET rows=vigia_capacity_counter.rows+1,bytes=vigia_capacity_counter.bytes+excluded.bytes,updated_at=excluded.updated_at;
  ELSIF TG_TABLE_NAME = 'incident_command_offline_receipt' THEN
    INSERT INTO vigia_capacity_counter(ledger,scope_kind,scope_id,rows,bytes,updated_at)
    VALUES(TG_TABLE_NAME,'node',NEW.origin_node,1,counter_bytes,now())
    ON CONFLICT (ledger,scope_kind,scope_id) DO UPDATE SET rows=vigia_capacity_counter.rows+1,bytes=vigia_capacity_counter.bytes+excluded.bytes,updated_at=excluded.updated_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS intelligence_snapshot_capacity_counter ON intelligence_snapshot;
CREATE TRIGGER intelligence_snapshot_capacity_counter AFTER INSERT ON intelligence_snapshot FOR EACH ROW EXECUTE FUNCTION vigia_increment_capacity_counter();
DROP TRIGGER IF EXISTS operator_intelligence_decision_capacity_counter ON operator_intelligence_decision;
CREATE TRIGGER operator_intelligence_decision_capacity_counter AFTER INSERT ON operator_intelligence_decision FOR EACH ROW EXECUTE FUNCTION vigia_increment_capacity_counter();
DROP TRIGGER IF EXISTS incident_command_event_capacity_counter ON incident_command_event;
CREATE TRIGGER incident_command_event_capacity_counter AFTER INSERT ON incident_command_event FOR EACH ROW EXECUTE FUNCTION vigia_increment_capacity_counter();
DROP TRIGGER IF EXISTS incident_command_offline_receipt_capacity_counter ON incident_command_offline_receipt;
CREATE TRIGGER incident_command_offline_receipt_capacity_counter AFTER INSERT ON incident_command_offline_receipt FOR EACH ROW EXECUTE FUNCTION vigia_increment_capacity_counter();
