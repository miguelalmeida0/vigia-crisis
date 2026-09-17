---
name: visual-qa
description: Performs deterministic browser-based visual acceptance for frontend work using screenshots, overlays, pixel differences, geometry, computed styles, responsive checks, interaction tests, and canonical data verification. Use before any visual completion claim or when exact mockup fidelity is required.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Visual QA

## Principle

The implementing agent may not certify its own work by opinion. Evidence must be reproducible.

## Deterministic capture

Use a pinned browser/runtime where possible. Record:

- browser/version;
- CSS viewport;
- device scale;
- locale/timezone;
- color scheme;
- reduced-motion preference;
- font readiness;
- clock/random fixture state;
- route and data lane.

Before capture:

- wait for `document.fonts.ready`;
- disable or settle animations;
- hide the caret;
- wait for network/app readiness;
- confirm two consecutive captures are stable when dynamic rendering is involved.

## Required artifacts for locked references

Per route:

- `reference.png`;
- `runtime.png`;
- `overlay-50.png`;
- `difference.png`;
- `metrics.json`;
- `geometry-report.json`;
- `style-report.json`.

## Required lanes

- **Golden lane:** deterministic data matching visual references; impossible in production.
- **Canonical lane:** real backend/runtime; verifies truthful states, interactions, and integrations.

Golden proves design. Canonical proves product truth. Neither replaces the other.

## Mandatory browser checks

- target and responsive screenshots;
- console warnings/errors;
- failed network requests;
- keyboard navigation/focus;
- loading, error, empty, stale, partial, and unavailable states;
- direct route loads and browser back/forward;
- rapid selection changes and stale-response protection;
- resizing and orientation changes;
- map/graph scene identity and selection;
- provider failure and recovery when relevant.

## No-cheating rules

Do not:

- replace references;
- update baselines without explicit approval;
- mask missing panels;
- crop failures;
- change thresholds because the implementation fails;
- use screenshot-only CSS to hide canonical defects;
- report global percentages without identifying missing required regions;
- call an HTTP 200 or zero overflow a visual pass.

## Completion report

Report exact metrics and artifact paths. Say `FAIL` when any mandatory gate fails. Never assign an invented taste score.
