# VIGIA 10.0 — Physical Intelligence Core

VIGIA is a Portugal-first wildfire decision-support system. V10 moves the architecture from report-led incident presentation toward a fail-closed physical-observation pipeline:

**observe → prove the observation → associate → fuse → understand → acquire missing evidence → act**

The release does not claim operational certification. Uncalibrated models abstain from probability claims, public reports remain distinct from physical measurements, and geographic/image integrity gates run before raster analysis.

## Run

```bash
npm run runtime:setup
npm run geo:doctor
NASA_FIRMS_MAP_KEY='YOUR_REAL_KEY' npm run shadow:local
```

`npm run dev:live` also works without FIRMS or PostGIS for read-only inspection, but readiness stays false and raw event products are not advanced through the transactional physical-truth gate. The production entrypoint rejects the legacy `VIGIA_FIXTURES` switch; synthetic data is permitted only in test files or an explicitly test-universe database.

The critical physical path uses PostgreSQL/PostGIS for raw-product metadata, canonical physical observations, stable events, observation associations, source checkpoints, and explicit lineage. Original response bytes remain content-addressed in the configured raw archive. On Apple Silicon the upstream PostGIS image runs through Docker's amd64 emulation.

## Physical thermal sources

V10 normalizes independent thermal evidence into one event engine while retaining source identity and dependence.

```bash
VIGIA_MTG_FRP_DIR='/data/mtg-frp' \
VIGIA_SENTINEL3_FRP_DIR='/data/sentinel3-frp' \
NASA_FIRMS_MAP_KEY='YOUR_REAL_KEY' \
npm run dev:live
```

Normalized internal gateways are also supported with `VIGIA_MTG_FRP_JSON_URL` and `VIGIA_SENTINEL3_FRP_JSON_URL`.

The event engine can create an **unreported physical candidate** from satellite evidence before a public report exists. A later report is associated with the persistent event identity instead of replacing it.

## Geospatial integrity gate

Operational imagery is not renderable merely because a catalogue bbox contains the selected location. V10 checks the native raster itself:

1. catalogue/STAC footprint contains the coordinate;
2. raster CRS exists;
3. geotransform exists;
4. selected WGS84 coordinate transforms into a real raster pixel;
5. pixel centre reverse-projects within the pixel tolerance;
6. every science band used by inference independently passes the same gate.

Browse/thumbnail imagery is visual context only and cannot enable scientific screening.

## Server-side Sentinel-2 analysis

Primary image analysis runs in Python workers, not in browser RGB/JPEG code. V10 currently implements:

- native red/NIR/SWIR/SCL co-registration;
- cloud/shadow masking;
- NDVI/NDMI change screening;
- WGS84 candidate polygons with provenance;
- a first specialist **fuel-continuity change screen** joining verified Sentinel-2 bands to mapped structure points;
- explicit abstention when clear/registered pixels or mapped structures are insufficient.

These screens are intentionally marked `unvalidated_screening`, `operational:false`, and never output a fire/hazard probability.

## Resolution ladder

Sensor resolution is part of the domain policy, not UI copy. Sentinel-2 can screen landscape-scale vegetation/fuel conditions, but object-scale questions such as small dumping or access obstruction fail the resolution gate and escalate to sub-metre imagery, drone or field verification.

Optional high-resolution STAC:

```bash
VIGIA_HIGHRES_STAC_URL='https://provider.example/stac' \
VIGIA_HIGHRES_STAC_COLLECTION='highres-optical' \
VIGIA_HIGHRES_STAC_TOKEN='TOKEN_IF_REQUIRED' \
npm run dev:live
```

## Sensor fusion semantics

V10 distinguishes:

- event existence evidence;
- observation-to-event association;
- native sensor quality;
- freshness;
- independent sensor families.

Repeated observations from one sensor family are not counted as independent witnesses. `existenceProbability` remains `null` until a validated calibration profile is configured.

## Fire geometry

Thermal pixels remain **observed thermal support**, not a claimed fire perimeter. V10 stores each source footprint (or conservative nominal pixel support), generates a support envelope for visualization, tracks centroid movement with caveats, and keeps inferred/forecast perimeter as a separate future/provider product.

## Evidence acquisition, alerts and devices

Every unresolved fire-event routing need is persisted as an owned acquisition state. Connected assets, confirmed future observations, and manual inspection share one option contract. Ordering uses declared availability and time-to-observation; information gain, reliability, and comparable cost remain unmeasured unless supplied by validation evidence.

Public mode is read-only. A bounded development operator boundary can be enabled with `VIGIA_OPERATOR_TOKEN`; production still requires OIDC/JWKS and tenant enforcement. Prevention candidate review is available to authenticated analysts and supervisors. A review counts as domain-expert validation only when the actor is explicitly configured with `VIGIA_OPERATOR_QUALIFICATIONS=wildfire_prevention_domain_expert`; developer reviews are reported separately and never become precision labels.

Relevant V10 endpoints:

```text
GET  /api/v10/events
GET  /api/v10/evidence-needs
GET  /api/v10/capabilities
GET  /api/v10/ready
GET  /api/v10/prevention/findings
POST /api/v10/prevention/findings/:id/reviews
POST /api/v10/sensors/observations
POST /api/v10/sensors/:id/task
GET  /api/v10/alerts
POST /api/v10/alerts/:id/acknowledge
POST /api/v10/observations/change-screening
GET  /api/v10/events/corrections
POST /api/v10/events/corrections/merge
POST /api/v10/events/corrections/split
POST /api/v10/events/corrections/reject
```

## Consequence modelling

Built-in spread remains screening only. A separately validated provider can be configured using `VIGIA_SPREAD_PROVIDER_URL` and `VIGIA_SPREAD_PROVIDER_API_KEY`. Operational authority, evacuation and dispatch remain outside VIGIA's autonomous scope.

## Verify

```bash
npm run geo:doctor
npm test
npm run check
npm run smoke
VIGIA_QA_ALLOW_POLICY_OVERRIDE=1 npm run browser:qa
VIGIA_DATABASE_URL='<test database URL using the generated local password>' npm run verify:postgis
```

The canonical operator product lives in `apps/operator-console`, not `apps/web` or the quarantined `apps/mission-dark` prototype. With the backend release active on 4177, start it with `npm run operator:start`, run `npm run operator:verify:static`, then invoke the authoritative live gate directly with `/bin/sh scripts/release/trusted_operator_certification.sh`. The live gate is deliberately outside npm so hostile Node startup state cannot execute before certification. Stop the console safely with `npm run operator:stop`.

The regression suite includes a malicious geospatial fixture whose catalogue claims Portugal while the actual raster is georeferenced elsewhere; V10 must reject it.

For labelled retrospective/prospective datasets, run `npm run validation:fire -- cases.json [policy.json]`. VIGIA reports detection precision/recall/F1, event fragmentation/false merges, lead time, prevention precision/recall and abstention. It does not ship self-selected life-safety thresholds; an external validation policy must provide them.

For arrival-order and late-observation software mechanics, run `npm run test:replay`. Its corpus lives under the test fixture boundary and always returns operational validation as `UNMEASURED`. `npm run replay:portugal -- /path/to/corpus.json` accepts only an externally labelled corpus with attributable label authority; it has no bundled production default.

See `docs/RELEASE-10.0.md` and `docs/ARCHITECTURE.md`.
