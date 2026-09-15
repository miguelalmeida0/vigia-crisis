# VIGIA XIII — Operational Period + Multi-Incident Resource Command · Codex handoff

**Built on** the VIGIA XII tree (`abc8cea`). **Commit** `c173c4e`.

Companions: `docs/handoffs/vigia-x-core/CODEX-HANDOFF.md` (X),
`CLAUDE-INTELLIGENCE-EXTENSION.md` (XI), `docs/handoffs/vigia-xii-planning/CLAUDE-HANDOFF.md` (XII).
XIII consumes XII and replaces nothing. All 117 X/XI/XII tests still pass.

---

## ARCHITECTURE

```
operational period universe          operational-period.mjs
        ↓
bounded schedule generation          schedule-generation.mjs
        ↓  (per assignment)          assignment-window.mjs
global validation — 8 checks         global-validation.mjs
        ↓
reserve + future capacity gaps       reserve-and-gaps.mjs
        ↓
transparent ordering + advisory      schedule-generation.mjs / period-planning.mjs

minimal repair & delay cascade       schedule-repair.mjs
```

| File | Lines | Role |
|---|---|---|
| `operational-period.mjs` | 135 | period universe, requirement groups, reserve policy, mutual aid, transit |
| `assignment-window.mjs` | 116 | departure→travel→arrival→service→release; sequential transition |
| `global-validation.mjs` | ~205 | the eight global checks and the verdict |
| `reserve-and-gaps.mjs` | 131 | reserve findings, future capacity gaps |
| `schedule-generation.mjs` | ~190 | bounded schedules, lexicographic ordering |
| `schedule-repair.mjs` | 130 | minimal repair, delay cascade |
| `period-planning.mjs` | 103 | entry point, perturbations |

**Planning artifacts are derived.** No second truth store; a period plan is
recomputed from canonical records on every call and never persisted.

---

## THE CENTRAL DISTINCTION

VIGIA XII checks one pairing at a time and cannot see that two of its answers
are mutually exclusive. XIII exists for exactly that case, and names it:

```js
schedule.locallyFeasibleButGloballyNot === true
// "Engine 12 is committed to Louredo and Canaviais at the same time,
//  from 18:30 to 18:50."
```

`PLAN_STATES`: `GLOBALLY_FEASIBLE` · `GLOBALLY_INFEASIBLE` · `UNKNOWN`.
Any hard violation → infeasible; else any unresolved fact → unknown; else feasible.

---

## OPERATIONAL PERIOD

`operationalPeriod({id, startsAt, endsAt, incidents, requirementGroups,
reservePolicies, transitMinutes})`. Bounds are **required** — an unbounded
horizon is refused (`period_bounds_required`, `period_end_must_follow_start`).
`horizonBounded: true` is on every period.

`transitMinutes` is a Map of `"fromId->toId" → minutes`, **retained only**. An
absent pair yields `null`, which becomes an UNKNOWN window. VIGIA never computes
a route it has not retained.

---

## ASSIGNMENT WINDOWS

`assignmentWindow({group, resourceId, availableFrom, travelMinutes, period})` derives:

```
departureAt · travelMinutes · arrivalAt · serviceStartAt
serviceDurationMinutes · releaseAt · nextAvailableAt · releaseEstablished
```

**An unknown duration produces a null release, and a null release blocks reuse.**
This fixed the XII limitation where `durationMinutes` was carried but unused.

`sequentialTransition()` answers the reuse question in three states. A missing
release or missing transit is UNKNOWN — never a quiet assumption that the unit
makes it.

---

## THE EIGHT GLOBAL CHECKS

| `VIOLATION_KINDS` | Catches |
|---|---|
| `DOUBLE_BOOKING` | one unit in two places at once |
| `SEQUENCE_IMPOSSIBLE` | release + transit misses the next deadline |
| `DEADLINE_MISSED` | arrival after `requiredBy` |
| `MULTI_RESOURCE_SHORTFALL` | slots unfilled; also carries capability/aid unknowns |
| `CO_ARRIVAL` | units required together arriving too far apart |
| `AGGREGATE_CAPACITY` | summed capacity by named dimension below requirement |
| `RESERVE` | a blocking reserve policy breached |
| `COUPLED_REQUIREMENT` | downstream op before its prerequisite is supported |
| `MUTUAL_EXCLUSION` | two requirements the records say cannot both run |

Shortfalls **explain themselves**: `nearestMiss` carries the closest attempt and
its arithmetic, so "0 of 1 assigned" is never the whole message.

---

