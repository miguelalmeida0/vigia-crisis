# VIGIA P0 Recovery Plan

**Objective:** move VIGIA from a truthful local prototype to a deployable, measurable physical-intelligence work loop.
**Constraint:** no cosmetic work. A capability is not promoted because an endpoint, label, fixture, or happy-path test exists.
**Current EOC gate:** **NO-GO**.

## Recovery doctrine

The smallest coherent recovery target is not “finish every screen.” It is one production-grade loop:

```text
current public report or physical candidate
  → explicit unknown with source/coverage clocks
  → automatically durable evidence need
  → authenticated owner and available acquisition asset
  → idempotent task/capture with attributable physical evidence
  → validated event association and human decision
  → monitored alert/action state
  → immutable, queryable provenance
```

If this loop cannot run repeatedly under outage, retry, restart, and adversarial identity tests, VIGIA has no deployable core. Prevention detection, spread prediction, asset outcome claims, and advanced geometry must remain disabled until their separate validation gates pass.

## Phase 0 — immediate containment (before another demo to operators)

**Duration target:** 1-3 engineering days.
**Purpose:** stop unsafe state changes and remove claims already disproved. This is containment, not the production fix.

### Actions

1. Bind the public server to a controlled engineering environment only. Disable every mutating route unless a real authenticated identity gateway is in front of it.
2. Disable `Watch event`, audit drawer, outcome asset-change metrics, built-in consequence quantile labels, and field capture in public mode.
3. Remove/replace the P0 claims in `BROKEN_CLAIMS.md`: immutable audit, SLA, P10/P50/P90, measured asset change, independent re-observation, attributable GPS capture, and browser QA success.
4. Make readiness fail when the audit chain is invalid, scientific runtime is absent for enabled EO features, or required physical feeds/assets are unconfigured.
5. Make `browser:qa` fail or report a non-release skip when no browser executes.
6. Preserve an exact backup of any operator-created state before changing storage. Audit-created diagnostic state is not production data.

### Exit gate

- no unauthenticated mutation is reachable;
- no UI presents a P0 broken claim;
- health distinguishes process liveness from capability readiness;
- release verification cannot pass without a real browser;
- audit corruption is visible and blocks operator mode.

## Program 1 — trusted operational control plane

**Capabilities moved:** deployment, action/ownership, audit, alerting foundation, persistence foundation.
**Dependency:** Phase 0.
**Why first:** every later observation and decision is unsafe if identity, durability, and audit are forgeable.

### Scope

1. **Identity and authorization**
   - OIDC/SAML-backed human sessions and separate service/device identities;
   - server-derived actor, organization, workspace, and territory scope;
   - deny-by-default authorization at every route/service;
   - CSRF/session protection, rate limits, secure cookies, TLS, secrets management;
   - remove the actor selector from non-fixture mode.
2. **Durable data plane**
   - transactional database for events, observations, evidence needs/requests, actions, alerts, source states, and audit indexes;
   - immutable/versioned object storage for evidence attachments and source products;
   - schema migrations, backups, point-in-time restore, retention, and deletion policy;
   - outbox/queue for source refresh, acquisition tasks, webhooks, analysis jobs, and SSE/event delivery;
   - idempotency keys and unique constraints for every external mutation, especially field sync and device ingest.
3. **Audit**
   - one append-only audit writer for every material mutation;
   - canonical event schema; actor/session/service identity; request and entity version;
   - cryptographic anchoring or WORM/append-only storage outside the mutable application tables;
   - continuous verification and alert on any gap;
   - explicit distinction between content checksum, signature, and audit-chain integrity.
4. **Runtime/observability**
   - structured logs, metrics, traces, error capture, source/job dashboards, and on-call alerts;
   - separate `/live`, `/ready`, and capability-health endpoints;
   - packaged, pinned Node/Python/system dependencies;
   - deployment manifests, CI, vulnerability/dependency scanning, staged rollout, and rollback.

### Adversarial acceptance tests

