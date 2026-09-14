# Knowledge-time historical forecast corpus

## Purpose

This vertical reconstructs only what VIGIA could legitimately have known at a
historical forecast cutoff. It does not promote a model, reinterpret final burned
area as an operational perimeter, or manufacture negatives. The current pilot is
deliberately allowed to produce zero Gold examples.

## Data flow

```text
bounded acquisition manifest
  -> allowlisted provider request
  -> immutable content-addressed Bronze object
  -> canonical, time-aware Silver object
  -> incident crosswalk and quality checks
  -> deterministic candidate/rejection builder
  -> leakage-safe split assignment
  -> Gold examples, if and only if every input passes
  -> existing forecasting baselines
  -> quality report and replay fingerprint
```

No provider response goes directly to Gold. A raw object is persisted and hashed
before a canonical cursor can advance. Parser versions, request windows, licences,
and credential-redacted request identities remain attached to Bronze.

## Knowledge-time contract

Every historical object separates:

- `physicalOccurredAt`
- `observedAt`
- `providerPublishedAt`
- `providerModifiedAt`
- `retrievedAt`
- `availableToVigiaAt`
- `canonicalIngestedAt`
- `labelPublishedAt`

Operational replay filters on `availableToVigiaAt <= forecastInformationCutoff`.
It never substitutes geometry time, modification time, or final-label time for
availability. Simulated arrival is source-specific, versioned, deterministic, and
identified by `arrivalTimeBasis`; it is not represented as an observed receipt.

## Source classifications

Perimeter sources are classified as `ISSUE_TIME_SEQUENCE`,
`ARCHIVED_OPERATIONAL_SNAPSHOT`, `DERIVED_PROGRESS_SEQUENCE`, `FINAL_ONLY`,
`TIMESTAMP_UNTRUSTWORTHY`, or `UNUSABLE`. Only the first three can participate in
spread examples. WFIGS Daily Perimeters is retained as an archived operational
snapshot and carries NIFC's warning that it is not an official progression.

Weather runs preserve model, run type, issue time, modelled availability, member,
grid, fields, valid times, byte-range archive identities, and missing-value QA.
Analysis and reanalysis cannot enter operational features. Undecoded GRIB bytes
remain useful Bronze evidence but fail Gold eligibility.

Fuel and terrain packs preserve dataset/reference versions, conservative provider
availability, coverage, resolution, units, nodata policy, transformation, content
hashes, and licensing. Current landscapes cannot rewrite historical state. The
terrain vertical datum is explicitly uncertified for physical-solver use.

## Identity and causal lineage

WFIGS state identity is based on stable provider feature identity, revision,
observation time, and original geometry hash—not retrieval time. The crosswalk uses
official identifiers first and conservative spatiotemporal evidence second.
Ambiguous links remain ambiguous. FEDS retains its VIIRS causal root and cannot be
counted as another independent sensor family.

Physical observations are deduplicated by causal root. Splits isolate incident,
upstream observation, physical pixel, provider republication, persistent anomaly
site, and near-duplicate geometry groups before feature generation.

## Negative doctrine

A strong wildfire negative requires coverage, source health, valid observation
opportunity, adequate quality, a defined space-time window, official incident
checks, physical fire checks, and prescribed-fire resolution. Empty responses and
provider downtime are never negatives. Prescribed or agricultural fire can be
physical fire presence while remaining a wildfire negative; it is not “no fire.”

The versioned persistent thermal-anomaly registry is research evidence and context,
not a production blacklist. Ambiguous candidates remain excluded controls.

## Replay

The semantic replay record binds sorted raw hashes, parser and schema versions,
association doctrine, knowledge-time policy, example builder, split version,
crosswalk, eligible and rejected IDs, negative controls, and leakage audit. Reversed
input ordering must reproduce the same fingerprint.

## Runtime and recovery

Each manifest bounds incidents, days, region area, provider objects, bytes,
concurrency, runtime, retries, and storage. Downloads use host allowlists, response
size limits, timeouts, secret-redacted identities, retry/backoff, and immutable
checksums. Completed raw objects deduplicate across restart. A failed run resumes
from its persisted manifest and does not mark Silver complete until its raw lineage
is durable.

The current runtime is file-backed because local PostGIS authentication is not
available. The acquisition and canonical contracts form the database adapter
boundary; authentication is not weakened to force a database test.

## Current measured state

The retained pilot contains 36 discovered incidents: one Western US incident with
40 captured WFIGS revisions and 35 Portugal official final-only records. The pilot
also contains one HRRR run (index plus five GRIB messages), five LANDFIRE LF2023
fuel layers, three LF2020 terrain layers, and nine normalized FIRMS VIIRS standard
observations. It contains zero forecast-eligible incidents and zero valid negatives.
This is a scientifically useful acquisition proof, not an evaluation corpus.