## FOUR DEFECTS FOUND BY RUNNING IT

Worth recording, because each is a trap a reimplementation would fall into:

1. **`busyUntil = null` freed a unit.** An unestablished release was stored as
   `null`, and the `??` fallback read that as "no constraint", resetting the unit
   to the period start. A unit was silently reused on an unknown release — the
   exact thing §3 forbids. Fixed with an explicit `blockedForReuse` set.
2. **Capability uncertainty never reached the schedule.** A unit with no record
   of a capability was assigned and the plan read as feasible. Assignments now
   carry `capability`, and a non-PRESENT state makes the plan UNKNOWN.
3. **A coupled prerequisite counted as supported by an unestablished unit.**
   `coupledViolations` now requires an established capability; a prerequisite
   covered only by an unknown is `UNKNOWN`, not satisfied and not infeasible.
4. **An unknown-caused shortfall was reported as proven infeasibility.**
   `dueToUnknown` now keeps it UNKNOWN: with the missing duration retained, the
   same unit might well cover it.

Several test premises of mine were also wrong and the engine was right — most
often because a reserve policy correctly promoted a different schedule to rank 1.

---

## MULTI-RESOURCE, COUPLED AND EXCLUSIVE

`canonicalRequirementGroup` models slots explicitly — `slots: [{capability,
quantity, minimumCapacity}]`, `totalUnitsRequired`, `coArrivalWithinMinutes`,
`aggregateCapacity`, `requiresSupportedFirst`, `mutuallyExclusiveWith`.

**Never a fabricated super-resource**: two appliances are two units that must each
be found, and each fills a distinct slot (test D2 asserts two distinct ids).

`MUTUAL_EXCLUSION` is first-class here, unlike XII where the constraint existed
but the entry point passed empty sets.

---

## RESERVE

`canonicalReservePolicy({capability, zoneId, minimumAvailable, from, until,
enforcement})`. `ADVISORY` reports and continues; `BLOCKING` makes a breaching
schedule globally infeasible. **The policy decides, not VIGIA.**

With a policy in force the reserve-preserving schedule ranks first (reserve
outranks travel time), and the consuming schedule says:

> This plan would consume the last retained structural fire reserve for Zone A at 18:00.

Unconfirmed mutual aid never holds a reserve open (test H3).

---

## MUTUAL AID

`MUTUAL_AID_STATES`: `REQUESTABLE` · `REQUESTED` · `CONFIRMED` · `EN_ROUTE` ·
`AVAILABLE` · `UNKNOWN`. Only the middle three are usable.

REQUESTABLE and REQUESTED are **not available** — and **not ruled out**. They
remain candidates whose assignments are UNKNOWN, so the plan is never presented
as confirmed on the strength of a phone call nobody has answered.

---

## FUTURE CAPACITY GAPS

`futureCapacityGaps()` sweeps schedule edges and reports intervals where no
uncommitted qualified unit remains:

> At 18:00 the retained plan has no uncommitted structural fire resource, until 18:28.
> A new structural fire requirement between 18:00 and 18:28 would have no retained qualified resource.

**This is schedule arithmetic, not prediction.** `gapBoundary` states it, and
test T1 asserts no predictive language (`likely|probably|expected to|will occur`).

---

## MINIMAL REPAIR AND CASCADE

`minimalScheduleRepair(schedule, change)` → `directlyAffected`,
`downstreamDependent` (same unit, release-to-travel), `requirementsAtRisk`,
`resourcesNewlyContended`, `untouchedSlotIds`.

`delayCascade({schedule, period, resourceId, delayMinutes})` propagates along
**one unit's own chain only**:

> Canaviais would be reached 19:02 instead of 18:47, after its 19:00 deadline.
> A 15-minute delay to Engine 8 would make Canaviais infeasible.

Causality follows XI discipline: assignments carried by other units are **not**
claimed to be affected merely because they happen later (test K2).

---

## ORDERING

`SCHEDULE_FACTORS`, first difference decides: `globalRank` → `protectedViolations`
→ `hardDeadlinesUnsupported` → `reserveBreaches` → `unsupportedGroups` →
`unknownCount` → `totalTravelMinutes` → stable id.

No weights, no composite score; the only numbers are plain domain measurements.
Ties report `equivalent: true` rather than a false precedence.

---

## BOUNDED SEARCH

`MAX_SCHEDULES = 5`: one baseline plus one per contested unit withheld.
`searchBoundary` states it verbatim, including *"no candidate was discarded for
looking less attractive"*.

