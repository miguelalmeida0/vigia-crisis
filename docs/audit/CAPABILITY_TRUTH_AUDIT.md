# VIGIA Capability Truth Audit

**Audit date:** 2026-08-09
**Repository:** VIGIA 10.0, commit `c6e28bd` (`baseline: VIGIA v10 physical intelligence core`)
**Mode examined:** default `public-sources`, explicit fixture mode, API/service tests, persistence across process restart, and the rendered web application
**Audit constraint:** forensic audit only. No production behavior was implemented or repaired.

## Verdict

VIGIA is an unusually candid decision-support prototype with several good truth-preserving domain boundaries, but it is not deployable wildfire physical intelligence. Its strongest assets are the separation of report freshness from physical freshness, fail-closed raster binding, explicit evidence-request state machines, sensor-family-aware fusion, and non-perimeter thermal geometry. Its operational centre is nevertheless empty: the audited public runtime had zero point thermal observations, zero physically current events, zero connected acquisition assets, zero verified hazards, zero operational detector findings, and no validated scientific or fire-behaviour model.

Two findings make the current build immediately unsafe even as a controlled operator tool:

1. Every unauthenticated HTTP request is assigned the seeded supervisor identity, and an arbitrary `x-vigia-actor-id` selects another seeded actor (`apps/api/src/modules/control/request-context.mjs:1-3`). A no-header request successfully mutated watch state during this audit.
2. `Watch event` prepends an unhashed object into the hash-chain audit array (`apps/api/src/modules/interventions/command-service.mjs:145-154`). After one watch action, the public API returned `auditChain.valid:false`; the audit UI then assumes every event has `event.hash` and can throw while rendering (`apps/web/src/v2/app/action-handler.js:74-75`).

The scientific observation path is correctly designed to fail closed, but the configured Python runtime cannot import any required scientific package. Four of 82 tests fail for this reason. The field page is served with `Permissions-Policy: geolocation=(), microphone=(), camera=()` while its capture code requests geolocation, so captures silently fall back to the assignment coordinate (`apps/api/src/http/security-headers.mjs:14-20`, `apps/web/field/field.js:10-13`). The field sync endpoint does not persist/deduplicate `clientId`; sending one operation twice produced one success followed by `invalid_evidence_request_transition` (`apps/api/src/modules/verification/evidence-request-routes.mjs:8-20`).

**EOC decision: NO-GO.** Do not expose this build to an emergency operations centre, even as a secondary operational surface, until the P0 gates in `docs/audit/P0_RECOVERY_PLAN.md` are passed.

## Method and score contract

Implementation readiness is scored 0-10:

- **0-2:** absent, decorative, or fixture-only;
- **3-4:** real code seam or local prototype, missing operational closure;
- **5-6:** coherent working slice with material reliability/integration gaps;
- **7-8:** deployable, observable, failure-tested, and operationally owned;
- **9-10:** independently validated in representative operations with controlled residual risk.

The second score is **measured/validated operational capability**, not test coverage. It is reported as `UNMEASURED` when the repository has no representative ground-truth corpus, calibration result, live service-level record, incident exercise, or external validation. Passing deterministic fixtures does not convert that field into a number.

### Commands and reproduced results

| Check | Result | What it actually proves |
|---|---|---|
| `npm test` with workspace `TMPDIR` | **78 pass / 4 fail / 82 total** | Most domain contracts execute. Both raster-integrity tests and both spectral/fuel screening tests fail because `rasterio` is absent. |
| `npm run check` | **pass**, 271 files / 217 JS modules | Syntax, local import resolution, acyclic JS graph, file-size budget, and static markers. It is not an operational capability test. |
| `npm run smoke` | **pass** after allowing loopback bind | The explicitly synthetic fixture vertical slice composes. It relies on seeded physical observations, hazards, outcomes, and audit events. |
| `npm run geo:doctor` | **fail** | Python 3.14.5 has none of `numpy`, `rasterio`, `pyproj`, `shapely`, `h5py`; `gdalinfo` is absent. |
| `npm run browser:qa` | **exit 0 without a browser** | Static string assertions pass; Playwright is unavailable in all three scripts. The command is a false-positive browser gate (`scripts/browser_qa.py:201-214`, `scripts/fire_qa.py:28-33`, `scripts/mobile_qa.py:33-40`). |
| In-app browser, public runtime | **rendered and navigated** | Live/Action/Prevent/Field rendered. It displayed 0 current physical observations, no connected acquisition asset, Sentinel-2 pixels unavailable, cross-sensor VIIRS context, and one persisted audit evidence request. |
| Process restart diagnostic | **partial pass** | One evidence request, one watched ID, stable event ID, and one manual event merge survived restart. The watch action simultaneously invalidated the audit chain. |
| Duplicate field operation | **fail** | Two operations with the same `clientId` produced success then invalid transition. The contract is not idempotent. |
| No-header mutation | **unsafe success** | The API returned the supervisor actor by default and accepted a watch mutation with no authentication. |

The first test attempt without a workspace `TMPDIR` also produced 12 `EPERM` failures because the sandbox denied system-temp writes. Those are environment failures, not product failures; the 78/4 result is the controlled rerun.

