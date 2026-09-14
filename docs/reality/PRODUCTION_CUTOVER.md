# VIGIA production runtime reality graph

**Cutover:** R0 — kill the demo runtime
**Captured:** 2026-08-09
**Branch / baseline:** `master` / `c6e28bd` with an existing uncommitted recovery changeset
**Release gate:** production synthetic observations = 0 and the production import graph cannot reach fixture providers

This document traces the production-facing application backwards from operator-visible state to physical or local origin. It records the pre-cutover graph first and is updated with the R0 proof below. An empty production view is acceptable. A populated synthetic view is not.

## Runtime entry and universes

### Pre-cutover graph

```text
package.json dev/start/dev:live/dev:demo/dev:fixture
  -> apps/api/src/server.mjs
     -> loadConfig()
        -> VIGIA_FIXTURES=1 selects the fixture universe in the same process
     -> createServices()
        -> statically imports apps/api/src/fixtures/fixture-gateway.mjs
        -> WorldService switches live/fixture source graphs at runtime
        -> OperatorStateRepository imports pilot fixture seeds
        -> multiple production modules switch to local generated imagery/data
```

This violates R0 even when `VIGIA_FIXTURES` is unset: the production entry can import and activate fixture providers. There is no independent replay server. The replay script is arrival-ordered, but its bundled corpus is synthetic TEST data and is not operational evidence.

### Required R0 graph

```text
apps/api/src/server.mjs
  -> PRODUCTION only
  -> real/public gateways or explicit unavailable state
  -> production persistence files
  -> ProductionIntegrityViolation on synthetic provenance

TEST
  -> test files/support only
  -> synthetic fixtures allowed

REPLAY
  -> recorded real source products only
  -> no future observations
```

There is no DEMO universe after cutover.

### Post-cutover graph

```text
apps/api/src/server.mjs
  -> loadConfig(): production only; legacy fixture/test universe throws
  -> createServices()
     -> real ptdata/Copernicus/FIRMS gateways
     -> AcquisitionStore raw archive/checkpoints
     -> production-only event/state files
     -> ProductionIntegrityViolation for synthetic production or replay observations

apps/api/test/**
  -> fixtures/runtime, fixtures/web-assets, fixtures/field-app, fixtures/replay
  -> synthetic provenance required/allowed only in TEST

scripts/replay_external_portugal.mjs
  -> externally labelled real corpus required
scripts/test_replay_portugal.mjs
  -> synthetic software corpus under test fixtures
```

## Operator UI state -> API -> origin

| Visible state | API/service path | Current origin | Reality classification | R0 disposition |
|---|---|---|---|---|
| LIVE fire queue and map | `/api/v10/events` -> `OperationalEventService` -> `FireEventService` | ANEPC-derived reports through ptdata; FIRMS if keyed; structured MTG/Sentinel-3 consumers; persisted device observations | Mixed real sources and parser/input hooks | Keep, empty/degraded when real sources are absent |
| LIVE thermal raster | `/api/v10/events/thermal/overlay` -> `LiveThermalAdapter` | IPMA/LSA SAF WMS; pre-cutover preference selects an MTG product marked `demonstration`, then operational MSG | Real raster context, not point evidence; demo-labelled provider selected | Quarantine demo-labelled provider from production; retain operational real context |
| LIVE event history/geometry | event repository -> tracker/fusion/geometry | Derived from the above observations in local JSON | Real if every input is real; pre-cutover fixture-capable | Add production provenance guard and machine count |
| ACTION queue | bootstrap operations + event evidence needs | Local JSON; prior state may contain pilot-seeded identities/work | Local-only workflow persistence; not an external dispatch integration | Start new production state without seeded work; show only real-derived needs |
| FIRE view | same `/api/v10/events` graph | Same source and persistence graph as LIVE | Duplicate view over real/unknown event state | Keep |
| PREVENT | `/api/v2/bootstrap`, `/api/v2/observations/resolve`, change-screening | Real risk/weather/catalogues and native COG analysis, but also generated fixture imagery/findings in fixture mode | No real end-to-end validated detector; synthetic surface existed | Production navigation OFF by default |
| FIELD | `/api/v2/field`, field sync routes | Local browser queue and local JSON; actors were seeded personas | Real workflow code, fake identity path, no production principal | Not available to unauthenticated production users |
| OUTCOMES | `/api/v2/outcomes` | Local evidence/remediation/re-observation records; fixture seeds previously populated it | No measured operational outcomes | Production navigation OFF by default |
| Actor/session control | `/api/v2/bootstrap`, `/api/v2/control`, `x-vigia-actor-id` | Four hard-coded pilot personas; optional development bearer chooses one | Fake identity path | Remove seeded production identities and client-selected actor header |
| Audit drawer | `/api/v2/audit` | Hash-linked entries in the same mutable local JSON file | Local transition log, not immutable audit | Keep bounded wording; no operational identity claim |
| Source drawer/top bar | bootstrap source states + event clocks | Per-gateway current/stale/unavailable flags | Mostly real, but vague aggregate wording and demo mode labels existed | Expose production/unavailable truth; remove demo mode |

