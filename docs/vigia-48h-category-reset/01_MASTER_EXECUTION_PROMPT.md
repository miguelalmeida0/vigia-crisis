# MASTER CODEX PROMPT — VIGIA CATEGORY RESET

Paste this entire prompt into the top Principal / Distinguished Engineer thread.

---

You are the Principal Distinguished Engineer, Chief Product Architect, Geospatial/Remote-Sensing Lead, Reliability Lead, and acting technical owner of VIGIA.

This is a **48-hour category-reset implementation program**.

Do not return another plan.

Do not spend the sprint re-auditing the repository.

Read the supplied VIGIA 48-hour plan documents, inspect the latest repository state, then:

**DESIGN → IMPLEMENT → RUN → MEASURE → LOOK AT THE PRODUCT → ITERATE → VERIFY → COMMIT.**

You have authority to substantially change:

- frontend architecture
- backend architecture
- navigation
- information architecture
- map rendering
- provider ingestion
- geospatial workers
- detector pipelines
- PostGIS schema
- replay and validation
- evidence workflows
- source health
- authentication UX
- product copy
- visual hierarchy

You may remove existing product surfaces when they obscure the mission.

You may not fabricate physical capability.

## Mission reset

The project drifted.

The original product was supposed to be a world-class wildfire **hazard detection** system.

The existing product became heavily centered on:

- public incident reports
- evidence provenance
- historical replay
- event association
- operator workflow

Those systems are valuable, but they are the backplane, not the product.

The application must now be rebuilt around the wildfire lifecycle:

### PREVENT
Detect dangerous physical conditions **before ignition**.

### DETECT
Detect physical ignition/fire signals independently of public reporting.

### FIRE
Maintain the canonical fire and show how its physical evidence changes.

### ACTION
Turn missing knowledge into owned evidence work.

Replay, Validation, Source Health, and Provenance remain critical secondary capabilities.

## The core product loop

TERRITORY
→ PRE-IGNITION PHYSICAL CONDITION
→ HAZARD CANDIDATE
→ IGNITION / THERMAL SIGNAL
→ PHYSICAL FIRE CANDIDATE
→ CROSS-SOURCE VERIFICATION
→ CANONICAL FIRE
→ EVOLVING PHYSICAL STATE
→ UNCERTAINTY
→ EVIDENCE ACQUISITION
→ ACCOUNTABLE ACTION
→ NEW EVIDENCE
→ UPDATED TRUTH

Every meaningful UI surface must map to this loop.

## Current backplane to preserve

Do not throw away working high-integrity infrastructure merely because product direction changes.

Preserve and reuse where sound:

- canonical event identity
- manual merge/split/reject corrections
- PostGIS persistence
- immutable/checksummed raw evidence
- controlled replay clock
- zero-future-leakage replay
- physical-first historical cases
- association abstention
- geospatial fail-closed integrity
- provenance inspector
- real Portuguese VIIRS corpus
- held-out benchmark infrastructure
- source-health semantics
- evidence need/request lifecycle

These should disappear into the foundation of a much stronger product.

## P0 strategic correction

Do NOT spend this sprint primarily on:

- replay aesthetics
- provenance cosmetics
- outcomes
- consequence dashboards
- generic alerts
- AI chat
- generic risk rankings
- marketing
- provider abstractions that do not unlock a real source
- synthetic demos

We are building physical intelligence.

## Deliverable 1 — Territory Command

The new primary home must answer:

> **What needs attention across the territory right now?**

Do not title the product "Fire events" as the primary concept.

Create one unified territory queue with typed physical states:

- PRE-IGNITION HAZARD
- UNREPORTED THERMAL CANDIDATE
- PHYSICALLY OBSERVED FIRE
- REPORT-ONLY INCIDENT
- STALE / ARCHIVED

The queue must prioritize by actual action value, not simply recency.

The map must show distinct physical semantics:

- pre-ignition candidate polygons
- thermal detections/support
- physically observed fires
- report-only markers
- stale events

No giant locality labels.

No report marker should visually dominate a detected physical hazard.

### Command summary

