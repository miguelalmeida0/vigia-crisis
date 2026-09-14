CREATE TABLE IF NOT EXISTS vigia_intelligence_input_mutation (
  mutation_token uuid PRIMARY KEY,
  incident_id text NOT NULL REFERENCES vigia_intelligence_input_generation(incident_id) ON DELETE CASCADE,
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  begun_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > begun_at)
);

CREATE INDEX IF NOT EXISTS intelligence_input_mutation_incident_idx
  ON vigia_intelligence_input_mutation(incident_id, expires_at);
