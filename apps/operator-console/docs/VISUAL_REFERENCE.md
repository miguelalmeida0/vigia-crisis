# Mission Dark Visual Contract

The approved Mission Dark design remains the presentation target: one dark operational shell, map-first hierarchy, compact typography, restrained teal/orange/red semantics, and bounded information density.

## Operational imagery rule

No screenshot crop, generated fire image, reference-board image, stock fleet photo, or fixture raster may be used as operational content.

Map and evidence imagery must originate from the canonical VIGIA backend:

- basemap tiles through `/api/v1/basemap/...`;
- live thermal context through `/api/v10/events/thermal/overlay`;
- PREVENT observation imagery through governed observation preview/proxy URLs;
- replay visual state from the canonical replay corpus.

If an image is unavailable, the UI renders an explicit unavailable/degraded state. Visual fidelity never overrides evidence truth.