- no-header, forged-header, expired-session, wrong-tenant, CSRF, replay, and privilege-escalation requests all fail;
- two processes mutate the same event/action without lost updates;
- kill between DB commit/outbox delivery and retry yields exactly-once business effect;
- duplicate field `clientId` returns the original success, never an invalid transition;
- disk/database/object-store outage produces no false success;
- audit tamper/gap/reorder is detected and operator readiness fails;
- backup restore recreates a selected event, evidence package, attachment version, request history, alert, and audit proof;
- browser QA executes desktop/mobile flows and fails on console/page/HTTP error.

### Promotion gate (>7/10)

- 30-day staging soak with stated availability/error budgets;
- restore and failover exercises pass;
- independent security review has no open critical/high findings;
- 100% of enumerated material transitions produce valid audit events;
- mutation/idempotency/tenant-boundary conformance suite passes in CI and staging.

## Program 2 — durable unknown-to-work engine

**Capabilities moved:** evidence acquisition, action/ownership/SLA, active-perception workflow, operator usability.
**Dependency:** Program 1 storage/identity/queue.

### Scope

1. Introduce a durable `EvidenceNeed` entity keyed by event + knowledge gap + freshness window.
2. Convert every actionable `actionNeed` into an idempotent need during event evaluation—no operator click required to make the unknown visible as work.
3. Define need lifecycle: `open → planned → assigned → accepted → acquiring → submitted → accepted/rejected → resolved/expired/escalated`.
4. Attach explicit evidence contract, coverage requirement, independence requirement, source alternatives, owner, cost/priority, due policy, and expiry.
5. Replace the decorative SLA with a monitored policy: timers, acknowledgement, breach, escalation, reassignment, and closure reason.
6. Make field sync exactly-once at business level; persist client operation receipts and allow safe response replay.
7. Capture GPS provenance honestly: observed coordinate, assignment coordinate, permission/error, accuracy, device clock, server receipt, and signed device/session identity. Never substitute one fact for another.
8. Require reviewer independence when policy says independent: different actor/source/session and minimum time/geometry constraints.

### Operational acceptance tests

- 100% of actionable current/delayed event unknowns create one and only one open EvidenceNeed;
- restart/replay/source refresh creates no duplicate work;
- an unavailable asset changes the need to `unfulfilled`, not `taskable`;
- lost sync response + repeated batch returns the prior result and leaves the correct final state;
- offline queue survives restart and communicates storage/expiry risk;
- overdue needs escalate to a tested destination and record delivery/acknowledgement;
- GPS denial remains explicit and cannot satisfy a GPS-required contract;
- same actor cannot close an independence-required loop.

### Promotion gate (>7/10)

- representative multi-day operational exercise closes ≥95% of test unknowns without orphan/duplicate work;
- p95 need-creation latency and assignment/acknowledgement SLOs are defined and met;
- every unresolved need has an owner or explicit unfulfillable reason and escalation;
- field retry, offline, conflict, and evidence-rejection drills pass.

## Program 3 — real physical observation service

**Capabilities moved:** real physical detection, source health, active perception, event identity inputs, alert inputs.
**Dependencies:** Programs 1-2.

### Scope

1. **Public satellite points**
   - provision and monitor NASA FIRMS credentials;
   - build owned MTG FCI and Sentinel-3 acquisition consumers, not just drop-directory parsers;
   - product manifests, checksums, acquisition time, processing time, coverage geometry, quality flags, backfill, dedup, and replay;
   - exact coverage/availability representation so absence is not mistaken for negative detection.
2. **Connected assets**
   - integrate at least one real field team and one real remote observation source, with availability, ownership, task acceptance, completion callback, and observation ingest;
   - persist task jobs and link task→observation→need→event;
   - model weather/airspace/crew/device constraints and cancellation.
3. **Source operations**
   - per-source SLOs, owners, credential-expiry alarms, rate-limit handling, last-good product, backlog, and recovery runbook;
   - unify WMS context, structured point products, and bootstrap/live source identity.
