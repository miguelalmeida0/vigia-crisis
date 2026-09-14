# Apply Mega IX in a normal local workspace

This is a whole-file overlay of Mega IX-touched paths, not a HEAD diff and not a complete repository. Keep this package intact. Work on a fresh writable copy; retain your original checkout and runtime backups.

## 1. Establish the current baseline

Starting HEAD is `a1eef78350276e87add2d08e92b08d5c7ebc5c7b`. A clone at that commit alone lacks earlier uncommitted Operational Reality work. Obtain the current VIGIA baseline separately, preserving all its source and reference files. `MEGA-IX-INTEGRITY.json.baselinePrerequisites` lists the currently dirty paths outside Mega IX with hashes. Their bytes are deliberately not included in this overlay.

For a same-machine transfer, a safe option is a copy of the complete current working tree into an empty directory; this already contains the final candidate, so applying this overlay is idempotent. Exclude Git worktree pointers, dependencies and runtime secrets from that source copy, then transfer runtime data separately as described in the handoff. Never copy the `.git` pointer into a destination where its common metadata is unavailable.

```sh
# Set these to actual absolute paths. Destination must be a new empty directory.
export VIGIA_SOURCE_CHECKOUT='/Users/malmeida/Documents/ChatGPT/VIGIA Integration'
export VIGIA_DESTINATION="$HOME/Documents/VIGIA-Mega-IX-local"
mkdir "$VIGIA_DESTINATION"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='.tmp' --exclude='.env' --exclude='.env.local' \
  --exclude='data/runtime' --exclude='*.sqlite*' --exclude='*.key' \
  "$VIGIA_SOURCE_CHECKOUT/" "$VIGIA_DESTINATION/"
```

This full baseline transfer is separate from the narrowly scoped overlay. It does not make an unrelated giant diff part of Mega IX. If repository history is needed, use a normal clone at the starting HEAD and import the separately preserved dirty baseline into it before reconciliation. Branch/commit work belongs to the writable destination after review; this handoff did not create a branch or commit.

## 2. Verify and reconcile before replacement

Set `MEGA_IX_PACKAGE` to this package directory and `VIGIA_DESTINATION` to the destination root. Verify every source payload hash before copying. A = created during this sprint, not necessarily absent on the destination; M = existing file modified by this sprint.

```sh
export MEGA_IX_PACKAGE="$VIGIA_SOURCE_CHECKOUT/docs/handoffs/mega-ix"
python3 -c 'import os,json,hashlib,pathlib; p=pathlib.Path(os.environ["MEGA_IX_PACKAGE"]); m=json.loads((p/"MEGA-IX-INTEGRITY.json").read_text()); assert len(m["files"])==m["payloadFileCount"]; [(lambda f: (_ for _ in ()).throw(Exception("Hash mismatch: "+f["path"])) if hashlib.sha256((p/"MEGA-IX-OVERLAY"/f["path"]).read_bytes()).hexdigest()!=f["sha256"] else None)(f) for f in m["files"]]; print("Verified",len(m["files"]),"payload files")'
```

Do not blindly replace divergent destination files. Compare each destination file with the overlay. If it matches the manifest hash, leave it. For every M file that differs, use three-way reconciliation against your saved **pre-Mega-IX current baseline**, destination changes, and the final overlay. HEAD is only a historical aid; it is not a valid substitute for the missing dirty ancestor. Where that ancestor is unavailable, manually reconcile against the per-file purpose table and the previous product baseline. Preserve earlier behavior; do not turn a whole-file overlay into a claim of isolated Mega IX hunks.

Highest-risk mixed files:

- `apps/api/src/application/create-services.mjs`: keep earlier RealityQuestions/retained-source initialization while adding team service/store and callback.
- `apps/api/src/modules/intelligence/situation-service.mjs`: keep previous readable warning/source behavior while adding snapshot-change notification.
- `apps/operator-console/src/approved/controller.js` and `routes/overview.js`: keep earlier queue/currentness/priority behavior with the new mission slot and disclosure.
- `apps/operator-console/src/approved/routes/detail.js` and `response-access.js`: preserve complete existing operational tools while integrating the mission slot.
- `packages/domain/src/operational-twin/physical-world.mjs`, `physical-metric.mjs`, `physical-conditions.mjs`: preserve earlier reality/currentness/measurement semantics while retaining the measured preparation optimization.
- `apps/api/src/modules/operator/operational-recovery-service.mjs` and its test: keep earlier recovery truth handling and the new selective snapshot equivalence.
- Existing console smoke and UX contracts: preserve previous product assertions alongside mission composition checks.

Treat **all other M source files** as reconciliation candidates if the target diverges; the list above is not permission to overwrite the rest. If an A path already exists with different bytes, reconcile it too. All nine `data/validation/release/` files are generated snapshots of this installation; archive their overlay versions as evidence, but regenerate them for the destination rather than blindly applying host-specific staging/runtime advice.

## 3. Apply the reviewed payload

After resolving divergent files, copy only payload paths. This loop excludes generated release records; they remain in the package for inspection. It does not delete unrelated files or copy the overlay recursively.

