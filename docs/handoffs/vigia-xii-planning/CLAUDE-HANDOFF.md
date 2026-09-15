# VIGIA XII — Mission Planning + Constrained Resource Reasoning · Codex handoff

**Built on** the local VIGIA XI head (`f641a5d`), which is your integrated
`1d10928`. **Commit** `67ec4d9`.

Companion to `docs/handoffs/vigia-x-core/CODEX-HANDOFF.md` (VIGIA X) and
`CLAUDE-INTELLIGENCE-EXTENSION.md` (VIGIA XI). XII consumes both and replaces
neither. All 79 X/XI tests still pass unchanged.

---

## ARCHITECTURE

```
canonical resources + mission requirements   resource-model.mjs
        ↓
candidate narrowing (provably safe)          feasibility.mjs
        ↓
constraint evaluation (11 constraints)       constraints.mjs
        ↓                                    access-intelligence.mjs → VIGIA XI
feasible candidate relation                  feasibility.mjs
        ↓
contention analysis (interval sweep)         contention.mjs
        ↓
bounded assignment options                   assignment-options.mjs
        ↓
transparent ordering + explanation           assignment-options.mjs
        ↓
advisory projection                          mission-planning.mjs
```

Plus `replan.mjs` — minimal affected set and plan difference.

**Planning artifacts are derived.** There is no second truth store: a plan is
recomputed from canonical records on every call and never persisted.

| File | Lines | Role |
|---|---|---|
| `resource-model.mjs` | 120 | canonical resources/requirements, three-valued fields |
| `constraints.mjs` | 184 | the eleven constraints |
| `access-intelligence.mjs` | 113 | XI consumption: road truth, staleness, cut sets |
| `feasibility.mjs` | 160 | three-state combination, safe narrowing |
| `contention.mjs` | 120 | competing demand, unsupported requirements |
| `assignment-options.mjs` | 180 | bounded options, lexicographic ordering |
| `replan.mjs` | 141 | minimal replan, plan difference |
| `mission-planning.mjs` | 134 | entry point, assumptions |

---

## RESOURCE MODEL

`canonicalResource(input)` — `id`, `resourceType`, `capabilities`, `status`,
`location`, `locationObservedAt`, `locationValidUntil`, `availability`,
`existingAssignments`, `operatingUnit`, `capacity`, `restrictions`, `source`,
`validUntil`, `originFacilityId`.

**A name is not a capability.** `capabilityState(resource, capability, at)`
returns one of `PRESENT` · `ABSENT` · `NOT_ESTABLISHED`:

- `PRESENT` requires `value === true` **and** an unlapsed validity.
- A lapsed record becomes `NOT_ESTABLISHED`, **not** `ABSENT` — expiry is not
  refutation. (Test N2.)
- No record at all is `NOT_ESTABLISHED`. "Fire Unit 12" establishes nothing.

`locationState()` returns `CURRENT` · `STALE` · `NOT_ESTABLISHED`. A stale
position yields no ETA — the engine will not invent one (test E1).

---

## REQUIREMENT MODEL

`canonicalRequirement(input)` — `id`, `missionId`, `subjectId`, `serviceId`,
`capabilityNeeded` (required), `destinationFacilityId`, `earliestStart`,
`requiredBy`, `durationMinutes`, `minimumCapacity`, `routeIds`,
`dependsOnRequirementIds`, `mutuallyExclusiveWith`, `active`.

No synthetic difficulty or priority value exists anywhere.

**`routeIds` order is the preference order.** `routeIds[0]` is the primary;
anything later is an alternative. This is an explicit caller statement — the
engine deliberately does **not** infer "primary" from catalog ordering, which
would make "we fell back to the alternative" depend on array position.

---

## CONSTRAINT MODEL

`CONSTRAINT_KINDS`, in evaluation order (also the order a decisive INFEASIBLE is
chosen, so the operator sees the most fundamental blocker rather than the first
one found):

