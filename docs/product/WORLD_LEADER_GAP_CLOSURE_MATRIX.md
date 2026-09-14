# VIGIA World-Leader Gap-Closure Matrix

Source: `VIGIA_POST_RECOVERY_RUTHLESS_AUDIT.md`  
Baseline overall score: **5.6 / 10**  
Release target: **>=7.0 overall**, with every software-controlled defect at **>=7.5**  
Tracked categories: **66**  
Active defects and watch-list categories below 7.5: **53**

The machine-readable matrix is the release authority. A status may move to `IMPLEMENTED` only when its objective gate has fresh evidence; external data, science, integration, operations, or authority limits remain explicit rather than being converted into software success.

| # | Category | Pre-recovery | Audit baseline | Target | Class | Status | Primary objective gate |
|---:|---|---:|---:|---:|---|---|---|
| 1 | Runtime architecture | N/A | 7.8 | 7.5 | SOFTWARE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 2 | Runtime recovery / resilience | N/A | 7.6 | 7.5 | SOFTWARE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 3 | Release identity / determinism | N/A | 7.2 | 7.5 | SOFTWARE | NOT_STARTED | Sealed reproducible artifact and same-release code/data/browser/performance evidence, recreated twice from clean state. |
| 4 | Security boundaries | 8.5 | 8.6 | 7.5 | SOFTWARE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 5 | FieldNet isolation | 8.5 | 8.4 | 7.5 | SOFTWARE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 6 | Data integrity / provenance | 8.3 | 8.3 | 7.5 | DATA | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 7 | Truth-model architecture | N/A | 8.2 | 7.5 | DATA | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 8 | Failure-mode design | N/A | 7.7 | 7.5 | SOFTWARE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 9 | Performance | 3.8 | 4.6 | 7.5 | SOFTWARE | NOT_STARTED | p95 <1 s under representative concurrent route switching with no read-side persistence; publish cold/useful-content SLOs. |
| 10 | Maintainability / architecture quality | N/A | 5.8 | 7.5 | SOFTWARE | NOT_STARTED | Separate command/query paths, format/lint critical code, document invariants, add migration/ownership boundaries. |
| 11 | Test quality | N/A | 6.4 | 7.5 | SOFTWARE | NOT_STARTED | Query purity tests, scheduler clock/lease tests, mutation budgets, load tests and negative certification tests. |
| 12 | Observability | N/A | 5.5 | 7.5 | SOFTWARE | NOT_STARTED | Alert on retry rates, write-on-read, source acquisition success, queue age, useful-content latency and certification drift. |
| 13 | Incident classification integrity | 2.8 | 7.0 | 7.5 | DATA | NOT_STARTED | Promote, update and demote multiple live records from admitted evidence with independent audit and zero contradictions. |
| 14 | Freshness | 2.4 | 4.2 | 7.5 | DATA | NOT_STARTED | ≥80% current coverage for a meaningful governed subset with source-specific freshness SLOs. |
| 15 | Geolocation quality | N/A | 5.2 | 7.5 | DATA | NOT_STARTED | Separate data coverage from render sampling; ≥95% governed-subset coordinates with accuracy/source/uncertainty. |
| 16 | Geometry / spatial truth | N/A | 5.0 | 7.5 | DATA | NOT_STARTED | Current observed geometry for a meaningful subset with source, time, confidence, revisions and conflict handling. |
| 17 | Source coverage | 1.5 | 3.0 | 7.5 | DATA | NOT_STARTED | Measured fresh coverage by source and incident, with attributable products and explicit gaps. |
| 18 | Independent corroboration | 1.5 | 2.3 | 7.5 | DATA | NOT_STARTED | Demonstrate causal-family deduplication and two-source corroboration on live records with provenance. |
| 19 | Official confirmation | 1.5 | 1.8 | 7.5 | INTEGRATION | NOT_STARTED | Ingest and lifecycle-test a real allowlisted official feed; promote qualifying records with receipts and outage recovery. |
| 20 | Source-health usefulness | N/A | 3.5 | 7.5 | SOFTWARE | NOT_STARTED | Provider-specific last success, last error, coverage, next acquisition, affected records and operator consequence. |
| 21 | Weather/context association | N/A | 5.8 | 7.5 | DATA | NOT_STARTED | Measured incident-time/space weather joins with freshness, source and coverage across governed records. |
| 22 | Data-gap transparency | N/A | 7.8 | 7.5 | DATA | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 23 | Cross-source reconciliation | N/A | 5.6 | 7.5 | DATA | NOT_STARTED | Demonstrate merge/conflict/supersession across two independent live sources and one official source. |
| 24 | Temporal correctness | N/A | 7.6 | 7.5 | DATA | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 25 | Command Overview | 5 | 5.8 | 7.5 | UX | NOT_STARTED | Mission-state banner that cannot be green when source/freshness/verification/workload gates are critical. |
| 26 | Incidents triage | 2.5 | 5.8 | 7.5 | SCIENCE | NOT_STARTED | Calibrated priority tiers and queue aggregation proven in commander task tests. |
| 27 | Incident Detail | N/A | 5.2 | 7.5 | DATA | NOT_STARTED | Decision-grade situation, evidence, exposure, uncertainty, changes and owned next decision for representative incidents. |
| 28 | Intelligence | 4.2 | 5.5 | 7.5 | DATA | NOT_STARTED | Useful admitted scenarios or clearly ranked observations/conditions that change a documented decision. |
| 29 | Operations | 2.2 | 4.0 | 7.5 | SOFTWARE | NOT_STARTED | Live or governed-exercise command queue covering assignments through completion/postconditions. |
| 30 | Reports & Analytics | 4.5 | 4.8 | 7.5 | DATA | NOT_STARTED | Drillable decision changes, owners/age/consequence, validated SLOs, cohort outcomes and quality trends. |
| 31 | Global Awareness | 5.5 | 5.8 | 7.5 | DATA | NOT_STARTED | Truthful coverage denominator, scalable tiling/clustering, global/regional scope, source/freshness semantics. |
| 32 | Cross-route continuity | 4 | 7.6 | 7.5 | UX | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 33 | Search / filtering | 7.2 | 7.3 | 7.5 | UX | NOT_STARTED | User-tested, shareable, persistent incident queries with source/freshness/exposure/owner/deadline facets and correct counts. |
| 34 | Map UX | 3.8 | 6.5 | 7.5 | SOFTWARE | NOT_STARTED | Complete scalable operational layers, spatial accuracy tests and same-release performance/interaction certification. |
| 35 | Information hierarchy | 7.7 | 7.3 | 7.5 | UX | NOT_STARTED | Hierarchy testing proves degraded mission state is recognized in seconds without scrolling. |
| 36 | Cognitive load | N/A | 6.6 | 7.5 | UX | NOT_STARTED | Aggregate by incident decision, rank by consequence/time, and progressive-disclose technical lifecycle. |
| 37 | Emergency immediacy | N/A | 4.2 | 7.5 | UX | NOT_STARTED | One-screen what-changed/so-what/owner/deadline/action path tested under timed exercise. |
| 38 | Operator language | 5.8 | 6.8 | 7.5 | UX | NOT_STARTED | Plain-language task labels tested with incident-command users; technical detail behind disclosure. |
| 39 | Accessibility | 7.2 | 7.2 | 7.5 | UX | NOT_STARTED | WCAG audit with NVDA/VoiceOver, 200–400% zoom, forced colors, pointer alternatives and remediated findings. |
| 40 | Responsive behavior | 7.2 | 7.3 | 7.5 | UX | NOT_STARTED | Same-release device/zoom/keyboard/assistive interaction matrix with task completion, not only overflow checks. |
| 41 | Prioritization quality | 2.5 | 4.0 | 7.5 | SCIENCE | NOT_STARTED | Transparent, calibrated priority model validated against commander judgments and outcomes. |
| 42 | Decision support | 3.4 | 4.5 | 7.5 | SOFTWARE | NOT_STARTED | Persist decision packets with alternatives, evidence, owner, deadline, rationale, consequence and later review. |
| 43 | Uncertainty communication | N/A | 7.7 | 7.5 | SCIENCE | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 44 | Source-resolution automation | N/A | 2.0 | 7.5 | SOFTWARE | NOT_STARTED | Provider-executing scheduler with idempotent leases, due-time enforcement, receipts, transitions and one real closed job. |
| 45 | Proactivity | N/A | 2.8 | 7.5 | SOFTWARE | NOT_STARTED | Background event-driven acquisition that closes or escalates jobs without a route read. |
| 46 | Human-attention routing | N/A | 4.0 | 7.5 | SOFTWARE | NOT_STARTED | Collapse correlated needs into incident decisions and route bounded queues to named accountable roles. |
| 47 | Operational actionability | N/A | 3.2 | 7.5 | SOFTWARE | NOT_STARTED | Role-owned executable actions with deadlines, acknowledgement, effects and verified postconditions. |
| 48 | Incident-command usefulness | N/A | 3.5 | 7.5 | SOFTWARE | NOT_STARTED | Run an exercise with command roles, assignments, resources, objectives, receipts and changes visible cross-route. |
| 49 | Protection workflow | 1 | 4.2 | 7.5 | SOFTWARE | NOT_STARTED | End-to-end authority-approved exercise using real exposure layers and CAP sandbox receipts. |
| 50 | Alert / CAP readiness | N/A | 3.0 | 7.5 | INTEGRATION | NOT_STARTED | Authority-approved sandbox CAP lifecycle: draft, approve, send, ack, update, cancel, expire, audit. |
| 51 | Authority safety | N/A | 8.2 | 7.5 | AUTHORITY | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 52 | Escalation logic | N/A | 3.2 | 7.5 | SOFTWARE | NOT_STARTED | Correct due-time/lease semantics plus recipient delivery, acknowledgement, escalation SLO and closure receipt. |
| 53 | Resource coordination | N/A | 2.2 | 7.5 | SOFTWARE | NOT_STARTED | Persist and operate assignments, requests, staging, dispatch, acknowledgement and field status for a governed exercise or pilot. |
| 54 | Postcondition verification | N/A | 5.0 | 7.5 | SOFTWARE | NOT_STARTED | Verify postconditions for real governed exercises and expose exceptions/late observations. |
| 55 | Outcome measurement | 1 | 3.5 | 7.5 | DATA | NOT_STARTED | A governed non-causal pilot measurement cohort with complete action, ack, postcondition, observation and classification. |
| 56 | Replay / after-action value | N/A | 6.8 | 7.5 | DATA | NOT_STARTED | Multiple incident types, decisions and failures with replay determinism, reviewer adjudication and trend analysis. |
| 57 | Learning loop | N/A | 4.5 | 7.5 | DATA | NOT_STARTED | Prospective capture across a meaningful exercise/pilot cohort and measured policy/ranking updates. |
| 58 | Government pilot readiness | N/A | 5.8 | 7.5 | OPERATIONS | NOT_STARTED | Time-bounded government shadow pilot with named authority, SLOs, data agreement, drills and exit criteria. |
| 59 | Emergency-operations-center readiness | N/A | 3.8 | 7.5 | OPERATIONS | NOT_STARTED | Multi-role EOC exercise with live/common picture, handoffs, actions, degraded mode and audit review. |
| 60 | Trustworthiness | N/A | 6.7 | 7.5 | SOFTWARE | NOT_STARTED | Semantic audit with invariant labels plus external operator red-team proving no misleading states. |
| 61 | Differentiation | N/A | 7.4 | 7.5 | OPERATIONS | NOT_STARTED | Demonstrate materially faster, safer decisions in a third-party evaluated exercise using the end-to-end object/action model. |
| 62 | Defensibility / moat | N/A | 7.8 | 7.5 | OPERATIONS | PRESERVE | Preserve this demonstrated capability while closing adjacent gaps. |
| 63 | Product coherence | N/A | 6.0 | 7.5 | UX | NOT_STARTED | Make incident decisions/actions the organizing object, with sources and reports subordinate to that flow. |
| 64 | Enterprise credibility | N/A | 6.2 | 7.5 | SOFTWARE | NOT_STARTED | Sealed release, HA/DR, SLO evidence, admin/audit workflows and one reference integration. |
| 65 | Category-leader potential | N/A | 6.8 | 7.5 | OPERATIONS | NOT_STARTED | Convert moat into repeated live operator outcomes with references and measurable time-to-decision gains. |
| 66 | Overall crisis-management utility | 4.2 | 5.6 | 7.5 | OPERATIONS | NOT_STARTED | Representative end-to-end governed pilot proving Detect→Verify→Decide→Act→Verify→Learn. |

