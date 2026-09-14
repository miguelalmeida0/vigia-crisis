# Fire forecasting baseline

Captured: 2026-08-24T13:40Z\
Workspace: `/Users/malmeida/Documents/Development/vigia-intelligence`\
Branch: `feat/vigia-intelligence-foundation`

## Preserved foundations

| Vertical | Boundary consumed by forecasting | Focused result |
|---|---|---:|
| Intelligence | Evidence graph, contracts, debt, explanation and replay | 47/47 |
| Event Fabric and Twin | Immutable operational events and historical/current incident state | 7/7 |
| Control Plane | Versioned policy, reconciliation and SHADOW receipts | 16/16 |
| Proof Plane | Capability authority, revocation, quarantine and transparency | 14/14 |
| Reality Network | Provider manifests, raw vault, causal lineage, coverage and evaluation | 12/12 |

`npm run check` passed with 720 files inspected and 631 runtime/test modules validated. `npm run providers:doctor -- --strict` reported 8 ready providers, 1 credentials-required provider, 3 partner-required ports and 0 unavailable providers. Git diff and status are empty for `apps/operator-console/**` and `apps/web/**`.

The most recent full-suite result immediately before this vertical was 613/621. Its eight failures are preserved baseline classes: seven absent generated measurement-debt artifacts and one pre-existing hard-coded browser migration contract. The separately executed production smoke also has a pre-existing API/static-console route mismatch; forecasting does not own or modify either UI surface.

## Existing forecasting-like code

`packages/domain/src/spread-envelope.mjs` is an explicitly unvalidated deterministic sensitivity screen. It emits low/central/high parameter envelopes, not probabilities, calibration, a wildfire forecast or an action. `ScreeningSpreadProvider` and the approved external-provider port remain separate from the new forecasting doctrine and must not be silently promoted.

The current Reality Network live run supplies a WFIGS perimeter, current ABI/MODIS/VIIRS observations, one deterministic ECMWF IFS sample and bounded OSM context. It does not supply a weather ensemble, current fuel raster, a labelled future perimeter, or a calibrated spread model.

## Corpus and evaluation starting point

- Retained official corpus: 35 Portugal incidents from one 2024 season and 2,523 arrivals.
- Positive-only opportunity corpus: 35; negative opportunity controls: 0.
- Historical physical corroboration: VIIRS only.
- Multi-region gate: not met. Two-season gate: not met.
- False-incident rate: unmeasured. No forecast-horizon perimeter labels are present.
- Existing association metrics are not spread-forecast metrics and cannot be reused as such.
- One Copernicus DEM tile exists for an unrelated FieldNet replay; no complete forecast-domain terrain/fuel pack is present.

## Runtime and physical-model availability

- Node: v26.0.0.
- Python environment: NumPy, Shapely, Rasterio and PyProj available.
- Not available: xarray, netCDF4, cfgrib, ecCodes, GeoPandas, SciPy and scikit-learn.
- No FARSITE, FlamMap, WindNinja, GDAL CLI or OGR CLI executable is installed.
- Local PostGIS was not certified during the preceding Reality Network iteration; durable local JSON/journal/raw-vault implementations remain required.

Therefore this vertical may build and test a production-shaped physical-runner boundary, but cannot claim that FARSITE/FlamMap or WindNinja executed unless tool availability changes. Deterministic baselines remain the executable comparison lane.

## Initial promotion state

`DO_NOT_ADVANCE`. Before any model can advance, the fixed gates require at least two regions, two seasons, valid negative opportunities, isolated incidents and upstream observations, issue-time weather and perimeter labels, calibrated probability evaluation, meaningful baseline superiority, stratified tail-risk evaluation and deterministic shadow replay.
