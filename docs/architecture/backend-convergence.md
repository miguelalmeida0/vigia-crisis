# Backend Convergence Architecture

## Status

The file-backed engineering path and the isolated Postgres/PostGIS path are certified. The database certificate uses the repository-declared PostgreSQL 17/PostGIS 3.5 image, generated test-only credentials, a loopback-only ephemeral port, and a uniquely named disposable volume. Migration, transaction, rollback, concurrency, semantic equivalence, restart, backup, restore, projection rebuild, and replay checks pass without touching an operator database.

## Semantic persistence

Migration `017-intelligence-convergence.sql` adds canonical events, semantic objects, lineage edges, projection state and rows, Decision Packets, receipts, prospective snapshots, Decision Outcomes, and Information Value outcomes. Semantic identities are unique, lineage is foreign-key constrained, archive sequences are unique, and Decision Outcomes reference retained Decision Packets.

`FileIntelligenceRepository` and `PostgresIntelligenceRepository` expose the same event, object, lineage, packet, receipt, archive, outcome, pagination, and consistency-token ports. File transactions use a repository-root lock and atomic replacement. Postgres transactions use serializable isolation and bounded serialization retries. Dedicated Postgres ledger writes now occur in the same transaction as their semantic object; a failed foreign key or dedicated-table write cannot leave a partial trusted object.

## Decision Priority Vector

Acquisition ordering is a versioned lexicographic vector, not a scalar score. The order is consequence class, deadline, critical decisions, material hypotheses, contracts, independent causal families, horizons, scientific gates, source availability, rights readiness, expected quality, latency in milliseconds, cost units, bytes, retries, and candidate identity as the final tie-break only. Causal duplicates contribute zero independent-family value.

## Doctrine and reasoning

The wildfire doctrine library is version `2.0.0` and compiles 18 decision definitions against explicit policy and capability registries. The compiler rejects duplicate IDs, unknown policies, unknown capabilities, dependency cycles, and consequential decisions without authority. Only one decision is consequential, and it remains behind `PROPOSE_OFFICIAL_WARNING` authority.

## Indexed projections

Fourteen canonical object sets are materialized into a compact immutable projection. Full materialization reads retained source products; single-incident invalidation reads only the incident packet, a compact progression projection summary, and its future-label product. The complete 16.7 MB progression remains retained. The 308-byte write-through summary contains only projection predicates and source binding, cutting single-incident p95 without dropping source history or explanations.

Every projection exposes a version, consistency token, replay reference, knowledge-time cutoff, source state, partial/degraded indicators, rights restrictions, and stable cursor. Cursors are bound to the projection version and are rejected after mutation.

## Query Service V2

The query service exposes incident-scoped coherent snapshots and indexed object sets. Route policy requires authentication, `read:incident_command`, and incident scope; global object-set access additionally requires wildcard incident scope. Repository query count is instrumented and the common incident snapshot performs one repository query. Rights states `BLOCKED`, `DENIED`, and `REVOKED` are excluded even when no explicit capability is attached. A result beyond the 500-object incident bound is marked partial and degraded, never complete.

## Operational learning

Prospective capture supports `ONCE`, `BOUNDED_DURATION`, `INCIDENT_WATCH`, and `REGIONAL_SHADOW`. Manifests bind providers, products, regions, incidents, cadence, retention, and explicit rights. Snapshots form an immutable hash chain and distinguish provider publication time from VIGIA receipt time.

Decision Memory stores what was known, unknown, chosen, and learned later without punishing a decision with hindsight. Information Value stores predicted and realized decision unlocks, hypothesis discrimination, debt closure, latency, bytes, and source success. Calibration is descriptive and stratified; it cannot mutate doctrine automatically.

## Certification boundary

The 10,000-incident / 1,000,000-event scale fixture is engineering-only and prohibited as operational or scientific evidence. It was executed against isolated PostGIS with 100,000 Evidence objects, 100,000 Data Products, 110,000 indexed projection rows, 100,000 lineage edges, and 30,000 Decision Memory/Information Value rows. Database ingestion, size, indexed queries, memory, backup, restore, RPO, RTO, projection recovery, and replay verification are measured in the retained certification artifacts.
