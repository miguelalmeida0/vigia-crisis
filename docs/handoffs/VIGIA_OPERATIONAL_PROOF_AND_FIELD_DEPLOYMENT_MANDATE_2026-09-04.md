# VIGIA — OPERATIONAL PROOF AND FIELD-DEPLOYMENT MANDATE
**Date:** 2026-09-04  
**Workspace:** `/Users/malmeida/Documents/ChatGPT/VIGIA Integration`  
**Branch:** `integration/vigia-world-class-convergence`

---

# Executive directive

VIGIA has reached a decisive transition point.

The runtime, release identity, FieldNet readiness, map engine, truth boundaries, collection architecture, action semantics, and white visual system are now materially stronger.

That is not the finish line.

The current platform still lacks sufficient live operational proof. The existing release reports:

- 207 canonical incident records;
- 0 `VERIFIED_CURRENT`;
- 33 `DETECTION_CANDIDATE`;
- 174 `NEEDS_REVALIDATION`;
- 828 information requirements;
- 2,898 collection tasks;
- no qualifying live cohort with measured collection-satisfaction latency;
- 84 incidents with usable thermal observations;
- 0 incidents with governed terrain;
- 207 records with some governed weather context, with association depth requiring verification;
- 84 records described as observed geometry, whose exact geometry class must be audited;
- 6 human-attention items after successful compression;
- 0 live response operations;
- 0 live production action-to-outcome chains.

This mandate exists to move VIGIA from:

```text
excellent operational platform architecture
```

to:

```text
field-provable crisis intelligence and command capability
```

The next release must demonstrate that VIGIA can:

```text
identify a decision-relevant unknown
→ build a collection plan
→ task real sources
→ receive and qualify evidence
→ satisfy the requirement
→ update incident truth
→ change a decision
→ initiate governed work
→ obtain acknowledgement
→ observe a postcondition
→ measure the result
```

Do not produce another architecture-only release.

---

# Absolute constraints

Preserve:

- approved white visual system;
- seven-route information architecture;
- canonical runtime and release identity;
- FieldNet exact-scope isolation;
- FieldNet authoritative readiness;
- append-only/auditable history;
- persistent MapLibre instances;
- no map remounts/style reloads on ordinary interaction;
- replay/live separation;
- authority boundaries;
- scientific admission;
- provenance;
- current dirty worktree.

Do not:

- fabricate official confirmation;
- fabricate thermal observations;
- fabricate terrain values;
- fabricate geometry;
- fabricate exposure;
- fabricate authority;
- fabricate resource dispatch;
- fabricate live action;
- fabricate outcomes;
- count replay as production;
- lower gates to claim success;
- stage;
- commit;
- reset runtime data;
- redesign the shell;
- create another frontend or Design Lab.

---

# Entry procedure

Before changing code:

1. Read `AGENTS.md`.
2. Read `AGENTS.override.md`.
3. Read all relevant `.agents/**/SKILL.md`.
4. Read the latest implementation report and certification.
5. Read `VIGIA_FINAL_UNDER_7_ELIMINATION_AUDIT.md`.
6. Read `VIGIA_COLLECTION_FUSION_TASKING_DECISION_RECOVERY.md`.
7. Verify the canonical runtime and identity quartet.
8. Record `git status --short`, `git diff --stat`, and `git diff --check`.
9. Capture all seven routes at 1672×941.
10. Record baseline metrics listed below.
11. Classify current changes as task-related, generated, or pre-existing.
12. Do not modify code until the baseline is saved.

Create:

```text
.artifacts/operational-proof-field-deployment/baseline/
```

with:

```text
release-identity.json
git-status.txt
changed-file-classification.json
route-screenshots/
baseline-metrics.json
```

---

# Five-step program

This mandate implements Step 1 and software portions of Steps 2–4. It must also produce the package required for Step 5.

## STEP 1 — Prove the intelligence collection loop

