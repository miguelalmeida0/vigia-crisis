# Engineering agent performance

## Attribution warning

There are no Agent 1 or Agent 2 commits. The comparison below uses the high-confidence time windows in `GIT_FORENSICS.md`, the pre-cutover graph recorded in `docs/reality/PRODUCTION_CUTOVER.md`, file chronology, and current runtime/code. It does not pretend that an unavailable intermediate tree can be diffed exactly.

## Capability comparison

| Domain | Baseline | After Agent 1 | After Agent 2 / current | Material product improvement? | Evidence |
|---|---|---|---|---|---|
| Demo/synthetic isolation | Production entry imported fixture providers and served generated assets | Synthetic/replay semantics and disclaimers improved, but shared runtime remained | Fixture switch rejected; test graph separated; served fiction removed; executable reality gate | **Yes, Agent 2** | `env.mjs:9`; reality gate: 140 modules, 0 leaks |
| Runtime modes | Live/demo/fixture switch in same entry | Cleaner claim boundaries, still fixture-capable | Production only; TEST and external REPLAY separated | **Yes** | `package.json:10`; `PRODUCTION_CUTOVER.md:48` |
| Data acquisition | Public API snapshots; no raw fabric | More source failure semantics and parser structure | Real scheduled ptdata raw acquisition; conditional FIRMS path | **Partial** | Live audit created raw ptdata products/checkpoints; FIRMS not configured |
| NASA FIRMS | Helper/gateway, unconfigured | Event/fusion mechanics improved around thermal inputs | Real conditional CSV acquisition plus archive/checkpoint; no runtime key | **Architecture only operationally** | `/api/v10/events`: `viirs=not_configured` |
| MTG | WMS and parser hooks mixed with demo-labelled provider | Thermal support/freshness semantics improved | Demo-labelled provider removed; operational MSG WMS retained as context; point path parser-only | **Truth improvement, not physical capability** | `LIVE_SOURCE_STATUS.md:13` |
| Sentinel-3 | Parser/input seam | Physical observation/geometry mechanics | Still parser/consumer only | **No** | `LIVE_SOURCE_STATUS.md:15` |
| Sentinel-2 | Catalogue/imagery and fixture fallbacks | Native-pixel GeoIntegrity and screening test path strengthened | Fixture paths removed; discovery real; PREVENT hidden | **Scientific integrity yes; product no** | Geo tests pass; 0 persisted live proofs |
| Sentinel-1 | Catalogue/context and fixture branch | Limited | Fixture fallback removed; catalogue only | **Truth improvement only** | `PRODUCTION_CUTOVER.md:97` |
| Weather | Real ptdata context | Failure semantics | Real response archived/checkpointed | **Yes, contextual** | Selected event weather raw product ID present |
| Raw evidence | None/limited latest cache | Provenance contracts improved | SHA-addressed valid ptdata responses and checkpoints | **Yes, incomplete** | `acquisition-store.mjs:21`; event report loses raw link |
| Provenance | Mixed synthetic/real; poor boundary | Better physical/evidence envelopes | Synthetic production guard and product metadata; incomplete event lineage | **Partial** | Sintra event report has no `rawSourceProductId` |
| Persistence | Mutable JSON; silent failure risks | Transaction/rollback semantics and correction persistence | Fresh production state, restart smoke, local file stores | **Software reliability yes; production readiness no** | `event-observation-repository.mjs:114`; smoke passed |
| Event identity | Report-oriented and unstable in edge cases | Merge/split/late-arrival mechanics, stable aliases, accepted-evidence feedback | Production provenance guard; still no real corpus | **Foundation only** | Tests pass; operational performance unmeasured |
| Association | Distance/time heuristic | Rejection/correction and uncertainty wording improved | Still fixed-weight best-pair and greedy nearest candidate | **No category change** | `event-association.mjs:51`; `fire-event-tracker.mjs:105` |
| Sensor fusion | Records presented as strong/probabilistic | Dependency groups, contradictions, negative-evidence rules, null probability | Same ledger with better production truth labels | **Material truth improvement; not genuine fusion proof** | `evidence-fusion.mjs:22` |
| Physical detection | No real physical-first product proof | Canonical physical observation and synthetic physical-first tests | Real-source gates honest; runtime physical count remains 0 | **No operational improvement** | `/api/v10/ready`; external config unset |
| Fire geometry | Points/lines and overclaim risk | Thermal pixel support, hull limitations, freshness, movement semantics | Product hides geometry when absent; no real series | **Foundation only** | `fire-event-geometry.mjs:14` |
| Behavior semantics | Stale trends could read as current | Current vs historical thermal trend and expiry corrected | Honest report-only/unknown UI | **Yes, semantic** | `fire-event-tracker.mjs:66` |
| Active perception | Hard-coded/presentational choices | Feasibility-based asset/schedule plumbing; unmeasured dimensions explicit | Empty registry/schedule; manual only | **No operational capability** | `active-perception-service.mjs:8` |
| EvidenceNeed | Unknowns could remain inert | Durable state machine, lifecycle, ownership/SLA fields, feedback | Public UI exposes every unresolved need and no-path state | **Yes in accountability; no closure** | 12 live no-path needs, 0 active requests at later capture |
| EvidenceRequest | Seeded/demo workflows and local field app | Idempotent request/evidence lifecycle and eligible accepted evidence | Fake identities/app removed; production requests inaccessible | **Truth improvement, product unavailable** | Public POST 401; no OIDC |
| Action/workflows | Apparent operator actions on fake identities/state | Durable mechanics and SLA semantics | ACTION/FIELD hidden; all public mutation denied | **Removed theatre; no usable action plane** | `request-context.mjs:1`; feature nav hidden |
| Prevention | Fixture findings and generated imagery could appear real | Native-pixel screening, abstention, GeoIntegrity tests, better wording | Production fixture branches removed; PREVENT hidden | **Integrity yes; detector still unproven** | `RELEASE_GATES.md:12` |
| Outcomes | Seeded/fabricated operational stories | Null/unmeasured metrics and evidence rules improved | OUTCOMES hidden and production state empty | **Theatre removed, no outcome capability** | `featureFlags.outcomes=false` |
| Source health | Vague mixed freshness | Failure state mechanics improved | Per-source drawer plus checkpoint API; no SLO/rejection/next-attempt UI | **Partial** | Live source drawer and `/acquisition/status` |
| Authentication | Client-selected actor/header | Read-only boundary tests introduced late in window | Fake header cannot authorize; public mutation 401; no real authentication | **Security risk removed, capability absent** | Fake `x-vigia-actor-id` probe returned 401 |
| Audit/security | Local hash chain could be corrupted; fake actor attribution | Chain behavior, authorization/redaction, headers improved | Public sensitive routes forbidden; local mutable audit remains | **Partial** | `/api/v2/audit` 403; no external anchoring |
| Observability | Console/local status | More failure events/status objects | Readiness and acquisition APIs; still no metrics backend/tracing/SLO | **Partial** | `create-runtime.mjs:23`; no telemetry integration |
| Replay | Bundled synthetic corpus could support claims | Arrival-order/late data mechanics | Synthetic corpus renamed TEST; real replay requires external labels | **Major truth improvement; benchmark absent** | `REPLAY_CORPUS.md:7` |
| Testing | 82 tests, missing geo runtime in audit | Expanded to 114 and major failure paths | 122/122, reality/smoke/browser/acquisition gates | **Yes for software confidence** | Independent rerun passed |
| Deployment | Local Node process | Managed Python setup | Still local Node/filesystem; no deployment/IaC/HA | **No** | No Docker/Kubernetes/Terraform/hosting manifest |
| Operator UI | Broad impressive product with unearned routes/actions | More honest evidence/uncertainty surfaces, still broad | Live/Fire only, read-only integrity label, report-vs-physical separation | **Large truth improvement** | Live browser audit; null-to-zero defect remains |