## Acquisition and provider graph

| Provider | Current implementation | Real acquisition? | Persistence/checkpoint | Credentials/config | R0 status |
|---|---|:---:|---|---|---|
| ptdata / ANEPC reports | Scheduled HTTP snapshot every refresh | Yes | Latest source cache only | None | REAL, retained |
| ptdata / IPMA risk, weather, warnings | Scheduled HTTP snapshot every refresh | Yes | Latest source cache only | None | REAL, retained |
| ptdata / ICNF history | Scheduled HTTP query | Yes | Latest source cache only | None | REAL, retained |
| NASA FIRMS VIIRS | Scheduled CSV requests for NOAA-20, NOAA-21, S-NPP | Yes when configured | Canonical event observations; no raw archive/checkpoint | `NASA_FIRMS_MAP_KEY` | REAL but currently BLOCKED when key absent |
| MTG FCI WMS | Capabilities/GetMap and report-coordinate GetFeatureInfo | Partial: raster context and report-location probe | Memory cache; no raw archive | None | Real context only; demo-labelled product quarantined |
| MTG FCI FRP structured points | Local NetCDF directory or normalized JSON URL | **No owned acquisition**; parser/consumer only | Canonical observations after delivery | `VIGIA_MTG_FRP_DIR` or `VIGIA_MTG_FRP_JSON_URL` | PARSER ONLY |
| Sentinel-3 SLSTR FRP | Local product directory or normalized JSON URL | **No owned acquisition**; parser/consumer only | Canonical observations after delivery | `VIGIA_SENTINEL3_FRP_DIR` or `VIGIA_SENTINEL3_FRP_JSON_URL` | PARSER ONLY |
| Sentinel-2 catalogue/native COG | CDSE/Earth Search STAC queries; remote native assets | Yes for discovery/access, not an owned archive | Integrity proofs persisted; products not archived | Network + scientific runtime | REAL discovery; detector unvalidated |
| Sentinel-1 catalogue | CDSE STAC query | Yes for catalogue only | None | Network | REAL metadata, no analysis integration |
| NASA GIBS | WMS broad visual context | Yes | Memory cache | None | REAL context, never physical point evidence |
| EOX annual mosaic | WMS frame | Yes | Memory cache | None | REAL historical context, not current observation |
| OpenStreetMap Overpass | On-demand exposure query | Yes | Memory cache | None | REAL partial context, not authoritative inventory |
| External camera/drone/field/device | Registry, task endpoint and signed/token ingest seams | Only if an attributable asset is configured | Registry file; accepted observations in event JSON; task not durable | Registry credentials/endpoints | NOT CONFIGURED by default |
| Future observation opportunities | Static JSON registry | Only if records are externally attributable and confirmed | JSON file | Provider schedule integration absent | NOT CONFIGURED by default |
| External spread provider | On-demand HTTPS call | Only if configured and separately approved | None | Endpoint/key/approval record | BLOCKED; no automatic promotion |
| Alert webhook | One-shot POST | Only if configured | Alert JSON, no durable delivery outbox | Webhook URL | NOT CONFIGURED by default |

