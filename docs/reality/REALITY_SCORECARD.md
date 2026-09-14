# VIGIA reality scorecard

**Evidence timestamp:** 2026-08-10 17:18 UTC
**Release decision:** R0 PASS; MOVE 1 BLOCKED — REAL PROVIDER EXECUTION REQUIRED; agency deployment NO-GO

This scorecard separates real runtime evidence from software behavior exercised with synthetic inputs. It deliberately assigns no maturity score.

## Release state

| Release | State | Runtime evidence | Missing gate evidence |
|---|---|---|---|
| R0 — fixture-free production | **PASS** | Machine gate: 141 production modules, 0 fixture/test imports, 0 synthetic observations out of 30 persisted observations, 0 demo identities, 0 served synthetic assets, 0 served operational-fiction markers | None for the bounded R0 gate |
| R1 — live acquisition fabric | **MOVE 1 BLOCKED / FAIL** | Real ptdata responses are archived; 465 SHA-256-addressed products and 8 healthy checkpoints were visible; local PostGIS 3.5 committed real report/event/checkpoint transactions; actual PostGIS duplicate physical-transaction behavior passed in TEST | FIRMS is `not_configured`; MTG and Sentinel-3 point products remain parser-only; no real point-level thermal product has passed through raw archive → canonical observation → PostGIS event |
| R2 — real fire event engine | **BLOCKED** | Public reports create persistent report-only events; software event identity tests pass | No externally attributable real historical thermal replay corpus |
| R3 — close the unknown | **BLOCKED** | Durable evidence-need state machine exists | No authenticated operational principal, connected asset, or confirmed real schedule in default production |
| R4 — living fire | **BLOCKED** | Thermal geometry/trend mechanics are synthetic-test verified | No archived real evolving thermal point series exercised end to end |
| R5 — real prevention | **BLOCKED** | Native-pixel integrity and screening mechanics are tested | No real Portuguese detector campaign or reviewed prevention finding; PREVENT is hidden |
| R6 — operational proof | **BLOCKED** | Metric calculators exist | No independently labelled corpus or prospective exercise; performance is `UNMEASURED` |

## Verified with real data

- Production acquired current ptdata fire, risk, weather, warning, municipality and history responses.
- Original response bytes were archived under `data/runtime/raw-source-products/ptdata/` with matching SHA-256 filenames.
- Eight ptdata checkpoints reported `healthState=healthy`, zero consecutive failures, source timestamps, cursors and product IDs.
- The live API reported 28 public-report events, 0 point thermal observations and 0 current physical observations at 17:18 UTC.
- Copernicus catalogue discovery was current. Operational MSG FRP raster context was current with source time 16:45 UTC. Neither is counted as point-level fire evidence.

## Verified only synthetically

- Configured FIRMS CSV acquisition archives before normalization, deduplicates, and produces canonical thermal inputs.
- Acquisition restart, duplicate, out-of-order, malformed-product and checkpoint-persistence-failure behavior.
- Complete physical PostGIS transaction and duplicate idempotency against an isolated TEST database.
- Event association, fusion, thermal support geometry, late-arrival replay, evidence-need lifecycle, field evidence and prevention screening.

## Unmeasured

- Portuguese wildfire detection precision, recall, false-alarm rate, missed-fire rate and lead time.
- Physical event association accuracy, split/merge rate and thermal geometry error.
- Observation information gain, source reliability and comparable acquisition cost.
- Prevention detector performance and intervention outcomes.
- Source availability SLOs and recovery time under sustained provider failure.

## Blocked

- Real point-level VIIRS: `NASA_FIRMS_MAP_KEY` is absent.
- Real MTG FCI and Sentinel-3 SLSTR point products: acquisition is absent; configured paths are parsers/consumers only.
- Production mutations: no OIDC/JWKS/session or provisioned service principals.
- Production data plane: the verified PostGIS instance is local and single-node; raw bytes and non-physical operational state remain filesystem/JSON without object lock or HA proof.
- Real replay: no attributable raw historical corpus or label authority was supplied.
