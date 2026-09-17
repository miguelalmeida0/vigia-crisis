# docs/internal/automation/AGENTS.override.md — VIGIA Product UI & Geospatial Contract

> Place this file at the VIGIA repository root as `docs/internal/automation/AGENTS.override.md` or merge its rules into the nearest scoped agent contract.

## Product identity

VIGIA is operational wildfire intelligence and decision support. It is not a generic admin dashboard, marketing site, cyberpunk command center, or simulated data demo.

## Immutable routes

The explicit 8 September 2026 hierarchy correction supersedes the earlier
navigation list and compositions of Incident Detail, Fire Activity, Response &
Access and National Awareness. Preserve the established visual language and
source distinctions. The implemented anatomy is recorded in
`docs/internal/automation/impeccable/surfaces/rator-console-src-approved-routes-fire-activity-js.md`.
The later text correction takes precedence over the earlier composition in
`docs/handoffs/FIRE_RESPONSE_docs/product/DESIGN.md` where they differ.

Primary navigation:

- Command Overview
- Incidents
- Incident Detail
- Fire Activity
- Response & Access
- National Awareness

Incident Detail remains in primary navigation for this sprint. Reports & Analytics
is a direct internal route only; preserve its backend history and replay systems.
Intelligence and Operations remain internal API/compatibility identities only;
do not restore their old visible pages or navigation labels.

Do not add decorative route numbers, Authority & Trust, Outpost or primary Reports navigation without a further explicit product decision.

## Visual authority

The six approved locked design references are specifications. Their shell, hierarchy, geometry, typography, density, controls, and route composition outrank prior Codex/Lovable implementations, except where the explicit later hierarchy correction recomposes the four affected routes. Preserve the reference visual language; do not claim exact old pixel parity for those authorized composition changes.

## VIGIA visual language

- near-white/light operational canvas when specified by the references;
- VIGIA red as restrained command/selection signal;
- green, amber, red, and cyan only for operational meaning;
- flat connected surfaces, hairline separators, minimal radius/shadow;
- clean sans-serif for UI;
- monospace/tabular treatment only for technical telemetry;
- map/graph as dominant work surface;
- no purple, glass, neon, glow, SaaS card soup, decorative technical labels, or generic dashboard gauges.

## Geospatial truth

All maps are dynamic and backend-driven.

Required distinctions:

- basemap imagery/labels;
- NASA FIRMS/VIIRS and other thermal observations;
- official/admitted perimeter geometry;
- historical geometry;
- forecast scenario geometry;
- weather/wind;
- terrain;
- roads, communities, and critical assets;
- operational resources and assignments;
- source state, freshness, and degradation.

Never use stock imagery, mock map screenshots, random procedural geography, or thermal observations as an authoritative perimeter.

Use route-specific scenes:

- Command Overview: regional incident universe and priority context.
- Incidents: selected incident plus nearby context, synchronized with list/triage/activity.
- Fire Activity: selected incident, thermal observations and attributable physical conditions with actual sample history; preserve geometry distinctions.
- Response & Access: selected incident, mapped facilities and qualified facility-to-incident road estimates; mapped presence is not current operational availability.
- National Awareness: Portugal incident context and source-named area selection, synchronized with ranked priority and map-adjacent filters.
- Incident Detail: close incident view with supported layer controls and risk/evidence context.

One renderer may be shared. Camera, bounds, visible layers, selection, scene identity, and state MUST be route-specific.

## Evidence

The graph is incident-centered and backend-owned. Use human source-family labels. Raw internal IDs belong in provenance disclosure. Sparse truth is acceptable; fabricated graph density is not.

## Visual QA

Golden fixture mode proves design parity. Canonical mode proves real backend behavior. Neither may substitute for the other.

No completion claim until all six routes have fresh reference/runtime/overlay/difference artifacts and canonical screenshots.


## NEW DATA / FEATURE UI INTEGRATION RULE

A new dataset, backend capability, metric, intelligence output, or operational
feature may NOT be inserted directly into an existing page as a raw section,
generic block, debug table, or appended card stack.

Before exposing a new capability in the UI:

1. identify the user's question it answers;
2. identify the route where it belongs;
3. design its composition within that route's existing hierarchy;
4. reuse the approved design system;
5. preserve the page's primary workflow and first viewport;
6. avoid duplicate information already visible elsewhere;
7. perform rendered visual QA.

If no design is provided:
the agent MUST create an intentional design proposal/spec first using the
existing visual system before implementation.

Functional completion does NOT override visual quality.

A feature is NOT complete when:
'the data is visible.'

A feature is complete when:
'the data is understandable, intentionally composed, visually integrated,
responsive, and does not degrade the existing product.'

Never prepend generic metric/evidence sections across multiple routes.

## REFERENCE-LOCKED UI RULE

When an approved visual reference exists, it is a production design contract.

Agents may not:
- reinterpret it;
- add generic blocks above its primary workspace;
- expose newly available data wherever convenient;
- change component anatomy because a different structure is easier;
- claim completion from build/tests alone.

Any feature or dataset added to a reference-locked surface must be intentionally
composed inside that design system.

A reference-locked UI change is complete only after rendered comparison at the
reference's native viewport and functional verification.

If no reference exists for a new UI capability:
design it first using the established design system and obtain approval before
implementation.

"Data visible" is not a completed UI feature.

## REAL-WORLD OUTPUT RULE

User-facing primary surfaces must lead with physical or operational facts that
answer a user question.

Internal verification, evidence, dependency, provenance and model state may not
dominate the primary information hierarchy.

Every displayed metric must preserve its meaning, location, measurement time and
important limitation.

A technically available value is not automatically suitable for the selected
location or decision.

A feature is not complete because its data is visible.

It is complete when the user can correctly interpret and act on the information
without understanding Vigia's internal architecture.

## PRIMARY HIERARCHY AND ABSENCE RULE

Distinguish P1 current state/action, P2 supporting information, P3 what changed/next
and P4 history/provenance/technical detail. Use position, size, typography, spacing and
container strength; do not give every section equal white-card emphasis.

Omit unusable metrics from prime composition and reflow the remaining facts,
including compact incident-list summaries. Preserve valid measured zero. Keep
absence reasons in Data coverage, Why this? or source detail. A failed response
projection uses concise inline retry feedback; do not present a weather-only
Response snapshot as if support/access data loaded.

Response rankings compare only qualified returned OSRM estimates; nearest
support is one closest returned point per category by straight-line distance.
Keep ranking basis, direction and limitations explicit. National rankings use
returned incident-area names; never invent broad-region membership, danger
levels or additive thermal totals from overlapping nearby query radii.

## FULL PRODUCT DESIGN CONSISTENCY RULE

Vigia is a reference-locked product. The latest explicit full-product convergence
brief governs all six primary routes; `docs/product/DESIGN.md` records the shared system.

Any frontend change must preserve:

- global typography hierarchy;
- spacing scale;
- semantic colors;
- container model;
- icon family;
- route hierarchy;
- responsive behavior;
- map interaction patterns.

Agents may not create a new visual pattern when an established component can
express the same information. New UI patterns require explicit justification and
must be integrated into the existing design system. No new feature may degrade
another route's visual hierarchy.

Every material frontend change requires rendered review across the affected route
and at least one responsive viewport. "Functionally working" is not sufficient
for UI completion. Temperature and other ordinary weather readings are blue or
neutral; red requires actual critical/fire meaning. Supporting operational text
uses the readable metadata floor; never shrink it to fit a failing layout.
