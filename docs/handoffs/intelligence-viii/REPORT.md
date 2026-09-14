# VIGIA Intelligence VIII — Collection Superiority + Epistemic Impact

Branch: `claude/vigia-intelligence-viii-collection-superiority`, cut from `main`.
Run in parallel with Codex's hardening / local-AI / readiness lanes. **No file
owned by those lanes was touched** — see PARALLEL-SAFETY below.

---

## WHAT VIGIA CAN NOW KNOW ABOUT ITS OWN UNKNOWNS

Before this sprint, VIGIA could say:

> No retained second qualified hospital.

That is a true statement with no operational handle on it. It does not say what
is missing, who depends on it, what would change, or where to look.

VIGIA can now say, from the same retained data:

> **Which nearby mapped hospitals have a verified emergency department?**
> - Blocks the qualified emergency healthcare set for this incident.
> - No retained alternative exists for the affected support category.
> - Exactly one qualified facility is retained.
> - 57 retained communities depend on the affected support.
> - 10 retained support relationships use it.
> - The nearest unresolved candidate is Hospital Z at 3.9 km, with no retained
>   calculated route.
> - Resolving it would force recomputation of: qualified nearest ranking, support
>   alternatives, community support, coverage classification, operational support
>   brief, intelligence gaps, Ask VIGIA answerability.

And it can show what would change without changing anything:

> **KNOWLEDGE IMPACT PREVIEW — NOT OBSERVED REALITY**
> If Hospital X had a verified emergency department:
> primary Hospital A (22 min) → Hospital X (9 min); retained options 1 → 2;
> 4 communities affected; 4 coverage classifications could change.
> **No current data has been modified.**

VIGIA still does **not** claim Hospital X has an emergency department. It
explains the value of resolving the unknown.

---

## REAL INFORMATION REQUIREMENTS

Run against the **real retained Évora capture** (`docs/handoffs/mega-vii/live-proof.json`,
incident `PT-2026-01F7E2E21A`), reproducible with
`node scripts/collection_intelligence_acceptance.mjs`:

| Retained capture | Requirements | By class |
|---|---|---|
| historical, support intact (2026-09-13T09:16:14Z) | 10 | FACILITY_CAPABILITY 2 · ROAD_INFORMATION 7 · RECEPTION_ACTIVATION 1 |
| current, routes expired (2026-09-14T07:34:27Z) | 10 | FACILITY_CAPABILITY 2 · ROAD_INFORMATION 4 · RECEPTION_ACTIVATION 1 · ROUTE_MISSING 3 |

Every one of these is derived from genuinely retained Évora data, including the
real corridors (EM527 with **12** retained support relationships, CM1087 with 9),
the real reception candidate (**Escola Básica de Canaviais**, 30 communities), and
the real single-qualified-hospital and single-qualified-fire-station conditions.

Requirement classes are bounded to the nine declared: `FACILITY_IDENTITY`,
`FACILITY_CAPABILITY`, `PUBLIC_CONTACT`, `ROAD_INFORMATION`,
`RECEPTION_ACTIVATION`, `OFFICIAL_DESIGNATION`, `ROUTE_MISSING`, `SOURCE_STALE`,
`PHYSICAL_OBSERVATION_GAP`. No free-form class can be emitted.

Each requirement carries: subject, missing fact, the question in plain language,
current known state with its reason, affected support relationships / communities
/ categories / facilities, whether a retained alternative exists, source coverage,
approved candidate sources, lifecycle state and version, timestamps, and its own
truth boundary.

---

## NEXT VERIFICATION TASKS

Ordering is **explicit and lexicographic** over eight declared factors, in this
order, with the factor values returned alongside every task:

1. blocks a critical qualified category
2. no retained alternative
3. affected community count
4. affected support-relationship count
5. shared dependency breadth
6. source freshness urgency
7. incident proximity
8. approved source available

There is **no composite score**. A test asserts that no key matching
`/score|weight|confidence/` appears on a task. Ties break on requirement identity,
so the ordering is stable and reproducible for an identical knowledge state.

Real output (historical Évora capture):

