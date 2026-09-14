CREATE TABLE IF NOT EXISTS incident_situation_snapshot (
 capture_sequence bigint GENERATED ALWAYS AS IDENTITY,
 id text PRIMARY KEY, incident_id text NOT NULL, known_at timestamptz NOT NULL,
 content_hash text NOT NULL, universe text NOT NULL CHECK (universe IN ('OPERATIONAL','CONTROLLED_TEST')),
 payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_situation_time ON incident_situation_snapshot(incident_id,known_at DESC);
CREATE TABLE IF NOT EXISTS incident_situation_dependency (
 snapshot_id text NOT NULL REFERENCES incident_situation_snapshot(id), incident_id text NOT NULL,
 dependency_id text NOT NULL, relationship_id text NOT NULL, kind text NOT NULL,
 PRIMARY KEY(snapshot_id,dependency_id,relationship_id)
);
CREATE INDEX IF NOT EXISTS incident_situation_dependency_subject ON incident_situation_dependency(dependency_id,incident_id);
CREATE TABLE IF NOT EXISTS incident_situation_job (
 incident_id text PRIMARY KEY, revision text NOT NULL, payload jsonb NOT NULL,
 due_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, last_error text
);
CREATE TABLE IF NOT EXISTS incident_situation_document (
 id text PRIMARY KEY, incident_id text NOT NULL, known_at timestamptz NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_situation_document_incident ON incident_situation_document(incident_id,known_at DESC);
CREATE TABLE IF NOT EXISTS incident_situation_admission (
 id text PRIMARY KEY, incident_id text NOT NULL, document_id text NOT NULL REFERENCES incident_situation_document(id),
 known_at timestamptz NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_situation_admission_incident ON incident_situation_admission(incident_id,known_at DESC);
