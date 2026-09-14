# Mega Intelligence II — implementation and evidence

**Full sprint status: incomplete.** The backend is implemented and exercised against PostgreSQL and live retained incident data. New UI composition awaits the required approval. The map no-regression gate remains open. No release or pixel-fidelity certification is claimed.

## Architecture

Migration **024, incident-situation** adds append-only situation snapshots, indexed dependencies, durable recalculation jobs, immutable source documents and admission records to the existing PostgreSQL/PostGIS database. No second graph database was introduced.

Response and physical projections queue incident context. A separate scheduled service materializes the graph, recalculates dependencies and captures changed knowledge. Ordinary map, route and facility reads do not call a model. A snapshot preserves its own values, source times, validity and geometry; historical reads do not join current facility caches. Equal timestamps use persisted capture order. Scenario snapshots cannot enter operational history.

Canonical assertions and full source passages remain in the existing knowledge store. Situation records retain applicable values and provenance references, avoiding repeated copies of source documents. Gap jobs are only updated when their meaning changes. Source-health callbacks use scoped source reads.

## Live relationships

The latest graph inventory captured in `quality-report.json` contains **1,220 current relationships across three retained incidents**. Counts are current relationships, not cumulative dependency rows across historical versions.

| Kind | Count |
|---|---:|
| NEAR_FACILITY | 102 |
| HAS_ROUTE_TO_FACILITY | 102 |
| ROUTE_USES_ROAD | 880 |
| NEAR_ROAD | 9 |
| NEAR_SETTLEMENT | 9 |
| NEAR_REFERENCE | 47 |
| WEATHER_CONTEXT | 3 |
| SOURCE_HEALTH | 67 |
| HAS_THERMAL_OBSERVATION | 1 |

The retained Campo Maior incident `PT-2026-08D08E2A0D` proves facility, road, weather, settlement and thermal relationships using actual stored source data. Its FIRMS observation was measured **2 September 2026 at 01:22 UTC**. It is historical, not a new fire detection. Late discovery of old thermal data remains in semantic history but does not become a prime current change.

No admitted perimeter or current municipal reception activation was fabricated to fill the graph. Municipality relationships require an explicit incident membership source.

## Real facility example

For the Évora incident, the retained Hospital do Espírito Santo record provides:

- Address: Largo Senhor da Pobreza, Évora, 7000-811.
- Public phone: +351 266 740 100.
- Straight-line distance: **6.44 km from the reported incident point**.
- Captured road estimate: **7.55 km, 11.2 minutes, facility to incident**.
- Named route segments include Estrada da Igrejinha, EM 527 and CM 1081-1, as well as local streets.
- Route calculation: **12 September 2026, 17:26:30.577 UTC**; validity ended **17:31:30.577 UTC**. These figures are a retained example, not a promise of current access.
- Road information: **not connected**. No “road safe” or “no restriction” claim is made.
- Emergency-department verification: unresolved in this retained knowledge. Mapped hospital identity is not promoted into verified emergency capability.