4. **Physical observation provenance**
   - signed producer identity, source product/version, processing lineage, native confidence definition, geolocation uncertainty, footprint, and declared dependency group;
   - do not convert native confidence to cross-sensor confidence without calibration.

### Validation work

- retrospective labelled Portuguese fire seasons with confirmed incident/perimeter/time data;
- prospective shadow-mode season/exercises;
- stratify by sensor/platform, day/night, cloud/smoke, land-cover, geography, FRP band, static heat source, and report availability;
- measure detection precision/recall/F1, false alarms per area/time, miss rate, coverage-adjusted latency, point geolocation error, and pre-report lead time with confirmation status.

### Failure tests

- bad credentials, partial feed, malformed product, duplicate/reissued product, delayed product, future clock, corrupted NetCDF, parser version change, source outage/recovery, backlog replay, and source disagreement;
- device nonce replay, forged device, stale observation, impossible coordinate, duplicate task callback, task accepted-but-never-completed, and endpoint timeout;
- verify source outage creates acquisition work/health alerts rather than current-looking state.

### Promotion gate (>7/10)

- at least two independent physical source families continuously operational in staging/pilot;
- externally approved detection thresholds and minimum sample sizes met on held-out and prospective data;
- coverage-adjusted false-negative and false-positive limits agreed with operational authority;
- source SLOs met during soak; outage/backfill drills pass;
- every physical record has traceable product/device lineage and declared dependence.

## Program 4 — reproducible geospatial and satellite exploitation platform

**Capabilities moved:** satellite exploitation, geospatial integrity, physical prevention screens, imagery usability.
**Dependencies:** Program 1 runtime/storage; can run alongside Program 3 after foundations.

### Scope

1. Package a supported Python/GDAL/rasterio/PROJ/GEOS runtime with pinned versions and startup doctor as a readiness gate.
2. Move synchronous analysis out of HTTP into queued workers with bounded CPU/memory/network, job status, retry, cancellation, and artifacts.
3. Store immutable scene/product manifests, native asset versions/checksums, selection reasons, proof records, and algorithm versions.
4. Separate facts in the schema/UI:
   - catalogue footprint coverage;
   - native pixel access;
   - pixel round-trip proof;
   - inter-band/date registration;
   - cloud/nodata/radiometric usability;
   - visible product identity;
   - scientific inference eligibility.
5. Extend integrity tests to rotated/sheared transforms, bad CRS, nodata, corrupted/redirected COGs, remote range failures, asset replacement, malicious URLs, and wrong-place bands.
6. Calibrate Sentinel-2 fuel/change screens on representative Portugal land-cover/seasons. Keep other detector registry entries disabled until an implementation and dataset exist.
7. Integrate higher-resolution imagery or field/drone evidence for object-scale prevention questions; retain abstention otherwise.

### Promotion gate (>7/10)

- `geo:doctor` and all geo/science tests pass from a clean deployment image;
- ≥99.5% of selected supported COGs either produce a valid proof or an explicit categorized failure during soak;
- no fallback sensor is ever displayed as the selected scene;
- science outputs are reproducible from stored product+algorithm manifests;
- held-out/prospective detector metrics and abstention policy are independently approved per decision type;
- object-scale claims remain impossible from 10 m data.

## Program 5 — validated event identity and evidence fusion

**Capabilities moved:** event identity/association, fusion, event metrics, alert rule inputs.
**Dependencies:** Programs 1, 3; uses Program 4 where imagery is an input.

### Scope

