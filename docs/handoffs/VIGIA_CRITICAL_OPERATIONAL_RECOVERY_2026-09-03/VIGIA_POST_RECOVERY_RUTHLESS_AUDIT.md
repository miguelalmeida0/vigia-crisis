# VIGIA Post-Recovery Ruthless Executive / Principal Engineering Audit

Audit date: 2026-09-03  
Audit posture: independent, hostile, read-only product and engineering assessment  
Release claimed: `vigia-intelligence-fabric-5e6cdfff54eac5a5` (`local_shadow`, `LOCAL_REHEARSAL_UNSEALED`)  
Overall crisis-management utility: **5.6 / 10**

## SECTION 1 — EXECUTIVE VERDICT

VIGIA is now a **credible crisis-intelligence engineering platform and controlled-pilot prototype**, not a deployable crisis operating system.

The recovery made one genuinely important change: it stopped calling 173 weak or stale records “active” and introduced a coherent four-state incident truth contract. Cross-route selection is materially better, replay is isolated from production, scientific geometry is withheld honestly, maps use a proper persistent renderer, and the white operator shell is coherent. Those are real improvements.

But the central operational claim does not survive hostile inspection. The current live snapshot contains 190 records, 0 `VERIFIED_CURRENT`, 41 `DETECTION_CANDIDATE`, 149 `NEEDS_REVALIDATION`, and 760 resolver jobs. Zero verified incidents is partly truthful abstention and partly proof that the live verification system cannot presently reach truth. All four advertised source classes are stale. A 20-incident/80-job sample found complete-looking owner, schedule, deadline, escalation and unlock metadata, but every job returned `SOURCE_HEALTH_BLOCKED`; none had a completion receipt or transition history. Across the full store, 0/760 jobs are complete, 0/760 have receipts, and 696 are at 652 attempts despite a nominal 12-attempt circuit threshold.

The cause is concrete. The resolver compares the prior source-state **object** with a current status **array**, so the state always appears changed. Operator projection reads therefore advance persistent attempt counts. More fundamentally, this “resolver” checks cached source health; it does not invoke provider acquisition or ingest a provider response. The certification test only required a concurrent-read attempt delta of at most one, allowing this defect to pass. This is sophisticated queue-shaped bureaucracy, not autonomous resolution.

Operationally, the product still has no live response operations, no live protection authority or dispatch, no certified production action-to-outcome chain, no official/current incident, no admitted observed perimeter, and no demonstrated independent corroboration. Reports explicitly state that decision rationale and timing instrumentation are absent. Global Awareness renders a capped 96 features while describing that cap as “geolocated,” which is not a coverage measure. Under realistic concurrent selected-incident reads, audit measurements were p50 9.17 s, p95 10.09 s, max 10.25 s—not the certified serial/warm 193 ms.

Approve only a controlled, shadow-mode technical pilot with explicit non-operational-use conditions. Do not place VIGIA in a live command chain today.

## SECTION 2 — SCORECARD

Evidence shorthand:

- **R** — recovery report and `certification-index.json`.
- **T** — independent full test run: 995 tests; 987 passed, 8 intentional skips, 0 failed.
- **X** — independent 20-incident cross-route API sample: 0 classification/freshness/verification/location/selection contradictions; all requests returned 200.
- **J** — live persisted resolver inspection: 760 jobs/190 incidents; 0 complete, 0 receipts, 0 transition histories, 696 at 652 attempts; all `SOURCE_HEALTH_BLOCKED`.
- **P** — independent concurrent useful-content sample: 64 selected/aggregate requests, p50 9,173.86 ms, p95 10,085.41 ms, max 10,247.78 ms.
- **U** — supplied exact-release screenshots and interaction evidence.
- **M** — map evidence: exact-release renderer/interaction proof plus drag trace from the immediately preceding release.
- **C** — direct code inspection, especially `operational-recovery-service.mjs` and the recovery certifier.

Where no category-equivalent prior baseline exists, Previous and Delta are `N/A`; no baseline number is duplicated across unlike dimensions.