```
1. Verified fire-response facility   — blocks the qualified fire response set · no retained
                                       alternative · 57 communities · 10 relationships
2. Verified emergency hospital       — blocks the qualified emergency healthcare set · no
                                       retained alternative · 57 communities · 10 relationships
3. Escola Básica de Canaviais        — 30 communities · 6 relationships · shared across 2 categories
4. CM1087                            — 4 communities · 9 relationships · partial coverage
5. CM1087-1                          — 2 communities · 6 relationships · partial coverage
```

EM527 ranks below CM1087 despite carrying 12 relationships versus 9, because
community count is factor 3 and relationship count is factor 4. That is the
declared doctrine, and it is visible rather than hidden in a weighting.

---

## WHY THEY MATTER

`explainRequirement()` assembles a deterministic causal explanation from retained
counts and states only — no model, no prose generation:

```
Why verify the emergency healthcare set?
- One emergency healthcare facility is qualified in the retained set. No second
  qualified option is retained.
- The current qualified option is Hospital A at 12.4 km.
- The nearest unresolved candidate is Hospital Z at 3.9 km with no retained
  calculated route.
- 4 retained communities have their support affected by this unknown.
- 5 retained support relationships depend on it.
- No retained alternative would absorb the loss of the current option.
Resolving it would force recomputation of: qualified nearest ranking, support
alternatives, community support, coverage classification, operational support
brief, intelligence gaps, Ask VIGIA answerability.
```

Its truth boundary is explicit: *"Every statement above is a retained count or a
retained state. None of them asserts the missing fact, and resolving the
requirement may confirm, refute or leave it unresolved."*

---

## KNOWLEDGE IMPACT PREVIEWS

Four bounded preview kinds: `FACILITY_CAPABILITY_CONFIRMED`,
`RECEPTION_ACTIVATION_CONFIRMED`, `FACILITY_IDENTITY_RESOLVED`,
`ROAD_INFORMATION_COVERED`. Anything else is rejected, not approximated.

Guarantees, each with a test:

* **Zero operational writes.** `operationalWrites: 0`, and the engine hashes the
  input snapshot before and after and throws `knowledge_preview_mutated_input` if
  they differ. Tests additionally assert the snapshot is byte-identical.
* **Never invents a route.** Confirming Hospital Z's capability makes it qualified
  (`qualifiedCount 1 → 2`) but produces **no support option**, because no
  calculated route to it is retained. The preview returns
  `blockedBy: NO_RETAINED_CALCULATED_ROUTE` and says so in plain language.
* **Road previews preview an information state, never a road state.** The branch
  keeps every ingested restriction exactly as retained; it only assumes the
  connected source would cover the road.
* **Every assumed fact is marked `previewOnly`** with provider
  `VIGIA_KNOWLEDGE_IMPACT_PREVIEW`, so it can never be serialized as an accepted
  fact.
* **Every preview a requirement offers is itself valid** — a test round-trips all
  offered previews through the engine.

The demonstration in the acceptance output runs on the **CONTROLLED_TEST fixture,
labelled as such**. The retained Operational Picture is a compacted projection
without facility fields and provenance, and `data/runtime/` (which has them) is
excluded from this repository by `.gitignore`. Running
`scripts/collection_intelligence_acceptance.mjs` on the machine that holds
`data/runtime/` will demonstrate the preview on real retained data. Controlled
data is never presented as live.

---

## SOURCE TASKING

Uses only the **already-registered approved source ecosystem**. No crawling, no
search, no paid API. Three honest outcomes:

| State | Meaning |
|---|---|
| `REGISTERED_SOURCE_AVAILABLE` | approved sources exist, ranked by authority then deterministic-parser availability |
| `NO_REGISTERED_SOURCE` | *"No approved registered source is linked to this subject for this fact. Closing this requirement needs a new registered source or a human decision; VIGIA will not search for one."* |
| `OWNED_BY_ACQUISITION_LANE` | road, sensing and source-freshness requirements belong to the acquisition pipelines; surfaced for prioritisation only, and deliberately not reached into |

Each source reports provider, authority, health (`CURRENT` / `STALE` /
`LAST_KNOWN` / `UNAVAILABLE` / `NEVER_RETRIEVED`), last successful retrieval,
whether a deterministic parser exists, and whether manual review is required. A
registered-but-stale source is still reported as the right place to look, marked
stale — not hidden.