VIGIA must close real information requirements, not merely create them.

## STEP 2 — Establish complete static and environmental context

Terrain, roads, communities, critical assets, and point-based context must become available wherever valid coordinates permit.

## STEP 3 — Reach current verification and decision-ready prioritization

The system must prove that legitimate evidence can promote incident state and explain why each incident is ranked.

## STEP 4 — Execute an incident-command exercise end to end

Real human/operator actions in a clearly isolated exercise universe must pass through objectives, assignments, authority, acknowledgements, postconditions, and outcomes.

## STEP 5 — Produce a government-pilot and red-team package

A separate independent agent and human exercise will use this package after implementation.

---

# STEP 1 — Close the intelligence collection loop

## 1.1 Baseline the current requirement population

For all current information requirements record:

```text
requirementId
incidentId
question
decisionBlocked
priority
requiredEvidenceClasses
state
createdAt
deadline
collectionPlanId
taskCount
tasksAttempted
qualifyingEvidenceCount
lastAttemptAt
nextAttemptAt
terminalReason
satisfactionRule
satisfiedAt
incidentRevisionBefore
incidentRevisionAfter
```

Produce:

```text
data/validation/operational-proof/information-requirement-baseline.json
```

## 1.2 Select a representative closure cohort

Choose at least 30 real current requirements across at least five classes:

- thermal observation;
- independent corroboration;
- official status;
- weather association;
- terrain/context;
- geometry/extent;
- source conflict;
- field verification.

The cohort must not be selected only because it is easy.

Document selection and eligibility.

## 1.3 Required requirement lifecycle

Every requirement must follow a durable lifecycle:

```text
OPEN
→ COLLECTION_PLANNED
→ COLLECTING
→ PARTIALLY_SATISFIED
→ SATISFIED
```

or:

```text
CONFLICTING
BLOCKED_AUTHORITY
TERMINAL_UNAVAILABLE
ESCALATED
```

Every transition requires:

```text
at
actor/system
reason
source task
evidence
receipt
previous state
new state
```

## 1.4 Required proof target

At least 20 real requirements must reach `SATISFIED`.

They must span at least four evidence classes.

A requirement is not satisfied merely because a provider responded.

Required chain:

```text
provider/source response
→ normalized observation/object
→ spatial/temporal match
→ causal-family evaluation
→ quality/freshness validation
→ admission
→ satisfaction-rule evaluation
→ requirement SATISFIED
→ incident revision
→ route projection change
```

## 1.5 Collection latency metrics

Record:

```text
created → plan
plan → first task start
first task → first response
response → admission
admission → satisfaction
satisfaction → incident revision
incident revision → operator-visible update
```

Report:

```text
p50
p95
max
sample count
source class
provider
cold/warm/cache state
```

Targets:

```text
Local task scheduling p95                    <250 ms
Admission after provider response p95        <500 ms
Incident revision after satisfaction p95     <500 ms
Operator-visible update after revision p95   <500 ms
No hidden unresolved interval without state  0
```

Provider/network latency is reported separately and does not excuse missing state.

## 1.6 Collection effectiveness dashboard

Create an operator/administrative view or drill-down—not a new primary route—that answers:

```text
Requirements opened
Collecting
Partially satisfied
Satisfied
Blocked by authority
Terminal unavailable
Escalated
Median time to satisfaction
Oldest decision-blocking requirement
```

Do not expose raw job noise by default.

## 1.7 No fake satisfaction

Forbidden:

- fixture evidence mixed into live truth;
- provider response counted as qualified evidence;
- duplicate causal family counted twice;
- stale evidence satisfying currentness;
- replay satisfying live requirement;
- operator acknowledgement satisfying evidence requirement.

---

# STEP 2 — Complete static and environmental context

## 2.1 Terrain is a P0 engineering requirement

`0/207` terrain is not an acceptable final state.

Integrate a governed elevation source available to the project, reusing existing provider abstractions.