| # | Category | Previous | Current | Delta | Evidence | Verdict |
|---:|---|---:|---:|:---:|---|---|
| 1 | Runtime architecture | N/A | 7.8 | N/A | R, T | Strong modular runtime and canonical projection; operator reads are improperly coupled to writes. |
| 2 | Runtime recovery / resilience | N/A | 7.6 | N/A | R, T | Two clean starts and last-good UX are credible; production failover is not proven. |
| 3 | Release identity / determinism | N/A | 7.2 | N/A | R, M | Hashing is strong; dirty/unsealed state and cross-release trace weaken exact reproducibility. |
| 4 | Security boundaries | 8.5 | 8.6 | + | T, R | Mature authorization and fail-closed boundaries remain a real strength. |
| 5 | FieldNet isolation | 8.5 | 8.4 | = | T, R | Isolation holds; operational field participation is absent. |
| 6 | Data integrity / provenance | 8.3 | 8.3 | = | T, R | Append-only lineage and explicit provenance remain strong. |
| 7 | Truth-model architecture | N/A | 8.2 | N/A | R, X, C | Four-class contract is coherent and truth-preserving. |
| 8 | Failure-mode design | N/A | 7.7 | N/A | U, T | Last-good/withheld/degraded semantics are thoughtful; top-level health still misleads. |
| 9 | Performance | 3.8 | 4.6 | + | P, M | Map drag improved radically; useful-content concurrency is unacceptable. |
| 10 | Maintainability / architecture quality | N/A | 5.8 | N/A | C | Broad architecture, but compressed one-line critical service and read-side mutation are severe debt. |
| 11 | Test quality | N/A | 6.4 | N/A | T, C | Excellent breadth; critical resolver and certification defects escaped 995 tests. |
| 12 | Observability | N/A | 5.5 | N/A | U, J, R | Many measurements exist, but attempt storms and semantic health failures are not alarmed. |
| 13 | Incident classification integrity | 2.8 | 7.0 | ++ | R, X | False-active classification is fixed; no live promotion has been demonstrated. |
| 14 | Freshness | 2.4 | 4.2 | + | R, U | Staleness is exposed, but 149/190 records need revalidation and all source classes are stale. |
| 15 | Geolocation quality | N/A | 5.2 | N/A | U | Point locations exist for candidates; render truncation is mislabeled as geolocation coverage. |
| 16 | Geometry / spatial truth | N/A | 5.0 | N/A | U, R | Geometry is withheld honestly; zero admitted operational polygons limits value. |
| 17 | Source coverage | 1.5 | 3.0 | + | J, R | Source classes are named, but every resolver sees stale/blocked source health. |
| 18 | Independent corroboration | 1.5 | 2.3 | + | U, R | The doctrine exists; live measured coverage is 0%. |
| 19 | Official confirmation | 1.5 | 1.8 | = | U, C | Adapters/contracts exist; live official-confirmation coverage is 0%. |
| 20 | Source-health usefulness | N/A | 3.5 | N/A | J, C | States are visible but not actionable acquisition results. |
| 21 | Weather/context association | N/A | 5.8 | N/A | X, U | Selected examples align; overall reported weather-context coverage is 0%. |
| 22 | Data-gap transparency | N/A | 7.8 | N/A | U, R | Missing, withheld, stale and zero-denominator states are mostly explicit. |
| 23 | Cross-source reconciliation | N/A | 5.6 | N/A | R, C | Contracts exist, but no live multi-source promotion or conflict resolution is evidenced. |
| 24 | Temporal correctness | N/A | 7.6 | N/A | X, R | UTC/freshness distinctions and replay clocks are disciplined. |
| 25 | Command Overview | 5.0 | 5.8 | + | U | Truthful counts help; green “Operational” framing coexists with critical source/freshness/workload. |
| 26 | Incidents triage | 2.5 | 5.8 | + | U, X | Filters and ranking rationale improved; almost the entire universe is an undifferentiated attention queue. |
| 27 | Incident Detail | N/A | 5.2 | N/A | U, X | Continuity is good; risk, exposure, source count and decision criteria are routinely absent. |
| 28 | Intelligence | 4.2 | 5.5 | + | U, X | Honest uncertainty and map focus; little forward decision value without geometry/context. |
| 29 | Operations | 2.2 | 4.0 | + | U, J | Source work is separated correctly; live response records remain zero. |
| 30 | Reports & Analytics | 4.5 | 4.8 | + | U | Tabs are real; decision rationale, timing and live outcome population are absent. |
| 31 | Global Awareness | 5.5 | 5.8 | + | U | Filters work and markers are semantic; scope is Portugal-only and map coverage is capped/ambiguous. |
| 32 | Cross-route continuity | 4.0 | 7.6 | ++ | X, U | Twenty-incident sample had zero operator-truth or selection/map mismatches. |
| 33 | Search / filtering | 7.2 | 7.3 | + | U, T | Caret identity and controlled filters are verified; analytical usefulness remains modest. |
| 34 | Map UX | 3.8 | 6.5 | ++ | M, U | Persistent MapLibre/native drag is real; operational layers and complete coverage are not. |
| 35 | Information hierarchy | 7.7 | 7.3 | = | U | White system scans well; high-level “Operational” labels still over-summarize. |
| 36 | Cognitive load | N/A | 6.6 | N/A | U | Better grouping, but repetitive resolver metadata and 149 attention records create overload. |
| 37 | Emergency immediacy | N/A | 4.2 | N/A | U | No verified incident, response action, alert or ranked consequence can drive immediate command. |
| 38 | Operator language | 5.8 | 6.8 | + | U | Most enums are humanized; technical lifecycle/scientific phrasing still dominates primary work. |
| 39 | Accessibility | 7.2 | 7.2 | = | T, U | Keyboard, focus and zoom contracts pass; independent assistive-technology validation is absent. |
| 40 | Responsive behavior | 7.2 | 7.3 | + | U | 63/63 matrix passes; parts of the evidence are from the preceding release. |
| 41 | Prioritization quality | 2.5 | 4.0 | + | U | “Verify now” is clearer, but consequence, spread, exposure and resource scarcity do not drive rank. |
| 42 | Decision support | 3.4 | 4.5 | + | U | Now/Next/Uncertainty framing helps; decisions, rationale and consequence are not linked. |
| 43 | Uncertainty communication | N/A | 7.7 | N/A | U, R | Abstention and scientific withholding are unusually disciplined. |
| 44 | Source-resolution automation | N/A | 2.0 | N/A | J, C | No provider invocation/receipt; reads inflate attempts. |
| 45 | Proactivity | N/A | 2.8 | N/A | J, U | Timers and labels exist; the system does not autonomously acquire missing truth. |
| 46 | Human-attention routing | N/A | 4.0 | N/A | U, J | Escalation is visible but floods nearly every record and is not role-dispatched. |
| 47 | Operational actionability | N/A | 3.2 | N/A | U | Most next steps are “wait for source”; no executable response work exists. |
| 48 | Incident-command usefulness | N/A | 3.5 | N/A | U, C | Rich domain contracts exist, but operator-visible live assignments/resources are zero. |
| 49 | Protection workflow | 1.0 | 4.2 | ++ | R, U | Safe isolated replay proves flow structure; no live operator workflow/authority/send exists. |
| 50 | Alert / CAP readiness | N/A | 3.0 | N/A | C, R | CAP adapter and fail-closed contracts exist; no live authority endpoint or dispatch is configured. |
| 51 | Authority safety | N/A | 8.2 | N/A | R, T | Replay cannot masquerade as live authority and external send remains disabled. |
| 52 | Escalation logic | N/A | 3.2 | N/A | J, C | Metadata is complete; attempt storms, no routing receipt and no closure make it non-operational. |
| 53 | Resource coordination | N/A | 2.2 | N/A | U | No live assignments, staging, dispatch, acknowledgement or field confirmation. |
| 54 | Postcondition verification | N/A | 5.0 | N/A | R | One isolated replay demonstrates the model; no live postcondition population exists. |
| 55 | Outcome measurement | 1.0 | 3.5 | + | R, U | Production funnel is truthfully zero; one replay is capability evidence only. |
| 56 | Replay / after-action value | N/A | 6.8 | N/A | R | Isolation, determinism and non-causal language are good; one hand-built case is too narrow. |
| 57 | Learning loop | N/A | 4.5 | N/A | R, U | The conceptual loop is persisted in replay, not closed through real operational outcomes. |
| 58 | Government pilot readiness | N/A | 5.8 | N/A | R, T, J | Suitable for controlled shadow evaluation, not operational decision support. |
| 59 | Emergency-operations-center readiness | N/A | 3.8 | N/A | U, J | No verified common operating picture, response operations or alert execution. |
| 60 | Trustworthiness | N/A | 6.7 | N/A | R, U, J | Truth boundaries are strong; misleading health summaries and resolver semantics erode trust. |
| 61 | Differentiation | N/A | 7.4 | N/A | R, C | Evidence-governed abstention plus incident-centered provenance is distinctive. |
| 62 | Defensibility / moat | N/A | 7.8 | N/A | T, C | Deep integrated domain/evidence architecture would be costly to reproduce. |
| 63 | Product coherence | N/A | 6.0 | N/A | U | Shared contracts help, but the product promises operations while delivering mostly verification queues. |
| 64 | Enterprise credibility | N/A | 6.2 | N/A | R, T | Strong controls/evidence; unsealed local release and absent integrations block procurement confidence. |
| 65 | Category-leader potential | N/A | 6.8 | N/A | C, U | Architecture and visual discipline are promising; operator outcome capability is unproven. |
| 66 | Overall crisis-management utility | 4.2 | 5.6 | + | All | Major truth/UX recovery, still an internal intelligence tool rather than an operational system. |

