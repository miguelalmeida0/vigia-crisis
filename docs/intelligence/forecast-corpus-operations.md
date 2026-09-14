# Forecast corpus operations

## Commands

```bash
npm run corpus:doctor
npm run corpus:plan -- --region=western-us --from=2025-07-05 --to=2025-07-10
npm run corpus:acquire -- --manifest=data/runtime/forecast-corpus/plans/<hash>.json
npm run corpus:resume -- --run=<run-id>
npm run corpus:validate
npm run corpus:build-forecast-examples
npm run corpus:leakage-audit
npm run corpus:report
npm run corpus:benchmark
npm run demo:forecast-corpus
```

Every command accepts `--help`. Planning requires an explicit region and time
window. Acquisition accepts only a manifest inside the repository. Defaults are at
most five incidents, ten days, 64 total provider objects, 64 MiB, concurrency two,
180 seconds, two retries, and 512 MiB local storage. The WFIGS page is capped at 40
records so enrichment has a reserved object budget.

Exit code 0 means the requested operation completed. Invalid input uses exit code 2.
Acquisition, validation, or leakage failure uses exit code 1. A completed report may
still contain `CORPUS_NOT_READY`; readiness is a scientific decision, not a process
exit failure.

## Deterministic locations

- Plans: `data/runtime/forecast-corpus/plans/`
- Runs and cursors: `data/runtime/forecast-corpus/runs/`
- Bronze bytes: `data/runtime/forecast-corpus/bronze/`
- Silver: `data/runtime/forecast-corpus/silver/`
- Gold: `data/runtime/forecast-corpus/gold/`
- Reports and data cards: `data/validation/forecast-corpus/`

Files are content-addressed or manifest/run-addressed. Do not edit generated Bronze,
Silver, Gold, run, or validation files by hand.

## Acquisition procedure

1. Run the doctor and review credentials, terms, archive period, knowledge-time
   quality, and source blockers.
2. Generate and review the fingerprinted plan. Confirm every budget and the incident
   selection rule before evaluation.
3. Acquire the plan. Bronze preservation and checksum validation occur before
   canonical binding or cursor completion.
4. If interrupted, resume the run ID. Do not create an unbounded replacement plan.
5. Validate and run the leakage audit.
6. Build forecast examples, run the report, and benchmark replay.
7. Treat only the explicit readiness decision as the corpus gate.

Provider credentials are loaded through existing configuration. Logs and manifests
must never contain secret values. The FIRMS request identity is redacted before
preservation.

## Failure handling

- `NETWORK_BLOCKED`: preserve the failed run and retry within its manifest ceiling.
- `CREDENTIALS_REQUIRED`: configure the official credential; never place it in a
  manifest or command line.
- `PARTNER_REQUIRED`: record the access dependency; do not substitute reanalysis or
  scraped replicas.
- `FINAL_ONLY`: retain only as retrospective label/context.
- checksum or provider-product conflict: stop and investigate upstream mutation.
- malformed geometry/weather/raster: preserve Bronze when safe, reject canonical
  use, and do not advance Gold.
- byte/object/storage/runtime ceiling: the run fails closed and requires a newly
  reviewed bounded manifest if scope must change.

## Certification boundary

The physical-solver pack is preparation only. LANDFIRE transformations and hashes
are preserved, but no FlamMap/FARSITE compatibility claim is made. PostGIS remains
uncertified until an authenticated test database is available. Restricted raw
products are excluded from export even when derived metadata is permitted.
