# Dramatic improvement plan

This is not a backlog. It is a five-move capital allocation. Each move is a release gate; no later move justifies skipping an earlier one.

## Move 1 — Complete one real physical truth loop

### The current failure

VIGIA automatically acquires real public reports and contextual data but no point-level physical fire source. FIRMS is not configured; MTG FCI and Sentinel-3 point modules wait for supplied files/JSON. The product has 0 thermal observations and cannot discover a physical fire without a report.

### Why this matters

Without this loop, “physical intelligence,” event identity, fusion, living-fire geometry, active perception, and lead-time claims are hypothetical. One real, attributable thermal source is worth more than every hidden platform plane combined.

### The architectural move

Create a dedicated acquisition service with object-locked raw storage, transactional metadata/checkpoints, scheduler leases, replayable normalization, rejected-product quarantine, and canonical observation lineage. Make NASA FIRMS VIIRS the first source. If the credential is genuinely blocked, substitute owned EUMETSAT MTG FCI FRP discovery/download—not a folder drop.

### What to build

- secret-managed FIRMS queries for NOAA-20, NOAA-21, and S-NPP with documented dependence groups;
- raw success and rejected/malformed response archive;
- object checksum, provider product ID, source/receive timestamps, licence/retention metadata;
- transactional checkpoint advancing only after raw and metadata commit;
- canonical thermal observation preserving raw product ID, parser/version, footprint, confidence definition, quality flags, and independence group;
- restart/idempotency/late product behavior in the real service;
- per-source metrics, accepted/rejected counts, delay, retry, and next attempt;
- one physical-first event visible through the production API/UI.

### What to delete

- claims that MTG/Sentinel-3 parser paths are integrations;
- broad satellite-provider ambitions from current product copy;
- event observations that omit exact raw-product lineage.

### What to stop working on

PREVENT, OUTCOMES, consequence, alert styling, extra routes, general UI polish, additional sensor types, and platform abstractions.

### What changes in the UI

The top bar becomes a physical source control: `VIIRS last success`, `latest product time`, `ingestion delay`, `accepted/rejected`, `next poll`. The map distinguishes thermal detections/support from public reports. “Physical Intelligence” remains hidden or qualified until the gate passes.

### Real-world evidence required

At least one live real VIIRS product and one retained historical product, both traceable from screen -> event -> observation -> normalized record -> exact raw object -> provider query, including restart and duplicate reprocessing.

### Release gate

```text
real scheduled poll
-> immutable raw object
-> transactional checkpoint
-> canonical thermal observation
-> physical-first durable event
-> API/UI
-> restart with same observation/event IDs and no duplicate
```

No manually copied product satisfies this gate.

### Expected score movement

- Physical fire detection: 2 -> 5
- Current satellite exploitation: 3 -> 6
- Evidence acquisition: 4 -> 6
- Persistence: 4 -> 5
- Portfolio proof: 5 -> 7

### Why this makes the product feel fundamentally different

VIGIA stops being a report dashboard and becomes a system that can see a physical signal first.

## Move 2 — Prove event identity and evidence fusion on a governed Portugal corpus

### The current failure

Association is fixed-weight distance/time/confidence plus greedy nearest-candidate selection. The system lacks competing hypotheses, uncertainty/footprint/trajectory reasoning, a real replay corpus, and any measured fragmentation, merge, association, lead-time, or false-alarm result.

### Why this matters

Stable event identity is the foundation for every alert, geometry, task, audit record, and outcome. A beautifully archived detection attached to the wrong fire is operationally dangerous.

### The architectural move

Build an event-sourced PostGIS hypothesis engine and deterministic event-time replay. Separate observation ingestion from association projections. Represent ambiguous hypotheses explicitly and make projection versions reproducible.

### What to build

- governed Portugal corpus with original thermal products, public reports, arrival times, source times, checksums, coverage gaps, and independent labels;
- spatial/temporal association using footprints, geolocation uncertainty, event geometry, plausible movement, source timing, and competing events;
- `UNASSOCIATED`, `CANDIDATE`, `AMBIGUOUS`, `ASSOCIATED`, `REJECTED`, and corrected states;
- durable merge/split/reassociate/reject commands and replay-safe aliases;
- evidence ledger that preserves dependence, contradiction, missing evidence, freshness, negative-evidence eligibility, and calibration scope;
- benchmark harness reporting detection precision/recall, lead time, event fragmentation, erroneous merges, association accuracy, and abstention.

### What to delete

- product-facing `strong/moderate` association grades from uncalibrated heuristic fit;
- `fusion` language unless the fused state is benchmarked against the best individual source;
- 72-hour deletion of identity/correction mappings as the durable identity policy.

