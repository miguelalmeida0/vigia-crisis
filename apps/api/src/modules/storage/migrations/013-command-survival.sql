CREATE TABLE IF NOT EXISTS incident_command_snapshot (
  incident_id text PRIMARY KEY,
  version bigint NOT NULL CHECK (version >= 0),
  exercise boolean NOT NULL DEFAULT false,
  canonical_event_ids text[] NOT NULL DEFAULT '{}',
  last_event_hash text,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS incident_command_event (
  incident_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  source text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  previous_hash text,
  record_hash text NOT NULL UNIQUE,
  release_id text NOT NULL,
  exercise boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (incident_id, sequence)
);

CREATE INDEX IF NOT EXISTS incident_command_event_time_idx ON incident_command_event(incident_id,occurred_at,sequence);
CREATE INDEX IF NOT EXISTS incident_command_event_type_idx ON incident_command_event(event_type,received_at DESC);

CREATE TABLE IF NOT EXISTS incident_command_import (
  import_id text PRIMARY KEY,
  incident_id text NOT NULL,
  source_system text NOT NULL,
  adapter text NOT NULL,
  universe text NOT NULL CHECK (universe IN ('PRODUCTION','SHADOW')),
  source_payload_hash text NOT NULL,
  canonical_event_ids text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('ACCEPTED','REJECTED')),
  rejection_reason text,
  received_at timestamptz NOT NULL,
  UNIQUE(source_system,source_payload_hash)
);

CREATE TABLE IF NOT EXISTS incident_command_offline_receipt (
  mutation_id text PRIMARY KEY,
  incident_id text NOT NULL,
  origin_node text NOT NULL,
  local_sequence bigint NOT NULL,
  payload_hash text NOT NULL,
  central_event_id text,
  state text NOT NULL CHECK (state IN ('RECEIVED','APPLIED','DUPLICATE','CONFLICTED')),
  conflict_reason text,
  received_at timestamptz NOT NULL,
  UNIQUE(origin_node,local_sequence)
);
