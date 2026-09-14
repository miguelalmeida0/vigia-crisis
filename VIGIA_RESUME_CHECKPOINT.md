# VIGIA safe interruption / resume checkpoint

Checkpoint captured at `2026-08-23T20:59:00Z` (`2026-08-23 22:59:00 CEST`). This file is the authoritative handoff for the interrupted task. Do not infer completion from partial artifacts.

## A. Task active when interrupted

The active task is **VIGIA — 7.5 Minimum Operational Maturity Release**. The mandate is to raise every engineering-controlled maturity category to at least 7.5 with real, reproducible evidence, while keeping externally blocked claims honest. It includes the canonical Operator Console, API, FieldNet, PostGIS migration 019, one exact release identity, deployment/recovery proof, a real-clock 60-minute browser soak, operator rehearsal preparation, source/integration truth, final security scan, final certification, and the requested A–V delivery report.

The interruption landed immediately after the latest isolated deployment/recovery drill reached an atomic terminal boundary. The command completed with `FAIL`; its `finally` block wrote proof and removed its unique containers, network, and volumes. No source change was made after that failure. No canonical service was restarted or stopped.

Precise stop point:

- `npm run release:manifest` completed and produced current candidate release `vigia-intelligence-fabric-9a3c49090716eb87`.
- `npm run operations:deployment-drill` built all four isolated images, migrated a clean PostGIS database through migration 019, and brought the API healthy.
- The clean deployment then failed because the isolated FieldNet container remained unhealthy, so Web never reached the deployment convergence gate.
- Proof: `.tmp/operational-maturity-75/deployment-drill/deployment-recovery-proof.json` (`state: FAIL`, `2026-08-23T20:52:40.693Z` to `2026-08-23T20:55:14.470Z`).
- Cleanup proof: `.tmp/operational-maturity-75/deployment-drill/cleanup-proof.json` (`state: PASS`, project `vigia-maturity-75-25756`, completed `2026-08-23T20:55:17.119Z`).
- Strong code-level cause, not yet rerun-verified: the FieldNet process validates the public `Host` against `0.0.0.0:4188`, while its Compose health check calls `127.0.0.1:4188` and the isolated externally mapped authority is `127.0.0.1:5288`. The resulting host rejection is consistent with a permanently unhealthy container. The exact repair must preserve host-header hardening rather than weakening it.

## B. Research completed

### Established

- The governed release contract is migration head `019`, schema `vigia-postgis-019`, API `vigia-api-v10.5`, FieldNet `fieldnet-api-v5`, ontology `vigia.crisis-ontology.v1`, and deterministic rules `vigia.intelligence-rules.v1:83ec995872f1245d`.
- The latest candidate manifest is `vigia-intelligence-fabric-9a3c49090716eb87`, code-state hash `sha256:9a3c49090716eb87a3a8f1975b5845f0fc22521c2874a8f9f3ccc6d1be4e4ccc`, built `2026-08-23T20:52:39.269Z`.
- Canonical services intentionally remain on the last verified running release `vigia-intelligence-fabric-3fcc98ca5c8be9f9`, hash `sha256:3fcc98ca5c8be9f9f451b8388353d78b5aa0b4039b509b4c114e2f21bf6aacb6`, at API `4177`, FieldNet `4188`, Operator Console `4190`.
- Clean PostGIS startup can require a transient official-image stop/start. The migration runner now retries connection and applies 001–019 successfully.
- Legacy migration files that self-inserted into the migration ledger cannot execute unchanged on a clean database. The runner strips only those obsolete ledger self-inserts while hashing the original source; focused recovery tests pass.
- The backup/restore drill is a real controlled isolated restore and passed with RPO `0 seconds` at the snapshot boundary and measured RTO `307421.1 ms`.
- CAP integration is structurally implemented but honestly `NOT_CONFIGURED`; there is no agency endpoint, credential, or real inbound acceptance flow.
- The current data does not establish a second current physical observation family. It must not be fabricated or promoted from reported-only evidence.
- No actual operators or specialists are available in this environment. Human rehearsal outcomes and usability claims must remain unverified.
- The final 60-minute maturity soak must use real wall-clock time. Accelerated failure cycles are prerequisites, not a substitute for 60 minutes.

### Chosen

