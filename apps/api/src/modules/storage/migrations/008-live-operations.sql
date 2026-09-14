CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS monitored_territory (
  id text PRIMARY KEY,
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'SHADOW',
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  administrative_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_actor_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitored_territory_geometry_gix ON monitored_territory USING gist (geometry);

CREATE TABLE IF NOT EXISTS monitored_zone (
  id text PRIMARY KEY,
  territory_id text NOT NULL REFERENCES monitored_territory(id) ON DELETE CASCADE,
  name text NOT NULL,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  source text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitored_zone_geometry_gix ON monitored_zone USING gist (geometry);

CREATE TABLE IF NOT EXISTS monitored_asset_group (
  id text PRIMARY KEY,
  territory_id text NOT NULL REFERENCES monitored_territory(id) ON DELETE CASCADE,
  name text NOT NULL,
  asset_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS monitored_asset (
  id text PRIMARY KEY,
  territory_id text NOT NULL REFERENCES monitored_territory(id) ON DELETE CASCADE,
  group_id text REFERENCES monitored_asset_group(id) ON DELETE SET NULL,
  name text NOT NULL,
  asset_type text NOT NULL,
  geometry geometry(Geometry, 4326) NOT NULL,
  source text NOT NULL,
  source_id text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitored_asset_geometry_gix ON monitored_asset USING gist (geometry);

CREATE TABLE IF NOT EXISTS territory_alert_policy (
  territory_id text NOT NULL REFERENCES monitored_territory(id) ON DELETE CASCADE,
  policy_id text NOT NULL,
  policy_version integer NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  radius_meters integer NOT NULL DEFAULT 5000 CHECK (radius_meters >= 0),
  channels jsonb NOT NULL DEFAULT '["IN_APP","BROWSER_NOTIFICATION"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (territory_id, policy_id)
);

CREATE TABLE IF NOT EXISTS operational_alert (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  canonical_event_id text,
  territory_id text REFERENCES monitored_territory(id) ON DELETE SET NULL,
  policy_id text NOT NULL,
  policy_version integer NOT NULL,
  alert_type text NOT NULL,
  evidence_version text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  material_key text NOT NULL,
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('CANDIDATE','OPEN','ACKNOWLEDGED','OWNED','ESCALATED','SUPPRESSED','RESOLVED','FAILED')),
  priority text NOT NULL,
  title text NOT NULL,
  reason_code text NOT NULL,
  physical_state text,
  freshness text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL,
  acknowledge_due_at timestamptz,
  escalate_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by text,
  owner_actor_id text,
  suppression_until timestamptz,
  resolution_code text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_alert_active_idx ON operational_alert (lifecycle_state, priority, opened_at DESC);
CREATE INDEX IF NOT EXISTS operational_alert_event_idx ON operational_alert (canonical_event_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS alert_policy_decision (
  id text PRIMARY KEY,
  canonical_event_id text NOT NULL,
  policy_id text NOT NULL,
  policy_version integer NOT NULL,
  evidence_version text NOT NULL,
  fired boolean NOT NULL,
  reason_code text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (canonical_event_id, policy_id, policy_version, evidence_version)
);

CREATE TABLE IF NOT EXISTS alert_recipient (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES operational_alert(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  channel text NOT NULL,
  escalation_level integer NOT NULL DEFAULT 0,
  routing_reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, actor_id, channel, escalation_level)
);

CREATE TABLE IF NOT EXISTS alert_delivery_outbox (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES operational_alert(id) ON DELETE CASCADE,
  recipient_id text NOT NULL REFERENCES alert_recipient(id) ON DELETE CASCADE,
  evidence_version text NOT NULL,
  channel text NOT NULL,
  state text NOT NULL CHECK (state IN ('PENDING','ATTEMPTING','DELIVERED','RETRY_WAIT','FAILED','CONFIGURED_OFF')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  provider_reference text,
  provider_response jsonb,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, recipient_id, evidence_version, channel)
);
CREATE INDEX IF NOT EXISTS alert_delivery_due_idx ON alert_delivery_outbox (state, next_attempt_at);

CREATE TABLE IF NOT EXISTS alert_acknowledgement (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES operational_alert(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('ACKNOWLEDGED','OWNED','REASSIGNED')),
  actor_id text NOT NULL,
  prior_owner_actor_id text,
  owner_actor_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_escalation (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES operational_alert(id) ON DELETE CASCADE,
  level integer NOT NULL,
  state text NOT NULL CHECK (state IN ('DUE','ESCALATED','EXHAUSTED')),
  from_actor_id text,
  to_actor_id text,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alert_id, level)
);

CREATE TABLE IF NOT EXISTS alert_resolution (
  id text PRIMARY KEY,
  alert_id text NOT NULL REFERENCES operational_alert(id) ON DELETE CASCADE,
  resolution_code text NOT NULL,
  actor_id text NOT NULL,
  note text,
  evidence_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operational_observation_opportunity (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  source_family text NOT NULL,
  platform text NOT NULL,
  window_start timestamptz,
  window_end timestamptz,
  opportunity_type text NOT NULL CHECK (opportunity_type IN ('PREDICTED_PASS','CONFIRMED_PROVIDER_PRODUCT','EXPECTED_CADENCE','FIELD_CAPACITY','UNKNOWN')),
  authority text NOT NULL,
  coverage_assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_dependencies jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocker_reason text,
  calculation_version text NOT NULL,
  can_close_evidence_need boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_opportunity_event_idx ON operational_observation_opportunity (event_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS evidence_opportunity_result (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES operational_observation_opportunity(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  evidence_need_id text,
  result_state text NOT NULL,
  attributable_observation_id text,
  reason_code text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS evidence_opportunity_result_dedupe_idx ON evidence_opportunity_result(opportunity_id, attributable_observation_id, result_state);

CREATE TABLE IF NOT EXISTS operations_audit_record (
  id text PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  action text NOT NULL,
  actor_id text NOT NULL,
  previous_hash text,
  record_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);
ALTER TABLE operations_audit_record ADD COLUMN IF NOT EXISTS sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS operations_audit_aggregate_idx ON operations_audit_record (aggregate_type, aggregate_id, created_at);

CREATE TABLE IF NOT EXISTS operations_metric_event (
  id text PRIMARY KEY,
  trace_id text,
  event_id text,
  alert_id text,
  metric_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  value_ms bigint,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_metric_name_idx ON operations_metric_event (metric_name, occurred_at DESC);
