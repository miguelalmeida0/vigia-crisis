# VIGIA X — Core Operational Consequence Engine · Codex handoff

**Base** `integration/vigia-mega-ix-viii` @ `75b1eaa`
**Branch** `claude/vigia-x-core-consequence-engine`
**Commit** `21b00dc` — *VIGIA X: deterministic operational consequence engine*

This document is the architecture. Read sections 1–8 before extending anything;
they contain the invariants that make the engine trustworthy, and most of them
are not recoverable by reading the code alone.

---

## 1. Architecture

One directional pipeline, one responsibility per module, no module reaching
backwards. Located at `packages/domain/src/consequences/`.

```
CANONICAL FACTS            canonical-inputs.mjs
        ↓
OPERATIONAL RELATIONSHIPS  operational-relationships.mjs
        ↓
CONSEQUENCE DERIVATION     consequence-derivation.mjs   ─┐
        ↓                                                ├─ shared-dependency.mjs
MISSION IMPACT             consequence-derivation.mjs   ─┘
        ↓
PRIORITY ORDERING          priority-ordering.mjs
        ↓
EXPLANATION + PROVENANCE   explanation.mjs
        ↓
OPERATOR PROJECTION        apps/operator-console/src/approved/ui/operational-consequence.js
```

Entry point: `operationalConsequences({catalog, missions, reports, confirmations,
restrictions, sourceValidUntil, at, incidentId, snapshotId, limit})` in
`operational-consequences.mjs`, which also re-exports every layer for direct use.

**There is no second truth database.** Consequences are derived on every
evaluation from records the product already persists and are never stored. They
cannot drift from the facts because they have no independent existence.

### Why each boundary is where it is

- **canonical-inputs** is the only module that knows the shape of `missionCatalog()`
  output. Everything downstream reads flat `routeRow` records. If the catalog
  shape changes, one module changes.
- **operational-relationships** is the only module that decides *whether* a
  trigger reaches a route. All evidence rules live there.
- **consequence-derivation** decides *what it means*, and is forbidden from
  deciding mission state (§6).
- **priority-ordering** decides *what comes first*, and is the only module that
  may express urgency.
- **explanation** decides *how it is said*, and may not introduce any fact that
  is not already in the consequence.

---

## 2. Invariants — do not break these

1. **No score.** There is no `priorityScore`, no confidence, no probability, no
   weighting. Ordering is lexicographic over named factors (§5). A test asserts
   the explanation contains no `score|confidence|probab|likelihood|%`.
2. **Mission state is read, never recomputed.** `consequence-derivation.mjs`
   consumes `evaluateMission()` output. A second opinion on mission state would
   be a second mission scoring system.
3. **Determinism.** Same canonical records → identical output including ids and
   ordering. Every sort has a final stable tiebreak on id. Never introduce
   `Date.now()`, `Math.random()`, `Set`/`Map` iteration as an ordering source,
   or locale-dependent comparison into the pipeline.
4. **No model, ever.** `result.modelUsed === false` and `origin ===
   'DETERMINISTIC_DERIVATION'`. The engine must keep working with all AI
   services disabled. Recurring AI cost stays €0.
5. **Absence is never a value.** Unknown is not safe, zero, open, available or
   unaffected. `remainingOptionCount: null` means *not established*;
   `0` means *established as none*. These are different and must stay different.
6. **Every material conclusion is traceable.** No consequence may carry a
   statement not reachable from `provenance` (§4).
7. **No jargon on the operator surface.** Never render `dependency graph`,
   `epistemic`, `inference`, `knowledge node`, `confidence`, `tier`, `heuristic`.
   A test asserts this.

---

## 3. Consequence contract

`schemaVersion: 'vigia.operational-consequence.v1'`