### What to stop working on

New algorithms without labels, hand-authored fixture scenarios beyond regression coverage, and generic “AI/sensor fusion” positioning.

### What changes in the UI

Every event becomes an evidence hypothesis with a visible confidence class, competing possible events, reasoned association, raw sources, corrections, and benchmark scope. Ambiguity is a first-class operational state, not a hidden low score.

### Real-world evidence required

An independently governed corpus with difficult nearby-fire, delayed-report, duplicate, out-of-order, moving-support, and coverage-gap cases. Labels must identify authority, version, adjudication, and scope.

### Release gate

Pre-register thresholds and pass bounded targets for event recall, erroneous merge rate, fragmentation, association accuracy, and abstention on a held-out corpus. Replay twice and after process restart with identical event identities/projections.

### Expected score movement

- Fire-event identity: 5 -> 7
- Sensor fusion: 3 -> 6
- Behavior semantics: 4 -> 6
- Security/audit traceability: 3 -> 5
- Portfolio proof: 7 -> 8

### Why this makes the product feel fundamentally different

The product stops showing a collection of source records and starts maintaining a defensible physical event hypothesis through time.

## Move 3 — Turn every important unknown into accountable, closable work

### The current failure

VIGIA now records unknowns honestly, but all live unresolved needs are `NO_OBSERVATION_PATH`. There is no authenticated operator, connected observation asset, confirmed provider schedule, owner, request, next observation, or delivery receipt.

### Why this matters

An emergency product earns money by improving a decision, not by documenting ignorance. Durable no-path state is safety infrastructure; it is not an operational loop.

### The architectural move

Introduce a narrow authenticated control plane around evidence acquisition only. Use OIDC/JWKS, provisioned service/device principals, tenant/territory policy, transactional workflow state, a durable outbox, and exactly-once observation receipts. Integrate one real partner path—not five theoretical asset types.

### What to build

- OIDC operator authentication and tenant/territory authorization;
- one real observation connector: field team, camera, drone partner, or provider tasking API;
- durable EvidenceRequest with owner, SLA, acknowledgement, state transitions, escalation, cancellation, and audit actor;
- confirmed next observation opportunity or explicit provider/owner blocker;
- signed device/service submission with replay protection and evidence eligibility;
- outbox/retry/receipt for tasks and notifications;
- exactly-once accepted evidence -> event update -> need resolution.

### What to delete

- fake/manual fallback options without an executable owner path;
- old broad ACTION/FIELD experiences and generic command/remediation workflows;
- local mutable audit as the only evidence of who did what.

### What to stop working on

Additional workflow nouns, role types, dashboard cards, and SLA policies without a real integrated organization.

### What changes in the UI

One evidence work queue shows: unresolved physical question, selected method, authenticated owner, due time, latest acknowledgement, next observation, delivery state, and event truth change. `NO OBSERVATION PATH` shows the accountable system/partner blocker rather than a disabled button.

### Real-world evidence required

A partner-owned exercise in which a real unresolved event creates a request, a human/service acknowledges it, a real observation is captured, provenance/accuracy passes, the event updates exactly once, and the need resolves across restarts.

### Release gate

For a pre-agreed exercise cohort: 100% of qualifying unknowns enter a valid state; no inert unknowns; owner and SLA present where a path exists; signed observation receipt survives replay/restart; audit actor and evidence are independently reviewable.

### Expected score movement

- Active perception: 2 -> 5
- Evidence acquisition: 6 -> 7
- Action/workflow: 2 -> 6
- Security: 3 -> 6
- Alerting: 2 -> 4
- Operator UX: 4 -> 6

### Why this makes the product feel fundamentally different

The product starts changing what will be known next instead of only describing what is missing now.

## Move 4 — Replace the marker dashboard with a living physical fire workspace

### The current failure

The map is primarily a public-report marker surface. No real thermal sequence is visible, and the UI mixes regional raster context, event state, stale report history, source status, and evidence lifecycle in dense panels. It also fabricates zero weather values from nulls.

### Why this matters

Operators need to see physical change, uncertainty, and evidence age within seconds. A map that cannot show what changed physically is not the decision surface for a physical-intelligence company.

### The architectural move

Make the event evidence projection the UI contract. Render time-bounded source footprints/support, change between observations, FRP series, centroid displacement, coverage/quality gaps, and observed/estimated/forecast layers as distinct typed geometry. Drive every label from typed null-safe presenters.

### What to build

- event-time scrub/replay over real thermal observations;
- per-source footprints and uncertainty, new/persistent/lost thermal support, FRP series, and geometry freshness;
- explicit observed support vs estimated state vs forecast layers;
- report markers as a secondary reference layer;
- source blindness overlay and next-observation timing;
- null-safe, schema-tested presenters;
- operator comprehension tests and task-time measurements.

