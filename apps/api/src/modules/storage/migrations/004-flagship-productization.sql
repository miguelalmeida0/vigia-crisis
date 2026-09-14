CREATE TABLE IF NOT EXISTS prevention_finding_review (
  id text PRIMARY KEY,
  finding_id text NOT NULL REFERENCES prevention_finding(id) ON DELETE CASCADE,
  detector_version text NOT NULL,
  reviewer_type text NOT NULL CHECK (reviewer_type IN ('DEVELOPER_REVIEW','DOMAIN_EXPERT_REVIEW')),
  reviewer_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('ACCEPT_CANDIDATE','REJECT_CANDIDATE','ABSTAIN')),
  reason text NOT NULL,
  note text NOT NULL DEFAULT '',
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prevention_finding_review_finding_idx
  ON prevention_finding_review(finding_id, detector_version, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS prevention_finding_review_type_idx
  ON prevention_finding_review(reviewer_type, decision, reviewed_at DESC);

INSERT INTO vigia_schema_migration(version) VALUES ('004-flagship-productization')
ON CONFLICT (version) DO NOTHING;
