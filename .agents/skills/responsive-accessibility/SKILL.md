---
name: responsive-accessibility
description: Designs and verifies responsive, keyboard-accessible, zoom-safe interfaces across desktop, tablet, mobile, and assistive technology. Use whenever layout, navigation, tables, drawers, modals, maps, charts, forms, interaction states, or viewport behavior changes.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Responsive and Accessibility

## Required viewport matrix

Test `1672×941`, `1440×900`, `1280×800`, `1024×768`, `768×1024`, `430×932`, `390×844`, and `320×568`.

Also inspect:

- ordinary 200% zoom;
- 400% reflow equivalent;
- reduced motion;
- keyboard-only navigation;
- long text and localization stress;
- empty, partial, and error states.

## Responsive method

For every multi-column component define:

- desktop composition;
- compact desktop composition;
- tablet composition;
- mobile composition;
- priority of columns/data;
- what moves, collapses, becomes a drawer, or becomes a compact row;
- minimum useful dimensions for maps, graphs, tables, and editors.

Never assume the framework will “handle” responsiveness.

## Overflow rules

- Page-level horizontal overflow is a blocker.
- Primary tables must not require horizontal scrolling.
- Use column priority, grouped cells, row summaries, disclosures, and compact mobile rows.
- A specialist table may use a labeled inner scroller only when essential to the task and approved.
- Do not hide broken content with `overflow: hidden`.

## Accessibility checklist

- [ ] Native semantics first.
- [ ] One `main` and logical heading structure.
- [ ] Every control has an accessible name.
- [ ] Focus visible on every interactive element.
- [ ] Tab order follows visual order.
- [ ] Selected/current state exposed semantically.
- [ ] Status does not rely on color alone.
- [ ] Touch targets at least 44px where applicable.
- [ ] Modals/drawers manage focus and Escape.
- [ ] No hover-only critical content.
- [ ] Contrast meets WCAG 2.2 AA.
- [ ] Reduced-motion path exists.
- [ ] Live regions are limited and meaningful.
- [ ] Screen-reader copy does not expose raw implementation labels.

## Automated assertions

At every viewport assert:

- `scrollWidth <= clientWidth + 1`;
- required regions visible;
- no overlapping bounding boxes unless intentional;
- no clipped text/controls;
- no duplicate IDs;
- no unnamed controls;
- expected route/navigation state;
- map/graph/editor has a visible nonzero rectangle.