Two prunes, both **provably safe** (they reproduce what full evaluation concludes):
- a capability the records say is ABSENT, or a unit out of service;
- a unit not free until after the deadline (travel is never negative).

Never pruned on UNKNOWN. Test V1 pins the availability prune.

---

## SAFETY BOUNDARY

```
advisory: true · dispatched: false · operationalWrites: 0 · modelUsed: false
```

No dispatch, no responder status change, no claimed approval, no invented unit,
no predicted outcome. Nothing in `packages/domain/src/period` writes.

---

## PERFORMANCE

| scale | total |
|---|---|
| 2 resources / 2 groups | p50 **0.236 ms** · p95 **0.438 ms** |
| 50 / 30 | **67 ms** |
| 200 / 100 | **889 ms** |
| 500 / 250 | **5 977 ms** |

Phase split at 500/250: **generation 5 211 ms**, validation 1 ms, reserve 0 ms,
gaps 15 ms, repair 0.2 ms.

**Not hidden:** generation dominates and is linear in
`schedules × groups × slots × resources` — 5 × 250 × 500 ≈ 625 000 window builds.
It is not exponential, but 500/250 is slow.

The availability prune **did not help this benchmark** because every synthetic
unit is free from the period start; it helps dense periods where units are
already committed. The contained remedy for scale: generate alternatives by
*repairing* the baseline around the withheld unit instead of regenerating from
scratch (the repair layer already computes the affected set in 0.2 ms), which
removes roughly 4/5 of the work. Correctness guard: the alternative must still be
validated globally, and test Q1/Q2 pin determinism.

---

## TESTS

**37 period tests, all passing.**

```bash
mkdir -p .tmp/test
TMPDIR=$PWD/.tmp/test node --test --test-concurrency=1 packages/domain/test/period/*.test.mjs
# expected: # tests 37 · # pass 37 · # fail 0
```

| File | Cases |
|---|---|
| `period-feasibility.test.mjs` | A sequential · B impossible sequence · C/P global · D multi-resource · E co-arrival · F reserve |
| `period-multi-incident.test.mjs` | G multi-incident · H mutual aid · I capacity · J coupled |
| `period-schedule.test.mjs` | K cascade · L stale release · M no transit · N repair · O what-if · P/Q global + determinism |
| `period-bounds.test.mjs` | R bounded search · S comparison · T future gap · U safety · V prune safety |

Regression: full `npm test` — **87 failing before, 87 after**, added set empty.
Test count 1588 → 1625. `scripts/check.mjs`: same two pre-existing violations,
none from this work. All files within the 220-line budget.

---

## P0 FOR CODEX

1. **Populate `transitMinutes` from retained routes.** The period is useless
   without it — every window becomes UNKNOWN. Derive `"fromFacility->toFacility"`
   from the same retained route table VIGIA XII reads. **Do not compute routes.**
2. **Supply `durationMinutes` on requirement groups.** Absent, no release is
   established and no unit can be reused (correct, but the period stays UNKNOWN).
3. **Define reserve policies** as canonical records with an explicit
   `enforcement`. Without them nothing protects coverage, and VIGIA will happily
   commit every unit because no policy said otherwise.
4. **Record `mutualAid.state`** on partner resources. Absent, they are treated as
   own resources and counted as available — the one place a missing field is
   optimistic, so it must be populated.
5. **Read-only advisory route** under the operator namespace, surfacing
   `globalState`, `violations`, `reserveFindings`, `futureCapacityGaps` and
   `searchBoundary`. Never add a write path.

## P1 FOR CODEX

6. Generate alternatives by repair rather than regeneration (see PERFORMANCE).
7. Preemption of reassignable commitments inside period scheduling — XII models
   `protected: false` displacement, XIII does not yet displace.
8. Typed capacity beyond the flat `capacityByDimension` map (units, refill).
9. Rolling periods: carry commitments across a period boundary.

## KNOWN LIMITATIONS

- **No preemption in period scheduling.** `existingAssignments` block a unit;
  XIII never displaces one even where XII would allow it.
- **Co-arrival is checked, not solved.** The generator does not hold a unit back
  to align arrivals; it reports the spread.
- **`minimumCapacity` per slot is carried but unused** — only `aggregateCapacity`
  at group level is validated.
- **Transit is symmetric-fallback**: `A->B` falls back to `B->A` when only one
  direction is retained. Deliberate, but it assumes symmetry.
- **One incident pool.** Resources are not partitioned by incident ownership
  beyond `zoneId` for reserve.
- **Alternatives are "withhold one unit"** only — no deeper exploration, by design.
