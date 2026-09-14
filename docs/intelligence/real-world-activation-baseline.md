# Real-world activation baseline

Captured: 2026-08-24T11:12Z\
Workspace: `/Users/malmeida/Documents/Development/vigia-intelligence`\
Branch: `feat/vigia-intelligence-foundation`

## Preserved foundations

The worktree contains four uncommitted, intentionally preserved foundations:

| Vertical | Primary modules | Focused result |
| --- | --- | --- |
| Intelligence Foundation | `packages/domain/src/intelligence/**` | 40/40 |
| Event Fabric + Operational Twin | `packages/domain/src/event-fabric/**`, `packages/domain/src/operational-twin/**`, `apps/api/src/modules/intelligence/operational-intelligence-service.mjs` | 7/7 |
| Policy + Reconciliation | `packages/domain/src/control-plane/**`, `apps/api/src/modules/intelligence/control-plane-service.mjs` | 16/16 |
| Proof Plane | `packages/domain/src/proof-plane/**`, `apps/api/src/modules/intelligence/proof-plane-service.mjs` | 14/14 |

Existing physical-world support was also inspected rather than replaced: `AcquisitionStore`, `HttpAcquirer`, the FIRMS and Sentinel-3 gateways, ptdata normalizers, `PostgresPhysicalTruthStore`, source health, exposure/context services, replay corpora, and the existing geospatial worker boundary.

## Architecture and UI boundary

- `npm run check`: pass; 671 files inspected and 585 runtime/test modules validated.
- UI diff: empty for `apps/operator-console/**` and `apps/web/**`.
- No source in the sibling checkout was read for implementation or modified.

## Full-suite baseline

`npm test` completed in 51.28 seconds with 600/609 passing and nine pre-existing failures:

- Seven `measurement-debt-api.test.mjs` cases require generated validation artifacts that are absent from this worktree.
- `operator-console-production-runtime-security.test.mjs` expects a built operator distribution that is absent.
- `release-contract-governance.test.mjs` detects the existing hard-coded `vigia-postgis-014` browser contract.

These are the exact known baseline classes. A new failure outside them is a regression.

## Runtime and persistence

- Node requirement: `>=22`; repository dependencies are `pg` and `satellite.js`.
- Node has no NetCDF, GRIB, Parquet, or XML package dependency.
- The managed `.venv` has `h5py`, `numpy`, `rasterio`, and `shapely`; it does not have `netCDF4`, `xarray`, `eccodes`, `cfgrib`, or `pyarrow`.
- Local durable acquisition state is JSON plus a content-addressed raw archive, written atomically with byte/product ceilings and restart-safe checkpoints.
- Production persistence is the existing PostgreSQL/PostGIS boundary. Migrations define raw products, physical observations, fire events, lineage, source checkpoints, operational opportunities, alerts, coverage, and decision-ledger state.
- `npm run db:doctor`: `POSTGRES_NOT_READY`; Docker is reachable, no project PostGIS container is running, target `127.0.0.1:55432/vigia` is unavailable, and 69.7 GiB local storage is available. This vertical must retain local test stores and add no second database.

## Configuration and secrets

Relevant environment/configuration names discovered at baseline (values never recorded):

```text
NASA_FIRMS_MAP_KEY                         present through the governed secret loader
VIGIA_CDSE_ACCESS_TOKEN                    not present in process environment
VIGIA_CDSE_USERNAME / VIGIA_CDSE_PASSWORD absent in process environment
VIGIA_DATABASE_URL                         not configured for a ready local PostGIS
VIGIA_ACQUISITION_STATE_FILE               optional; repository default applies
VIGIA_RAW_ARCHIVE_DIR                      optional; repository default applies
VIGIA_GEO_PYTHON                           optional; managed .venv default applies
VIGIA_SENTINEL3_*                          optional collection/search/budget overrides
VIGIA_MTG_FRP_*                            not configured
VIGIA_EARTHDATA_TOKEN                      optional
```

The configuration layer may also load approved values from a private local secret file or macOS Keychain. Provider diagnostics report only presence and validity state.

## Outbound network baseline

Bounded real probes established:

- NASA FIRMS map-key status: reachable and credential accepted.
- Copernicus Data Space Sentinel-3 FRP STAC collection: reachable; the running source remained unavailable for physical product extraction at capture time.
- Earth Search Sentinel-2 catalogue: reachable.
- The prior EUMETSAT collection URL returned HTTP 404 and cannot be treated as a valid live product path.
- The local VIGIA runtime was reachable at `127.0.0.1:4177`; FIRMS, ptdata weather, and ptdata report fetches had current real provider activity, but that runtime had no raw-vault checkpoint under the new worktree default path.

Outbound access is available, but every new runtime request remains subject to HTTPS, exact-host allowlisting, redirect confinement, timeouts, response-size budgets, safe content-type validation, and secret-redacted request identity.

## Activation starting point

The system already has credible physical ingestion and historical Portugal corpora, but it does not yet meet this vertical's live definition across five providers. In particular, provider manifests, data-rights enforcement, hierarchical causal lineage, global source coverage, generic durable provider health/cursors, current WFIGS/FEDS/CAP/ECMWF/GOES activation, leakage-safe multi-region evaluation, and a unified reality-network replay/report are not yet present.