Identity/contact evidence comes from the [Câmara Municipal de Évora directory](https://www.cm-evora.pt/municipe/agenda-e-noticias/contactos-uteis/). Routing provenance names OSRM and OpenStreetMap. Raw captured values and provenance are in `live-situation-PT-2026-01F7E2E21A.json`.

## Consequences, changes and Why

Supported dependencies include accepted facility coordinates, admitted road restrictions, route expiry, capability and reception-activation expiry, source health and admitted perimeter changes. Coordinate/restriction changes can request new OSRM candidates in the background. Returned routes and alternatives are tested against retained named restrictions. The configured public router does not perform arbitrary network-wide closure-aware routing; unsupported access remains withheld.

The system distinguishes geographic nearest from lowest returned qualified route ETA. A closure can change the latter while the geographically nearest hospital remains the same. Controlled tests demonstrate both rankings.

What Matters Now returns at most five material changes. Rules include same-station weather magnitude, recent thermal observations, access/ranking changes, capability/activation changes, improved facility fields and source degradation. Unchanged content does not create another situation version. Why and impact chains come from stored facts, calculations and dependency edges, with no generative explanation requirement.

Live historical diffs include source-freshness changes and newly retained relationships. Controlled cases prove closure invalidation, alternative selection, coordinate correction and activation expiry. Those controlled consequences are not described as real closures.

## Gap hunter and source watchers

Gaps use explicit distance, facility type, missing critical fields and current ranking relevance. Existing durable enrichment jobs preserve attempts, outcomes, failures and next eligible attempts. The shared store inventory has **1,868 canonical entity records**, **1,670 pending jobs** and **245 completed jobs** at the report capture. These totals include earlier sprints; they are not all new work from this sprint.

The top retained gap examples and priorities are in `quality-report.json`. Unchanged gaps are not re-enqueued by every expiry capture. Changed accepted entities trigger affected incident jobs. Source-health transitions propagate without treating an unchanged source document as new factual content.

## Local models

Ollama 0.30.7 was tested without installing another model.

| Model | Sentinel success | Latency | Startup failures | JSON/extraction corpus |
|---|---:|---:|---:|---|
| Qwen 3 0.6B | 0% | 1,619 ms | 1 | Not run after failed smoke |
| Llama 3.2 3B | 0% | 2,034 ms | 1 | Not run after failed smoke |
| Qwen 3.5 4B | 0% | 9,347 ms | 1 | Not run after failed smoke |

All failed with command-queue/context allocation errors before returning `VIGIA_OK`. A bounded Qwen 0.6B retry requesting `num_gpu: 0` also failed, after **2,004 ms**. Actual CPU-only backend execution was not verified. Per-model RAM and schema accuracy are unavailable; they are not reported as zero. **No winner was selected.** Model-dependent work remains disabled/degraded, with no paid fallback. Runtime inference is disabled by default unless a qualified local model is explicitly enabled.

The separate **120-case controlled deterministic corpus** covers Portuguese addresses, phones, roads, municipalities, dates, validity ranges, negation, old/expired notices, multiple facilities/roads, ambiguity, absence, injection and malformed text. It produced 100% expected-result match, schema validity, passage support and expected abstention on this synthetic corpus. This is narrow deterministic evidence, not model accuracy or general extraction certification. Full cases and results are retained in `extraction-corpus.json` and `benchmark.json`.

## Ask VIGIA

Fourteen bounded tools are implemented: incident, changes, nearby facilities, qualified facilities, facility detail, route, road state, weather, thermal observations, official refuges, source health, gaps, impact chains and historical snapshot. Every call checks incident scope; historical reads require replay permission. Tools reject unknown names, argument keys, arbitrary URLs and SQL. They have no write interface.

English/Portuguese deterministic parsing supports the requested nearest/qualified, route, restriction, Why, changes/since-time, stale-source and missing-information questions. Ambiguous facility names require a more specific question. Current local models are unavailable, so this is the tested fallback language interface. A model may select existing grounded claim IDs; an unsupported free-text claim is rejected.

The existing Ask drawer was exercised with the real Évora hospital query. New API responses include structured route facts and provenance. Full presentation of those results, retained-time choices, scenarios and document review still requires the proposed UI integration. Existing screenshots are interaction evidence, not final design certification.

## Time Machine, documents and scenarios

Real situation history starts with this sprint's captures around **17:00 UTC on 12 September**. Earlier whole-situation views return unavailable. Two persisted captures and semantic diffs are queryable; restart checks recovered the exact historical snapshot IDs. No current cache is used to invent a pre-capture view.

Controlled document ingestion supports **TXT and HTML** with exact normalized passage offsets, known-facility binding, explicit timezone-aware validity and mandatory review. PDF parsing is wired to the bounded existing `pdftotext` adapter, but that executable is unavailable on this host. PDF processing returns an explicit unavailable state; its real-parser test is skipped. No PDF success is claimed.

Sources must already be registered authoritative sources. Uploaded copies are marked for human verification. File/format/text limits apply; document instructions cannot call tools or grant authority. High-risk operational candidates require explicit review. Accepted facility facts retain the parent document needed by PostgreSQL foreign keys.

Road, facility and official-refuge unavailability scenarios operate on cloned retained snapshots. Alternative paths use actual retained geometry and estimates. No alternative means no invented ETA. Tests prove all three scenario types leave current facilities, road state and operational snapshots untouched.

## Performance and verification

The initial timing run regressed in some cases. Repeated gap writes and full-store reads added by the new source-health path were removed; snapshot payload duplication was reduced. Raw before/intermediate/final traces are preserved.

The two-session baseline recorded aggregate p50 **2,810 ms**, p95 **20,225 ms** across 16 navigation cases. The optimized run recorded p50 **2,511 ms**, p95 **12,074 ms** across 16. The final compact run recorded eight completed cases, then timed out during the second cold navigation at DOMContentLoaded. Its recorded-case p50 was **2,984 ms**, p95 **10,899 ms**; these figures exclude that separately recorded navigation timeout and seven unexecuted cases. Some cached/route transitions remained slower. **The no-regression gate is open.** Small samples and shared-workstation load do not support a statistical guarantee. The final answer-wording correction followed these timing runs and does not touch the map renderer.

- Focused/regression Node suite: **106 tests; 105 passed, 0 failed, 1 skipped**.
- Actual PostgreSQL session-local proof: **9 checks passed**; zero fixture rows added to operational history.
- Deterministic extraction corpus: **120 cases matched**.
- Model startup: **3 failures**, plus **1 failed CPU-requested retry**.
- Live graph/read APIs and retained-history restart: exercised successfully; one transient quality-endpoint connection timeout was retained during intermediate verification, then a subsequent request succeeded.
- Existing Ask: desktop and narrow responsive captures. The in-app viewport override requested 390 px, but measured CSS width was 286 px; no document-level horizontal overflow was measured. Do not call this native-reference parity.
- Full monorepo suite, final six-route reference/runtime overlays/differences and final new-UI certification: **not completed**.

The final runtime check at **17:40 UTC** returned HTTP 200 for situation quality, with 51 stored snapshots and zero recalculation errors since the last process restart. Those counters are process-local; zero Ask calls after restart does not erase the earlier browser proof. `/ready` returned **503**: the audit chain was invalid and physical source families were insufficient. Persistence checks passed. These are unresolved production-readiness failures, not a successful release check; see `final-runtime.json`.

## Remaining gates

1. Approve the concrete composition in `IMPLEMENTATION.md`, then integrate and review the new history/scenario/document controls and facility-route disclosures. No card stacks or new primary navigation are proposed.
2. Resolve and remeasure remaining cached-navigation regressions, including the aborted cold session, before a performance completion claim.
3. Supply a working bounded PDF parser if PDF support is required on this host.
4. Qualify a working local model before enabling model-dependent work. Deterministic operations remain available.
5. Continue legitimate source resolution for verified emergency departments, verified fire-response capability, official refuge designations, current reception activation and road-state coverage.
6. Diagnose the audit-chain failure and insufficient physical source coverage before claiming production readiness. Neither was bypassed or repaired by modifying retained evidence.

The UI gate comes directly from `AGENTS.override.md:139–141`: “design it first using the established design system and obtain approval before implementation.” No approval response was received during this work.

## Git

Branch: `vigia/operational-intelligence-v1`.

HEAD: `3e358715272e3f8f83e6d877f2297115f9230192`.

The worktree had 215 status entries at sprint start and 232 at the recorded final inventory. Existing changes were preserved. No commit was made; Git metadata is read-only in this environment. See `git-status.txt` for the exact final inventory.