| Field | Meaning |
|---|---|
| `id` | `consequence:<hash>` — stable, derived from incident + trigger + observedAt + roads |
| `incidentId`, `snapshotId` | canonical scope |
| `kind` | `FIELD_REPORT` \| `OFFICIAL_RESTRICTION` |
| `authority` | `FIELD_OBSERVATION` \| `OFFICIAL_ADMITTED_RESTRICTION` — **the truth boundary as data** |
| `establishesOfficialClosure` | `false` for every field report, always |
| `state` | `ACTIVE` \| `NEEDS_RECHECK` \| `NO_OPERATIONAL_LINK` |
| `roads[]` | `{road, basis}` where basis is `CONFIRMED` \| `NAMED_ONLY` \| `GEOMETRY_DERIVED` |
| `trigger` | reportId / restrictionId / reportType / reporterName / locationName / verification |
| `observedAt` / `receivedAt` / `knownAt` / `generatedAt` | **observed ≠ received, always** |
| `serviceImpacts[]` | per service, already ordered (§5) |
| `sharedDependencies[]` | false-redundancy findings (§7) |
| `tier`, `remainingOptionCount`, `label` | ordering keys, so consequences rank by the same comparator as services |
| `provenance` | §4 |
| `explanation` | §8 |

**`serviceImpact`** carries `serviceId`, `subjectId`, `affectedRoutes[]` (each with
its link `basis`), `storedRouteCount`, `remainingOptionCount`, `remainingOption`,
`remainingOptionState`, `redundancy`, `sharedDependency`, `missionImpacts[]`,
`tier`, `rank`, `decidedBy`, `orderingReason`.

`remainingOptionState` is a closed set:
- `ANOTHER_STORED_ROUTE_RETAINED`
- `NO_OTHER_CURRENT_ROUTE_STORED` — an **established** absence
- `NO_WATCHED_OBJECTIVE_FOR_THIS_SERVICE` — absence **not** established; claim nothing

**`missionImpact`** carries `missionId`, `state`, `reason`, `previousState`,
`changedAt`, `primaryAffected`, `flaggedByMissionEngine`, `remainingOptionCount`,
`remainingOption`. `state` and `reason` are copied verbatim from the mission engine.

---

## 4. Provenance contract

```
reportIds · restrictionIds · confirmationIds · missionIds · routeIds
facilityIds · roadRefs · serviceIds · subjectIds
```

Every entry is a canonical persisted identifier. `explanation.facts[]` pairs each
material sentence with the provenance key it came from (`{key, text, from}`), so a
surface can show "why do you say that?" without re-deriving anything.

**Rule for extensions:** if you add a statement, add its provenance in the same
commit. A statement whose supporting ids are not in `provenance` is a bug.

---

## 5. Ordering rules

`PRIORITY_TIERS` (most urgent first) in `priority-ordering.mjs`:

1. `ACTIVE_MISSION_NO_REMAINING_OPTION`
2. `ACTIVE_MISSION_ALTERNATIVE_RETAINED`
3. `SHARED_DEPENDENCY_ACROSS_SERVICES`
4. `MATERIAL_OBSERVATION_ON_WATCHED_ROUTE`
5. `UNRESOLVED_OR_STALE_DEPENDENCY`

`PRIORITY_FACTORS` compared in order: `tier` → `remainingOptionCount` (fewer
first) → `affectedServiceCount` (more first) → `affectedMissionCount` (more
first) → `observedAt` (newer first) → `id` (stable, never explained).

`comparePriority(a, b)` returns `{order, factor, aheadBecause, behindBecause}`.
`orderOperationalPriorities(rows)` attaches `rank`, `precededBy`, `decidedBy` and
`orderingReason` — **the first factor that differs is the explanation.** This is
why ordering can be argued with and a score cannot.

The same comparator orders services inside a consequence and consequences
against each other. Do not add a second ordering rule anywhere.

**To change the policy, reorder `PRIORITY_FACTORS` or `PRIORITY_TIERS` — do not
add conditionals at call sites.**

---

## 6. Mission integration

