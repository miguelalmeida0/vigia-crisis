# VIGIA 4.0 — Portugal Live architecture

## Product loop

```text
Physical world
    ↓
Current Observation Fabric
    ↓
Inspection priority / reported incident
    ↓
Owned evidence request
    ↓
Attributable evidence package
    ↓
Verified hazard or verified incident
    ↓
Remediation / consequence workflow
    ↓
Completion evidence + independent re-observation
    ↓
Outcome Studio + audit + model learning contract
```

## System shape

VIGIA 4.0 is a modular monolith with explicit bounded contexts. This keeps local development and cross-context transactions simple while preserving extraction seams for independently scaled services.

```text
Public/configured sensors and data
  ANEPC-derived reports · IPMA · ICNF · Sentinel-1/2 · FIRMS
  cameras/drones/field evidence · external spread · exposure data
                              │
                              ▼
                       source adapters
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        geo-temporal world state    immutable raw provenance
                 │
                 ▼
        Current Observation Fabric
                 │
       ┌─────────┼──────────┐
       ▼         ▼          ▼
   Prevention  Incident   Exposure
       │        Truth        │
       └─────────┼──────────┘
                 ▼
        authorization + commands
                 ▼
 evidence requests / hazards / remediation / consequence
                 ▼
      audit ledger + outcome projections + SSE invalidation
```


## Live sensing plane

Portugal Live is intentionally separated from evidence/remediation workflows. The live plane composes observations; it does not mutate incident truth.

```text
ANEPC-derived occurrences ─┐
IPMA risk + observations ──┼── WorldService ── LiveFireService ── /api/v4/live
NASA FIRMS VIIRS ──────────┘                         │
                                                      ├─ report correlation
MTG FRP WMS ──┐                                     ├─ satellite-only candidates
MSG FRP WMS ──┴── LiveThermalAdapter ───────────────└─ source clocks + alerts
                      │
                      └─ /api/v4/live/thermal/overlay → Portugal atlas
```

The MTG and MSG adapters discover FRP layers and time dimensions from WMS capabilities. MTG is preferred for cadence/resolution; a failed GetMap request falls through to the healthy MSG provider. The frontend receives only same-origin raster URLs and stable normalized metadata.

A matched VIIRS point may corroborate a public report under the spatial/temporal correlation policy. An unmatched point remains `satellite-only` and carries `operationalClaim: false`. The geostationary WMS raster is never silently converted into verified incident truth.

## Bounded contexts

### Control
Owns organizations, workspaces, territories, actors and role-based authorization. Every command receives an actor context; UI role switching is a local demonstration of the same contract.

### World
Owns acquisition, normalization, freshness, cache retention and public world state. It does not verify hazards or authorize actions.

### Current Observation Fabric
Resolves the best available observation for a place and decision. The resolver considers recency, cloud, sensor suitability, resolution and source state. It can return current optical imagery, a previous comparable observation, radar fallback and historical baseline. Annual mosaics are never promoted to current-condition proof.

### Prevention
Creates neutral inspection priorities from risk, weather, recent occurrence pressure and observation coverage. It may attach detector findings only when a registered detector produced attributable output. A priority is not a detected physical hazard.

### Verification
Owns evidence requests and packages:

```text
requested → acknowledged → in_progress → submitted → accepted/rejected/cancelled
```

Evidence records actor, capture time, coordinate, GPS accuracy, observations, attachments, provenance and checksum.

### Hazard
Creates physical-hazard records only from accepted evidence. Direct verification routes that bypass evidence are not registered.

### Remediation
Owns accountable risk reduction:

```text
queued → assigned → in_progress → awaiting_reobservation → verified → closed
```

Closure requires completion evidence and an independent re-observation outcome.

### Detection
Builds incident identity and evidence from public records, thermal observations and accepted human evidence. A timestamp firewall rejects null, epoch-like, future and implausible source times instead of turning them into valid-looking ages.

### Consequence
Enforces truth-stage gates before scenario generation. Unsupported or stale reports remain locked. Corroborated events can receive provisional screening. Verified incidents can use a configured validated provider. Exposure loads independently and terminates as available, partial or unavailable.