---

## KNOWLEDGE EVENTS

`KNOWLEDGE_EVENT` is a distinct object class from a world event. Every event
carries `classification: {origin: 'VIGIA_LEARNED', distinctFrom: 'WORLD_CHANGED'}`
and the boundary *"This records a change in what VIGIA knows, not a change in the
world. Snapshots captured before this moment are never rewritten with it."*

Twelve bounded kinds: capability verified / lost to staleness, reception
activation confirmed / lapsed, identity resolved, contact published, source
recovered / lost, and the four requirement-lifecycle transitions.

An event carries its consequence: how many support relationships changed, which
subjects were affected, and what it became primary for:

```
Emergency capability verified for Hospital X
↓ became the primary retained option for Community 1 · emergency hospital
↓ 4 retained support relationships changed as a result
```

Staleness detection uses the **same provenance-validity rule as the support
engine** (`effectiveFieldState`), so a capability whose accepted fact has expired
is reported as a knowledge loss rather than silently retained — and it is a
knowledge loss, not a world change.

`knowledgeDelta()` answers the four asked questions: what was learned in the
window, which new fact changed the most support relationships, which gaps closed,
and which gaps opened because data went stale. No mystery score.

**No future knowledge leakage**: `knowledgeEvents` throws
`knowledge_events_require_forward_time` if asked to run backwards, and a test
asserts the earlier snapshot still records exactly what VIGIA knew then.

---

## LIFECYCLE

Six states: `OPEN`, `QUEUED`, `IN_PROGRESS`, `RESOLVED`, `BLOCKED`, `EXPIRED`.

* **Identity, not similarity.** A requirement's id is
  `hash([incidentId, class, subjectId, missingFact])`. Regenerating five times
  produces the same set with no duplicates and no reopening.
* **An accepted fact closes the requirement it answered**, recording
  `resolvedBy` and `closedAt`.
* **A fact that goes stale reopens as a NEW VERSION** with `reopenedFrom`
  pointing at the resolution it supersedes. The resolved record is never edited
  in place — a test asserts the historical record is untouched.
* **Expiry is time-bounded**, not immediate: a requirement that stops being
  generated is RESOLVED; one that ages past its window without resolution is
  EXPIRED.
* **Only declared transitions are allowed.** `RESOLVED → anything` throws.
* **Historical reads never mutate the lifecycle** — replaying a past time emits
  zero lifecycle events, verified at the API level.

---

## UI

**No new route. No new dashboard. No contradiction UI.** The existing Intelligence
Gaps section inside the Operational Picture is upgraded in place, and one sibling
view is added to the same section navigation.

Intelligence Gaps now renders, per requirement, in the established
`op-dependency` article anatomy:

```
Verified emergency hospital
Which nearby mapped hospitals have a verified emergency department?

Operational impact    one retained qualified option · 4 communities · 5 support relationships
Next verification     Hospital Z · 3.9 km · no retained calculated route
Why                   Blocks the qualified emergency healthcare set for this incident.
Approved source       SNS · current

[Inspect requirement]  [Preview knowledge impact]  [View approved sources]
Capability verification · single qualified option
```

Plus **"What VIGIA learned"** in the same section nav, which separates knowledge
changes from world changes explicitly.

Design compliance: reuses the existing `op-dependency`, `op-tools`, `op-corridor`
and `op-meta` components and the established button/typography scale; adds only a
definition-list layout (`op-requirement`) and the preview's amber left rule
(`op-preview`), both inside the existing token system, with a mobile reflow at
600px. The physical/operational fact leads; requirement ids, provenance and source
machinery sit in the disclosure beneath. All 18 operator-console contracts pass,
including the interaction contract (7 routes, 76 buttons, **zero dead controls**).

**`mapRuntime.js` is not modified.** The preview returns a *validated map intent*
(`SHOW_COVERAGE` / `FOCUS_ROAD`); the UI dispatches it through the Operational
Picture's existing selection path, which already owns the renderer.

---

## PERFORMANCE

Retained data only. **Zero external fetches on any read** (`externalFetches: 0` is
returned and asserted). No acquisition is triggered by a UI read.

Measured on the real retained Évora capture (20 iterations each):