The top-level Territory Command should immediately show:

PRE-IGNITION CANDIDATES
PHYSICAL FIRE CANDIDATES
PHYSICALLY OBSERVED FIRES
REPORT-ONLY INCIDENTS
NEEDS EVIDENCE
SENSING HEALTH

When values are zero, render zero honestly.

## Deliverable 2 — First real pre-ignition detector

Implement **one** serious specialist capability:

# FUEL CONTINUITY CHANGE

Goal:

Detect meaningful new/increased continuous vegetation/fuel pathways that connect or materially approach vulnerable structures/infrastructure.

Use real analysis-grade Earth-observation data.

Preferred input direction:

- Sentinel-2 L2A native bands
- SCL/cloud mask
- comparable historical observation
- land cover
- terrain
- road network
- buildings / WUI
- current geospatial integrity gate

Do not solve this with RGB screenshots.

Do not use browse imagery.

Do not create a generic "vegetation continuity" checklist.

### Minimum output

FuelContinuityFinding {
  findingId
  geometry
  currentObservationId
  comparisonObservationId
  firstObservableInterval
  affectedAreaHa
  corridorLengthM
  nearestStructureM
  structuresWithinPolicyRadius
  infrastructureInteractions[]
  sourceQuality
  detectorVersion
  calibrationState
  provenance
}

Until properly calibrated:

label as:

**SCREENING CANDIDATE**

Never "verified hazard" automatically.

No fake probability.

### Visual requirement

The actual polygon must be visible over real imagery or a defensible map layer.

The user must be able to inspect:

- what changed
- when
- where
- how large
- what structures/infrastructure are nearby
- what source scenes generated the finding
- what is uncertain
- what should happen next

If suitable native imagery cannot be acquired, show a real data-availability state. Do not substitute synthetic imagery.

## Deliverable 3 — Physical ignition detector

Strengthen the DETECT path around real point-level thermal sensing.

The system must support:

REAL THERMAL OBSERVATION
→ canonical observation
→ no credible matching event
→ UNREPORTED PHYSICAL FIRE CANDIDATE
→ durable event
→ API/UI
→ later public report joins same event

Use whatever live physical provider can be legitimately configured.

Priority:

1. NASA FIRMS / VIIRS
2. Sentinel-3 SLSTR FRP
3. MTG structured fire/FRP

A missing credential may block one provider.

It may not block the sprint.

Continue with real historical/replay evidence and any other accessible real provider.

Never substitute fake production observations.

## Deliverable 4 — Living Fire

FIRE must become the deep physical-event workspace.

Question:

> **What is physically happening to this fire, how do we know, and how has it changed?**

Map:

- observed thermal support
- new support
- persisting support
- no-longer-observed support
- unresolved observations
- report location
- uncertainty

Keep separate:

OBSERVED THERMAL SUPPORT
ESTIMATED CURRENT EXTENT
FORECAST EXTENT

Do not call point hulls perimeters.

### Physical trend

Every trend state carries freshness.

Use:

LAST OBSERVED TREND
Growing · 8m ago

or:

CURRENTLY OBSERVED GROWING

only where the source cadence/freshness policy supports a present-tense claim.

### Situation strip

At the top of FIRE show, where real data exists:

- official report state
- physical state
- observation freshness
- personnel
- vehicles
- aircraft
- fire danger
- temperature
- humidity
- wind
- active physical sources

Response data is official operational context, not physical evidence.

Keep the semantics separate.

## Deliverable 5 — Operational compression

Learn from simple wildfire sites without copying their design.

A user should understand the selected incident in seconds.

Do not repeat "no physical observation" five different ways.

Primary hierarchy:

CURRENT TRUTH
RESPONSE
CONDITIONS
SENSING
NEXT KNOWLEDGE

Technical rationale is expandable.

Do not expose backend phrases such as:

PARTIAL INFORMATION GAIN UNMEASURED

in primary operator hierarchy.

Use human operational language.

## Deliverable 6 — Action that actually closes uncertainty

ACTION must answer:

> **What needs to happen next?**

No giant sign-in manifesto.

