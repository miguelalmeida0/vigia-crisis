# WHAT VIGIA CAN NOW REASON ABOUT

VIGIA now calculates qualified incident and community support, primary and retained alternative options, significant-road dependencies, explicit redundancy, simultaneous failure consequences, retained coverage gaps, and support changes across dated snapshots. Ask VIGIA uses deterministic tools for these questions. The existing briefing, community drawer, map coverage layer, Scenario Mode and Time Machine expose the results without a new primary route.

**The sprint is not release-certified.** Implementation and evidence are delivered, but the measured map gate and operational readiness remain red. Local inference failed qualification and remains disabled. Missing routes, missing qualification, stale source state and absent historical outcomes remain explicit.

## P0 PERFORMANCE

| Journey | Before / after samples | p95 useful frame, ms | Target, ms | After failures | Gate |
| --- | --- | --- | --- | --- | --- |
| cold | 20 / 20 | 21981 → 4039 | 2500 | 0 frame / 1 projection / 2 navigation | FAIL |
| detail-to-fire | 20 / 20 | 19029 → 1721 | 1000 | 3 frame / 3 projection / 0 navigation | FAIL |
| fire-to-response | 20 / 20 | 7258 → 3267 | 1000 | 0 frame / 1 projection / 0 navigation | FAIL |
| cached-revisit | 20 / 20 | 558 → 579 | 400 | 0 frame / 0 projection / 0 navigation | FAIL |
| incident-switch | 20 / 20 | 8317 → 5051 | 1500 | 2 frame / 2 projection / 0 navigation | FAIL |
| overview | 20 / 20 | 14785 → 3113 | 2500 | 0 frame / 0 projection / 0 navigation | FAIL |
| national | 20 / 20 | 28133 → 18278 | 2500 | 1 frame / 1 projection / 0 navigation | FAIL |

Measurements use Chromium 139.0.7258.5, 1728 × 966, real backend projections and dynamic provider tiles. Browser HTTP caching is enabled; each cold sample begins with a fresh context. Route transitions retain the renderer. Timeouts are never zero. Statistics are among measured frames; missing frames or incomplete projections fail the gate. The final lane combines independent browser batches, with interrupted navigation/admission attempts retained separately in the raw evidence. A visible basemap alone is not counted as a completed projection.

The timed release was vigia-intelligence-fabric-50bd0967e494897e. Subsequent corrections replace internal history labels, format coverage dates, label community comparisons, keep coverage geometry clear of map controls, suppress expired community reception facts and detect material ETA-only history changes. The final release has not repeated the full performance lane; these measurements describe the timed release, and no performance pass is claimed for the final build.

Before → after request-family p95:

| Family | Before duration / TTFB, ms | After duration / TTFB, ms |
| --- | --- | --- |
| imagery | 8077 / 7278 | 263 / 188 |
| labels | 8205 / 6830 | 266 / 186 |
| api | 5854 / 5364 | 8849 / 8263 |
| javascript | 749 / 186 | 428 / 128 |

Changes: tile delivery now uses the same pinned providers, provenance headers and disk cache in the admitted console process, separating it from intelligence API CPU work. Diagnostic health checks no longer precede session continuity and authorized reads. Scoped audit/recovery mutations avoid cloning unrelated collections and discard unused full-state return snapshots; serialized persistence, rollback and audit sealing remain enforced. Docker packaging and proxy contracts cover the isolated path and the explicit backend transport fallback.

Observed causes: the earlier 60-second profile spent 16.46 s in structured cloning, 8.22 s in garbage collection and 5.05 s in atomic JSON persistence around a 78.9 MB operational state. The final traces separate tile service time from transport using Server-Timing. Some lightweight location/global context requests still wait seconds behind API work; the source-state and projection paths have not met the tail-latency targets. A requested running-process CPU attachment was denied by the filesystem/process sandbox (kill EPERM); no access workaround was used. Startup profiling is separate from browser-workload profiling. No per-navigation SQL-call count is claimed.

Evidence: [map-performance.json](map-performance.json), raw browser waterfalls and failed attempts in [performance-raw.json](performance-raw.json). The interrupted intermediate isolation lane is retained separately and is not a passed 20-run result.

## READINESS

Latest /ready: **HTTP 503**, checked 2026-09-13T09:50:31.319Z.

| Check | State | Blocking |
| --- | --- | --- |
| event_state_persistence | memory_only | Yes |
| audit_chain | invalid | Yes |
| operational_source_families | multiple_accepted_operational_families | No |
| physical_source_families | insufficient | Yes |

