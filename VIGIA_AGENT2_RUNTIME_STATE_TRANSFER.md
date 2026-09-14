# VIGIA Agent 2 runtime-state transfer plan

Runtime state is operational data, not source code. It must not be staged or committed. Transfer occurs only between authorized environments over encrypted storage after licence, classification, retention, and destination rights are approved.

Current resumable campaign: `authoritative-truth-20260825153724`.

Verified resume operation:

```bash
npm run truth-network:watch -- \
  --resume=authoritative-truth-20260825153724 \
  --all-active
```

Do not run that command until import/reconstruction validation passes. A new worktree does not inherit any runtime state.

## State map

| State | Current location | Transfer or reconstruction rule |
|---|---|---|
| Provider manifests | Source-controlled registry/portfolio modules plus runtime product registry | Reconstruct definitions from the exact tagged code; transfer only materialized registry state when its lineage fingerprint verifies. |
| Provider cursors/source health | `data/runtime/reality-network/provider-state.json`, forecast-corpus provider state, evidence-war-room provider state, and truth-network `network-state.json` | Transfer as a point-in-time set. Never copy credential values; provider configuration must be re-supplied from destination secret management. |
| Raw-vault references/content | Reality/forecast/evidence Bronze stores and `data/runtime/authoritative-truth-network/raw` | References transfer with state. Raw content transfers only when rights permit; otherwise reacquire from preserved request identity/provider publication and verify the stored content hash. Never commit either. |
| Data-product registry/lineage | `data/runtime/data-foundry/product-registry.json`, `lineage-graph.json`, gaps/plans/state | Transfer together; validate registry and lineage fingerprints, then rematerialize missing products from content hashes. |
| Prospective archive | PostGIS `prospective_archive_snapshot` and forecast/truth campaign state | Prefer database backup/restore for PostGIS. File state supplies provider publication/raw references but does not replace database certification. |
| CAP source state | `data/runtime/evidence-war-room/government-cap-event-ledger.json`, provider/acquisition state, canonical event journals | Transfer append-only ledger/state together; validate update/cancel/reference chains and source rights. |
| Truth campaign | `data/runtime/authoritative-truth-network/network-state.json`, campaign checkpoints and authorized raw objects | Transfer atomically or start a new campaign. The current campaign ID must not be resumed with a partial state/raw set. |
| Current incident projections | intelligence repository/PostGIS projection tables, Reality event journals, indexed object sets | Restore the event/object authority first, then rebuild and compare projections. A projection alone is not authority. |
| Decision Memory | `crisis_decision_packet`, `decision_outcome_ledger`, `information_value_outcome`; file repository and Decision Foundry packet/replay files | Restore packets before outcomes; verify replay fingerprints and knowledge time. |
| Receipts | PostGIS `intelligence_receipt`, file repository receipts, control/operations ledgers | Restore with the action/event ledger and verify hashes; do not synthesize receipts. |
| Source-health state | provider state stores and truth-network provider/cursor projections | Transfer for continuity, then perform a fresh doctor/poll. A transferred healthy state is historical, not proof of current health. |
| Local proof keys | `data/runtime/decision-foundry/proof-keys` | Never put in the state bundle. Re-provision from destination KMS/secret service and invalidate/reissue any proof that cannot be verified there. |

## Current expected fingerprints

These bind the current source environment and are validation targets, not Git artifacts:

| Object | Semantic/file fingerprint |
|---|---|
| Truth network state | `authoritative-truth-network-state:sha256:cc5aeed82275df9018081ce9afc209fc621257e90eb33b097de007d472f982b2`; file SHA-256 `6c3c6f852397675a727aa3f4505b498762af7d690023e6db7e1177acaf8ad361` |
| Data-product registry | `data-product-registry:sha256:8acd22bcd912eefc686da35f29b275d091b33c4d74e9720a6d5d756721a27341`; file SHA-256 `0d1a44095aa81301f61f71c0d69b0a4b3f652920f3fd7cf69e8ad3a3b653cf16` |
| Indexed object sets | projection 324; consistency token `decision-object-set-consistency:sha256:9695c87e23e6791fb1b482c9a1bc118b0d9a49d13405b2fbc5a5fcbc5c7e086d`; file SHA-256 `799cf4e069e67ff861214b46f2e234333af615273846f96218056bad7fa96849` |
| Decision Foundry state | `decision-foundry-doctor:sha256:1f875599259eaba7578d374fd9c9d38413858b15d2b5c7d8f29637a203cec808`; file SHA-256 `8063959a03e26f157618c5a81cba65b27d01c29f3334a168f163a4e475579397` |
| Truth replay | `authoritative-truth-replay:sha256:568173948dfb9325dc0c38ac6839bfb05c61b221305c44eb9e84f5ea4e4e84f3` |
| Truth verification | `authoritative-truth-verification:sha256:7c831709d3b43127ffbe52e4b467b2853d88b35ea6e5cf1662aee8dfa16fc1ea` |

File SHA-256 values are expected to change after an authorized new poll; semantic replay and chain checks decide validity.

## Rights preflight

Before export, an accountable data custodian must produce a signed transfer decision for every provider/licence represented in the raw vault. The decision must cover retention, internal transfer, destination organization/region, derived-use rights, encryption, expiry, and deletion. Any `permitScientificRetention=false`, `BLOCKED`, `DENIED`, `REVOKED`, unknown licence, or destination mismatch removes that object and every dependent materialization from the bundle until reacquired legally.