Unauthenticated:

Operator sign-in required
[Sign in]

Authenticated:

real work queue.

Lanes:

- OVERDUE
- NEEDS OWNER
- WAITING ON SENSOR
- FIELD VERIFICATION
- ASSOCIATION REVIEW
- NO AVAILABLE PATH
- RESOLVED

Every item shows:

- incident / finding
- missing knowledge
- recommended evidence path
- owner
- due/SLA
- acknowledgement
- state
- evidence required to close

If field capacity is not configured:

show:

Field resources unavailable

not repeated backend diagnostics.

## Deliverable 7 — Source opportunity planning

For every unresolved EvidenceNeed evaluate:

CURRENT REMOTE SOURCE
FUTURE REMOTE SOURCE
CAMERA
DRONE
FIELD

Only show real configured/defensible options.

If a future observation can be reasonably predicted, represent:

WAITING FOR REMOTE OBSERVATION

If no field resources exist:

FIELD RESOURCES NOT CONFIGURED

Generic `NO_OBSERVATION_PATH` should be a last-resort explicit terminal state, not the normal product experience.

## Deliverable 8 — Make Replay support the mission, not define the company

Replay remains important proof infrastructure.

Do not spend the sprint turning it into another standalone product.

Keep:

- real evidence only
- controlled clock
- jump to first physical
- jump to public report
- physical-first cases
- held-out metrics
- provenance

Use Replay to prove:

physical ignition detection
event identity
Living Fire
lead intervals
association/abstention

Do not let Replay remain the emotional center of the product.

The emotional center becomes Territory Command + physical detection.

## Deliverable 9 — Response context

Research legitimate authoritative/current Portuguese machine-readable sources for:

- personnel
- vehicles
- aircraft
- official incident status
- status progression
- burned area

If a reliable accessible source exists:

integrate it behind a provider-neutral ResponseSnapshot contract.

If not:

render `Response resources unavailable from connected sources`.

Do not production-scrape a fragile third-party HTML UI.

## Deliverable 10 — Environmental context

Expose:

temperature
humidity
wind speed
wind direction
fire danger

at incident level.

Where official forecast data supports it, add a compact short-horizon environmental strip.

Do NOT turn environmental context into fake spread prediction.

## Navigation reset

Primary:

PREVENT
DETECT
FIRE
ACTION

or an even stronger lifecycle-oriented composition if you can demonstrate it.

Do not keep LIVE / REPLAY / ACTION simply because that is the existing route structure.

Replay belongs under evidence/validation or a secondary route if a new lifecycle architecture is stronger.

Do not preserve old navigation out of inertia.

## UX standard

The finished product should feel like:

**an elite geospatial command instrument**

not:

- a dashboard template
- a dark developer console
- a cyberpunk map
- a government form product
- an evidence ontology browser

Use:

- strong spatial hierarchy
- fewer boxes
- fewer repeated labels
- more integrated data visualization
- restrained thermal color
- high-quality map layers
- premium chart grammar
- readable typography
- concise copy

No glow.
No neon.
No generic AI graphics.
No giant place-name overlays.

## Map standard

The map must become a physical-intelligence surface.

Use zoom-aware collision handling.

Prioritize:

- hazard polygons
- thermal support
- current physical event geometry
- uncertainty
- selected operational state

Subordinate:

- basemap labels
- report-only markers
- old/stale events

## Validation

The first detector must be evaluated.

At minimum:

- real positive cases where labels/adjudication exist
- meaningful negative controls
- abstention behavior
- precision
- recall where truth supports it
- false candidates per area/time where meaningful
- source-quality segmentation
- error taxonomy

Do not claim validated operational performance from a handful of hand-selected screenshots.

If performance is unmeasured:

UNMEASURED.

## Product metrics

Recenter product metrics around the original mission:

PRE-IGNITION

verified hazard precision
false candidates / territory
lead time before field/report discovery
time to verification

IGNITION

physical-first event count
observation→report interval
false thermal candidate rate
physical-event coverage

INCIDENT

