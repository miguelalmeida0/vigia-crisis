# CEO VERDICT

## Grade

D

## One-sentence verdict

VIGIA is now an honest, fixture-free public-report dashboard with unusually careful truth semantics, but it has not demonstrated the real physical sensing, fusion, action, or validation needed to be physical intelligence.

## What changed materially

The delivered working tree removed the production demo universe, seeded personas, generated operational imagery, fixture provider imports, synthetic replay masquerading as evidence, and unearned PREVENT, ACTION, FIELD, and OUTCOMES navigation. Production now rejects synthetic observations, exposes a public read-only principal, archives successful real ptdata responses by SHA-256, persists acquisition checkpoints, distinguishes public-report freshness from physical-observation freshness, and represents unresolved physical uncertainty as durable `EvidenceNeed` state.

This changed the product from a misleading, fixture-capable operational simulation into an honest, degraded read-only product. That is a real category improvement in integrity.

It did **not** change VIGIA into a physical-intelligence system. At audit runtime, `/api/v10/ready` returned 503, point thermal observations were 0, physically current events were 0, multisource events were 0, FIRMS was not configured, MTG/Sentinel-3 point paths were parser-only, and every active unresolved event was report-only with `NO_OBSERVATION_PATH`.

## What did not change materially

- VIGIA still depends on public incident reports for all visible fire events. With that feed removed, the delivered configuration has no physical fire-discovery source.
- Event identity, association, fusion, thermal geometry, active perception, prevention screening, accepted field evidence, replay, and persistence mechanics remain proven with synthetic software scenarios only.
- There is no real historical thermal corpus, independent label authority, measured detection performance, association benchmark, agency exercise, or prospective pilot.
- The action plane is inaccessible in production: no OIDC/JWKS/session, no provisioned operator, no tenant boundary, no connected asset, and no confirmed observation schedule.
- Local JSON/filesystem persistence remains a single-process engineering store, not a transactional or highly available operational data plane.
- Prevention, outcomes, consequence, alert, mission, and workflow services still exist and are registered in the production monolith even though their product surfaces are hidden or unearned (`apps/api/src/application/create-services.mjs:84`, `apps/api/src/application/register-routes.mjs:35`).
- The visible map still represents public reports primarily as markers. There is no real sensor-supported evolving fire geometry to display.

## What Agent 1 actually accomplished

Agent 1 performed the first serious truth audit and then repaired important software mechanics. The time-bounded change window is approximately 2026-08-09 19:37–22:27 WEST; no commit records its endpoint.

Material accomplishments:

- Diagnosed the original fake-auth, corruptible audit, non-idempotent field sync, inert evidence unknowns, silent persistence failure, uncalibrated probability/information-gain claims, stale behavior, and missing scientific runtime problems in `docs/audit/`.
- Added a durable `EvidenceNeed` lifecycle, explicit `NO_OBSERVATION_PATH`, evidence-request/accepted-evidence feedback, idempotent receipts, and failure-path tests.
- Added event-observation persistence with rollback on failed writes, correction mechanics, stable aliases, and synthetic merge/split/late-arrival tests.
- Reworked evidence fusion to expose dependency groups, contradictory observations, inadmissible negative evidence, and null probability without approved calibration.
- Reframed thermal geometry as observation support rather than perimeter authority and expired behavior semantics when evidence becomes stale.
- Added managed geospatial runtime checks, persisted GeoIntegrity proofs, and adversarial native-raster binding tests.
- Removed fabricated P10/P50/P90 meaning, fake information-gain values, and fabricated outcome certainty.

Agent 1 created the largest amount of defensible internal capability, but much of it remained architecture verified only with synthetic inputs and inaccessible operationally.

## What Agent 2 actually accomplished

Agent 2 executed the Reality Cutover beginning at approximately 2026-08-09 23:02 WEST. Its own changeset states that a large uncommitted P0 recovery already existed at cutover start (`docs/recovery/CHANGESET.md:3`).

Material accomplishments:

- Mechanically separated production from TEST, rejected the legacy fixture switch, removed production fixture imports/assets/personas, and added an executable production-reality gate.
- Made production public and read-only instead of pretending that a client-selected header was an authenticated operator.
- Hid PREVENT, OUTCOMES, FIELD, and ACTION until evidence earns them; removed the fake field app and local event-save path from the served product.
- Added real scheduled ptdata acquisition, SHA-256-addressed raw product storage, durable checkpoints, non-regressing cursors, duplicate protection, and a read-only acquisition status API.
- Wired a conditional real FIRMS acquisition path with secret-bearing URI redaction, while truthfully reporting it as not configured in the audited runtime.
- Added production smoke/restart, import-graph, served-root, browser, replay-universe, synthetic-count, and demo-identity gates.
- Rewrote product copy around report-only knowledge, missing physical evidence, source status, and `UNMEASURED` performance.