## SECTION 3 — UNDER-7 HIT LIST

Sorted by current score. “Gate” is the minimum demonstrated change required to exceed 7—not a copy change or schema-only implementation.

| Category | Score | Why below 7 / most important evidence | Root cause | Gate to exceed 7 | Type |
|---|---:|---|---|---|---|
| Official confirmation | 1.8 | 0% live official-confirmation coverage; no `VERIFIED_CURRENT` record. | No configured, current, authority-scoped Portuguese official incident feed reaches the canonical twin. | Ingest and lifecycle-test a real allowlisted official feed; promote qualifying records with receipts and outage recovery. | INTEGRATION / EXTERNAL AUTHORITY |
| Source-resolution automation | 2.0 | 0/760 completions/receipts/history; all blocked; reads inflate attempts. | Resolver polls cached health and has an object-vs-array change-detection defect; it does not execute acquisition. | Provider-executing scheduler with idempotent leases, due-time enforcement, receipts, transitions and one real closed job. | SOFTWARE / INTEGRATION |
| Resource coordination | 2.2 | Operations shows 0 live response records. | Incident-command domain is not projected into a usable live workflow. | Persist and operate assignments, requests, staging, dispatch, acknowledgement and field status for a governed exercise or pilot. | SOFTWARE / OPERATIONS |
| Independent corroboration | 2.3 | Situation Quality reports 0% independent-source coverage. | Multiple source labels exist without admitted independent evidence relationships. | Demonstrate causal-family deduplication and two-source corroboration on live records with provenance. | DATA / SCIENCE / INTEGRATION |
| Proactivity | 2.8 | “Next check” metadata exists, but no source is actively acquired. | Projection-time bookkeeping is mistaken for autonomous work. | Background event-driven acquisition that closes or escalates jobs without a route read. | SOFTWARE / OPERATIONS |
| Source coverage | 3.0 | All four advertised provider states are stale; no resolution succeeds. | Provider connectivity/currentness is missing or disconnected from canonical admission. | Measured fresh coverage by source and incident, with attributable products and explicit gaps. | DATA / INTEGRATION |
| Alert / CAP readiness | 3.0 | External send is disabled; CAP partner configuration is absent; replay only. | Authority integration and live dispatch/acknowledgement are intentionally unavailable. | Authority-approved sandbox CAP lifecycle: draft, approve, send, ack, update, cancel, expire, audit. | INTEGRATION / EXTERNAL AUTHORITY |
| Operational actionability | 3.2 | Primary next action is effectively “wait for source”; no live response work. | The product’s action model is not connected to operational execution. | Role-owned executable actions with deadlines, acknowledgement, effects and verified postconditions. | SOFTWARE / OPERATIONS |
| Escalation logic | 3.2 | 696 jobs at 652 attempts despite threshold 12; no routed acknowledgement or closure. | Defective retry accounting and metadata-only escalation. | Correct due-time/lease semantics plus recipient delivery, acknowledgement, escalation SLO and closure receipt. | SOFTWARE / OPERATIONS |
| Source-health usefulness | 3.5 | Four states say stale but do not say what actual acquisition ran or failed. | Cached registry status substitutes for provider-level diagnostics. | Provider-specific last success, last error, coverage, next acquisition, affected records and operator consequence. | SOFTWARE / INTEGRATION / UX |
| Incident-command usefulness | 3.5 | Domain schemas are rich, operator lane has zero live response records. | Backend capability is not wired to a live incident-command object/action workflow. | Run an exercise with command roles, assignments, resources, objectives, receipts and changes visible cross-route. | SOFTWARE / OPERATIONS |
| Outcome measurement | 3.5 | Live action funnel is 0 at every stage; only one certified replay exists. | No persisted production intervention-to-observation linkage. | A governed non-causal pilot measurement cohort with complete action, ack, postcondition, observation and classification. | DATA / OPERATIONS / SCIENCE |
| Emergency-operations-center readiness | 3.8 | No verified incident, response operation, resource picture or alert authority. | Core operational integrations and workflows are absent. | Multi-role EOC exercise with live/common picture, handoffs, actions, degraded mode and audit review. | OPERATIONS / INTEGRATION |
| Operations | 4.0 | Source resolution is correctly separated, but response work remains 0. | Operations route is an evidence queue plus a replay viewer. | Live or governed-exercise command queue covering assignments through completion/postconditions. | SOFTWARE / UX / OPERATIONS |
| Prioritization quality | 4.0 | 190/190 demand attention and top rows mostly say “Verify now.” | Rank lacks exposure, consequence, growth, uncertainty-reduction value and resource constraints. | Transparent, calibrated priority model validated against commander judgments and outcomes. | SCIENCE / UX / OPERATIONS |
| Human-attention routing | 4.0 | 760 escalated/active jobs swamp users; one generic scheduler/duty lead owns them. | No deduplication, aggregation, role routing or acknowledgement loop. | Collapse correlated needs into incident decisions and route bounded queues to named accountable roles. | SOFTWARE / UX / OPERATIONS |
| Freshness | 4.2 | 149/190 need revalidation; all resolver sources stale. | Acquisitions and currentness propagation are not maintaining the twin. | ≥80% current coverage for a meaningful governed subset with source-specific freshness SLOs. | DATA / INTEGRATION |
| Emergency immediacy | 4.2 | There is no verified event, protection decision or response action to act on now. | Product is optimized for truth explanation, not time-critical command. | One-screen what-changed/so-what/owner/deadline/action path tested under timed exercise. | UX / OPERATIONS |
| Protection workflow | 4.2 | Safe replay only; no communities/areas, live approval, dispatch or acknowledgement. | Authority and exposure integrations are absent. | End-to-end authority-approved exercise using real exposure layers and CAP sandbox receipts. | SOFTWARE / INTEGRATION / EXTERNAL AUTHORITY |
| Decision support | 4.5 | Decision Summary says rationale is not linked; timing is not instrumented. | State transitions are counted without a decision object, options, rationale and consequence. | Persist decision packets with alternatives, evidence, owner, deadline, rationale, consequence and later review. | SOFTWARE / UX / OPERATIONS |
| Learning loop | 4.5 | One replay closes a software loop, not a real intervention-learning loop. | No representative outcome population or feedback into policy/ranking. | Prospective capture across a meaningful exercise/pilot cohort and measured policy/ranking updates. | DATA / SCIENCE / OPERATIONS |
| Performance | 4.6 | Independent 64-request useful-content run: p95 10.09 s; certified 193 ms is serial/warm. | Expensive projections and persistent writes occur on reads, creating contention/write amplification. | p95 <1 s under representative concurrent route switching with no read-side persistence; publish cold/useful-content SLOs. | SOFTWARE |
| Reports & Analytics | 4.8 | Tabs work, but rationale/timing/live outcome data are absent; quality is mostly incompleteness. | Reporting contracts precede operational decision and outcome data. | Drillable decision changes, owners/age/consequence, validated SLOs, cohort outcomes and quality trends. | DATA / SOFTWARE / UX |
| Geometry / spatial truth | 5.0 | Zero observed Polygon/MultiPolygon coverage in the audited operational universe. | Point detections are available; authoritative/admitted perimeter pipelines are not. | Current observed geometry for a meaningful subset with source, time, confidence, revisions and conflict handling. | DATA / SCIENCE / INTEGRATION |
| Postcondition verification | 5.0 | Distinct replay stages are valid; production has no postcondition population. | Action execution is absent, so downstream observation cannot be operationalized. | Verify postconditions for real governed exercises and expose exceptions/late observations. | SOFTWARE / DATA / OPERATIONS |
| Geolocation quality | 5.2 | Global shows “96 geolocated” because the GeoJSON result is truncated at 96, not because coverage is 96/190. | Renderer payload cap is conflated with location completeness. | Separate data coverage from render sampling; ≥95% governed-subset coordinates with accuracy/source/uncertainty. | DATA / SOFTWARE / UX |
| Incident Detail | 5.2 | Often no risk statement, exposure, source count or decision criteria; still says “A wildfire is present” for unverified candidates. | Thin incident contract and over-assertive summary language. | Decision-grade situation, evidence, exposure, uncertainty, changes and owned next decision for representative incidents. | DATA / UX |
| Intelligence | 5.5 | Reading order is good, but forecast/perimeter/terrain/exposure are absent and Watch is weak. | Scientific/data admission is honest but upstream products are not available. | Useful admitted scenarios or clearly ranked observations/conditions that change a documented decision. | DATA / SCIENCE / UX |
| Observability | 5.5 | Detailed artifacts exist, yet 652-attempt storms and read mutations were certified as healthy. | Metrics emphasize field presence and happy-path thresholds, not semantic behavior. | Alert on retry rates, write-on-read, source acquisition success, queue age, useful-content latency and certification drift. | SOFTWARE / OPERATIONS |
| Cross-source reconciliation | 5.6 | Contracts and lineage exist; no live multi-source promotion or disagreement adjudication is evidenced. | Reconciliation is architectural rather than operationally populated. | Demonstrate merge/conflict/supersession across two independent live sources and one official source. | DATA / SOFTWARE / SCIENCE |
| Overall crisis-management utility | 5.6 | Truthful, coherent internal tool; cannot verify, command, protect or measure live outcomes. | Operator surface is ahead of source/action integrations. | Representative end-to-end governed pilot proving Detect→Verify→Decide→Act→Verify→Learn. | OPERATIONS / INTEGRATION |
| Maintainability / architecture quality | 5.8 | Critical recovery service is densely compressed; read endpoints mutate shared persistent state. | Release-speed implementation collapsed domain, projection, scheduler and persistence concerns. | Separate command/query paths, format/lint critical code, document invariants, add migration/ownership boundaries. | SOFTWARE |
| Weather/context association | 5.8 | Selected record association is consistent, but Situation Quality reports 0% weather-context coverage in sampled report state. | Context can render when present but is not broadly attached to incident truth. | Measured incident-time/space weather joins with freshness, source and coverage across governed records. | DATA / SCIENCE |
| Command Overview | 5.8 | Truth counts are useful; top “Available/Operational” can visually dominate four critical dimensions. | Component health and mission health are not given an unambiguous executive verdict. | Mission-state banner that cannot be green when source/freshness/verification/workload gates are critical. | UX / OPERATIONS |
| Incidents triage | 5.8 | Search/selection work, but 149 revalidation records and generic “Verify now” offer weak triage. | Incomplete consequence/exposure/source-value features. | Calibrated priority tiers and queue aggregation proven in commander task tests. | SCIENCE / UX / OPERATIONS |
| Global Awareness | 5.8 | Semantic filters/markers work; 96-render cap is presented as geolocation and no verified global picture exists. | Map projection truncation and Portugal-only data limit situational awareness. | Truthful coverage denominator, scalable tiling/clustering, global/regional scope, source/freshness semantics. | DATA / SOFTWARE / UX |
| Government pilot readiness | 5.8 | Architecture supports a shadow evaluation, but live source/action loops fail. | Missing official integration, operational cohort and deployment sealing. | Time-bounded government shadow pilot with named authority, SLOs, data agreement, drills and exit criteria. | OPERATIONS / EXTERNAL AUTHORITY |
| Product coherence | 6.0 | The shell promises an operating system while most real work is verification metadata. | Backend domain breadth is not matched by integrated operator workflows. | Make incident decisions/actions the organizing object, with sources and reports subordinate to that flow. | UX / SOFTWARE / OPERATIONS |
| Enterprise credibility | 6.2 | Strong security/evidence posture; current release is dirty, local, unsealed and weakly integrated. | Demonstration environment lacks repeatable deployment and customer-owned integrations. | Sealed release, HA/DR, SLO evidence, admin/audit workflows and one reference integration. | SOFTWARE / INTEGRATION / OPERATIONS |
| Test quality | 6.4 | 987 passes are real, but tests missed object/array change bug and accepted max retry delta ≤1. | Assertions validate shape/existence more than semantics and side effects. | Query purity tests, scheduler clock/lease tests, mutation budgets, load tests and negative certification tests. | SOFTWARE |
| Map UX | 6.5 | Native drag/persistence are strong; only 1–4 functional layers render in evidence, geometry is absent and global payload is capped. | Renderer recovery outpaced geospatial data/product integration. | Complete scalable operational layers, spatial accuracy tests and same-release performance/interaction certification. | SOFTWARE / DATA / UX |
| Cognitive load | 6.6 | Visual system is clean, but repetitive four-job queues and full-universe attention overwhelm. | Evidence requirements are projected one-to-one rather than composed into decisions. | Aggregate by incident decision, rank by consequence/time, and progressive-disclose technical lifecycle. | UX / OPERATIONS |
| Trustworthiness | 6.7 | Strong abstention/provenance; misleading green health, over-assertive “wildfire present,” and fake attempt semantics undermine confidence. | Truth discipline is not consistently applied to system health and workflow claims. | Semantic audit with invariant labels plus external operator red-team proving no misleading states. | SOFTWARE / UX / OPERATIONS |
| Operator language | 6.8 | Enums are mostly translated, but “circuit open,” “canonical projection,” and scientific machinery remain prominent. | Technical state model leaks into the primary task surface. | Plain-language task labels tested with incident-command users; technical detail behind disclosure. | UX |
| Replay / after-action value | 6.8 | One deterministic isolated chain is well designed but non-representative. | No replay corpus breadth, adjudication workflow or comparative outcome cohort. | Multiple incident types, decisions and failures with replay determinism, reviewer adjudication and trend analysis. | DATA / SOFTWARE / OPERATIONS |
| Category-leader potential | 6.8 | Architecture is distinctive; present operator value is far behind the ambition. | Integration and action execution lag domain modeling. | Convert moat into repeated live operator outcomes with references and measurable time-to-decision gains. | OPERATIONS / INTEGRATION |

