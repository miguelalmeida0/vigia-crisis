# VIGIA FINAL WHITE DESIGN — BINDING DESIGN RULES

## Authority

This folder is the frontend visual source of truth for the September 1, 2026 reconstruction.

If an older DESIGN_SOURCE_OF_TRUTH, Lovable output, dark VIGIA concept, Design Lab screenshot, stale golden, or existing implementation conflicts with this folder, THIS FOLDER WINS for frontend visual direction.

The only exception is operational truth: real backend data, authority state, scientific admission, source availability, canonical maps, and degradation must remain truthful even when a reference image contains illustrative values.

## Final product IA

Exactly seven primary routes:

- Command Overview
- Incidents
- Incident Detail
- Intelligence
- Operations
- Reports & Analytics
- Global Awareness

REMOVE from primary navigation and product routing:
- Evidence
- Evidence Debt
- Authority & Trust
- Control Plane

Do not delete their backend truth capabilities. Provenance, evidence qualification, authority, policy, safeguards, audit and control-plane mechanics remain backend/system capabilities and appear contextually only where operationally relevant.

Old UI route behavior:
- /evidence and /evidence-debt -> Intelligence
- /authority-trust and /control-plane -> Operations (or the nearest contextual operational surface)
No dead pages.

## Absolute visual rules

- LIGHT / WHITE VIGIA. Never reintroduce the dark blue redesign.
- No route numbers in sidebar.
- No route numbers in page titles.
- No generic AI dashboard styling.
- No purple-gradient AI aesthetic.
- No glassmorphism, neon glow, sci-fi chrome, or decorative ML visual language.
- White / near-white canvas, navy/graphite typography, subtle cool-gray hairlines.
- Restrained red for fire/critical, orange/amber for elevated risk, green for healthy/contained, restrained indigo only for navigation/links/focus.
- Clean sans-serif typography. Monospace only for true telemetry/IDs/timestamps when useful.
- Minimal radius. Cards are structural, not decorative.
- No card-in-card soup.
- Avoid tiny type. Desktop body 14–16px; dense table data 13–14px; metadata >=12px.
- No text collision, clipping, ellipsis that hides primary operational meaning, or horizontal-scroll "responsiveness".
- Touch/click target >=44px where practical; map features have generous invisible hit targets.
- Maps use real geospatial surfaces. Never use target screenshots as operational maps.

## Interaction philosophy

VIGIA should feel like a crisis operating system, not a machine-learning analysis product.

Primary loop:
SEE -> SELECT -> UNDERSTAND -> ANTICIPATE -> ACT -> REVIEW

The frontend never manufactures:
- truth
- confidence
- evidence independence
- authority
- readiness
- action success
- forecast admission

It renders backend adjudications.

## Route intent

### Command Overview
National/regional operating picture:
- four high-value KPI instruments
- large Situation Map as dominant surface
- concise Priority Items rail
- compact System Health strip
- selection from map or priority list
- no source/debug jargon dominating the page

### Incidents
Rapid triage:
- search + status/type/priority filtering
- clean incident table
- strong selected-row state
- right Incident Summary map
- Latest Changes below
- whole-row selection
- incident selection persists across routes

### Incident Detail
Deep dive:
- selected incident identity
- current assessment and critical facts
- large geospatial incident map
- contextual sub-navigation
- decision delta strip
- provenance/authority only through contextual disclosure when needed

### Intelligence
This is the signature route.

Use 04_INTELLIGENCE_FINAL_TARGET.png as the strongest route-specific authority.

Required composition:
- selected incident / current state / recent change / last observation / forecast horizon strip
- dominant high-resolution geospatial intelligence map
- observed perimeter / thermal context / terrain / wind / relevant infrastructure
- only scientifically admitted forecast geometry
- directional A/B/C scenario corridors when admitted; no Venn-diagram ellipses
- concise Intelligence Brief on the right
- Current Understanding
- Likely Evolution
- Critical Watchpoints
- Decision Implications
- Competing Hypotheses using the useful terrain/hypothesis visual language from 08_INTELLIGENCE_EXISTING_HYPOTHESES_REFERENCE.png
- Supporting Intelligence Artifacts strip using real available imagery/products
- "Why?" / source/provenance disclosures contextual, not a separate Evidence route

The route should feel like VIGIA can see around the corner without pretending certainty.

### Operations
Action coordination:
- top state segmentation: VIGIA Handling / Waiting on Reality / Needs You
- prioritized operational actions table
- clear owner, status, next update
- contextual authority/safeguard indication only for actions requiring it
- concise Operations Summary
- never imply an action succeeded without a receipt/postcondition
- preserve real operational map/detail affordance if canonical operational geography is part of an action, but do not force a broken/empty map into the primary composition

### Reports & Analytics
Operational learning:
- Decision Summary
- Outcome Analysis
- System Performance
- Detection / Situation Quality (not a standalone "Evidence product")
- scientific gate remains explicit and truthful
- no vanity metrics
- official-label counts and readiness must come from backend

### Global Awareness
Global situational awareness:
- dominant world map
- filters
- regional summary
- source health
- recent material events
- clustering and selection
- no fake global incident inventory

## Responsiveness

Certify:
- 1672x941
- 1600x1000
- 1440x900
- 1280x800
- 1024x768
- 768x1024
- 430x932
- 390x844
- 320x568

Rules:
- no horizontal page overflow
- no overlapping text
- no fixed screenshot geometry
- no giant blank right half
- no microscopic typography
- maps retain useful aspect/camera and do not become cropped raster strips
- tables become intentional cards/stacks on narrow screens
