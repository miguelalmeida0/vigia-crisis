CREATE TABLE IF NOT EXISTS intelligence_snapshot (
  snapshot_version text PRIMARY KEY,
  incident_id text NOT NULL,
  ontology_version text NOT NULL,
  rule_set_version text NOT NULL,
  incident_version text NOT NULL CHECK (incident_version ~ '^sha256:[a-f0-9]{64}$'),
  evidence_graph_hash text NOT NULL CHECK (evidence_graph_hash ~ '^sha256:[a-f0-9]{64}$'),
  source_state_version text NOT NULL CHECK (source_state_version ~ '^sha256:[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  projection_hash text NOT NULL CHECK (projection_hash ~ '^sha256:[a-f0-9]{64}$'),
  explanation_hash text NOT NULL CHECK (explanation_hash ~ '^sha256:[a-f0-9]{64}$'),
  mode text NOT NULL CHECK (mode IN ('LIVE','HISTORICAL','HISTORICAL_REPLAY','REHEARSAL')),
  generated_at timestamptz NOT NULL,
  state jsonb NOT NULL,
  UNIQUE (incident_id, input_hash),
  UNIQUE (snapshot_version, incident_id)
);

CREATE INDEX IF NOT EXISTS intelligence_snapshot_incident_history_idx
  ON intelligence_snapshot(incident_id, generated_at DESC, snapshot_version DESC);

CREATE TABLE IF NOT EXISTS operator_intelligence_decision (
  decision_id text PRIMARY KEY,
  incident_id text NOT NULL,
  principal_id text NOT NULL,
  agency_id text NOT NULL,
  capability text NOT NULL CHECK (capability = 'review:incident'),
  snapshot_version text NOT NULL,
  evidence_graph_version text NOT NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('ASSESSMENT_ACKNOWLEDGED','EVIDENCE_REQUEST_APPROVED','INCIDENT_ASSOCIATION_CORRECTED','SOURCE_STATE_REVIEWED','HANDOFF_ACCEPTED','UNKNOWN_MARKED_UNOBTAINABLE','EVIDENCE_NEED_RESOLVED')),
  selected_option text NOT NULL CHECK (length(selected_option) BETWEEN 1 AND 120),
  reason_code text NOT NULL CHECK (reason_code IN ('EVIDENCE_REVIEWED','PROVENANCE_VERIFIED','INSUFFICIENT_EVIDENCE','EXTERNAL_CAPABILITY_UNAVAILABLE','CORRECTION_REQUIRED','HANDOFF_VERIFIED','OPERATOR_JUDGEMENT')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL,
  binding_hash text NOT NULL CHECK (binding_hash ~ '^sha256:[a-f0-9]{64}$'),
  FOREIGN KEY (snapshot_version, incident_id) REFERENCES intelligence_snapshot(snapshot_version, incident_id)
);

CREATE INDEX IF NOT EXISTS operator_intelligence_decision_incident_idx
  ON operator_intelligence_decision(incident_id, created_at DESC, decision_id DESC);

CREATE OR REPLACE FUNCTION reject_intelligence_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'intelligence_history_is_immutable' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS intelligence_snapshot_immutable ON intelligence_snapshot;
CREATE TRIGGER intelligence_snapshot_immutable BEFORE UPDATE OR DELETE ON intelligence_snapshot
FOR EACH ROW EXECUTE FUNCTION reject_intelligence_history_mutation();

DROP TRIGGER IF EXISTS operator_intelligence_decision_immutable ON operator_intelligence_decision;
CREATE TRIGGER operator_intelligence_decision_immutable BEFORE UPDATE OR DELETE ON operator_intelligence_decision
FOR EACH ROW EXECUTE FUNCTION reject_intelligence_history_mutation();