| Operation | historical capture p95 | current capture p95 |
|---|---|---|
| requirements for one incident | 2.62 ms | 0.23 ms |
| top tasking list | 0.08 ms | 0.04 ms |
| one knowledge-impact preview | 5.64 ms (controlled snapshot) | — |

End-to-end through the HTTP route layer, all three stay under a 1000 ms
interactive budget, asserted by a test. A 15-second per-incident read cache and a
32-incident bound keep repeated reads cheap without holding unbounded state.

---

## TESTS

**55 new tests, all passing.** Repository suite: **1575 tests, 1533 passing** — up
from 1520 / 1478 on `main`, with **zero change to any existing test outcome**
(verified by diffing the failing-test-name sets between a clean `main` run and
this branch; both the added-failures and removed-failures sets are empty).

The 11 failures and 16 cancellations are the pre-existing `main` baseline and
belong to Codex's lane — they were deliberately not fixed here.

Coverage by required area:

| Required | Where |
|---|---|
| requirement generation | `collection-requirements.test.mjs` — bounded classes, counts, unverified ≠ absent, designation ≠ activation, no-matched-restriction ≠ open |
| dedupe | identity across regenerations; no duplicate explosion over 5 rounds |
| lifecycle | open/carry/resolve/reopen/expire, forbidden transitions |
| accepted fact closes requirement | `collection-lifecycle.test.mjs` |
| stale fact reopens/versioned | new version + `reopenedFrom`, resolved record unedited |
| no registered source | explicit `NO_REGISTERED_SOURCE`, never an empty success |
| source selection | authority ranking, parser availability, health, unwatched excluded |
| explicit task ordering reasons | factor order, stability, community-over-relationship precedence, source tie-break, no score key |
| capability impact preview | ranking / support / community / coverage changes |
| reception activation preview | bounded, changes reception support |
| zero operational writes | `operationalWrites: 0`, byte-identical snapshot, mutation guard |
| community impact | affected community counts on requirements and previews |
| ranking changes | `nearestEmergencyHospital` / `nearestCalculatedEmergencyOption` deltas |
| knowledge-event generation | verified / lost-to-staleness, consequence, classification |
| no future knowledge leakage | backwards-time rejection |
| immutable historical snapshots | earlier capture unchanged after events derived |
| invalid preview rejection | unsupported kind / capability / entity / type / extra key |
| authorization | 401 unauthenticated, 403 out-of-scope, policy inheritance, unknown query rejection |
| bounded read-only outputs | limits, truncation flags, limitation strings, GET-only surface |

---

## REAL VS CONTROLLED

| Element | Data |
|---|---|
| Information requirements, tasking, reasons, explanations, lifecycle | **REAL** retained Évora capture, incident `PT-2026-01F7E2E21A` |
| EM527 / CM1087 corridors and their relationship counts | **REAL** |
| Escola Básica de Canaviais reception candidate, 30 communities | **REAL** |
| Single qualified hospital and single qualified fire station | **REAL** |
| Knowledge-impact preview demonstration | **CONTROLLED_TEST fixture, labelled** |
| Knowledge-event demonstration | **CONTROLLED_TEST fixture, labelled** |

The retained capture is a **retained knowledge state, not a live observation**,
and the acceptance output says so in `corpusBoundary`. The preview and event
engines need a full situation snapshot with facility fields and provenance, which
the compacted picture does not carry and `data/runtime/` (gitignored) does. Both
are marked `DEMONSTRATED_ON_CONTROLLED_DATA_ONLY` with the exact reason.
Controlled data is never presented as live.

---

## PARALLEL-SAFETY / FILES TO MERGE

**Files owned by Codex's lanes: zero touched.** Verified by name against the
`PARALLEL_BOUNDARIES.md` list — `mapRuntime.js`, basemap/tile delivery,
performance harnesses, `intelligence-language-model.mjs`,
`local_intelligence_runtime.mjs`, `local_intelligence_worker.py`, audit chain,
readiness, physical sensing, `situation-ask.mjs`, `operator-console/server.mjs`.

### Existing files modified — 4 files, 41 insertions, 3 deletions

