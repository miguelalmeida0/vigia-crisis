---
name: deployment-change
description: Safely change or verify VIGIA deployment/runtime behavior on Render, Neon, or equivalent hosting. Use for service creation, runtime start/health logic, environment-variable wiring, production/demo deployment separation, database connectivity, cold-start/restart behavior, or live deployment verification. Do not use for ordinary application code changes with no deployment/runtime impact.
---

# Deployment Change Skill

## Required discovery
1. Read `docs/agent/delivery.md`, `docs/agent/truth-safety.md`, and the relevant runtime/infra files.
2. Identify the exact target service/environment, branch/commit, health endpoint, database target, auto-deploy behavior, and current pricing plan.
3. Inspect configuration names and required values without printing secrets.
4. Confirm whether the target is production, portfolio demo, preview, or local; never infer this from a generic service name alone.

## Invariants
- Do not touch `vigia-live` or the production database unless the task explicitly targets production.
- Demo/synthetic deployments use an isolated database and retain explicit `SHADOW` / `exercise` / synthetic labeling.
- Do not copy secret values into chat, logs, commits, screenshots, or docs.
- Do not create paid resources, enable usage-based billing, or remove hard cost controls without explicit user approval.
- A web service must bind its assigned `$PORT` early enough for the platform; readiness must remain non-success until migrations/bootstrap/critical services are genuinely ready.
- Do not fake health with an unconditional 200 response.
- Startup/restart must be bounded and diagnosable; a failed seed/source/init phase must surface a concrete failure instead of hanging indefinitely.
- Preserve fail-closed behavior and production/demo isolation while fixing deployment convenience issues.

## Procedure
1. Establish current branch/commit and service configuration.
2. Reproduce the startup/deploy path locally where practical, including fresh and restart states.
3. Make the smallest runtime/configuration change.
4. Verify build and start commands using the same entrypoints the platform uses.
5. For demo data, test fresh DB, partial bootstrap/restart, already-seeded restart, and deterministic identity/idempotency.
6. Push only after local validation; do not claim a live fix from local success alone.
7. Verify the actual deployment status, runtime logs, public URL, health/readiness endpoint, migration head, and material application behavior.

## Cost check
Before recommending new infrastructure, state:
- free-tier expiry/pause/sleep behavior
- storage/compute/request limits
- overage or upgrade behavior
- data-retention/deletion risk
- whether a hard spend cap exists

Prefer zero-cost/predictable resources for the portfolio unless the user explicitly approves otherwise.

## Completion report
State:
- target service/environment
- branch/commit deployed
- build/deploy status
- health/readiness result
- migration/bootstrap result
- demo/production isolation result where relevant
- exact live URL only if verified
- remaining runtime or billing limitations
