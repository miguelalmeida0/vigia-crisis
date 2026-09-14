CREATE TABLE IF NOT EXISTS operations_actor_roster (
  actor_id text PRIMARY KEY,
  display_name text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('OPERATOR','SUPERVISOR','PREVENTION_REVIEWER','ADMIN')),
  availability text NOT NULL CHECK (availability IN ('AVAILABLE','UNAVAILABLE')),
  channels jsonb NOT NULL DEFAULT '["IN_APP","BROWSER_NOTIFICATION"]'::jsonb,
  identity_scope text NOT NULL DEFAULT 'SHADOW' CHECK (identity_scope = 'SHADOW'),
  source text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  shift_start timestamptz,
  shift_end timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_actor_roster_availability_idx ON operations_actor_roster (active, availability, actor_role);

CREATE TABLE IF NOT EXISTS operations_territory_assignment (
  territory_id text NOT NULL REFERENCES monitored_territory(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES operations_actor_roster(actor_id) ON DELETE CASCADE,
  assignment_role text NOT NULL,
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (territory_id, actor_id, escalation_level)
);
CREATE INDEX IF NOT EXISTS operations_territory_assignment_lookup_idx ON operations_territory_assignment (territory_id, active, escalation_level);

CREATE INDEX IF NOT EXISTS evidence_opportunity_result_event_state_idx ON evidence_opportunity_result (event_id, result_state, created_at DESC);
CREATE INDEX IF NOT EXISTS operations_metric_event_trace_idx ON operations_metric_event (trace_id, occurred_at DESC) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operational_alert_territory_state_idx ON operational_alert (territory_id, lifecycle_state, opened_at DESC);

ALTER TABLE operational_observation_opportunity DROP CONSTRAINT IF EXISTS operational_observation_opportunity_opportunity_type_check;
ALTER TABLE operational_observation_opportunity ADD CONSTRAINT operational_observation_opportunity_opportunity_type_check
  CHECK (opportunity_type IN ('PREDICTED_PASS','PREDICTED_ORBITAL_PASS','CONFIRMED_PROVIDER_PRODUCT','EXPECTED_CADENCE','FIELD_CAPACITY','UNKNOWN'));

CREATE OR REPLACE VIEW operational_alert_status_projection AS
SELECT
  a.id,
  a.canonical_event_id,
  a.territory_id,
  a.alert_type,
  a.lifecycle_state,
  a.priority,
  a.title,
  a.reason_code,
  a.physical_state,
  a.freshness,
  a.owner_actor_id,
  a.acknowledged_at,
  a.acknowledged_by,
  a.resolution_code,
  a.resolved_at,
  a.opened_at,
  a.acknowledge_due_at,
  a.escalate_at,
  a.payload->'priorityDecision' AS priority_decision,
  COALESCE(delivery.total, 0)::integer AS delivery_count,
  COALESCE(delivery.pending, 0)::integer AS pending_delivery_count,
  COALESCE(delivery.failed, 0)::integer AS failed_delivery_count,
  COALESCE(escalation.level, 0)::integer AS escalation_level,
  escalation.reason_code AS escalation_reason,
  CASE
    WHEN a.lifecycle_state = 'RESOLVED' THEN 'RESOLVED'
    WHEN a.lifecycle_state = 'SUPPRESSED' THEN 'SUPPRESSED'
    WHEN COALESCE(delivery.failed, 0) > 0 THEN 'DELIVERY_DEGRADED'
    WHEN a.acknowledged_at IS NULL AND a.escalate_at <= now() THEN 'ESCALATION_DUE'
    WHEN a.acknowledged_at IS NULL THEN 'AWAITING_ACKNOWLEDGEMENT'
    WHEN a.owner_actor_id IS NULL THEN 'ACKNOWLEDGED_UNOWNED'
    ELSE 'OWNED_ACTIVE'
  END AS operational_status
FROM operational_alert a
LEFT JOIN LATERAL (
  SELECT count(*) total,
    count(*) FILTER (WHERE state IN ('PENDING','ATTEMPTING','RETRY_WAIT')) pending,
    count(*) FILTER (WHERE state = 'FAILED') failed
  FROM alert_delivery_outbox d WHERE d.alert_id = a.id
) delivery ON true
LEFT JOIN LATERAL (
  SELECT e.level,e.reason_code FROM alert_escalation e WHERE e.alert_id = a.id ORDER BY e.level DESC LIMIT 1
) escalation ON true;