The provider must expose:

```text
provider
product
version
resolution
coordinate reference system
coverage
retrievedAt
license/provenance
cache policy
failure state
```

For every valid incident coordinate derive:

```text
elevation
slope
aspect
local relief
ruggedness where defensible
method
source resolution
precision
computedAt
```

## 2.2 Terrain acceptance

For incidents with valid coordinates and provider coverage:

```text
terrain availability                           100%
source/provenance                              100%
precision/resolution disclosed                 100%
cache reuse                                    PASS
invented terrain                               0
terrain coupled to live-fire provider          0
```

A terrain failure must be explicit and actionable.

## 2.3 Point-based context

Even when perimeter geometry is absent, compute clearly labelled preliminary proximity context:

```text
nearest community
distance to nearest community
population source and date
nearest major road
nearest access route
nearest hospital
nearest fire station
critical power/communications/water assets
protected/natural areas where governed
```

Every distance must state:

```text
incident coordinate method
coordinate precision
context data source
distance method
preliminary=true
```

Do not imply exposure intersection from a point.

## 2.4 Weather association

Audit the claimed 207 governed weather contexts.

Classify every record:

```text
INCIDENT_ASSOCIATED
REGIONAL_CONTEXT
UNASSOCIATED
```

Report:

```text
count
percentage
median model age
p95 model age
median spatial distance
provider/model
valid time
next cycle
```

Do not call regional weather incident evidence.

## 2.5 Weather decision value

For incident-associated or properly labelled regional context show:

```text
wind speed
wind direction
direction relative to nearest community
humidity
temperature
precipitation
trend from prior cycle
warnings
model run
valid time
distance/interpolation
next update
```

## 2.6 Geometry audit

The current report contains:

```text
usable thermal = 84
observed geometry = 84
```

Audit this exact equality.

Publish separate metrics:

```text
incident point coverage
thermal point/pixel geometry coverage
derived observed extent coverage
authoritative perimeter coverage
forecast geometry coverage
exposure-buffer coverage
```

Thermal footprint is not incident extent.

If the existing 84 “observed geometry” records are merely thermal geometry, rename the metric and all UI labels.

## 2.7 Observed extent acquisition

Activate existing legitimate providers/adapters for:

- authoritative perimeter;
- observed fire extent;
- burned-area products;
- event activation products.

Preserve strict classes:

```text
OFFICIAL_PERIMETER
OBSERVED_DERIVED_EXTENT
THERMAL_PIXEL
FORECAST_GEOMETRY
EXPOSURE_BUFFER
```

No visual or metric conflation.

---

# STEP 3 — Reach verification and decision-ready prioritization

## 3.1 Verification effectiveness

Current software can represent verification, but live `VERIFIED_CURRENT` remains zero.

Build a transparent promotion funnel:

```text
DETECTION_CANDIDATE
→ CORROBORATING
→ OFFICIAL_ASSOCIATION_PENDING
→ VERIFIED_CURRENT
```

For every blocked promotion record:

```text
candidate
provider attempts
qualified source families
official source status
identity match state
spatial match state
temporal match state
freshness state
authority state
exact blocker
next action
```

## 3.2 Positive and negative controls

Use retained legitimate historical evidence for positive controls.

Prove at least:

- valid official/current-at-the-time association promotes;
- stale official record does not promote current;
- spatially incompatible official record is rejected;
- duplicate republication does not increase independence;
- independent physical family contributes correctly;
- conflicting evidence remains conflicting.

Controls must remain structurally separated from live truth.

## 3.3 First genuine current verification

If a legitimate accessible current authoritative source exists, integrate and prove the first live `VERIFIED_CURRENT`.

If access requires an authority/credential:

- complete the adapter;
- complete authentication configuration;
- complete positive controls;
- expose exact missing credential/terms;
- produce a one-command activation path;
- do not claim verified current.

Do not call this external before all legal public sources and existing adapters are exhausted.

