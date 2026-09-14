# VIGIA live source status

**Observed from production runtime:** 2026-08-10 17:18 UTC
**Endpoint evidence:** `/api/v10/events`, `/api/v10/acquisition/status`

| Source | Runtime state | Latest source time | Acquisition truth | Evidence role |
|---|---|---|---|---|
| ptdata / ANEPC-derived fire reports | `current` | 17:18:46 UTC | Real HTTP acquisition; raw response archived; report events and source checkpoint committed to local PostGIS | Public report, never physical confirmation |
| ptdata risk/weather/warnings | `current` | 17:18:46 UTC | Real HTTP acquisition; raw responses archived; durable filesystem checkpoints healthy | Context only |
| ptdata history | `current` | 17:18:46 UTC | Real HTTP acquisition for 2025/2026; raw responses archived | Historical context |
| Copernicus Sentinel-2 catalogue | `current` | 2026-08-09 11:33:21 UTC | Real catalogue discovery; product archive is not owned | Scene metadata; pixel authority requires native-product gate |
| NASA FIRMS VIIRS points | `not_configured` | none | Acquirer is wired but no `NASA_FIRMS_MAP_KEY` is present | No point thermal evidence available |
| EUMETSAT/LSA SAF operational MSG raster | `current` | 16:45:00 UTC | Real WMS raster context; not yet in immutable raw archive | Broad thermal context, not event point evidence |
| MTG FCI structured FRP points | `not_configured` | none | Parser/JSON consumer only; no owned acquisition | None |
| Sentinel-3 SLSTR structured FRP points | `not_configured` | none | Parser/JSON consumer only; no owned acquisition | None |
| Connected field/camera/drone/sensor assets | `not_configured` | none | Empty registry; signed ingest seam only | None |
| Confirmed future observations | `not_configured` | none | Empty attributable schedule registry | None |

At the evidence timestamp the event API contained 28 public-report events, 0 point thermal observations, 0 current physical observations, 9 active events needing physical confirmation, and 19 stale events. Production readiness remained false even though R0 integrity and local PostGIS readiness passed.

## Acquisition checkpoint evidence

The real runtime exposed eight healthy ptdata checkpoints:

- municipalities
- fires
- risk today
- risk tomorrow
- weather
- warnings
- history 2026
- history 2025

Each checkpoint includes attempt/success/source timestamps, last product ID, cursor, failure counters, health and last error. The raw archive contained 465 products at the captured instant, all marked ingested; this count includes repeated changing provider responses accumulated during recovery testing and is not an event or observation count.

## Transactional persistence evidence

- Production local PostGIS 3.5 readiness was `ready`; the latest real-data transaction wrote one ptdata raw-product metadata row, 28 report-only events, and one source checkpoint. It wrote zero physical observations because no physical provider was configured.
- A separate `vigia_test` database exercised the complete physical transaction twice with the same explicitly synthetic test-universe input. Both runs left exactly 1 raw product, 1 physical observation, 1 event, 1 association, 1 checkpoint, and 2 lineage edges at `POINT(-8.1 40.1)`.
- Restart preserved the same 30 event IDs and 31 observations in the captured restart comparison. The live provider set changed afterward, so the later 17:18 snapshot contains 28 events.
