# 02 — Implementation Handoff

## 1. Baseline evidence and release posture

The current release reached all core processes READY after the runtime artifact recovery. Preserve that architecture. The current product state nevertheless exposes severe contradictions and weak operational utility.

Observed runtime/UI facts to reproduce before modifications:

- 173 records are labelled Active on Command.
- 177 significant changes and 692 “System Actions” are shown.
- Needs Attention is zero.
- Immediate local status reported Evidence UNAVAILABLE and Map DEGRADED_PARTIAL 3/32.
- Later UI states show maps as available, partial, live, retained, recovering, refreshing, or source-degraded depending on route and moment.
- Incident Detail records are often 8–17 days stale.
- Source coverage is not returned and source dependencies are not identified.
- Operations contains four evidence requirements, all waiting on an external source.
- Decision Summary shows 47 unresolved high-impact decisions and zero operator interventions.
- Outcome Analysis contains zero initiated actions, acknowledgements, postconditions, and measured outcomes; 692 resolution requirements are explicitly excluded.
- Performance reports map stable render 5.78 s, API p95 3,370 ms, and 72 tile failures.
- Situation Quality reports 45/173 fresh, 128 stale, 0/173 independent-source, official-confirmation, geometry, weather-context, and forecast-eligibility coverage, with drill-down unavailable.
- Global Awareness maps 96/173 records before filtering and 83/137 after a seven-day filter.

Treat the evidence screenshots as defects, not design targets.

---

# Workstream A — Canonical operational truth model

## A1. Create one lifecycle classifier

Introduce one domain-owned classification contract. Do not derive lifecycle independently in each route.

Required top-level classes:

```text
VERIFIED_CURRENT
DETECTION_CANDIDATE
NEEDS_REVALIDATION
HISTORICAL_CLOSED
```

A valid implementation may include more specific substates, but every incident must map to exactly one class.

### VERIFIED_CURRENT

A record may enter the operational subset only when it has:

- a valid incident identity;
- usable geolocation or an explicit operational area geometry;
- a valid observation/official timestamp;
- freshness within the incident-type operational window OR an authoritative current official state;
- at least one admitted source object;
- a non-historical lifecycle state;
- an explicit verification state;
- no blocking identity contradiction.

Current detection candidates are not automatically verified incidents.

### DETECTION_CANDIDATE

Use for thermal/sensor/single-source signals awaiting corroboration or official association.

### NEEDS_REVALIDATION

Use for records that were previously useful but now fail current operational freshness, source, geometry, or official-state rules.

### HISTORICAL_CLOSED

Use for contained, extinguished, archived, expired, superseded, or historical records without current operational relevance.

## A2. Operational scope

Produce explicit counts:

```text
currentVerifiedCount
candidateCount
needsRevalidationCount
historicalClosedCount
totalCanonicalCount
```

Never display total canonical count as Active.

## A3. One incident decision-state projection

For each incident, derive and expose:

```text
incidentId
label
location
classification
lifecycleState
verificationState
freshnessState
firstObservedAt
lastObservedAt
ageMs
sourceCount
independentSourceFamilyCount
officialConfirmationState
weatherAssociationState
geometryState
geolocationState
riskExposureState
priorityState
priorityScore
priorityRationale[]
latestMaterialChange
resolutionJobs[]
humanDecisionRequired
humanDecisionReason
operationalActions[]
protectionState
outcomeState
```

Every route must consume this shared projection or view model.

## A4. Cross-route invariant service

Build a runtime/static invariant check that fails the release on any contradiction, including:

- stale, non-official record counted as current active;
- human/manual escalation present while Needs Attention/Needs You equals zero;
- unresolved high-impact decision present while attention count equals zero;
- resolution requirements counted as system actions;
- weather displayed as incident intelligence while association state is absent, unless explicitly labelled regional/unassociated context;
- selected incident and map scene/camera/label mismatch;
- system health marked fully healthy while a critical SLO is breached;
- runtime component READY while its own readiness payload says not ready;
- source health service available presented as incident source coverage available;
- a route using a different incident classification/freshness label from another route.

Produce a machine-readable contradiction report with zero remaining contradictions.

---

# Workstream B — Health, readiness, and loading truth

## B1. Separate status dimensions

Introduce independent state axes:

```text
platformHealth
mapTransportHealth
dataFreshnessHealth
verificationCoverageHealth
scientificReadiness
operatorWorkloadHealth
```

