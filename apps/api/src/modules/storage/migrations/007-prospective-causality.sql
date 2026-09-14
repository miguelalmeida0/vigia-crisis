ALTER TABLE prospective_detection_capture
  ADD COLUMN IF NOT EXISTS api_available_at timestamptz,
  ADD COLUMN IF NOT EXISTS ui_first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS ui_first_seen_trace_id text,
  ADD COLUMN IF NOT EXISTS ui_client_observed_at timestamptz;

CREATE INDEX IF NOT EXISTS prospective_detection_ui_first_seen_idx
  ON prospective_detection_capture(ui_first_seen_at DESC)
  WHERE ui_first_seen_at IS NOT NULL;

COMMENT ON COLUMN prospective_detection_capture.api_available_at IS
  'Server clock captured only after the event API snapshot is complete.';
COMMENT ON COLUMN prospective_detection_capture.ui_first_seen_at IS
  'Server receipt clock for a same-origin browser acknowledgement emitted after the event was visibly rendered.';
COMMENT ON COLUMN prospective_detection_capture.ui_client_observed_at IS
  'Informational browser clock; never used as the authoritative causal timestamp.';
