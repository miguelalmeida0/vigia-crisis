# VIGIA release candidate — 17 September 2026

## Status

This branch is **code-ready but not yet deployment-certified**. The release blockers found in the portfolio demo path have been fixed on an isolated branch. No Render deployment, Neon write, worker activation, paid-plan change, or modification to `vigia-live` has been performed.

- Base: `integration/vigia-xiii` at `17e16ddd2e40af2e17e3685346246f18d573d682`
- Candidate: `fix/vigia-release-readiness-2026-09-17`
- Canonical public exercise: `PT-2026-5440CF7B01`
- Runtime mode required for the portfolio candidate: `ephemeral_local_postgis`
- Recurring operational workers: **must remain OFF**

## Release blockers fixed

### 1. Neon is removed from the portfolio runtime dependency chain

`render.demo.yaml` is now the single canonical candidate blueprint. It uses the Docker runtime, the 512 MiB service class, this repository and this release branch, manual deployment only, and **does not accept or declare `VIGIA_DATABASE_URL`**. The demo starts a loopback-only disposable PostgreSQL 15 + PostGIS database inside its own container. The application role is nonsuperuser and ambient external database credentials are rejected before initialization.

This does not change `vigia-live`, its database, or production startup scripts. The disposable database is suitable only for the explicitly synthetic portfolio scenario; it is not a persistence architecture for real operational data.

### 2. Situation-job backlog cannot create the previous retry/memory loop

The queue now enforces a 250,000-byte logical JSON payload ceiling before admission and after coalescing. PostgreSQL checks logical `jsonb::text` bytes rather than compressed storage size. Malformed, oversized and retry-exhausted legacy jobs are converted to bounded metadata-only quarantine records. Transient work has exponential backoff and a hard five-attempt ceiling; missing-location work has a lower ceiling. Revision guards prevent an old worker from deleting or overwriting a newer revision.

The repair is backward-compatible with the existing table and does not delete historical incidents. The scoped maintenance command remains dry-run by default, incident allowlisted, host-bound, batch-limited, and double-confirmed for writes.

### 3. Demo gateway readiness and streaming are now fail-closed

`/__operator/ready` verifies the backend dependency, `servicesReady`, and all four release-identity fields instead of returning unconditional success. Proxy traffic is bounded and backpressured, decompression headers are corrected, oversized responses are aborted, SSE disconnect aborts upstream work, connection shutdown is finite, and missing assets return 404 rather than disguised HTML.

### 4. Seed identity is now a startup invariant

Before the API opens, the governed synthetic seed must produce exactly:

- incident: `incident:demo:pedrogao-grande-portfolio-exercise`
- import status: `VALID`
- accepted records: **13**
- universe: `SHADOW`
- exercise: `true`
- a non-empty canonical event identity

For the self-contained release candidate, the seed is then replayed once against the same disposable database. Startup fails unless the replay is explicitly idempotent and preserves the same canonical event identity. Successful startup emits `demo_seed_contract_verified`; the 20-minute release gate requires that marker and all contract fields.

This is a deterministic replay verification, not a load/stress test. Recurring workers remain disabled.

## Verification completed in this session

Local patch-workspace verification currently passes:

- **37/37 Node tests**: queue policy, legacy oversized-job quarantine, stale-revision protection, gateway dependency/readiness/streaming behavior, release safeguards, Docker blueprint invariants, and deterministic seed/replay contract.
- **7/7 Python stability-analyser tests**.
- `bash -n infra/demo/local-postgis-start.sh`: pass.
- `node --check infra/render-demo-start.mjs`: pass.
- `node --check infra/public-demo-server.mjs`: pass.
- `python -m py_compile scripts/release/acceptance-gate.py`: pass.

Total focused checks: **44/44 passing**.

These checks do **not** substitute for a real PostgreSQL migration run, Docker build, browser acceptance run, or measured 512 MiB soak.

## GitHub Actions blocker

The workflow is configured to perform the full candidate gate automatically. The latest GitHub-hosted attempt failed before executing step 1: its job has an empty step list and `runner_id: 0`. Changing the requested hosted-runner label did not resolve allocation. No application-test failure was produced, and no billing/account cause is asserted without evidence.

Do not weaken or remove release checks to make this status green.

## Full certification gate still required

A real candidate environment must pass, in order:

