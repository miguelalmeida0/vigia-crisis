# Fire Activity / Response & Access — composition contract

The 8 September brief supersedes the old Intelligence and Operations page designs and navigation labels. Existing API identities, permissions and compatibility links remain valid. Public URLs become `#/fire-activity` and `#/response-access`.

VIGIA serves incident operators under time pressure. These are operational, map-led surfaces, not evidence review or task administration. Fire Activity answers what has been observed around the incident; Response & Access answers where the incident is, what facilities surround it and what road-network estimates exist. Design variance 2/10, motion 1/10, density 8/10. Risk profile: operational, safety-sensitive.

## Locked visual translation

The two supplied 1672 × 941 references are LOCKED_SPECIFICATION for composition and visual language. The explicit text brief overrides illustrative facts and the second image's Exposure & Access title. No image data becomes canonical data. White canvas, navy type, restrained red selection, blue section icons, tinted compact signal cards, 7px panel radius, hairline dividers. Inherit the existing VIGIA brand, fonts and shell; scope header changes to the replacement routes.

Desktop: compact page header; 54px context banner; six available signal slots, approximately 108px high; main grid 56% map / 44% supporting rail with 12px gaps. Map panel approximately 470px high. Fire rail: dated changes and observation context; below: real measurement history and thermal/notice modules when supported. Response rail: tabbed mapped facilities, road-network estimate options, dated field updates; below map: location and station context. Source, measurement time and distance remain adjacent to facts.

At 1280px the rail narrows, text wraps deliberately. At 1024px the workspace becomes one column, with map first. At 768px signals use three columns, then two on phones. Tables recompose into compact rows; all mobile controls are 44px minimum. No page overflow or reference screenshot as a map.

## Data and behavior

- Preserve canonical incident selection, refresh, auth, route-scoped MapLibre scenes, map feature inspection, zoom, layer toggles and fit.
- Render only attributable values and modules. Missing metrics are omitted; empty panels do not consume space. Successful zero thermal counts are distinct from failed queries. No derived danger, spread or safety score.
- Weather describes the named station at its measurement time and distance, not at the fire front. Trends use dated source samples; direction is wind origin, not fire spread.
- Response facilities come from the existing responseCapability projection (OpenStreetMap snapshot). OSRM travel times are explicitly road-network estimates from facility to incident, not arrival times or safe access. Static mapping does not imply staffed, open or available. No closure/capacity badges without current attributable data.
- Active, area-associated weather notices only. Thermal observations remain points, separate from official perimeter and forecast geometry.
- New primary surfaces omit bureaucratic copy and null-value panels; source details remain inspectable. Existing deep capabilities remain backend-owned and accessible from retained contextual flows.

## Verification

Browser plugin not available; use the existing Docker Playwright canonical admission harness. Test: incident selection → each replacement page → map zoom/layer interaction → facility tab/detail → history and mobile navigation. Capture all eight required viewport sizes; 200%/400% reflow, keyboard focus, API failures and source timestamps. Freeze canonical captures in the test harness for reproducible comparisons, with no production fixture path. Produce native reference/runtime/overlay/difference and geometry/style artifacts; report semantic substitutions separately from pixel metrics.

## Direction contract

**THESIS:** Incident-centered field facts and mapped response context, without task-administration or model-proof panels.

**OWN-WORLD:** Existing VIGIA light canvas, navy sans-serif, restrained red selection, blue section icons, compact tinted signals and flat rounded panels.

**STORY:** Select the incident, read dated nearby observations, inspect the live map, then compare mapped facilities and qualified road estimates.

**FIRST VIEWPORT:** Compact header and incident banner, up to six supported signals, then a dominant left map with a supporting right rail. Incident selection sits in the banner; layer controls sit with the map.

**FORM:** User-supplied locked compositions; no concept seed or alternate direction was selected. Preserve the existing product identity.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, docs/product/DESIGN.md, and every shipping raster carrying its provenance

## Recorded implementation and review boundary

The settled CSS uses a 1.28:1 map/rail grid with 12px gaps and a 408px desktop live-map viewport inside its panel. The workspace stacks at 1100px, with three signal columns and an optional two-column supporting rail. At 760px signals use two columns, the rail and route estimates stack, tables become labeled rows, and the live-map viewport is 365px. These are extracted implementation values, not measured claims of reference equivalence. Weather history prints a visible date and UTC time for each sample.

The replacement routes use real measurements, mapped facilities and qualified OSRM estimates in place of unsupported risk, perimeter and safe-route examples in the references. Existing typography is retained. Exact pixel parity is not established by this record. `docs/product/PRODUCT.md`, `docs/product/DESIGN.md` and `docs/internal/automation/impeccable/design.json` preserve product truth and the scoped visual system; they do not certify the other routes.

Canonical functional checks and the initial eight-size capture were reported successful by the implementation task, including zero page overflow, app errors and network failures in that capture. Final corrected screenshots, native comparisons and reviewer disposition belong to the final handoff; this documentation pass did not independently rerun those checks or certify their final result.
