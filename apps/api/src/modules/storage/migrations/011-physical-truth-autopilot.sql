CREATE TABLE IF NOT EXISTS fire_truth_state (
  id text PRIMARY KEY, event_id text NOT NULL, evidence_version text NOT NULL, confirmation_state text NOT NULL,
  payload jsonb NOT NULL, computed_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS fire_truth_state_event_idx ON fire_truth_state(event_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS next_best_evidence_decision (
  id text PRIMARY KEY, event_id text NOT NULL, truth_state_id text NOT NULL, selected_path_id text,
  payload jsonb NOT NULL, decided_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS next_best_evidence_event_idx ON next_best_evidence_decision(event_id, decided_at DESC);

CREATE TABLE IF NOT EXISTS evidence_race (
  id text PRIMARY KEY, event_id text NOT NULL, truth_state_id text NOT NULL, state text NOT NULL, winner_path_id text,
  payload jsonb NOT NULL, started_at timestamptz NOT NULL, settled_at timestamptz, updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_race_event_idx ON evidence_race(event_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS operational_latency_stage (
  id bigserial PRIMARY KEY, event_id text NOT NULL, observation_id text, stage_name text NOT NULL,
  duration_ms bigint, state text NOT NULL, from_at timestamptz, until_at timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL, UNIQUE(event_id, observation_id, stage_name, until_at)
);
CREATE INDEX IF NOT EXISTS operational_latency_stage_event_idx ON operational_latency_stage(event_id, recorded_at DESC);
