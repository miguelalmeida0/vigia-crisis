# Portfolio case study review

## Portfolio verdict

**PARTIALLY flagship-worthy.** The current artifact is credible evidence of senior systems judgment around truth boundaries, geospatial integrity, failure semantics, provenance foundations, and hostile self-audit. It is not credible evidence that the engineer delivered operational physical fire intelligence, sensor fusion, prevention detection, or measured emergency outcomes.

## Replacement one-sentence thesis

> VIGIA is an adversarially truth-preserving wildfire evidence system that separates public reports, physical observations, provenance, uncertainty, and acquisition work—and makes the boundary of its own knowledge explicit.

This thesis can carry the project today. “AI-powered physical intelligence for wildfire operations” cannot.

## Strongest proof

### 1. Reality cutover as an executable safety boundary

The strongest single systems story is the removal of a shared fixture/production universe and the creation of a gate that traverses the production import graph, rejects synthetic observations, scans the served root, eliminates seeded identities, and refuses the legacy fixture switch.

This is more credible than a polished demo because it shows the engineer understood that synthetic operational truth is a safety defect, not a disclaimer problem.

### 2. Native-pixel geospatial integrity under adversarial metadata

The highest-quality technical proof is the GeoIntegrity path: managed raster stack, native CRS/geotransform, per-band binding, footprint intersection, reverse projection, persisted proof, and an adversarial case where plausible catalogue metadata points to Portugal while the raster pixels are elsewhere.

This is unusual Staff+/Principal evidence because it attacks a subtle class of geospatial falsehood rather than merely parsing a GeoTIFF.

### 3. Truth semantics under uncertainty

Report freshness is not physical freshness. Raster context is not point evidence. Repeated sources are not independent witnesses. Missing coverage is not negative evidence. A thermal hull is not a perimeter. An unapproved score is not a probability. Unknown information gain remains unmeasured.

These contracts demonstrate domain maturity even though the operational data is absent.

### 4. Failure-path engineering

The repository contains meaningful tests for duplicate/out-of-order acquisition, failed checkpoint persistence, persistence rollback, synthetic injection, fake actor headers, late event arrival, merge/split/reject corrections, stale behavior, negative evidence, and lying raster metadata. That is better proof than raw test volume.

### 5. Real contextual acquisition with raw evidence

The audited runtime fetched live ptdata responses, created eight source checkpoints, archived content-addressed raw bytes, and exposed explicit configuration gaps. This establishes real external-system interaction, though not the core physical signal.

## Weakest claims

- `Physical Intelligence` — the audited runtime had 0 physical observations.
- `Sensor fusion` — current implementation is dependency-aware aggregation/evidence ledger, with all live events report-only.
- `Active perception` — current production has no connected asset, real pass scheduler, information value, reliability, or cost.
- `Living fire` / fire evolution — no real thermal series is present.
- `Prevention detection` — no real reviewed Portuguese finding; route correctly hidden.
- `Operational` — one local Node process, local JSON/files, no operator identity, no deployment topology, no pilot.
- `Validated` — software mechanics are synthetically verified; operational performance is unmeasured.
- `Immutable provenance` — local content-addressed files are not object-locked, malformed bodies are not archived, and report observations drop the exact raw-product link.

## Metrics worth showing now

Show only metrics with a precise contract:

- 140 production modules traversed; 0 test/fixture imports reachable;
- 0 synthetic production observations and 0 demo identities at the audited gate;
- 8 live ptdata acquisition checkpoints with exact source/product/cursor fields;
- raw file SHA-256 verification against content;
- 0 point thermal observations / 0 physically current events as an example of honest degraded state;
- geospatial adversarial cases rejected and scientific runtime dependencies verified;
- restart preservation for the exact software state tested;
- no probability emitted without an approved calibration record.

Frame 122/122 tests as software regression coverage, not as a product metric.

## Metrics that must never appear

- detection precision, recall, false-alarm rate, missed-fire rate, or lead time without an independent real corpus;
- association accuracy or stable-event rate from synthetic fixtures;
- “80% physically current” or similar fixture/replay population metrics;
- source availability/SLO from one successful runtime snapshot;
- probability/confidence normalized across sensors without scoped calibration;
- information gain, reliability, latency distribution, or cost when values are generated/unknown;
- intervention risk reduction or outcome causality without independent re-observation;
- test count presented adjacent to wildfire-performance claims;
- number of providers when most are context, catalogue, parsers, or unconfigured.

## Strongest screenshots

### Fire workspace — strongest current truth screenshot

![Fire workspace showing current reports, zero physically observed events, and confirmation gaps](/Users/malmeida/Documents/Development/vigia/docs/ceo-review/screenshots/03-fire-workspace.png)

Use this because it proves restraint: current reports are visible, physical observation is `None`, behavior is `Unknown`, and the product exposes the gap rather than filling it with synthetic data.

### Source health — strongest systems screenshot