Audit failure predates this sprint. First invalid head-order boundary: **audit:860f68d6-fd46-49bf-a441-c28f37bc64ce**, 2026-08-25T20:34:30.551Z. The receipt hash itself is valid: expected and actual **ae8c70ec1d77121d75698d013064d63cadaa8257dd48ad72bc148b7bbaf2ee49**. Its previous link is **GENESIS**, but the following legacy receipt has no hash, so expected previous hash is **null**. Classification: LEGACY_UNSIGNED_RECEIPTS_AND_BOUNDARY_GAPS. There are 972 failures, including unsigned historical receipts; this is not repaired by inventing signatures or rewriting chronology. New receipts are sealed at the mutation boundary. Preserved historical suffix identical: **true**; 1849 original entries retained. Safe future remediation requires independently authenticatable original records or an explicitly governed legacy migration; neither can be fabricated. The gate stays red.

The new source-family accounting recognizes accepted health, fire/civil-protection, reception-designation and official road evidence, separately from current physical observations. It rejects fixtures, scenarios, model output, unaccepted facts and stale source receipts. It does not replace the existing requirement for two current source families with accepted point observations. Exact source/registry evidence is retained in real-examples.json; absent current sensing cannot be supplied by a directory or a model.

The current sensing count is **0 of 2 required**: FIRMS/VIIRS is stale with a provider refresh deadline failure (latest retained observation 12 September 2026, 15:26 UTC); MTG pixel acquisition is not configured; Sentinel-3 pixel acquisition returned CDSE HTTP 401; no connected sensor assets are registered. IPMA and institutional context remain separately attributable and do not establish two current thermal/field observation families. The earlier transient PostgreSQL live-operations degradation was absent in the final readiness capture.

The last boot also reports event_state_persistence = memory_only. This is the repository's initial state, not a captured I/O error: retained command projections can be served without an event-store save, and loading/no-op reconciliation does not set a successful persistence receipt. The existing 8,090,336-byte observation file remains present. No artificial event or history rewrite was issued to turn this indicator green; the current process has not proved an event-store write. This additional gate remains open alongside audit and sensing.

| Operational family | Accepted family facts |
| --- | --- |
| health | 1 |
| fire_civil_protection | 1 |
| reception_designation | 18 |
| road_restrictions | 1 |

These counts are the readiness aggregator's accepted facts, not the number of individual road restrictions inside a source response.

Evidence: [readiness-forensics.json](readiness-forensics.json), [readiness-forensics-after.json](readiness-forensics-after.json), [real-examples.json](real-examples.json), [final-state.json](final-state.json).

## OPERATIONAL SUPPORT — REAL INCIDENT

Évora; snapshot 2026-09-13T09:27:16.166Z; evaluated 2026-09-13T09:28:02.552Z. This is retained incident context, not a claim that its historical fire observation is currently active.

| Category | Qualified in retained set | Primary calculation | Alternative | Primary roads |
| --- | --- | --- | --- | --- |
| emergency hospital | 1 | Hospital do Espírito Santo de Évora; 11.2 min; 7.6 km by road | None retained | EM527, CM1081-1 |
| fire response | 1 | Bombeiros Voluntários de Évora; 10.8 min; 7.6 km by road | None retained | EM527, CM1081-1 |
| civil protection | 0 | No current calculated qualified option retained | None retained | No current route |
| official refuge | 0 | No current calculated qualified option retained | None retained | No current route |
| designated reception | 6 | Escola Básica de Canaviais; 6.9 min; 3.6 km by road | Escola Básica Conde de Vilalva; 9.8 min; 6.3 km by road | CM1087, EM527, CM1081-1 |
| active reception | 0 | No current calculated qualified option retained | None retained | No current route |

Direction is facility → incident. Rankings compare current returned qualified route estimates. A verified emergency department differs from a nearby mapped hospital. A designation differs from confirmed activation. Contact, authority, accepted fact provenance, route calculation time, expiry and road check time remain in each option's evidence. Unknown civil-protection/contact information is not synthesized.

## ROAD DEPENDENCIES

**EM527** supports 12 distinct retained calculated routes across emergency hospital, fire response, designated reception and 1 community subjects. These are corridor-name relationships, not proof that every route traverses the same surveyed road segment. Each relationship stores subject, facility, category, route revision, calculation/expiry, road check and evidence.

Only recognized significant A/N/IP/IC/EM/CM references enter primary dependency intelligence. Detailed road steps remain in the retained route. Ask VIGIA supports road-specific and category-specific dependency questions.