## Synthetic, demo, seed, and fallback inventory

### Synthetic provider/data paths reachable before R0

- `apps/api/src/application/create-services.mjs` imported `FixtureGateway` in the production graph.
- `apps/api/src/config/env.mjs` and `server.mjs` allowed `VIGIA_FIXTURES=1` to change the production entrypoint into a demo server.
- `WorldService` switched between real gateways and `FixtureGateway` at runtime.
- `OperatorStateRepository` imported pilot operation/audit seeds and created fake hazards, requests, remediations, outcomes, and actor-attributed transitions.
- `DetectorRegistry` imported fixture finding data and exposed synthetic detector models/findings.
- `ImageryService`, `CurrentImageryService`, `Sentinel1Gateway`, `GeoIntegrityService`, `ObservationFabricService`, and `ExposureService` contained fixture branches.
- Generated fixture imagery lived under the production static web root and was therefore publicly fetchable.
- The same production server powered fixture smoke/browser checks.

### Fake identity and manual seed paths

- `createControlSeed()` created one pilot organization, workspace, territory, and four named personas.
- `x-vigia-actor-id` plus a development bearer selected one of those personas.
- The browser persisted `actor-supervisor` and sent it on every request.
- Existing `state-v10-demo.json` and `state-v10-public.json` files contain actor-attributed local work; they are legacy engineering state, not authenticated production state.

### Local-only persistence

- Operator/evidence/remediation/audit state: one mutable JSON file.
- Event observations, mappings, corrections, and derived states: one JSON file.
- Alerts: one JSON file.
- Source cache: one JSON file.
- Geospatial proof index: one JSON file.
- Field offline queue: browser `localStorage`.
- Sensor assets and future opportunity records: static JSON configuration.

This is restart persistence, not a transactional production data plane. R1 must replace or explicitly harden it; R0 must not describe it as immutable, authenticated, or sufficient.

### Acceptable real fallbacks versus forbidden synthetic fallbacks

- Retaining a stale previously fetched real source with explicit stale metadata is acceptable.
- Showing a real NASA GIBS image as cross-sensor visual context is acceptable when it cannot enable science.
- Retaining real public risk/weather context when Overpass fails is acceptable and must remain labelled partial.
- Returning local generated imagery, seeded events, fake assets, fake outcomes, or fake identities when a provider is absent is forbidden.
- Missing providers must return `NOT_CONFIGURED`, `UNAVAILABLE`, `BLOCKED`, or an empty truthful collection.

### R0 disposition by path

| Pre-cutover path | Exact affected modules/assets | Disposition |
|---|---|---|
| Fixture source graph | `create-services.mjs`, `WorldService`, former `apps/api/src/fixtures/fixture-gateway.mjs` | Production import/switch removed; gateway moved to `apps/api/test/fixtures/runtime/` |
| Runtime fixture switch | `env.mjs`, `server.mjs`, package scripts | `VIGIA_FIXTURES` now throws `ProductionIntegrityViolation`; demo/fixture scripts removed |
| Pilot identities and seeded work | `OperatorStateRepository`, former control/pilot seed modules, request context, browser API | Production starts empty; seeds moved to test fixtures; actor header/bearer cannot grant authority |
| Synthetic prevention findings | `DetectorRegistry`, former fixture finding catalogue | Production model/finding import removed; catalogue moved to test fixtures; PREVENT hidden |
| Generated imagery/fallbacks | imagery/current-imagery/Sentinel-1/observation-fabric/geo-integrity/exposure modules; `apps/web/assets` | Fixture branches removed; generated assets moved below `apps/api/test/fixtures/web-assets/`; production static asset count zero |
| Synthetic event population | fire tracker/repository, mission/workflow/integrity tests | Production provenance guard added; synthetic scenarios retained only in TEST |
| Demo-labelled MTG provider | `LiveThermalAdapter` | Demonstration product removed from production selection; operational MSG raster retained as context only |
| Fixture smoke/browser runtime | `scripts/smoke.mjs`, `production_smoke.mjs`, browser QA scripts | All checked-in smoke/browser commands now start production and assert zero synthetic state |
| Synthetic replay masquerading as replay | package scripts, replay CLI/data | Corpus moved to test fixtures and command renamed `test:replay`; real replay command requires externally labelled input |
| Fake field persona/offline app | former `apps/web/field/`, `x-vigia-actor-id` | App moved to `apps/api/test/fixtures/field-app/`; no fake field surface is served |
| Save-event-locally workflow | live inspector, client API/handler, event watch routes | Visible action and production HTTP routes removed |
| Seeded outcomes | outcome repository/state, pilot seed | Production state starts empty; OUTCOMES hidden and feature flag false |

