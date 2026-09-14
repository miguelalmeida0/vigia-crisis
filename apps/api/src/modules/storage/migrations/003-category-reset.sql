CREATE TABLE IF NOT EXISTS prevention_finding (
  id text PRIMARY KEY,
  finding_kind text NOT NULL,
  finding_state text NOT NULL,
  calibration_state text NOT NULL,
  geometry geometry(Geometry,4326) NOT NULL,
  position geography(Point,4326) NOT NULL,
  current_observation_id text NOT NULL,
  comparison_observation_id text NOT NULL,
  first_observable_start timestamptz NOT NULL,
  first_observable_end timestamptz NOT NULL,
  measurements jsonb NOT NULL,
  infrastructure_interactions jsonb NOT NULL DEFAULT '[]',
  source_quality jsonb NOT NULL,
  detector_version text NOT NULL,
  validation jsonb NOT NULL,
  provenance jsonb NOT NULL,
  evidence_need_id text,
  evidence_request_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS prevention_finding_geometry_gix ON prevention_finding USING gist(geometry);
CREATE INDEX IF NOT EXISTS prevention_finding_state_idx ON prevention_finding(finding_state, calibration_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS detector_run (
  id text PRIMARY KEY,
  detector_version text NOT NULL,
  run_state text NOT NULL,
  current_observation_id text,
  comparison_observation_id text,
  output_count integer NOT NULL DEFAULT 0,
  abstention_reason text,
  source_quality jsonb NOT NULL DEFAULT '{}',
  provenance jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL
);

INSERT INTO vigia_schema_migration(version) VALUES ('003-category-reset')
ON CONFLICT (version) DO NOTHING;
