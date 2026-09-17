# VIGIA Phase A backend convergence report

## Provenance and scope

- Integration worktree: `/Users/malmeida/Documents/ChatGPT/VIGIA Integration`
- Branch: `integration/vigia-world-class-convergence`
- Agent 1 base: `950910aa46772a6514da8219b7f7bdfe63bca506`
- Agent 2 merge head: `84bd727b88d3d3b218d78117248d8fc5c170164d`
- Merge remains intentionally open. No commit, push, branch switch, reset, stash, clean, rebase, cherry-pick, or merge abort was performed.
- Phase B visual implementation was not started.

## Canonical architecture

The integrated write/projection path is:

`governed providers / CAP / FIRMS / FieldNet → trust, proof and source registry → append-only Event Fabric → canonical operational events → Operational Twin → Evidence Contracts, graph and Debt → Decision Foundry and policy → bounded actions → postcondition receipts and replay`

Agent 2 owns Event Fabric, Operational Twin, source health, Evidence Contracts, Decision Foundry, Proof Plane, scientific truth and governed replay semantics. Agent 1 owns browser/session reliability, FieldNet reliability and capacity invariants, incident-command survival, deployment, recovery and migration history through 021. Agent 1 operational events enter the Event Fabric through a SYSTEM-class compatibility adapter that is explicitly non-witnessing and cannot create an independent evidence family.

The immutable Agent 1 intelligence snapshot ledger and Agent 2 semantic object repository now have distinct class names and roles. They share one PostgreSQL schema but do not claim the same authority.

Workspace-path portability was also certified. Filesystem paths derived from `import.meta.url` now use `fileURLToPath`, so Python workers, physical forecast subprocesses, production gates, Operator tests and the PostGIS certifier operate correctly when the repository path contains spaces. The sealed browser-certification runtime now pins `greenlet==3.5.4` and excludes installer-specific wheel `RECORD` manifests from its dependency digest; every copied executable/runtime file remains individually hash-locked, and the same digest was reproduced from both frozen Agent 1 and integration virtualenv locations.

## Conflict classification

| Conflict | Classification | Resolution |
|---|---|---|
| `create-services.mjs` | `SEMANTIC_MERGE_REQUIRED` | Preserved verified release identity, mutation leases and reliability callbacks; added semantic repository, Event Fabric journal, Operational Twin and query service. |
| `register-routes.mjs` | `SEMANTIC_MERGE_REQUIRED` | Registered Agent 1 intelligence, Agent 2 Decision Foundry and the ten canonical operator projections. |
| `env.mjs` | `SEMANTIC_MERGE_REQUIRED` | Kept pinned provider endpoint validation and added redacted Agent 2 provider credential fields. |
| `central-fieldnet-service.mjs` | `SEMANTIC_MERGE_REQUIRED` | Agent 1 limits/reserve/fairness/restart/accounting remain authoritative; Proof Plane authorization is layered after signed envelope/body verification. |
| `postgres-intelligence-repository.mjs` | `ADAPTER_REQUIRED` | Preserved Agent 1 snapshot ledger; renamed Agent 2 semantic store to `PostgresOperationalIntelligenceRepository`. |
| `sensor-ingest-service.mjs` | `SEMANTIC_MERGE_REQUIRED` | Retained signed registered-device-only ingestion, scope/geometry bounds and mutation leases; added Proof Plane decision binding. |
| `postgres-migration-runner.mjs` | `MIGRATION_RENUMBER_REQUIRED` | Preserved 001–021, added 022 and an audited Agent 2 isolated-017 lineage-alias adoption path. |
| `measurement-debt-api.test.mjs` | `SEMANTIC_MERGE_REQUIRED` | Retained local proxy boundary and explicit 424 unavailable-evidence contract. |
| `pilot-safety-security-boundaries.test.mjs` | `SEMANTIC_MERGE_REQUIRED` | Preserved security assertions and certified the converged 202-route registry. |
| `release-identity-pinning.test.mjs` | `AGENT1_AUTHORITATIVE` | Kept immutable full release identity and removed obsolete 017/10.4 expectations. |
| Five `data/validation/release/*.json` conflicts | `GENERATED_ARTIFACT_REBUILD` | Never hand-merged; regenerated from converged source. |
| `infra/Dockerfile.api` | `AGENT1_AUTHORITATIVE` | Kept digest pin, release-statement verification, certification data and non-root runtime preparation. |
| `release-contract.mjs` | `SEMANTIC_MERGE_REQUIRED` | One contract with schema/head 022 and Agent 1 ontology/rule-set bindings. |
| `build_release_manifest.mjs` | `AGENT1_AUTHORITATIVE` | Kept no-follow atomic evidence handling, deployment-data classification and operator-controlled explicit staging. |

## Safety and honesty boundaries

- Scientific gate remains `AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED`.
- Precise blocker remains `TIME_ACCUMULATION_REQUIRED`.
- Official 1h labels remain `0`; official 3h labels remain `0`.
- Sensor-derived progression does not satisfy the official gate.
- Missing, blocked, degraded and unavailable values remain typed states; they are never coerced to zero.
- Consequential actions remain fail-closed. Proof Plane runtime roots are reported unavailable when not configured; session transport authentication is not misrepresented as cryptographic Proof Plane authority.

## Verification record

- Repository-wide suite: 945 tests, 937 passed, 0 failed, 8 explicit skips. Six skips require the governed Agent 2 retained runtime corpus, one requires the retained HRRR acquisition, and one requires an externally supplied certification PostGIS URL; none was converted into a false pass or copied from a stale source worktree.
- Focused gates passed: Event Fabric 7/7; Proof Plane 14/14; Reality Network 12/12; backend convergence 25 passed/0 failed/1 external-PostGIS skip; Data Foundry 17 passed/0 failed/1 retained-HRRR skip; Control Plane 16/16; intelligence security 9/9; Decision Foundry 14 passed/0 failed/6 governed-runtime skips.
- Architecture check passed: 1,027 files inspected and 919 runtime/test modules syntactically valid, acyclic and within declared budgets.
- Live disposable PostGIS certification passed at head 022. Clean install, Agent 1 021→022, and isolated Agent 2 017 adoption produced the identical normalized schema fingerprint `postgres-schema-definition:sha256:eda45247c494b5f10deaa610711fa15602cb7a90bd0589053ac0df5bd2802734`. Agent 1 seed data and all 001–021 checksums survived. Backup/restore had RPO 0, zero lost records, idempotent restored migration head 022, rebuilt projections and verified replay.
- Canonical Operator static verification passed, including build identity, syntax, asset integrity, admission, proxy, truth, intelligence and browser contracts. Production smoke passed before and after restart with no synthetic observations or demo identities.
- Authoritative truth replay verification passed. Scientific promotion remains correctly blocked: the retained gate has 0 official 1h labels, 0 official 3h labels and `TIME_ACCUMULATION_REQUIRED`. Recomputing the gate from this clean integration checkout is unavailable until the governed truth-network runtime state is transferred or reconstructed.
- The external full deployment/crash drill was not claimed: it requires an approved release-statement hash, approved PostGIS image digest, and a governed command-survival controlled-exercise proof. Local deployment startup smoke and disposable PostGIS recovery certification passed independently.
- `git diff --check`, cached diff check, release-governance tests, migration checksum governance, route security and the canonical ten-screen API contract passed. No baseline waiver remains.