## Agent 1 assessment

| Dimension | Assessment |
|---|---|
| Architectural judgment | Strong at modelling truth, failure, evidence lifecycle, and geospatial boundaries; too willing to extend a broad platform before the core real source existed |
| Capability improvement | Large internal improvement: persistence, evidence lifecycle, event mechanics, fusion semantics, geo integrity |
| Scientific rigor | Strongest contribution: null calibration, negative-evidence eligibility, non-perimeter geometry, native-pixel gates |
| Truthfulness | Major improvement over baseline, though much capability remained framed as architecture rather than proved product |
| Unnecessary complexity | High: evidence/workflow/outcome/consequence breadth grew while physical acquisition remained absent |
| Test quality | Strong failure-path and adversarial testing; almost entirely synthetic |
| Operational impact | Low-to-moderate; most work inaccessible or unpopulated in production |
| UX impact | Better semantics, but more internal architecture leaked into the interface |
| Theatre removed | Fake probability, fake information gain, fake outcome certainty, perimeter implication, stale behavior |
| Theatre introduced | “Active perception,” “fusion,” and operational lifecycle architecture without real assets/providers/owners |
| Product category change | No; sophisticated fixture-capable prototype became more rigorous software |

## Agent 2 assessment

| Dimension | Assessment |
|---|---|
| Architectural judgment | Correctly prioritized a hard production/test boundary and raw acquisition; still retained the overbroad production monolith |
| Capability improvement | Real ptdata acquisition and provenance foundation; no real thermal capability |
| Scientific rigor | Preserved Agent 1 safeguards and refused to promote WMS/context/parser paths to physical evidence |
| Truthfulness | Excellent relative improvement: killed demo universe, fake personas, fake routes, and synthetic performance claims |
| Unnecessary complexity | Lower than Agent 1, but did not remove hidden unearned service/route composition |
| Test quality | Strong executable reality, restart, browser, fixture-leakage, and acquisition gates; browser tests undercheck visible content truth |
| Operational impact | High integrity impact; low physical/decision impact |
| UX impact | Major route and copy simplification; confirmed null-to-zero physical-context bug escaped QA |
| Theatre removed | Production fixture graph, generated assets, fake identity/work, local watch, default synthetic replay, unearned navigation |
| Theatre introduced | Little new theatre; “Physical Intelligence” and “Earth observed” remain stronger than evidence |
| Product category change | Yes from deceptive simulation to honest read-only report product; no to physical intelligence |