### Outcomes
Projects closed before/action/after loops, median remediation time and assets removed from exposure. These metrics are the commercial and learning layer—not page views.

### Audit
Appends hash-chained material events. The local implementation verifies chain integrity and exposes the ledger to authorized operators.

### Mission / Ground Truth
Composes read models for the frontend. It contains no source parsing or safety policy.

## Domain package

Framework-free domain modules own:

- authorization;
- evidence request transitions;
- attributable evidence envelopes;
- timestamp validation;
- consequence gates;
- observation selection policy;
- remediation transitions;
- outcome metrics;
- incident evidence policy;
- spread-screening geometry.

The domain package imports no HTTP, UI or source-adapter code.

## Frontend composition

```text
main.js
  → v2/app/app.js               orchestration only
      → store.js                client state
      → api.js                  transport
      → views/*                 read-only rendering
      → app/modal-workflows.js  explicit user commands
      → components/*            bounded UI primitives
      → map/controller.js       stable map interface
```

The visual hierarchy is map/imagery first. Queue and inspector are contextual work surfaces. Mobile exposes explicit Work Queue and Details sheets rather than hiding critical operations behind the map.

## Field Capture

The field workspace is a separate offline-ready surface optimized for attributable evidence capture. It records GPS/time/observer/note/photo/checklist and stores unsent packages locally. A service worker caches the shell. Production deployment should replace local queued blobs with encrypted device storage and signed resumable uploads.

## Persistence

The install-free reference implementation uses an atomic JSON repository. Its schema already separates organizations, actors, evidence, hazards, remediations, re-observations and audit events.

Production replacement:

```text
PostgreSQL + PostGIS
  organization-scoped row-level security
  immutable evidence metadata
  object storage for media
  outbox table for durable events
  append-only audit projection
```

Repository/service contracts keep that migration isolated from domain and UI layers.

## Scale path

Only split services when operational scale requires it:

1. source ingestion workers;
2. imagery processing and change inference;
3. evidence/media service;
4. validated spread provider;
5. notification/tasking service;
6. analytical outcome warehouse.

The current modular monolith avoids distributed-system cost while retaining clean seams.

## Reliability and performance

- source-specific timeouts and failure isolation;
- no synthetic fallback in public-source mode;
- stale-cache state remains explicit;
- source timestamps pass through a firewall;
- deterministic local vector atlas avoids map-CDN failure;
- SSE carries invalidations rather than authoritative state;
- exposure cannot block consequence geometry;
- install-free runtime reduces supply-chain and setup risk;
- 220-line module budget and import-cycle checks prevent god files.

## Production hardening required before operational deployment

- OIDC/JWKS authentication and signed sessions;
- database-enforced tenant isolation;
- encrypted object storage and evidence retention policy;
- malware scanning and media redaction;
- durable queues, retries and idempotency keys;
- SLOs, tracing, source-health alerts and incident response;
- offline conflict resolution and device identity;
- validated/certified fire-behaviour integration;
- formal security, privacy and safety assessment.

## V5 event plane

VIGIA 5 adds a bounded `events` context above source adapters. The context owns normalized observation history, spatial-temporal association, event evolution, lead-time metrics and derived alert candidates. It does not mutate the underlying public report or sensor record.

`EventObservationRepository` retains normalized observations independently of the UI so event history survives normal source refreshes. Raw inputs remain attributable by source and timestamp. The renderer receives event projections only; it has no authority to change event truth.

## V6 Living Fire plane

V6 upgrades the event context from a point-centric projection into a time-aware operational object. `fire-event-tracker` owns event identity and state; `event-association` owns cross-source pair quality; `fire-event-geometry` derives approximate observed thermal geometry; and `thermal-candidate-policy` screens satellite-only candidates without promoting them into verified fires.

The web application uses the same event object across Portugal Live, Fire Workspace and Command. A replay index selects the same historical observation state for the timeline and selected event geometry. Incompatible selections are discarded during view transitions so prevention, event and raw-incident state cannot leak across product areas.

