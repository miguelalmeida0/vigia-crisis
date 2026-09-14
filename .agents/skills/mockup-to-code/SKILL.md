---
name: mockup-to-code
description: Converts supplied screenshots, Figma exports, or locked mockups into production frontend with measured geometry and deterministic visual comparison. Use when the reference is a specification, when the user asks for pixel parity, or when an implementation repeatedly looks different from approved designs.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Mockup to Code

## Source-of-truth classification

Declare one:

- `LOCKED_SPECIFICATION` — reproduce exactly.
- `DESIGN_DIRECTION` — preserve principles, adapt details.
- `INSPIRATION` — do not copy composition blindly.

When locked, the reference outranks the existing implementation.

## Required workflow

1. Verify reference dimensions, crop, scale, and integrity hash.
2. Inventory fonts, colors, spacing, grids, borders, radii, shadows, icons, and major regions.
3. Define the exact golden viewport and device scale.
4. Create a visual contract with stable `data-vqa` identifiers and target bounding boxes.
5. Separate golden fixture data from canonical/live data.
6. Build shared shell and dominant geometry first.
7. Capture runtime at the exact CSS viewport.
8. Generate reference, runtime, 50% overlay, difference, geometry, and style artifacts.
9. Fix the highest-displaced/highest-difference region first.
10. Repeat until the acceptance threshold is met.

## Hard rules

- Never use the reference image as a production background.
- Never crop away mismatches.
- Never widen thresholds to pass.
- Never mask an entire missing component.
- Never use `transform: scale()` or CSS zoom to force parity.
- Never compare changing live data against a static mockup without a deterministic golden lane.
- Never claim pixel parity from code review alone.
- Never replace dynamic maps/graphs with screenshots.

## Geometry and style evidence

For each major region capture:

- x, y, width, height;
- display/grid/flex model;
- padding and gap;
- background and border;
- radius;
- font family, size, weight, and line height;
- overflow behavior;
- visible/hidden state.

## Responsive interpretation

Locked desktop geometry does not authorize shrinking the desktop canvas on mobile. Recompose while preserving hierarchy, priority, semantics, and visual language.

## Exit gate

- [ ] Golden fixture cannot activate in production.
- [ ] Target and runtime use the same CSS viewport.
- [ ] Fonts and animations are settled before capture.
- [ ] All required regions exist.
- [ ] Geometry, style, and image-diff artifacts exist.
- [ ] Canonical/live-data route also passes functional acceptance.
