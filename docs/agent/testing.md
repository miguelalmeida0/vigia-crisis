# Testing & Certification Guide

Use this guide when changing behavior, adding regressions tests, or making completion/certification claims.

## Validation strategy
- Run the narrowest meaningful test first; broaden only when the change crosses subsystem boundaries.
- Prefer existing tests near the changed behavior before creating a new harness.
- Regression tests should reproduce the actual failure mode, not a simplified proxy that cannot fail for the same reason.
- For query/algorithm rewrites, compare old and new behavior directly when semantic equivalence matters.
- Keep fixture/golden validation separate from canonical/live-data validation.

## No false pass
- Never mark PASS because a command exited zero if the assertion did not verify the intended outcome.
- Never silently skip failed prerequisites, browser errors, network errors, source failures, or unavailable external systems.
- Do not mock the exact integration being certified as live.
- Report external blockers as BLOCKED or NOT RUN, not PASS.

## Common commands
Use only those relevant to the change:
- Core: `npm test`
- Intelligence: `npm run test:intelligence`
- Integration: `npm run test:integration`
- Operator static checks: `npm --prefix apps/operator-console run verify:static`
- Operator build: `npm --prefix apps/operator-console run build`
- Integrated quality: `npm run certify:integrated-quality`

## UI/runtime work
When visual or interaction behavior changes, validate the real rendered route at representative desktop/mobile sizes, inspect console/network failures, and verify keyboard/focus behavior where applicable. Use `.agents/skills/visual-qa/SKILL.md` for final visual acceptance.

## Completion report
Use explicit status language:
- PASS — actually executed and met the stated assertion
- FAIL — executed and did not meet it
- BLOCKED — could not execute because of a concrete external prerequisite
- NOT RUN — intentionally not executed; state why

Include the exact commands/checks run and unresolved failures. Do not hide pre-existing failures; distinguish them from regressions with evidence.
