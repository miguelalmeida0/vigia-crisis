# Mega VI implementation contract

VIGIA supports operators making time-sensitive wildfire decisions. The dominant work surface remains the incident map. Primary information is the dated situation; supporting information is qualified support and access; causal history and source details remain disclosures. This is operational decision support, never an evacuation instruction or availability guarantee.

Direction: the existing light operational system in DESIGN.md. Design variance 1/10, motion intensity 1/10, visual density 7/10. Reuse existing navy text, restrained red selection, blue informational controls, hairlines, typography and drawer primitives. No new routes or equal-weight card grid.

The user explicitly approved these compositions in Mega VI:

- Existing incident briefing: compact Operational Support rows, primary/alternative name and calculated minutes, followed by at most three evidence-qualified notices. Shared road name opens dependency inspection.
- Existing detail drawer: settlement name, incident distance, dated authoritative population when matched, qualified support rows, and source disclosure. No inferred population or evacuation language.
- Existing map layer drawer: one coverage category selected at a time. Retained route geometries and endpoint relationships are shown; no invented isochrone boundary.
- Existing Scenario Mode: bounded multiple object failures, explicit scenario label, changed primary/alternative and ETA, retained coverage gaps.
- Existing Time Machine: material trigger and consequences referencing snapshot relationships; support comparison and explainable earlier analogs.

Desktop uses aligned rows inside current briefing/drawer widths. Tablet and mobile stack primary and alternative within each row; controls retain 44px touch height, 14px operational text and 12px metadata floor. At 320px, names wrap normally, source detail collapses, and the map remains usable. Native buttons/disclosures, focus trapping, Escape and trigger restoration remain shared infrastructure.

Verification: API/domain isolation and freshness tests; real retained incident/settlement/road proof; restart persistence; 20-run map traces; six canonical route captures and all required responsive widths on changed drawers. Reference comparisons remain diagnostic where the approved later composition differs from old rasters.