## Public-runtime evidence snapshot

At `2026-08-09T18:26Z`, before the manual merge diagnostic:

- 18 retained event records over the 72-hour window;
- 6 current/delayed report events requiring physical observation;
- 0 current physical observations; 0% of active events physically current;
- 0 thermal observations, 0 satellite-only events, 0 multisource events, and lead-time sample size 0;
- all 18 active-perception plans were `no_connected_asset`;
- FIRMS, structured MTG pixels, structured Sentinel-3 pixels, and sensor assets were `not_configured`;
- the MTG WMS context was current and explicitly raster context only;
- 8 risk-driven prevention inspection priorities, 0 urgent, 0 verified hazards, 0 live detector findings;
- 22 separate detection-service incidents all required confirmation, while the event service exposed 18 retained events—two parallel truth models with materially different counts;
- 0 remediations, 0 closed loops, 0 alerts, and 0 measured outcomes before audit-created diagnostics.

Environment inspection found all external capability variables unset: FIRMS, MTG structured input, Sentinel-3 structured input, high-resolution STAC, external spread provider, sensor ingest/task tokens, and alert webhook. `data/config/sensors.json` contains an empty asset list.

## Capability scorecard

| # | Capability | Implementation readiness | Measured / validated operational capability | Primary classification |
|---:|---|---:|---|---|
| 1 | Event identity and association | **5/10** | **UNMEASURED** | real but incomplete |
| 2 | Real physical fire detection | **3/10** | **UNMEASURED** | integration hooks; unconfigured runtime |
| 3 | Satellite exploitation | **4/10** | **UNMEASURED** | real catalogue/context; broken science runtime |
| 4 | Sensor fusion | **4/10** | **UNMEASURED** | careful prototype; uncalibrated |
| 5 | Fire geometry and evolution | **3/10** | **UNMEASURED** | observed support only; no fire-front model |
| 6 | Physical prevention detection | **2/10** | **UNMEASURED** | risk ranking + research/fixture scaffolds |
| 7 | Geospatial integrity | **4/10** | **UNMEASURED** | strong fail-closed design; unavailable runtime |
| 8 | Active perception / next-best observation | **3/10** | **UNMEASURED** | heuristic planner; zero connected assets |
| 9 | Evidence acquisition orchestration | **4/10** | **UNMEASURED** | manual workflow; unknowns are not durable work |
| 10 | Action, ownership, SLA, audit | **4/10** | **UNMEASURED** | real state machine; auth/audit/SLA critical breaks |
| 11 | Consequence and asset risk | **2/10** | **UNMEASURED** | gated exposure seam; fabricated quantile semantics |
| 12 | Alerting | **3/10** | **UNMEASURED** | local persistence; no reliable delivery contract |
| 13 | Source health and graceful degradation | **4/10** | **UNMEASURED** | per-source states; silent failures/inconsistent planes |
| 14 | Deployment readiness | **1/10** | **UNMEASURED** | local single-process prototype |

## 1. Event identity and association

**Classification:** `real but incomplete`; UI pairing grade is a `misleading product surface` when treated as measured quality.

**A — code paths.** Normalization and greedy tracking live in `packages/domain/src/fire-event-tracker.mjs:17-53,99-117`; heuristic report↔physical association in `packages/domain/src/event-association.mjs:8-70`; persisted observation↔event mapping and manual corrections in `apps/api/src/modules/events/event-observation-repository.mjs:18-90`; correction authorization/API in `apps/api/src/modules/events/event-correction-service.mjs` and `apps/api/src/modules/events/event-routes.mjs:33-41`; presentation in `apps/web/src/v2/views/event-presenter.js:14`.

**B — real I/O.** It consumes normalized public reports plus available physical observations and writes `fire-event-observations.public.json`. The audit manually merged two live public events, restarted the process, and observed 17 rather than 18 events; the target contained two observations and the source ID remained absent.

**C — state.** Observation history, event records, automatic mappings, manual mappings, and correction logs are JSON-persisted. The in-process tests called “persists” instantiate `EventObservationRepository()` without a file path (`apps/api/test/v10-event-corrections.test.mjs:12-30`); only the physical-first identity test uses a file, and it does not instantiate a second repository/process (`apps/api/test/v10-event-identity.test.mjs:9-17`). The audit adds actual restart evidence for one merge, not for split/reject.

**D — fallback/failure.** Tracking is chronological greedy nearest-fit using hard-coded distance/time thresholds. Weak cross-source pairs are rejected, but moderate/strong grades are not calibrated. Repository writes suppress all errors (`event-observation-repository.mjs:83`), so a correction may return success even when durable write failed. Manual mappings are deleted as observations age out of the 72-hour window (`:23-30`).

**E — measured metrics.** The runtime exposes counts, lead samples, uncertain associations, and physical-current share (`fire-event-service.mjs:18`), but there is no labelled association corpus, split/merge precision/recall, identity fragmentation rate, or false-merge rate. Current public sample contained no cross-source associations.

**F — assumptions.** Spatial proximity, time gap, native sensor confidence, municipality affinity, and first-received observation are proxies for same-event identity. The algorithm assumes configured `independenceGroup` and source coordinates are sound.