The global header may summarize platform state, but it must expose degraded substate when user-facing critical services fail.

Do not use one green Operational chip to imply that all data and decision systems are healthy.

## B2. Startup lifecycle

Use coherent states:

```text
CONNECTING
WARMING
REFRESHING
OPERATIONAL
DEGRADED
CRITICAL
```

Retained data must be explicitly described as retained while refreshing, never as fully current.

Initial route loading must preserve layout and last-good content. Do not flash Unavailable.

## B3. Readiness contracts

For every component, validate:

- process alive;
- startup ready;
- deployment identity ready;
- required contract match;
- freshness of readiness observation.

The orchestrator and UI must use the same contract.

---

# Workstream C — Command Overview

## C1. Replace misleading metrics

Replace the current four metrics with:

```text
CURRENT VERIFIED INCIDENTS
NEW DETECTION CANDIDATES
NEEDS REVALIDATION
HUMAN DECISIONS REQUIRED
```

Each card must include a meaningful delta or age distribution only if the backend owns it.

Place total canonical/historical records in a secondary scope detail, not the primary command row.

## C2. Priority queue

Every priority item must expose:

- classification;
- freshness;
- verification/source strength;
- known exposure or explicit unknown;
- latest material change;
- why ranked;
- current resolver/action;
- next check/deadline;
- open Quicklook.

No generic ordering by array position.

## C3. Incident Quicklook

On one marker or priority-item click, replace the right rail with a useful Quicklook:

```text
Incident name and location
Classification and verification
Last observed and age
Source count / independent families / official state
Known area or geometry state
Known community/asset exposure
Latest material change
Current resolution/action
Next decision
[Open Incident] [Open Intelligence] [Open Operations]
```

Preserve map context. Do not route automatically.

## C4. Map state

The Command map header must distinguish:

- current imagery and labels;
- retained imagery while revalidating;
- partial layer recovery;
- transport degraded;
- scientific overlays unavailable.

“Available” is not sufficient.

---

# Workstream D — Incidents and Incident Detail

## D1. Incidents inventory

Required columns/row semantics:

```text
Incident
Location
Classification
Verification
Freshness
Latest material change
Risk/exposure
Priority and rationale
```

Remove `context` as priority. Use `UNASSESSED` until a real priority exists.

Rows must differ meaningfully. Do not repeat one generic assessment across the list.

## D2. Selection and camera atomicity

A selection change must update in one transaction:

- controlled incident state;
- URL;
- selected row;
- map source/filter;
- marker;
- camera;
- Quicklook/summary;
- downstream route context.

No prior incident can remain in the map after a new row is selected.

Add Bragança-versus-Porto regression coverage.

## D3. Incident Detail primary answer

Within 15 seconds the operator must answer:

- What is it?
- Is it current?
- How strong is verification?
- What changed?
- What is at risk?
- What remains uncertain?
- What is VIGIA doing now?
- When is the next check?
- What human decision is required?

## D4. Active resolution

Replace generic resolution text with actual jobs. Every unresolved field must link to a resolver job.

Do not expose raw enum `MANUAL_ESCALATION_REQUIRED`. Render human language and preserve the enum only in technical disclosure.

---

# Workstream E — Source-resolution engine

## E1. Convert requirements into jobs

The existing requirements become source-resolution jobs, not operational actions.

Every job must persist:

```text
jobId
incidentId
requirementType
requiredSourceClass
selectedSourceId
owner
state
createdAt
lastAttemptAt
nextAttemptAt
attemptCount
retryPolicy
deadlineAt
escalationAt
lastResult
unlockCondition
decisionImpact
completionCondition
receipt
```

## E2. Identify real source dependencies

Inspect and activate existing source/provider capabilities. Do not create generic “external source” placeholders when a known class exists.

Examples may include official civil-protection records, FIRMS/VIIRS, IPMA/weather, field observations, incident-command ledgers, map context, and source registries already present in the repository.

A job may truthfully say no configured provider exists, but then it must have:

- a named provider class required;
- owner;
- escalation;
- deadline;
- remediation path.

## E3. Scheduler

Implement bounded scheduling:

- immediate first attempt;
- source-specific retry/backoff;
- circuit breaker;
- next-check timestamp;
- deduplication/idempotency;
- stale-job detection;
- escalation event;
- audit record.

“On next canonical projection refresh” is not a sufficient schedule.