Also verify that the bundle contains no `.env`, token, credential, cookie, private key, certificate private material, database password, or provider secret. Runtime state must contain only redacted configuration status.

## Export command

Run with all writers/watchers stopped and with an approved external destination path. This exports runtime state; it never stages it. The `--exclude` rules deliberately remove local proof keys and common secret/key forms. Raw content is included only because the rights preflight is a mandatory preceding gate.

```bash
cd /Users/malmeida/Documents/Development/vigia-intelligence
test "$(git branch --show-current)" = "feat/vigia-intelligence-foundation"
umask 077
export VIGIA_STATE_EXPORT_DIR="/absolute/authorized/encrypted/vigia-agent2-state-20260825"
mkdir -p "$VIGIA_STATE_EXPORT_DIR"
tar --create --gzip --file "$VIGIA_STATE_EXPORT_DIR/agent2-runtime-state.tgz" \
  --directory "$PWD" \
  --exclude='data/runtime/decision-foundry/proof-keys' \
  --exclude='*.pem' --exclude='*.key' --exclude='*.p12' \
  --exclude='.env' --exclude='.env.*' --exclude='*credentials*' --exclude='*secrets*' \
  data/runtime
shasum -a 256 "$VIGIA_STATE_EXPORT_DIR/agent2-runtime-state.tgz" \
  > "$VIGIA_STATE_EXPORT_DIR/agent2-runtime-state.tgz.sha256"
git rev-parse HEAD > "$VIGIA_STATE_EXPORT_DIR/source-head.txt"
```

Database state is a separate consistent backup; use the database's governed backup procedure while writers are stopped. Do not treat the file bundle as a database backup.

## Import command

Run in the integration worktree only after its migration DAG has been accepted. Keep services/watchers stopped. Extraction goes to a new temporary directory; it does not overwrite the repository in place.

```bash
cd /absolute/path/to/accepted-integration-worktree
umask 077
export VIGIA_STATE_IMPORT_DIR="/absolute/authorized/encrypted/vigia-agent2-state-20260825"
shasum -a 256 -c "$VIGIA_STATE_IMPORT_DIR/agent2-runtime-state.tgz.sha256"
export VIGIA_STATE_UNPACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vigia-agent2-import.XXXXXX")"
tar --list --file "$VIGIA_STATE_IMPORT_DIR/agent2-runtime-state.tgz" \
  | awk '/^\// || /(^|\/)\.\.($|\/)/ { bad=1 } END { exit bad }'
tar --extract --gzip --file "$VIGIA_STATE_IMPORT_DIR/agent2-runtime-state.tgz" \
  --directory "$VIGIA_STATE_UNPACK_DIR"
test -f "$VIGIA_STATE_UNPACK_DIR/data/runtime/authoritative-truth-network/network-state.json"
test ! -e "$VIGIA_STATE_UNPACK_DIR/data/runtime/decision-foundry/proof-keys"
export VIGIA_RUNTIME_BACKUP="${PWD}/data/runtime.pre-agent2-import.$(date -u +%Y%m%dT%H%M%SZ)"
mv "$PWD/data/runtime" "$VIGIA_RUNTIME_BACKUP"
mv "$VIGIA_STATE_UNPACK_DIR/data/runtime" "$PWD/data/runtime"
```

Restore the governed database backup separately, migrate to the accepted integration head, re-provision destination secrets/KMS keys, then run validation. The two `mv` operations are intentionally recoverable; do not delete the backup until acceptance completes.

## Validation command

```bash
cd /absolute/path/to/accepted-integration-worktree
node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('data/runtime/authoritative-truth-network/network-state.json'));if(s.campaignId!=='authoritative-truth-20260825153724'||s.stateFingerprint!=='authoritative-truth-network-state:sha256:cc5aeed82275df9018081ce9afc209fc621257e90eb33b097de007d472f982b2')process.exit(1)"
node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('data/runtime/data-foundry/product-registry.json'));if(r.fingerprint!=='data-product-registry:sha256:8acd22bcd912eefc686da35f29b275d091b33c4d74e9720a6d5d756721a27341')process.exit(1)"
npm run providers:doctor
npm run truth-network:replay
npm run db:certify-intelligence
node --test apps/api/test/authoritative-truth-network.test.mjs apps/api/test/backend-convergence.test.mjs
npm run check
```

Then compare counts, packet/replay fingerprints, archive chains, receipts, source cursors, source-health history, rights restrictions, and current incident projections. A fresh provider doctor may legitimately differ from transferred historical source health; record the transition rather than rewriting history.

## Restart and rollback

1. Start the database, apply the accepted migration DAG, then start the API without watchers/controllers.
2. Verify release/schema identity and read-only snapshots.
3. Rebuild projections and compare consistency/replay fingerprints.
4. Enable provider doctors, then bounded polling. Resume the named truth campaign only after raw references and rights pass.
5. Keep consequential execution disabled throughout.

If validation fails, stop services, move the rejected `data/runtime` aside, move `$VIGIA_RUNTIME_BACKUP` back to `data/runtime`, restore the pre-import database backup, and re-run the old release's certification. Do not merge partial state, edit hashes, or force a campaign resume.
