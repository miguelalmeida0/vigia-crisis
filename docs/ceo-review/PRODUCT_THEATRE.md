# Product theatre

## Decision

The Reality Cutover removed most of the dangerous theatre. Production no longer displays synthetic fires, fake physical observations, seeded personas, generated prevention findings, fake outcomes, or a pretend field workflow. The remaining theatre is mostly **category, terminology, and dormant breadth**, not fabricated operational records.

That distinction matters. The product is now honest enough to expose its own absence of capability, but still presented as if the architecture itself were the capability.

## Theatre removed successfully

| Prior theatre | Current disposition | Evidence |
|---|---|---|
| Runtime fixture/demo switch | Rejected at startup | `apps/api/src/config/env.mjs:9` |
| Fixture provider reachable from production | Removed/gated | Reality gate: 0 fixture/test imports across 140 production modules |
| Generated satellite/forest assets under served root | Moved below tests / deleted | Reality gate: 0 served synthetic assets |
| Fake supervisor/analyst/field/viewer personas | Removed | Bootstrap exposes only `public-readonly`; fake actor header POST returns 401 |
| Seeded actions, hazards, outcomes, audit activity | Removed from fresh production state | Demo identity/state count 0 |
| Fake field/offline app | Removed from served product | Former `/field` assets deleted; fixture copy under tests |
| Local “watch/save event” presented as alerting | Removed from visible product | Live event action no longer exposes watch; event-watch routes removed |
| PREVENT/OUTCOMES/ACTION/FIELD as earned product areas | Hidden | Production nav exposes only Live and Fire |
| Synthetic replay treated as operational evidence | Renamed TEST; real replay requires external labels | `docs/reality/REPLAY_CORPUS.md:5` |
| Uncalibrated fire probability | Null without approved calibration | `packages/domain/src/evidence-fusion.mjs:46` |
| P10/P50/P90 scientific implication | Reframed as deterministic low/central/high screening | `apps/web/src/v2/views/consequence.js:25` |
| Thermal hull presented as fire perimeter | Explicit support-only geometry | `packages/domain/src/fire-event-geometry.mjs:14` |

This removal work is not cosmetic. It materially reduces the probability that an operator or reviewer confuses a demonstration with operational truth.

## Theatre still present

### 1. Category theatre: `PHYSICAL INTELLIGENCE`

The audited runtime had 0 point thermal observations, 0 physically current events, 0 multisource events, 0 lead-time samples, no configured FIRMS feed, and no point MTG/Sentinel-3 acquisition. The current product is a real public-report/context dashboard with evidence-gap accounting.

The brand is a roadmap claim displayed as a current capability claim.

**Disposition:** Rename the current artifact or qualify the brand until a real point-thermal release gate and measured corpus pass.

### 2. Observation theatre: `Earth observed … ago`

This sentence is sourced from an operational MSG WMS raster timestamp. The same screen correctly says the selected event has no physical observation. Putting “Earth observed” above the event can cause an operator to infer that the fire was observed from space.

**Disposition:** Replace with the exact sensor/product role: `MSG raster context timestamp … · not event point evidence`.

### 3. Fusion theatre

`fuseEventEvidence` contributes real value: it separates physical/report evidence, groups declared dependencies, distinguishes repetitions, records conflicts, rejects unqualified negative evidence, and refuses probability without calibration. It does not estimate a coherent fire state, geometry distribution, association hypothesis set, or calibrated uncertainty.

**Verdict:** **DEPENDENCY-AWARE EVIDENCE AGGREGATION, NOT VALIDATED SENSOR FUSION.**

**Disposition:** Use “evidence ledger” in product language. Retain “fusion” only as an internal aspirational module name until a benchmark proves a state estimate better than the best source alone.

### 4. Active-perception theatre

The code ranks configured assets by registry status, range, and ETA and can read externally supplied confirmed schedule records. The current registry and opportunity file are empty. There is no orbit/pass calculation, provider tasking integration, measured reliability, information value, or cost. Every live need falls back to a generated manual option with no owner.

**Verdict:** **FEASIBILITY PLUMBING, NOT ACTIVE PERCEPTION.**

**Disposition:** Do not use the term until the system autonomously identifies, commits, tracks, and receives at least one new observation path.

### 5. Durable-work theatre

`EvidenceNeed` is real durable state and `NO_OBSERVATION_PATH` is an excellent truth state. However, a need with no authenticated owner, no request, no connected method, and no next observation is not operational work. At audit runtime, every active need was in that state.

**Disposition:** Distinguish `tracked unknown` from `work`. Count owner-backed, SLA-backed requests separately and make `0 actionable / N unresolved` explicit.

### 6. Source-health theatre

The drawer shows attractive per-source cards and `current` labels. The checkpoint API has attempt/success/product/cursor/failure data, but the operator UI omits most of it. A point-in-time successful fetch is not a source SLO, nor does a current catalogue mean usable pixels have been acquired.

**Disposition:** Show role-specific health: `report feed current`, `catalogue reachable`, `raster context current`, `point evidence not configured`, `owned archive absent`.

### 7. Dormant platform theatre

The UI hides unearned planes, but production still constructs and routes prevention, detection, response, exposure, consequence, remediation, command, outcome, mission, audit, evidence request, sensor task, and alert services.

This creates a platform-shaped codebase without a platform-shaped buyer result.

**Disposition:** Remove those planes from the production composition. Preserve focused experiments behind non-production entrypoints and explicit release gates.

### 8. Validation theatre through test volume

122/122 tests, architecture checks, browser QA, and restart smoke are meaningful software evidence. They are not real wildfire validation. The browser gate verifies visible route labels, state classes, horizontal overflow, and console errors; it did not catch null weather rendered as exact zeros.

**Disposition:** Report software verification and operational validation as different sections. Never use test count near detection/association performance claims.

## Confirmed visible truth defect, not theatre

The Sintra UI displayed missing weather fields as exact zeros. This is more serious than theatre because it creates false data rather than exaggerated framing:

```text
API: temperatureC=null, humidityPercent=null, windSpeedKph=null
UI: 0°C, 0%, 0 km/h
Cause: Number.isFinite(Number(null))
```

This must be corrected before any shadow deployment.

## Current product category

The most accurate description is:

> A fixture-free, read-only Portugal wildfire public-report and evidence-gap console with real contextual acquisition, local provenance/checkpoint foundations, and synthetically verified physical-intelligence mechanics.

It is **not yet**:

- a physical fire detection product;
- a real multisensor fusion system;
- a living-fire geometry product;
- an active-perception system;
- an operational workflow platform;
- a prevention detector;
- an outcome-proven emergency system.

## Theatre budget rule

No new nouns should be added to VIGIA until a real artifact supports them. For the next program, every operator noun should map to an evidence object:

```text
DETECTED -> exact real observation + governed label policy
FUSED -> benchmarked multisource state estimate
ASSIGNED -> authenticated owner + durable request + SLA
CURRENT -> source-specific timestamp + threshold
PERIMETER -> authoritative geometry class and provenance
PREDICTED -> validated model/provider + scope
VERIFIED -> named verifier + evidence + policy
```