## Which agent was more effective?

**Agent 2**, narrowly, because it changed the delivered product's truth boundary and connected the running system to attributable real external data. Removing fabricated operational state is a larger buyer/safety improvement than adding more internally correct subsystems to a fixture-capable product.

Agent 1 was more effective at deep domain mechanics and scientific safeguards. Agent 2 was more effective at making the artifact honest and reviewable.

## Which agent created the most architecture without corresponding capability?

**Agent 1.** EvidenceNeed/EvidenceRequest, active perception, event corrections, fusion, consequence, outcome, and geo-analysis architecture became substantially richer, but no real thermal acquisition, governed corpus, operator identity, connected asset, or operational workflow existed to exercise most of it.

## Did Agent 2 fix Agent 1's remaining failures?

It fixed the most dangerous truth and product failures:

- shared demo/production runtime;
- fixture import reachability;
- seeded identities and work;
- public actor impersonation;
- generated served assets;
- synthetic replay positioning;
- unearned product routes;
- absence of raw archival/checkpoints for real ptdata.

It did **not** fix the core capability failures:

- no real point thermal source;
- no physical-first fire in production;
- no real identity/fusion/geometry benchmark;
- no authenticated action plane;
- no production database/object store/outbox;
- no pilot, SLOs, or operational validation.

## What each agent got wrong

Agent 1 got sequencing wrong: it optimized the ontology and workflow of a physical-intelligence platform before acquiring physical evidence. Agent 2 got scope reduction only half-right: it hid unearned planes in the UI but left them instantiated and routed in production, and it stopped after a real contextual acquisition foundation rather than completing one thermal truth loop.

Both programs treated software tests as the dominant evidence source because no governed real corpus existed. Both should have made acquisition and benchmark evidence the program's first dependency, not its later release gate.

## What the next engineering agent must learn

1. Finish a vertical truth loop before adding horizontal capability.
2. A parser, registry, or state machine is not a product integration.
3. Unknown must be visible, but it must also be operationally closable.
4. “No fake data” is a minimum safety property, not the differentiated capability.
5. Delete unearned production planes instead of hiding them.
6. Put real corpus metrics and raw lineage in the UI before adding more terminology.
7. End every bounded program in a tested commit/release artifact; an uncommitted filesystem is not a deliverable.