**G — tests prove.** Unit tests cover nearby fusion, distant separation, weak-pair rejection, physical-first ID retention, manual merge/split/reject reconstruction, and role checks. The process-restart audit proved one merge and target ID persisted.

**H — tests do not prove.** No multi-incident replay, crossing fire fronts, coordinate correction, delayed/out-of-order bulk replay, upstream incident-ID reuse, long outage, 72-hour expiry/reappearance, concurrent writers, or field-adjudicated ground truth.

**I — reliability/security.** Silent save failure and unauthenticated correction routes are critical. No optimistic concurrency, database transaction, schema migration, backup, or multi-process lock exists.

**J — scientific validity.** The returned score is correctly labelled `heuristic_fit_score` and probability remains null, but grade thresholds are engineering constants, not empirical association likelihoods (`event-association.mjs:36-39,63-70`).

**K — operator usability.** Explanations, distance, time gap, and manual correction controls are valuable. `PAIR QUALITY strong/moderate` visually elevates an uncalibrated score and should not be used as a disposition without validation.

**L — scores.** Implementation **5/10**. Operational capability **UNMEASURED**.

## 2. Real physical fire detection

**Classification:** `integration hook` with one real public adapter; operational runtime is absent.

**A.** FIRMS: `apps/api/src/modules/world/firms-gateway.mjs:6-63`; structured MTG: `modules/world/mtg/mtg-frp-gateway.mjs:7-20`; Sentinel-3: `modules/world/sentinel3/sentinel3-frp-gateway.mjs:7-16`; WMS context: `modules/live/live-thermal-adapter.mjs:4-23,97-170`; report-coordinate feature probe: `modules/world/mtg/mtg-feature-info-gateway.mjs:3-11`; external sensor ingress: `modules/sensors/sensor-ingest-service.mjs`.

**B.** FIRMS performs real NASA CSV requests for three VIIRS NRT feeds over Portugal and normalizes scan/track/FRP/classification. MTG and Sentinel-3 only consume an externally populated local product directory or normalized JSON URL; they do not acquire products. MTG/MSG WMS retrieves real capabilities and raster maps. FeatureInfo probes only report coordinates and emits a point when a positive FRP value can be extracted. External devices can POST physical observations using configured token/HMAC contracts.

**C.** Physical observations persist in the event repository for 72 hours. WMS and gateway responses use memory/JSON cache. The default asset registry is an empty static JSON file.

**D.** No FIRMS key means explicit `not_configured`. No MTG/S3 directory/JSON means explicit `not_configured`. WMS context remains available but is not converted into point evidence except a positive coordinate probe. Gateway and parsing errors mostly degrade to empty/unavailable states; several are swallowed.

**E.** The public audit measured 0 thermal observations, 0 current physical events, and 0 connected sensor assets. There is no recall, false-positive rate, detection latency distribution, coverage denominator, or incident confirmation dataset.

**F.** A configured feed is assumed operational; native confidence is assumed suitable for heuristic screening. FIRMS absence is correctly treated as unknown coverage rather than negative evidence.

**G.** Mock tests prove CSV normalization, unconfigured honesty, MTG/S3 normalization, FeatureInfo parsing, authenticated sensor ingest, replay protection for device nonces, and that WMS raster is not automatically point evidence.

**H.** They do not prove current external endpoints, credentials, product acquisition, parser compatibility with operational feeds, 24/7 latency, geographic completeness, false alarms, missed detections, or incident confirmation. The public runtime proved none of these paths was configured.

**I.** No acquisition scheduler, queue, backfill, manifest, product checksum, delivery SLO, on-call owner, or telemetry. Structured feeds rely on an out-of-repository drop mechanism.

**J.** FRP and source metadata are preserved. Native confidence is not a calibrated fire probability, but it feeds uncalibrated high/moderate candidate grades and can cause high-severity unreported-sensor alerts (`fire-event-service.mjs:19-21`).

**K.** The UI clearly distinguished report-only from physically observed state and WMS context from point evidence. That is strong. It cannot tell an operator when the next real overpass will occur or who will close the gap.

**L.** Implementation **3/10**. Operational capability **UNMEASURED**.

## 3. Satellite exploitation

**Classification:** `real but incomplete`; operational scientific analysis is currently unavailable.

**A.** Earth Search STAC/COGs: `apps/api/src/modules/observations/earth-search-gateway.mjs:4-19`; Copernicus/Sentinel-1 catalogues under `modules/world`; observation resolution: `modules/observations/observation-fabric-service.mjs:49-109`; integrity: `geo-integrity-service.mjs:10-29`; server screens: `workers/geospatial/spectral_change.py`, `fuel_continuity.py`; client COG loader: `apps/web/src/v2/components/geotiff-loader.js`.

**B.** A live Mirandela request found Sentinel-2 scene `S2C_29TPF_20260806_0_L2A`, a catalogue bbox containing the coordinate, cloud cover `0.00079`, and native visual/red/NIR/SWIR/SCL COG URLs. The worker could not open any asset because `rasterio` was missing. The UI rendered a NOAA-20 VIIRS broad-context image and explicitly said it was not the selected Sentinel scene.