time to verified physical state
freshness coverage
association/abstention
event fragmentation/false merge

ACTION

time from EvidenceNeed → owner
SLA acknowledgement
time to new evidence
unknowns resolved

## P0 release gates

The sprint is not complete unless the following are true:

### PRODUCT DIRECTION
- home no longer reads primarily as a public-report list
- pre-ignition physical conditions exist as first-class objects
- physical ignition candidates exist as first-class objects
- FIRE represents a physical phenomenon
- ACTION closes missing knowledge

### PREVENTION
- one real fuel-continuity detector exists end-to-end
- native imagery only
- real polygon
- real provenance
- explicit uncalibrated state
- no synthetic fallback

### DETECTION
- real point thermal data is supported
- physical-first event creation path works
- later report association preserves event ID
- provider configuration state is explicit

### UX
- Territory Command visually changes the product category
- no giant locality labels
- situation context compresses response/weather/sensing
- operator copy does not leak architecture terminology
- desktop and tablet are excellent
- mobile critical flows are purposeful

### EVIDENCE
- raw provenance still works
- geospatial integrity still fails closed
- replay future leakage remains zero
- synthetic production observations remain zero

### QA
- complete test suite passes
- architecture gate passes
- geospatial tests pass
- provider degradation tests pass
- browser E2E passes
- critical responsive QA passes
- no console errors

## Hard scope cuts

Do not spend material sprint time on:

- Outcomes
- broad consequence prediction
- generic alerting
- AI assistants
- insurance APIs
- marketing
- billing
- global expansion
- pretty replay polish not needed for validation

## Execution method

Do not spend half the sprint writing plans.

Use this loop:

INSPECT
→ IMPLEMENT A VERTICAL SLICE
→ TEST
→ RUN
→ LOOK AT THE UI
→ FIX PRODUCT QUALITY
→ COMMIT
→ NEXT SLICE

Work vertically.

The first vertical slice should be:

real EO scene
→ geospatial verification
→ fuel continuity detector
→ real polygon
→ Territory Command
→ evidence inspector
→ verification Action

Then:

real thermal observation
→ physical candidate
→ canonical event
→ FIRE
→ next evidence

## Git

Preserve history.

Create meaningful checkpoint commits such as:

feat: establish territory hazard intelligence
feat: ship real fuel continuity detection
feat: restore physical ignition detection
feat: rebuild living fire workspace
feat: deliver lifecycle command experience

Do not squash these away.

## Final hostile self-review

Before completion ask:

Does this still look like an app that reports fires?

If yes:
continue.

Can I point to a detected pre-ignition physical condition?

If no:
continue.

Can I point to an independently detected thermal candidate?

If no and provider credentials are blocked:
prove it in real historical replay and clearly report the live blocker.

Does the map show physical phenomena?

If no:
continue.

Can an operator understand the territory in ten seconds?

If no:
continue.

Would an investor understand the moat without me narrating architecture?

If no:
continue.

## Final response format

RELEASE VERDICT

THE PRODUCT RESET

PRE-IGNITION HAZARD ENGINE

PHYSICAL IGNITION ENGINE

TERRITORY COMMAND

LIVING FIRE

ACTION / UNKNOWN CLOSURE

REAL DATA SOURCES

REAL DETECTOR OUTPUTS

VALIDATION RESULTS

LIVE PHYSICAL STATUS

WHAT WAS DELETED

ARCHITECTURE CHANGES

VISUAL BEFORE → AFTER

TEST / QA RESULTS

SCREENSHOT EVIDENCE

GIT CHECKPOINTS

BLOCKED EXTERNAL SOURCES

EXACT SETUP STILL NEEDED

EXACT RUN COMMANDS

WHAT REMAINS UNMEASURED

NEXT SINGLE MOVE

Do not self-award high scores.

Do not call it production-ready.

Show evidence.

## Final principle

VIGIA must again be judged by the original mission:

> **Does the system see a dangerous physical world earlier and more clearly than a public fire-report feed?**

If the answer is not visibly yes somewhere in the product by the end of this sprint, the sprint is not complete.

Proceed at full capacity.
