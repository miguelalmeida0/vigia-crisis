---
name: redesign-audit
description: Audits and upgrades an existing interface without breaking its product logic. Use for UI recovery, redesigns, visual cleanup, design-system migrations, legacy frontend improvement, or when the current interface feels generic, cluttered, inconsistent, inaccessible, or unlike a supplied reference.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Redesign Audit

## Rule

Audit first. Do not start by changing colors or adding a new component library.

## Phase 1 — Inventory

Record:

- framework and styling architecture;
- design tokens and fonts actually loaded;
- route/component hierarchy;
- global chrome owner;
- primary user tasks;
- working interactions that must survive;
- loading/error/empty/stale/partial states;
- responsive breakpoints and overflow;
- accessibility semantics;
- screenshots at target viewports;
- current git state.

## Phase 2 — Diagnose

Rank defects by user impact:

1. Wrong information architecture or missing primary surface.
2. Broken task flow or ambiguous affordance.
3. Responsive/keyboard/accessibility failure.
4. Data/state dishonesty.
5. Hierarchy and density failure.
6. Typography, spacing, color, geometry, iconography.
7. Motion and polish.

Identify AI-slop signatures, but do not replace them with a different fashionable template.

## Phase 3 — Preserve or replace

For every major component state:

- `PRESERVE` — function and presentation are sound.
- `RESTYLE` — logic is sound; visual layer is weak.
- `RESTRUCTURE` — correct data, wrong hierarchy/markup.
- `REBUILD` — component prevents usability or fidelity.
- `REMOVE` — no product value.

Do not preserve bad markup because CSS already exists. Do not rewrite working domain/data/auth logic for a visual change.

## Phase 4 — Implement

Work from shared shell and tokens outward. Fix the highest-impact route/region first. After each coherent slice, validate functionality and capture the route.

## Exit gate

- [ ] Before/after route screenshots exist.
- [ ] Working interactions preserved.
- [ ] No fixture or data truth regression.
- [ ] Visual hierarchy materially improved.
- [ ] Responsive matrix passes.
- [ ] Accessibility states pass.
- [ ] No unexplained new dependencies.