- One-time Operator admission through the dedicated `operator:open` flow, an HttpOnly/SameSite=Strict bounded cookie, replay-limited admission tokens, and no legacy query-token compatibility.
- Map reliability through bounded same-origin fetch, exact MIME/size/timeout checks, same-origin cache/LRU, explicit lifecycle states, and a real governed Portugal boundary fallback with no broken-image surface.
- Deterministic intelligence only: every conclusion must retain observation identity, provenance, time basis, geometry basis, source class, conflicts, uncertainty, and rule-set version.
- Isolated deployment/recovery projects and ports for destructive drills; canonical services stay untouched until the drill passes.
- Honest external integration states (`NOT_CONFIGURED`, `BLOCKED_EXTERNAL`, or equivalent) instead of simulated partners, sources, people, or credentials.
- Safe staging artifacts only under `.tmp/operational-maturity-75`; never execute them during this task.

### Rejected

- Fake second-source, agency, credential, human-rehearsal, or live-operations evidence.
- Treating reported incident feeds as physical sensing.
- Weakening host validation, authentication, replay protection, source provenance, or release identity to make a check pass.
- Native browser image fallback that can display a broken-image icon.
- Query-string bearer/access compatibility on ordinary Operator routes.
- Restarting canonical services before the isolated deployment gate passes.
- Clearing, stashing, resetting, cleaning, staging, or committing the inherited dirty tree.
- Claiming a 7.5 score from code presence alone.

### Unresolved

- Confirm and repair the FieldNet public-authority/health-check mismatch, then obtain a full `PASS` deployment/recovery proof.
- Run the full post-fix test/check/smoke sequence.
- Run the final repository-wide Standard security scan and resolve validated regressions in scope.
- Cut and start the final canonical local release only after isolated deployment passes; prove API, FieldNet, Operator, manifest, database, ontology, and rules all agree.
- Establish CDP Chrome and complete the accelerated browser failure/recovery cycles and the real 60-minute soak.
- Run the prepared operator rehearsal package; human results remain blocked until humans exist.
- Re-run source doctor and determine whether the mutable FIRMS checksum conflict is cleared by hash-bound snapshot identity.
- Capture current-release browser screenshots and responsive/failure evidence; existing screenshots belong to earlier releases.
- Produce final safe-staging evidence and final A–V maturity report. No final maturity score is yet certified.

## C. Exact implementation state

The following is the active-task file ledger. Files are intentionally unstaged. “Implemented” means present in the working tree, not final-release certified.

### Operator admission, session, and browser runtime

- `apps/operator-console/admission.mjs` — new one-time admission manager; replay capacity 128, bounded 8-hour cookie path, no secret persistence in evidence.
- `apps/operator-console/server.mjs` — accepts only the dedicated `?admission=` exchange, rejects legacy `?access`, sets HttpOnly/SameSite=Strict cookie, exposes readiness/release and Portugal-boundary proxy contracts. Implemented; canonical 4190 still runs the older release.
- `scripts/operator_open.mjs` — new safe open/admission launcher; wired as `npm run operator:open`.
- `apps/operator-console/index.html`, `package.json`, `README.md`, `scripts/build.mjs` — production/admission/build documentation and packaging updates implemented.
- `apps/operator-console/src/app.js` — authenticated hydration/disposal and session heartbeat; pointer handling compressed to remain within module budget. Implemented; static/build checks passed before final deployment failure.
- `apps/operator-console/src/pilotSession.js`, `runtimeLoader.js`, `vigiaApi.js` — session clearing/hydration and runtime identity behavior updated.
- `apps/operator-console/tests/admission-contract.mjs`, `browser-live-contract.mjs`, `proxy-contract.mjs` — admission/runtime/proxy contracts implemented and previously passing.

### Map and operator-focus product changes

- `apps/operator-console/src/map.js` — six explicit map states; no initial native image source; bounded fetch with exact MIME, 3 MB cap, 1.4 s timeout, Cache Storage/LRU, real governed Portugal boundary fallback, recovery, and preview lifecycle attributes.
- `apps/operator-console/tests/map-contract.mjs` — static map lifecycle/failure contract implemented and passed.
- `apps/operator-console/src/routes/overview.js` — reordered around “Review next”, “What changed”, “Main unknowns”, and explicit physical/reported truth.
- `apps/operator-console/src/routes/detect.js` — compact Detect control dock and focus continuity.
- `apps/operator-console/src/components.js`, `styles/components.css`, `styles/routes.css`, `styles/responsive.css` — supporting hierarchy, failure state, focus, and responsive changes.
- Existing release screenshots in `data/validation/release/operator-console-screenshots/` are not evidence for candidate `9a3c...`; final screenshots remain required.

