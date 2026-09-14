# Capability scorecard

## Scoring rule

Implementation readiness measures what the current code/runtime can credibly do. Measured operational performance is deliberately not inferred from architecture or synthetic tests. No capability has a governed real-world performance study, so every performance cell is `UNMEASURED`.

| Capability | Implementation readiness | Measured operational performance | Judgment and evidence |
|---|---:|---|---|
| Fire-event identity | 5 | UNMEASURED | Persistent aliases, merge/split/reject and late-arrival mechanics are credible; association is greedy and there is no real benchmark corpus |
| Physical fire detection | 2 | UNMEASURED | Canonical physical observation paths exist, but the running product had 0 thermal observations and no configured physical source |
| Current satellite exploitation | 3 | UNMEASURED | Real MSG raster context and Copernicus discovery operate; FIRMS is unconfigured and MTG/S3 point paths are parser-only |
| Sensor fusion | 3 | UNMEASURED | Dependency-aware evidence ledger, contradictions, and null calibration are useful; no coherent spatial state estimate or real multisensor case exists |
| Fire geometry/evolution | 3 | UNMEASURED | Thermal pixel support, envelope limitations, movement, and freshness are implemented; no real evolving series is exercised |
| Behavior semantics | 4 | UNMEASURED | Current vs historical thermal behavior and expiry are honest; no real current behavior exists in runtime |
| Geospatial/image integrity | 6 | UNMEASURED | Managed scientific runtime, native pixel binding, per-band proof, abstention, and lying-catalogue rejection are unusually rigorous; operational proofs are 0 |
| Active perception | 2 | UNMEASURED | Registry/schedule feasibility plumbing only; no orbit/pass reasoning, connected asset, validated information gain, reliability, or cost |
| Evidence acquisition | 4 | UNMEASURED | Durable needs, no-path state, accepted-evidence feedback, and valid raw ptdata acquisition exist; every live need remains unserviceable |
| Action/workflow | 2 | UNMEASURED | Backend lifecycle mechanics exist, but no authenticated operator or production action surface exists |
| Prevention detection | 2 | UNMEASURED | Native-pixel screening mechanics and abstention exist in tests; no real reviewed Portuguese finding and route hidden |
| Consequence modelling | 1 | UNMEASURED | Deterministic low/central/high screening is correctly disclaimed; no validated provider or operational route |
| Alerting | 2 | UNMEASURED | Local alert JSON and optional one-shot webhook exist; no visible watch, durable outbox, retry, receipt, or configured delivery |
| Source health | 4 | UNMEASURED | Per-source state and detailed checkpoint API exist; UI omits poll/success/reject/next-attempt history and no SLO is measured |
| Persistence | 4 | UNMEASURED | Atomic JSON, rollback, serialized process writes, and restart smoke work; no DB, object lock, multiprocess control, HA, backup, or DR |
| Security | 3 | UNMEASURED | Public mutation fails closed, sensor HMAC/replay protection exists, and headers/redaction are good; no OIDC, tenant isolation, provisioned identity, or immutable audit |
| Outcome proof | 0 | UNMEASURED | Production has no verified closed-loop outcomes and the route is hidden |
| Deployment readiness | 2 | UNMEASURED | One local Node process and managed Python environment run; no immutable build, deployment manifest, scheduler topology, telemetry, HA, or operations runbook |
| Operator UX | 4 | UNMEASURED | Report/physical/unknown separation is strong; no real action path or geometry, source status is incomplete, and null weather is rendered as zero |
| Portfolio proof | 5 | UNMEASURED | Strong reality gate, geo integrity, failure-path engineering, and truth semantics; flagship physical-intelligence result is absent |

## Overall

The implementation median is approximately **3/10**: a partial product with several credible engineering foundations. Geospatial integrity is the sole capability at a credible-foundation level. The core differentiated claims—physical detection, fusion, active perception, living-fire geometry, prevention, actions, and outcomes—remain prototype/theatre or architecture-only.

## CEO kill test

