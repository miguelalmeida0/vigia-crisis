# VIGIA — Mega Intelligence III + IV

Implementation and evidence report · 12 September 2026

Both sprint implementations are integrated into the existing product. Production readiness remains open. This report separates working deterministic capabilities, real retained data, controlled tests, model failures and performance limitations. No production deployment or Git commit was performed.

## Sprint III — Operational fusion and resilience

### Current intelligence capability

An operator can open **Ask Vigia** or **Brief me** from Incident Detail, inspect named facilities and calculated routes, read qualified capability and source disclosures, ask about shared roads and alternatives, compare retained moments, explicitly show historical geometry, run isolated failure scenarios, and review an authorized document copy. These use the existing drawer and map; the six primary navigation routes remain intact.

The reusable brief includes dated weather with station context, thermal observations when present, returned settlements, mapped and qualified hospitals, calculated access, refuge designation/activation, shared dependencies, up to five material changes, and disclosed gaps. Unsupported qualifications remain unestablished. Values are rendered from stored facts and calculations.

### Real incident example

The real Évora record is `PT-2026-01F7E2E21A`. Its reported incident observation is **3 September 2026, 15:17 UTC**; later console reads and nearby weather measurements do not make that incident observation current. See `live-proof.json` and `situation-PT-2026-01F7E2E21A.json`.

The captured relation chain contains **Hospital do Espírito Santo**:

- Canonical address: Largo Senhor da Pobreza, Évora, 7000-811.
- Public phone: +351266740100. The municipal contacts page supports these persisted identity/contact facts.
- Approximately **6.44 km straight line from the reported incident point**.
- Captured road estimate: approximately **7.55 km / 11.2 minutes**, **facility to incident**, using **EM527 → CM1081-1**. Exact capture/expiry times and subsequent states are retained in the JSON evidence; this is not a current travel recommendation.
- Emergency-department capability: **not verified in the retained facts**. VIGIA does not relabel the mapped hospital as a verified emergency-capable option.
- Road-information coverage: **not connected** for this route. There is no dated road-state check supporting a claim of unrestricted access.
- Why: incident-to-facility distance, retained identity/capability evidence, route geometry, source/calculation times and relevant dependencies are inspectable. Route highlighting is an explicit action.