**C.** Scene results are transient/cached; no local imagery catalogue, product store, immutable manifest, analysis-job store, or derived finding store exists. Fixture imagery is checked in and synthetic.

**D.** Earth Search errors return `[]`. Copernicus/Sentinel-1 failures also commonly return empty results. Integrity fails closed. When selected pixels fail, a different-sensor browse fallback is allowed only as broad context. This is honest, but `currentCondition:"usable"` remains based on metadata age while selected pixels are unusable.

**E.** No scene acquisition success rate, cloud-free coverage SLO, pixel-open latency, analysis throughput, registration error distribution, or detector validation metric. The one live probe was a complete pixel/science failure caused by environment, not source geography.

**F.** STAC metadata, asset keys, MGRS grid metadata, and remote range-read behavior are assumed correct until the raster proof runs. Client rendering depends on a runtime CDN script allowed by CSP.

**G.** Mocks prove STAC normalization, sensor non-substitution, metadata-only behavior, and fallback labelling. Geo tests are designed to prove raster round trip and reject a lying catalogue bbox.

**H.** The two geo tests and two scientific screens did not run in the audited runtime. No operational Sentinel product corpus, cloud/shadow validation, alignment benchmark, high-resolution provider, or rate/egress test exists.

**I.** Scientific dependencies are not packaged or startup-gated. Remote COGs, network egress, CDN availability, and source rate limits have no retry/queue/SLO. Analysis is synchronous in the API process.

**J.** The spectral and fuel algorithms emit unvalidated screening polygons with hard-coded thresholds and correctly refuse probability/hazard confirmation. They have no Portugal land-cover calibration, seasonal baseline, error bars, or validation report.

**K.** The Prevent view was one of the most honest surfaces: metadata/pixels/on-screen sensor/confirmation are separated. The source ladder nevertheless advertises `Field / camera / drone evidence: taskable` while the actual asset registry is empty (`observation-fabric-service.mjs:92-99`).

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 4. Sensor fusion

**Classification:** `real but incomplete`.

**A.** Canonical observation: `packages/domain/src/physical-observation.mjs:1-20`; independence-aware fusion: `evidence-fusion.mjs:1-34`; event assembly/state: `fire-event-tracker.mjs`; API enrichment: `fire-event-service.mjs:39-47`.

**B.** It fuses any normalized physical feed present in the event repository with reports. In the public audit no physical feed was present, so the live result was report-only.

**C.** Canonical observations and event mappings are persisted for 72 hours; fusion output is recomputed and transient.

**D.** Repeated observations sharing `independenceGroup` count as one witness. Without an explicitly validated calibration, `existenceProbability` is null. There is no negative-evidence or exact-coverage model.

**E.** `independentFamilies`, witness counts, dependency groups, and evidence strength are exposed. No calibration curve, Brier score, reliability diagram, family-dependence study, or confirmed-event evaluation exists.

**F.** Independence is trusted from producer-supplied string labels. Platform and processing-chain correlation beyond that label is not modelled. Native source confidence is compressed into simple quality values.

**G.** Unit tests prove same-family observations are not double-counted and no probability is produced without calibration.

**H.** No adversarial producer labels, shared upstream processing, correlated satellites, conflicting evidence, negative detection coverage, calibration-profile governance, or real incident set.

**I.** Ingest has token/HMAC seams, but normal HTTP operator auth is absent. Recompute is synchronous and no provenance graph ties derived fusion output to immutable input versions.

**J.** Abstention on probability is scientifically sound. Evidence-strength names (`cross_platform`, `multisensor`) describe counts, not validated truth support.

**K.** The witness/dependency model can support a useful evidence ledger, but the current UI emphasizes event state more than the actual independence/dependence basis.

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 5. Fire geometry and evolution

**Classification:** `real but incomplete`; any perimeter/quantile interpretation is `safety theatre`.

**A.** Thermal footprint/envelope/movement: `packages/domain/src/fire-event-geometry.mjs:9-20`; temporal trend and geometry timeline: `fire-event-tracker.mjs:56-73,85-93`; map layers: `apps/web/src/v2/map/map-data.js`.

**B.** Source footprints are retained when provided. Otherwise axis-aligned nominal scan/track rectangles are constructed, convex-hulled, and timestamped. Centroid movement uses recent detections. No real physical points existed in the public audit.

**C.** Input observations persist; geometries and timelines are derived on every snapshot.

**D.** With no thermal points, geometry is null. With stale points, last-observed support can render but is not current. The code states `authoritativePerimeter:false` and movement is not fire-front velocity.

**E.** Observation count, first/last time, freshness, and centroid shift are available. There is no perimeter IoU, burned-area validation, rate-of-spread error, trajectory error, or scan-orientation error metric.

**F.** Nominal pixels are rectangular and axis-aligned; real sensor footprint orientation and geolocation uncertainty are simplified. Convex hull may include unobserved space.

**G.** Tests prove support is not labelled a perimeter, stale trend cannot be current growth, one point cannot create trend, and fresh fixture points create a timeline/movement value.

**H.** No comparison against authoritative perimeters, scan geometry, smoke/cloud occlusion, multi-front fires, terrain, spotting, suppression, or uncertainty propagation.

