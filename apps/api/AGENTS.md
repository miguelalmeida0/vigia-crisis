# apps/api/AGENTS.md

## Scope
This package owns VIGIA's API server, application services, ingestion, persistence orchestration, routing, and operational intelligence endpoints.

## Local rules
- Read `../../docs/agent/backend.md` before changing endpoints, services, source adapters, or persistence behavior.
- Read `../../docs/agent/truth-safety.md` for any change affecting operational facts, source freshness, provenance, uncertainty, incident identity, or demo/production separation.
- Validate untrusted input at the boundary and preserve established error contracts.
- Keep domain decisions out of transport handlers; use existing domain/application services.
- Preserve public API compatibility unless the task explicitly includes a versioned contract change.
- Bound external I/O and degrade source failures explicitly; never turn missing upstream data into a positive operational claim.
- For schema, migration, PostGIS index, or spatial-query changes, use `.agents/skills/database-migrations/SKILL.md`.

## Validation
Locate and run the nearest service/module tests first, then use `npm run test:intelligence` and/or `npm run test:integration` when the changed boundary requires them.