### What to delete

- `Earth observed` wording;
- null-to-zero formatters;
- map legends/layers with no current data;
- stale report rows in the urgent queue;
- repeated disclaimers that can be replaced by typed visual semantics;
- internal enum language in primary cards.

### What to stop working on

Decorative summary metrics, giant headings, more product tabs, and map styling unrelated to decision tasks.

### What changes in the UI

The default screen answers: latest physical observation, age, supporting sensors, observed change, uncertainty/coverage gap, owner, and next expected evidence. If no physical evidence exists, the map visibly becomes a report/reference surface and says so.

### Real-world evidence required

Several real evolving fire sequences with sensor footprints and source gaps, plus timed operator studies measuring correct classification of report-only vs physically observed, evidence age, change, uncertainty, and next action.

### Release gate

No observed/estimated/forecast confusion in the evaluated task set; nulls never render as measurements; operators answer the eleven core truth/action questions accurately within the defined time target; every displayed geometry traces to source evidence.

### Expected score movement

- Fire geometry/evolution: 3 -> 7
- Behavior semantics: 6 -> 7
- Source health: 4 -> 6
- Operator UX: 4 -> 7
- Portfolio proof: 8 -> 9

### Why this makes the product feel fundamentally different

The product becomes a time-aware physical evidence instrument instead of an attractive report queue over a basemap.

## Move 5 — Ship one narrow shadow product with measured commercial proof

### The current failure

VIGIA has no reproducible release commit, deployment topology, SLO history, DR exercise, safety case, tenant boundary, prospective pilot, or buyer-validated workflow. Broad platform code obscures the one problem it could credibly solve.

### Why this matters

Government, utility, forestry, and insurance buyers pay for a bounded operational outcome with evidence, reliability, and accountability. They do not pay for architecture vocabulary or a catalogue of future routes.

### The architectural move

Package only the physical-fire evidence and acquisition-work product as an isolated, observable, recoverable shadow service. Establish immutable build provenance, infrastructure as code, backups/restore, telemetry, SLOs, incident response, and a buyer-agreed safety boundary.

### What to build

- reproducible signed release from a clean commit;
- production database/PostGIS, object-lock storage, job/outbox infrastructure, backups and restore drills;
- metrics/tracing/log retention and source/data-quality SLOs;
- pilot tenant/territory isolation and access review;
- shadow-use safety case: no dispatch/evacuation authority, human comparison protocol, escalation rules;
- pilot dashboard reporting physical lead time, source availability, association quality, unknown closure, and operator task results;
- one buyer-specific demo and case study using real governed evidence.

### What to delete

- remaining broad prevention/outcomes/consequence/mission product narrative;
- any portfolio screenshots with synthetic data or unearned performance;
- vanity metrics and test counts presented as product results.

### What to stop working on

Horizontal market positioning across municipalities, utilities, forestry, insurers, and civil protection simultaneously. Select one operational buyer and one high-value decision.

### What changes in the UI

The product becomes one workspace for a named shadow task, with release/version/scope, source readiness, benchmark scope, live evidence, accountable work, and pilot metrics. Everything else disappears.

### Real-world evidence required

A prospective, independently reviewed shadow run with pre-agreed cases, labels, comparison method, operator cohort, safety constraints, source outages, and post-run adjudication.

### Release gate

Clean signed release; restore and provider-failure drills pass; identity/tenant review passes; target SLOs are measured over the pilot window; no safety-boundary breach; buyer confirms that the product changed decision speed or evidence quality enough to continue/pay.

### Expected score movement

- Deployment readiness: 2 -> 7
- Persistence: 5 -> 7
- Security: 6 -> 7
- Measured operational performance: `UNMEASURED` -> first defensible scoped scores
- Portfolio proof: 9 -> 9 with genuine external proof rather than more code

### Why this makes the product feel fundamentally different

VIGIA becomes an operated, measured product with a buyer and safety boundary—not a repository demonstrating how such a product might be built.

## Capital allocation sequence

1. Fund Move 1 immediately.
2. Acquire/govern the Move 2 corpus in parallel only because it is an external dependency, not a separate feature program.
3. Do not fund Move 3 until Move 1 produces real physical events.
4. Do not redesign the core UI in Move 4 against fixtures; use the real series from Moves 1–2.
5. Do not call anything a pilot before Moves 1–4 pass their bounded gates.

If Move 1 cannot be completed within the agreed provider/credential window, stop the physical-intelligence program and re-scope VIGIA honestly as a public wildfire evidence-status console.
