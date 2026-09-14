# VIGIA runtime-state migration report

No Agent 1 or Agent 2 runtime archive was copied into the integration worktree. Source-controlled registries, schemas, tests and doctrine were merged; mutable evidence remains outside Git.

| Class | Examples | Treatment |
|---|---|---|
| Source-controlled required state | provider registries, ontology, contracts, migrations, test fixtures | Merge and certify with source. |
| Generated runtime evidence | provider cursors, source health, canonical event journals, campaign state, raw vault, projections | Transfer only as an authorized encrypted bundle with checksums and rights approval. Never stage. |
| Reconstructable state | Operational Twin, indexed object sets, projections, caches | Restore event/object authority first; rebuild and compare fingerprints. A projection alone is not authority. |
| External/local-only state | credentials, tokens, Proof Plane private keys, KMS material, browser cookies, local databases | Re-provision at destination. Never copy through Git or the runtime bundle. |

The resumable Agent 2 campaign `authoritative-truth-20260825153724` remains paused until the complete runtime/raw set, rights decision and state fingerprint validate. A partial import must start a new campaign identity.

Clean-checkout certification deliberately did not copy Agent 2's 1.3 GB local runtime tree. Retained Decision Foundry integration cases therefore report six explicit skips, and the retained HRRR decode reports one explicit skip. The indexed object-set convergence test was changed to reconstruct a bounded deterministic temporary projection instead of depending on stale local state. Agent 1's held-out evaluation-cohort definition is source-controlled governance metadata, not runtime evidence; it was preserved verbatim with SHA-256 `8f622af1af1fa7bc1cc93dbd1575a8d9ddb852a24676e4d9741fb637cae5e229`.

Restart/recovery was proved in three independent ways: append-only journal and FieldNet restart tests; live PostGIS backup/restore with RPO 0, no lost records and replay/projection verification; and production smoke before/after process restart. The broader signed-image deployment/crash drill remains an external-release procedure because its approved digests and controlled-exercise proof are intentionally not reconstructed or imported.

Recovery order is: stop writers → verify encrypted bundle and path safety → restore governed PostgreSQL backup → migrate to 022 → restore append-only event/object state → re-provision secrets and trust roots → rebuild projections → compare counts, hashes, replay and receipts → run fresh provider health checks → enable bounded polling → resume a campaign only after all gates pass. Rollback restores both the pre-import file-state backup and matching database backup; partial state is never merged by hand.