**I.** Pure functions are deterministic, but source gaps and bad association dominate reliability. There is no versioned geometry product or review workflow.

**J.** The support-envelope limitations are excellent. No estimated current perimeter, forecast perimeter, flame front, or empirically valid evolution model exists.

**K.** Current versus last-observed semantics are usable. Operators must never read the envelope as the fire boundary; line/fill design should continue to reinforce that distinction.

**L.** Implementation **3/10**. Operational capability **UNMEASURED**.

## 6. Physical prevention detection

**Classification:** primarily `safety theatre/demo scaffold`, with one `real but unvalidated` landscape screen.

**A.** Risk priority/checklists: `apps/api/src/modules/prevention/candidate-engine.mjs:6-52`; model registry: `detector-registry.mjs:4-25`; resolution gate: `packages/domain/src/sensor-resolution-policy.mjs:1-16`; server screens: `workers/geospatial/spectral_change.py` and `fuel_continuity.py`.

**B.** Public priorities are calculated from municipal danger, weather, nearby reports, catalogue freshness, and a fixed exposure proxy. The runtime produced eight priorities and zero findings. Outside fixture mode, the registry returns no detector findings (`detector-registry.mjs:22-24`).

**C.** Priority candidates are transient; evidence requests/hazards/remediations persist only after human action. Screening results are not durable findings.

**D.** The UI explicitly says inspection priority, not detected hazard. Resolution policy abstains for object-scale questions. Missing scientific runtime makes server analysis abstain. Generic checklists remain visible.

**E.** No detector precision, recall, false-positive burden, miss rate, geographic coverage, calibration, prioritization lift, or verified-hazard yield. Candidate score `74/high` is an engineering rank, not risk probability.

**F.** Exposure uses a constant proxy; nearby reports and weather are assumed meaningful for inspection priority. Hard-coded spectral/fuel thresholds are assumed to produce useful candidates.

**G.** Tests prove neutral language, fixture-only outputs, resolution abstention, and intended non-operational output contracts. The actual spectral tests fail in this environment.

**H.** No operational detector implementation exists for combustible accumulation, access obstruction, or firebreak degradation despite registry entries. No Portugal ground truth, seasonal stratification, high-resolution corpus, field verification study, or workload evaluation.

**I.** Candidate computation depends on source snapshots and uses `Date.now()` inside a function otherwise passed data, reducing deterministic replay. No scheduled detector job, queue, or finding repository.

**J.** The UI disclaimers are correct. Model labels `validation`/`research` describe registry entries, not demonstrated model artifacts. The spectral signal labels `strong/moderate` are threshold bands, not validated confidence.

**K.** The checklist is useful as an inspection template but can be mistaken for machine-detected hazards. The public surface currently ranks where to inspect; it does not detect physical prevention defects.

**L.** Implementation **2/10**. Operational capability **UNMEASURED**.

## 7. Geospatial integrity

**Classification:** `real but incomplete`; one of the strongest designs, unavailable in deployment.

**A.** `apps/api/src/modules/observations/geo-integrity-service.mjs:10-29`, `geospatial-process.mjs:3-19`, `workers/geospatial/geo_integrity.py:10-103`, `observation-scene.mjs:5-6`.

**B.** The intended path verifies catalogue containment, opens a native raster, requires CRS/geotransform, maps WGS84→pixel→WGS84, checks bounds and pixel-centre error, and separately verifies science bands.

**C.** Proofs are returned and cached in process; they are not stored as immutable/versioned evidence. A binding hash covers the returned proof.

**D.** Missing assets, out-of-bbox coordinates, missing raster metadata, worker errors, and band failures all disable rendering/science. This fail-closed behavior is correct. `coversSelection` is derived from `binding.state !== rejected`, so a runtime dependency failure incorrectly changes catalogue containment to false (`observation-scene.mjs:6`).

**E.** The proof exposes offset in pixels, raster bounds, transform, CRS, and resolution. No fleet-level success/error distribution or monitored threshold exists.

**F.** `centerOffsetPixels <= 0.76` is a fixed engineering acceptance threshold. Remote assets and GDAL/rasterio behavior are assumed available and secure.

**G.** The test design is excellent: prove every band and reject a catalogue bbox that lies. Fixture binding tests also ensure location-specific imagery.

**H.** Both decisive native-raster tests fail before assertions because the environment cannot import rasterio. No malicious remote COG, rotated/sheared transform, antimeridian, nodata, corrupted TIFF, redirect, or egress policy suite.

**I.** Python dependencies are not packaged; startup health still returns `ok` while the capability is unusable. Subprocesses are synchronous per request, with in-memory caching only.

**J.** The round-trip proof is appropriate as one integrity gate, not complete scientific validity. Registration between dates/bands and radiometric validity require additional gates.

**K.** UI separation of metadata, selected pixels, visible fallback, and confirmation is excellent. `currentCondition:usable` and `coversSelection:false` during runtime failure are confusing and should be decomposed.

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 8. Active perception / next-best observation

**Classification:** `integration hook` plus heuristic planner.