1. Replace silent JSON mapping with versioned event-sourced observation/event association in the transactional store.
2. Preserve ingestion order and event-time order; support replay, late data, source corrections, retention transitions, and alias history.
3. Build a labelled association corpus including simultaneous nearby fires, split fronts, report-coordinate errors, static heat sources, delayed reports, source retractions, and sensor outages.
4. Measure fragmentation, false merge, false split, identity stability, adjudication rate, and operator correction reversal.
5. Treat dependence as lineage, not a free string: platform, instrument, product, processing chain, shared upstream, temporal repeat, and spatial overlap.
6. Add negative/coverage evidence only when exact source coverage and detection limits are known.
7. Calibrate association/fusion only if a supported operational decision needs probability. Otherwise retain transparent, validated policy bands and null probability.
8. Persist derived state with input versions and expose why each association/state changed.

### Failure/adversarial tests

- late earlier report after physical-first event; upstream ID reuse; coordinate/time correction; two fires crossing thresholds; many-to-one/one-to-many sources; observation expiry and reappearance; concurrent manual corrections; correction during replay; disk/DB failure; source retraction;
- malicious/incorrect independence labels; repeated same-source products; shared algorithm outputs; conflicting field and satellite evidence.

### Promotion gate (>7/10)

- external validation policy supplies thresholds and minimum samples;
- held-out and prospective fragmentation/false-merge targets are met;
- process restart/failover/replay produce identical event identities and correction histories;
- no correction returns success before durable commit;
- operator pairing labels are empirically mapped and never called probability unless calibrated.

## Program 6 — operational alerts and source incident management

**Capabilities moved:** alerting, source health, action SLA.
**Dependencies:** Programs 1-3 and validated rules from Program 5.

### Scope

1. Model subscriptions separately from alert instances. Watching an event creates a durable subscription with channels, owner, scope, state, and delivery policy.
2. Generate alerts only from validated rules and explicit source/knowledge-state transitions.
3. Use outbox→delivery workers with idempotency, retry/backoff, delivery receipts, dead-letter handling, escalation, and channel health.
4. Persist rule/version/input evidence and watch state at evaluation time; update subscription changes correctly.
5. Alert on source/capability outages and stale backlogs, not only fire candidates.
6. Provide per-source owner, SLO, last good product, backlog, recovery state, and runbook link.

### Promotion gate (>7/10)

- delivery SLO and acknowledgement/escalation SLO met in a 30-day pilot;
- forced webhook/channel outage queues and later delivers without duplicate operator effect;
- watch-before/after-alert, unwatch, rule update, replay, and dedup tests pass;
- alert false-positive/missed-event burden is measured on the validation corpus and exercises;
- source outage drills reach the named owner and create tracked recovery work.

## Program 7 — quarantine and separately validate advanced claims

**Capabilities moved:** prevention detection, fire geometry/evolution, consequence/asset risk, outcome measurement.
**Dependency:** Programs 1-6. These are not needed to prove the first production core loop and must not delay it.

### 7A. Fire geometry

Keep thermal pixel support and last-observed envelopes as an evidence visualization. To exceed 7/10 as **support geometry**, validate source footprints/geolocation and map comprehension; do not claim perimeter. To exceed 7/10 as **fire perimeter/evolution**, integrate an approved model/provider and validate perimeter overlap, arrival time, spread rate, and uncertainty on independent incidents.

### 7B. Prevention detection

Delete detector registry entries that have no model artifact. For each retained decision type, require a versioned model, resolution policy, labelled data, geographic/seasonal validation, abstention, field verification protocol, false-positive workload, and prospective yield. Do not share one global “validation” state.

### 7C. Consequence

Delete the built-in P10/P50/P90 provider or relabel outputs as deterministic sensitivity screens. Operational consequence requires an approved provider registry, signed/versioned contract, validation scope, input completeness, fail-closed behavior, uncertainty semantics, and exposure sources fit for the decision. No silent fallback.

### 7D. Outcomes

Delete `assetsBefore=N+5`/`assetsAfter=5` and all seeded measured-outcome claims. Define outcome units before code: versioned pre-action exposure set, action, independently sourced post-action observation, matching method, causal limits, reviewer independence, and complete provenance. Report sample size and uncertainty.

### Promotion gate (>7/10)

Each sub-capability needs its own external validation policy, held-out/prospective evidence, operational owner, failure/abstention behavior, and EOC-approved use case. None may inherit readiness from the core loop.

