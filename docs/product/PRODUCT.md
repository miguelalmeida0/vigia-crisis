# Product: VIGIA

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Incident operators, firefighters and commanders who need to understand a wildfire and its surrounding conditions under time pressure. This is an operational decision-support product; an impressive demonstration must remain understandable to a nontechnical viewer without changing the meaning of the data.

## Product Purpose

VIGIA brings attributable wildfire observations and geographic context into an incident-centered console. Success means that a user can interpret a physical fact, its location, measurement time and limitation without learning the application's internal architecture.

## Operating Context

The 8 September 2026 hierarchy correction establishes primary navigation in this order: Command Overview, Incidents, Incident Detail, Fire Activity, Response & Access, National Awareness. Incident Detail remains in primary navigation in this sprint. Reports & Analytics remains a direct internal route, preserving decision memory, reconstruction, audit and historical comparison. Intelligence and Operations remain internal API and compatibility identities for the replacement routes, not visible navigation. Preserve the established shell, brand, selection, authentication and refresh.

Fire Activity answers “What is happening around this fire right now?” Response & Access answers “Can we get there, what is around it, and what matters operationally?” The latter supplies mapped and measured planning context; it does not authorize travel or dispatch.

Incident Detail leads with the incident situation and attributable current conditions. National Awareness answers “Where should I look across Portugal right now?” using national measurements, active warnings and ranked source-named incident areas. Those area labels are not an inferred broad-region classification.

## Capabilities and Constraints

- Live, backend-driven maps preserve incident selection, zoom, layer controls and feature inspection. Each route has its own scene and camera intent.
- Station measurements retain station identity, distance and time. They do not establish conditions at the fire front. Dated history uses source samples without interpolation; wind direction describes origin, not fire spread.
- Thermal observations identify heat at acquisition time. They remain distinct from admitted perimeter geometry, historical geometry and forecast scenarios.
- Response facilities use the existing OpenStreetMap-backed response projection. Mapped presence does not establish opening, staffing, capacity or current availability.
- OSRM values describe facility-to-incident road-network estimates. They exclude live closures, traffic and emergency access restrictions; they are neither arrival promises nor safe-route recommendations.
- Display only attributable, usable facts and supported modules. Missing values are not zero, and successful zero thermal counts are distinct from failed queries. Omit unsupported primary modules instead of filling them with bureaucratic null states. Keep necessary limitations adjacent and source detail inspectable.
- Apply usable-value omission to compact incident-list summaries as well as full-page signals. Reflow the remaining facts; keep missing-data reasons in Data coverage, Why this? or source detail. Actionable load failures may use concise inline retry feedback.
- Compare actual returned measurement samples on a shared elapsed-time domain. Exact timestamps and values remain inspectable; visual connectors are guides, not interpolated measurements.
- Access priorities rank qualified returned facility-to-incident road estimates by duration, distance and stable identifier. Nearest support uses straight-line distance within each returned category. Neither ordering establishes the best possible approach or operational readiness.
- National priority ranks actual named incident areas by current/candidate records, recent observations and latest observation time. Do not invent broad-region membership or sum thermal counts from overlapping incident query areas.

## Brand Commitments

Retain VIGIA's established identity and supplied reference authority. The product is operational wildfire intelligence, not a generic dashboard, simulated-data demo or model-evidence showcase. Use direct, human language and concrete facts; internal identifiers and verification machinery belong in disclosure.

## Evidence on Hand

The binding records are `AGENTS.md`, `AGENTS.override.md`, and `docs/handoffs/FIRE_RESPONSE_docs/product/DESIGN.md`, plus the user's 8 September briefs and supplied reference images. The later hierarchy correction supersedes the earlier route order and four affected page compositions; its implemented anatomy is recorded in `.impeccable/surfaces/rator-console-src-approved-routes-fire-activity-js.md`. This record is not a certification of every route or exact visual parity. Canonical capture and reference comparison evidence have separate purposes and must remain separate.

## Product Principles

- Lead with facts a person can interpret and act on.
- Distinguish current state/action, supporting information, history/context and provenance by position, size, spacing and container strength.
- Preserve source meaning, measurement location, time and important limitations.
- Integrate a capability into a route's existing workflow before exposing it.
- Never invent authority, operational readiness, geometry, values or safety judgments.
- Prove behavior in the canonical app and visual fidelity with rendered comparisons.

## Accessibility & Inclusion

Target WCAG 2.2 AA, keyboard operation with visible focus, reduced motion, usable 200% zoom and 400% reflow. Required responsive evidence spans 1672 × 941 through 320 × 568; touch controls must remain operable at a minimum 44 × 44px. These are acceptance requirements, not a claim that every product surface has been audited.