## RESILIENCE — SINGLE AND MULTIPLE FAILURES

| Incident | Assumptions | Result universe | Operational writes |
| --- | --- | --- | --- |
| incident:PT-2026-01F7E2E21A | ROAD_UNAVAILABLE: EM527 | SCENARIO | 0 |
| incident:PT-2026-01F7E2E21A | ROAD_UNAVAILABLE: EM527 + FACILITY_UNAVAILABLE: entity:659882fae0897cb89c15cdd8 | SCENARIO | 0 |

The engine evaluates up to eight simultaneous unavailable roads/facilities against every retained primary and alternate route, independent of assumption order. It recalculates primary/secondary options, category redundancy, community support, dependency relationships and coverage gaps. It performs no network-wide detour search. If no retained alternative avoids all failures, ETA and distance are null. Scenario results never alter accepted capability, activation, road state, operational snapshot or source history. Scenario rows persisted: **0**.

Controlled tests prove primary-to-secondary promotion, combined road/facility loss, no remaining option, and order independence. Real scenarios use real retained inputs; their assumed failures remain **SCENARIO — NOT OBSERVED REALITY**. Full before/after support and category changes are in real-examples.json.

## COMMUNITY INTELLIGENCE

The Évora INE reference contains 57 settlement objects, with 55 complete settlement population totals and two cross-municipality totals withheld. The loader filters authoritative settlement geometry to 25 km of the incident reference. Up to six relevant settlements receive bounded route acquisition; uncalculated settlements remain gaps. It retains up to two qualified candidate facilities per category selected by straight-line proximity before routing; it does not claim an exhaustive shortest-road search.

Real example: **Louredo**, 0.7 km from the reported incident point, municipality Évora. Population **112**, Census 2021, INE settlement unit. This is census context, not current presence, exposure or an evacuation requirement.

| Community support | Primary | Alternative |
| --- | --- | --- |
| emergency hospital | Hospital do Espírito Santo de Évora; 10.1 min; 6.7 km by road | None retained |
| fire response | Bombeiros Voluntários de Évora; 9.7 min; 6.8 km by road | None retained |
| civil protection | No current calculated qualified option retained | None retained |
| designated reception | Escola Básica de Canaviais; 6.4 min; 3.2 km by road | Escola Básica Conde de Vilalva; 8.6 min; 5.4 km by road |

Nearby designated reception locations: Escola Básica de Canaviais (2.2 km; activation unconfirmed); Escola Básica Conde de Vilalva (4 km; activation unconfirmed); Escola Secundária Gabriel Pereira (5.4 km; activation unconfirmed); Escola Básica André de Resende (5.7 km; activation unconfirmed); Escola Secundária André de Gouveia (5.7 km; activation unconfirmed); Escola Secundária Severim de Faria (6 km; activation unconfirmed).

