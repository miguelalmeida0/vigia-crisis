# Crisis Data Foundry operations

Run `npm run foundry:doctor` first. The expected local decoder is Rasterio/GDAL with the GRIB driver. PostGIS may remain `BLOCKED_EXTERNAL_ACCESS` without failing the deterministic file-backed lane.

Core commands:

```bash
npm run foundry:gaps -- --incident=2025-AZGCP-000597
npm run foundry:plan-gap-closure -- --incident=2025-AZGCP-000597
npm run foundry:reconcile -- --once
npm run hrrr:decode-and-certify -- --incident=2025-AZGCP-000597
npm run corpus:expand-wfigs
npm run corpus:build-negatives
npm run corpus:materialize-inputs
npm run corpus:build-examples
npm run corpus:baseline-eval
npm run corpus:readiness
npm run report:data-foundry
npm run benchmark:data-foundry
npm run demo:crisis-data-foundry
```

All defaults are bounded. WFIGS is restricted to the declared Dragon Bravo and Kaiser Canyon manifests, one incident per run and 40 revisions per page. HRRR reads only content-hash-verified GRIB files inside Bronze, caps messages at 12 MiB, uses a 45-second parser timeout, and emits at most a 64×64 incident-local grid.

Reconciliation creates no more than two authorized tasks per `--once` call. Task identities are deterministic, so a repeated action cannot create a second semantic task. Provider failure state becomes `BLOCKED_EXTERNAL_ACCESS` after the configured attempt budget and records the shortest external action.

`corpus:build-negatives` does not turn empty provider responses into negatives. The current 100 research locations are persisted as `UNKNOWN` observation opportunities and `NO_VALID_OBSERVATION` registry entries until coverage, product availability, provider health, quality, official-source checks, physical-source checks, and prescribed-fire doctrine are proven.

Reports and consumer snapshots are under `data/validation/data-foundry/`. Consumers must use the snapshot contracts and query service; they must not recalculate readiness.
