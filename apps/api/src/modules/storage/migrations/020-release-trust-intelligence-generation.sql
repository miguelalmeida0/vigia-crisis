ALTER TABLE vigia_release_deployment_identity
  ADD COLUMN IF NOT EXISTS operational_data_hash text,
  ADD COLUMN IF NOT EXISTS release_statement_hash text;

DO $$ BEGIN
  ALTER TABLE vigia_release_deployment_identity ADD CONSTRAINT vigia_release_operational_data_hash_format CHECK (operational_data_hash IS NULL OR operational_data_hash ~ '^sha256:[a-f0-9]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE vigia_release_deployment_identity ADD CONSTRAINT vigia_release_statement_hash_format CHECK (release_statement_hash IS NULL OR release_statement_hash ~ '^sha256:[a-f0-9]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vigia_intelligence_input_generation (
  incident_id text PRIMARY KEY,
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  dirty boolean NOT NULL DEFAULT false,
  active_mutations integer NOT NULL DEFAULT 0 CHECK (active_mutations >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operator_intelligence_decision
  ADD COLUMN IF NOT EXISTS authoritative_input_generation bigint NOT NULL DEFAULT 0 CHECK (authoritative_input_generation >= 0);

CREATE INDEX IF NOT EXISTS intelligence_input_generation_dirty_idx
  ON vigia_intelligence_input_generation(dirty, updated_at DESC)
  WHERE dirty = true;
