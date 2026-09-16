# AGENTS.md

## Mission
VIGIA is a Portugal-first operational crisis-intelligence system for understanding incidents, nearby people and places, access, infrastructure, weather, history, and response constraints.

Primary users include emergency/operations professionals and portfolio visitors using the explicitly isolated demo environment. Core outcomes are fast situational understanding, traceable operational facts, safe decision support, and graceful behavior when data is partial, stale, unavailable, or unknown.

## Operating principles
- Make the smallest correct change that satisfies the requested outcome.
- Preserve existing public behavior, domain invariants, and compatibility unless the task explicitly authorizes a change.
- Prefer established repository patterns over introducing a new abstraction, dependency, framework, or parallel data path.
- Do not modify generated files, lockfiles, infrastructure, schemas, migrations, or public APIs unless the task requires it.
- Before changing an unfamiliar subsystem, read its nearest `AGENTS.md` and only the relevant guide under `docs/agent/`.
- When requirements are ambiguous, choose the safest reversible implementation or ask one focused blocking question.
- Never expose secrets, weaken authorization, bypass validation, suppress failures, or silently relax fail-closed behavior.
- Never fabricate operational facts, status, routes, availability, capacity, confidence, or predictions. Unknown is not safe; missing is not zero.
- Preserve provenance, timestamps, freshness, limitations, and the distinction between observed, historical, forecast, inferred, and synthetic information.
- Production and demo/synthetic data must never mix. Portfolio demo data stays in an isolated database and remains explicitly `SHADOW` / `exercise` / synthetic.

## Environment
- Package manager: `npm`
- Runtime: Node.js `>=22`
- Install: `npm install`
- Core tests: `npm test`
- Intelligence tests: `npm run test:intelligence`
- Integration tests: `npm run test:integration`
- Operator-console static verification: `npm --prefix apps/operator-console run verify:static`
- Operator-console build: `npm --prefix apps/operator-console run build`
- Integrated certification: `npm run certify:integrated-quality` when the task crosses full-system boundaries
- There is no universal repository-wide lint/typecheck command. Do not invent one; use package-local commands that actually exist.

## Repository map
- `apps/api/` — API server, orchestration, persistence adapters, ingestion, intelligence services. Read its local `AGENTS.md` before editing.
- `apps/operator-console/` — operator-facing web application. Read its local `AGENTS.md` before editing.
- `packages/domain/` — shared domain contracts, invariants, event-fabric and deterministic decision logic. Read its local `AGENTS.md` before editing.
- `infra/` — deployment/runtime entrypoints and production/demo bootstrapping.
- `scripts/` — migrations, seeding, certification, import and maintenance scripts.
- `docs/agent/` — task-specific engineering guidance; read only what the task needs.
- `.agents/skills/` — focused playbooks for specialized or high-risk workflows.

## Task routing
Read only the guide(s) relevant to the work:
- Frontend/UI, maps, responsive behavior, accessibility: `docs/agent/frontend.md`
- Backend/API/domain-service changes: `docs/agent/backend.md`
- Operational truth, provenance, safety, demo/production boundaries: `docs/agent/truth-safety.md`
- Tests and certification: `docs/agent/testing.md`
- Git, handoff, release/deploy claims: `docs/agent/delivery.md`

Use skills only when their narrow trigger applies:
- Database/PostGIS schema, migration, or index changes: `.agents/skills/database-migrations/SKILL.md`
- Render/Neon/runtime/deployment changes: `.agents/skills/deployment-change/SKILL.md`
- Dense operational data surfaces: `.agents/skills/data-rich-ux/SKILL.md`
- Implementing from a screenshot/mockup: `.agents/skills/mockup-to-code/SKILL.md`
- Explicit redesign/recovery work: `.agents/skills/redesign-audit/SKILL.md`
- New visual art direction when the task actually needs it: `.agents/skills/product-ui-art-direction/SKILL.md`
- Responsive/accessibility-specific work: `.agents/skills/responsive-accessibility/SKILL.md`
- Final visual/browser acceptance when visual work changed: `.agents/skills/visual-qa/SKILL.md`
- Impeccable commands: only when the user explicitly invokes Impeccable or a named Impeccable command.

Do not load every skill for ordinary work.

## Completion standard
- Implement only the requested scope and remove dead code introduced by the change.
- Run the narrowest meaningful validation first; expand validation when the change crosses subsystem boundaries.
- Never report a test, browser check, deployment, health check, or production state as successful unless it was actually verified.
- Distinguish PASS, FAIL, BLOCKED, and NOT RUN. External dependency failures are not passes.
- Report changed behavior, important files changed, validation run and result, plus unresolved risks or follow-ups.
- Preserve unrelated user work and leave the working tree in a deliberate state.
