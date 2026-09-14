# Fire forecasting operations

## Commands

```bash
npm run forecast:doctor
npm run corpus:forecast -- --region=Portugal --from=2024-01-01 --to=2024-12-31
npm run train:forecast-baselines
npm run eval:spread-forecast
npm run shadow:spread -- --once
npm run shadow:spread -- --duration=10m
npm run demo:spread-forecast
npm run report:forecast-quality
npm run benchmark:forecast
npm run test:forecasting
```

All commands support `--help`. Shadow duration is capped at ten minutes and leaves no uncontrolled process. `train:forecast-baselines` registers and audits deterministic comparators; it does not train a statistical model while data gates fail.

## Expected current behavior

The current retained Three Queens incident is suitable for an abstention assessment, not forecast issuance. The latest run has one official perimeter revision, one deterministic ECMWF member, no fuel pack, no terrain pack, no calibration, stale/invalid forecast geometry, and no verified physical solver. The command must persist an `ABSTAINED` forecast, preserve replay identity, and execute zero external actions.

## Context-pack manifest

Set `VIGIA_FORECAST_FUEL_PACK_MANIFEST` and `VIGIA_FORECAST_TERRAIN_PACK_MANIFEST` only to reviewed retained packs. The schema is:

```json
{
  "schemaVersion": "vigia.forecast-context-pack.v1",
  "kind": "FUEL",
  "datasetId": "LANDFIRE-FBFM40",
  "version": "pinned-release",
  "referenceDate": "2025-06-01T00:00:00Z",
  "knowledgeTime": "2026-08-24T00:00:00Z",
  "resolution": "30m",
  "coverage": { "bbox": [-122, 46, -120, 48] },
  "licenceId": "reviewed-licence-id",
  "transformation": "documented transformation",
  "limitations": [],
  "layers": [{
    "name": "FBFM40",
    "path": "relative/path.tif",
    "contentHash": "sha256:...",
    "width": 1,
    "height": 1,
    "bands": 1,
    "dataType": "uint8"
  }]
}
```

Fuel and terrain must use separate manifests. Coverage, release/version, knowledge time, licence, transformations, resolution, byte sizes, and layer hashes are preserved in the forecast report.

## Physical runner

Configuration requires an executable and an expected artifact hash:

```text
VIGIA_FLAMMAP_EXECUTABLE
VIGIA_FLAMMAP_ARTIFACT_SHA256
VIGIA_WINDNINJA_EXECUTABLE
VIGIA_WINDNINJA_ARTIFACT_SHA256
VIGIA_FORECAST_RUNNER_TIMEOUT_MS
```

`forecast:doctor` must show `READY`; `ARTIFACT_HASH_REQUIRED`, `ARTIFACT_HASH_MISMATCH`, and `NOT_INSTALLED` are hard failures. This macOS workspace has no compatible FlamMap/FARSITE or WindNinja executable, so no physical model actually ran.

## Incident update and scoring

Each shadow run reloads retained raw products, constructs an assimilation state, detects contradictory revisions, and attempts to score prior issued forecasts only when a later official perimeter is learned at a declared horizon. Current abstained forecasts are not scored. NRT and final/standard labels must remain separately identified.

## Failure handling

Never bypass abstention for a demo. Missing weather ensemble, fuel, terrain, calibration, perimeter history, geographic applicability, fresh geometry, or resolved association/contradiction is an explicit reason to withhold. Never copy a current perimeter into a historical label or infer an exposure outcome from a forecast contour.