## 3.4 Source-family depth

Target the acquisition of distinct causal families, not duplicate observations.

Report:

```text
incidents with 1 family
incidents with 2 families
incidents with 3+ families
incidents blocked solely by independence
```

Target for the governed operational/candidate subset:

```text
>=2 causal families where legitimately observable  ≥30%
duplicate-family inflation                         0
```

## 3.5 Explainable priority model

Create one backend-owned priority model using only admitted facts:

```text
freshness
verification stage
material change
source conflict
potential point-based context
geometry availability
human decision deadline
operation deadline
protection threshold
provider degradation
unacknowledged work
```

Return:

```text
priority class
rank
factors[]
plain-language reason
missing factors
evaluatedAt
revision
```

The operator must always be able to answer:

```text
Why is this item ranked above the next one?
```

No opaque score without factors.

## 3.6 Triage acceptance

Every incident row and Quicklook must expose:

```text
classification
freshness
source-family strength
latest material change
priority
why ranked
next system action
human decision state
```

Generic repeated assessment text is forbidden.

---

# STEP 4 — Execute an incident-command exercise end to end

## 4.1 Exercise universe

Create or reuse a strictly isolated universe:

```text
CONTROLLED_EOC_EXERCISE
```

It must never affect live production truth or external systems.

It must be visually and structurally unmistakable.

## 4.2 Human roles

The exercise requires at least these distinct role capabilities:

```text
Incident Commander
Intelligence Lead
Operations Lead
Protection/Alert Authority
Field/Resource Operator
Observer/Auditor
```

The same human may simulate multiple roles during local testing only when the audit trail records the role transition.

## 4.3 Operational period

Exercise flow:

```text
Start operational period
→ assign commander and leads
→ acknowledge objectives
→ create decision points
→ create tactics
→ create assignments
→ request resources
→ accept/reject/acknowledge work
→ record field update
→ conduct handoff
→ close operational period
→ generate after-action record
```

## 4.4 ICS-aligned objects

Use:

```text
OPERATIONAL_PERIOD
OBJECTIVE
TACTIC
ASSIGNMENT
RESOURCE_REQUEST
RESOURCE
OWNER
AUTHORITY
ACKNOWLEDGEMENT
COMPLETION
EXPECTED_POSTCONDITION
OBSERVED_POSTCONDITION
OUTCOME
```

Do not create generic work items.

## 4.5 Required exercise scenario

Use a realistic but clearly synthetic/retained scenario:

```text
candidate signal
→ independent corroboration
→ classification review
→ point-based community context
→ decision point
→ operational objective
→ field-verification assignment
→ protection recommendation
→ authority review
→ CAP draft
→ dispatch disabled/exercise transport
→ acknowledgement
→ postcondition observation
→ outcome classification
→ handoff
→ after-action report
```

## 4.6 Ownership and acknowledgement

Every action must visibly and durably update:

```text
owner
status
acknowledgedAt
deadline
next action
attention count
timeline
receipt
```

Refresh persistence is mandatory.

## 4.7 Outcome proof

Exercise chain requires distinct identities and timestamps for:

```text
proposed action
approved action
execution acknowledgement
expected postcondition
observed postcondition
outcome classification
```

The result may be:

```text
SUCCESS
PARTIAL
FAILED
INDETERMINATE
INSUFFICIENT_EVIDENCE
```

Do not force success.

## 4.8 Exercise metrics

Measure:

```text
signal → candidate
candidate → corroborated
corroborated → decision
decision → assignment
assignment → acknowledgement
acknowledgement → completion
completion → postcondition observation
postcondition → outcome
handoff completion time
operator backtracking
missed acknowledgements
```

## 4.9 Human usability gates

A human operator must be able to complete:

### Commander

```text
identify top incident
understand why it matters
identify next decision
assign objective
```

### Intelligence Lead

```text
inspect source families
review collection plan
resolve or escalate uncertainty
```

