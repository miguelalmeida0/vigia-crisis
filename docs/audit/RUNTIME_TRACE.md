# VIGIA Runtime Trace

**Captured:** 2026-08-09, default public-source runtime on `127.0.0.1:4189`
**Purpose:** literal input → transform → persistence → API → UI trace. This document describes what executed, including degraded paths; it is not the intended architecture.

## 1. Process bootstrap and trust boundary

```text
process.env
  → apps/api/src/config/env.mjs
  → apps/api/src/application/create-services.mjs
      → OperatorStateRepository.initialize()      data/runtime/*.json
      → SensorRegistryService.refresh()           data/config/sensors.json
      → AlertService.initialize()                 data/runtime/alerts-v10.json
  → HTTP server starts listening
  → runtime.initialize()
      → WorldService.initialize()/refresh()
      → FireEventService.snapshot()
      → AlertService.sync()
  → 30 s refresh timer + 25 s SSE heartbeat
```

The socket listens before asynchronous world initialization completes (`apps/api/src/server.mjs:24-27`). `/api/v2/health` always returns `status:"ok"` and exposes `sourceRefreshState`, but it does not gate on source availability, scientific runtime, storage durability, connected assets, alert delivery, or authentication.

Every request crosses this trust boundary:

```text
HTTP request
  → applySecurityHeaders(res)
  → resolveRequestActor(req, controlService)
       requested = req.headers['x-vigia-actor-id']
       actor = requested || 'actor-supervisor'
  → router.safeHandle(..., { actor })
  → domain assertCan(actor, capability)
```

There is no authentication before `assertCan`. The header is identity, and absence means supervisor (`apps/api/src/modules/control/request-context.mjs:1-3`). Reproduction:

- `GET /api/v2/bootstrap` with no headers returned `actor-supervisor` and all supervisor capabilities.
- `POST /api/v10/events/PT-2026-85B12C6099/watch` with no headers returned `{"watched":true}`.
- The corresponding no-header DELETE also succeeded.

This invalidates all authorization, tenant, attribution, audit, and non-repudiation claims above the HTTP layer.

## 2. Public source ingestion

### 2.1 Public reports, risk, weather, warnings, history

```text
api.ptdata.org
  → PtDataGateway.snapshot()
  → ptdata-normalizers.mjs
  → WorldService.#performRefresh()
      → keep fresh data, or retain previous data as stale on outage
      → data/runtime/source-cache.json
  → /api/v2/bootstrap, /api/v10/events, /api/v2/incidents
```

Captured state: reports, risk, weather, warnings, history, and Copernicus metadata were `current`. Source fetch timestamps and upstream timestamps were present.

Failure behavior: a failed source can retain old data as `stale`. Several adapter errors become empty arrays or generic unavailable states. The world cache write error is swallowed (`apps/api/src/modules/world/world-service.mjs:125-142`).

### 2.2 FIRMS point detections

```text
NASA_FIRMS_MAP_KEY
  → FirmsGateway
      → three NASA VIIRS NRT CSV requests
      → normalize coordinate/time/FRP/confidence/scan/track/type/platform
      → cross-feed deduplication
  → WorldService.thermalDetections
  → FireEventService
```

Captured state: `NASA_FIRMS_MAP_KEY` was unset, so the gateway returned `not_configured`, zero detections, and the explicit setup error. No network request occurred.

### 2.3 MTG/MSG WMS context

```text
IPMA / LSA SAF WMS GetCapabilities
  → LiveThermalAdapter.#probe()
      → choose MTG demo product, MSG operational fallback
  → WMS GetMap overlay
  → /api/v10/events/thermal/overlay
  → map raster context
```

Captured state: MTG WMS was `current`, product status `demonstration`, with an observation time around 27 minutes old. This is raster context, not point evidence.

Optional report probe:

```text
current report coordinate + WMS provider
  → MtgFeatureInfoGateway.probeReports()
  → WMS GetFeatureInfo at the report pixel
  → heuristic text/JSON FRP extraction
  → normalized MTG physical observation only if a positive FRP is parsed
```

