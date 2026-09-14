# VIGIA 10.0 — Physical Intelligence Core

## Release objective

Close the highest-risk gaps identified in the V8 audit without upgrading claims ahead of evidence. V10 prioritizes data integrity and physical sensing over additional dashboard surface.

## Implemented P0 changes

### 1. Fail-closed image-analysis integrity

`GeoIntegrityService` invokes `workers/geospatial/geo_integrity.py` against the native raster. A catalogue bbox or self-reported binding hash is no longer sufficient. Visual COGs and every science band used by inference must independently pass CRS/geotransform/pixel/reverse-projection checks. Wrong-place rasters are rejected.

### 2. Browser inference removed

Legacy browser RGB change modules were deleted. `POST /api/v10/observations/change-screening` performs native-band analysis server-side. Browse previews cannot enable the endpoint.

### 3. Structured multi-satellite physical evidence

The Fire Event Engine consumes normalized VIIRS, structured MTG FCI FRP and Sentinel-3 SLSTR FRP observations. Source family and independence group are retained so one platform is not counted as multiple independent witnesses.

### 4. Persistent physical-first event identity

`EventObservationRepository` persists observation→event mappings. If a satellite creates the event first and an older-start-time public report arrives later, the event keeps its original identity. Merge aliases are retained when clusters converge.

### 5. Calibrated-fusion boundary

`fuseEventEvidence()` reports evidence strength and independent-family count. It does not emit an event-existence probability unless an explicitly validated calibration profile is provided.

### 6. Honest fire geometry

Each thermal observation becomes an observed-support footprint. Aggregates are labelled thermal-support envelopes, never authoritative fire perimeter. Current/aging/stale behavior semantics expire when physical observations age.

### 7. Specialist prevention analysis

The server now has two native-band analysis paths:

- spectral vegetation/moisture change screening;
- fuel-continuity change screening that joins verified Sentinel-2 bands to mapped structure points and returns candidate geometry, area, span, nearest-structure distance and structure count.

Both are uncalibrated screening products and cannot verify a physical hazard.

### 8. Resolution-aware abstention

`sensor-resolution-policy.mjs` prevents coarse imagery from answering object-scale questions. Sentinel-2 may screen landscape fuel continuity/large-area change, but small dumping and access-obstruction questions require higher-resolution imagery, drone or field evidence.

### 9. Durable operator event-identity corrections

Analysts and supervisors can merge events, split observations and reject bad associations. Corrections are persisted as manual observation→event bindings, survive refresh/restart, retain the original evidence, and emit entries in the verifiable local hash-chain log. The log is mutable by a host administrator and is not an external immutable ledger. Heuristic clustering cannot silently override a manual split.

### 10. Canonical physical-observation contract

All satellite, camera, ground-sensor, drone and field observations normalize through `physical-observation.v1`. Source family, independence group, timestamps, geometry, measurement payload, quality flags and the explicit absence of a calibrated wildfire probability are shared invariants across adapters.

### 11. Validation boundary

`npm run validation:fire` evaluates labelled datasets for physical-detection precision/recall/F1, event fragmentation and false merges, lead time, prevention precision/recall and abstention. VIGIA deliberately does not define its own life-safety promotion thresholds; a separate validation policy supplies those gates.

### 12. V10 operational API surface

Health/SSE, events, sensors, tasking and alerts expose `/api/v10` routes while older routes remain as compatibility aliases.

### 13. Closed unknown-to-evidence lifecycle

Every routed event unknown is materialized as a durable `EvidenceNeed` and, when an owner exists, a linked `EvidenceRequest`. Current assets, confirmed future observations and manual inspection use one option contract. A missing connected asset is not terminal when a confirmed scheduled observation covers the event. Eligible accepted field evidence is idempotently attached to the retained event identity, fused, persisted as a derived physical state and allowed to resolve the need only after recomputation.

### 14. Operational readiness and failure truth

`/live`, `/ready`, and `/api/v10/capabilities` separate process liveness from deployment readiness. Readiness checks authentication, state/event persistence, audit-chain validity, unknown-to-work invariants, source-family availability, scientific runtime and integrity-proof persistence. Source, schedule, runtime and write failures remain explicit and fail closed.

### 15. Portugal replay boundary

`npm run test:replay` replays synthetic TEST arrivals, including a late physical observation, through persistent event identity, fusion and geometry and returns validation `UNMEASURED`. `npm run replay:portugal -- /path/to/corpus.json` has no bundled default and accepts only an externally labelled corpus with attributable label authority; no such real corpus is currently available.

## Release gates added

- native raster at requested place passes pixel round-trip proof;
- false catalogue bbox + wrong raster geotransform is rejected;
- all red/NIR/SWIR science bands must pass binding;
- browse preview cannot enable science inference;
- server spectral analysis outputs polygons without a `confidence` field;
- fuel-continuity analysis outputs screening-only polygons near mapped structures;
- repeated same-family detections remain dependent evidence;
- Sentinel-3 observations cannot be mislabeled as VIIRS;
- physical-first event ID survives later report association;
- Sentinel-2 small-object questions must abstain;
- manual merge/split/reject association survives event reconstruction;
- manually separated event identities cannot be rejoined by the heuristic tracker;
- canonical physical observations reject impossible coordinates and preserve source independence.
- every routed event unknown has an allowed durable acquisition state;
- accepted attributable evidence preserves event identity and closes the recomputed need;
- future schedule, scientific-runtime and persistence failures fail closed;
- browser QA fails when its executable dependencies are absent;
- Portugal replay preserves identity across late arrivals without claiming validation.

## What V10 deliberately does not claim

V10 is not yet agency-certified or field-validated. These remain external validation/deployment gates rather than code-completeness gates:

- prospective false-alarm/false-negative measurement on real Portuguese fire seasons;
- calibrated event-existence probabilities;
- validated Portugal fuel-continuity thresholds by land-cover class;
- authoritative fire perimeter extraction;
- operational spread/arrival-time prediction unless a validated provider is configured;
- autonomous dispatch, evacuation or public-warning authority;
- small-object prevention detection from 10 m Sentinel-2 imagery.

## Deployment inputs still required for maximum capability

- NASA FIRMS MAP key for VIIRS point ingest;
- structured MTG FCI FRP product feed;
- Sentinel-3 SLSTR FRP product feed;
- geospatial Python runtime from `workers/geospatial/requirements.txt`;
- higher-resolution imagery or connected drone/camera/field assets for object-scale verification;
- local validation labels for calibration and threshold promotion.
