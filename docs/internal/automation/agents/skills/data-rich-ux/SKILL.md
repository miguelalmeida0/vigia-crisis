---
name: data-rich-ux
description: Designs dashboards, tables, maps, graphs, charts, telemetry, command surfaces, and other dense product interfaces for fast expert scanning and truthful decision support. Use whenever a route contains structured data, operational status, research comparisons, geospatial information, or visual analytics.
license: Project-local
metadata:
  version: "1.0.0"
  reviewed: "2026-08-31"
---

# Data-Rich UX

## Core rule

Dense interfaces are not marketing pages. Do not apply hero/AIDA/GSAP choreography or airy landing-page spacing to operational workspaces.

## Hierarchy

- One dominant analytical or work surface.
- Subordinate rails answer: what changed, why it matters, what is unknown, and what to do next.
- Critical items must be visually and semantically distinct without making the whole page red.
- Keep comparable data aligned.
- Use table rows for scanning, not repeated cards.
- Use cards only for genuine independent objects or states.

## Tables

- Stable columns and tabular numbers.
- Column priority by viewport.
- Selected-row treatment that preserves readability.
- Sort/filter only when approved and useful.
- Empty, partial, loading, stale, and unavailable states inside the table context.
- Mobile operational rows instead of squeezed desktop tables.
- Avoid horizontal scrolling in primary workflows.

## Maps

- Route-specific scene and bounds.
- Selected phenomenon dominates.
- Cluster/collide labels.
- Separate observations, official geometry, forecast, resources, weather, and basemap.
- Show source time and degradation.
- Never infer perimeter or authority from thermal points.
- Preserve last-good context without calling it current.

## Graphs

- Graph topology reflects domain relationships, not a generic force graph.
- Use human labels; raw IDs live in details.
- Selection, fit, zoom, filters, provenance, and keyboard alternative must work.
- Sparse truth is better than fabricated density.

## Charts

Choose by question:

- trend over time → line/sparkline;
- threshold/position → scale or threshold bar;
- comparison → aligned bars or table;
- composition → stacked bar when parts truly sum;
- distribution → histogram/box/violin when justified;
- relationship → scatter/network when interpretation is clear.

Avoid decorative donuts, speedometers, and gauges without operational thresholds.

## Exit gate

- [ ] User can answer the primary question in seconds.
- [ ] Critical unknowns are visible.
- [ ] Data states and units are truthful.
- [ ] No equal-weight container soup.
- [ ] Primary object remains usable at all viewports.
- [ ] Visualizations have inspectable data/provenance.