Agent 2 created the largest **real product improvement** because it removed operational fiction and connected the shipped runtime to attributable real ptdata responses. It did not complete the Reality Cutover to physical-world fire sensing: R1 remains failed by its own release gate.

## Five strongest genuine achievements

1. **The production/test reality boundary is real.** `npm run reality:gate` traversed 140 production modules and found 0 fixture/test imports, 0 synthetic production observations, 0 demo identities, 0 served synthetic assets, and 0 operational-fiction markers. `VIGIA_FIXTURES=1` failed closed with `ProductionIntegrityViolation` (`apps/api/src/config/env.mjs:9`).
2. **Truth semantics are materially better than the capability.** The API and UI distinguish report freshness from physical freshness, return null probability without approved calibration (`packages/domain/src/evidence-fusion.mjs:46`), label thermal hulls as non-authoritative support (`packages/domain/src/fire-event-geometry.mjs:14`), and expose unmeasured ranking dimensions rather than inventing values.
3. **Real ptdata acquisition preserves useful raw evidence.** During the audit, production fetched live ptdata products, created eight source checkpoints, and wrote SHA-256-addressed raw files whose contents matched their filenames. The store rejects provider-product checksum conflicts and serializes local writes (`apps/api/src/modules/acquisition/acquisition-store.mjs:21`).
4. **Geospatial integrity fails closed.** The managed Python runtime loaded rasterio/pyproj/shapely, all geo doctor checks passed, and tests reject a raster whose native georeferencing contradicts correct-looking catalogue metadata. Model-consumed geometry is explicitly bound to native pixels and proofs persist.
5. **The software failure paths are unusually well tested.** 122/122 tests passed; architecture checks passed across 309 files / 250 JavaScript modules; production smoke survived API restart; acquisition duplicate, malformed, out-of-order, checkpoint-write failure, event correction, stale behavior, and negative-evidence cases are represented. These prove mechanics, not wildfire performance.

## Ten most serious weaknesses

1. **No real point-level physical fire source is operating.** FIRMS is not configured; MTG and Sentinel-3 point paths are parsers/consumers; the audited runtime had 0 thermal observations and 0 physically current events. This defeats the core company claim.
2. **Public reports remain the product's event source.** The current product cannot demonstrate discovery of a physical fire without a public report. Physical-first creation, later report association, and restart identity are synthetic-test results only.
3. **Operational performance is entirely unmeasured.** There is no real replay corpus or independent labels for precision, recall, missed fires, false alarms, lead time, association, geometry, source reliability, or operator outcomes.
4. **End-to-end provenance is incomplete.** The selected Sintra event's report observation retained only `{synthetic:false, origin:"ptdata_public_report"}` while the source snapshot had the raw product ID; `buildEventObservations` drops that link (`packages/domain/src/fire-event-tracker.mjs:21`). Invalid/malformed provider payloads are parsed before archival and therefore disappear from the evidence record (`apps/api/src/modules/acquisition/http-acquirer.mjs:10`).
5. **Association is a forced nearest-candidate heuristic.** It uses distance, time, and source confidence with fixed weights (`packages/domain/src/event-association.mjs:51`), then greedily selects the first candidate (`packages/domain/src/fire-event-tracker.mjs:105`). It does not model competing hypotheses, footprint/uncertainty, trajectory, or event geometry and has no genuine ambiguous-association state.
6. **Unknowns are durable but not closable.** At runtime all active needs were `NO_OBSERVATION_PATH`; owner, request, next observation, information gain, reliability, latency, and cost were absent or unmeasured. The historical catastrophic state has changed from inert unknowns to explicitly recorded unserviceable unknowns, not to accountable acquisition work.
7. **There is no production operator boundary or operational data plane.** Public mutation correctly fails, but no OIDC, principals, tenant isolation, Postgres/PostGIS, object lock, scheduler lease, outbox, dead-letter queue, or HA deployment exists.
8. **The production monolith is broader than the product.** Hidden prevention, outcome, consequence, response, intervention, mission, and alert planes are still constructed and routed. This increases attack surface and maintenance cost without current buyer value.
9. **The UI can fabricate physical context.** For Sintra the API returned null temperature, humidity, and wind, while the live inspector rendered `0°C`, `0%`, and `0 km/h` because `Number(null)` is treated as finite (`apps/web/src/v2/views/live.js:18`). “Earth observed 45 min ago” describes broad MSG raster context, not event-level observation (`apps/web/src/v2/views/live.js:7`).
10. **Deployment and operational observability are absent.** There is no deployment manifest or infrastructure definition, source SLO history, structured metrics backend, tracing, DR drill, durable alert delivery, or safety case. Unknown API GETs also fall through to the SPA and return HTML 200 (`apps/api/src/http/static-files.mjs:43`).

