CREATE TABLE IF NOT EXISTS observation_identity_binding (
  canonical_observation_id text PRIMARY KEY,
  external_observation_id text NOT NULL,
  principal_id text NOT NULL,
  agency_id text NOT NULL,
  node_or_provider_id text NOT NULL,
  incident_id text NOT NULL,
  source_family text NOT NULL,
  schema_version text NOT NULL,
  identity_version text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  UNIQUE (principal_id, agency_id, node_or_provider_id, incident_id, source_family, schema_version, external_observation_id)
);

CREATE INDEX IF NOT EXISTS observation_identity_incident_idx
  ON observation_identity_binding(incident_id, created_at DESC, canonical_observation_id);