## SECTION 4 — 7.0–7.49 WATCH LIST

| Category | Score | Exact deficiency | Exact gate for 7.5 |
|---|---:|---|---|
| Incident classification integrity | 7.0 | Exclusion is correct, but no real record has traversed candidate/revalidation into `VERIFIED_CURRENT`. | Promote, update and demote multiple live records from admitted evidence with independent audit and zero contradictions. |
| Release identity / determinism | 7.2 | Final release is dirty/unsealed; headline drag trace is from a different release ID. | Sealed reproducible artifact and same-release code/data/browser/performance evidence, recreated twice from clean state. |
| Accessibility | 7.2 | Contract tests pass; no screen-reader, switch-control or real low-vision operator evidence. | WCAG audit with NVDA/VoiceOver, 200–400% zoom, forced colors, pointer alternatives and remediated findings. |
| Search / filtering | 7.3 | Mechanics are reliable; filters do not yet support operationally rich facets and saved views. | User-tested, shareable, persistent incident queries with source/freshness/exposure/owner/deadline facets and correct counts. |
| Information hierarchy | 7.3 | Clean visual system, but mission-critical degradation can sit beneath green availability labels. | Hierarchy testing proves degraded mission state is recognized in seconds without scrolling. |
| Responsive behavior | 7.3 | 63 cases pass, but part of the evidence belongs to the pre-final release and is geometry-oriented. | Same-release device/zoom/keyboard/assistive interaction matrix with task completion, not only overflow checks. |
| Differentiation | 7.4 | Truth/provenance model is distinctive, but workflows are not yet operationally superior. | Demonstrate materially faster, safer decisions in a third-party evaluated exercise using the end-to-end object/action model. |