**A.** Registry: `apps/api/src/modules/sensors/sensor-registry-service.mjs:4-15`; ranking: `active-perception-service.mjs:1-10`; task seam: `sensor-task-service.mjs:1-12`; event plan: `events/event-action-plan.mjs:1-25`.

**B.** It reads configured static assets, estimates ETA and hard-coded information value, optionally POSTs a bounded task to an HTTPS camera/drone endpoint, and creates a human evidence request from the UI.

**C.** Assets are configuration, plans are transient, evidence requests persist, but sensor task jobs/responses do not persist.

**D.** No assets produces `no_connected_asset`; all 18 public events did so. A field unit is considered taskable without an endpoint. The generic action plan still says field verification is `taskable` even with no registered field unit.

**E.** No task acceptance rate, acquisition completion rate, latency, cost, information gain, availability, or outcome lift. `very_high/high/medium information gain` is hard-coded by asset type.

**F.** Status strings, coordinates, coverage radius, speed, endpoint acceptance, and capabilities are trusted. Availability windows, weather/airspace, battery, crew duty, ownership acceptance, and competing missions are absent.

**G.** Mock tests prove a configured camera ranks ahead of a distant field team and a task POST has bounded fields.

**H.** No connected asset, real task endpoint, retry, cancellation, timeout recovery, asset schedule, cost model, or completed observation return path is tested.

**I.** Task response is not schema-validated or durably tracked. No outbox/retry/idempotency. Configuration endpoints may access arbitrary configured HTTPS hosts.

**J.** Information gain is a label derived from constants, not expected posterior uncertainty reduction.

**K.** The live UI correctly says no connected asset. The presence of generic “Field verification taskable” elsewhere creates conflicting operator guidance.

**L.** Implementation **3/10**. Operational capability **UNMEASURED**.

## 9. Evidence acquisition orchestration

**Classification:** `real but incomplete`.

**A.** Need derivation: `apps/api/src/modules/events/fire-event-service.mjs:20`; display plan: `events/event-action-plan.mjs`; request workflow: `modules/verification/evidence-request-service.mjs:7-72`; field API: `evidence-request-routes.mjs:3-21`; offline client: `apps/web/field/field.js:1-19`.

**B.** The system derives an `actionNeed` for every event snapshot. It only creates durable work after an operator clicks Route/Assign. Requests then support requested→acknowledged→in-progress→submitted→accepted/rejected, with an evidence package/checksum.

**C.** Requests, packages, histories, and due times persist in the operator JSON file. Derived needs and suggested plans are transient. Client offline operations live in browser localStorage until sync.

**D.** There is no connected asset fallback beyond assigning the seeded field actor. The field client falls back from denied GPS to the assignment coordinate and sets accuracy null. Duplicate client operations are not deduplicated. Attachments can be base64 data stored inside the mutable JSON file.

**E.** Counts and lifecycle timestamps exist, but no overdue rate, acknowledgement latency, completion latency by source, retry rate, evidence rejection rate, or unknown-closure rate is monitored.

**F.** A human click is assumed to transform every important unknown into work. Browser localStorage is assumed durable enough. A checksum is treated as evidence integrity without signature or immutable storage.

**G.** Unit/smoke tests prove the happy-path lifecycle, ownership checks, checksum generation, hazard gate, and fixture end-to-end loop. The restart audit proved one request survived.

**H.** No automatic need→request conversion, SLA breach, lost response retry, duplicate sync, offline browser eviction, corrupted attachment, very large queue, concurrent reviewer, or rejected/resubmitted field loop. The duplicate audit explicitly failed idempotency.

**I.** JSON persistence has no database constraints or distributed locking. No durable queue/outbox, object store, device signature, or attachment malware/content validation.

**J.** Evidence packages preserve observer/time/location/provenance fields, but do not establish truth by themselves. GPS can be silently substituted with the assignment coordinate.

**K.** The state machine and visible ownership are useful. Six current/delayed public events remained only derived needs until an operator acted. That violates the mission rule that every unknown become a bounded acquisition task.

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 10. Action, ownership, SLA, audit

**Classification:** `real but incomplete` with two P0 safety/security breaks.

**A.** Authorization: `packages/domain/src/authorization.mjs:1-25`; request actor: `apps/api/src/modules/control/request-context.mjs:1-3`; operator persistence: `operator-state-repository.mjs:55-84`; audit: `audit-service.mjs:6-28`; UI routes/toasts: `apps/web/src/v2/app/action-handler.js:4-58`.

**B.** Requests, hazards, remediations, watches, and audit events write atomically to one JSON file. Due times and owner IDs are displayed. The public server accepts local HTTP mutations.

**C.** State persists across restart. Audit records are stored in the same mutable file as operational entities; they are neither append-only nor externally anchored.

**D.** Role capabilities are enforced only after the request has selected an actor from an unauthenticated header/default. No SLA timer, escalation, reassignment, delivery acknowledgement, or overdue automation exists. Watch records bypass `AuditService`, corrupting chain validity.

**E.** Lifecycle dates exist. No SLA compliance, backlog ageing, ownership acceptance, audit verification monitoring, write-failure alarm, or operational workload metric.