Facility → settlement estimates are explicitly directional. They must not be read as reverse evacuation journey times. No population interpolation or parish-to-settlement substitution was used. The reproducible import groups INE LG_COD parts, checks the declared parish-part count, unions real geometry and preserves source digest and year. Bairro dos Canaviais is 2,313 settlement residents in Census 2021; the 3,314 parish total was not substituted. Source: [INE official municipality archive](https://mapas.ine.pt/download/filesGPG/2021localitiesFregs/municipios/C21_LUGF0705.zip); [INE Census geography index](https://mapas.ine.pt/download/index2021LugaresFregs.phtml).

## COVERAGE

| Category | Bands, minutes | Current retained paths | No path within middle band |
| --- | --- | --- | --- |
| emergency hospital | 15 / 30 / 45 | 6 | 51 |
| fire response | 10 / 20 / 30 | 6 | 51 |
| designated reception | 15 / 30 / 45 | 4 | 55 |

Coverage displays one selected category of real retained route geometry and facility/community points. There is no continuous isochrone boundary, inferred unmeasured area, safety claim or risk score. “No retained route within 30 minutes” describes dataset support, not proof that a service does not exist.

## CAUSAL HISTORY

20 material causal events were returned for the retained interval. Example: ROUTE_CHANGED at 2026-09-13T09:25:15.483Z; 10 fact references, 61 relationship references and 1 support-ranking changes. Snapshot situation:aa22d21024049e438e8fd14bb5315a5511a2c3a6a479a60d7abeeb253cec2e3b. Event IDs reference the existing dependency graph rather than creating a duplicate graph. Identical retries and freshness-only revalidation are suppressed. Route calculation change is not reported as an observed road closure unless an admitted restriction supplies that fact.

| Affected support | Previous primary | Resulting primary | Retained options |
| --- | --- | --- | --- |
| designated reception | Escola Básica de Canaviais | Escola Básica de Canaviais | 2 → 6 |

## HISTORICAL LEARNING

18 incident histories are retained. The earliest/later captures and exact comparison are in real-examples.json. Support comparison tracks primary/secondary names, ETA, number of retained options and shared primary/alternative corridors, including community subjects. The subsequent two-hour tool returns only actual retained changes, with minute offsets and capture-gap limitations. Analog state for the selected incident: **INSUFFICIENT_COMPARABLE_HISTORY**. Matches require at least three explicitly comparable attributes and earlier observations, with no future snapshot leakage. Missing access acquisition is missing comparison evidence, not a zero. Similar topology does not predict a future outcome.

## RULE-BASED NOTICES

Only current qualified routes with a known, unexpired road-source context may produce notices. Rules are shared primary healthcare/fire corridors and a single retained qualified option in a critical category. There are at most three notices; no opaque score or generic alert stack.

- **Shared primary access:** Hospital do Espírito Santo de Évora and Bombeiros Voluntários de Évora use EM527 in their primary calculated routes.
- **Shared primary access:** Hospital do Espírito Santo de Évora and Bombeiros Voluntários de Évora use CM1081-1 in their primary calculated routes.
- **No retained alternative:** Hospital do Espírito Santo de Évora is the only verified emergency hospital with a current calculated route in this retained set.

## LOCAL MODEL

MLX could not allocate a Metal device in this environment; mlx-lm is not installed. Clean Ollama qwen3:0.6b failed its first sentinel while creating a Metal command queue/context. The tiny reported allocation failure does not establish physical RAM exhaustion. An isolated installed llama.cpp CPU runner using llama3.2:3b passed 20/20 sentinels, then actually attempted **104** Portuguese extraction, source-span, abstention and tool-intent cases.

| Metric | Actual result |
| --- | --- |
| Completed responses | 14/104 |
| Request timeouts | 90 |
| Schema valid across all attempts | 13.5% |
| Fact correctness across all attempts | 6.7% |
| Abstention | 2.3% |
| Tool intent | 25% |
| p95 latency | 5077 ms |
| Native process crashes | NONE_OBSERVED_IN_COMPLETED_CPU_RUN |
| Selection | REJECTED_FOR_OPERATIONAL_USE |

Timeouts are failed requests, not native process crashes. Only 14 responses completed; completed-only accuracy is not the overall gate. All inputs, raw outputs and errors remain in [model-evaluation.json](model-evaluation.json). Local inference stays disabled. Deterministic supported questions continue to work; no scenario or model corpus output enters operational truth. No new weights or paid services were required.

## TESTS AND RENDERED EVIDENCE

- Core domain/API/persistence/basemap suite: **75 passed, 0 failed**. Covers combined failure ordering/isolation, stale route/capability suppression, census zero/year/unit, real geometry-only coverage, dependencies, causal/no-op compression, deterministic question routing, history leakage, bounded refresh, scoped mutation serialization and durable rollback, genuine source-family counting.
- Additional operational readiness, recovery and basemap reliability suites: **12 passed, 0 failed**. Total across these executed backend/domain suites: **87 passed, 0 failed**.
- Complete frontend static suite: passed, including syntax, asset identity, proxy, truth, interaction, map, UX and operational hardening contracts.
- Restart proof: **30/30** anchored snapshots unchanged, 16294 dependency rows retained, 0 scenario snapshots persisted.
- Canonical rendered capture manifest: 43 captures; 0 recorded page errors; 0 horizontal-overflow captures. See [visual/ui-qa.json](visual/ui-qa.json) for route, viewport and interaction results.
- An initial mobile return-to-brief request timed out. Its error screenshot and interrupted manifest are retained; a fresh browser rerun completed the interactions. This is latency failure evidence, not a clean first-attempt functional pass. Focused coverage checks at 1672, 390 and 320 px verify no label/control overlap and restoration of the original map height on exit. History labels were rechecked at desktop and mobile sizes.
- Five approved raster comparisons include reference/runtime/overlay/difference artifacts. They are diagnostic where later approved route recomposition supersedes the old anatomy. National Awareness has a fresh canonical capture and the approved text composition contract, but no matching approved current raster; six-route exact pixel certification is **not claimed**.

The browser screenshots exercise live/retained responses, not a populated golden fixture. Controlled domain tests prove deterministic edge cases separately. No golden fixture was promoted to live capability.

Acceptance A–T:

| Gate | Evidence state |
| --- | --- |
| A — Map performance | FAIL: all seven p95/complete-projection gates remain unmet |
| B — Readiness forensics | Exact boundary and source causes identified; readiness intentionally remains red |
| C — Support matrix | REAL: Évora primary healthcare/fire and six designated reception routes |
| D / E — Healthcare/fire alternatives | REAL primary verified; no real second qualified facility retained. Alternative promotion proven only with controlled cases |
| F — Shared road | REAL: EM527, twelve distinct retained relationships |
| G / H — Single/multiple failure | SCENARIO on real retained data: EM527 alone and EM527 plus the verified hospital |
| I — Isolation | Zero operational writes and zero persisted scenario snapshots |
| J / K — Settlement/population | REAL: Louredo, 112 Census 2021 settlement residents; INE provenance retained |
| L / M — Coverage/gap | REAL calculated paths: six healthcare, six fire, four reception; remaining uncalculated communities explicitly lack retained coverage |
| N — Causal timeline | REAL retained route-change consequences plus controlled no-op suppression |
| O / P — Notices | REAL shared primary corridors and no retained healthcare alternative; maximum three |
| Q — Historical comparison | REAL retained primary/option changes; no interpolation between captures |
| R — Analog | Legitimate INSUFFICIENT_COMPARABLE_HISTORY state |
| S — Restart | 30 of 30 anchored snapshots unchanged |
| T — Model | 20 sentinels passed; 104-case corpus failed; model disabled |

## PERFORMANCE REGRESSIONS AND LIMITS

The before/after table includes every failed threshold. The gate remains failed even where medians or individual samples improve. Browser navigation timeouts, unfinished projections and the interrupted intermediate run are preserved. API payload construction, state persistence and background work still cause unacceptable tail latency; this remains a release blocker. These results do not establish native Chrome or physical-device performance.

Explicit regressions in this measured workload: API resource-duration p95 increased from 5,854 ms to 8,849 ms, and cached useful-frame p95 increased from 558 ms to 579 ms. Tile resource p95 fell to 263 ms for imagery and 266 ms for labels. The improvement in tile delivery must not obscure the API regression. The read-only PostgreSQL diagnostic found no waiting locks in its sample (209 ms round trip); worker connection timeouts were nevertheless recorded elsewhere. That sample does not establish the cause of every stalled request.

## EVIDENCE LANES

| Lane | Evidence | Meaning |
| --- | --- | --- |
| Real current/stored | Évora support, official facility facts, IP road records, INE settlement geometry | Dated facts and current-qualified calculations; no availability guarantee |
| Historical retained | Snapshot comparisons, causal references, subsequent capture changes, explainable analogs | What was retained at each time; gaps are unknown |
| Controlled test | 87 automated checks | Deterministic invariants and failure behavior, not live observation |
| Scenario | Combined unavailable-road/facility results | Assumptions only; zero operational writes |
| Model test | 20 sentinels and 104 actual model attempts | Rejected engineering lane; no operational promotion |
| Rendered canonical | Browser captures and map traces | Observed local runtime behavior, including failures |
| Golden/reference | Five diagnostic raster comparisons | Visual-language review; not live data or six-route pixel certification |

## REMAINING INTELLIGENCE GAPS

The retained set does not supply a second verified emergency hospital or fire-response alternative for every incident/community. Many settlements have no current calculated support route. Civil-protection contacts and reception activation may be absent. INE population coverage is the acquired Évora municipal archive, not all Portugal. Coverage is a bounded point/path calculation, not continuous isochrones. Current accepted physical sensing is below readiness requirements; institutional directories cannot substitute. Historical data is limited to real retained captures, with no fabricated multi-year outcomes. Map/API tail latency and the inherited audit boundary remain unresolved release gates. The model is unqualified.

## GIT

Branch: vigia/operational-intelligence-v1. HEAD: 3e358715272e3f8f83e6d877f2297115f9230192. 306 modified/untracked entries in the final workspace, including inherited work from earlier sprints. Full status is [git-status.txt](git-status.txt); the starting status was preserved before this sprint. Changes were made in place without reset, stash or broad cleanup. No commit or push: Git metadata is read-only in this workspace. Final running release: vigia-intelligence-fabric-72114bc137e142a7. Local runtime remains available at 127.0.0.1:4190 under the established admission boundary.
