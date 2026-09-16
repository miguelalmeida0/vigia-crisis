# apps/operator-console/AGENTS.md

## Scope
This package contains VIGIA's operator-facing web application.

## Local rules
- Read `../../docs/agent/frontend.md` before UI, map, responsive, or accessibility changes.
- Read `../../docs/agent/truth-safety.md` when changing how operational facts, provenance, uncertainty, source health, or demo data are presented.
- Reuse existing design-system components and tokens before adding new primitives.
- Keep operational state truthful: do not derive authority, readiness, capacity, route safety, or source health in presentation code.
- Preserve keyboard navigation, visible focus, semantic HTML, loading/error/empty states, and reduced-motion behavior for changed interactions.
- Keep server/client boundaries explicit and avoid moving large geospatial/data processing into the browser without a concrete reason.
- For final visual acceptance, use `.agents/skills/visual-qa/SKILL.md` only when visual behavior changed.

## Validation
Start with:
- `npm run verify:static`
- `npm run build`

Then add browser/runtime checks when the changed behavior requires them.