```sh
python3 -c 'import os,json,pathlib,shutil; p=pathlib.Path(os.environ["MEGA_IX_PACKAGE"]); target=pathlib.Path(os.environ["VIGIA_DESTINATION"]); m=json.loads((p/"MEGA-IX-INTEGRITY.json").read_text()); [(lambda f: (lambda src,dst: (dst.parent.mkdir(parents=True,exist_ok=True),shutil.copy2(src,dst)))(p/"MEGA-IX-OVERLAY"/f["path"],target/f["path"]))(f) for f in m["files"] if f["kind"]!="generated"]; print("Reviewed payload applied; regenerate release metadata")'
```

If you manually merged a file, exclude it from that loop or restore your reviewed merged version afterwards **before** testing. Keep the unmodified overlay as the exact candidate archive. The three control files and the full overlay may remain under `docs/handoffs/mega-ix`; the release builder classifies that directory as governed evidence, not application code. Do not move the overlay to a source directory or the repository root, where duplicate source files could change release identity.

## 4. Dependencies, credentials and retained state

```sh
cd "$VIGIA_DESTINATION"
npm ci
npm --prefix apps/operator-console ci
mkdir -p .tmp/test .tmp/local-acceptance-secrets .tmp/playwright-driver
chmod 700 .tmp/local-acceptance-secrets
export TMPDIR="$PWD/.tmp/test"
# Install the acceptance driver separately from product dependencies.
npm install --prefix .tmp/playwright-driver --no-package-lock playwright
node .tmp/playwright-driver/node_modules/playwright/cli.js install chromium
export MEGA_IX_PLAYWRIGHT_MODULE="$PWD/.tmp/playwright-driver/node_modules/playwright/index.mjs"
```

Use your existing installation's API/admission keys for existing listeners. For a new local installation, generate independent keys without printing them:

```sh
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");for(const n of ["api-key","access-key"])fs.writeFileSync(".tmp/local-acceptance-secrets/"+n,crypto.randomBytes(32).toString("hex"),{mode:0o600,flag:"wx"})'
export MEGA_IX_API_KEY_FILE="$PWD/.tmp/local-acceptance-secrets/api-key"
export MEGA_IX_ACCESS_KEY_FILE="$PWD/.tmp/local-acceptance-secrets/access-key"
export NODE_ENV=development
# Supply an existing private file containing the PostgreSQL URL:
export VIGIA_DATABASE_URL_FILE="$HOME/.config/vigia/database-url"
# Supply the transferred retained state path if different from the default:
export VIGIA_STATE_FILE="$PWD/data/runtime/production-v1.json"
```

The database URL file is an actual local prerequisite, not generated by these commands. Restore your existing PostgreSQL/state stores and matching team SQLite/key backup deliberately. Do not reuse sample database credentials or invent retained operational incidents. Provider credentials remain in the configured private secrets file. The controlled harness itself uses in-memory stores and does not need a transferred synthetic group.

## 5. Final local validation and browser journey

Run the exact 153-test command and `verify:static` from `MEGA-IX-PORTABLE-HANDOFF.md`, then:

```sh
node scripts/mega_ix_local_acceptance.mjs --run-local
```

Optional configuration:

- `MEGA_IX_INCIDENT_ID`: select a real retained incident; otherwise choose a returned overview incident.
- `MEGA_IX_API_URL` / `MEGA_IX_CONSOLE_URL`: local HTTP URLs, default ports 4177/4191.
- `MEGA_IX_OUTPUT`: artifact directory; default `.tmp/mega-ix-local-acceptance/<timestamp>`.
- `MEGA_IX_HEADED=1`: visible Chromium.
- `MEGA_IX_KEEP_SERVERS=1`: retain only the servers started by this runner. Existing listeners are never killed.

The runner regenerates/checks release identity and builds before startup. Stop/restart a mismatched existing listener yourself; it deliberately fails rather than killing an unrelated process. If it cannot find retained data or authenticate, fix the actual environment and rerun. No `VIGIA_FIXTURES` production flag is permitted.

Read the single `acceptance.json` and protected logs. FAIL is incomplete acceptance. `AUTOMATED_PASS_HUMAN_REVIEW_REQUIRED` means only the scripted controlled journey passed: it is not a visual ship verdict. Review all 15 required captures and the seven viewport widths. Confirm exact direction/limitations of the 11/24-minute exercise routes and synthetic labels. Compare report/message IDs before/after restored synchronization and the named received/waiting recipients.

Complete separate local checks for photo/audio upload and playback, map picking, prepared offline shell reload/unlock, actual central-network loss and restoration, keyboard/focus/touch behavior, clipping/overlap/contrast, and all six canonical/reference comparisons. The runner does not pretend to operate hardware or perform a human study.

For the 30-second test, start a stopwatch when a fresh participant first sees Important now. Record their exact answers and elapsed time for: what matters now; what changed; what is protected; what is in trouble; what the team reported; whether confirmed; the alternative; who received the message; whether VIGIA works offline. Do not infer a pass from page load time. Archive that human result next to `acceptance.json`.

Only after destination reconciliation and actual acceptance should the normal writable repository be branched/committed/pushed according to the user's release instruction. This package contains no commit SHA and no completion claim for those deferred steps.
