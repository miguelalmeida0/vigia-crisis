# Mega IX portable technical-candidate handoff

The user stopped feature development and accepted the implementation as the current technical candidate. This package preserves that candidate and supplies a deferred local acceptance runner. It does not claim visual acceptance, a browser journey, a fresh-user study, a commit or a met performance target. No browser access, Git write or production functionality change was attempted during packaging.

## Identity and baseline

- Exact starting and current HEAD: `a1eef78350276e87add2d08e92b08d5c7ebc5c7b`.
- Current branch: `vigia/operational-intelligence-v1`.
- Requested eventual branch: `vigia/mega-ix-mission-command-field-network`; not created here.
- Original checkout: `/Users/malmeida/Documents/ChatGPT/VIGIA Integration`.
- Shared Git metadata: `/Users/malmeida/Documents/Development/vigia/.git`; worktree metadata: `.git/worktrees/vigia-integration`. Ownership is already `malmeida:staff`; the session's metadata mount is read-only. Do not change ownership to solve that mount restriction.
- Mega IX began on 14 September 2026 at 11:26:07 UTC. Attribution uses the session's actual file-edit history beginning at 11:32:13 UTC, not the entire dirty HEAD diff.
- Last running, performance-measured candidate: `vigia-intelligence-fabric-878862be6a1edb84`, code hash `sha256:c93652fbb776f6f5000b46a9257b88481e243681b448745b095d73725ce7977a`. API 4177; production console 4191. Adding the two acceptance scripts changes the packaged source identity. The exact final build identity is recorded below after final validation. No running server was restarted for packaging.

The starting tree already contained uncommitted Operational Reality and earlier work. A bare checkout of HEAD is **not** the current baseline. `MEGA-IX-INTEGRITY.json` records hashes of the separate dirty baseline prerequisites without including their bytes in this overlay. Preserve those files independently or transfer a complete current baseline before applying. Whole-file overlay versions necessarily retain earlier edits inside shared files; their Mega IX purposes are itemized below. There is no verified complete pre-Mega-IX byte snapshot for a mechanical three-way merge.

## Package contents and boundaries

All paths below are relative to the repository. The portable package is this directory:

- `MEGA-IX-FILES.txt`: tab-separated A/M manifest of the payload; A means created during Mega IX (including handoff scripts/evidence), M means pre-existing and changed by Mega IX. No deletion is attributed to Mega IX.
- `MEGA-IX-OVERLAY/`: exact current bytes for every payload path, preserving repository-relative directories.
- `MEGA-IX-APPLY.md`: destination setup, reconciliation and application instructions.
- `MEGA-IX-INTEGRITY.json`: payload hashes/modes/purposes, status, final verification and separate dirty baseline prerequisite hashes.

The three package control files above (FILES, APPLY, INTEGRITY) are outside the payload to avoid recursive copies and self-hashing. The handoff document itself is a payload file. The overlay is a code/evidence handoff, not a database, secret store, browser profile or standalone full repository. Build outputs, dependencies, temporary profilers/logs, runtime data, credentials and Git internals are not overlay payloads. Durable evidence from the temporary experiments is included in the documented JSON/text records. Historical evidence remains historical; it has not been relabelled as a new browser run.

## Final integrity commands

Executed from the repository root with writable `TMPDIR` and Node 26.0.0. The final result/log identity appears below; all source and runner edits precede this final verification.

```sh
mkdir -p .tmp/test
export TMPDIR="$PWD/.tmp/test"
node --check scripts/mega_ix_local_acceptance.mjs
node --check scripts/mega_ix_acceptance_harness.mjs
node scripts/mega_ix_local_acceptance.mjs --help
node --test --test-concurrency=1 \
  apps/api/test/mission-command.test.mjs \
  apps/operator-console/tests/mission-command.mjs \
  apps/api/test/operational-recovery-service.test.mjs \
  packages/domain/test/intelligence/weather-projection.test.mjs \
  packages/domain/test/intelligence/physical-world.test.mjs \
  packages/domain/test/intelligence/decision-superiority.test.mjs \
  packages/domain/test/crisis-autopilot.test.mjs \
  packages/domain/test/crisis-autopilot-lifecycle.test.mjs \
  apps/api/test/crisis-portfolio-equivalence.test.mjs \
  apps/api/test/canonical-operator-api.test.mjs \
  apps/api/test/operational-period-controlled-abort.test.mjs
node -e 'import("./scripts/release/build_release_manifest.mjs").then(async m => console.log((await m.reuseOrBuildReleaseManifest()).releaseId))'
npm --prefix apps/operator-console run verify:static
```