## SECTION 5 — 7.5+ STRENGTHS

| Category | Score | Why it earns the score |
|---|---:|---|
| Security boundaries | 8.6 | Authorization, tenant/incident isolation and fail-closed behavior are extensively implemented and tested; authority is not implied by UI convenience. |
| FieldNet isolation | 8.4 | Field-originated evidence remains scoped and cannot silently acquire command or official authority. |
| Data integrity / provenance | 8.3 | Append-only evidence, content identity, source families, clocks and provenance disclosure form a serious trust substrate. |
| Truth-model architecture | 8.2 | The four incident classes, explicit active definition and separate source/freshness/verification/science dimensions are a genuine conceptual advance. |
| Authority safety | 8.2 | Replay is explicitly non-production, external send is disabled and the system refuses to fabricate civil-protection authority. |
| Runtime architecture | 7.8 | The application has a coherent repository-owned runtime, modular services, canonical projections and typed domain boundaries despite the query-side defect. |
| Data-gap transparency | 7.8 | Zero denominators, missing context, withheld forecast geometry and non-causal outcomes are exposed rather than cosmetically converted to success. |
| Defensibility / moat | 7.8 | The integrated evidence fabric, truth admission, replay isolation, incident-command domain and provenance architecture would be expensive to reproduce coherently. |
| Failure-mode design | 7.7 | Last-good rendering, truthful withholding and degraded component states are materially better than blank/false-success behavior. |
| Uncertainty communication | 7.7 | The product distinguishes candidate, revalidation, unverified, withheld and not measured with unusual discipline. |
| Runtime recovery / resilience | 7.6 | Repository-owned startup and two cold-start checks recovered all components while preserving data; this is credible local resilience evidence. |
| Temporal correctness | 7.6 | UTC, observation clocks, replay clocks, freshness and later-evidence boundaries are generally explicit and non-causal. |
| Cross-route continuity | 7.6 | A 20-incident sample reconciled aggregate truth and incident detail/intelligence/operations classification, freshness, verification, location, selection and map focus without contradiction. |

