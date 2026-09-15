# VIGIA XI — Causal Resilience + Decision Intelligence · Codex handoff

**Base** `integration/vigia-mega-ix-viii` @ `75b1eaa`
**Branch** `claude/vigia-x-core-consequence-engine`
**Commits** `c5891e7` — *VIGIA XI: causal resilience and decision intelligence*
`360b5f6` — *Close the stale-truth loop: expiry raises its own consequence*

**Applying onto `integration/vigia-x-core`:** use `VIGIA-XI-ONLY.patch`, which is
cut against the VIGIA X tree your baseline already contains. It touches only four
pre-existing files, all of them VIGIA X modules (`canonical-inputs`,
`operational-relationships`, `operational-consequences`, `priority-ordering`);
everything else is new. The full four-commit patch also exists but would
re-apply VIGIA X.

Companion to `CODEX-HANDOFF.md`, which documents the VIGIA X consequence
pipeline. **Read that first.** This extends it; nothing in it was redesigned,
and all 37 VIGIA X tests still pass unchanged.

---

## 1. What was added, and where it sits

The VIGIA X pipeline is unchanged. Seven new layers hang off it:

```
CANONICAL FACTS ── spatial index (new) ──┐
        ↓                                │
OPERATIONAL RELATIONSHIPS ───────────────┘
        ↓
CONSEQUENCE DERIVATION ──── evidence-strength ── freshness
        ↓                   dependency-sets
MISSION IMPACT
        ↓
PRIORITY ORDERING ───────── explainComparison (new)
        ↓
EXPLANATION ─────────────── decision-compression
        ↓
OPERATOR PROJECTION

ACROSS TWO PROJECTIONS:  causal-transition ── knowledge-loss
UNDER ASSUMPTIONS:       resilience-query
INTO COLLECTION:         verification-need → Intelligence VIII
```

| Module | Lines | Role |
|---|---|---|
| `evidence-strength.mjs` | 93 | one report vs two responders vs official restriction |
| `freshness.mjs` | 142 | fact expiry + decision-relevant staleness classification |
| `dependency-sets.mjs` | 133 | minimal cut sets / common-mode dependencies |
| `resilience-query.mjs` | 132 | "what still works" under explicit assumptions |
| `causal-transition.mjs` | 136 | temporal diff with strict causality |
| `knowledge-loss.mjs` | 85 | previously known vs currently verified |
| `verification-need.mjs` | 151 | bridge into Intelligence VIII collection |
| `decision-compression.mjs` | 79 | one directive + shortest honest reason |

Modified: `canonical-inputs.mjs` (spatial index), `operational-relationships.mjs`
(use the index), `priority-ordering.mjs` (`explainComparison`),
`operational-consequences.mjs` (exports + `operationalProjection`).

---

## 2. Temporal model

A **projection** is a value, not stored state:

```js
operationalProjection({catalog, missions, reports, ..., at, incidentId, snapshotId})
// → {at, incidentId, snapshotId, missions, consequences}
```

Two projections are all `causalTransition({previous, current})` needs. There is
no history table, no event log to keep in sync, and nothing to migrate. A
transition is reproducible from any two projections of canonical records.

Time only moves forward: a transition whose current projection predates its
previous one throws `causal_transition_requires_forward_time`.

---

## 3. Causal transition contract

`schemaVersion: 'vigia.causal-transition.v1'`

```
transitionId · incidentId
previousProjectionRef {at, snapshotId} · currentProjectionRef {at, snapshotId}
consequencesAdded[] · consequencesResolved[] · consequencesChanged[]
changedRelationships[] {consequenceId, roads, routeIds, serviceIds, missionIds}
missionTransitions[]
whatChanged[] · whyItChanged[] · unexplainedChanges[]
factsUsed[] · observedAt · knownAt · generatedAt · truthBoundary
```