### Operations Lead

```text
create assignment
assign owner/resource
track acknowledgement
```

### Protection Authority

```text
review recommendation
approve/reject draft
confirm safe transport boundary
```

### Incoming Shift

```text
review unresolved decisions
acknowledge handoff
assume responsibility
```

Record completion time and errors.

---

# STEP 5 — Government pilot and independent red-team package

## 5.1 Pilot package

Produce:

```text
docs/pilot/
  EXECUTIVE_OVERVIEW.md
  GOVERNMENT_PILOT_SCOPE.md
  AUTHORITY_AND_ROLES.md
  PROVIDER_AND_DATA_REQUIREMENTS.md
  SECURITY_AND_PRIVACY_BOUNDARIES.md
  INCIDENT_OPERATING_MODEL.md
  EXERCISE_PLAN.md
  OPERATOR_TRAINING.md
  PROVIDER_FAILURE_RUNBOOK.md
  FIELDNET_OFFLINE_RUNBOOK.md
  PROTECTION_APPROVAL_RUNBOOK.md
  AUDIT_EXPORT_RUNBOOK.md
  KILL_SWITCH_AND_SAFE_MODE.md
  PILOT_ACCEPTANCE_CRITERIA.md
```

## 5.2 External dependency ledger

For every real external blocker:

```text
dependency
external party
why VIGIA cannot self-provide it
exact credential/data/authority needed
existing software readiness
positive control
activation procedure
failure behavior
product impact
```

## 5.3 Red-team package

Produce evidence for a separate independent agent to attack:

```text
false verification
stale-source promotion
duplicate-family inflation
attention over-compression
authority bypass
replay/live contamination
map/incident mismatch
incorrect weather association
thermal/perimeter conflation
outcome causal overclaim
resource dispatch claim without receipt
```

## 5.4 Pilot go/no-go criteria

No pilot-go recommendation unless:

```text
release identity coherent
FieldNet authoritative readiness
zero semantic contradictions
zero dead controls
terrain/context coverage meets gate
collection satisfaction demonstrated
attention compression safe
exercise completed
authority path safe
audit export complete
```

---

# Cross-cutting product requirements

## A. No dead or ambiguous actions

Every primary action must produce:

```text
visible immediate effect
canonical mutation or navigation
receipt when mutating
dependent projection update
counter update where relevant
refresh persistence
clear failure state
```

No toast-only mutation.

No generic `Inspect`.

No fake action styling.

## B. Mission state versus platform state

Always distinguish:

```text
Platform health
Mission-data readiness
Verification coverage
Scientific readiness
Operational workload
```

Do not hide mission weakness behind a green platform state.

## C. Human attention safety

Maintain the compression improvement, but prove that no critical decision was suppressed.

Adversarial cases:

```text
critical incident hidden in provider aggregate
authority decision suppressed
high-severity deadline grouped with low severity
material conflict remains machine-only
unacknowledged protection action suppressed
SLA breach fails to escalate
```

Acceptance:

```text
machine→human conversion                     <5%
missed required human decision               0
duplicate provider attention                 0
unowned critical attention                   0
attention without deadline/recommendation    0
```

## D. Common operating picture

Contextual map layers may include:

```text
incident lifecycle
thermal observations
observed extent/perimeter
weather
terrain
communities
critical assets
roads/access
assignments/resources
protection areas
field observations
provider degradation
```

Do not enable everything at once.

Marker classes must distinguish:

```text
verified current
detection candidate
needs revalidation
historical/closed
```

without relying only on color.

## E. Material events versus system activity

Primary mission event stream:

```text
new candidate
independent corroboration
official confirmation
material priority change
exposure change
protection threshold
assignment acknowledgement
containment/closure
```

Technical/provider stream:

```text
request sent
retry
validation
association rejection
cache event
circuit breaker
```

Never mix them.

---

# Performance gates

Preserve current strong API latency.

