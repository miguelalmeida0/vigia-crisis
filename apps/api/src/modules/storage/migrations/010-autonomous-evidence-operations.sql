CREATE TABLE IF NOT EXISTS evidence_closure_plan (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  unknown_code text NOT NULL,
  unknown_description text NOT NULL,
  closure_contract jsonb NOT NULL,
  acceptable_evidence_families text[] NOT NULL,
  preferred_next_family text,
  selected_opportunity_id text REFERENCES operational_observation_opportunity(id) ON DELETE SET NULL,
  source_watch_id text,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('UNKNOWN_IDENTIFIED','PLAN_CREATED','OPPORTUNITY_SELECTED','WATCH_ARMED','EVIDENCE_ARRIVES','ASSOCIATED','DOMAIN_RECOMPUTED','UNKNOWN_CLOSED','UNKNOWN_PRESERVED')),
  current_evidence_version text NOT NULL,
  resolution_state text NOT NULL CHECK (resolution_state IN ('OPEN','CLOSED','PRESERVED')),
  result_state text CHECK (result_state IN ('CORROBORATED','VALID_OPPORTUNITY_NO_SIGNAL','QUALITY_UNUSABLE','NO_COVERAGE','AMBIGUOUS','SOURCE_FAILURE','EXPIRED','STILL_UNKNOWN')),
  result_reason text,
  deadline_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz,
  UNIQUE (subject_type, subject_id, unknown_code, current_evidence_version)
);
CREATE INDEX IF NOT EXISTS evidence_closure_plan_active_idx ON evidence_closure_plan (resolution_state, deadline_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS evidence_source_watch (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES evidence_closure_plan(id) ON DELETE CASCADE,
  source_family text NOT NULL,
  opportunity_id text REFERENCES operational_observation_opportunity(id) ON DELETE SET NULL,
  state text NOT NULL CHECK (state IN ('ARMED','SATISFIED','EXPIRED','CANCELLED')),
  armed_at timestamptz NOT NULL,
  watch_from timestamptz,
  watch_until timestamptz NOT NULL,
  satisfied_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL,
  UNIQUE (plan_id, source_family, opportunity_id)
);
CREATE INDEX IF NOT EXISTS evidence_source_watch_due_idx ON evidence_source_watch (state, watch_until);

CREATE TABLE IF NOT EXISTS incident_decision_ledger (
  id text PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  plan_id text REFERENCES evidence_closure_plan(id) ON DELETE SET NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('ALERT_OPENED','ALERT_UPDATED','EVIDENCE_PLAN_CREATED','OPPORTUNITY_SELECTED','WATCH_ARMED','EVIDENCE_ASSOCIATED','UNKNOWN_CLOSED','UNKNOWN_PRESERVED','PREVENTION_REVIEW_ACCEPTED','PREVENTION_REVIEW_REJECTED','COVERAGE_GAP_IDENTIFIED')),
  evidence_version text,
  actor_id text NOT NULL,
  reason_code text NOT NULL,
  previous_hash text,
  record_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS incident_decision_ledger_subject_idx ON incident_decision_ledger (subject_type, subject_id, created_at, id);

CREATE TABLE IF NOT EXISTS coverage_region (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  label text NOT NULL,
  geometry geometry(Geometry, 4326),
  authority text NOT NULL,
  calculation_version text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS coverage_region_geometry_gix ON coverage_region USING gist (geometry);

CREATE TABLE IF NOT EXISTS coverage_cell (
  id text PRIMARY KEY,
  region_id text NOT NULL REFERENCES coverage_region(id) ON DELETE CASCADE,
  cell_key text NOT NULL,
  geometry geometry(Geometry, 4326),
  coverage_state text NOT NULL CHECK (coverage_state IN ('OBSERVED','PLANNED','GAP','UNKNOWN')),
  source_families text[] NOT NULL DEFAULT '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL,
  UNIQUE (region_id, cell_key)
);
CREATE INDEX IF NOT EXISTS coverage_cell_geometry_gix ON coverage_cell USING gist (geometry);

CREATE TABLE IF NOT EXISTS coverage_window (
  id text PRIMARY KEY,
  region_id text NOT NULL REFERENCES coverage_region(id) ON DELETE CASCADE,
  source_family text NOT NULL,
  opportunity_id text REFERENCES operational_observation_opportunity(id) ON DELETE SET NULL,
  opportunity_type text NOT NULL CHECK (opportunity_type IN ('PREDICTED_ORBITAL_PASS','EXPECTED_CADENCE','CONFIRMED_PROVIDER_PRODUCT','UNKNOWN')),
  window_start timestamptz,
  window_end timestamptz,
  geometry geometry(Geometry, 4326),
  authority text NOT NULL,
  orbit_source text,
  calculation_version text NOT NULL,
  uncertainty jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS coverage_window_active_idx ON coverage_window (region_id, expires_at, window_start);
CREATE INDEX IF NOT EXISTS coverage_window_geometry_gix ON coverage_window USING gist (geometry);

CREATE TABLE IF NOT EXISTS coverage_gap (
  id text PRIMARY KEY,
  region_id text NOT NULL REFERENCES coverage_region(id) ON DELETE CASCADE,
  horizon text NOT NULL CHECK (horizon IN ('NOW','NEXT_30_MIN','NEXT_3_HOURS','NEXT_12_HOURS')),
  reason_code text NOT NULL,
  geometry geometry(Geometry, 4326),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  identified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS coverage_gap_active_idx ON coverage_gap (region_id, horizon, expires_at);