**F.** The client-selected local profile is assumed identity. `dueAt` is assumed to create an SLA. A SHA-256 linked list in a mutable JSON file is presented as immutable.

**G.** Unit tests prove role matrices and happy-path audit chaining in fixtures. The process restart proved state durability. The adversarial audit proved no-header supervisor mutation and a broken chain after watch.

**H.** No authentication, session, tenant boundary, CSRF, audit tamper test, multi-process write, disk-full test, backup restore, SLA breach, or escalation exercise. The UI offers analysts “Review evidence” (`apps/web/src/v2/views/inspector.js:57-66`), while the service requires `verify:hazard`, which analysts do not possess.

**I.** Critical: unauthenticated authority. Critical: audit corruption. High: mutable/non-anchored audit. High: single-process JSON and no concurrency control. Router converts exceptions to HTTP problems but does not log them (`apps/api/src/http/router.mjs:15-20`).

**J.** Not a scientific capability. The integrity claim is cryptographic only in format and is invalid in the reproduced runtime.

**K.** Ownership and lifecycle are understandable. “Route confirmation · 45m SLA” and success toasts overclaim enforcement. “IMMUTABLE AUDIT” is false and can render-break after watch.

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 11. Consequence and asset risk

**Classification:** `safety theatre` in built-in spread; real but partial OSM exposure adapter.

**A.** Gate: `packages/domain/src/consequence-gate.mjs:1-8`; built-in spread: `apps/api/src/modules/spread/screening-spread-provider.mjs:4-11` and `packages/domain/src/spread-envelope.mjs:4-17`; external provider: `external-spread-provider.mjs:3-10`; response/fallback: `response-service.mjs:7-31`; OSM exposure: `overpass-adapter.mjs:3-108`.

**B.** Unsupported/stale incidents are gated. Supported incidents can get deterministic ellipses from weather/risk proxies. Overpass queries mapped buildings/assets. A configured external endpoint can return a scenario.

**C.** Consequence and exposure outputs are transient. No scenario version, input snapshot, review decision, or external provider certificate is persisted.

**D.** External provider failure silently falls back to built-in screening even when the gate said `operational` (`response-service.mjs:18-23`). The exposure endpoint always rebuilds with the screening provider (`:25-31`). Overpass can return partial results.

**E.** Counts by envelope exist. There is no forecast error, arrival-time error, perimeter overlap, exposure completeness, evacuation relevance, or external validation evidence.

**F.** The built-in rate formula and `.72/1/1.34` scales are assumed to represent P10/P50/P90. They are not produced by an ensemble or fitted probability distribution. External configuration alone sets `validated:true` (`external-spread-provider.mjs:9`).

**G.** Tests prove gating and ordered nested ellipses/building counts.

**H.** They do not prove probability/quantiles, fire spread, terrain/fuel/moisture/suppression, forecast skill, Overpass completeness, provider contract, failure downgrade, or operational consequence decisions.

**I.** Silent external fallback can preserve an operational-looking gate with an unvalidated result. No provider health, schema validation, timeout telemetry, provenance store, or circuit breaker.

**J.** Calling the deterministic scales `probabilistic-screening-v3` and `P10/P50/P90` fabricates statistical semantics even with a disclaimer. This violates the constitution's no fabricated confidence rule.

**K.** Truth-stage gating is strong. The map and UI nevertheless give quantile labels and sampled building counts a visual precision they have not earned.

**L.** Implementation **2/10**. Operational capability **UNMEASURED**.

## 12. Alerting

**Classification:** `real but incomplete`.

**A.** Rule generation: `apps/api/src/modules/events/fire-event-service.mjs:21`; persistence/delivery: `modules/alerts/alert-service.mjs:1-10`; watch state: `modules/interventions/command-service.mjs:145-154`; UI: `apps/web/src/v2/app/action-handler.js:13-14,88-91`.

**B.** Derived unreported-physical/growing/lead alerts are persisted. High/critical alerts may be POSTed to one configured webhook. Operators may acknowledge records.

**C.** Alert JSON persists. `watched` is copied into a new alert at creation time; a later watch does not update prior alerts. Watch state itself persists separately.

**D.** With no live alert rule match, watching an event creates no alert or subscription delivery. Webhook failures are completely swallowed. There is no retry, delivery receipt, dead letter, or escalation.

**E.** Count and acknowledgement timestamps exist. No delivery success, latency, false positive, missed alert, watch coverage, acknowledgement SLA, or notification reach metric.

**F.** Rule grades are assumed actionable. A webhook POST is assumed delivery. `Watch event` is assumed by operators to mean future notification.

**G.** A mock test proves alert persistence, copied watch flag, and acknowledgement.

**H.** No file-backed process restart test in the alert test, no real webhook, retry, dedup race, watch-after-alert, rule regression, paging integration, or incident drill.

**I.** Silent delivery failure is unacceptable for an alert surface. Alert routes also inherit unauthenticated actor selection.

**J.** High-severity candidate alerts can originate from uncalibrated high/moderate sensor screens. A disclaimer in the event does not make the severity calibrated.

**K.** Acknowledgement UX is clear. `Watch event` should be renamed to saved local watch until a real monitored delivery contract exists.