Missions are evaluated by the existing `evaluateMission()` in
`packages/domain/src/fieldnet/mission-command.mjs`. The consequence engine reads
`state`, `reason`, `currentRoute`, `fallback`, `alternativeCount`.

One additive change was made to that module: it now also returns
`alternativeRoutes` and `alternativeCount` — the usable-alternative set it was
already computing internally and discarding all but the first of. **This is why
"no other current route is stored" is trustworthy: it is the mission engine's own
`routeUsable()` rule reporting an empty set, not a separate calculation.**

`GOOD / WATCH / PROBLEM / UNKNOWN` semantics are untouched. Do not add a state.

**Transition evidence** (`previousState`, `changedAt`) is currently passed through
from the mission record and is `null` in the team-service path, because
`team-service.mjs` keeps prior state in the `mission-state` store rather than on
the mission object. Wiring it is P0 item 4 below.

---

## 7. False-redundancy semantics

`sharedRoadDependencies(routeRows)` → `{routeCount, independent, dependencies[],
blockingRoads[], reason}`.

`independent` is deliberately three-valued:
- `false` — a road is common to **every** stored route. No redundancy exists.
- `true` — no road is common to all of them.
- `null` — fewer than two routes. Neither independent nor dependent; **claim nothing.**

Each dependency carries `basis`:
- `NAMED_ROAD` — both routes list the same road reference. A claim about *names*.
- `GEOMETRY_CONFIRMED` — the retained geometries additionally run within
  `CORRIDOR_M` (60 m) of each other at **two or more** sampled points. One
  coincident point is a crossing, not a shared corridor.

`describeSharedDependency()` emits the sentence, and attaches a `qualifier`
whenever the basis is only `NAMED_ROAD`:

> "2 stored routes are available, but both still depend on EM527."
> *Shared by road name. The retained geometry does not establish that they use the same stretch.*

**Never promote a named-road finding to a geometric one.** Two distinct stretches
of the N114 carry the same name.

Road identity comes from `roadKey()`, now exported from
`intelligence/road-observations.mjs` and shared with restriction matching, so the
two subsystems cannot disagree about whether `EN 527` and `EM527` are the same road.

---

## 8. Field-report truth boundary

A field report is a **claim**, not a conclusion. The wording rules, enforced by
tests:

| Allowed | Forbidden |
|---|---|
| "A field report says EM527 was blocked at 18:21." | "EM527 is closed." |
| "A published restriction closes EM527." *(restrictions only)* | "officially closed" from a report |
| "No other current route is stored." | "No other route exists." |
| "another stored route, condition unconfirmed" | "a working alternative" |

- `authority` and `establishesOfficialClosure` carry the boundary as **data**, so
  a new surface cannot accidentally lose it by rewording.
- `observedAt` and `receivedAt` are never merged. The operator sentence quotes the
  **observation** time.
- `explanation.truthBoundary` is the one field permitted to use the word "closed",
  because it is the sentence that denies closure. Exclude it from wording scans.
- Unconfirmed reports surface "not been confirmed by a second responder" in
  `whatNeedsChecking`; conflicting responders surface as conflict, not as truth.

---

## 9. Modules and files

**New — domain** (`packages/domain/src/consequences/`)

| File | Lines | Role |
|---|---|---|
| `canonical-inputs.mjs` | 152 | flatten + index catalog; `roadKey` reuse; `namedRoadKeys`; bounding boxes |
| `operational-relationships.mjs` | 144 | trigger → road → route → service → mission, with evidence basis |
| `shared-dependency.mjs` | 117 | false redundancy; `geometriesShareCorridor` |
| `consequence-derivation.mjs` | 153 | service + mission impact; tier assignment; provenance |
| `priority-ordering.mjs` | 93 | tiers, factors, explaining comparator |
| `explanation.mjs` | 103 | operator language + truth boundary |
| `operational-consequences.mjs` | 60 | entry point and re-exports |