```
CAPABILITY · CAPACITY · AVAILABILITY · PROTECTED_COMMITMENT · CURRENT_ASSIGNMENT
FACILITY_STATUS · ACCESS · TRAVEL_TIME · TIME_WINDOW · DEPENDENCY · MUTUAL_EXCLUSION
```

Every constraint returns `{kind, state, reason, factsUsed, whatWouldNeedToChange}`.

This is **not** a generic rule engine. Each constraint is a named domain fact
with its own function; adding a constraint means adding a function and listing it.

---

## FEASIBILITY

```
any INFEASIBLE → INFEASIBLE
else any UNKNOWN → UNKNOWN
else → FEASIBLE
```

INFEASIBLE dominates because a retained record has ruled the pairing out, and no
amount of unknown elsewhere rescues it: an engine without structural fire
capability stays out whether or not we know where it is.

**UNKNOWN is never rounded** — not to FEASIBLE (fake certainty), not to
INFEASIBLE (silently hiding an option that may well work once the fact arrives).

Each candidate carries `decisiveConstraint`, `alsoRelevant` (every other
non-feasible constraint), the full `constraints` array, `arrival`,
`travelMinutes`, `displacesAssignments`, `displacesProtected`,
`whatWouldNeedToChange`, `needsChecking`, and `provenance`.

### Narrowing safety — provable, not heuristic

`narrowCandidates()` discards a pairing **only** when a cheap constraint
(`CAPABILITY`, `CAPACITY`, `AVAILABILITY`) already returns INFEASIBLE — exactly
what full evaluation would conclude. It may **never** discard on UNKNOWN.

Every discard is recorded in `discarded` and still surfaces as an INFEASIBLE
candidate row, so nothing vanishes quietly. Test **S2** checks every narrowed
verdict against `evaluateCandidate` run exhaustively.

**If you add a narrowing key, it must be a constraint that returns INFEASIBLE
definitively. Never narrow on geography, service domain, or anything that could
be UNKNOWN.**

---

## CONTENTION

`resourceContention()` finds requirements competing for one resource by an
**interval sweep** over sorted windows (not pairwise — see PERFORMANCE).

- Candidates counted as competing are `FEASIBLE` **or** `UNKNOWN`. An unknown
  candidate is still competing demand; dropping it would hide a conflict that
  becomes real the moment the missing fact lands.
- A requirement with an unstated window yields `windowsOverlap: null`,
  `established: false` — not asserted as competing, not hidden (test C5).
- Pair reporting is bounded at 24 with `pairsTruncated: true`; the full
  `competingRequirementIds` set is always complete (test C4).
- `resolution: 'COMMANDER_DECISION_REQUIRED'`. **VIGIA never picks the winner.**
  It reports each requirement's remaining alternatives instead.

`unsupportedRequirements()` distinguishes `NO_QUALIFIED_RESOURCE` from
`NO_CONFIRMED_OPTION` (unknown candidates exist). Those are different facts.

---

## ASSIGNMENT OPTIONS

Bounded by construction: one baseline plus one deliberate alternative per
contended resource, capped at `MAX_OPTIONS = 6`. When the cap binds,
`optionBoundary` says so rather than presenting a truncated set as exhaustive.

Each option carries `assignments`, `requirementsSatisfied`,
`requirementsUnconfirmed`, `requirementsUnsupported`, `commitmentsDisplaced`,
`constraintsReliedUpon`, `unknowns`, `consequences`, and `provenance`.

Option identity is `hash(assignments)` alone, so two paths producing the same
allocation are one option. A forced preference is placed first and reserves its
resource, so no option double-books one unit (test O2).

### Ordering — `OPTION_FACTORS`, first difference decides

1. `protectedViolations` (fewer) — 2. `deadlinesMissed` — 3. `unsupportedCount`
— 4. `unknownCount` — 5. `displacedCount` — 6. `totalTravelMinutes` — 7. stable id.

No weights, no composite score. The only numbers are plain domain measurements.
Two options tying on every factor report `equivalent: true` rather than being
given a false precedence.

