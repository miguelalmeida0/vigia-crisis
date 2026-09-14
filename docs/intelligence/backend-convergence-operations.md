# Backend Convergence Operations

## Primary commands

```bash
npm run db:certify-intelligence
npm run test:backend-convergence
npm run benchmark:backend-convergence
npm run benchmark:backend-postgis
npm run demo:backend-convergence
npm run demo:prospective-knowledge-time
npm run report:backend-convergence
```

The database command either uses `VIGIA_INTELLIGENCE_CERT_DATABASE_URL` or creates an isolated `postgis/postgis:17-3.5` container with generated credentials, a loopback-only ephemeral port, and a unique certification volume. It does not change the operator database. Owned containers and volumes are removed after the run. `--allow-blocked` records environmental inability without converting it into a pass.

## Certification interpretation

- `PASS`: migrations, PostGIS, spatial types/indexes, transactions, injected rollback boundaries, concurrency, semantic identities, file/database equivalence, lineage, packet/receipt/archive/outcome persistence, restart, dump/restore, RPO, RTO, projection rebuild, and replay verification all passed.
- `BLOCKED_DOCKER_UNAVAILABLE`: the disposable database could not be started. Database equivalence, backup, and restore remain unproved.
- `FAIL`: the database ran and one or more checks failed. Treat this as a release blocker.

The current retained result is `PASS` on PostgreSQL 17/PostGIS 3.5. The second migration run applies nothing and skips governed migrations 001–017 by matching checksums.

## Projection operation

Run a full materialization after importing or rebuilding source artifacts. Thereafter, compiler and reconciliation paths invalidate only the affected incident. Missing progression summaries fail closed; operators should regenerate the progression factory rather than substituting the full artifact on a hot query path.

Projection tokens are snapshot identities. A client must keep the token returned with a page and must restart pagination when a token or cursor mismatch is returned. Never combine incident, evidence, actions, or Decision Packet data from different tokens.

## Prospective archive operation

Prospective acquisition is bounded by a manifest. Do not run an uncontrolled daemon in certification or test. Preserve raw bytes before writing a snapshot. Record `providerPublishedAt` only when the product supplies that semantic; retrieval time belongs in `vigiaReceivedAt` and cannot substitute for publication time.

The retained US demonstration uses WFIGS and GOES, two snapshots, 3,424,537 raw bytes, and zero consequential actions. Canada has an implemented CWFIS shadow adapter but cannot create a manifest until an authorized representative records licence/end-user-condition acceptance. Portugal has no active adapter because rights and provider-publication semantics are not established.

## Recovery

File adapter recovery reopens the atomic repository and verifies packet/object hashes. Database recovery uses `pg_dump`, creates a separate restore database, restores the dump, reruns the governed migration check, rebuilds a projection, and verifies events, Decision Packets, receipts, lineage, prospective snapshots, Decision Memory, Information Value, and replay. The retained certificate reports zero lost records plus measured RTO, projection-recovery time, and replay-verification time.

## Evidence locations

- `data/validation/backend-convergence/backend-convergence-report.json`
- `data/validation/backend-convergence/postgis-certification.json`
- `data/validation/backend-convergence/postgis-scale-benchmark.json`
- `data/validation/backend-convergence/second-region-access.json`
- `data/validation/decision-foundry/benchmarks/backend-convergence.json`
- `data/validation/decision-foundry/demos/backend-convergence.json`
- `data/validation/decision-foundry/demos/prospective-knowledge-time.json`
- `data/validation/decision-foundry/reports/operational-learning.json`
