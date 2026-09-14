CREATE TABLE IF NOT EXISTS road_source_snapshot (
 id text PRIMARY KEY, source_id text NOT NULL, known_at timestamptz NOT NULL,
 content_hash text NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS road_source_snapshot_time ON road_source_snapshot(source_id,known_at DESC);
CREATE TABLE IF NOT EXISTS road_source_status (
 source_id text PRIMARY KEY, payload jsonb NOT NULL
);