---

## MINIMAL REPLAN

`minimalReplanSet(plan, change)` partitions requirements three ways:

- `directlyAffectedRequirementIds` — the change touched a resource they were
  actually considering (FEASIBLE or UNKNOWN).
- `consideredButUnaffected` — the resource was among their candidates but
  already ruled out, so nothing changes for them.
- `untouchedRequirementIds` — never considered it.

The second and third both mean "needs no reconsideration", and keeping them
apart is deliberate. Also returns `requirementsLosingAllOptions` and
`resourcesNewlyContended`.

---

## WHAT-IF

`missionPlan({..., assumptions})`. `ASSUMPTION_KINDS`: `RESOURCE_UNAVAILABLE` ·
`ROAD_UNAVAILABLE` · `FACILITY_UNAVAILABLE` · `SOURCE_STALE` · `MISSION_ADDED` ·
`DEADLINE_CHANGED` · `CAPABILITY_UNAVAILABLE`. An unknown kind throws.

Isolation is absolute: inputs are filtered and copied, never mutated (test J1
compares the serialised input before and after). Result carries
`universe: 'SCENARIO'`, `assumptionText`, and a boundary stating no operational
record changed.

---

## PLAN DIFFERENCE

`planDifference({previous, current, change})` reuses VIGIA XI's causal
discipline: a candidate change is `CAUSED` only where the candidate relation
proves the dependency — the named resource/road was one this requirement was
actually considering. Otherwise `FOLLOWED` ("after"). **Nothing reads a clock.**

`FEASIBLE → UNKNOWN` is retained as `knowledgeLoss`: *"This assignment was
previously feasible. Its current feasibility is unknown and needs checking."*
Previously-feasible is never silently erased, and never still claimed.

---

## VIGIA XI INTEGRATION

`access-intelligence.mjs` is the single consumption point. Planning does not
decide road truth:

| XI concept | Planning effect |
|---|---|
| road eliminated by assumption | `ROUTE_ELIMINATED` → ACCESS **INFEASIBLE** |
| road information expired (`factFreshness`) | `ROUTE_STALE` → ACCESS **UNKNOWN** |
| `minimalCutSets` / `describeCutSets` | `commonModeRoads`, shared planning risk |
| primary affected, alternative retained | falls back, `usedAlternative: true` |
| no retained route | `NO_ROUTE_RETAINED` → UNKNOWN |

The eliminated/expired split is the one that matters most: collapsing the second
into the first would invent a closure out of an expiry.

`sharedAccessAcross(candidates)` surfaces when apparently separate resources
depend on one road, using resource **names** in text (raw ids stay in provenance).

---

## SAFETY BOUNDARY

Hard invariant, enforced by construction and by test Q1:

```
advisory: true · dispatched: false · operationalWrites: 0 · modelUsed: false
```

The engine may say "Option A satisfies both retained requirements". It may not
dispatch a unit, change an assignment, message a responder, claim an authority
approved a plan, or claim an outcome occurred. Nothing in `packages/domain/src/planning`
writes anything.

---

## PERFORMANCE

Measured on this machine, steady state:

| scale | time |
|---|---|
| 4 resources / 2 requirements | p50 **0.293 ms** · p95 **0.552 ms** |
| 50 / 20 | **27.6 ms** |
| 200 / 50 | **249.7 ms** |
| 500 / 100 | **2.67 s** |

Two problems were found by measuring, not by guessing:

1. **Contention was O(n²) per resource** — 12.6 s of a 17 s plan at 500/100.
   Replaced with an interval sweep over sorted windows.
2. **Access was resolved per candidate** though it depends only on the
   requirement, re-running cut-set analysis tens of thousands of times. Hoisted
   to once per requirement (`requirementAccess`).

