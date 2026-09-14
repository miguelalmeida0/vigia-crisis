# Provider and data requirements

The canonical public inputs are ptdata occurrence reports, NASA FIRMS thermal observations, IPMA weather, EU-DEM v1.1 static terrain through OpenTopoData, and OpenStreetMap point/feature-center context. Static EU-DEM is obsolete as a maintained product and is therefore context only; its 25 m resolution, EVRS2000 datum, and stated ±7 m RMSE must remain visible.

Direct current authority requires a supported ANEPC/current-authority API or OASIS CAP endpoint. Configure `VIGIA_CAP_PARTNER_URL`, `VIGIA_CAP_PARTNER_TOKEN` when required, and `VIGIA_CAP_INCIDENT_BINDINGS_FILE`. The binding file maps exact external CAP identifiers to exact canonical incident IDs. Activate with `npm run integration:cap:acceptance`, then start the canonical runtime. Secrets must remain outside evidence and git.

Sentinel-3 SLSTR requires valid Copernicus Data Space credentials. FieldNet requires an initialized incident scope, writable SQLite storage, and required internal services; central connectivity is a separate state.
