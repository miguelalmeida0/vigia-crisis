# VIGIA 8.0 — Operational Fire OS

VIGIA 8 is a capability release, not a visual-only redesign. The release closes the major gaps identified in V7 around physical observation, persistent event identity, event geometry, consequence screening, action ownership and prevention imagery integrity.

## Release contract

### Fire event core
- Civil-protection reports, VIIRS thermal points, cameras, ground sensors, drones and field observations share one physical-observation contract.
- Public-report activity, physical-observation freshness and fire-behaviour state remain independent.
- Fire behaviour is derived only from sufficiently fresh point-level FRP samples.
- Persistent events expose explainable cross-source association quality and reject weak merges.
- Repeated point detections produce an approximate thermal footprint and centroid-movement indicator; neither is presented as an authoritative fire perimeter.
- Satellite-only and sensor-only observations can create unreported physical candidates without being promoted to verified fires.

### Physical observation ingress
`POST /api/v8/sensors/observations` accepts HMAC-authenticated, server-registered `camera`, `ground_sensor`, `drone` and `field` observations only when the device is explicitly scoped to the incident. The legacy shared gateway token is not an evidence-ingest authority.

The ingress validates time, geography, identity and confidence before an observation can join the event graph.

### Consequence screening
- 15/30/60 minute screening produces P10/P50/P90 uncertainty envelopes.
- Mapped building and critical-asset samples are counted independently for each envelope.
- The built-in provider remains explicitly unvalidated planning screening.
- A separately validated provider can be connected with `VIGIA_SPREAD_PROVIDER_URL` and `VIGIA_SPREAD_PROVIDER_API_KEY`.

### Prevention / observation
- Browse imagery is never stretched to fill a misleading frame.
- Renderable Sentinel-2 observations remain bound to their geographic footprint.
- The selected coordinate is surfaced within the scene context.
- Aligned Sentinel-2 browse observations can run a real-pixel optical change screen.
- Optical change remains a screening candidate, never automatic physical-hazard confirmation.

### Action routing
Unresolved events have a priority band, evidence requirements, suggested observation sources and an SLA. A supervisor can route an event directly into an owned evidence request instead of leaving uncertainty as a passive count.

### Cartography
- National map views suppress custom city-label collisions.
- High-density events cluster into compact semantic badges.
- Local event geometry, movement and P10/P50/P90 screening are rendered as separate layers.

## Safety boundary
VIGIA 8 is decision support. It does not issue evacuation orders, dispatch resources autonomously, or claim that its screening footprints are certified fire perimeters or forecasts. Missing point detections are not treated as negative evidence when sensor coverage cannot be established.