**Flagged honestly:** the remaining 2.67 s at 500/100 is candidate evaluation,
inherently O(resources × requirements) — 50,000 full constraint passes. Narrowing
only removed 25 % in that synthetic set because capability was the sole
definitive filter. The remedy, if that scale becomes real: narrow by service
domain and operating unit **before** the constraint pass, which is safe only if
those are definitive INFEASIBLE facts rather than heuristics. Test S2 is the guard.

---

## TESTS

**38 planning tests, all passing.** `packages/domain/test/planning/`.

```bash
mkdir -p .tmp/test
TMPDIR=$PWD/.tmp/test node --test --test-concurrency=1 packages/domain/test/planning/*.test.mjs
# expected: # tests 38 · # pass 38 · # fail 0
```

| Case | Covers |
|---|---|
| A, N1, N2 | capability mismatch; unknown and expired capability |
| B1, B2 | deadline infeasible / feasible with quoted arrival |
| C1–C5 | contention, no winner picked, bounded pairs, unstated windows |
| D1, L1–L3 | protected commitment, closer-but-protected, unknown preemption, displacement |
| E1 | stale resource location, no invented ETA |
| F1, F2 | stale road access → UNKNOWN, no blocked/open claim |
| G1 | alternative route used; single-route requirement eliminated |
| H1 | shared access dependency surfaced |
| I1–I3 | minimal replan, newly contended, unrelated change |
| J1–J3 | what-if isolation, unknown assumption refused |
| K1, K2 | plan difference causality, knowledge loss |
| M1, M2 | determinism, input-order independence |
| O1–O4, P1, P2 | bounded options, no double-booking, ordering explanation |
| Q1 | human authority boundary |
| S1, S2 | narrowing safety, proven against exhaustive evaluation |

Regression: full `npm test` — **87 failing before, 87 after**, both diff sets
empty. Test count 1549 → 1588. `scripts/check.mjs`: same two pre-existing
violations as baseline, none from this work. All files within the 220-line budget.

---

## P0 FOR CODEX

1. **Feed real resources.** `canonicalResource` is the contract; nothing
   populates it yet. Wire whatever retained asset records exist. **Do not
   fabricate a resource because a category exists**, and do not default a
   capability — an absent record must stay `NOT_ESTABLISHED`.
2. **Supply `facilityStatus`.** Currently optional; when absent every candidate
   picks up a `FACILITY_STATUS: UNKNOWN` and the whole plan degrades to UNKNOWN.
   Pass a `Map(facilityId → 'AVAILABLE' | 'UNAVAILABLE')`.
3. **Thread `sourceLastCheckedAt`** into `missionPlan` (same gap as VIGIA XI P0
   #2). Without it `ROUTE_STALE` never fires and stale access stays invisible.
4. **Expose an advisory read route** under the operator namespace. Read-only.
   The response already carries `advisory`/`dispatched`/`operationalWrites` —
   surface them; never add a write path.
5. **Render options** with `comparedWithAbove.text` and each option's
   `consequences`. Never render a ranking without its reason.

## P1 FOR CODEX

6. Persist an accepted option as a *commander decision record* (who, when,
   which option id) — separate from planning, which must stay derived.
7. Use `minimalReplanSet` on resource-status change to refresh only the affected
   part of a displayed plan.
8. Multi-resource requirements (two engines to one incident) — the model assumes
   one resource per requirement today.
9. Duration/turnaround chaining, so a resource freed at T is available after it.

## KNOWN LIMITATIONS

- **One resource per requirement.** No composite assignments.
- **`durationMinutes` is carried but not used** to compute release times;
  availability comes from `existingAssignments` windows only.
- **Travel time is retained-route only.** No routing is computed here, and no
  return leg is modelled.
- **Option generation is bounded, not optimal.** It is advisory by design; it
  does not search the allocation space and never claims to.
- **`MUTUAL_EXCLUSION` and `DEPENDENCY`** read caller-supplied sets that the
  entry point currently passes empty — the constraints work, the wiring to a
  real assignment sequence does not exist yet.
- **Capacity is a single scalar.** No typed capacity (water, seats, crew).