## Product theatre still present

- The unqualified product brand “PHYSICAL INTELLIGENCE” is stronger than a runtime with 0 physical observations.
- “Earth observed … ago” visually elevates broad MSG raster context into language that can be mistaken for selected-event physical evidence.
- Internal documentation and code use “sensor fusion,” but the implementation is a dependency-aware evidence ledger/aggregation unless an approved calibration record exists.
- “Manual observation option” is displayed for every need even when there is no authenticated owner, dispatch integration, known availability, latency, reliability, or cost.
- Source cards say “current” without showing last poll, rejection count, next attempt, data delay, or an operational SLO; the acquisition API has more detail than the operator surface.
- Hidden PREVENT/OUTCOMES/CONSEQUENCE/ACTION code preserves platform-scale appearance without earned product capability.

## Biggest architectural mistake

Building a broad multi-plane crisis-management monolith before proving one end-to-end physical fire truth loop. The system instantiates dozens of prevention, consequence, outcome, workflow, and alert services while its only operating fire inputs are public reports and broad raster context.

## Biggest product mistake

Designing and branding the operator experience around “Physical Intelligence” before VIGIA could automatically acquire a single real point-level thermal product and maintain a physically observed fire through time.

## Biggest missed opportunity

Concentrating the entire program on one real provider and one governed Portugal replay corpus. A single impeccable FIRMS/VIIRS truth loop with benchmarked identity and provenance would have created more product, commercial, and portfolio value than the combined unvalidated breadth.

## What I would delete Monday morning

- Remove hidden PREVENT, OUTCOMES, CONSEQUENCE, ACTION, FIELD, intervention, and alert planes from the production composition and route graph; keep experiments under explicit non-production entrypoints.
- Remove or rename unearned operator language: “Physical Intelligence,” “Earth observed,” “fusion,” and generic “current” source status where the exact evidence class is not adjacent.
- Delete the `Number(null) -> 0` rendering path immediately; unknown environmental values must render `— / unavailable`.
- Remove manual acquisition options when no real owner or connector exists; show one explicit blocked reason instead.
- Move stale public reports out of the primary action queue into history unless they retain an active operational purpose.

## What I would keep at all costs

- The production/test import boundary and executable no-fiction gate.
- Separate report and physical clocks, freshness expiry, null probability, negative-evidence eligibility, and `UNMEASURED` semantics.
- The raw-product/checkpoint foundation, after hardening it into object-locked storage plus transactional metadata.
- Native-pixel geospatial binding, per-band integrity, persisted proof records, and scientific abstention.
- EvidenceNeed states, especially `NO_OBSERVATION_PATH`, as the truth contract for every unresolved physical claim.
- Thermal support/perimeter separation and physical observation normalization.

## What I would rebuild immediately

One narrow, event-sourced fire truth loop: real FIRMS or owned MTG FCI point acquisition; immutable raw object storage; canonical observation lineage; PostGIS event identity with explicit ambiguity; event-time replay; a physically evolving evidence workspace; and measured performance on a governed corpus.

## Emergency operations centre verdict

NO

The exact delivered artifact should not be placed in an emergency operations centre, even as a shadow screen, because it combines an unearned physical-intelligence brand with zero physical observations and a confirmed null-to-zero weather display defect. After those visible truth defects are removed, a strictly isolated engineering shadow trial could be considered. Direct decision influence is prohibited.

## Investment verdict

CONDITIONAL

Fund only a bounded program that completes one real thermal truth loop, a governed replay benchmark, transactional provenance, and an authenticated shadow workflow. Do not fund more horizontal features, route breadth, visual polish, or general platform architecture until those gates pass.

## Portfolio flagship verdict

PARTIALLY

The reality gate, truth semantics, geospatial integrity tests, acquisition checkpoint design, and failure-path discipline are Staff+/Principal-level evidence. The “physical intelligence” thesis is not. Feature it only as a case study in truth-preserving system design and reality cutover, with all wildfire-performance claims marked unmeasured.
