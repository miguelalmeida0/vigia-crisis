CREATE TABLE IF NOT EXISTS evidence_need (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  missing_quantity text NOT NULL,
  reason text,
  state text NOT NULL,
  owner_id text,
  evidence_request_id text,
  selected_method_id text,
  next_observation_at timestamptz,
  candidate_methods jsonb NOT NULL DEFAULT '[]',
  ranking jsonb NOT NULL DEFAULT '{}',
  service_level jsonb,
  escalation_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_need_subject_idx ON evidence_need(subject_type, subject_id, state);
CREATE INDEX IF NOT EXISTS evidence_need_owner_idx ON evidence_need(owner_id, state);

CREATE TABLE IF NOT EXISTS evidence_request (
  id text PRIMARY KEY,
  evidence_need_id text,
  target_type text NOT NULL,
  target_id text NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  owner_id text,
  requested_by text,
  priority text,
  position geography(Point, 4326),
  due_at timestamptz,
  acknowledgement_due_at timestamptz,
  observation_due_at timestamptz,
  requested_method_id text,
  service_level_policy_id text,
  schedule_commitment jsonb,
  requirements jsonb NOT NULL DEFAULT '[]',
  history jsonb NOT NULL DEFAULT '[]',
  escalation jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_request_target_idx ON evidence_request(target_type, target_id, state);
CREATE INDEX IF NOT EXISTS evidence_request_owner_idx ON evidence_request(owner_id, state, due_at);

CREATE TABLE IF NOT EXISTS observation_opportunity (
  id text NOT NULL,
  event_id text NOT NULL,
  source_id text,
  label text NOT NULL,
  kind text NOT NULL,
  method_type text NOT NULL,
  availability text NOT NULL,
  owner_id text,
  scheduled_at timestamptz,
  commitment jsonb,
  coverage jsonb,
  operational_dimensions jsonb NOT NULL DEFAULT '{}',
  limitation text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, event_id)
);
CREATE INDEX IF NOT EXISTS observation_opportunity_event_idx ON observation_opportunity(event_id, availability, scheduled_at);

CREATE TABLE IF NOT EXISTS field_resource (
  id text PRIMARY KEY,
  organization_id text,
  name text NOT NULL,
  resource_type text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]',
  current_availability text NOT NULL,
  last_known_position geography(Point, 4326),
  last_known_at timestamptz,
  shift jsonb,
  owner_id text,
  configuration jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_event_correction (
  id text PRIMARY KEY,
  correction_at timestamptz NOT NULL,
  correction_kind text NOT NULL,
  source_event_id text NOT NULL,
  target_event_id text,
  observation_ids jsonb NOT NULL DEFAULT '[]',
  actor_id text NOT NULL,
  reason text NOT NULL,
  correction jsonb NOT NULL
);

INSERT INTO vigia_schema_migration(version) VALUES ('002-operational-work')
ON CONFLICT (version) DO NOTHING;
