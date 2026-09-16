---
name: impeccable
description: Run the repository's Impeccable UI workflow only when the user explicitly asks for Impeccable or names an Impeccable command such as critique, audit, polish, bolder, quieter, distill, harden, animate, colorize, typeset, layout, delight, clarify, adapt, optimize, live, init, document, extract, or shape. Do not auto-select this skill for ordinary frontend work.
metadata:
  version: 4.2.2
---

# Impeccable Router

This is an explicit-invocation skill. Ordinary VIGIA UI work follows `docs/agent/frontend.md` and the narrower project skills. Use Impeccable only when the user requests it or clearly invokes one of its named commands.

## Setup
1. From the user's project cwd, run `<skill-base-dir>/scripts/impeccable context` once per session. On Windows without `sh`, use `<skill-base-dir>/scripts/impeccable.cmd`.
2. If setup fails, report that failure before editing; do not pretend Impeccable context loaded.
3. Read existing `PRODUCT.md` / `DESIGN.md` only when the selected Impeccable reference requires them. Do not invent missing product context.

## Routing
- No command: read `reference/routing.md` and present its menu; do not auto-run a command.
- Explicit named command: load only that command's reference below.
- New surface/replacement visual world: use `reference/new-work.md`.
- Before UI editing, load `reference/craft-floor.md` once; do not load it for planning-only work.

## Command references
- `shape` → `reference/shape.md`
- `init` → `reference/init.md`
- `document` → `reference/document.md`
- `extract` → `reference/extract.md`
- `critique` → `reference/critique.md`
- `audit` → `reference/audit.md` (native: `reference/audit.native.md`)
- `polish` → `reference/polish.md`
- `bolder` → `reference/bolder.md`
- `quieter` → `reference/quieter.md`
- `distill` → `reference/distill.md`
- `harden` → `reference/harden.md`
- `onboard` → `reference/onboard.md`
- `animate` → `reference/animate.md`
- `colorize` → `reference/colorize.md`
- `typeset` → `reference/typeset.md`
- `layout` → `reference/layout.md`
- `delight` → `reference/delight.md`
- `overdrive` → `reference/overdrive.md`
- `clarify` → `reference/clarify.md`
- `adapt` → `reference/adapt.md` (native: `reference/adapt.native.md`)
- `optimize` → `reference/optimize.md`
- `live` → `reference/live.md`
- `craft` → `reference/craft.md` (deprecated alias)

## Guardrails
- The user's brief and established VIGIA product truth outrank Impeccable aesthetic preferences.
- Refinement preserves incumbent behavior/copy outside scope; redesign may replace the visual world but not product truth or safety constraints.
- Do not run open-ended polish loops. Use one batched inspection/fix pass and at most one confirmation pass.
- Do not repair Impeccable context drift as a side effect unless the user explicitly requests it; follow an explicit `CONTEXT_STALE` instruction only as documented by the tool.
- Hooks, doctor, pin/unpin, and other Impeccable maintenance commands are opt-in; load their reference only when invoked.