![Source health drawer with per-source state and timestamps](/Users/malmeida/Documents/Development/vigia/docs/ceo-review/screenshots/04-source-health.png)

Use this only with a caption explaining the limitation: these are point-in-time source states, not source SLOs, and catalogue/raster availability is not point-level physical evidence.

## Screenshots that damage credibility

- Any earlier screenshot containing PREVENT, OUTCOMES, fake personas, seeded work, synthetic fires, generated imagery, or fake field state. Remove them permanently from the case study.
- The current Sintra detail screenshot without annotation: it shows `0°C / 0% / 0 km/h` even though all three API fields are null.
- A map-only hero dominated by report markers and the “Physical Intelligence” brand; it visually promises a living-fire product the data does not support.
- Narrow-viewport screenshots in which the queue/detail sheets obscure the map while exposing only headers/disabled controls. They demonstrate density, not responsive operational utility.
- Prevention/consequence/outcome views populated from fixtures or screenshots of unshipped routes.

## Best recruiter demo flow

Keep the demo under eight minutes and make it adversarial:

1. **Start production with the fixture switch.** Show it fail closed with `ProductionIntegrityViolation`.
2. **Boot clean production.** Show the reality gate and 0 synthetic observations/demo identities.
3. **Inspect one real public report.** Show separate report/physical clocks, report-only knowledge, no probability, no-path evidence need, and exact source context.
4. **Trace a real ptdata context record.** Walk UI -> event/context -> raw source product -> checksum-addressed file -> checkpoint. Explicitly disclose the missing raw link on the report observation.
5. **Run the lying-catalogue GeoTIFF test.** Explain why correct-looking STAC metadata must not authorize pixels georeferenced elsewhere.
6. **Show a synthetic regression scenario only as software mechanics.** Demonstrate late arrival, stable event alias, contradiction/dependency handling, geometry-not-perimeter, and stale behavior. Put `TEST — NOT OPERATIONAL EVIDENCE` on screen.
7. **End on readiness 503 and the release gates.** Explain exactly what a real FIRMS product and governed corpus must prove next.

This flow demonstrates judgment, not theatre.

## Actual systems depth

**Strong:** production/test boundary, explicit universes, event-time concepts, persistence rollback, raw/checkpoint model, integrity policies, failure injection, route authorization, provenance contracts, restart tests.

**Moderate:** acquisition scheduling, event identity, workflow state machines, source health, corrections, alert mechanics. These are single-process/local and not operationally exercised.

**Weak:** distributed operations, HA, transactional database, object lock, scheduler leases, outbox, observability, deployment, tenant isolation, DR.

## Actual ML and geospatial depth

### ML depth

Low. There is no trained model, governed dataset, model card, feature evaluation, calibration campaign, held-out benchmark, drift monitoring, or production inference performance. The project should not be presented as ML-heavy.

### Geospatial/scientific depth

Moderate-to-strong in integrity mechanics: CRS/geotransform binding, footprints, native bands, SCL/cloud concepts, co-registration gates, pixel support, and abstention. Weak in demonstrated scientific outcome: 0 live proofs, no real reviewed prevention polygon, no geometry error benchmark, no real sensor series.

## Actual validation depth

Strong software verification, negligible operational validation.

- Software: 122 passing tests, architecture/import checks, browser QA, production smoke, failure paths.
- Real integration: live ptdata raw acquisition and public-report/runtime inspection.
- Operational wildfire performance: `UNMEASURED`.
- Independent external proof: absent.

## What differentiates this from an API dashboard today

The current end-user experience is still mostly an API dashboard. The differentiating engineering beneath it is:

- executable no-fiction production boundary;
- explicit report-versus-physical knowledge model;
- content-addressed source archive/checkpoint foundation;
- dependency/negative-evidence/ambiguity semantics;
- geospatial native-pixel integrity and abstention;
- durable evidence-gap states.

Those are real but not yet packaged into a differentiated buyer outcome. Without a physical source and benchmark, a sophisticated buyer could reproduce much of the visible dashboard from the same public APIs.

## What would make a Staff+/Principal committee care

One result would change the evaluation decisively:

> A real VIIRS/MTG product is automatically archived, creates a physical-first event, survives replay/restart, associates a later public report under explicit ambiguity rules, displays evolving sensor support, and publishes held-out identity/lead-time metrics from a governed corpus.

Add one authenticated partner exercise that turns an unknown into new evidence, and the project becomes a rare end-to-end systems case rather than an unusually disciplined prototype.

## Case-study structure to publish

1. The safety failure: a fixture-capable emergency product can look operational.
2. The reality invariant: production may show nothing, but may never show fabricated truth.
3. The cutover: separate universes, real raw acquisition, explicit readiness failure.
4. The scientific boundary: native pixels, support-not-perimeter, null calibration, negative coverage.
5. The current result: honest public-report/evidence-gap console, not physical intelligence.
6. The missing proof: real thermal truth loop and governed corpus.
7. The next release gate: one exact end-to-end result, with no roadmap theatre.
