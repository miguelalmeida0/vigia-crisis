# Migration convergence compatibility dossier

The canonical integrated DAG is linear:

`001 … 016 → 017 intelligence fabric → 018 intelligence security hardening → 019 release identity/capacity counters → 020 release trust/intelligence generation → 021 intelligence mutation ownership → 022 intelligence convergence`

Agent 1 migrations 001–021 remain byte-for-byte historical and checksum-governed. Agent 2's independently numbered `017-intelligence-convergence.sql` is re-expressed without destructive changes as forward migration `022-intelligence-convergence.sql`.

An installation that previously applied Agent 2's isolated 017 is not reset and its ledger is not falsified. The migration runner recognizes only the exact Agent 2 convergence name and checksum, records the original row in `vigia_schema_migration_lineage_alias`, renames the historical ledger key to `agent2-017-intelligence-convergence`, and then applies canonical Agent 1 migrations 017–021 plus idempotent forward migration 022. Any non-matching 017 still fails closed with `schema_migration_checksum_mismatch:017`.

Clean installation, Agent 1 head-021 upgrade, Agent 2 isolated-017 adoption, checksum drift rejection, idempotency, schema equivalence, and backup/restore are certification gates. The proposed RLS document at `docs/architecture/migration-019-security-compartments.sql.proposed` is not an executable migration and must be renumbered above the active head if later approved.
