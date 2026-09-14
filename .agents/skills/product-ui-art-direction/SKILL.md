---
name: product-ui-art-direction
description: Defines and implements a context-specific, production-grade visual direction for product interfaces, dashboards, tools, and app surfaces. Use for any new page, component, navigation shell, design-system decision, or visual restyle where hierarchy, typography, density, interaction, and perceived quality matter.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Product UI Art Direction

## Scope

Use for application and product UI. This is not a marketing-page AIDA framework. Dense tools, dashboards, editors, research systems, command surfaces, and operational software require their own hierarchy.

## Workflow

1. Read the request, product context, existing design system, references, and current UI.
2. Produce the required design read from root `AGENTS.md`.
3. Name one visual direction and one dominant interaction model.
4. Identify the dominant object and subordinate rails.
5. Define semantic tokens before route-specific CSS.
6. Sketch desktop, tablet, and mobile composition before coding.
7. Implement structure before decoration.
8. Run the anti-slop and release checks.

## Mandatory design dials

Declare:

- `DESIGN_VARIANCE` 1–10
- `MOTION_INTENSITY` 1–10
- `VISUAL_DENSITY` 1–10

For dense product tools, high density means compact alignment, hairlines, tabular numbers, and controlled grouping. It does not mean many cards or tiny text.

## Product hierarchy rules

- One dominant work surface per route.
- Secondary rails may support, never compete.
- Primary action count should be minimal and unmistakable.
- Use progressive disclosure for expert detail.
- Keep related control near the affected object.
- Do not use hero-section logic inside application routes.
- Do not create KPI cards unless comparison and immediate monitoring genuinely require them.
- Do not use decorative motion in safety-critical or high-concentration workflows.

## Art-direction commitment

Choose one coherent system across:

- typography;
- color temperature;
- geometry;
- line/elevation model;
- icon language;
- imagery/data-visualization treatment;
- motion physics;
- density;
- empty/degraded states.

Do not mix unrelated trends to make the page look “designed.”

## Pre-flight

- [ ] Product, user, task, dominant object, and risk profile identified.
- [ ] One direction chosen and named.
- [ ] Dials declared.
- [ ] Primary hierarchy visible without reading every label.
- [ ] No container soup.
- [ ] Clickable and passive objects are distinct.
- [ ] Semantic tokens exist.
- [ ] Mobile composition is explicit.
- [ ] Loading, error, empty, partial, stale, and unavailable states considered.
- [ ] Visual QA plan defined before implementation is called done.
