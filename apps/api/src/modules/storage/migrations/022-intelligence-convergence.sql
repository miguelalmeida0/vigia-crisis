CREATE TABLE IF NOT EXISTS intelligence_event (
  event_sequence bigserial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  semantic_identity text NOT NULL UNIQUE,
  incident_id text,
  event_type text NOT NULL,
  effective_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$'),
  rights jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intelligence_event_incident_sequence_idx ON intelligence_event(incident_id, event_sequence);

CREATE TABLE IF NOT EXISTS intelligence_object (
  object_kind text NOT NULL,
  object_id text NOT NULL,
  incident_id text,
  schema_version text NOT NULL,
  semantic_identity text NOT NULL UNIQUE,
  revision bigint NOT NULL CHECK (revision > 0),
  knowledge_time timestamptz,
  projection_version bigint NOT NULL CHECK (projection_version >= 0),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$'),
  rights jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_kind, object_id)
);
CREATE INDEX IF NOT EXISTS intelligence_object_incident_kind_idx ON intelligence_object(incident_id, object_kind, object_id);
CREATE INDEX IF NOT EXISTS intelligence_object_knowledge_idx ON intelligence_object(knowledge_time, object_kind);

CREATE TABLE IF NOT EXISTS intelligence_lineage_edge (
  parent_kind text NOT NULL,
  parent_id text NOT NULL,
  child_kind text NOT NULL,
  child_id text NOT NULL,
  relationship text NOT NULL,
  rights jsonb NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_kind, parent_id, child_kind, child_id, relationship),
  FOREIGN KEY (parent_kind, parent_id) REFERENCES intelligence_object(object_kind, object_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (child_kind, child_id) REFERENCES intelligence_object(object_kind, object_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS intelligence_projection_state (
  projection_name text PRIMARY KEY,
  projection_version bigint NOT NULL CHECK (projection_version >= 0),
  source_event_sequence bigint NOT NULL CHECK (source_event_sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_projection_row (
  projection_name text NOT NULL,
  row_id text NOT NULL,
  incident_id text,
  projection_version bigint NOT NULL CHECK (projection_version >= 0),
  knowledge_time timestamptz,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$'),
  PRIMARY KEY (projection_name, row_id)
);
CREATE INDEX IF NOT EXISTS intelligence_projection_query_idx ON intelligence_projection_row(projection_name, incident_id, row_id);

CREATE TABLE IF NOT EXISTS crisis_decision_packet (
  packet_fingerprint text PRIMARY KEY,
  incident_id text NOT NULL,
  knowledge_time timestamptz NOT NULL,
  schema_version text NOT NULL,
  projection_version bigint NOT NULL CHECK (projection_version >= 0),
  proof_fingerprint text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crisis_decision_packet_incident_time_idx ON crisis_decision_packet(incident_id, knowledge_time DESC);

CREATE TABLE IF NOT EXISTS intelligence_receipt (
  receipt_id text PRIMARY KEY,
  incident_id text,
  action_id text,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospective_archive_snapshot (
  snapshot_fingerprint text PRIMARY KEY,
  manifest_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  incident_id text NOT NULL,
  provider_id text NOT NULL,
  product_id text NOT NULL,
  provider_published_at timestamptz,
  vigia_received_at timestamptz NOT NULL,
  raw_object_reference text NOT NULL,
  raw_object_hash text NOT NULL CHECK (raw_object_hash ~ '^(sha256:)?[a-f0-9]{64}$'),
  previous_snapshot_fingerprint text REFERENCES prospective_archive_snapshot(snapshot_fingerprint),
  footprint geometry(Geometry, 4326),
  rights jsonb NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (manifest_id, sequence),
  UNIQUE (manifest_id, provider_id, product_id, raw_object_hash)
);
CREATE INDEX IF NOT EXISTS prospective_archive_incident_time_idx ON prospective_archive_snapshot(incident_id, vigia_received_at DESC);
CREATE INDEX IF NOT EXISTS prospective_archive_footprint_gix ON prospective_archive_snapshot USING gist(footprint);

CREATE TABLE IF NOT EXISTS decision_outcome_ledger (
  outcome_id text PRIMARY KEY,
  packet_fingerprint text NOT NULL REFERENCES crisis_decision_packet(packet_fingerprint),
  incident_id text NOT NULL,
  decision_time timestamptz NOT NULL,
  adjudicated_at timestamptz,
  projection_version bigint NOT NULL CHECK (projection_version >= 0),
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS information_value_outcome (
  outcome_id text PRIMARY KEY,
  acquisition_id text NOT NULL UNIQUE,
  incident_id text NOT NULL,
  provider_id text NOT NULL,
  acquisition_type text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-z0-9-]+:sha256:[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
