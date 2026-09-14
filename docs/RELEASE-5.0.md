# VIGIA 5.0 — Fire Event OS

## Release thesis

V4 displayed current source observations. V5 makes the **fire event** the primary domain object.

A report, a VIIRS hotspot and a geostationary thermal raster are not equivalent facts. V5 preserves those distinctions while associating compatible observations into one evolving event.

## Major additions

- Persistent event observation repository with a 72-hour rolling history.
- Deterministic event IDs and spatial-temporal association.
- Multi-feed NASA FIRMS ingestion: NOAA-20, NOAA-21 and S-NPP VIIRS NRT.
- Point-level FRP trend calculation without inventing values from MTG raster imagery.
- Early-detection lead-time measurement against the first public report.
- Satellite-only fire-event state.
- Growing / stable / cooling / current / stale event evolution.
- Derived high-priority alerts for unreported thermal events and growing thermal trajectories.
- Event replay across report and point-satellite observations.
- MTG replay alignment and future-time rejection.
- Explicit observation-time vs application-refresh clocks.
- Coverage-aware VIIRS language: absence of a detection never implies the satellite observed the location.
- Live semantic event markers instead of raw overlapping report/hotspot clutter.
- Location-bound Earth-observation fallback that clearly labels cross-sensor VIIRS context when Sentinel pixels are unavailable.

## Release blockers covered by tests

- Future thermal replay frames cannot appear as live observations.
- One thermal sample cannot fabricate a growth trend.
- Distant observations cannot merge into one event.
- Satellite-only detections cannot become confirmed fires automatically.
- Event history deduplicates repeat refreshes and prunes impossible timestamps.
- Early thermal detection + later report produces a measurable lead time.
- Different geographic demo locations cannot reuse the same observation asset.
- Required-form validation cannot trap modal cancellation.
- Collapsed workspace panels always retain external reopen handles.

## Production limitations

V5 does not claim a validated operational fire-spread model, camera network, sensor mesh, or official alert authority. Those are separate deployment capabilities. This release deliberately concentrates the live product around trustworthy event understanding and timing.
