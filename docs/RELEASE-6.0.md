# VIGIA 6.0 — Living Fire

## Release thesis

V6 removes the remaining gap between a fire-event concept and a coherent operational object. The fire event now owns current knowledge state, historical thermal trend, source association, observed thermal geometry, replay, detection-performance measurement and links into owned action.

## P0 contracts

1. A stale event can never display a historical rising/cooling trend as current state.
2. Lead-time statistics always expose their sample size.
3. A map cluster never renders an unexplained naked number.
4. Public-report ↔ thermal association is quality-gated and explainable.
5. FIRMS non-wildfire/static-source classifications are suppressed from critical wildfire-candidate escalation.
6. Thermal chart, timeline and replay derive from the same event observation history.
7. Replay selects historical observed geometry, not only a timestamp label.
8. Sensor identifiers are normalized before reaching the UI.
9. Current Sentinel metadata can never silently borrow pixels from another sensor.
10. Fixture mode never performs network observation discovery.
11. Fire Workspace uses the same persistent event identity as Portugal Live.
12. Command routes unresolved live fire events before generic prevention watches.
13. Selection cannot leak across incompatible product views.
14. Supported events can open consequence screening without forcing the operator back into a separate raw-report workflow.
15. Geographic fallbacks prefer coordinates/district context over invented municipality names.

## Cartography

The reference atlas uses real CARTO/OpenStreetMap raster context clipped beneath VIGIA's semantic event layers. Event markers, selected event geometry, thermal candidates and operational labels remain independent overlays. Observed thermal geometry is deliberately labelled approximate; it is not a validated active-fire perimeter.

## Earth observation

The resolver can use current Sentinel-2 browse assets from Earth Search when available and continues to preserve Copernicus catalogue and Sentinel-1 radar metadata. Broad VIIRS visual context is only a clearly separate fallback. Full-resolution COG tiling/cropping is an explicit production seam, not a hidden claim.

## Validation

`npm run verify` executes domain/API tests, architecture checks, an end-to-end deterministic smoke test and browser QA. The browser suite exercises Living Fire, event replay, event-to-consequence continuity, panel recovery, geographic observation binding, modal dismissal, outcome/audit integrity, role-adaptive field work and mobile navigation.

## Operational boundary

V6 is still decision-support infrastructure. Government deployment requires certified/validated fire-behaviour models, real authentication and tenancy, durable distributed storage/queues, security hardening, source SLOs, formal safety assessment and integration with authoritative dispatch/public-warning systems.