This probes at most 24 known report locations. It is not an independent territory-wide MTG detector.

### 2.4 Structured MTG and Sentinel-3 pixels

```text
external product delivery (not implemented here)
  → VIGIA_MTG_FRP_DIR or VIGIA_MTG_FRP_JSON_URL
  → newest NetCDF parser / normalized JSON
  → normalized MTG FCI points

external product delivery (not implemented here)
  → VIGIA_SENTINEL3_FRP_DIR or VIGIA_SENTINEL3_FRP_JSON_URL
  → newest local product parser / normalized JSON
  → normalized Sentinel-3 SLSTR points
```

Captured state: both were unset and returned `not_configured`. The repository contains parsers and file/JSON consumers, not EUMETCast/CDSE acquisition, job control, backfill, or delivery monitoring.

### 2.5 External physical sensors

```text
data/config/sensors.json
  → SensorRegistryService
  → ActivePerceptionService / SensorTaskService / SensorIngestService

device POST /api/v9|v10/sensors/observations
  → token or per-device HMAC + nonce check
  → normalizePhysicalObservation()
  → EventObservationRepository.merge()
```

Captured state: asset list empty; ingest/task tokens unset; zero observations. All 18 plans returned `no_connected_asset`.

## 3. Event identity, state, and fusion

```text
WorldService.fires
WorldService.thermalDetections
MtgFrpGateway.data
Sentinel3FrpGateway.data
MtgFeatureInfoGateway matches
device observations already in event repository
  → buildEventObservations()
      → canonical report/report_update/physical records
      → timestamp firewall + coordinate validation
  → EventObservationRepository.merge()
      → deduplicate by observation ID
      → retain 72 h
      → data/runtime/fire-event-observations.public.json
  → trackFireEvents()
      → greedy chronological association
      → fixed spatial/temporal thresholds
      → report/physical freshness and thermal trend
      → observed thermal support envelope and centroid movement
  → EventObservationRepository.reconcileEvents()
      → reuse oldest observation→event mapping
      → apply manual observation→event binding
      → persistent public event ID
  → FireEventService enrichment
      → association heuristic
      → sensor-family fusion
      → risk/weather/coverage
      → actionNeed + transient actionPlan
      → active-perception plan
  → GET /api/v10/events
  → Live / Action / Fire UI
```

Captured pre-correction snapshot:

```text
18 retained events
6 active current/delayed report events
0 physically current
0 physical observations of any kind
0 multisource
0 satellite-only
0 current thermal trends
0 lead-time samples
18 no_connected_asset plans
```

The report and physical clocks are correctly separated. A recent public report did not become a current physical fire state.

### Manual correction persistence probe

```text
POST /api/v10/events/corrections/merge
  source PT-2026-71A9A8B3EB
  target PT-2026-C8EF3DE6D1
  → EventCorrectionService.assertCan(correct:event_association)
  → EventObservationRepository.mergeEvents()
      → manualObservationEvents + observationEvents
      → correction log
      → JSON atomic write (errors suppressed)
  → restart Node process
  → refresh reports + load event JSON
  → reconcileEvents()
```

Before merge: 18 events. After merge: 17. After process restart: 17; target existed with two observations; source ID did not exist. This proves one merge survived one restart. It does not prove split/reject restart durability, concurrent writers, disk failure, expiry behavior, or long-term upstream corrections.

Important failure path: `EventObservationRepository.#save()` catches and discards every persistence error. The API can return a successful correction that never reached disk (`apps/api/src/modules/events/event-observation-repository.mjs:83`).

## 4. Parallel incident model

The repository has two different fire truth graphs:

```text
V10 event graph
  FireEventService
  physical-first / report + arbitrary physical sensors
  72 h event repository
  /api/v10/events

V2 detection incident graph
  DetectionService + EvidenceEngine + IncidentDeduper
  public reports + older thermal correlation path + operator incident decisions
  /api/v2/incidents, consequence gate
```

