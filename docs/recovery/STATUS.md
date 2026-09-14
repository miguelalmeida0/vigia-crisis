# VIGIA reality cutover status

**Updated:** 2026-08-10 17:18 UTC
**Release decision:** R0 PASS; MOVE 1 BLOCKED — REAL PROVIDER EXECUTION REQUIRED; agency deployment NO-GO

Software tests are never classified as real-world validation. “Verified with real data” below means the stated runtime behavior was directly observed against attributable external provider responses; it does not mean wildfire-performance validation.

## IMPLEMENTED

- Mechanically separate PRODUCTION and TEST paths; REPLAY rejects synthetic provenance and requires an external corpus for the production replay command.
- Production import-graph gate, served-web-root fiction scan, synthetic observation counter and runtime `ProductionIntegrityViolation` boundary.
- Production-only entrypoint, empty operator state, public read-only principal, and disabled PREVENT/OUTCOMES feature surfaces.
- Production smoke/restart and desktop/Fire/mobile browser gates.
- R1 acquisition foundation: raw SHA-256 archive, raw product metadata, durable source checkpoints, failure counters, non-regressing cursors and read-only acquisition status API.
- Real ptdata acquisition is routed through raw archival before normalization.
- FIRMS CSV acquisition is routed through raw archival before normalization when a key is configured; secret-bearing source URI is redacted in archive metadata.
- FIRMS polling is throttled, concurrent calls collapse, failures back off exponentially, shutdown aborts in-flight requests, malformed/error bodies remain content-addressed with rejection metadata, and source state exposes configuration, attempt, and next-poll truth.
- PostgreSQL/PostGIS vertical cutover for raw-product metadata, canonical physical observations, stable fire events, association decisions, source checkpoints, and explicit raw→observation→event lineage. The physical path is fail-closed: a raw event product is not advanced to ingested until that transaction commits.
- Missing numeric weather/physical values no longer render or normalize as measured zero; stale reports cannot outrank current physical/current-report events; raster context is no longer labelled as an Earth/event observation; unknown API routes no longer fall through to the SPA.
- Prior evidence-need, event identity, dependency-aware fusion, time-bounded thermal support, native-pixel integrity and fail-closed persistence mechanics remain in the codebase.

## VERIFIED WITH REAL DATA

- A production runtime fetched current ptdata fires, risk, weather, warnings, municipalities and 2025/2026 history.
- A prior 2026-08-09 22:44 UTC baseline capture exposed **24** archived raw products and **8** healthy ptdata checkpoints; the 2026-08-10 recovery capture exposed **465** accumulated products and the same eight healthy checkpoints.
- Raw archive filenames matched the SHA-256 digest of their contents.
- Live source state: ptdata current; Copernicus catalogue current; operational MSG raster context current; FIRMS/MTG-points/Sentinel-3-points/assets/schedules not configured.
- The prior baseline capture contained **17 public-report events, 0 point thermal observations, 0 current physical observations**.
- On 2026-08-10 17:18 UTC the live event state was **28 public-report events, 0 point thermal observations, 0 current physical observations**; source reports/weather/risk and operational MSG raster context were current.
- Local production PostGIS 3.5 initialized successfully and accepted repeat real ptdata report/event/checkpoint transactions. A restart comparison preserved the same 30 event IDs and 31 observations; provider changes later reduced the live set to 28 events.
- R0 machine gate: **141 production modules, 0 fixture/test imports, 0 synthetic observations out of 30 persisted observations, 0 demo identities, 0 served synthetic assets, 0 served operational-fiction markers**.
- Production API restart smoke retained the same **15 events / 16 observations** with zero synthetic observations and zero demo identities before/after restart.
- Production desktop, Fire and 390×844 mobile browser gates exposed only Live/Fire and recorded zero console errors.

## VERIFIED ONLY SYNTHETICALLY

- Complete software suite: **135/135 passed**. Architecture gate: **314 files / 254 JavaScript modules** parsed, import-resolved, cycle-checked and within the module-size budget.
- FIRMS acquisition: archive-before-normalize, three-feed checkpoints, duplicate idempotency and canonical provenance.
- Actual PostGIS transaction in isolated TEST: two identical commits retained exactly 1 raw product, 1 physical observation, 1 stable event, 1 association, 1 checkpoint, and 2 lineage edges.
- Acquisition restart, malformed product, out-of-order product, duplicate, raw checksum and failed checkpoint-persistence cases.
- Event merge/split/late-arrival identity, physical observation fusion, thermal geometry and freshness.
- EvidenceNeed/EvidenceRequest/field-evidence closure, sensor ingest, future opportunities and failure paths.
- Native GeoTIFF integrity, lying catalogue rejection and prevention screening.
- Portugal late-arrival replay. The corpus is in TEST and cannot be used for operational metrics.

## UNMEASURED

- Detection precision/recall, missed-fire/false-alarm rates and thermal lead time on Portuguese incidents.
- Event association split/merge/fragmentation rates and observed-geometry accuracy.
- Provider reliability/SLOs, information gain, latency distributions and cost.
- Prevention detector performance and intervention outcomes.
- Operator performance, alert delivery, exercise results and safety-case acceptance.

## BLOCKED

- R1 thermal gate: `NASA_FIRMS_MAP_KEY` absent; no live real VIIRS raw product has entered the archive.
- EUMETSAT MTG FCI and Sentinel-3 SLSTR point products: existing modules are parsers/consumers, not acquisition.
- Real replay: no attributable historical raw corpus or external label authority.
- Production identity: no OIDC/JWKS/session, tenant boundary or provisioned principals.
- Production persistence remains incomplete: physical critical-path metadata is in a local single-node PostGIS container, while raw bytes and other operational state remain filesystem/JSON; there is no object lock, HA/backup proof, distributed scheduler, or outbox.
- Operational proof: no independent Portugal benchmark or prospective agency pilot.

## DELETED

- Production fixture gateway/imports and runtime fixture switch.
- Demo/fixture package entrypoints and fake role/persona selection.
- Seeded production actors, pilot work, hazards, outcomes and audit events.
- Fixture branches in imagery, observations, exposure, detection and prevention production modules.
- Synthetic imagery under the served web root and demo-labelled MTG selection.
- Public “Save event locally” control and event-watch HTTP routes.
- Fake `actor-field` offline app from the production static root.
- Synthetic replay as the default Portugal replay command.

## NEXT

1. Provision a real FIRMS credential and exercise one live VIIRS acquisition through raw archive, checkpoint, canonical observation, event association and restart deduplication.
2. If FIRMS remains blocked, build owned MTG FCI FRP discovery/fetch and archive ahead of the existing parser.
3. Move raw bytes to immutable object storage and harden PostGIS with managed HA, backups, acquisition leases, and an outbox before treating it as a production data plane.
4. Acquire and govern a real historical replay corpus; do not advance R2 without it.
5. Add OIDC/JWKS and provisioned service/operator identities before exposing production mutation workflows.

## Verification commands

```text
npm run check
TMPDIR="$PWD/.tmp" npm test
npm run reality:gate
npm run smoke
npm run browser:qa
npm run test:replay
VIGIA_DATABASE_URL="<test database URL using the generated local password>" npm run verify:postgis
```
