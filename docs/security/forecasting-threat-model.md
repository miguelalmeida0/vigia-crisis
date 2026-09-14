# Forecasting threat model

## Protected properties

- A forecast can never become observation, evidence, authority, or autonomous command.
- Replaying the same manifest, model, calibration, and code identity must yield the same semantic forecast.
- Later information cannot enter an earlier forecast.
- Only allowlisted, hash-pinned artifacts may execute.
- Resource exhaustion and malformed geospatial inputs fail before consequential use.

## Controls

| Threat | Control | Residual state |
|---|---|---|
| Final perimeter or future input leakage | Cutoff validation, forbidden target roles, dataset split audit | Historical corpus remains ineligible |
| Later weather substitution | Weather issue time is bound before cutoff and hashed | One current control member only |
| Path traversal | Root containment for raw products, context layers, run files | Tested |
| Malicious/oversized raster | Layer byte ceilings; dimensions, bands, datatype, hash, and raster-cell ceilings | Solver-specific parsing still requires sandbox hardening |
| Unsafe arguments | Fixed allowlisted executable and arguments; `shell=false`; no input-supplied command | Tested |
| Hostile/corrupt model artifact | Required SHA-256 artifact pin; registry and receipt fingerprints | No solver artifact configured |
| Unbounded runtime/output/domain | Timeout, forced kill, stdout/stderr/output limits, 25,000 km² domain limit | Tested |
| Unbounded process memory | Reported as `HOST_NOT_ENFORCED` | Blocks physical-model promotion |
| Cache/identity poisoning | Immutable semantic IDs; conflicting output or score hashes rejected | Tested across restart |
| Model/calibration substitution | Receipt binds model, inputs, calibration, and output; replay invalidates substitution | Tested |
| Bad probability geometry | Range, self-intersection, and monotonic-area checks | General concave geometry skill is unvalidated |
| Overconfident single member | Explicit degraded state plus calibration and weather-ensemble abstention | Tested |
| Consequential action attempt | Forecast policy allowlist; evidence/authority false; execution disabled | Tested |

## Trust zones

Reality Network raw bytes and provider metadata are untrusted input. Content-pack manifests are trusted only after cutoff, coverage, containment, size, and hash checks. External solver artifacts are untrusted until allowlisted and hash-pinned. Solver output is untrusted until bounded parsing and probabilistic-geometry validation. Consumer snapshots are projections and cannot grant authority.

## Operational rule

Do not set `VIGIA_FARSITE_EXECUTABLE`, `VIGIA_FLAMMAP_EXECUTABLE`, or `VIGIA_WINDNINJA_EXECUTABLE` without the matching SHA-256 environment variable and a reviewed isolation profile. An executable that merely starts is not scientific validation.