`verify:static` runs the production build, syntax/assets, smoke, interaction/planning/retry contracts, persistence, real-data, proxy, admission, map, rejected-delivery, truth, intelligence, browser-harness-source, UX and operational-hardening checks. Its browser-contract step checks source only. It does **not** execute Playwright. Logs: `portable-regression-tests.txt`, `portable-static-verification.txt`, `portable-runner-checks.txt`.

## Earlier test evidence (overlapping, not additive)

- `node --test apps/api/test/mission-command.test.mjs apps/operator-console/tests/mission-command.mjs`: 50 historical focused tests, `focused-tests.txt`.
- `node --test --test-timeout=30000 apps/api/test/mission-command.test.mjs apps/api/test/situation-intelligence.test.mjs apps/api/test/operational-reality.test.mjs apps/api/test/physical-metrics.test.mjs packages/domain/test/intelligence/operational-reality.test.mjs apps/operator-console/tests/mission-command.mjs apps/operator-console/tests/hierarchy.mjs apps/operator-console/tests/physical-metrics.mjs`: 111 historical tests before one final outgoing-markup assertion, `retained-tests.txt`.
- `node --test apps/api/test/operational-recovery-service.test.mjs`: five historical recovery tests, `recovery-tests.txt`. Earlier covered unique total was 117, not 50+111+5.
- The 153-test command above previously passed in `acceptance-regression-tests.txt`; previous production/static output is in `acceptance-static-verification.txt` and `static-verification.txt`.
- Weather preparation and portfolio equivalence are covered by `weather-projection.test.mjs` and `crisis-portfolio-equivalence.test.mjs`, included in the final 153. Retained-data comparisons and timings are in `performance-evidence.json`.
- `controlled-api-evidence.json` and `restart-evidence.json` preserve prior API exercise/restart results. They do not prove three people operated browsers. The temporary one-off driver scripts are not production entrypoints; the new local runner provides the portable repeatable journey.
- `design-detector.json` reports no source detector findings; it is not a rendered visual verdict.

## Performance: frozen results, no new optimization

| Measurement | Result | Meaning |
|---|---:|---|
| Previous startup | approximately 9.5 s | Earlier first Command Overview report |
| Improved first request | 4.305 s | Normal uninstrumented API request after restart |
| Final uncached p95 | 3.904 s | Twenty projections with empty route/twin caches, services already initialized |
| Target | less than 2.5 s p95 | **NOT MET** |

Final uncached median 2.3855 s, maximum 3.919 s. Cached 15–277 ms responses do not satisfy startup acceptance. These are backend measurements, not browser render or first-content timings. See `PERFORMANCE_ACCEPTANCE.md` for profiling overhead, earlier run variance and exact comparison boundaries. Packaging did not rerun or improve these numbers.

## Environment and startup

Use the current full VIGIA baseline, Node >=22 with `node:sqlite` support (this freeze used 26.0.0), the baseline lockfiles/dependencies, PostgreSQL with the existing schema/retained data, and local writable directories. The production build is `apps/operator-console/dist`. Playwright/Chromium is needed only for deferred acceptance; do not change the product lockfile just to install the test driver.