## SECTION 6 — TOP 10 SYSTEMIC RISKS

| Rank | Risk | Severity | Probability | Operational consequence |
|---:|---|---|---|---|
| 1 | Resolver is not an autonomous resolver | Critical | Certain in audited state | Missing truth never arrives through the advertised lifecycle; 760 jobs create false confidence. |
| 2 | Read-side mutation and retry storm | Critical | Certain | Ordinary operator reads write shared state, inflate attempts, create contention and corrupt audit semantics. |
| 3 | Zero path demonstrated to verified current | Critical | High | VIGIA cannot supply an operationally admissible current incident when commanders need one. |
| 4 | No response-operation execution | Critical | Certain | Operators cannot assign, dispatch, acknowledge, coordinate or close real incident work. |
| 5 | No live protection authority/integration | Critical | Certain | No community warning or protection action can be safely issued or tracked. |
| 6 | Useful-content latency under concurrency | High | High | Route switching can take ~10 seconds under a small concurrent sample, unacceptable during escalation. |
| 7 | Misleading executive health semantics | High | High | Leaders may read “Operational” while source, freshness, verification and workload are critical. |
| 8 | Spatial coverage ambiguity | High | High | A 96-feature render cap is described as geolocation, potentially hiding unmapped records. |
| 9 | Certification false assurance | High | High | Vacuous zero-denominator passes, cross-release artifacts and weak retry assertions can certify broken behavior. |
| 10 | No live action-to-outcome learning | High | Certain | VIGIA cannot prove decision impact, improve policy from outcomes or defend ROI claims. |

## SECTION 7 — OPERATOR WALKTHROUGH

### 1. National wildfire commander

- **Excellent:** Honest active count, regional map, explicit uncertainty and source/freshness separation.
- **Frustrating:** 190 records need attention, top health can appear green, no national consequence/risk ranking.
- **Cannot accomplish:** Establish a verified national common operating picture or allocate resources by likely consequence.
- **Would not trust:** “Operational” headline, geolocation count, or automated resolver workload.
- **Deploy tomorrow?** No. Shadow situational-awareness exercise only.

### 2. Regional incident commander

- **Excellent:** Incident continuity, quicklook, selected-map synchronization and readable timeline/freshness.
- **Frustrating:** Risk/exposure/source count are often missing; “wildfire is present” is too strong for an unverified candidate.
- **Cannot accomplish:** Set objectives, assign divisions/resources, manage staging, acknowledge changes or confirm completion.
- **Would not trust:** That a next check represents an actual acquisition attempt.
- **Deploy tomorrow?** No.

### 3. Intelligence analyst

- **Excellent:** Provenance, scientific withholding, uncertainty, thermal/weather association when present, and Now→Next→Watch→Decision structure.
- **Frustrating:** No admitted geometry, no independent corroboration, shallow Watch conditions, no conflict adjudication workflow.
- **Cannot accomplish:** Turn a real candidate into verified current through the operator product.
- **Would not trust:** Source health as proof a provider was queried.
- **Deploy tomorrow?** Yes only as a research/shadow analysis console, with warnings.

### 4. Operations chief

- **Excellent:** Source-resolution work is no longer falsely called response operations; lanes are explicit.
- **Frustrating:** Response Operations is empty; queues repeat evidence requirements and drown prioritization.
- **Cannot accomplish:** Request/dispatch resources, receive acknowledgements, manage staging/divisions, or verify postconditions.
- **Would not trust:** Attempt counts, escalation state or completion criteria without receipts.
- **Deploy tomorrow?** No.

### 5. Civil-protection alert officer

- **Excellent:** Authority safety is exemplary; replay cannot send or impersonate approval.
- **Frustrating:** No populated community/exposure/alert-area decision packet and no live CAP gateway.
- **Cannot accomplish:** Draft, approve, dispatch, update, cancel or expire an authorized warning.
- **Would not trust:** Replay acknowledgement as an external acknowledgement—the UI correctly says not to.
- **Deploy tomorrow?** No; CAP sandbox exercise after authority sponsorship.

### 6. After-action analyst