### API reliability, identity, and observability

- `apps/api/src/modules/basemap/basemap-service.mjs`, `basemap-routes.mjs` — pinned production providers, exact MIME/3 MB enforcement, last-good fallback, provenance headers, and single-flight before request gating.
- `apps/api/test/basemap-reliability.test.mjs` — new reliability tests; passed in the latest focused run.
- `apps/api/src/modules/world/firms-gateway.mjs` — mutable FIRMS area snapshots now have content-hash-bound identifiers; source-doctor revalidation remains pending.
- `apps/api/src/server.mjs`, `apps/api/src/application/register-routes.mjs` — correlation/release response headers, structured completion logs, listener-first health projection, and safe startup timing fields.
- `apps/api/test/observability-contract.test.mjs` — new observability contract; passed.
- `scripts/production_smoke.mjs` — updated for separate API-only listener, public redacted readiness, and protected replay. Latest smoke passed.

### CAP integration and rehearsal

- `apps/api/src/modules/integrations/cap-feed-adapter.mjs` — real bounded CAP adapter implemented without fake endpoint or credentials.
- `apps/api/test/cap-feed-adapter.test.mjs` — 4/4 passed.
- `scripts/integration/run_cap_acceptance.mjs`, `docs/integration/CAP_AGENCY_ADAPTER.md`, package script `integration:cap:acceptance` — acceptance harness and operator documentation implemented; latest result is honestly `NOT_CONFIGURED` in `.tmp/operational-maturity-75/cap-integration-acceptance.json`.
- `scripts/rehearsal/prepare_operator_rehearsal.mjs`, `docs/operations/OPERATOR_REHEARSAL.md`, package script `rehearsal:open` — rehearsal package implemented but not run; no human outcome may be claimed.

### Deployment, recovery, and operations evidence

- `infra/Dockerfile.api` — copies required replay/validation inputs and creates/chowns `data/runtime/fieldnet`; all candidate API/migration/FieldNet images built in the latest drill. This did not resolve the current FieldNet unhealthy gate.
- `infra/Dockerfile.operator` — canonical Operator image; builder installs Python for safe-artifact build and includes the governed Portugal boundary.
- `.dockerignore` — explicitly retains required governed boundary data in Docker build context.
- `infra/docker-compose.remote-shadow.yml` — secret-file based PostGIS/API/FieldNet/Operator topology with health checks, restart policy, resource bounds, and separate ports. Current blocker is the FieldNet authority/health-check mismatch in this file plus the server authority calculation.
- `infra/REMOTE_SHADOW.md` — secret creation, deploy, upgrade, restore, evidence, and stop procedure documented.
- `apps/api/src/config/env.mjs`, `apps/field-node/src/server.mjs` — secret-file support implemented. FieldNet public-authority behavior is the immediate unresolved defect.
- `scripts/migrate_postgis.mjs` — bounded transient connection retry implemented.
- `apps/api/src/modules/storage/postgres-migration-runner.mjs`, `apps/api/test/operations-recovery.test.mjs` — clean migration compatibility repair plus regression test; focused recovery suite passed 19/19.
- `scripts/operations/run_backup_restore_drill.mjs`, package script `operations:backup-restore` — real isolated restore proof passed; retained proof at `.tmp/operational-maturity-75/recovery/backup-restore-proof.json`.
- `scripts/operations/run_deployment_recovery_drill.mjs`, `deployment-drill-runtime.mjs`, package script `operations:deployment-drill` — isolated clean deploy, migration, convergence, database interruption, stale-release rejection, forward recovery, crash recovery, and observability harness implemented. Latest run is `FAIL` at FieldNet health; cleanup passed.
- `scripts/operations/operator_maturity_soak.py`, package script `operations:soak` — accelerated failure matrix plus CDP/browser real-clock 60-minute soak harness implemented; Python compilation passed; full soak not run.

### Release and staging contract

