-- Route geometry is stable content (a road path between a facility and an
-- incident point) that incident_situation_snapshot was re-embedding in full,
-- unchanged, into every historical row — the dominant contributor to Neon
-- storage/transfer exhaustion on the isolated demo database. Stable route
-- content now lives here once per distinct route, keyed by a content hash
-- over its identity fields only (facility, direction, geometry, roads,
-- distance, travel time) — never the volatile per-observation fields
-- (calculatedAt/validUntil/retryAfter/state/restrictionIds/roadInformation)
-- that used to make the same road path hash differently on every ~5-minute
-- freshness recomputation. Snapshot rows reference artifacts by hash instead
-- of carrying geometry/roads inline.
CREATE TABLE IF NOT EXISTS situation_route_artifact (
 content_hash text PRIMARY KEY,
 facility_id text NOT NULL,
 direction text,
 source text,
 distance_km double precision,
 travel_time_minutes double precision,
 roads jsonb NOT NULL,
 geometry jsonb NOT NULL,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS situation_route_artifact_facility ON situation_route_artifact(facility_id);