Re-measure map performance on hardware acceleration, not only SwiftShader.

Required:

```text
Warm useful-content API p95              <300 ms local
Critical API p95                         <1,000 ms
Quicklook decision-useful p95            <500 ms
Incident switch decision-useful p95      <750 ms
Map pointer-to-first-paint p95            <20 ms hardware GPU
Repeated >50 ms interaction frames       0 target
Map remounts                              0
Style reloads                             0
Blank frames                              0
```

Record software and environment separately.

---

# Required release evidence

Create:

```text
.artifacts/operational-proof-field-deployment/
  baseline/
  final/
    collection-closure/
    terrain-context/
    weather-association/
    geometry-audit/
    verification-funnel/
    priority/
    attention-red-team/
    eoc-exercise/
    protection/
    outcomes/
    browser/
    performance/
    route-screenshots/
    responsive/
    invariant-report.json
    release-identity.json
    certification.json
```

Produce:

```text
docs/handoffs/VIGIA_OPERATIONAL_PROOF_AND_FIELD_DEPLOYMENT_REPORT.md
```

---

# Objective completion gates

## Collection

```text
Real requirements reaching SATISFIED                >=20
Evidence classes represented                         >=4
Requirements with traceable collection plan          100%
Tasks with attempt/next-attempt/terminal state        100%
Satisfied requirement changes incident revision      100%
Satisfied requirement changes operator projection    100%
```

## Terrain/context

```text
Terrain for valid covered coordinates                100%
Terrain provenance/resolution                        100%
Point-based context clearly labelled preliminary     100%
Weather association class                            100%
```

## Geometry truth

```text
Thermal geometry counted as incident extent          0
Official/derived/forecast/exposure classes distinct  100%
Geometry metrics accurately named                    100%
```

## Verification/priority

```text
Positive-control promotion                           PASS
False promotion                                      0
Duplicate-family inflation                           0
Priority rationale                                   100%
```

## Attention

```text
Missed required human decisions                      0
Duplicate provider-level attention                   0
Machine→human conversion                             <5%
```

## Exercise

```text
Operational period completed                         1
Objectives/tactics/assignments persisted             PASS
Ownership and acknowledgement persisted              PASS
Protection authority path                            PASS
External live send                                   0
Postcondition/outcome chain                           PASS
Handoff completed                                    PASS
After-action package                                 PASS
```

## Interaction

```text
Dead controls                                        0
Toast-only mutations                                 0
Generic Inspect                                      0
StateLabel defects                                   0
Map/selection mismatch                               0
```

---

# What does not count as completion

The release is not complete because:

- the schema exists;
- tests instantiate an object;
- a replay file exists;
- a task reaches `RECEIVED`;
- a provider was queried;
- a card displays collection state;
- UI screenshots look good;
- certification script exits zero.

Completion requires end-to-end operational proof.

---

# Final response format

Report:

1. Executive verdict.
2. Exact release identity.
3. Current source/governed/generated file classification.
4. Requirement baseline.
5. Requirement closure cohort.
6. Satisfied requirement proof.
7. Collection latency.
8. Terrain integration and coverage.
9. Point-based context.
10. Weather association distribution.
11. Geometry audit.
12. Verification promotion funnel.
13. Priority model and rationale.
14. Human-attention adversarial proof.
15. EOC exercise.
16. Ownership/acknowledgement proof.
17. Protection/CAP path.
18. Outcome chain.
19. Pilot package.
20. Performance.
21. Tests and fresh screenshots.
22. Remaining genuine external dependencies.
23. Exact changed files.
24. Git staged/committed/reset state.

Finish exactly with:

```text
VIGIA_OPERATIONAL_PROOF_AND_FIELD_DEPLOYMENT_READY
```

or:

```text
VIGIA_OPERATIONAL_PROOF_AND_FIELD_DEPLOYMENT_BLOCKED: <precise blocker and failed gates>
```