At the same public snapshot the event graph held 18 retained events and 6 current/delayed confirmation needs, while the detection graph held 22 unique incidents and said all 22 required confirmation. Consequence analysis uses the detection incident graph, not the V10 event graph (`apps/api/src/modules/response/response-service.mjs:12-16`). Operators therefore see two competing identity/count/truth-stage planes.

## 5. Satellite observation resolution and geospatial proof

```text
operator opens prevention place
  → GET /api/v2/observations/resolve?lon&lat
  → in parallel:
      WorldService snapshot
      Sentinel1Gateway snapshot
      EarthSearchGateway STAC search
      optional HighResStacGateway
  → resolveObservation()
      → choose preferred optical/radar metadata
      → choose comparison scene
  → GeoIntegrityService.verifyScene(primary/comparable)
      → catalog bbox containment
      → spawn VIGIA_GEO_PYTHON workers/geospatial/geo_integrity.py
      → rasterio open remote native COG
      → CRS + geotransform + coordinate/pixel/reverse projection proof
      → repeat for red/NIR/SWIR/SCL
  → if verified: selected-scene native COG render + science eligibility
  → if rejected: NOAA-20 VIIRS GIBS broad-context fallback
  → Prevent UI observation workbench
```

Captured Mirandela result:

```text
selected scene: S2C_29TPF_20260806_0_L2A
catalog bbox: contains [-7.1812, 41.4823]
native assets: visual + red + NIR + SWIR16 + SCL present
integrity state: rejected
reason: geospatial_runtime_unavailable:No module named 'rasterio'
renderAllowed: false
scientificInferenceAllowed: false
visualState: cross_sensor_context
fallback: NOAA-20 VIIRS Corrected Reflectance True Color
change screen: abstained, no findings
```

The fallback was correctly labelled broad context from another sensor. Two semantic defects remain:

1. `currentCondition:"usable"` is computed from selected metadata age even when pixels cannot be used.
2. `coversSelection:false` is derived from the rejected binding state, so missing runtime is displayed as if the catalogue footprint rejected the coordinate. Catalogue containment and verified pixel binding are different facts.

### Scientific screen path

```text
POST /api/v10/observations/change-screening
  → resolve scenes again
  → require both science bindings
  → GeospatialAnalysisService
  → spawn spectral_change.py / fuel_continuity.py
  → unvalidated screening polygons only
```

In the captured runtime the request stopped before analysis with `Pixel-level geographic integrity has not been proven...`. `npm run geo:doctor` confirmed the configured Python has none of the required libraries.

## 6. Prevention path

```text
riskToday + nearest weather + nearby public occurrences
  + nearest EO catalogue freshness
  + constant exposure proxy
  → buildPreventionCandidates()
  → engineering priority 0-100 + band
  → generic four-item inspection checklist
  → DetectorRegistry.findings()
      public mode: []
      fixture mode: checked-in synthetic findings
  → /api/v2/prevention
  → Prevent / Action queues
```

Captured output: eight priority places, score 70-74, zero urgent, zero screening findings, zero verified hazards. The UI explicitly said `INSPECTION PRIORITY · NOT A DETECTED HAZARD` and described why each place was ranked. This is a risk-driven inspection queue, not physical prevention detection.

The registry lists four model names, but outside fixture mode it runs none. Only the separate native Sentinel-2 spectral/fuel scripts contain an analysis implementation, and those were unavailable.

## 7. Unknown → evidence request → field evidence

### 7.1 Derived unknown

```text
FireEventService.actionNeed(event)
  → current/delayed report without physical evidence
  → { kind:'confirm_public_report', needsRouting:true }
  → eventActionPlan(event)
      requirements + generic source options + suggested SLA
  → UI badge/button
```

This is transient. There is no durable `EvidenceNeed` object and no automatic job creation. At capture time six event unknowns existed and only the audit-created request was durable.

### 7.2 Operator route

```text
click Route confirmation
  → browser selects recommended owner or seeded field actor
  → optional SensorTaskService.task() if configured remote asset
  → POST /api/v2/evidence-requests
  → EvidenceRequestService.create()
  → OperatorStateRepository.mutate()
      data/runtime/audit-public-state.json
  → AuditService.record(evidence.requested)
  → SSE operator.changed
```

