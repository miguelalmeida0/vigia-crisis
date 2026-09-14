# Agent 1 integration-convergence dossier

Status: prepared, not merged. This branch remains at governed migration head `017`.

## Migration ownership

- Agent 1 owns migration `018`; this branch does not create or register another `018`.
- Security compartment RLS is staged as the executable proposal `docs/architecture/migration-019-security-compartments.sql.proposed`.
- After Agent 1 integration, migration `018` must be imported unchanged, checksummed, and followed by reviewed migration `019`.
- Migration `019` must refuse activation while any canonical row lacks a mandatory compartment marking. It must not silently grandfather unmarked data.
- The merged migration test must prove a single linear DAG, head `019`, idempotent re-execution, backup/restore, and semantic repository equivalence.

## API compatibility

The backend-owned measurement-debt endpoints now have a formal fail-closed contract:

- authoritative artifacts present: HTTP 200 with their original schema;
- authoritative artifacts absent: HTTP 424, schema `vigia.validation-evidence-unavailable.v1`;
- no empty success, generated substitute, or fixture is returned as evidence.

Agent 1 must preserve those response states in the console. HTTP 424 is an evidence-unavailable state, not a generic backend crash.

## Merge acceptance test

1. Supply an Agent 1 compatibility manifest containing its commit, migration `018` checksum, expected API schemas, and frontend build identity.
2. Register reviewed migration `019` only after the marking backfill and RLS application-role test pass.
3. Run `npm test`, `npm run db:certify-intelligence`, `npm run test:worldclass`, and `npm run report:sub-75`.
4. Require zero backend-owned failures, no migration checksum drift, no schema fork, and no frontend source change attributed to this stream.

No automatic merge, branch switch, reset, clean, stash, or sibling-worktree access is part of this dossier.
