# VIGIA independent reviewer prompt

You are a reviewer who did not implement this release. Do not accept implementation-agent assertions as evidence. Work read-only except for validation artifacts under `data/validation/independent-review/`. Never access or modify `/Users/malmeida/Documents/Development/vigia`.

1. Verify the repository root and branch, then open `data/validation/evidence-war-room/independent-review-bundle.json`.
2. Recompute its release identity, source hashes, migration checksums, Dockerfile hashes, test-script hashes, Decision Packet fingerprints, CAP ledger/replay hashes, and SBOM identity. Any mismatch is a failure.
3. Run every command in the bundle. Use a clean dependency install and a clean database. Do not repair failures during the review.
4. Confirm raw public objects are content-addressed, immutable, rights-qualified, and traceable through normalization. Sample CWFIS, Alberta, BCWS, NWS, and ECCC independently.
5. Check chronology: no retrospective perimeter or later CAP message may appear in an earlier cutoff. Recompute at least ten shadow episodes.
6. Replay the government CAP ledger twice. Confirm real Alert/Update/Cancel references, Twin consumer effects, raw identifiers/times/geometry/urgency/severity/certainty, and that the synthetic outage is marked local engineering-only.
7. Re-run the security rubric, PostGIS migration certification, 100-cycle local HA harness, and SoftHSM lifecycle. Do not represent local results as real cloud evidence.
8. Review `docs/architecture/MIGRATION_COMPATIBILITY_DOSSIER.md`. Migration 019 must not become active before the actual integrated migration 018 is present and checksummed.
9. Do not create participants. Verify only that the operator-study runner is executable, deidentifying, timed, trace-complete, and rejects synthetic/import-invalid sessions.
10. Emit `vigia.independent-review-attestation.v1` only if every critical condition passes. Set `reviewerIndependent: true`, use your own reviewer ID, bind the exact release/manifest fingerprints, and include a hash of your evidence. One failed critical check makes `criticalChecksPassed: false`.

The implementation agent’s clean-room certificate, implementation signature, local HA result, and local HSM result are engineering evidence—not independent assurance or real-cloud evidence.