## Workflows without a real observation path

| Workflow | Missing real path | Required truth now |
|---|---|---|
| Report-only fire -> physical confirmation | FIRMS key and owned MTG/Sentinel-3 acquisition may be absent; no connected field asset | Durable need with `NO_OBSERVATION_PATH` or owned manual escalation; never fixture evidence |
| Stale physical fire -> refreshed observation | No exact next-pass schedule/footprint by default | Waiting only for attributable confirmed schedule; otherwise explicit no path/escalation |
| PREVENT fuel-continuity candidate | No validated Portuguese detector campaign or archived native-product pipeline | UI disabled; capability remains screening/unmeasured |
| Field evidence | No authenticated principal/device provisioning | Production mutation unavailable |
| Alert delivery | No durable outbox/retry/receipt | Local alert state only; no delivery claim |
| OUTCOMES | No real intervention/re-observation dataset and no independent measurement | UI disabled; metrics `UNMEASURED` |
| Consequence forecast | No approved forecast provider/validation | No production forecast claim; deterministic screens are not probability |

## R0 invariant and machine proof

The cutover must enforce all of the following:

1. The production entrypoint has no transitive import under `apps/api/src/fixtures` or test fixture assets.
2. The production entrypoint rejects the legacy `VIGIA_FIXTURES` switch.
3. A production repository rejects an observation with `provenance.synthetic === true` using `ProductionIntegrityViolation`.
4. Production readiness reports the persisted synthetic observation count and fails unless it is exactly zero.
5. Production has zero seeded demo identities.
6. PREVENT and OUTCOMES are absent from production navigation until their release gates are independently met.
7. Synthetic assets remain available only to tests and are not served by the production static root.

## R0 evidence

R0 is **PASS** for its bounded fixture-free-production gate.

### Machine/runtime proof

- `npm run reality:gate` at 22:42 UTC traversed **140** production modules.
- Fixture/test imports reachable from production: **0**.
- Persisted production observations: **18**; synthetic observations: **0**.
- Demo identities: **0**.
- Served synthetic assets: **0**.
- Served fake field/demo/local-save markers: **0**.
- Legacy fixture switch: rejected.
- Production smoke before and after API restart retained **16 events / 16 observations**, with **0 synthetic observations** and **0 demo identities**. Readiness remained false, correctly, because real physical sources/auth were absent.
- Browser QA passed desktop, Fire and 390×844 mobile surfaces with only Live/Fire visible and zero console errors. In-app browser independently showed the production integrity label, no PREVENT/OUTCOMES controls and no console warnings/errors.

### Commands executed

```text
npm run check
TMPDIR="$PWD/.tmp" npm test
npm run reality:gate
npm run smoke
npm run browser:qa
npm run test:replay
```

Full suite result at the R0 boundary: **118/118 passed**. After entering R1, acquisition-fabric tests added four further passing cases; the final complete count is maintained in `docs/recovery/STATUS.md`.

### R1 entry and blocker

R1 began only after the R0 gate passed. Production now archives real ptdata response bytes and advances durable source checkpoints; the captured runtime contained 24 raw products and eight healthy checkpoints. This is not the R1 release gate because ptdata reports/context are not a physical thermal source. FIRMS remains `not_configured`, and MTG/Sentinel-3 point products remain parser-only.

Exact next engineering step: provision a real FIRMS key through a secret boundary and prove one live VIIRS product through raw archive, checkpoint, canonical observation, event persistence and restart deduplication. If that credential remains unavailable, implement owned EUMETSAT MTG FCI FRP discovery/fetch ahead of the existing parser.