| # | Question | Answer | Evidence |
|---:|---|---|---|
| 1 | If public incident reports are disabled, does VIGIA still discover physical fires? | **NO in the delivered runtime.** | FIRMS not configured; MTG/S3 point paths not configured; 0 physical observations |
| 2 | If every synthetic fixture is disabled, is the application still useful? | **PARTIALLY.** | It remains a real public-report/context dashboard with honest gaps; it loses the capabilities implied by physical intelligence |
| 3 | Does production automatically obtain real observations rather than wait for manually supplied files? | **YES for ptdata/context; NO for point-level physical observations.** | Eight live ptdata checkpoints; thermal point sources absent/parser-only |
| 4 | Can a real physical observation create a durable event? | **ARCHITECTURE IMPLEMENTED — PRODUCT CAPABILITY NOT DEMONSTRATED.** | Signed/token ingest and FIRMS code exist; only synthetic tests exercise physical-first creation |
| 5 | Can that event survive restart? | **SYNTHETICALLY VERIFIED ONLY.** | Repository/restart tests pass; no real physical event exists |
| 6 | Can a later public report join the same event? | **SYNTHETICALLY VERIFIED ONLY.** | Late-arrival replay/test passes; no real corpus |
| 7 | Can I trace the event back to exact raw external evidence? | **NO, not reliably end to end.** | Event report provenance drops `rawSourceProductId`; malformed provider bodies are not archived |
| 8 | Does VIGIA know when its physical knowledge becomes stale? | **YES in software.** | Physical freshness and behavior expiry are explicit; no live physical samples to observe operationally |
| 9 | Does stale knowledge automatically create evidence work? | **It creates a durable need, not actionable work.** | Needs synchronize automatically; all live unresolved needs were no-path with no owner/request |
| 10 | Can VIGIA tell me when another useful observation may arrive? | **NO in current production.** | Empty static opportunity registry; no provider pass/orbit integration |
| 11 | Does fusion create information beyond a chronological observation list? | **PARTIALLY.** | It adds dependency grouping, contradiction and negative-evidence eligibility; it is aggregation/ledger, not validated state estimation |
| 12 | Does the map show a living physical phenomenon? | **NO.** | Markers/public reports only; 0 thermal geometry in runtime |
| 13 | Does PREVENT detect a meaningful physical condition from real imagery? | **NO demonstrated product result.** | Route hidden; screening only synthetically verified; no reviewed real finding |
| 14 | Can that finding be traced back to exact real pixels? | **The proof mechanism can; no current real finding can.** | GeoIntegrity proof architecture strong; runtime persisted proofs 0 |
| 15 | Can the product prove any intervention reduced a physical hazard? | **NO.** | No production outcomes or independent re-observations |
| 16 | Are the strongest performance metrics based on real/replay data rather than fixtures? | **NO performance metrics exist.** | All operational metrics explicitly unmeasured; test replay synthetic |
| 17 | Would you authorize deployment in shadow mode at an EOC? | **NO for the exact artifact.** | Zero physical observations plus null-to-zero weather display; consider only after these are corrected and branding narrowed |
| 18 | Would you authorize it to directly influence real emergency decisions? | **NO.** | Readiness 503, no physical sources/auth/validation/safety case |
| 19 | Would you invest further? | **CONDITIONAL.** | Only in the five gated vertical moves; no horizontal platform expansion |
| 20 | Would you feature this as the engineer's flagship portfolio project? | **PARTIALLY.** | Feature truth-preserving systems/geo integrity, not proven physical intelligence |

## Runtime evidence snapshot

Independent audit commands produced:

```text
TMPDIR="$PWD/.tmp" npm test     -> 122 tests, 122 pass
npm run check                    -> pass; 309 files / 250 JavaScript modules
npm run reality:gate             -> pass; 140 production modules; 0 fiction/leaks
npm run geo:doctor               -> pass; rasterio/pyproj/shapely runtime ready
npm run smoke                    -> pass; persisted 16 events/16 observations across restart
npm run browser:qa               -> pass; desktop/fire/mobile, Live/Fire only, 0 console errors
npm run test:replay              -> pass; synthetic software replay; validation UNMEASURED
GET /api/v10/ready               -> 503 not_ready
```

The live event count changed during the audit as the public source refreshed. Across captures, physically current events, thermal observations, multisource events, and lead-time samples remained 0. This distinction matters: dynamic public reports prove ingestion, not physical detection.
