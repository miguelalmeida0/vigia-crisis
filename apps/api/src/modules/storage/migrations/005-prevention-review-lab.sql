ALTER TABLE prevention_finding_review
  ADD COLUMN IF NOT EXISTS reviewer_qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS model_version text,
  ADD COLUMN IF NOT EXISTS scene_pair jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS finding_version text,
  ADD COLUMN IF NOT EXISTS source_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS land_cover_context jsonb NOT NULL DEFAULT '{"state":"UNMEASURED"}'::jsonb;

UPDATE prevention_finding_review
SET model_version = detector_version
WHERE model_version IS NULL;

INSERT INTO vigia_schema_migration(version) VALUES ('005-prevention-review-lab')
ON CONFLICT (version) DO NOTHING;