**`missionTransition`** carries `previousState`, `currentState`, `changed`,
`relation`, `connective`, `evidenceStrength`, `causedByConsequenceId`, `reason`,
`factsUsed` (the causing consequence's full provenance), and `chain[]`.

### The causality rule — the single most important invariant here

`CAUSAL_RELATIONS` are ordered by how much is established:

| relation | connective | means |
|---|---|---|
| `CAUSED` | because | the derivation proved the dependency |
| `FOLLOWED` | after | changed in the same projection, no derived dependency |
| `MAY_REQUIRE_REVIEW` | alongside | connection not established |

`CAUSED` requires **all three**, and reads no clock:

1. a consequence carrying that trigger names the mission in `provenance.missionIds`;
2. that mission's impact is `primaryAffected` **or** `flaggedByMissionEngine`
   (the mission engine independently linked the route);
3. the mission's state actually differs between the two projections.

**No code path in this repository may conclude "because" from timestamp
proximity.** Test A4 pins it: an unlinked mission that changed in the same
projection comes back `FOLLOWED`/"after", with `causedByConsequenceId: null`, and
is listed in `unexplainedChanges`.

### The chain (§3 of the brief)

`chain[]` is a fixed four-step sequence, never a free traversal:

```
TRIGGER → ROAD_DEPENDENCY → ROUTE_AVAILABILITY → MISSION_STATE
```

Each step carries `{step, id, text, relation}`. Example output:

> A field report says EM527 was blocked at 18:21.
> EM527 carries the stored fire response route for Évora Centro.
> The stored route was affected and no other current route is stored.
> Évora Centro fire response moved GOOD → PROBLEM.

---

## 4. Stale-truth model

`factFreshness(fact, at)` → `{state, usableAsSupport, lastCheckedAt, validUntil, ageMs, age}`

`FRESHNESS_STATES`: `CURRENT` · `EXPIRED` · `VALIDITY_UNKNOWN`.

**A fact with no stated validity is `VALIDITY_UNKNOWN`, never assumed current**
(`usableAsSupport: false`). "We checked and it holds" and "nobody said" are
different facts.

`routeSupportingFacts(routeRow, {sourceValidUntil, sourceLastCheckedAt, at})`
returns the canonical facts a stored route rests on: its own route calculation,
plus road information for each road it uses.

### Decision-relevant staleness

`classifyStaleness(freshness, dependents)` — **first matching condition wins, no
score anywhere**:

| class | condition |
|---|---|
| `CRITICAL_SOLE_SUPPORT` | an active objective depends on it with no other stored option |
| `ELEVATED_SHARED_DEPENDENCY` | it supports a dependency shared across more than one service |
| `ROUTINE_ALTERNATIVE_RETAINED` | another stored option remains |
| `BACKGROUND_NO_DEPENDENT_DECISION` | no active objective depends on it |

`explainStaleness()` produces, for the critical case:

> **NEEDS CHECKING**
> The only stored fire response route depends on road information last checked 2h 18m ago.
> Confirm EM527 before relying on this route.

**Both directions are refused explicitly**, and the refusal is a field
(`boundary`), not a convention a future surface could reword away:

> Expired road information does not mean the road is blocked, and it does not
> mean the road is open. It means the stored information can no longer support a
> conclusion.

### Expiry raises its own trigger

Stale information is a third trigger source alongside field reports and official
restrictions — because no report or restriction will ever arrive to announce that
a fact aged out:

```
kind       STALE_DEPENDENCY
authority  NO_CURRENT_INFORMATION     (neither observation nor official record)
establishesOfficialClosure  false
```

It fires only for roads an **active** watched objective depends on; an expired
fact with no dependent decision is not an operational event (test M4).
`tierFor()` ranks it through `classifyStaleness`, so the sole support for fire
response outranks a road whose service keeps an alternative — never by pretending
the road was reported unusable.

Wording, in every claim-bearing field:

> EM527 NEEDS CHECKING
> Road information for EM527 was last checked 2h 18m ago and can no longer support a conclusion.
> Confirm EM527 before relying on this route.

Never blocked. Never open. Test M3 scans every field except `truthBoundary`.

**Mission state is not touched.** The existing `evaluateMission()` already moves
a mission to `UNKNOWN` with *"Road information has not been checked recently."*
when `sourceValidUntil` lapses. This layer adds the *classification and
explanation* on top. No new mission state, no new score.

---

## 5. Common-mode / cut-set model

`minimalCutSets(routeRows, {maxCutSize = 3})` → the smallest sets of roads whose
loss removes **every** stored option.

- `smallestCutSize === 1` → a common-mode road (`cut.commonMode === true`)
- `smallestCutSize === 2` → **no single road removes all support**; that specific
  pair would. Reporting either road alone as fatal would be a lie in the
  direction of panic, and test E2 pins that it is not.

Bounded on purpose: `MAX_CUT_SIZE = 3`, at most 64 roads considered, minimality
by skipping supersets of found cuts. Truncation is reported via
`analysisComplete: false`, never hidden.

**Routes with no recorded road names** are listed in `routesWithoutRoadNames` and
make the analysis incomplete — they never make a cut look smaller than it is.

`describeCutSets()` wording, which must not be loosened:

> "Every stored healthcare option currently depends on EM527 and N114."
> "No single road removes every stored healthcare route. M507 and N114 together would."

`basis` is `NAMED_ROAD` or `GEOMETRY_CONFIRMED`, carried from
`shared-dependency.mjs`. **The phrase "single point of failure" is never
emitted** — the retained data supports statements about stored routes, not about
tarmac.

---

## 6. What-still-works model

`resilienceQuery({catalog, missions, assumptions, at, incidentId})`

`ASSUMPTION_KINDS`: `ROAD_UNAVAILABLE` · `FACILITY_UNAVAILABLE` ·
`ROUTE_UNAVAILABLE` · `SOURCE_STALE`. An unknown kind throws rather than being
guessed at.

Per route under the assumptions: `RETAINED` · `UNCERTAIN` · `ELIMINATED`.

**`SOURCE_STALE` lands on `UNCERTAIN`, never `ELIMINATED`.** Collapsing those two
would invent a closure out of an expiry. Test F3 pins it.

`SUPPORT_STATES`: `SUPPORTED` · `DEGRADED` · `SUPPORT_UNCERTAIN` ·
`NO_RETAINED_OPTION` · `NO_ROUTE_STORED`.

Isolation is absolute: `universe: 'SCENARIO'`, `observed: false`,
`operationalWrites: 0`, input records filtered and never mutated (test F2
compares the serialised input before and after), and every answer carries
`assumptionText` ("Under this assumption: EM527 becomes unavailable.") and a
`boundary` stating that no operational record, mission or history changed.

**Mission state is deliberately not recomputed** under a scenario — that belongs
to the mission engine and depends on observed records a scenario has none of.
What is reported is the *support available* to each objective, plus the mission's
real `observedState` carried through untouched.

### Multi-hop closure (§9)

`ADMISSIBLE_HOPS` is a declared, fixed sequence — not a graph engine:

```
ROAD_TO_ROUTE → ROUTE_TO_FACILITY → FACILITY_TO_SERVICE
→ SERVICE_TO_MISSION → MISSION_TO_SUBJECT
```

`MAX_HOPS = 5`. No cycles are possible, fan-out is bounded by the catalog, and
there is no generic traversal to run away.

---

## 7. Knowledge-loss model

`knowledgeLoss({previous, current})` → `LOSS_KINDS`:

| kind | meaning |
|---|---|
| `SUPERSEDED_BY_OBSERVATION` | a consequence in the current projection names that mission — a report removed the option |
| `PREVIOUSLY_KNOWN_NOW_UNVERIFIED` | nothing refuted it; its support expired and nothing replaced it |

**The previous value is retained, never deleted** (`previouslyKnown: {routeId,
minutes, knownAt}`). Wording for the second case:

> "Another route was previously stored, but its current status needs checking."
> *Nothing reported this route as unusable. Its supporting information expired
> and was not replaced, so its current state is unknown rather than unavailable.*

**Absence in a newer projection is not evidence of falsehood.** This is the
invariant that most easily rots under later edits; tests G1/G2 pin both branches.

---

## 8. Evidence strength

`EVIDENCE_STATES`, strongest first: `AUTHORITATIVE_RESTRICTION` ·
`MULTI_RESPONDER_CONFIRMED` · `SINGLE_FIELD_OBSERVATION` ·
`CONFLICTING_FIELD_REPORTS`.

Built on the product's existing `verification()`, so one-response-per-responder
and self-confirmation rules are not re-implemented.

**Corroboration raises reliance. It never becomes an official closure.**
`establishesOfficialClosure` is hard-coded `false` for every field-sourced state,
regardless of how many responders agree. Test J2 pins it.

`relianceGuidance(strength, {hasAlternative})` states what the record supports —
deliberately not a recommendation; the decision stays with the human.

---

## 9. Priority explanation and decision compression

`explainComparison(a, b)` (in `priority-ordering.mjs`) reports **every** factor on
which two impacts differ, not only the deciding one — with `decisive: true` on
the one that settled it. Ordering itself is untouched; this reads the same
factors. No numeric score was added: the only numbers are plain domain
measurements (minutes, counts, age).

`compressDecision(result)` reduces the whole derived set to:

> **FIRE RESPONSE FIRST**
> Fire response loses its only retained route. Healthcare retains a 24-minute alternative.

with `provenance` carried through, so the sentence is reconstructable from
canonical records. With nothing derived, `directive` is `null` and the state is
`NOTHING_DERIVED` — never an invented directive.

---

## 10. Intelligence VIII connection

**No tasking machinery was added.** `verification-need.mjs` emits
`vigia.information-requirement.v1` records — the exact shape Intelligence VIII's
own generators produce — built with that subsystem's `requirementId()` and
`DEPENDENT_OUTPUTS`, using its existing `ROAD_INFORMATION` class.

`asRequirementsResult(needs, {incidentId, at})` packs them for
`nextVerificationTasks()`, which consumes them unmodified: test H2 shows the
existing tasking computing `noRetainedAlternative: true`,
`sourceFreshnessUrgency: 'STALE'` and producing its own reasons.

Needs are raised only where an active objective rests on the road
(`BACKGROUND_NO_DEPENDENT_DECISION` is skipped), deduplicated by requirement
identity, most critical first.

`operatorWording(need)` is the external surface and carries no collection jargon:

```js
{label: 'Needs checking', latestInformation: '2026-09-14T16:07:00.000Z',
 action: 'Confirm EM527', because: 'This is the only stored fire response route for Évora Centro.'}
```

Test H3 asserts no `epistemic`, `information requirement`, `coverage
classification` or `requirementClass` reaches the operator.

---

## 11. Performance

Coarse ~1 km spatial index (`CELL_DEGREES = 0.01`) over the padded route bounding
boxes, built in the same single pass as the rest of `extractCanonicalInputs`.
`spatialCandidates(point, spatial)` returns the routes sharing a cell plus any
route too large to index (>4096 cells), which falls back to the full scan.

**It is a prefilter over the geometric basis only.** It may never gate
`FACILITY_MATCH` or `NAMED_ROAD`, which do not depend on geometry — test L2 pins
that a facility link survives being outside every cell.

| routes | reports | before index | after |
|---|---|---|---|
| 100 | 10 | 3.5 ms | **2.2 ms** |
| 400 | 20 | 20.1 ms | **9.1 ms** |
| 800 | 40 | 64.1 ms | **36.0 ms** |

Controlled incident: p50 0.069 ms · p95 0.140 ms.

Result equality with a full scan is **proven**, not assumed: test L1 deletes
`inputs.spatial` to force the scan path and compares link-for-link.

**Still honest about what remains.** The outer loop still visits every route row
per report, because `NAMED_ROAD` and `FACILITY_MATCH` are evaluated there. The
remaining step is to drive those two bases off indexes that **already exist** —
`inputs.routesByRoad` (built, currently unused by the relationship layer) and a
facility index that would be one line to add — so the outer loop disappears and
only candidate routes are visited. That change is contained to
`buildOperationalRelationships`, and test L1 is the guard.

---

## 12. Tests

**78 consequence tests, all passing** (37 VIGIA X preserved + 41 new).

```bash
mkdir -p .tmp/test
TMPDIR=$PWD/.tmp/test node --test --test-concurrency=1 packages/domain/test/consequences/*.test.mjs
# expected: # tests 78 · # pass 78 · # fail 0
```

| File | Cases |
|---|---|
| `causal-resilience.test.mjs` | A causal chain · B stale critical · C stale noncritical · G knowledge loss · J confirmation |
| `resilience-cutsets.test.mjs` | D common mode · E multi-dependency cut · F what still works · H Intelligence VIII · I priority explanation · K compression · L index equality |
| `stale-dependency.test.mjs` | M expiry raises its own consequence |
| `consequence-fixture-xi.mjs` | `staleRoadScenario`, `disjointRoutes`, `confirmation`, `officialRestriction`, `unusedWeatherFact` |

Regression: full `npm test` — **87 failing before this work, 87 after**; added
and removed failure sets both empty by sorted test name. Test count 1471 → 1549.
`scripts/check.mjs` shows the same two pre-existing violations as baseline and
none from this work.

---

## 13. What remains

### P0

1. **Surface the causal chain in What Changed.** `missionTransition.chain[]` is
   the rendered content, ready as data. `team-service.evaluate()` must retain the
   previous projection to diff against — suggested: store the last projection's
   `{at, missions, consequences}` per group and call `causalTransition` on each
   evaluation. This is the last wiring step between the engine and the UI.
2. **Pass `sourceLastCheckedAt` from the service.** `operationalConsequences()`
   accepts it and the stale-dependency trigger depends on it; `team-service.mjs`
   currently passes only `sourceValidUntil`, so expiry consequences will not fire
   in the product until the road-coverage last-check time is threaded through.
   One argument, one line — but without it the whole stale path stays dark.
3. **Render "Needs checking" in Important Now.** `result.verificationNeeds` is
   now produced by the pipeline; use `operatorWording()` for the text. Keep the
   vocabulary rule from `CODEX-HANDOFF.md` §2.7.
4. **Resilience query surface.** `resilienceQuery` has no route or UI. Suggested:
   a read-only GET under the operator namespace taking assumption kind + subject,
   rendering `services[]` with the `assumptionText` banner always visible.
5. **Feed needs into the collection lifecycle.** The requirements are emitted and
   tasking-ready; nothing yet reconciles them across evaluations with
   `reconcileRequirements()`.

**Closed since the first draft of this document:** `tierFor()` now consults
`classifyStaleness`, and `operationalConsequences()` now emits
`verificationNeeds` itself. Both were listed here as open; both are done and
tested (cases M1-M6).

### P1

6. Combined multi-trigger reasoning: two consequences on different roads removing
   the last option jointly. `minimalCutSets` over the union of affected route ids
   is the primitive; nothing consumes it that way yet.
7. Knowledge loss across facility capability, not just route fallback —
   `knowledgeLoss` currently compares mission fallbacks only.
8. Evidence strength into ordering: `evidenceRank` is exported and unused. An
   uncorroborated single observation arguably ranks below a corroborated one at
   equal tier. **Decide deliberately** — it changes ordering, so it needs its own
   test, and `PRIORITY_FACTORS` position is the policy.

### P2

9. Finish the index work in §11 so the per-report outer loop disappears.
10. Cut-set analysis over facilities and services, not only roads.
11. Visual design of the causal chain and resilience surfaces.

---

## 14. Invariants added by VIGIA XI

Alongside the seven in `CODEX-HANDOFF.md` §2:

8. **Causality is proven, never timed.** No path may infer "because" from
   timestamp order.
9. **Expiry is not a claim.** Stale information never yields "blocked" or "open".
10. **Absence is not falsehood.** A fact missing from a newer projection is
    previously known and now unverified unless a consequence explains its removal.
11. **Corroboration is not authority.** No number of field confirmations sets
    `establishesOfficialClosure`.
12. **Scenarios never write.** `resilienceQuery` filters inputs; it does not
    mutate them, and it recomputes no mission state.
13. **One tasking system.** Verification needs are emitted into Intelligence
    VIII's contract. Never build a second.
