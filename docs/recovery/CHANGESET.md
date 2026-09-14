# VIGIA reality cutover changeset

This worktree already contained a large uncommitted P0 recovery changeset at cutover start. It was preserved. The authoritative path-level delta is `git status --short` / `git diff`; the reality-specific changes are grouped below.

## R0 production boundary

- Production integrity: `packages/domain/src/production-integrity.mjs`, physical observation/tracker provenance, production event repository guard.
- Production composition/config: `apps/api/src/config/env.mjs`, `create-services.mjs`, `register-routes.mjs`, `server.mjs`, `.env.example`, `package.json`.
- Production identity/state: request context, control service, operator-state repository, ground-truth/readiness services, web API and role policy.
- Fixture removal: fixture gateway/seeds/finding catalogue and generated web assets moved below `apps/api/test/fixtures/`; production branches removed from world, imagery, observation, exposure and detection modules.
- Served product: PREVENT/OUTCOMES/FIELD/ACTION hidden where unearned; fake field app moved to test fixtures; local event-save UI and routes removed.
- Verification: `scripts/production_reality_gate.mjs`, `production_smoke.mjs`, production browser QA and `apps/api/test/production-reality.test.mjs`.
- Replay split: synthetic corpus/CLI moved to TEST; external replay CLI requires an attributable real corpus.

## R1 acquisition foundation

- `apps/api/src/modules/acquisition/acquisition-store.mjs`
- `apps/api/src/modules/acquisition/http-acquirer.mjs`
- Raw response support in `apps/api/src/shared/fetch.mjs`
- ptdata and FIRMS gateways wired to archive-before-normalize and durable checkpoints
- `/api/v10/acquisition/status`
- `apps/api/test/acquisition-fabric.test.mjs`

## Reality documents

- `docs/reality/PRODUCTION_CUTOVER.md`
- `docs/reality/REALITY_SCORECARD.md`
- `docs/reality/LIVE_SOURCE_STATUS.md`
- `docs/reality/REPLAY_CORPUS.md`
- `docs/reality/KNOWN_LIMITATIONS.md`
- `docs/reality/RELEASE_GATES.md`
- `docs/recovery/STATUS.md`

R0 is bounded to fixture-free production and passes. R1 is in progress and does not pass because no real point-level thermal source has been acquired in the runtime.