**New — console:** `apps/operator-console/src/approved/ui/operational-consequence.js` (61)
— `consequenceCard`, `consequenceSection`, `consequenceActions`. Renders only; derives nothing.

**Modified — 6 files, +31 / −5, all additive**

| File | Change |
|---|---|
| `packages/domain/src/intelligence/road-observations.mjs` | export `roadKey` (was module-private `key`) |
| `packages/domain/src/fieldnet/mission-command.mjs` | `evaluateMission` also returns `alternativeRoutes`, `alternativeCount` |
| `apps/api/src/modules/mission/team-service.mjs` | one import; `evaluate()` returns `consequences` |
| `apps/operator-console/src/approved/ui/mission-command.js` | one import; view normalisation; consequence block leads Important Now |
| `apps/operator-console/styles/approved/mission-command.css` | 10 lines appended |
| `package.json` | test glob includes `packages/domain/test/consequences/*.test.mjs` |

No file was deleted or renamed. No Mega IX behaviour was changed.

---

## 10. Tests and fixtures

`packages/domain/test/consequences/` — **37 tests, all passing.**

- `consequence-fixture.mjs` — CONTROLLED_TEST scenarios. Synthetic coordinates
  near Évora, chosen so geometry, proximity and naming are checkable by hand.
  Missions run through the **real** `evaluateMission()`, never hand-stated.
  Builders: `em527Scenario()`, `falseRedundancyScenario()`, `namedRoadOnlyRoutes()`.
- `operational-consequences.test.mjs` — A (shared road / unequal consequence),
  B (false redundancy).
- `consequence-truth-and-determinism.test.mjs` — C (field-report boundary),
  D (mission impact), E (determinism), F (missing data), G (prefilter correctness).
- `consequence-projection.test.mjs` — Important Now rendering, actions, escaping.

```bash
mkdir -p .tmp/test
TMPDIR=$PWD/.tmp/test node --test --test-concurrency=1 packages/domain/test/consequences/*.test.mjs
# expected: # tests 37 · # pass 37 · # fail 0
```

**Regression status.** Full `npm test`: **87 failing before this branch, 87
failing after.** Added-failure set and removed-failure set are both empty,
compared by sorted test name. Those 87 are pre-existing on the baseline archive
(it deliberately omits the large runtime datasets many suites read).
`node scripts/check.mjs` reports the same two pre-existing violations as the
baseline (`mapRuntime.js` 259 lines; `package.json` dev dependencies) and none
from this work.

---

## 11. Performance

Controlled incident (3 routes, 2 missions, 1 report), steady state:
**p50 0.082 ms · p95 0.162 ms.** Negligible inside `evaluate()`.

Scaling probe after the bounding-box prefilter:

| routes | reports | ms |
|---|---|---|
| 100 | 10 | 3.5 |
| 400 | 20 | 20.1 |
| 800 | 40 | 64.1 |

**Flagged for national scale.** Relationship construction is still
**O(routes × reports)**. The padded bounding-box prefilter in
`canonical-inputs.mjs` cut it by roughly a third to a half, but it reduces the
constant, not the complexity: every report still visits every route row to test
its box.

The remedy, when incident counts grow: index route bounding boxes into a coarse
spatial grid (≈1 km cells) in `extractCanonicalInputs`, then have
`buildOperationalRelationships` look up only the cells a report's coordinate
touches. This is a drop-in change to two functions and preserves determinism
exactly, because the prefilter is conservative by construction — it may only skip
routes that cannot match. **Do not skip `FACILITY_MATCH` or `NAMED_ROAD` links
when adding spatial indexing**; those bases do not depend on geometry, and test
G2 pins that.

---

## 12. What remains — prioritised

### P0

1. **Generalise Important Now consequences.** The card renders the top two.
   Decide operator policy for many simultaneous consequences: grouping by road,
   collapsing repeats of one road across subjects, and a "show all" affordance.
   Extend `consequenceSection()`; do not add ordering logic there — if the order
   is wrong, fix `PRIORITY_FACTORS`.
