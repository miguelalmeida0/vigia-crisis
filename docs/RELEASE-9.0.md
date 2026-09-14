# VIGIA 9.0 — Sensor Fusion Core

V9 is a capability release. Its purpose is to remove the largest V8 failure mode: screens that described unavailable sensing instead of actively turning available sources into physical wildfire intelligence.

## Release contract

V9 is accepted only when the following loops function without fabricating evidence:

1. **Physical observation** — structured VIIRS, MTG/FCI, camera, ground-sensor, drone or field observations can enter a normalized event stream.
2. **Association** — observations are attached to persistent events with weak matches rejected rather than silently merged.
3. **Acquisition** — an unresolved event can rank a connected camera/sensor/drone/field unit and create a real task request when the asset is configured.
4. **Observation workbench** — background live updates cannot reset the active imagery session; rapid location switching cannot apply stale imagery; the before/current divider remains draggable.
5. **Prevention screening** — when native Sentinel red/NIR/SWIR/SCL assets exist, change analysis uses the source bands rather than screenshot-grade RGB subtraction.
6. **Alerts** — watches and alert acknowledgement are server-backed instead of browser-local only.

## Key architectural additions

- `SensorRegistryService` — deployment-specific physical asset inventory.
- `ActivePerceptionService` — ranks available acquisition paths by ETA and information gain.
- `SensorTaskService` — real HTTPS tasking seam for configured taskable assets.
- `SensorIngestService` — normalized physical observations with shared-token compatibility plus device-specific HMAC authentication and replay protection.
- `MtgFrpGateway` — structured MTG/FCI point ingestion from local LSA SAF products or a normalized JSON feed.
- `MtgFeatureInfoGateway` — best-effort report-coordinate FRP probing where the upstream WMS exposes feature information.
- `HighResStacGateway` — optional high-resolution observation source.
- `AlertService` — persistent alert/watch state, acknowledgement and optional webhook delivery.
- `ObservationStudio` isolation — request cancellation, generation binding, persistent local interaction state and listener cleanup.
- native COG rendering and source-band spectral screening.

## Explicit non-claims

V9 does not pretend that unconfigured cameras, drones or ground sensors exist. It does not infer point-level FRP from a display raster. It does not call a Sentinel browse preview native 10 m imagery. It does not claim small trash/object detection from data that cannot resolve those objects. It does not call the built-in screening envelopes certified wildfire forecasts.

Those boundaries are part of the release contract, because downstream life-safety decisions must be able to distinguish physical evidence, modelled screening and unavailable data.