- `scripts/release/build_release_manifest.mjs`, `data/validation/release/current-release-manifest.json` — candidate manifest generated as `9a3c...`; canonical running services remain `3fcc...` until an authorized final release restart.
- Root `package.json` — scripts added for admission, CAP acceptance, rehearsal, backup/restore, deployment drill, and soak.
- Required safe-staging outputs are `.tmp/operational-maturity-75/safe-staging-manifest.json` and `.tmp/operational-maturity-75/SAFE_STAGE_AND_COMMIT.command`. Do not execute the command.
- Exact future commit message, if the user later authorizes a commit: `Raise VIGIA operator, reliability, integration, and deployment maturity`.
- No staging or commit has occurred.

### Active-task evidence artifacts

- `.tmp/operational-maturity-75/recovery/backup-restore-proof.json` — `PASS`.
- `.tmp/operational-maturity-75/cap-integration-acceptance.json` — `NOT_CONFIGURED`, no live score eligibility.
- `.tmp/operational-maturity-75/deployment-drill/deployment-recovery-proof.json` — latest `FAIL` at FieldNet health.
- `.tmp/operational-maturity-75/deployment-drill/cleanup-proof.json` — `PASS`; no isolated project resources remain.
- Candidate manifest — `9a3c...`; not running canonically.

All other dirty paths shown by Git predate or overlap earlier VIGIA sprints and are preserved exactly. In particular, `apps/mission-dark`, `apps/web`, historical evidence trees, and prior release screenshots are not to be deleted or silently promoted into the canonical release.

## D. Repository state

