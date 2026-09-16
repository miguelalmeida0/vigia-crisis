# Frontend / Operator Console Guide

Use this guide for changes under `apps/operator-console/` or other user-facing web surfaces.

## Product rules
- Preserve the existing VIGIA visual system unless the task explicitly authorizes redesign.
- Keep the primary operational object visible; avoid card/container proliferation and decorative dashboard chrome.
- Render only data the backend/domain owns. Do not manufacture status, readiness, confidence, capacity, route safety, or source health in presentation code.
- Distinguish observed, historical, forecast, stale, unavailable, unknown, and synthetic/demo information in copy and state.
- Prefer progressive disclosure for technical provenance and diagnostics; primary copy should be operationally understandable.

## Interaction and layout
- Reuse existing components, tokens, spacing, typography, and control patterns before adding primitives.
- Preserve keyboard operation, visible focus, semantic HTML, loading/error/empty states, and reduced-motion behavior.
- Responsive changes must solve layout architecture rather than hide overflow or scale the desktop UI down.
- Maps, tables, timelines, and dense panels must retain meaningful usable area on narrow screens.
- Abort or ignore stale requests when selection/route context changes.

## Maps and operational data
- Basemap or optional-layer failure must not destroy the rest of the incident experience.
- Do not present “no ingested restriction” as “road open”, or missing facility metadata as negative evidence.
- Show provenance/freshness near important claims when it materially changes interpretation.

## Skills
Use only when relevant:
- Dense operational UI: `.agents/skills/data-rich-ux/SKILL.md`
- Screenshot/mockup implementation: `.agents/skills/mockup-to-code/SKILL.md`
- Explicit redesign: `.agents/skills/redesign-audit/SKILL.md`
- New visual direction: `.agents/skills/product-ui-art-direction/SKILL.md`
- Responsive/accessibility work: `.agents/skills/responsive-accessibility/SKILL.md`
- Final visual/browser acceptance: `.agents/skills/visual-qa/SKILL.md`

## Validation
Start with the narrowest relevant checks, then broaden when the change crosses routes or shared primitives:
- `npm --prefix apps/operator-console run verify:static`
- `npm --prefix apps/operator-console run build`
- browser checks for changed routes and interactions
- console/network inspection when runtime behavior changed

Also read `docs/agent/truth-safety.md` when the UI changes how operational facts, uncertainty, demo data, provenance, or source health are presented.