| Variable | Requirement |
|---|---|
| `VIGIA_DATABASE_URL` or `VIGIA_DATABASE_URL_FILE` | Required existing PostgreSQL connection, preferably a file with mode 0600. Provider secrets files do not supply this variable automatically. |
| `VIGIA_STATE_FILE` | Existing state location; default `data/runtime/production-v1.json`. Team SQLite is adjacent to this file. Preserve the original path or transfer its runtime siblings deliberately. |
| `VIGIA_SECRETS_FILE` | Optional existing provider credentials; defaults to `~/.config/vigia/secrets.env`. Never put credential values in the handoff. |
| `VIGIA_OPERATOR_TOKEN_FILE` / `VIGIA_OPERATOR_PROXY_KEY_FILE` | API/proxy signing secret, at least 32 characters. Direct-value variants exist; prefer files. Console uses `VIGIA_OPERATOR_PROXY_KEY` or its file variant. |
| `VIGIA_OPERATOR_ACCESS_TOKEN` / `VIGIA_OPERATOR_ACCESS_TOKEN_FILE` | Separate console admission secret, at least 32 characters. |
| `HOST`, `PORT`, `OPEN_BROWSER` | Local defaults in runner: loopback, API 4177 / console 4191, no automatic browser launch by servers. |
| `VIGIA_RUNTIME_PROFILE`, `VIGIA_LOCAL_OPERATOR_AUTOLOGIN`, `NODE_ENV` | For this local acceptance installation: `local_shadow`, `1`, `development`; never use local autologin on a public listener. |
| `VIGIA_OPERATOR_CONSOLE_ORIGIN` | `http://127.0.0.1:4191` for API local session origin. |
| `VIGIA_BACKEND_URL`, `VIGIA_OPERATOR_PUBLIC_AUTHORITY`, `VIGIA_OPERATOR_STATIC_ROOT` | Console: `http://127.0.0.1:4177`, `127.0.0.1:4191`, absolute path to `apps/operator-console/dist`. |
| `VIGIA_RELEASE_ID`, `VIGIA_CODE_STATE_HASH`, `VIGIA_OPERATIONAL_DATA_HASH`, `VIGIA_APPROVED_RELEASE_STATEMENT_SHA256` | Assert the destination-generated release manifest. Runner sets these from that manifest; do not pin old host hashes after reconciliation. |
| `VIGIA_TEAM_CENTRAL_URL`, `VIGIA_TEAM_CENTRAL_OPERATOR_TOKEN` | Optional production central link: HTTPS and authorized token >=24 characters, matching pre-provisioned group/device grants. Not needed for isolated controlled acceptance. |

Normal runtime commands after environment configuration:

```sh
node apps/api/src/server.mjs
# In a second shell with the console environment configured:
node apps/operator-console/server.mjs
```

The more reproducible acceptance startup is `node scripts/mega_ix_local_acceptance.mjs --run-local`. It builds production assets, starts missing listeners or checks existing listener release identities, obtains normal one-time console admission, then launches Playwright. It will not kill an existing mismatched listener. Full concrete installation commands are in `MEGA-IX-APPLY.md`.

## Persistence, migration and transfer

No new PostgreSQL migration file was added by Mega IX. Existing baseline migrations still apply. Mega IX adds `team-command.sqlite` and `team-command.sqlite.key` beside `VIGIA_STATE_FILE`: AES-256-GCM record bodies, 32-byte installation key, WAL/FULL durability, 0600 files, new directories 0700. Table `team_records` has `(kind,id)` primary key, encrypted `body`, `group_id`, and per-kind/group index. Runtime creates the table and adds `group_id` when absent.

**Legacy migration caveat:** adding the column to an older populated team table defaults existing rows to an empty group ID; constructor code does not backfill those rows. Inspect and reconcile that older store offline before using group-filtered reads. Preserve IDs, decrypt each record with the existing key, and derive `group_id` using the same `put` rule (`v.groupId`, or group record ID). Do not drop the database or replace its key. This handoff does not introduce a new migration to change the accepted candidate.

Before moving durable data, stop writers and make a consistent PostgreSQL backup and SQLite backup together with the matching `.key`. With writers stopped, preserve any uncheckpointed `-wal` alongside the database (or checkpoint using SQLite tooling); do not copy a live main SQLite file alone. Copy the existing state, acquisition/situation data and referenced runtime stores separately to preserve retained incidents. Runtime files and keys are intentionally absent from this shareable code overlay.

The browser uses IndexedDB `vigia-field-team-v1`, object store `records`, non-extractable device signing keys, encrypted drafts/outbox and passphrase-protected offline packages (PBKDF2-SHA-256, 600,000 iterations; AES-GCM). A code checkout cannot transfer those non-extractable keys or unsent private browser work. Keep the original trusted browser profile/origin until outgoing work is delivered. Re-enroll and prepare a new device on the new origin. Forgotten offline passphrases are not recoverable. Logout clears private origin cache/storage. Basemap imagery is not an offline tile pack.

## Deferred acceptance and limitations

