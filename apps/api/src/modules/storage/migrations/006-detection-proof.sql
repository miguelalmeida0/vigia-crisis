ALTER TABLE fire_event ADD COLUMN IF NOT EXISTS created_at timestamptz;
UPDATE fire_event SET created_at = updated_at WHERE created_at IS NULL;
ALTER TABLE fire_event ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE fire_event ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS fire_event_created_at_idx ON fire_event(created_at DESC);

CREATE TABLE IF NOT EXISTS prospective_detection_capture (
  event_id text PRIMARY KEY REFERENCES fire_event(id) ON DELETE CASCADE,
  provider_product_id text,
  source_family text,
  provider_observation_at timestamptz NOT NULL,
  provider_availability_at timestamptz,
  vigia_acquired_at timestamptz,
  parse_complete_at timestamptz,
  observation_persisted_at timestamptz,
  candidate_decision_at timestamptz,
  event_created_at timestamptz,
  ui_available_at timestamptz,
  first_report_at timestamptz,
  second_physical_family_at timestamptz,
  operator_acknowledged_at timestamptz,
  policy_version text,
  threshold_version text,
  decision text,
  timing jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospective_detection_observation_idx ON prospective_detection_capture(provider_observation_at DESC);

UPDATE physical_observation observation
SET received_at = product.received_at
FROM raw_source_product product
WHERE observation.raw_source_product_id = product.id
  AND observation.source_family IN ('viirs', 'sentinel3_slstr')
  AND observation.received_at IS DISTINCT FROM product.received_at;