- **Excellent:** Production/replay isolation, distinct stage IDs, deterministic fingerprint and explicit non-causality.
- **Frustrating:** One archived case and zero live outcome population cannot support comparative analysis.
- **Cannot accomplish:** Attribute decision effects, compare cohorts, analyze failure patterns or close a real learning loop.
- **Would not trust:** Any protection benefit claim; none is currently made.
- **Deploy tomorrow?** Limited replay-methodology pilot only.

## SECTION 8 — PALANTIR-LEVEL GAP ANALYSIS

| Dimension | Current VIGIA | World-class requirement / gap |
|---|---|---|
| Ontology | Strong evidence/truth concepts; incident remains mostly a read projection. | Durable shared objects for incident, decision, task, resource, organization, location, alert and outcome with governed relationships and history. |
| Object/action model | Rich schemas, almost no live actions. | Actions attached to objects, permissions, preconditions, execution, acknowledgement, rollback/expiry and verified effects. |
| Operational workflows | Source queue and isolated replay. | Composable multi-role workflows for verify, plan, task, protect, hand off, close and learn. |
| Decision lineage | Provenance strong; actual decision rationale absent. | Option set, evidence at decision time, owner, rationale, authorization, consequence, reversal and outcome. |
| Collaboration | No demonstrated team workflow. | Shared notes, assignments, mentions, acknowledgements, shift handoffs, conflict resolution and audit-preserving collaboration. |
| Real-time eventing | Event fabric exists; operator “resolver” is projection-driven. | Push/event-driven source acquisition and material changes with idempotent processing, backpressure and operator subscriptions. |
| Geospatial reasoning | Persistent MapLibre and point context. | Server-side spatial index/tiling, perimeter history, exposure joins, reachability, weather time alignment, uncertainty and scenario comparison. |
| Permissions | Strong capability model. | Customer-manageable ABAC/RBAC, purpose/incident/territory scopes, break-glass, review and external identity integration. |
| Authority | Excellent abstention, no live authority. | Explicit delegated authority chains, approval policies, jurisdiction boundaries, receipts and revocation. |
| Write-back/action execution | None in live operations. | Reliable connectors to CAD/dispatch/CAP/resource systems with idempotency, reconciliation and human control. |
| Scenario analysis | Forecast geometry honestly withheld. | Admitted scenarios, assumptions, sensitivity, alternative decisions and outcome ranges with scientific governance. |
| Replay | One deterministic isolated chain. | Broad replay corpus, time travel, counterfactual-safe comparison, collaborative adjudication and regression tracking. |
| Provenance | Major strength. | Extend the same rigor to every decision, job attempt, action, acknowledgement and outcome. |
| Integrations | Many adapters/contracts, weak live connection. | Production source SLAs, versioned connectors, provider receipts, reconciliation, customer systems and operational ownership. |
| Deployment reliability | Local runtime and cold-start proof. | Sealed reproducible releases, HA, DR, upgrade/rollback, observability, security operations and field/offline deployment evidence. |
| Workflow composability | Domain breadth, route-specific projections. | Configurable doctrine/workflow builder with typed actions, approvals, triggers, SLAs and reusable playbooks. |
| Operator speed | Clean shell and good selection mechanics. | Seconds-to-understanding and seconds-to-action demonstrated in timed commander exercises under degraded conditions. |

The gap is not visual polish. VIGIA has a sophisticated epistemic substrate but lacks the production integrations and object-linked actions that turn knowledge into coordinated operations.

## SECTION 9 — TOP 15 NEXT MOVES

| Rank | Priority | Move | Expected score impact | Affected categories | Complexity | Dependencies | Why now |
|---:|:---:|---|---|---|---|---|---|
| 1 | P0 | Make operator APIs query-pure; move recovery synchronization to an idempotent leased worker and repair source-state comparison. | +1.0 overall potential | 1, 9–12, 44, 52, 60 | M | Persistence/worker ownership | Current reads corrupt attempts and cause contention. |
| 2 | P0 | Implement one real provider-executing resolver end to end with acquisition receipt, canonical recompute, transition history and closure. | +1.2 | 13–20, 23, 44–47 | L | Provider credentials/terms | Proves VIGIA can reach truth rather than only abstain. |
| 3 | P0 | Establish a real official Portuguese incident/CAP source partnership or explicitly narrow the pilot doctrine without pretending the source exists. | +1.0 | 13, 17–20, 50, 58–60 | XL | External authority | Official confirmation is the hardest live gap. |
| 4 | P0 | Replace component-green summaries with a single fail-safe mission-health verdict and explicit blocker chain. | +0.3 | 12, 25, 35, 37, 60 | S | UX/state contract | Prevents executive misread during critical degradation. |
| 5 | P0 | Rebuild performance certification around cold and representative concurrent useful-content flows; eliminate write amplification. | +0.6 | 2, 9, 11, 12, 58, 64 | M | Move #1 | Current 193 ms claim is not representative. |
| 6 | P0 | Separate geolocation coverage, map render sampling and viewport count; add spatial accuracy/source/uncertainty fields. | +0.4 | 15, 31, 34, 60 | M | Canonical spatial contract | Current 96 “geolocated” claim is ambiguous. |
| 7 | P1 | Promote incident Decision to a first-class object with options, evidence snapshot, rationale, owner, deadline, consequence and revision. | +0.8 | 25–30, 41–42, 47, 57, 63 | L | Ontology/event journal | Reports and workflows currently count states, not decisions. |
| 8 | P1 | Wire the existing incident-command domain into a governed exercise Operations workflow: assignment→dispatch→ack→field update→complete. | +1.0 | 29, 47–48, 52–54, 59 | XL | Roles, FieldNet, action store | Converts architecture into operator value. |
| 9 | P1 | Build consequence-aware triage using exposure, freshness, verification, change velocity, uncertainty-reduction value and resource constraints. | +0.6 | 25–27, 36–42, 46 | L | Data coverage/analyst validation | The entire universe cannot remain one attention tier. |
| 10 | P1 | Integrate authoritative/admitted perimeter and asset/community context with revision lineage and spatial conflict handling. | +0.8 | 15–16, 21, 27–28, 34, 41–42 | XL | Data licences/providers/science | Point-only intelligence is not incident command. |
| 11 | P1 | Run an authority-approved CAP sandbox protection exercise from exposure threshold through cancel/expiry. | +0.8 | 49–54, 58–60 | XL | Civil-protection partner | Replay currently proves only software structure. |
| 12 | P1 | Create a prospective, non-causal action/outcome capture cohort and operational review board. | +0.7 | 30, 54–57, 64–66 | L | Action workflow, governance | Outcome credibility requires population, not one example. |
| 13 | P1 | Redesign resolver attention into incident-level decision bundles, deduplicated by source/cause and routed to acknowledged roles. | +0.5 | 26, 29, 36, 41, 45–47, 52 | M | Resolver repair, decision object | 760 rows are an anti-workflow. |
| 14 | P2 | Build sealed HA deployment, identity integration, disaster recovery, offline/edge sync and customer-operable observability. | +0.6 | 2–5, 12, 58–60, 64 | XL | Platform/security/customer environment | Required before operational procurement. |
| 15 | P2 | Establish an external exercise/evaluation program measuring operator speed, accuracy, missed events, false alarms and decision effects. | +0.7 | 11, 38–43, 56–66 | XL | Government/EOC partners | Category leadership must be demonstrated outside VIGIA’s own certifier. |

