# Fire spread and impact forecasting architecture

## Status

V1 is a research-only, fail-closed forecasting plane. It can package retained real incident state, assimilate issue-time observations, evaluate applicability, issue transparent baseline contours only when every required input is present, estimate possible asset exposure, persist a receipt, and verify an identical replay. It cannot contribute evidence, authority, corroboration, policy approval, or consequential execution.

The retained current incident does not pass applicability. The historical corpus is not forecast-eligible. No model is approved for decision support.

## Boundary

```text
Reality Network (observations only)
  -> immutable issue-time manifest
  -> assimilation state
  -> applicability / abstention
  -> baseline and physical-model ports
  -> transparent ensemble
  -> forecast object (epistemicType=FORECAST)
  -> possible exposure projection
  -> shadow policy input (consequentialExecution=DISABLED)
  -> durable receipt and replay verification
  -> later-observation scoring controller
```

Forecast objects always carry `evidenceEligible=false` and `authorityEligible=false`. They are stored outside the Event Fabric evidence store. The consumer snapshot supplies complete forecast semantics but never asks the frontend to interpolate, calibrate, merge weather, infer exposure, select a model, or decide applicability.

## Issue-time contract

Every manifest binds the incident, issue time, information cutoff, initial perimeter revision, source products, weather model/run/member, fuel and terrain dataset versions, model version, policy version, content hashes, licence identifiers, maturity, and NRT/standard processing mode. Inputs learned after the cutoff, final perimeters, target labels, and later weather runs are rejected.

Fuel and terrain packs are local, retained, content-addressed manifests. Each layer must be inside the manifest directory, hash-identical, bounded in bytes, temporally available at cutoff, and cover the forecast point. A configured executable is still unavailable until its model artifact hash verifies.

## Models and uncertainty

Implemented deterministic comparators are no-growth persistence, recent-growth persistence, wind-aligned progression, and observation-derived kinematics. Their threshold shapes are explicitly uncalibrated. A transparent weighted ensemble preserves member IDs, versions, fingerprints, and weights. A single member is marked `DEGRADED_SINGLE_MEMBER`; it is never treated as a calibrated ensemble.

The physical runner is an isolated, shell-free, allowlisted subprocess port with domain, raster-cell, input/output byte, timeout, artifact-hash, path, schema, and contour checks. It records hashes for the executable artifact, inputs, outputs, stdout, and stderr. The host does not provide an enforceable process memory cap, which remains a promotion blocker.

## Physical-model compatibility

The US Forest Service states that standalone FARSITE4 is no longer supported and that FARSITE is included in FlamMap6. FlamMap is a 64-bit Windows application and requires eight landscape layers: elevation, slope, aspect, fire-behavior fuels, canopy cover, canopy height, canopy base height, and canopy bulk density. See [FARSITE](https://research.fs.usda.gov/firelab/products/dataandtools/farsite) and [FlamMap](https://research.fs.usda.gov/firelab/products/dataandtools/flammap).

WindNinja provides high-resolution, terrain-adjusted wind fields and is represented by a separate runner port; it is not installed here. See [WindNinja](https://research.fs.usda.gov/firelab/products/dataandtools/windninja).

LANDFIRE provides fuel and topographic products, including Landscape GeoTIFFs commonly consumed by fire-behavior models and area-of-interest access through LFPS. See [LANDFIRE fuel products](https://www.landfire.gov/fuel) and [LANDFIRE data access](https://www.landfire.gov/data). Portugal terrain can use a properly licensed, retained Copernicus DEM pack; GLO-30 is a 30 m global DSM with explicit attribution duties. See [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM).

ECMWF Open Data exposes both deterministic and ensemble forecast streams in GRIB2, but the current retained run contains only one control member. See [ECMWF real-time Open Data](https://confluence.ecmwf.int/pages/viewpage.action?pageId=298944535).

NOAA's Next Generation Fire System is an observational fire detection/perimeter/time-of-arrival reference, not evidence that this repository has matched an operational spread-forecast service. The comparison is recorded in [ngfs-benchmark.md](../intelligence/ngfs-benchmark.md).

## Promotion

The fixed policy requires zero leakage, at least two regions, two seasons, 20 valid negative opportunity controls, incident and upstream-observation split isolation, all 1/3/6/12/24-hour horizons, wins over no-growth and recent-growth persistence, calibration error at most 0.10, no worse extreme underprediction, complete source/model ablations, stratified evaluation, and deterministic shadow replay. Missing measurements fail closed.
