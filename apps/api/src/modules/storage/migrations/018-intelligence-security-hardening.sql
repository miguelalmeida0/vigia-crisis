ALTER TABLE intelligence_snapshot
  ADD COLUMN IF NOT EXISTS snapshot_sequence bigserial;

ALTER TABLE intelligence_snapshot
  ALTER COLUMN snapshot_sequence SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_snapshot_sequence_uidx
  ON intelligence_snapshot(snapshot_sequence);

CREATE INDEX IF NOT EXISTS intelligence_snapshot_incident_sequence_idx
  ON intelligence_snapshot(incident_id, snapshot_sequence DESC);