2. **Complete What Changed causality.** The deterministic chain already exists in
   the consequence (`observedAt` → `roads` → `serviceImpacts` → `missionImpacts`
   with `previousState`/`state`). `team-service.mjs` writes `timeline` rows on
   mission-state change; join those rows to `consequence.provenance.missionIds`
   and render the chain instead of one line of text. **Suggested:**
   `explainConsequenceChain(consequence, timelineRows)` in a new
   `consequences/causal-chain.mjs`, consumed by the `timeline` section of
   `mission-command.js`. Was deliberately not built here so the core engine
   landed complete.
3. **Response & Access dependency UI.** Surface `serviceImpact.redundancy` and
   `sharedDependency` on the Response & Access route
   (`apps/operator-console/src/approved/routes/response-access.js`). The data is
   already computed per service. Respect the `NAMED_ROAD` qualifier verbatim.
4. **Mission consequence explanation** — "why did this mission change?" with the
   full chain. Requires wiring `previousState`/`changedAt` into `missionImpact`:
   read the `mission-state` store in `team-service.evaluate()` and pass prior
   state onto the mission object before `operationalConsequences()` is called.
   The contract fields already exist and are currently `null`.
5. **Stale critical-information reasoning.** Tier
   `UNRESOLVED_OR_STALE_DEPENDENCY` exists and is reachable but is not yet driven
   by source freshness. Feed `sourceValidUntil` staleness and
   `restriction.validUntil` expiry into `tierFor()` in `consequence-derivation.mjs`.
6. **Consequence → Intelligence VIII verification tasking.** Integration point is
   clean: a consequence's `provenance` already names the exact facility, route,
   road and mission ids an information requirement would target. Map
   `serviceImpact.remainingOptionState === 'NO_OTHER_CURRENT_ROUTE_STORED'` and
   `sharedDependency.basis === 'NAMED_ROAD'` onto Intelligence VIII requirement
   classes, then task through its existing `nextVerificationTasks()`.
   **Operator wording stays "Needs checking" — never "high epistemic impact
   information requirement."**

### P1

7. **"What still works?"** — the inverse projection. `whatStillWorks` is
   populated but only for services in an affected consequence. Generalise across
   the whole incident.
8. **Simultaneous failures.** Two triggers on different roads affecting one
   service is already representable (two consequences); what is missing is
   combined reasoning — does the *pair* remove the last option? Suggested:
   `combinedImpact(consequences)` over the union of affected route ids, reusing
   `sharedRoadDependencies`.
9. **Privacy-safe responder proximity suggestion.** Presence location is
   opt-in in `team-service`. Any suggestion must consume only explicitly shared
   locations and must never infer position.
10. **Broader service/community propagation.** `missionCatalog()` already returns
    community subjects; the engine handles them today but only where missions
    exist. Extend to communities without a watched objective — carefully:
    `NO_WATCHED_OBJECTIVE_FOR_THIS_SERVICE` must not silently become an
    established absence.

### P2

11. Visual refinement of the consequence card.
12. Complete browser matrix / 35 captures.
13. Screenshot review.
14. Spatial grid index (§11) when incident scale demands it.

---

## 13. Extending safely — checklist

- Adding a trigger kind → `operational-relationships.mjs` only; give it an
  `authority` and an `establishesOfficialClosure`.
- Adding a link basis → add to `ROUTE_LINK_BASES` **in strength order**; `rank()`
  depends on array position.
- Adding an ordering factor → `PRIORITY_FACTORS`, with an `explain()`. Position
  in the array is the policy.
- Adding a sentence → `explanation.mjs`, and add its `facts[]` entry with a
  `from` provenance key in the same commit.
- Adding a tier → `PRIORITY_TIERS` and `tierFor()`. Never branch on tier at a
  call site.
- **Never** recompute mission state, introduce a numeric priority, or let a
  named-road finding be reported as geometric.