The source is [Câmara Municipal de Évora — contactos úteis](https://www.cm-evora.pt/municipe/agenda-e-noticias/contactos-uteis/), as preserved in the accepted fact provenance. The evidence does not establish present opening, staffing, capacity or emergency-department capability.

### Qualified facility intelligence and access resilience

The real captures contain no verified emergency-hospital or verified fire-response result for Évora. No alternative qualified hospital is fabricated. Returned civil-protection facilities do produce shared roads when their estimates remain qualified: the earlier capture includes **three returned civil-protection routes using A2**. These are remote facilities, roughly 97–114 km away by straight line, and must not be mistaken for available local response assets. Expired estimates drop out of current calculated-option rankings.

Access groups distinguish primary/secondary calculated options, geographic nearest, retained alternate routes and shared significant road references. Significant roads are normalized and deduplicated; tiny residential steps remain in route detail. Shared dependency counts use distinct qualified routes, not duplicated step names. No opaque corridor risk score is assigned.

Coverage statements describe the **returned dataset**. Search completeness and an exhaustive radius are not established, so the service does not claim “no hospital exists within 20 km.” Missing qualified support, missing current estimates and incomplete road-state coverage remain explicit.

### What Matters Now

The backend ranks semantic changes: admitted geometry, restrictions/routes, qualified rankings, activation, verified capability, substantial same-station weather changes, recent thermal observations, source degradation/recovery and meaningful facility improvements. The primary result contains at most five items. No-op capture clocks and old thermal discoveries do not become urgent changes. Identical route expiry/revalidation cycles are retained historically but no longer crowd this result; changed geometry and restrictions remain material.

The final real examples include named source-freshness changes such as active civil-protection occurrences and meteorological observations/warnings. The exact items and times are in each captured brief. Empty results mean no retained material change for the interval, not proof that the world was unchanged.

### Consequence engine and Why / impact chains

Persisted dependencies connect incident, facility, capability, route, significant roads, admitted road information, rankings, sources and perimeter context. Shared access edges extend the existing graph. Accepted entity changes enqueue affected incident recalculation. Coordinate corrections can change distances and routes; accepted restrictions can invalidate primary routes, select retained alternatives and change calculated qualified options. Brief and material-change outputs use the resulting snapshot.

Controlled tests demonstrate an N114 failure changing the calculated emergency option from Hospital A to Hospital C while leaving geographic nearest unchanged; stale alternatives cannot become current just because a scenario selected them. The real scenario evidence is explicitly a hypothetical assumption over a real retained snapshot. It makes **zero operational writes**.

### Intelligence gaps and improvement loop

Durable enrichment prioritizes identity/authority, address, public phone, website, verified capability and designation using explicit proximity, category, missing-field and current-ranking factors. Missing routes and road coverage are exposed through access/coverage results; there is no unrestricted web crawler or autonomous road-clearance assertion. Registered-source hash changes and accepted fact changes drive the existing dependency/recalculation loop. Unchanged documents do not become fresh observations.

Queue counts, failures and real successful jobs are in `live-proof.json`. These are cumulative persisted queue states, not a claim that this sprint resolved every item. An isolated PostgreSQL test proves that a reviewed exact phone passage persists its parent document and accepted fact with enforced foreign keys. Source/network failures remain failures; model-dependent enrichment remains unavailable because no candidate passed startup.

At capture, the queue contained **1,584 pending, 1 running, 102 failed and 265 completed jobs**. The three pilot briefs returned **22, 21 and 18 prioritized gap entries** respectively. These capped, incident-specific gap results can overlap and are not a count of distinct global missing facts.

### Map performance

`performance.json` contains the complete before/intermediate/final runs and per-case statistics. Raw network records are retained in `map-*.json`.

Changes: one persistent renderer; a minimal first basemap/incident tier; overlays after a useful frame without waiting for every tile; coalesced projection renders; a smaller incident-location response; a content-addressed application bundle; and on-demand portfolio loading that avoids boot-time Reports work. Visiting an unloaded global route uses its projection directly without recreating the session or fetching unrelated portfolios.

The incident-location response is about **12.9 KB** in the real sample; the earlier inspected response included about **63.7 KB of unnecessary detailed-twin content**. The renderer ends with **14 layers**, not 32, and the measured sequence retains one instance with zero style reloads.

**Measurement correction:** the original browser observer sometimes missed first-tile events and waited for all imagery. A raw 26.95-second observer result contained a product first frame at 1.889 seconds and three remaining imagery requests taking about 25.2 seconds. The final cold metric uses the product's render event after a loaded imagery tile. Intermediate observer values and product timestamps are both preserved; they are not silently treated as equivalent.

The final observed values are appended below. Small local samples do not certify every route or network condition. First visits, new camera bounds and incident switching remain separately reported. Direct PostGIS latency and indexed snapshot `EXPLAIN ANALYZE` are in `live-proof.json`; per-browser SQL counts are not instrumented. A direct geography calculation is not a substitute for end-to-end navigation timing.

| Measured path | Before sample p95 | Final sample p95 | Target / result |
|---|---:|---:|---|
| Cold incident useful frame | 6,923 ms | 4,913 ms | ≤2,500 ms · **fails** |
| Detail → Fire, first visit | 8,153 ms | 6,740 ms | Still visibly slow in the tail |
| Fire → Response, first visit | 7,994 ms | 2,657 ms | First-visit delay remains |
| Cached return to Detail | 1,721 ms | 373 ms | ≤750 ms · observed pass |
| Cached Fire revisit | 941 ms | 418 ms | ≤400 ms · **fails** |
| Incident switch | 3,393 ms | 3,425 ms | No demonstrated improvement |
| Overview first visit | 1,535 ms | 9,945 ms | **Regression** after removing eager prefetch |
| National first visit | 3,037 ms | 8,750 ms | **Regression** after removing eager prefetch |

Final cold p50 was 1,891 ms; the slow sample mounted its map at 4,486 ms and produced the first frame at 4,913 ms. Its detail/intelligence/operations requests took about 8.3–8.5 seconds, and some label requests took about 4.5 seconds. This identifies waits in real projection/tile delivery; it does not establish a specific backend CPU cause. The direct PostGIS geography sample was approximately **0.93 ms p50 / 1.98 ms p95**. Initial measured request counts fell from **139–141** to **51–52**, but byte totals remain variable because the observation window includes responses arriving before the interactive state. One instance and zero style reloads were retained.

These are two baseline versus three final cold sessions, not a robust population p95. Removing unrelated startup work improves isolation but transfers previously prefetched portfolio work to its first visit. The whole-product performance gate therefore remains **open**, despite the faster cached path.

## Sprint IV — Autonomous intelligence and time

### Local model bake-off

Three installed candidates were tested independently: **Qwen3 0.6B**, **Llama 3.2 3B**, and **Qwen3.5 4B**. Each failed its first startup sentinel. Each therefore has **0 successful attempts out of 1 executed**, with **19 unexecuted sentinels**. None achieved the required 20 consecutive exact `VIGIA_OK` responses.

`model-gate.json` preserves the actual exit errors, latency and rejection state. Per-model RAM is unavailable. JSON/schema/extraction/model-tool benchmarks were not run after failed startup. **No model was selected.** Deterministic operation continues, inference stays disabled, and no paid or hosted fallback was added. Model failure is not reported as an AI success.

| Candidate | Executed sentinel result | Failed-attempt latency | Model corpus |
|---|---|---:|---|
| Qwen3 0.6B | 0/1; rejected | 932 ms | Not run |
| Llama 3.2 3B | 0/1; rejected | 1,123 ms | Not run |
| Qwen3.5 4B | 0/1; rejected | 5,155 ms | Not run |

The reported startup failures include backend command-queue/context allocation errors. A request never reached a usable sentinel result; model-quality percentages and per-model RAM remain unavailable.

The separate deterministic corpus has **120 extraction cases** covering Portuguese addresses, phones, roads, municipalities, dates/ranges, negation, old/expired notices, multiple entities, ambiguity, absence, injection and malformed text. Its expected-result match, schema validity, exact-span support and expected abstention are 100% on this controlled corpus. A further **24 deterministic intent cases** pass. These **144 controlled cases are not model-accuracy evidence**.

### Ask Vigia

There are **23 approved tools**: incident, changes, nearby facilities, qualified facilities, facility details, route, road state, weather, thermal observations, official refuges, source health, gaps, impact chains, historical snapshot, brief, material changes, major route roads, access dependencies, alternative facilities, snapshot comparison, scenario, historical analogs and historical evolution.

Questions cover the requested nearest/qualified, named-route, restrictions, alternatives, shared-road failure, Why, changed rankings, missing/stale data and historical-time intents. A follow-up such as “that route” can use the previously selected facility only if it exists in the selected retained incident snapshot. Ambiguous names, out-of-scope entities, arbitrary HTTP/SQL and safety/evacuation assertions are rejected or abstained from. An unspecified historical request asks for a time instead of silently returning current data.

Every tool checks incident scope; historical access additionally requires replay permission. Tool arguments are allowlisted. Current material-change reads cannot leak into an as-of query. Critical values come from tool results; free-form model claims cannot cross the grounded-claim boundary. Actual live tool calls and snapshot references are in `live-proof.json`; the controlled intent traces are in `intent-benchmark.json`.

### Document intelligence

TXT, authorized HTML and text PDFs use bounded extraction. PDF parsing now supports the configured bundled Python/pypdf runtime when `pdftotext` is absent: at most 5 MB, 100 pages and bounded output/time. Encrypted files are rejected; scanned-image OCR is not configured. PDF page numbers and exact extracted-text spans are preserved.

The drawer shows registered source, file, candidate interpretation, exact passage, page/span and validity. Preview does not admit a fact. Admission/rejection uses the existing role and authority rules; a model cannot approve high-impact operational changes.

`postgres-proof.json` retains actual HTML extraction from a controlled source passage, plus the accepted fact persistence checks in session-local PostgreSQL tables. The actual PDF parser test passes separately. Document UI screenshots are clearly marked **CONTROLLED TEST** and use the real controlled extraction result through an intercepted response; no fixture document or closure was inserted into the operational database. They prove rendering/review wiring, not a real municipal operational notice.

### Time Machine

The history drawer selects actual retained snapshot times, reconstructs a brief, compares semantic changes and can request the following two hours when captured history exists. The map changes only after “Show historical map”; its historical label and UTC time remain visible, current wind overlays are hidden, and returning restores the current scene.

Real whole-situation capture begins around **17:00 UTC on 12 September 2026**. `live-proof.json` records exact first/last times and counts per incident. Earlier dates cannot be reconstructed from data acquired later. The captured pilot history does not yet cover a complete subsequent two-hour period. A stored earlier incident observation date is not evidence of a retained situation snapshot on that date.

After the final runtime restart, three pre-restart pilot snapshots were read through the authenticated historical API and matched their exact stored snapshot IDs. `restart-proof.json` records the release identity and results; this used no model inference or operational writes.

### Historical analogs

The new explainable fingerprint compares available weather, reported area, settlement proximity and legitimate perimeter availability while retaining additional season/hour/road/facility context. Candidates must be earlier incidents in the same universe and cannot introduce future-known snapshots. At least three comparable attributes must meet explicit tolerances; missing attributes and differences remain visible.

The real pilot query returns **INSUFFICIENT_COMPARABLE_HISTORY**. No historical analog or predicted incident outcome is fabricated. Controlled tests prove comparable-attribute and temporal exclusion rules. Current archive breadth does not justify a general wildfire similarity or forecasting claim.

### Scenarios

Road unavailable, facility unavailable and officially designated refuge unavailable are supported. Scenario results identify affected routes, retained alternatives and ETA differences, changed calculated options and lost redundancy. They are labeled **Scenario — not observed reality**. They cannot persist into operational snapshots, accepted road truth, source history or current material changes. There is no AI fire-spread, perimeter, casualty or village-risk prediction.

## Live / stored / historical / fixture / scenario

| Evidence | Meaning |
|---|---|
| Current API read | Authenticated response now; individual measurements retain their own times and source states |
| Persisted facility facts | Accepted identity/contact/capability facts with provenance; not current opening or staffing |
| Captured road estimate | OSRM calculation with direction, calculation time and expiry; road-state gaps remain explicit |
| Historical snapshot | What was captured by the chosen time; no join to later facts |
| Controlled corpus / PostgreSQL / document UI | Synthetic test evidence, separated from operational data |
| Scenario | Hypothetical deterministic transformation of a retained snapshot; zero operational writes |
| Local model | Startup failure; no qualified inference or model corpus result |

## Tests and rendered evidence

- **90 passing, 0 failed, 0 skipped** focused backend tests; actual PDF extraction included.
- **9 passing PostgreSQL checks** using session-local tables; no operational fixture writes.
- **120 passing deterministic extraction cases** and **24 passing intent cases**.
- Map contract passes; syntax verification passes for **139 JavaScript modules**.
- Canonical browser evidence covers all six routes, desktop/mobile history/scenario/Ask/facility workflows, explicit map restoration and a nine-viewport brief matrix. The main pass contains **35 screenshots**, no page errors or horizontal overflow, and successful Escape dismissal on desktop/mobile. Targeted facility-map and controlled document-review captures are recorded separately.
- Five reference/runtime/overlay/difference sets are diagnostic comparisons. Earlier approved screenshots and later approved compositions differ. National Awareness has a later text composition contract but no matching retained approved raster; no reference was fabricated. **Full locked-raster pixel certification is not claimed.**

Exact commands and logs are retained in `TESTS.md` and this folder. The repository-wide suite was not run; targeted tests are not a global release pass.

## Performance regressions and remaining limitations

The intermediate performance regressions and observer error remain in the evidence. Cold incident rendering and cached returns improved, but first-visit global projections, new imagery/label requests and incident switches still have latency. Statistical p95 certification needs more than three samples. National/overview first visits are not treated as cached returns.

`/ready` still returns **503**, with **audit_chain: invalid** and **physical_source_families: insufficient**. Existing audit history was not rewritten to make a readiness check pass. Important source families, verified emergency capability, live road status, exhaustive facility coverage and deeper retained history remain unavailable or incomplete. No release/deployment readiness claim is made.

## Git

Branch: `vigia/operational-intelligence-v1`.

HEAD: `3e358715272e3f8f83e6d877f2297115f9230192`.

The worktree was already extensively dirty. The captured start status contains 233 entries; the final status is saved in `git-status.txt`. Existing work was preserved. Git metadata is read-only in this session; no commit, push, merge, reset, stash or deployment was performed.