## E4. Source health versus incident coverage

Separate:

```text
provider reachable
provider current
incident associated
incident corroborating
incident official
```

Never present provider availability as incident coverage.

---

# Workstream F — Map truth and performance

## F1. Preserve persistent MapLibre architecture

Do not regress to route remounts, style reloads, or DOM-heavy markers.

Required:

- one route-scoped persistent map instance;
- `setData`/filters/layer visibility in place;
- no route rerender on drag;
- no map destroy on filter/selection;
- trackpad, wheel, touch-pinch, keyboard navigation;
- selected marker/Quicklook synchronized;
- deterministic camera transitions.

## F2. Imagery and labels

Imagery and label recovery are independent.

Do not upscale parent label tiles. If current labels are unavailable:

- keep last-good label tiles at native zoom where valid;
- use vector labels from a governed source;
- suppress labels rather than display enormous blurry text;
- preserve imagery without text corruption.

## F3. Geolocation

For the operational subset, achieve ≥95% usable geolocation.

Allowed:

- source-provided exact coordinates;
- admitted geometry centroid;
- governed locality geocoding with confidence and `approximate` label.

Not allowed:

- invented coordinates;
- silent district-center substitution;
- treating approximate geocoding as exact incident location.

## F4. SLO repair

Current critical baselines include map stable render 5.78 s, API p95 3,370 ms, and 72 tile failures.

Investigate:

- proxy concurrency and queuing;
- tile request duplication;
- source/style churn;
- stale-while-revalidate implementation;
- parent-tile fallback;
- cache headers and CacheStorage keys;
- request cancellation;
- view-dependent overfetch;
- label/imagery request separation;
- API payload and N+1 enrichment;
- route hydration and expensive transforms.

Hard targets are in the acceptance gates.

## F5. Instrumentation correctness

A reported first-base-tile value of `0.00 s` must be proven, not defaulted.

Every performance metric needs sample count, measurement window, p50/p95, and validity state.

---

# Workstream G — Intelligence

## G1. Decision hierarchy

Retain the approved structure but make each section distinct:

```text
NOW — observed current state
NEXT — likely non-geometric evolution or next evaluation
WATCH — measurable triggers and thresholds
UNCERTAINTY — ranked unknowns and their decision impact
DECISION — current posture and change condition
```

Do not repeat the same requirement under Watch and Uncertainty.

## G2. Non-geometric intelligence

Even when forecast geometry is withheld, provide available decision advantage:

- observation persistence/trend;
- thermal count/time distribution;
- weather trend and change;
- wind direction/speed and trend;
- humidity/temperature context;
- nearest communities/assets/access routes where admitted;
- source freshness and association state;
- watchpoint current value/threshold/trend;
- decision consequence;
- next automatic evaluation.

## G3. Weather semantics

Every weather artifact must say:

```text
INCIDENT ASSOCIATED
REGIONAL CONTEXT
UNASSOCIATED
```

Situation Quality must use the same association definition.

## G4. View on map

A mappable artifact action must:

- activate the relevant layer;
- focus/fit the feature;
- highlight it visibly;
- update legend/layer state;
- expose Clear focus.

If no geometry exists, disable the action and explain why.

---

# Workstream H — Operations and protection

## H1. Separate work types

Operations requires two explicit workspaces/lane groups:

### SOURCE RESOLUTION

- obtain corroboration;
- acquire official state;
- associate weather;
- resolve geometry;
- verify source freshness.

### RESPONSE OPERATIONS

- review exposure;
- prepare protection brief;
- request field verification;
- propose resource assignment;
- request/track authorization;
- dispatch/acknowledge;
- monitor execution;
- verify postcondition;
- escalate missing response.

Evidence requirements may not be counted as response operations.

## H2. Prioritized queue

A compact row contains only:

```text
Action
Why now
State
Owner
Deadline / next check
```

Inspector contains source, retry, escalation, authority, unlock/completion, receipt, and provenance.

## H3. Human decisions

`Needs You` and `Human decisions due` must derive from one contract and include:

- decision type;
- incident;
- reason;
- deadline;
- authority required;
- recommended options;
- consequences;
- audit trail.

## H4. Governed protection workflow

Implement the Protect loop:

```text
incident/candidate
→ exposure assessment
→ protection threshold evaluation
→ recommendation
→ authority review
→ alert/order draft
→ approval/rejection
→ dispatch
→ acknowledgement
→ update/cancel/expire
→ postcondition observation
```