The runner is authored and syntax/help checked only. Its first real browser execution may expose runner selector assumptions or product failures; a nonzero exit and JSON FAIL are the intended honest result, not a reason to suppress errors. It exercises real retained incident routes first, then isolates three labelled responders and actual TeamService instances from operational mutations. Browser clicks create signed reports/confirmations/messages; upstream loss is an injected central transport failure, and device disconnection uses Playwright network-offline mode. These are controlled runtime tests, not evidence of a deployed central site or physical radio/network outage.

It produces all 15 requested scene names plus retained-route, people and viewport captures; desktop widths 1672/1440/1280/1024 and mobile 430/390/320. It records page/console/request failures, horizontal overflow, recipient waiting/received state, restored sync and stable message/report IDs. Output is one `acceptance.json` plus PNG/log artifacts. Existing `CAPTURE_LEDGER.json` stays NOT_RUN until actual acceptance is performed; the new runner writes a separate result rather than falsifying historical evidence.

Visual inspection for clipping, overlap, focus contrast, meaningful touch targets and all six reference/runtime/overlay/difference sets remains required. Programmatic overflow and a Tab smoke check are not accessibility certification. Photo/audio attachment and map-picking controls have not been operated; hardware capture is also unverified. Service workers are blocked in the isolated actor harness to keep request routing deterministic, so prepared-shell reload/unlock requires a separate local browser check. A fresh human must answer the original nine comprehension questions within 30 seconds, with elapsed time and answers recorded; runner timings do not certify understanding.

There is no acceptance commit or push. Native Bluetooth/Wi-Fi Nearby/LoRa delivery requires a native/radio adapter. External central synchronization requires real deployment/provisioning and an open workspace or host scheduler. Report freshness is one hour; expiry/rejection stays explicit. Mapped presence does not establish opening, staffing, capacity or safe travel. The controlled route direction is facility-to-community, not a measured reverse evacuation journey. The p95 target remains unmet. No functionality was changed to hide any of these limitations.

## Final freeze and per-file manifest

The generated final freeze details and exact per-file purposes follow.

<!-- FINAL-PACKAGE -->

Final packaged/build release: `vigia-intelligence-fabric-d0e03143e023ae21`. Code hash: `sha256:becb44cdf09778562d0e0752c695461bd15a24debc67b963c007e743fbe5c948`. Operational data hash: `sha256:0ee7f5dd8cf02d36e4e2b8f9b09f66adb743be05d9367367e1d131524f8f7351`. Release statement hash: `sha256:cd7dfe94ce604ff6acb459651c74ce0bb0d126d32060b5ea5a97fcaa4a447482`. Build and release source identities match. This is the packaging build, not a claim that the already-running API has adopted it.

Final checks: **153 passed, 0 failed, 0 skipped**; production build and complete static verification **PASS**; acceptance runner syntax and help **PASS**, browser execution **NOT RUN**. No functionality changed after this final regression/static freeze.

Payload: **76 files** (43 created, 33 modified). Three separate package control files: `MEGA-IX-FILES.txt`, `MEGA-IX-APPLY.md`, `MEGA-IX-INTEGRITY.json`. Mechanical overlay copies are not additional source changes.