Audit diagnostic request `evidence-request:feea0c75-6612-4281-bf79-48573f13329d` survived two process restarts.

### 7.3 Field capture

```text
GET /field/
  → service-worker shell + localStorage queue
  → GET /api/v2/field using x-vigia-actor-id: actor-field
  → navigator.geolocation.getCurrentPosition()
      blocked by server Permissions-Policy
      catch → assignment coordinate, accuracy:null
  → image file compressed to base64 data URL
  → operations with random clientId stored in localStorage
  → POST /api/v2/field/sync
      acknowledge/start/submit in sequence
  → evidence package written to operator JSON
```

The HTTP response for `/field/` includes `permissions-policy: geolocation=(), microphone=(), camera=()`. The app catches the geolocation failure and retains the assignment coordinate. That avoids total capture failure but can make requested position and observed capture position indistinguishable unless an operator notices null accuracy.

Duplicate reproduction used the same `clientId` twice in one sync request:

```json
[
  {"clientId":"AUDIT-DUPLICATE-1","ok":true},
  {"clientId":"AUDIT-DUPLICATE-1","ok":false,"error":"invalid_evidence_request_transition"}
]
```

The server returns HTTP 200 for the batch. The client requeues the failed operation. If a successful response is lost, retries can become permanently invalid because no processed-client-ID ledger exists.

## 8. Hazard, remediation, and outcome path

```text
submitted evidence package
  → supervisor review accepted/rejected
  → accepted request required by HazardService.verify()
  → verified hazard
  → RemediationService.create()
  → owner assignment / progress
  → completion evidence package
  → supervisor reobservation
  → verified + closed
  → OutcomeService.snapshot()
```

The human gate is real. The “independent re-observation” property is not enforced: any actor with `approve:closure` can attach a re-observation and close, including the same supervisor involved earlier. Attachments and state are all in one mutable JSON trust domain.

Outcome metric derivation is not real measurement:

```text
operator-entered remediation.assetsRemovedFromExposure = N
  → assetsBefore = N + 5
  → assetsAfter = 5
  → assetsDelta = N
  → UI label MEASURED CHANGE
```

Source: `apps/api/src/modules/outcomes/outcome-loop.mjs:19-24`. No accepted pre-action exposure screen or verified post-action screen is used to calculate those counts.

## 9. Audit path and reproduced corruption

Normal path:

```text
material service transition
  → AuditService.record()
      previousHash = state.audit[0].hash || GENESIS
      hash = SHA256(JSON(base))
      prepend record
  → same operator JSON file
  → AuditService.verifyChain()
  → GET /api/v2/audit
  → UI drawer labelled IMMUTABLE AUDIT
```

Watch path:

```text
click Watch event
  → CommandService.watchEvent()
      prepends {type, entityId, at, actor}
      no id, actorId, entityType, previousHash, or hash
  → same audit array
  → verifyChain() false
  → audit UI calls event.hash.slice(...)
```

After one request record and one watch record, the persisted array contained the unhashed watch event before the hashed request event. API result:

```json
{"valid":false,"count":2,"head":null}
```

After subsequent hashed field transitions and restart, the chain remained invalid. The ledger is also mutable on disk and has no external anchor, append-only medium, signature, trusted timestamp, or access control.

## 10. Consequence path

```text
DetectionService incident (not V10 event)
  → consequenceGate()
      reject unsupported/stale
      corroborated → provisional
      verified + external endpoint configured → operational
  → provider
      external endpoint, else built-in screening
  → deterministic ellipse generator
      base rate from risk/wind/humidity/fuel/slope proxy
      scales 0.72 / 1.00 / 1.34
      labels P10 / P50 / P90
  → optional Overpass mapped assets/buildings
  → consequence UI/map
```

The built-in shapes are not statistical quantiles. If the configured external provider fails, `ResponseService.build()` silently falls back to screening even though the gate level was operational. `ResponseService.exposure()` always uses the screening provider. No result is persisted with source/input/version.

## 11. Alert/watch path