| File | Change |
|---|---|
| `apps/api/src/application/register-routes.mjs` | **+2 lines**: one import, one `registerCollectionIntelligenceRoutes(router,services)` call |
| `apps/operator-console/src/vigiaApi.js` | **+5 lines**: `collectionRequest()` read client |
| `apps/operator-console/src/approved/ui/operational-picture.js` | **+20/−3**: imports, the collection query, the upgraded gaps branch, four new commands, one nav entry |
| `apps/operator-console/styles/approved/situation.css` | **+14 lines**: `.op-requirement`, `.op-preview` and the mobile reflow, appended |

### New files — 22

**Domain (`packages/domain/src/intelligence/`)**
`knowledge-state.mjs` · `requirement-record.mjs` · `facility-requirements.mjs` ·
`context-requirements.mjs` · `information-requirements.mjs` ·
`collection-tasking.mjs` · `collection-sources.mjs` · `collection-lifecycle.mjs` ·
`knowledge-branch.mjs` · `epistemic-impact.mjs` · `knowledge-events.mjs`

**API (`apps/api/src/modules/intelligence/`)**
`collection-intelligence-service.mjs` · `collection-intelligence-routes.mjs`

**Console** `apps/operator-console/src/approved/ui/collection-intelligence.js`

**Tests (`apps/api/test/`)** `collection-intelligence-fixture.mjs` ·
`collection-requirements.test.mjs` · `collection-tasking.test.mjs` ·
`collection-lifecycle.test.mjs` · `collection-epistemic-impact.test.mjs` ·
`collection-intelligence-api.test.mjs` · `collection-intelligence-reads.test.mjs`

**Scripts / docs** `scripts/collection_intelligence_acceptance.mjs` ·
`docs/handoffs/intelligence-viii/`

### Deliberately not committed

`data/validation/release/*` was regenerated locally to build the console and run
its 18 contracts (all pass), then **reverted**. Both branches change console
source and would both regenerate these nine large generated files, guaranteeing a
conflict for no benefit.

**After merging, run once:** `npm run release:manifest`, then
`npm --prefix apps/operator-console run build`.

### Architecture

No new modularity-budget violation (`node scripts/check.mjs`): every new module is
under the 220-line budget, and the seven remaining violations are all pre-existing
on `main`.

### One-line registration hook left for later

`situation-ask.mjs` was deliberately not edited. The six read-only tools are
exported from `collection-intelligence-routes.mjs` as `COLLECTION_TOOLS`,
`collectionToolHandlers(service)` and `collectionMapIntents(tool, args, result)`.
Registering them into the Ask surface after Codex's lane lands is:

```js
// in situation-ask.mjs
export const SITUATION_TOOLS = Object.freeze([...existing, ...COLLECTION_TOOLS]);
```

plus dispatching through `collectionToolHandlers` and merging
`collectionMapIntents` into `answerMapIntents`.

---

## REMAINING GAPS

1. **The preview and knowledge-event engines have not been run against real
   retained snapshots.** They need `data/runtime/`, which is gitignored and absent
   here. `scripts/collection_intelligence_acceptance.mjs` runs them on the machine
   that holds it.
2. **Source tasking returned `NO_REGISTERED_SOURCE` for every real Évora
   requirement** in this environment, because the world-knowledge source cache is
   empty without `data/runtime/`. On the real runtime it will resolve against the
   registered approved sources. The code path is covered by tests with real
   source-record shapes.
3. **Rendered visual QA has not been run** for the upgraded Intelligence Gaps
   section — no browser or retained incident here. All 18 static console contracts
   pass, including interaction and UX, but that is an argument, not a rendered
   screenshot. Capture the gaps, requirement, preview and sources views at 1728 and
   390 widths before accepting the UI.
4. **`OFFICIAL_DESIGNATION` and `PHYSICAL_OBSERVATION_GAP`** are declared classes
   with declared dependent outputs but no generator yet — designation is currently
   covered indirectly through `RECEPTION_ACTIVATION`, and physical observation gaps
   belong to the sensing lane Codex owns.
5. **The requirement lifecycle is an in-memory read-side index**, bounded to 32
   incidents and rebuilt from retained snapshots on restart. It is deliberately not
   a second source of operational truth. If requirement history needs to survive
   restart, it needs a durable store — a decision, not an oversight.
