# Claim truth table

Severity reflects the consequence of misunderstanding the claim in an emergency context, not visual polish.

| Screen | Claim | Backend source | Real/synthetic | Freshness | Calibration | Supported? | Severity | Recommended wording/change |
|---|---|---|---|---|---|---|---|---|
| Global brand | `PHYSICAL INTELLIGENCE` | Product title; `/api/v10/events` | Runtime is real public data but contains 0 physical observations | N/A | No operational validation | **No as an unqualified current-product claim** | High | `Wildfire report and evidence-status prototype` until a real thermal truth loop passes |
| Footer | `PRODUCTION · READ-ONLY · SYNTHETIC OBSERVATIONS REJECTED` | Production config and integrity gate | Real executable boundary | Current process state | Machine-gated, not external certification | **Yes** | — | Keep; link to readiness blockers |
| Live queue | `public reports updated ≤30 min` | `summary.currentReportEvents`; report clocks | Real ptdata public reports | Explicit 30-minute report threshold | Not a physical metric | **Yes** | — | Keep `public reports` adjacent, as now |
| Live queue | `current physical observations` = 0 | Physical observation freshness in event state | Real runtime count | Explicit physical threshold | Not calibrated performance | **Yes** | — | Keep; make this the dominant product health indicator |
| Top source button | `Thermal context 45 min old` | Operational MSG FRP WMS timestamp | Real raster context | Timestamped; broad raster | No event-level calibration | **Yes, with context qualifier** | Low | `MSG raster context · 45m · no event point evidence` |
| Map headline | `Earth observed 45 min ago` | Same broad MSG WMS context | Real broad raster, not selected-event observation | Timestamped | No event-level detection proof | **Misleading** | High | Replace with `MSG raster timestamp 45m ago · 0 event-level physical observations` |
| Event header | `Current report` | ptdata occurrence started/updated time | Real public report | Current/delayed/stale thresholds explicit | N/A | **Yes** | — | Keep; never shorten to `Current fire` |
| Event truth row | `None physical observation` | Event `physicalState.sampleCount=0` | Real runtime absence | Current | N/A | **Yes** | — | Keep; visually pair with source availability |
| Event truth row | `Unknown fire behavior` | `behaviorState=unknown` | Real runtime unknown | Correctly expires | N/A | **Yes** | — | Keep |
| Current knowledge | `Report only — physical state unknown` | Event knowledge/evidence state | Real runtime event | Current report, unobserved physical state | N/A | **Yes** | — | Keep; this is the product's most honest sentence |
| Evidence card | `NO OBSERVATION PATH` | Durable `EvidenceNeed` state | Real persisted product state | Recomputed each snapshot | N/A | **Yes** | — | Keep; expose exact blocker and escalation owner when one exists |
| Evidence card | `Manual observation option` | Generated fallback candidate method | No real owner, connector, availability, ETA, reliability, or cost | Unknown | All ranking dimensions unmeasured | **Technically present, operationally empty** | Medium | Replace with `Manual path unavailable — no authenticated/connected field owner` |
| Evidence ranking | `PARTIAL INFORMATION GAIN UNMEASURED` | EvidenceNeed/observation plan | Architecture plus runtime nulls | Current plan | Explicitly unmeasured | **Yes but operator-hostile wording** | Low | `Ranked by feasibility only; information value/reliability/cost not measured` |
| Event actions | `No observation path configured` disabled | Need state | Real runtime | Current | N/A | **Yes** | — | Keep; add system-owner remediation, not a dead control |
| Local conditions | `0°C / 0% / 0 km/h` for Sintra | API returned null weather values; UI uses `Number.isFinite(Number(null))` | Real source record with missing values | Source current, fields missing | N/A | **No; fabricated zeros** | Critical | Render `— / unavailable`; unit-test null/undefined/empty separately from zero |
| Fire danger | `3/5 · Elevado` | ptdata/IPMA municipal RCM context | Real contextual data with raw product ID | Forecast day explicit in API | Provider scale, not event detection | **Yes with existing qualifier** | — | Keep `context, not proof` adjacent |
| Sensor coverage | `MTG / FCI · Raster context` | Operational MSG WMS | Real broad raster | Timestamped | Not point evidence | **Yes** | — | Keep; provider label should say MSG rather than imply FCI point evidence where appropriate |
| Source drawer | `current` on ptdata sources | Per-source state and upstream timestamp | Real responses | Snapshot current | No SLO/history | **Point-in-time only** | Medium | Show last poll, last success, source timestamp, delay, accepted/rejected counts, next attempt, SLO state |
| Source drawer | `Sentinel-2 acquisition catalogue · current` | Copernicus STAC snapshot | Real catalogue metadata | Can be many hours old within source threshold | No pixel/product readiness proof | **Yes for catalogue only** | Medium | `Catalogue reachable · latest scene metadata … · no owned product archive` |
| Source drawer | `VIIRS active-fire detections · not_configured` | FIRMS gateway/config | Real conditional integration, no key | None | N/A | **Yes** | — | Keep; surface as primary readiness blocker |
| Detection performance | `Insufficient sample · median lead n=0` | Event lead samples | Real runtime count 0 | Current retained window | No benchmark | **Yes** | — | Keep; do not show a median until governed real labels exist |
| Fire view | `5 current reports · 0 physically observed · 7 need confirmation` | Event summary | Real public report/runtime state | Mixed explicit clocks | N/A | **Yes** | — | Keep; add `0 have an observation path` |
| Event ID | `PT-2026-…` stable fire event | Event repository alias/mapping | Current IDs are real report events; physical-first stability synthetic only | 72-hour observation retention | Association uncalibrated | **Partially** | High | `VIGIA event hypothesis` until benchmarked; expose aliases/corrections/provenance |
| Association | `strong/moderate` when physical data exists | Fixed distance/time/confidence heuristic | Synthetic-test evidence only in current artifact | Pair timestamped | `calibrated:false`, probability null | **Only as heuristic fit grade** | High | Always display `heuristic association`; add ambiguous competing hypotheses |
| Evidence fusion API | `physical_evidence`, dependency groups | Evidence ledger | Synthetic tests; no live multisource event | Observation timestamps explicit | No approved calibration | **Aggregation/ledger supported; fusion claim not** | High | Rename product-facing concept `evidence ledger`; reserve `fusion` for validated state estimation |
| Fire geometry API | `observed_thermal_support_envelope` | Hull of pixel footprints | Synthetic-test only in current runtime | Current/aging/stale thresholds | No geometry accuracy validation | **Correctly bounded implementation claim** | Medium | Keep exact `support`, `not perimeter`; do not display without real pixels |
| Behavior | `Growing / Stable / Cooling` | FRP trend over current thermal samples | Synthetic-test only | Behavior expires when physical data stale | Unvalidated thresholds | **Semantically bounded, operationally unproved** | High | `Observed FRP rising/steady/falling in last N min`; never imply fire-front behavior |
| Readiness | Health route returns live/degraded while readiness returns 503 | Runtime refresh vs operational readiness | Real runtime | Current | N/A | **Internally consistent but easy to confuse** | Medium | Show `SERVICE LIVE · OPERATIONALLY NOT READY` in UI; make readiness blockers dominant |
| Acquisition docs | `archive-before-normalize` | `HttpAcquirer` parses/validates before `commitProduct`; domain normalizer runs after commit | Real valid ptdata responses; malformed cases synthetic | Per poll | N/A | **Supported only for valid payload/domain normalization** | High | Say `valid raw response archived before domain normalization`; archive rejected/malformed bodies separately |
| Raw provenance | Event traceable to raw source | Source snapshot/context objects contain raw IDs; report observation drops it | Real raw product exists | Current retention | N/A | **No end to end** | High | Preserve `rawSourceProductId`, normalization version, source timestamp, and checksum on every canonical observation |
| PREVENT | Hidden in production | Native-pixel screening code/tests | Synthetic software verification only | N/A | Uncalibrated | **Correctly not claimed in current UI** | — | Keep hidden/non-production until reviewed real polygon gate passes |
| OUTCOMES | Hidden in production | Outcome services/state | No real closed loops | N/A | Unmeasured | **Correctly not claimed in current UI** | — | Keep absent until independently re-observed outcomes exist |

## Highest-risk claim defects

1. **Null physical context rendered as exact zero values** is the only confirmed critical visible truth defect. A zero is an observation; null is ignorance.
2. **“Earth observed”** conflates regional raster availability with event observation and can defeat the otherwise careful report/physical separation.
3. **“Physical Intelligence”** is a company/product-positioning claim unsupported by the current runtime's zero physical observations.
4. **Event identity/fusion/geometry terminology** is scientifically bounded in the API but can still be read as operationally proven when all real performance is unmeasured.

## Evidence traces

### Sintra visible weather claim

```text
UI: TEMP 0°C · HUMIDITY 0% · WIND 0 km/h
API event.weather: temperatureC=null, humidityPercent=null, windSpeedKph=null
Renderer: Number.isFinite(Number(weather?.temperatureC))
JavaScript: Number(null) === 0
Verdict: unsupported exact values
```

### Sintra report provenance

```text
UI: Public report created · Belas
Event observation provenance: { synthetic:false, origin:"ptdata_public_report" }
Source snapshot: rawSourceProductId exists
Raw archive: checksum-addressed ptdata product exists
Missing link: canonical event observation -> exact rawSourceProductId
Verdict: provider-level trace possible, incident-grade exact lineage incomplete
```