## SECTION 10 — SCORE DELTA SUMMARY

**Previous overall utility:** 4.2 / 10  
**Current overall utility:** **5.6 / 10**

**Previous categories ≥7:** Engineering foundation; Security / incident isolation; Visual shell; Basic interaction mechanics.

**Current categories ≥7 (20):** Runtime architecture; Runtime recovery / resilience; Release identity / determinism; Security boundaries; FieldNet isolation; Data integrity / provenance; Truth-model architecture; Failure-mode design; Incident classification integrity; Data-gap transparency; Temporal correctness; Cross-route continuity; Search / filtering; Information hierarchy; Accessibility; Responsive behavior; Uncertainty communication; Authority safety; Differentiation; Defensibility / moat.

**Current categories ≥7.5 (13):** Runtime architecture; Runtime recovery / resilience; Security boundaries; FieldNet isolation; Data integrity / provenance; Truth-model architecture; Failure-mode design; Data-gap transparency; Temporal correctness; Cross-route continuity; Uncertainty communication; Authority safety; Defensibility / moat.

**Current categories <7 (46):** Performance; Maintainability / architecture quality; Test quality; Observability; Freshness; Geolocation quality; Geometry / spatial truth; Source coverage; Independent corroboration; Official confirmation; Source-health usefulness; Weather/context association; Cross-source reconciliation; Command Overview; Incidents triage; Incident Detail; Intelligence; Operations; Reports & Analytics; Global Awareness; Map UX; Cognitive load; Emergency immediacy; Operator language; Prioritization quality; Decision support; Source-resolution automation; Proactivity; Human-attention routing; Operational actionability; Incident-command usefulness; Protection workflow; Alert / CAP readiness; Escalation logic; Resource coordination; Postcondition verification; Outcome measurement; Replay / after-action value; Learning loop; Government pilot readiness; Emergency-operations-center readiness; Trustworthiness; Product coherence; Enterprise credibility; Category-leader potential; Overall crisis-management utility.

**Distribution:** 46 below 7.0; 7 from 7.0–7.49; 13 at or above 7.5.

### Biggest improvements

1. Incident classification integrity: 2.8 → 7.0.
2. Cross-route continuity: 4.0 → 7.6.
3. Map UX: 3.8 → 6.5.
4. Protection workflow: 1.0 → 4.2.
5. Outcome measurement: 1.0 → 3.5.

### Biggest disappointments

1. Source-resolution automation: 760 sophisticated records, zero real resolutions, defective attempt semantics.
2. Official/independent truth: 0% official and 0% independent corroboration; 0 verified current.
3. Operations: zero live response records despite extensive incident-command architecture.
4. Performance/certification integrity: ~10 s concurrent useful-content p95 escaped a 193 ms PASS claim.
5. Outcomes/protection: one isolated replay proves software capability, not operational outcome capability.

## SECTION 11 — FINAL ANSWERS

1. **Did the critical recovery release dramatically improve VIGIA?** Yes in semantic honesty, cross-route coherence and map mechanics; no in live operational capability. Net improvement is substantial but not transformative enough for deployment.
2. **Which dimensions improved the most?** Incident classification, cross-route continuity, map persistence/drag, explicit uncertainty, and safe replay/protection structure.
3. **Which dimensions are still embarrassingly weak?** Source-resolution automation, official confirmation, independent corroboration, live response operations, resource coordination, CAP execution and live outcome measurement.
4. **Is VIGIA above 7 overall?** No. **5.6 / 10.**
5. **Is VIGIA above 7.5 overall?** No.
6. **Would you approve a controlled government pilot today?** Yes, but only a shadow-mode technical/evaluation pilot with no operational dependency, no public alerting, explicit source limitations, and predefined stop criteria.
7. **Would you trust VIGIA during an actual fast-moving wildfire today?** No. I would not use it as the authoritative common operating picture or action system.
8. **What is the single biggest obstacle to becoming a world leader?** The gap between epistemic architecture and live closed-loop execution: VIGIA can describe what truth and action should mean, but cannot yet acquire, verify, act and measure autonomously in production.
9. **What is the strongest real moat VIGIA possesses today?** Its integrated evidence/provenance, truth-admission, authority-safety and replay-isolation architecture—the foundations for defensible decisions if connected to real operations.
10. **If this were your company, what would you attack next Monday morning?** Stop feature work. Repair query purity and the resolver, connect one real authoritative source, and prove one incident can move from candidate to verified current with attributable receipts and bounded latency. Nothing else matters until that works.