When live authority or delivery is not configured, use an isolated `SHADOW_EXERCISE` universe with unmistakable labelling and no external send capability.

Use existing CAP/alert/authority capabilities if present. Do not rebuild them blindly.

## H5. One end-to-end scenario

Select one real archived incident or deterministic governed exercise. Persist and demonstrate the full path without contaminating production truth.

---

# Workstream I — Outcome measurement

## I1. Persist the chain

Required distinct records:

```text
proposedAction
approvedAction
executionAcknowledgement
expectedPostcondition
observedPostcondition
outcomeClassification
```

Each must have identity, incident link, timestamps, authority/source, and lineage.

## I2. Certified replay

If live outcomes do not exist, create an explicit certified replay/exercise using retained historical evidence. The UI and reports must separate:

```text
LIVE PRODUCTION
CERTIFIED REPLAY
EXERCISE
```

A replay may prove the workflow. It may not claim live risk reduction.

## I3. Outcome measures

Where defensible, record measures such as:

- detection-to-assessment time;
- assessment-to-authorized-action time;
- acknowledgement latency;
- action completion latency;
- exposure estimate before/after;
- lead time gained;
- postcondition met/not met/indeterminate;
- data sufficiency.

Do not infer causal success without evidence.

---

# Workstream J — Reports and Analytics

## J1. Decision Summary

Every material decision row must show:

```text
incident
previous state
new state
reason
operational consequence
owner
age
next resolution step
```

`Decision view ready` is permitted only when required fields exist for the reporting scope.

## J2. Outcome Analysis

Show the real persisted funnel, with live and replay/exercise separated.

Explain why items are not measurable using actionable categories:

- no initiated action;
- acknowledgement missing;
- expected postcondition missing;
- observation pending;
- linkage failure;
- classification pending;
- insufficient evidence.

All counts must drill down.

## J3. System Performance

Separate availability from performance. Every metric includes:

- current;
- target;
- p50/p95/sample count;
- trend;
- state;
- last measured;
- affected route/source;
- remediation link.

Top-level Operational cannot conceal critical SLOs.

## J4. Situation Quality

Every dimension must drill into affected incidents and show:

- failure reason;
- source/field missing;
- current resolver job;
- age;
- decision impact;
- next check;
- escalation.

No `drill-down unavailable` remains for a measured dimension.

## J5. Scope/time/compare/export

The controls must change the data, URL, chart/list, and exported artifact without route remount or map interference.

---

# Workstream K — Global Awareness

## K1. Honest scope

If only Portugal is authorized, make the scope explicit throughout. Do not imply global source coverage that does not exist.

## K2. Semantic markers

Markers distinguish at minimum:

```text
verified current
candidate
needs revalidation
historical/closed
selected
cluster
```

Use shape/fill/stroke/legend, not color alone.

## K3. Result rail

Each result shows classification, freshness, verification strength, priority/rationale, and Quicklook.

## K4. Filters

Every filter changes:

- URL;
- counts;
- map source/filter;
- result list;
- summary;
- fit-results count;
- active chips;
- export scope.

No basemap reload.

## K5. Operational geolocation

≥95% of the operational subset must map. Unmapped candidates/historical records are explicitly counted and drillable.

---

# Workstream L — Operator language and UX integrity

Primary UI must not expose raw/internal language such as:

```text
canonical projection
Operational Twin
provider-published authoritative geometry revision
official 1h/3h labels
MANUAL_ESCALATION_REQUIRED
source dependency not yet identified
on canonical projection refresh
not returned
```

Replace with direct operator language while preserving technical details behind disclosure.

Examples:

```text
Next check: 08:15 UTC
Source: Civil Protection official feed
Escalates to: Duty intelligence officer
Reason: No independent confirmation after 20 minutes
```

Critical content wraps; it is never ellipsized.

All buttons must produce a visible state transition. Toast-only actions fail.

---

# Workstream M — Architecture and implementation discipline

- Keep business classification and scoring outside UI components.
- Introduce DTO/view models for operator routes.
- Avoid god files; split by capability.
- Reuse existing domain/source/authority/alert/outcome capabilities before adding new ones.
- Keep one canonical selected-incident store with route ownership.
- Preserve immutable source evidence and audit history.
- Add migrations only when necessary and reversible.
- Preserve current dirty worktree; do not reset, stage, or commit.