```text
FireEventService rules
  → unreported physical candidate / growing thermal trend / early lead
  → AlertService.sync()
      deduplicate by alert ID
      copy watched flag at creation time
      data/runtime/alerts-v10.json
      optional one-shot webhook
  → acknowledge API/UI
```

`Watch event` does not create a delivery subscription, SLA, or alert record. It stores an ID. An alert appears only if a later rule matches. Webhook failures are swallowed and never retried. A watch added after alert creation does not update the persisted alert's `watched` field.

Captured public runtime: zero alerts. The watch diagnostic persisted but did not generate an alert.

## 12. Source health, logs, and failure visibility

```text
adapter result {data,state}
  → evaluateFreshness(upstreamAt/fetchedAt/staleAfter/error)
  → current / stale / unavailable / conflict / not_configured
  → API source state + event clocks
  → top-bar aggregate + source drawer
```

Good: per-source timestamps/errors and separate report/physical clocks.

Broken/incomplete:

- bootstrap `sources.thermal` said `unavailable: Not fetched yet`, while the live event plane's MTG WMS was current;
- top bar reduced failures to `Mixed source freshness` outside Live and changed to `MTG observed ...` in Live;
- no health history, owner, SLA, recovery ETA, or notification;
- router 500s are not logged;
- many catches discard errors;
- runtime errors are emitted to currently connected SSE clients only;
- server console output is startup text only.

## 13. Browser trace

Because `npm run browser:qa` executed no browser, the in-app browser was used against public mode.

Observed Live:

- explicit separation of public freshness and physical freshness;
- `0 current physical observations` and `0% of active events physically current`;
- current/delayed report rows said `physical Unobserved` and exposed Route actions;
- selected Abrantes event said `Report only — physical state unknown`;
- MTG card said raster context, not point evidence;
- next observation said no connected asset.

Observed Action:

- one audit-created request was assigned;
- five other current/delayed fire events were unassigned at that instant;
- prevention watches were secondary;
- source label changed to `Mixed source freshness`.

Observed Prevent:

- Sentinel-2 metadata existed but pixels were rejected;
- visible sensor was NOAA-20 VIIRS broad context;
- UI explicitly said selected-scene pixels unavailable and detailed inspection unavailable;
- Mirandela was labelled inspection priority, not detected hazard;
- candidate score 74/high was displayed despite zero screening findings.

Observed Field:

- the audit-created request rendered after restart;
- page claimed GPS/time/observer/note/evidence remain queued offline;
- response header disabled geolocation.

## 14. What is live, fixture, mock, or merely configured

| Surface | Public-runtime truth |
|---|---|
| ptdata reports/risk/weather/warnings/history | real live HTTP source |
| Copernicus/Earth Search metadata | real live catalogue queries |
| Sentinel-2 native COG URLs | real source URLs discovered |
| Sentinel-2 pixels/science | unavailable due missing runtime |
| VIIRS broad context imagery | real browse context, not point fire evidence |
| NASA FIRMS point evidence | real adapter, unconfigured |
| MTG WMS | real raster context, demo product selected |
| MTG/Sentinel-3 structured points | parser/consumer hooks, unconfigured; acquisition absent |
| Cameras/sensors/drones/field units | empty registry; mock-tested only |
| Prevention detector findings | fixture-only registry output; public runtime none |
| Spectral/fuel screens | real unvalidated scripts, unavailable runtime |
| Event identity | real heuristic + JSON persistence |
| Evidence workflow | real local manual workflow |
| Audit immutability | false claim; mutable file and reproduced invalid chain |
| Built-in spread P10/P50/P90 | deterministic unvalidated shapes, not quantiles |
| Outcomes/assets removed | seeded/operator-entered arithmetic, not measured exposure change |
| Browser QA | static-only in audited environment despite exit 0 |

## 15. Runtime conclusion

The only complete public path today is `public report/risk/weather → truthful unknown display → optional manual evidence request stored locally`. The physical observation, automated acquisition, validated analysis, alert delivery, consequence forecasting, and measured outcome paths do not close. Authentication and audit corruption make even the manual path unsafe until recovered.
