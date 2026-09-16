---
name: database-migrations
description: Safely change VIGIA PostgreSQL/PostGIS schemas, migrations, indexes, spatial query plans, or migration governance. Use for new/changed migrations, schema versions, PostGIS indexes, query rewrites whose correctness depends on database semantics, or production migration planning. Do not use for ordinary repository work that only reads existing data.
---

# Database / PostGIS Migration Skill

## Required discovery
1. Read `docs/agent/backend.md`, `docs/agent/truth-safety.md`, and `docs/agent/testing.md`.
2. Inspect the current canonical migration head, migration runner, transaction behavior, and schema-version/release contracts.
3. Identify the exact production query/callsite that motivates the change and the existing indexes/constraints it relies on.
4. Check whether the target migration number has already been applied in any persistent environment before naming or renumbering a migration.

## Invariants
- Never rewrite or renumber an already-applied migration in place.
- Keep migration-head and database-schema/release governance fields synchronized when this repository requires both.
- Preserve domain semantics before chasing query-plan speed.
- Do not add an index because it seems theoretically useful; prove the production query can use it and measure the tradeoff.
- For spatial work, distinguish `geometry` and `geography`, indexable expressions, spherical vs spheroidal distance, bbox prefilters, and LIMIT/ordering semantics.
- Do not use `CREATE INDEX CONCURRENTLY` inside a transaction-wrapped migration runner.
- Do not run destructive or production mutations merely to validate a change unless the user explicitly authorizes that environment/action.

## Procedure
1. Reproduce the existing behavior/query against a representative disposable database.
2. Capture the baseline with `EXPLAIN (ANALYZE, BUFFERS)` when performance is the motivation.
3. Implement the smallest migration/query change that addresses the proven issue.
4. If query logic changes, build a differential equivalence harness using the previous implementation as the oracle across relevant origins, filters, radii/limits, boundary cases, ties, and nulls.
5. Measure read improvement plus material write/storage/index-build cost.
6. Run the repository migration path from a clean schema and from the prior migration head.
7. Run targeted tests, then broader integration/intelligence tests when the schema/query is shared.

## Validation
Report exact measured results, not adjectives. Include:
- migration head before/after
- migration apply result
- query plan before/after when relevant
- semantic-equivalence result when logic changed
- index size/write overhead when material
- targeted/integration test results

## Completion report
State:
- schema/query behavior changed
- migration file and canonical head
- production compatibility/rollout constraints
- tests and measurements actually run
- whether production deployment was performed, prepared only, or not run