Earth-observation discovery is isolated behind `ObservationFabricService`. Renderable Sentinel-2 browse assets, radar metadata, broad VIIRS context and historical baselines retain separate identities. The current architecture exposes a future COG tile/crop seam without coupling the UI to a particular raster-processing vendor.

## V7 Operational Fire OS plane

V7 separates **source activity** from **physical knowledge**. `fire-event-state` produces independent report, physical-observation, knowledge and behavior states. `fire-event-tracker` consumes those states but cannot promote a public report into physical observation or derive a thermal trend from fewer than two fresh point observations.

Public and fixture execution paths use separate repositories and separate state files. This is an integrity boundary rather than a UI convention: a clean public process cannot read deterministic demo event history unless explicitly configured to do so.

The observation plane now exposes renderability and sensor modality as first-class attributes. `ObservationFabricService` selects a current observation and a distinct comparable observation. `EarthSearchGateway` exposes Sentinel-2 browse and COG asset references. The browser-side change-screening component samples aligned real browse pixels only when the resolver declares the pair eligible; its output is a non-operational screening projection and never creates a domain hazard record.

The web read model uses intent surfaces: Live, Action, Prevent and Fire. Action routing can project unresolved event work alongside prevention priorities. Map rendering consumes observed thermal geometry from the same event history used by replay so temporal state cannot diverge between the chart and the map.

## V9 Sensor Fusion Core plane

V9 adds a physical-observation plane around the existing Fire Event graph.

```text
public reports ───────────┐
VIIRS ────────────────────┤
MTG/FCI structured pixels ┤
camera / ground / drone ──┤──> observation normalization
field evidence ───────────┘              │
                                         v
                                  persistent Fire Event
                                         │
                   ┌─────────────────────┼────────────────────┐
                   v                     v                    v
             current knowledge      acquisition plan      alert/watch
                                         │
                                         v
                               configured physical asset
```

The live world stream and the Observation Studio intentionally use separate interaction lifecycles. Background source refreshes may update event/map state but cannot reconstruct a user's active imagery workbench. Observation requests are selection-bound and cancellable; stale responses are discarded.

Scientific imagery work is similarly separated: the browser displays native COG crops and can run bounded screening over source bands, while browse previews remain visualization fallbacks rather than a substitute for analysis-grade pixels.


## V10 Physical Intelligence Core plane

V10 makes physical evidence and scientific provenance the hard boundary of the system rather than an attribute of the renderer.

```text
VIIRS / MTG FCI / Sentinel-3 SLSTR / camera / ground / drone / field
                               │
                               v
                 physical-observation.v1
                source family + dependence
                               │
                               v
                 persistent Fire Event graph
                 │             │             │
                 v             v             v
          evidence fusion   geometry      active perception
          no fake P(fire)   observed       ranked next sensor
                            support only

Sentinel-2 / high-res EO
        │
        v
STAC + native-raster GeoIntegrityGate
        │
        ├── reject wrong-place / unproved bands
        v
server-side spectral + fuel-continuity screening
        │
        v
GeoJSON candidates + provenance + abstention
```

`GeoIntegrityService` is fail-closed: catalogue metadata is necessary but not sufficient. The selected coordinate must exist in the actual raster CRS/geotransform, reverse projection must land within pixel tolerance, and each band consumed by inference must pass independently. Browser previews are presentation only.

`EventObservationRepository` owns stable observation→event identity. Automatic association is heuristic and explicitly uncalibrated. Operator merge/split/reject corrections become persistent manual bindings and audit events; later refreshes cannot silently undo them.

`fuseEventEvidence` counts independent sensor families rather than raw observation count. It emits evidence strength but no existence probability without an externally validated calibration profile. Thermal pixel footprints are represented as observed support, never relabelled as an authoritative perimeter.

The validation boundary is separate from unit/browser correctness. `validation:fire` consumes labelled retrospective or prospective cases and measures detection quality, identity fragmentation/false merges, lead time, prevention performance and abstention. Operational promotion thresholds belong to the external validation policy, not to the product implementation itself.
