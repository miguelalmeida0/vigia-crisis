# VIGIA converged migration inventory

Canonical database contract: `vigia-postgis-022`. Canonical migration head: `022`.

| Version | Name | Governed SHA-256 |
|---|---|---|
| 001 | physical-truth | `sha256:dcbe173ce75accb05c9efe6e8258481255d1ef6bfe45b9e9ba9cdc1f33df9f6a` |
| 002 | operational-work | `sha256:46c779506692f86f1b59ae3033c00e328f9c7f87e61442cd71686fc97bf4f2ff` |
| 003 | category-reset | `sha256:4a5bb8735ce14a403b7e7da772a751e0ca77de9bad169c24b95ee4b9a8d6f68a` |
| 004 | flagship-productization | `sha256:2da0d877e9b61f3a1dededf69cbf1a447cdc8f9e5508be6bd4f6f78b9a1d2187` |
| 005 | prevention-review-lab | `sha256:742f931ed65503d09d98c7afed9819dbd16664ae5bd0d6cac0645dda1ec74db2` |
| 006 | detection-proof | `sha256:ed2ff6e00a9db73bcf3ca24ae5368efaa22948979f82a2536ece195da952a257` |
| 007 | prospective-causality | `sha256:1da09ed38ce2d2e4eb59e27c513074f3b1474605622b9eb62d262a8d7d336b77` |
| 008 | live-operations | `sha256:5975d364dfc19400670242a9c1236c731a8a4dfc989f56738fd894931006a354` |
| 009 | operations-recovery | `sha256:a1389f4bd5e24de20f2064c0027dfebf52643cb406fa867b41503829a52f6f1b` |
| 010 | autonomous-evidence-operations | `sha256:202b7fe1cda2e8dd35e88b420243114040f635e1abbfb4e39fdd41949aac0c08` |
| 011 | physical-truth-autopilot | `sha256:3a0eeee6bde0a9e2cb452be156192b73145715f3bb486974be141951cd59d82b` |
| 012 | decision-ledger-autopilot | `sha256:d2a3e67486288b06bbd8e89a6f18cac5ae67a3fc3e5229c7b0e5f54c97ec94e5` |
| 013 | command-survival | `sha256:dcfbb0a3ecd64a07b35b5d4258457bb6578b156184e1d062bccc36b99237a661` |
| 014 | command-evidence-envelope | `sha256:9a9688568ccf555908d6220a010263d1a606d564c7dcc941e51603b7d132217a` |
| 015 | partial-incident-import | `sha256:7077b3ac2e017c848bd2dc21e8e1bacf43da37009fc6a88ec3d521e3d4d6c335` |
| 016 | security-identity-boundaries | `sha256:1862a4c577638f9ed43a1bb025474fe9bd9fdfb5e03e1fdcb35fcba51a9172e5` |
| 017 | intelligence-fabric | `sha256:11027390108634dfe025316b6fa2e883c781603b0ff414d747792f5f1e430a78` |
| 018 | intelligence-security-hardening | `sha256:a3f21d237024c474f75ab53a03eb1a01deea131e6abe9af97bbedc864ce356f3` |
| 019 | release-identity-capacity-counters | `sha256:7cbf733eca57830c1b3dfff47ed9f4b8c9ca6cb4b390978013e585568f53f2cf` |
| 020 | release-trust-intelligence-generation | `sha256:32a0c99fb48aeb05978281a6c9d44a36dbd84ef2c03354a8247acf2878172755` |
| 021 | intelligence-mutation-ownership | `sha256:191ccbb22b5c2844bf60fc008399574677e393c0fa3eace58ad084ba11fffd37` |
| 022 | intelligence-convergence | `sha256:2b09d1af75326b807bf251f4d1c4469165fcba17d700453390f1088ef28f627c` |

## Upgrade rules

1. Agent 1 migrations 001–021 are immutable history.
2. A clean database applies 001–022 under one advisory-locked transaction and checksum ledger.
3. Agent 1 head 021 applies only 022.
4. An isolated Agent 2 database whose 017 row exactly matches the historical Agent 2 convergence checksum is preserved as `agent2-017-intelligence-convergence`, with its original name, checksum and applied time copied to `vigia_schema_migration_lineage_alias`; canonical 017–022 then apply.
5. Any other checksum/name collision fails closed. There is no destructive reset or DROP/recreate shortcut.
6. Schema equivalence is determined from normalized PostgreSQL catalogs after both clean and upgrade paths, not from migration row counts alone.

## Live certification result

`npm run db:certify-intelligence` created disposable loopback-only PostGIS databases and passed all three histories:

- clean 001–022 install;
- Agent 1 001–021 followed by only 022, with prior checksums and a seeded intelligence snapshot preserved;
- isolated Agent 2 convergence recorded as 017, adopted as `agent2-017-intelligence-convergence`, followed by canonical 017–022.

All three produced `postgres-schema-definition:sha256:eda45247c494b5f10deaa610711fa15602cb7a90bd0589053ac0df5bd2802734`. The certification report is `data/validation/backend-convergence/postgis-certification.json` and also proves migration idempotency, transactional rollback boundaries, semantic file/Postgres equivalence, restart reconstruction, spatial persistence/indexes, and backup/restore with RPO 0.