1. Root application regression suite: `npm test`.
2. Operator static verification: `npm --prefix apps/operator-console run verify:static`.
3. Build `infra/Dockerfile.demo` successfully.
4. Start PostgreSQL 15 + PostGIS and apply the complete migration set.
5. Run the real PostgreSQL situation-queue regression against a disposable database.
6. Boot the complete candidate under a **512 MiB cgroup limit**.
7. Prove dependency-backed readiness and matching release identity.
8. Prove seed contract: VALID, 13 records, SHADOW, exercise, stable canonical identity, idempotent replay.
9. Exercise Command Overview, Incidents, Incident Detail, Fire Activity, Response & Access, National Awareness, and Reports compatibility through the real browser surface.
10. Observe the canonical public incident `PT-2026-5440CF7B01` in backend responses.
11. Load real basemap responses and a usable map state; no mocked screenshots count.
12. Pass 1440px and 390px layouts with no relevant console, page, HTTP, network, clipping or horizontal-overflow failures.
13. Exercise routes during a **20-minute** whole-container memory observation; no OOM, no restart, at least 32 MiB headroom, warm working-set slope <= 0.5 MiB/min, warm drift <= 16 MiB.
14. Runtime logs must prove `recurringOperationalWorkers:false` and `state:"bounded_read_plane"`.
15. Restart the container and pass the smoke gate again.
16. Manually inspect the generated route screenshots before deployment.

The workflow `.github/workflows/vigia-release-readiness.yml` encodes these gates and never deploys.

## Manual equivalent

```sh
git fetch origin
git switch fix/vigia-release-readiness-2026-09-17
npm ci --include=dev --ignore-scripts
npm --prefix apps/operator-console ci --include=dev --ignore-scripts
node --test \
  apps/api/test/situation-job-queue-bounds.test.mjs \
  infra/test/demo-gateway-readiness.test.mjs \
  infra/test/release-guards.test.mjs \
  infra/test/demo-seed-contract.test.mjs
python3 infra/test/stability-gate.test.py
npm test
npm --prefix apps/operator-console run verify:static

docker build -f infra/Dockerfile.demo -t vigia-release-candidate .

docker run --rm --memory=512m --memory-swap=512m --cpus=0.5 \
  -e VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY \
  -e VIGIA_DEMO_DATABASE_MODE=ephemeral_local_postgis \
  -e VIGIA_OPERATOR_PUBLIC_SCHEME=http \
  -e VIGIA_OPERATOR_PUBLIC_AUTHORITY=127.0.0.1:10000 \
  -e VIGIA_DEMO_QUEUE_TEST_ONLY=1 vigia-release-candidate

docker run -d --name vigia-release-candidate \
  --memory=512m --memory-swap=512m --cpus=0.5 \
  -p 127.0.0.1:10000:10000 \
  -e VIGIA_DEMO_CONFIRM=SYNTHETIC_DEMO_ONLY \
  -e VIGIA_DEMO_DATABASE_MODE=ephemeral_local_postgis \
  -e VIGIA_OPERATOR_PUBLIC_SCHEME=http \
  -e VIGIA_OPERATOR_PUBLIC_AUTHORITY=127.0.0.1:10000 \
  vigia-release-candidate

python3 -m venv .tmp/release-venv
.tmp/release-venv/bin/pip install -r scripts/release/requirements.txt
.tmp/release-venv/bin/python -m playwright install chromium

docker exec vigia-release-candidate node infra/demo/local-healthcheck.mjs
.tmp/release-venv/bin/python scripts/release/acceptance-gate.py \
  --base-url http://127.0.0.1:10000 \
  --container vigia-release-candidate \
  --seconds 1200 \
  --output .tmp/release-gate

docker restart vigia-release-candidate
# wait for local-healthcheck again
.tmp/release-venv/bin/python scripts/release/acceptance-gate.py \
  --base-url http://127.0.0.1:10000 \
  --once \
  --output .tmp/release-restart
```

## Neon backlog

The exhausted Neon project is no longer required by the candidate demo. Do not perform repeated quota probes. Once connectivity is restored, stale synthetic situation jobs may be cleaned separately using the scoped dry-run maintenance command. Never point that command at `vigia-live`.

```sh
node scripts/release/quarantine-situation-jobs.mjs \
  --expected-host=EXACT_DEMO_DATABASE_HOST \
  --incident=PT-2026-5440CF7B01

# Only after reviewing dry-run metadata:
# add --apply --confirm=QUARANTINE_SYNTHETIC_JOBS
```

Quarantine cleanup does not restore transfer already consumed during the current Neon billing period.

## Deployment boundary

`render.demo.yaml` is a **manual candidate blueprint**, not authorization to deploy. `autoDeployTrigger` is off. The recruiter-facing service must not be switched until the full Docker/PostGIS/browser/memory/restart gate and manual screenshot review pass.

Render workspace inspection is also intentionally blocked until the user explicitly selects the connected workspace. `vigia-live` remains out of scope for this candidate.