**L.** Implementation **3/10**. Operational capability **UNMEASURED**.

## 13. Source health and graceful degradation

**Classification:** `real but incomplete`.

**A.** Source freshness: `packages/domain/src/source-health.mjs:13-36`; refresh/cache: `apps/api/src/modules/world/world-service.mjs:50-162`; event clocks: `modules/events/fire-event-service.mjs:8-12,50-53`; UI aggregation: `apps/web/src/v2/app/render.js:24-27,60-63`.

**B.** Public report/risk/weather sources were current. FIRMS/structured MTG/S3/assets were explicitly not configured. The MTG WMS context had an observed time. Cached source data may be retained as stale when refresh fails.

**C.** A source snapshot cache persists; per-source state is recomputed. WMS metadata uses memory cache. There is no time-series health store.

**D.** Stale data retention is reasonable and labelled. Several source failures silently become empty arrays. World cache writes swallow errors (`world-service.mjs:141`). Runtime errors are sent only to currently connected SSE clients and not logged or persisted (`create-runtime.mjs:1-9,25-39`).

**E.** Age, delivery delay, state, error, and time conflict are available in responses. No source SLO, availability history, alert threshold, owner, incident ticket, or recovery ETA.

**F.** An upstream/fetched timestamp is assumed representative. Source-specific semantics and expected coverage are not always available, so absence cannot become negative evidence.

**G.** Tests prove stale/conflict semantics, WMS fallback, impossible timestamps, and source-specific normalization.

**H.** No prolonged outage, partial payload corruption, clock skew across all feeds, cached-data expiry exercise, rate limiting, credential expiry, or source recovery drill.

**I.** Silent catches and no telemetry are major operational gaps. Bootstrap reported its world `thermal` source as `unavailable/not fetched`, while the live event plane reported MTG WMS current; the top bar alternated between “MTG observed …” and “Mixed source freshness” depending on view.

**J.** Freshness is a delivery property, not physical truth. The UI generally respects that distinction.

**K.** Per-source drawer is useful. The aggregate labels hide which capability is unavailable and provide no owner/SLO/recovery instruction.

**L.** Implementation **4/10**. Operational capability **UNMEASURED**.

## 14. Deployment readiness

**Classification:** local prototype.

**A.** Server/config/runtime: `apps/api/src/server.mjs:14-29`, `config/env.mjs:6-24`, `application/create-services.mjs:49-96`, `application/create-runtime.mjs:12-52`; scripts: `package.json:9-25`.

**B.** One Node process serves static UI and APIs over plain HTTP on loopback by default. It calls public internet sources directly, spawns Python workers synchronously, and stores state in local JSON files.

**C.** Local files provide limited restart durability. There is no database, object store, durable work queue, backup/restore procedure, deployment manifest, container, CI workflow, infrastructure definition, or migration tooling in the repository.

**D.** Initialization begins after the socket listens (`server.mjs:24-27`); health always says `status:ok` and merely reports `sourceRefreshState`. Scientific capability is not included in readiness. External errors are mostly silent/degraded.

**E.** No structured logs, metrics, traces, uptime, latency, capacity, error budget, security events, data-loss tests, recovery objectives, or load tests.

**F.** Single process, trusted local browser, writable disk, stable internet, and manually configured integrations are assumed. The `npm run check` policy deliberately forbids package dependencies (`scripts/check.mjs:25`), conflicting with a managed production runtime.

**G.** Fixture smoke proves a single local process can compose seeded flows. Syntax/static checks are extensive.

**H.** No authentication/tenancy, TLS termination, reverse proxy, secrets manager, database, queue, HA, load, chaos, backup restore, dependency supply-chain control, vulnerability scan, penetration test, disaster recovery, or EOC exercise.

**I.** P0 security and reliability gaps dominate. CSP loads a CDN at runtime and the Permissions Policy disables field GPS. The browser QA command exits success without running a browser.

**J.** Scientific dependencies and versions are not reproducibly packaged. This alone blocks deployment of the claimed native-raster capability.

**K.** The public runtime can be useful for engineering demonstration and truth-model review. It is not safe to put in an operational chain of command.

**L.** Implementation **1/10**. Operational capability **UNMEASURED**.

## What is solid enough to preserve

1. Separate public-report, physical-observation, and behavior clocks/states (`fire-event-state.mjs`).
2. Fail-closed native-raster and science-band binding design (`geo-integrity-service.mjs`, `geo_integrity.py`).
3. No event-existence probability without explicit validated calibration (`evidence-fusion.mjs`).
4. Thermal geometry explicitly says support envelope, not perimeter (`fire-event-geometry.mjs`).
5. Evidence-request/hazard/remediation state machines and human-gated hazard confirmation, once moved behind real identity and durable infrastructure.

## Final capability conclusion

VIGIA currently demonstrates that a truthful wildfire operations interface can be structured, not that VIGIA can detect, measure, forecast, or close wildfire risk in production. The immediate engineering goal must be one closed, observable, authenticated `unknown → acquisition task → physical evidence → operator decision` loop backed by real configured sources. Until that exists and is independently validated, all measured-capability fields remain `UNMEASURED`.
