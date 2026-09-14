# Crisis Data Foundry

The Crisis Data Foundry governs the existing Raw Data Vault and Forecast Corpus rather than replacing them. Its canonical chain is:

```text
provider object → immutable RawArtifact → contract result → DataProductVersion
→ ontology binding → lineage edge → quality and rights → DataGap
→ bounded reconciliation task → materialized incident slice/package
→ leakage-safe example → split → evaluation → replay receipt
```

## Boundaries

- `packages/domain/src/data-foundry/` contains deterministic products, contracts, bitemporal clocks, lineage, quality gates, gaps, planning, task transitions, invalidation, observation opportunities, rights propagation, progression QA, crosswalk explanations, and forecast packages.
- `apps/api/src/modules/data-foundry/` is the portable file-backed adapter. Atomic JSON is the current durable implementation; the existing authenticated PostGIS boundary remains the production database path when credentials are available.
- `DataFoundryQueryService` is the consumer boundary. It returns products and IDs, never storage paths.
- `scripts/data_foundry.mjs` provides bounded operator commands. It does not leave a worker running.

## Knowledge time

Physical occurrence, observation, provider publication/modification, retrieval, VIGIA availability, canonical ingestion, materialization, label publication, and supersession are separate clocks. Historical features require `availableToVigiaAt <= informationCutoff`. A future label must become available after the issue cutoff. Non-causal WFIGS clocks are rejected rather than repaired by inference.

## Materialization and invalidation

Materialization signatures include upstream fingerprints plus parser, contract, knowledge-time, crosswalk, rights, label-doctrine, and quality-gate versions. A change in any component makes the product stale. `affectedMaterializations()` traverses only descendants of changed inputs; it does not rebuild unrelated incidents.

## FEDS and evidence

FEDS products are ontology-bound as `PhysicalObservationSequence` context with `causalRoot=VIIRS`. They never add an independent physical sensor family and, without a historical publication receipt, remain retrospective-only for corpus features. Foundry material-change events are operational telemetry and never wildfire evidence.

## Persistence and PostGIS

The file-backed runtime uses content identities, atomic replacement, append-style hash-chained events, deterministic replay, bounded task histories, and durable acquisition cursors. PostGIS certification is intentionally blocked until legitimate credentials exist; authentication is not weakened.