## Cross-program release gates

No capability receives implementation-readiness **>7/10** until all relevant gates are satisfied:

| Gate | Required evidence |
|---|---|
| Identity | authenticated actor/service/device; tenant tests; no client-selected authority |
| Durability | transactional commit, idempotency, replay, backup/restore, multi-process tests |
| Observability | logs/metrics/traces, SLO dashboard, owner, alerts, runbook, historical health |
| Provenance | immutable input/artifact version, algorithm/model version, source lineage, audit event |
| Scientific validation | representative labelled data, held-out + prospective results, approved thresholds, abstention |
| Failure behavior | outage, stale, corruption, partial, timeout, retry, backfill, conflict, recovery exercises |
| Operator usability | scenario-based test with actual roles; unknown/action/authority understood without inference |
| Security | independent review, no critical/high open findings, secrets/TLS/session/device controls |
| Browser/API conformance | real desktop/mobile browser, API contract, accessibility and error paths in CI |
| Operational trial | controlled pilot/shadow mode with measured reliability and human outcome review |

## Dependency sequence and minimum critical path

```text
Phase 0 containment
  → Program 1 trusted control plane
      → Program 2 durable unknown-to-work
      → Program 3 physical observation service
          → Program 5 identity/fusion validation
          → Program 6 alerts/source operations

Program 4 geospatial platform can run after Program 1 in parallel with Program 3.
Program 7 remains quarantined until the core loop and its validation data exist.
```

The minimum deployable pilot is Programs 1-3 plus the relevant Program 5 association policy and Program 6 source/alert operations. Program 4 is mandatory if native satellite imagery/science is enabled. Program 7 is not part of the minimum pilot.

## Delete, rebuild, keep

### Delete now

- built-in probabilistic/P10/P50/P90 semantics;
- fabricated outcome asset arithmetic and seeded “measured” claims;
- unauthenticated actor selection in public mode;
- immutable-audit and SLA product language;
- detector registry entries with no actual public inference artifact;
- pass-on-missing-browser release behavior;
- generic `taskable`/information-gain claims when no connected asset exists.

### Rebuild

- authentication/tenancy/authorization;
- state persistence, evidence object storage, queue/outbox, and audit;
- need→request→task orchestration and idempotent field sync;
- source acquisition/health/SLOs and task completion loop;
- reproducible scientific worker runtime;
- validation/replay harness with real labelled data;
- subscriptions/alerts/delivery;
- outcomes from real before/after evidence.

### Keep and harden

- report freshness separate from physical freshness and behavior;
- fail-closed raster/science-band proof concept;
- null probability without validated calibration;
- explicit source-family/dependency representation, upgraded to real lineage;
- thermal-support-not-perimeter geometry;
- resolution-aware abstention;
- evidence request/hazard/remediation state-machine concepts;
- clear `unknown`, `unobserved`, `context only`, and `not a detected hazard` UI language.

## Single most important engineering objective

**Make every actionable unknown become exactly one durable, authenticated, observable acquisition task that returns attributable physical evidence—or an explicit, owned inability to acquire it.**

That objective is the shortest path from honest interface prototype to real wildfire physical intelligence. Everything else should be subordinated to it.

## EOC go/no-go checklist

VIGIA remains **NO-GO** until all are true:

- authenticated identity and tenant-scoped authorization;
- valid immutable audit and durable transactional state;
- idempotent offline/device/API mutations;
- at least two monitored physical observation sources with approved validation evidence;
- all actionable unknowns become owned durable work;
- scientific readiness passes if imagery/science is enabled;
- source/alert/SLA delivery SLOs and outage drills pass;
- broken probability/outcome/independence claims are absent;
- real desktop/mobile browser and security gates pass;
- a controlled operational pilot demonstrates the loop under representative load and failure.

Until then, the repository is suitable for engineering research, model-policy review, and controlled fixture demonstration only.