- Repository root: `/Users/malmeida/Documents/Development/vigia`
- Branch: `vigia/intelligence-fabric-v1`
- HEAD: `124ac703d2ffcb2569db64b8db1955ce2a2363a4`
- Before writing this checkpoint: 209 Git status entries = 131 tracked modifications + 78 untracked entries.
- After writing this checkpoint: this file adds one untracked entry; expected total is 210 = 131 tracked modifications + 79 untracked entries.
- Tracked diff stat before/after checkpoint: 131 files changed, 31,048 insertions, 3,284 deletions.
- Full tracked binary diff size: 25,471,044 bytes.
- Full tracked binary diff SHA-256: `2962263f8e385e5edb1319d0d67efe392ca7ae2d56da710f50856738f94cd7f8`.
- Cached diff: 0 bytes, SHA-256 of empty input `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; `git diff --cached --quiet` returned 0.
- No files are staged. No commit was created. No reset, stash, clean, checkout, rebase, or destructive Git operation was run.
- Authoritative live inventories on resume: `git status --short`, `git diff --stat`, `git diff --name-status`, `git diff`, and `git diff --cached`.

Runtime state at checkpoint:

- API `127.0.0.1:4177`: listener PID 8022, running release `3fcc...`.
- FieldNet `127.0.0.1:4188`: listener PID 8042, running release `3fcc...`.
- Operator `127.0.0.1:4190`: listener PID 12269, `READY`, running release `3fcc...`.
- No listeners on isolated drill ports `5277`, `5288`, `5290`.
- No listener on CDP `9222`; Chrome/CDP was not started for the new candidate.
- Docker project `vigia-maturity-75-25756`: no remaining containers, volumes, or network. Cleanup proof passed.
- No soak or deployment-drill command remains running.

## E. Last verified good point

The last broadly verified source point before interruption is the candidate working tree that produced release manifest `9a3c...`, with these results:

- `npm test` — `PASS`, 622/622 tests.
- `npm run check` — `PASS`, 632 files inspected, 541 modules syntactically valid, acyclic, and within budgets.
- `npm run smoke` — `PASS`; API root 404, public readiness redacted, protected replay 401, no synthetic/demo leakage.
- Focused basemap + observability tests — `PASS`, 4/4.
- CAP adapter tests — `PASS`, 4/4.
- Focused operations recovery tests — `PASS`, 19/19.
- Focused intelligence tests — `PASS`, 37/37.
- Operator static verification and production build — `PASS`.
- Python compilation of the soak/browser scripts — `PASS`.
- `npm run operations:backup-restore` — `PASS`, real isolated database and archive recovery proof.
- `npm run integration:cap:acceptance` — command completed, result `NOT_CONFIGURED`; this is not a live integration pass.
- `npm run release:manifest` — `PASS`, candidate `9a3c...`.
- `npm run operations:deployment-drill` — `FAIL`; this is the current release blocker and invalidates any final deployment/7.5 claim.

The full suite/check/smoke results precede the final Dockerfile/clean-deployment adjustments. They remain useful evidence but must be rerun after the FieldNet authority repair.

Exact command ledger:

### DEV

- `npm run dev` — **NOT RUN in this maturity sprint**; canonical services were intentionally preserved.
- `npm run operator:status` — `PASS` at checkpoint; canonical Operator is `READY` on old release `3fcc...`.

### BUILD

- Root `npm run build` — **UNAVAILABLE**; no root `build` script exists.
- `npm --prefix apps/operator-console run build` — `PASS` in prior verification and in the latest Docker build.
- `docker compose -f infra/docker-compose.remote-shadow.yml up -d --build --wait --wait-timeout 300` — images built, overall `FAIL` because FieldNet was unhealthy.

### LINT

- Root `npm run lint` — **UNAVAILABLE**; no root `lint` script exists.
- Repository lint-equivalent structural gate is `npm run check` — latest `PASS`, but rerun required after next fix.

### TYPECHECK

- Root `npm run typecheck` — **UNAVAILABLE**; no root `typecheck` script exists.
- Syntax/module checks are included in `npm run check`; latest `PASS`, but not a typed-language compiler proof.

### TEST

- `npm test` — `PASS`, 622/622; rerun required after next fix.
- `node --test apps/api/test/basemap-reliability.test.mjs apps/api/test/observability-contract.test.mjs` — `PASS`, 4/4.
- `node --test apps/api/test/cap-feed-adapter.test.mjs` — `PASS`, 4/4.
- `node --test apps/api/test/operations-recovery.test.mjs` — `PASS`, 19/19.
- Focused intelligence test command used for the intelligence suites — `PASS`, 37/37; exact shell expansion should be re-derived from current `apps/api/test/intelligence-*.test.mjs` and domain intelligence tests rather than guessed.
- `npm run operator:verify:static` — `PASS`.
- `npm run smoke` — `PASS`.

### OTHER

- `npm run check` — `PASS`.
- `npm run operations:backup-restore` — `PASS`.
- `npm run integration:cap:acceptance` — `NOT_CONFIGURED`.
- `npm run release:manifest && npm run operations:deployment-drill` — manifest `PASS`, deployment `FAIL` at FieldNet health, cleanup `PASS`.
- `npm run operations:soak` — **NOT RUN**.
- `npm run rehearsal:open` — **NOT RUN**.
- `npm run source:doctor` after the FIRMS identity repair — **NOT RUN**.
- Final Standard security scan — **NOT RUN**.
- Final `npm run release:local`, `npm run release:certify`, `npm run db:doctor`, and `npm run operator:certify` for candidate `9a3c...` — **NOT RUN**.

## F. Exact next action

On `proceed`, first reread this file and capture fresh Git/process state. Then make exactly one minimal implementation repair:

1. Add an explicit FieldNet public authority contract, parallel to the Operator authority contract: configure `FIELDNET_PUBLIC_AUTHORITY` in `infra/docker-compose.remote-shadow.yml`; make `apps/field-node/src/server.mjs` validate the public listener against that configured authority; make the Compose FieldNet health check send the same authority in its `Host` header. Preserve strict host rejection. Add/update the tight FieldNet server/Compose contract test.

After that single repair, continue in this order:

2. Run the tight FieldNet/remote-shadow tests and `npm run check`.
3. Run `npm run release:manifest && npm run operations:deployment-drill`; require full `PASS`, cleanup `PASS`, migration 019, one release identity, database interruption recovery, stale-release rejection, API/FieldNet/Web crash recovery, and observability/resource evidence.
4. Run final `npm test`, `npm run check`, and `npm run smoke`.
5. Run the final repository-wide Standard security scan and address only validated in-scope findings, then rerun affected gates.
6. Run `npm run source:doctor`, preserve honest external blockers, and verify the FIRMS mutable-snapshot conflict is actually cleared.
7. Cut/start the canonical local release only after the isolated drill passes. Prove API, FieldNet, Operator, manifest, PostGIS migration 019, ontology, and rule-set identity agree.
8. Start CDP on `9222` without blocking the terminal, run admission/open, accelerated browser failure/recovery cycles, current-release screenshot certification, and then the uninterrupted real-clock `npm run operations:soak` for 60 minutes.
9. Run `npm run rehearsal:open`; capture machine evidence and leave human gates explicitly blocked until humans participate.
10. Run final DB doctor, release certification, Operator certification, safe-staging generation, no-staged-change proof, runtime process proof, and deliver the requested A–V report.

## G. Do-not-touch / do-not-regress

- Do not reset, stash, clean, checkout, delete, or overwrite the inherited dirty tree.
- Do not stage or commit. Do not execute `.tmp/operational-maturity-75/SAFE_STAGE_AND_COMMIT.command`.
- Do not restart canonical services merely to diagnose the isolated FieldNet failure.
- Do not weaken Host validation. Repair FieldNet by making the configured public authority and health probe agree.
- Do not expose bearer/operator/FieldNet secrets in URLs, logs, proof JSON, screenshots, or this checkpoint.
- Do not reintroduce ordinary-route `?access=` or reusable query-token admission.
- Do not regress migrations 017–019, original-source migration hashing, audit-chain integrity, release mismatch rejection, or listener-first health semantics.
- Do not silently turn `NOT_CONFIGURED`, missing, stale, reported-only, unsupported, or conflicting evidence into healthy/physical/current/confirmed.
- Do not use `apps/mission-dark` or `apps/web` as the canonical Operator Console; both remain quarantined products in the release manifest.
- Do not promote historical screenshots or the old canonical release as evidence for candidate `9a3c...`.

Visual failures that are release blockers:

- Any broken-image icon, blank map, endless spinner, or disappearing map container.
- A map failure without an explicit state and provenance-aware governed fallback.
- Loss of the Overview hierarchy: Review next, What changed, Main unknowns, and physical vs reported truth.
- Loss of the compact Detect control dock, selected-event continuity, or incident/evidence/handoff/PREVENT focus.
- Admission/reopen yielding a blank page, query token remaining in the URL, stale principal reuse, or hidden release mismatch.
- Clipping, overlap, unreadable focus, or non-operable controls at 1600×1000, 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, or 320×568.
- Invented tiles, invented observations, or visual substitution that obscures unavailable evidence.

## H. Intelligence constraints

- Intelligence is deterministic and evidence-bound. No generative inference may be presented as physical truth.
- Preserve exact observation IDs, source product IDs, timestamps/time basis, geometry, provenance, source family/class, conflict state, uncertainty, release ID, ontology version, and rules version through projections and operator decisions.
- Physical observations and reported incidents are distinct. Reported feeds may corroborate or conflict; they do not become physical sensing.
- Current evidence has no verified second current physical family. This is an external/data blocker, not an engineering pass.
- CAP is `NOT_CONFIGURED`; no real endpoint, credentials, acceptance, persisted agency projection, or operator-ready external flow exists.
- Human operator/specialist review is unavailable. Rehearsal preparation can be proven; human usability/decision outcomes cannot.
- Prevention claims remain bounded by the real Sentinel-2 review corpus and measurement debt. Do not claim causal prevention or field efficacy beyond the evidence.
- Source failures, checksum changes, stale products, MIME/size violations, timeouts, and conflicts must remain visible and must not be silently substituted.
- One final release identity must agree across manifest, API, FieldNet, Operator, database schema/migration, ontology, and deterministic rule set before release certification.

## I. Resume contract

Resume only when the user says `proceed`.

At resume:

1. Read this checkpoint completely.
2. Run fresh read-only `git status --short`, branch/HEAD, diff stat/name-status, full diff digest, cached diff, listener, Docker-project, release-identity, and proof checks.
3. Confirm no other actor changed the specific FieldNet/Compose files since this checkpoint. Preserve all unrelated work.
4. Perform the exact single repair in Section F, test it, and continue in the recorded order without routine confirmation.
5. Keep long-running processes in the background, track them, and stop only processes created for temporary drills. Do not stop canonical services except as part of the later authorized final local-release step after the isolated deployment gate passes.
6. Remain honest: the active task is incomplete until the deployment drill, final security pass, current-release browser certification, real 60-minute soak, final identity/database certification, safe-staging proof, and A–V report are all complete.

This checkpoint itself is untracked and intentionally unstaged.
