# Backend / API Guide

Use this guide for API endpoints, application services, ingestion, persistence orchestration, source adapters, routing, and intelligence services.

## Boundaries
- Validate untrusted input at the API/source boundary and preserve established error contracts.
- Keep transport handlers thin; domain decisions belong in existing services/policies.
- Treat upstream feeds, remote APIs, uploaded documents, route providers, and model output as untrusted input.
- Preserve public/API compatibility unless the requested scope explicitly includes a contract change.
- Reuse existing source, persistence, timeout, retry, and provenance abstractions instead of creating parallel paths.

## Operational behavior
- Source failure must degrade explicitly: retain last-known-good data only where the existing contract permits it and mark freshness/state accurately.
- Bound external I/O with timeouts and cancellation where appropriate. One failing source must not block unrelated core behavior.
- Prefer deterministic code, SQL, and PostGIS for facts/calculations. Models may phrase or retrieve grounded data but are not a source of operational truth.
- Perform spatial filtering/aggregation server-side when it avoids large client payloads.
- Never translate absence of ingested data into a positive operational claim.

## Persistence and schemas
For any schema, migration, index, or spatial-query change, use `.agents/skills/database-migrations/SKILL.md` before editing.

## Validation
- Locate the nearest existing tests before implementing.
- Run targeted service/module tests first.
- Run `npm run test:intelligence` when intelligence behavior changes.
- Run `npm run test:integration` when API/persistence/source boundaries change.
- Run broader certification only when the change actually crosses those boundaries.

Read `docs/agent/truth-safety.md` for source/provenance, uncertainty, production/demo separation, and fail-closed invariants.
