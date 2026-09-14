# VIGIA — 48-Hour War Plan

This is an aggressive implementation sequence. It assumes one high-agency senior agent can modify the full repository, run services/tests, and make product decisions without repeated approval.

The timeboxes are prioritization guides, not promises. **Release gates outrank the clock.**

---

# HOUR 0–2 — Freeze the drift

## Objectives

- Read current `AGENTS.md`, CEO review, reality docs, latest Git history.
- Capture current screenshot baseline.
- Confirm current branches/services/database.
- Create recovery branch/worktree.
- Freeze non-P0 surfaces.

## Disable from primary focus

- Outcomes
- speculative consequence
- broad alerts
- marketing
- additional replay cosmetics
- generic prevention checklist
- old demo/synthetic paths

## Decisions required

- Final lifecycle nav: PREVENT / DETECT / FIRE / ACTION, or equivalent stronger lifecycle.
- Territory Command replaces "Fire events" as home concept.
- Existing Replay moves to secondary proof/validation role.

## Gate

A written 1-page implementation map is enough. Do not spend more than two hours planning.

---

# HOUR 2–8 — Vertical Slice A: Real Fuel Continuity

## Goal

One real pre-ignition detector exists end-to-end.

## Implementation

1. Select one bounded AOI/case with accessible real Sentinel-2 L2A data.
2. Acquire current + defensible comparison scene.
3. Run GeoIntegrityGate on every model-consumed band.
4. Align grid/resolution.
5. Apply SCL/cloud/shadow exclusion.
6. Compute vegetation/fuel features.
7. Segment meaningful change.
8. Build connected-component/connectivity logic.
9. Join roads/buildings/terrain.
10. Produce WGS84 finding polygon.
11. Persist finding + provenance.
12. Render polygon in PREVENT/Territory Command.
13. Add "Inspect evidence".
14. Add "Request field verification".

## UI

The first real output must read approximately:

**FUEL CONTINUITY CHANGE**

- 3.7 ha
- 612 m continuous corridor
- first visible between [dates]
- 47 structures within [policy radius]
- observation quality: High
- validation: Screening candidate

No confidence % unless calibrated.

## Gate

- real pixels
- real polygon
- real dates
- real provenance
- no synthetic fallback
- automated test
- browser screenshot

---

# HOUR 8–13 — Territory Command

## Goal

Home visibly stops being a fire-report product.

## Build

Unified prioritized object model:

- PreIgnitionFinding
- PhysicalFireCandidate
- FireEvent
- ReportOnlyIncident

Create priority contract based on:

- physical state
- exposure
- freshness
- uncertainty
- action requirement

Do not mix semantics.

## UI

Top command strip:

- PRE-IGNITION
- PHYSICAL CANDIDATES
- ACTIVE PHYSICAL FIRES
- REPORT-ONLY
- NEEDS EVIDENCE
- SENSING HEALTH

Left rail: prioritized territory queue.

Map: polygons + physical detections + report-only symbols.

Right rail: situation summary.

## Gate

A screenshot must look obviously unlike the current "Fire events" dashboard.

---

# HOUR 13–18 — Vertical Slice B: Physical Ignition

## Goal

Physical thermal evidence can create a fire without a report.

## Work

- Configure live FIRMS if credentials available.
- Otherwise use existing real archived VIIRS corpus through production domain path.
- Normalize into canonical physical observation.
- Use event identity engine.
- Create unreported physical candidate.
- Associate later public report to same canonical event.
- Show event state in DETECT/Territory Command.
- Preserve raw provenance.

## Gate

At minimum real historical evidence demonstrates:

physical observation
→ physical-first event
→ report joins later
→ same event ID

If live key available, repeat against live API.

---

# HOUR 18–24 — Living Fire

## Goal

Physical fire becomes a spatiotemporal phenomenon.

## Build

Per-frame data:

- current thermal observations
- newly active support
- persisting support
- no-longer-observed support
- FRP
- centroid
- movement
- source platform
- uncertainty

## UI

FIRE workspace:

Top: compact Situation Strip.

Center: Living Fire map.

Bottom: synchronized physical timeline.

Side: Evidence Summary / Next Knowledge.

No huge locality label.

## Gate

A physical-first historical case must visibly evolve through multiple timestamps.

---

# HOUR 24–29 — Situation/Response Compression

## Goal

Match or exceed simple wildfire sites on immediate operational comprehension.

## Integrate where attributable

- official response status
- personnel
- ground vehicles
- aircraft
- burned area if available
- weather
- humidity
- wind speed/direction
- fire danger

If official machine-readable response resource data is unavailable:
render "Unavailable from connected sources".

Do not scrape brittle HTML into production.

## Gate

Selected incident is understandable in <10 seconds.

---

# HOUR 29–34 — Close the Unknown / Action

## Goal

Every important uncertainty has a next state.

## Build/finish

- EvidenceNeed
- ObservationOpportunity
- EvidenceRequest
- owner
- SLA
- acknowledgement
- completion evidence

Improve states:

- waiting remote observation
- field verification
- needs owner
- no configured field capacity
- no available path

## UX

Delete giant authentication manifesto.

Unauthenticated = compact sign-in.

Authenticated = real queue.

## Gate

A real detector candidate can generate a verification task and persist across restart.

---

# HOUR 34–38 — Validation

## Goal

No detector ships only because a screenshot looks convincing.

### Fuel continuity

Measure what the available evidence supports:

- accepted candidate precision via adjudication
- false candidates
- abstention
- source quality
- failure cases

### Event/ignition

Retain:

- held-out association
- fragmentation
- false merge
- abstention
- physical-first cases
- observation→report intervals

## Gate

Validation surface cleanly separates:
- held-out
- development/regression
- unmeasured

---

# HOUR 38–43 — Product design hardening

## Fix ruthlessly

- map label collisions
- giant locality labels
- excessive containers
- tiny critical metadata
- backend jargon
- redundant explanations
- empty panels
- generic chart styling
- tablet/mobile overflow
- mouse-only timeline

## Gate

Desktop/tablet/mobile screenshots look coherent and intentional.

---

# HOUR 43–47 — Adversarial verification

Run:

- full tests
- architecture
- reality gate
- geospatial
- PostGIS
- restart
- duplicate ingestion
- provider outage
- malformed source
- replay future leakage
- auth/action
- browser E2E
- responsive QA
- console inspection

Perform manual product walkthrough.

---

# HOUR 47–48 — Freeze / handoff

Capture screenshots:

1. Territory Command
2. Pre-ignition finding
3. Detection candidate
4. Living Fire
5. Evidence provenance
6. Action verification work
7. Validation
8. Source health
9. Mobile
10. Empty/degraded live state

Commit clean checkpoints.

Final response must report blockers and unmeasured capability without spin.
