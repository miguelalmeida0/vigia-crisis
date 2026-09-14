CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS vigia_schema_migration (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_source_product (
  id text PRIMARY KEY,
  source_id text NOT NULL,
  provider text NOT NULL,
  provider_product_id text,
  request_window jsonb,
  requested_at timestamptz,
  received_at timestamptz NOT NULL,
  source_timestamp timestamptz,
  source_timestamp_range jsonb,
  content_type text NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  object_key text NOT NULL,
  http_status integer NOT NULL,
  acquisition_run_id text NOT NULL,
  parser_version text,
  normalizer_version text,
  processing_state text NOT NULL CHECK (processing_state IN ('received','parsed','ingested','rejected')),
  parser_error text,
  licence_metadata jsonb NOT NULL DEFAULT '{}',
  parsed_at timestamptz,
  ingested_at timestamptz,
  UNIQUE (provider, source_id, checksum_sha256)
);

CREATE TABLE IF NOT EXISTS physical_observation (
  id text PRIMARY KEY,
  observation_type text NOT NULL,
  source text NOT NULL,
  sensed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  position geography(Point, 4326) NOT NULL,
  support_geometry geometry(Geometry, 4326),
  source_family text,
  independence_group text,
  instrument text,
  platform text,
  native_confidence jsonb,
  measurements jsonb NOT NULL DEFAULT '{}',
  quality_flags jsonb NOT NULL DEFAULT '[]',
  raw_source_product_id text NOT NULL REFERENCES raw_source_product(id),
  normalizer_version text,
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS physical_observation_position_gix ON physical_observation USING gist(position);
CREATE INDEX IF NOT EXISTS physical_observation_support_gix ON physical_observation USING gist(support_geometry);
CREATE INDEX IF NOT EXISTS physical_observation_sensed_at_idx ON physical_observation(sensed_at DESC);

CREATE TABLE IF NOT EXISTS fire_event (
  id text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  position geography(Point, 4326) NOT NULL,
  observed_geometry geometry(Geometry, 4326),
  evidence_state text NOT NULL,
  evolution_state text NOT NULL,
  knowledge_state text NOT NULL,
  behavior_state text NOT NULL,
  association_state jsonb NOT NULL DEFAULT '{}',
  derived_state jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fire_event_position_gix ON fire_event USING gist(position);
CREATE INDEX IF NOT EXISTS fire_event_last_seen_at_idx ON fire_event(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS event_observation (
  event_id text NOT NULL REFERENCES fire_event(id),
  observation_id text NOT NULL REFERENCES physical_observation(id),
  association_decision jsonb NOT NULL,
  associated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, observation_id)
);

CREATE TABLE IF NOT EXISTS source_checkpoint (
  source_id text PRIMARY KEY,
  last_product_id text REFERENCES raw_source_product(id),
  cursor timestamptz,
  last_successful_poll_at timestamptz,
  health_state text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provenance_lineage (
  parent_kind text NOT NULL,
  parent_id text NOT NULL,
  child_kind text NOT NULL,
  child_id text NOT NULL,
  relation text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_kind, parent_id, child_kind, child_id, relation)
);

CREATE TABLE IF NOT EXISTS operator_action (
  id text PRIMARY KEY,
  action_at timestamptz NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  previous_hash text NOT NULL,
  action_hash text NOT NULL CHECK (action_hash ~ '^[a-f0-9]{64}$'),
  persisted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_action_entity_idx ON operator_action(entity_type, entity_id, action_at DESC);
CREATE INDEX IF NOT EXISTS operator_action_actor_idx ON operator_action(actor_id, action_at DESC);

INSERT INTO vigia_schema_migration(version) VALUES ('001-physical-truth')
ON CONFLICT (version) DO NOTHING;