| Status | Repository-relative file | Exact Mega IX purpose |
|---|---|---|
| M | `apps/api/src/application/create-services.mjs` | Initialize team store/service, optional central link and snapshot-change callback. |
| M | `apps/api/src/application/register-routes.mjs` | Register team endpoints in the existing API. |
| M | `apps/api/src/http/route-security-policy.mjs` | Declare authenticated capabilities and incident scope for team endpoints. |
| M | `apps/api/src/modules/intelligence/situation-service.mjs` | Notify team mission recalculation after storing a changed situation snapshot. |
| A | `apps/api/src/modules/mission/controlled-field-exercise.mjs` | Explicit synthetic Louredo/EM527 exercise context with 11/24-minute routes; separate from operational records. |
| A | `apps/api/src/modules/mission/team-central-link.mjs` | Configured HTTPS central transport and per-team synchronization lifecycle. |
| A | `apps/api/src/modules/mission/team-routes.mjs` | Authenticated incident-team HTTP reads, enrollment, mutations and synchronization endpoints. |
| A | `apps/api/src/modules/mission/team-service.mjs` | Authorized team membership, reports, missions, confirmations, receipts, cached context and recalculation. |
| A | `apps/api/src/modules/mission/team-store.mjs` | Encrypted SQLite team records, transactions, per-group indexing and insertion-ordered pages. |
| M | `apps/api/src/modules/operator/canonical-operator-crisis-projection.mjs` | Use portfolio-only aggregation on overview path. |
| M | `apps/api/src/modules/operator/operational-period-service.mjs` | Read only operational period snapshot fields for its projection. |
| M | `apps/api/src/modules/operator/operational-recovery-service.mjs` | Read only the five recovery collections used by its projection. |
| A | `apps/api/test/crisis-portfolio-equivalence.test.mjs` | Portfolio-only projection equivalence to full detail aggregation. |
| A | `apps/api/test/mission-command.test.mjs` | Domain/service, cryptography, permissions, replay, transport, persistence and mission regression tests. |
| M | `apps/api/test/operational-recovery-service.test.mjs` | Assert selective snapshot/full snapshot output equivalence. |
| A | `apps/field-node/src/team-hub-sync.mjs` | Local hub upstream-loss recovery, bounded cursor paging and duplicate-safe central synchronization. |
| A | `apps/operator-console/field-team-sw.js` | Cache/install explicit offline application shell. |
| M | `apps/operator-console/index.html` | Load mission command stylesheet. |
| A | `apps/operator-console/offline-team.html` | Offline workspace entry document. |
| M | `apps/operator-console/scripts/build.mjs` | Bundle offline entry, service worker, styles and required assets. |
| M | `apps/operator-console/server.mjs` | Clear private origin storage/cache on explicit logout. |
| M | `apps/operator-console/src/approved/controller.js` | Install mission command lifecycle against selected incident and active map. |
| M | `apps/operator-console/src/approved/routes/detail.js` | Compose mission command with existing detail analysis under disclosure. |
| M | `apps/operator-console/src/approved/routes/overview.js` | Compose mission command ahead of disclosed existing priorities. |
| M | `apps/operator-console/src/approved/routes/response-access.js` | Compose mission command with existing response tools under disclosure. |
| A | `apps/operator-console/src/approved/ui/mission-command.js` | Integrated mission, field report, confirmation, timeline, messaging, people and offline-preparation interactions. |
| A | `apps/operator-console/src/field-team-offline.js` | Offline encryption and expiry-aware retained team view helpers. |
| A | `apps/operator-console/src/field-team-store.js` | Account-scoped IndexedDB device state, encrypted views/drafts, outbox and passphrase-protected offline package. |
| M | `apps/operator-console/src/mapRuntime.js` | Explicit map-point selection for field reports. |
| A | `apps/operator-console/src/offline-team.js` | Unlock and operate prepared private offline team workspace. |
| M | `apps/operator-console/src/vigiaApi.js` | Add authenticated teamRequest transport helper. |
| A | `apps/operator-console/styles/approved/mission-command.css` | Connected command composition, mission semantics and responsive layouts. |
| A | `apps/operator-console/styles/approved/offline-team.css` | Offline workspace presentation and responsive controls. |
| A | `apps/operator-console/tests/mission-command.mjs` | UI markup, privacy, outgoing state and offline cryptography contracts; not browser acceptance. |
| M | `apps/operator-console/tests/smoke.mjs` | Update canonical module/style and primary navigation expectations. |
| M | `apps/operator-console/tests/ux-contract.mjs` | Check intentional mission/disclosure route composition. |
| M | `data/validation/release/checkpoint-commands.sh` | Generated checkpoint commands for original installation; regenerate before use. |
| M | `data/validation/release/checkpoint-handoff.json` | Generated current checkpoint and staging metadata. |
| M | `data/validation/release/current-release-manifest.json` | Frozen exact source/data release identity. |
| M | `data/validation/release/dirty-tree-classification.json` | Generated whole-tree classification; not a Mega IX attribution list. |
| M | `data/validation/release/evidence-manifest.json` | Generated evidence inventory for original installation. |
| M | `data/validation/release/ignored-runtime-manifest.json` | Generated ignored runtime path inventory; not backed-up runtime bytes. |
| M | `data/validation/release/release-source-manifest.json` | Exact full-baseline source hashes used by this release. |
| M | `data/validation/release/release-statement.json` | Release identity and certification boundaries. |
| M | `data/validation/release/unknown-path-report.json` | Generated unclassified-path report. |
| A | `docs/handoffs/mega-ix/ACCEPTANCE.json` | Historical implementation acceptance status, separate from local browser proof. |
| A | `docs/handoffs/mega-ix/CAPTURE_LEDGER.json` | Required captures and six-route evidence marked NOT_RUN. |
| A | `docs/handoffs/mega-ix/DESIGN_AND_ACCEPTANCE.md` | Original Mega IX route integration design and acceptance contract. |
| A | `docs/handoffs/mega-ix/DESIGN_RECORD.md` | Design decisions and review record. |
| A | `docs/handoffs/mega-ix/MEGA-IX-PORTABLE-HANDOFF.md` | Authoritative portable inventory, release, environment, persistence, evidence and limitations. |
| A | `docs/handoffs/mega-ix/PERFORMANCE_ACCEPTANCE.md` | Profiling changes, benchmark method, measured results and blocked acceptance. |
| A | `docs/handoffs/mega-ix/REPORT.md` | Technical candidate report and explicit acceptance limitations. |
| A | `docs/handoffs/mega-ix/acceptance-regression-tests.txt` | Prior 153-test acceptance follow-up output. |
| A | `docs/handoffs/mega-ix/acceptance-static-verification.txt` | Prior acceptance follow-up build/static output. |
| A | `docs/handoffs/mega-ix/controlled-api-evidence.json` | Controlled backend mission transition and report replay evidence. |
| A | `docs/handoffs/mega-ix/design-detector.json` | Source design-detector output, not rendered review. |
| A | `docs/handoffs/mega-ix/focused-tests.txt` | Historical focused mission/security/UI contract test output. |
| A | `docs/handoffs/mega-ix/performance-evidence.json` | Machine-readable previous performance samples and comparisons. |
| A | `docs/handoffs/mega-ix/portable-regression-tests.txt` | Final portable freeze: exact 153-test command and complete output. |
| A | `docs/handoffs/mega-ix/portable-runner-checks.txt` | Syntax/help-only validation of deferred local runner; no browser run. |
| A | `docs/handoffs/mega-ix/portable-static-verification.txt` | Final portable freeze: production build and static verification output. |
| A | `docs/handoffs/mega-ix/recovery-tests.txt` | Historical recovery regression output. |
| A | `docs/handoffs/mega-ix/restart-evidence.json` | Prior runtime persistence/restart evidence. |
| A | `docs/handoffs/mega-ix/retained-tests.txt` | Historical retained-product regression output. |
| A | `docs/handoffs/mega-ix/static-verification.txt` | Historical production/static verification output. |
| M | `packages/domain/src/crisis-autopilot/project-crisis-autopilot.mjs` | Skip unused full detail construction/hashing for portfolio-only projection. |
| A | `packages/domain/src/fieldnet/mission-command.mjs` | Mission catalog, route intersection, consequence evaluation, states, report verification and priority summaries. |
| A | `packages/domain/src/fieldnet/team-protocol.mjs` | Signed encrypted envelopes, identities, acknowledgements, durable outbox and duplicate-safe delivery semantics. |
| A | `packages/domain/src/fieldnet/team-transports.mjs` | Explicit local and unavailable hardware transport adapters and bounded relay behavior. |
| M | `packages/domain/src/operational-twin/decision-analysis.mjs` | Build dependency lookup once per impact projection. |
| M | `packages/domain/src/operational-twin/physical-conditions.mjs` | Prepare station histories once and bind location/subject per weather query. |
| M | `packages/domain/src/operational-twin/physical-metric.mjs` | Parse each measurement timestamp once. |
| M | `packages/domain/src/operational-twin/physical-world.mjs` | Reuse weather preparation across incidents within one projection. |
| A | `packages/domain/test/intelligence/weather-projection.test.mjs` | Prepared weather projection output equivalence, freshness, station/location and adversarial history tests. |
| A | `scripts/mega_ix_acceptance_harness.mjs` | Local-only three-responder harness using actual TeamService and in-memory local/central stores. |
| A | `scripts/mega_ix_local_acceptance.mjs` | Deferred Playwright localhost acceptance runner, production build/start checks, controlled journey, captures and JSON. |
