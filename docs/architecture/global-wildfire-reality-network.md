# Global Wildfire Reality Network v1

Status: implemented and live-verified on 2026-08-24. This document describes the backend boundary; no operator-console or web source was changed.

## Data path

Every live product follows one path:

```text
allowlisted HTTPS provider
  -> bounded retrieval and response budget
  -> Bronze content-addressed raw object
  -> retrieval manifest, licence and request window
  -> safe parser / normalizer
  -> record-stable canonical operational event
  -> causal lineage and structured quality
  -> append-only Event Fabric journal
  -> Operational Twin and evidence graph
  -> live wildfire evidence contract v2
  -> coverage-aware next-best source selection
  -> SHADOW-only reconciliation receipt
  -> hash-verified replay
```

Raw container hashes are retained in the provenance chain. Canonical record identity uses a stable record hash so an unchanged WFIGS feature or FIRMS pixel does not acquire a new identity merely because unrelated records in the query response changed.

## Layers and state

- Bronze: exact received bytes, checksum, content type, request identity with secrets redacted, response metadata, query window, parser version, licence, retrieval outcome and canonical bindings.
- Silver: normalized operational events with knowledge time, point geometry, native geometry references, product maturity, processing mode, quality and causal lineage.
- Gold: incident/evidence projections, source eligibility, evaluation manifests, ablations and replay hashes. Gold is reproducible; it is not raw truth.
- Provider state: durable JSON cursors, attempts, successes, failures, retry state, bytes, duplicates, schema drift and latency samples.
- Event state: checksummed append-only JSONL. PostgreSQL/PostGIS remains the production persistence target, but local PostGIS was unavailable during this activation; the live proof therefore uses durable local journals and content-addressed files.

## Causal independence

The source model records transport provider, publisher, processing centre, satellite platform, instrument, instrument family, algorithm product, original observation, institution and physical modality. Quorum first deduplicates `originalObservation`, then tests declared dimensions. Consequences:

- another broker of the same pixel adds no witness;
- FEDS is `CONTEXT/DERIVED` and cannot add a physical witness beyond VIIRS;
- S-NPP, NOAA-20 and NOAA-21 are separate platforms but one VIIRS instrument family;
- MODIS, VIIRS and ABI can satisfy three-family diversity when each has a current positive observation;
- weather, smoke, assets and fire-weather warnings never establish fire presence.

## Region-aware collection

`source-coverage-index.v1` contains geographic applicability, temporal coverage, cadence, expected latency, maturity, lineage and contract roles. Eligibility combines the requested geometry/time, provider health, credentials, maturity, causal exclusions and evidence role. The live selector uses a current WFIGS incident and current ABI fire pixels to select a bounded candidate, then only associates physical/derived events within 25 km. Broad provider surveys are never attached wholesale to the incident.

Coverage is not global in the colloquial sense. FIRMS and ECMWF are global-capable; the activated GOES physical layer covers the Western Hemisphere; WFIGS/NWS/FEDS are US-oriented; Overpass completeness varies. Europe/Africa geostationary continuity (MTG), Asia-Pacific geostationary fire data, global official CAP, EFFIS and CAMS remain unavailable or partner-gated.

## Evidence and consumer boundary

The live contract requires two causally eligible physical families plus an official source, with operational/provisional maturity and attributed provenance. The hierarchical live assessment additionally reports original-observation, instrument-family, institution and modality counts.

`vigia.reality-consumer-snapshot.v1` is the backend/UI boundary. It supplies incident evidence, debt, official alerts, perimeter summary/reference, weather, exposure, source status/latency, next-best evidence, shadow state and rights. A UI consumer must not query providers, merge incidents, count families, infer health or calculate confidence.

## Restart and replay

Provider state and raw products are idempotent by content hash. Retrievals bind raw hashes to canonical event IDs. The journal rejects identity conflicts, survives process restart and produces deterministic Twin replay hashes. Historical evaluation sorts incident rows before hashing, and leakage tests prohibit incident/upstream observation split crossing, future information, standard-product use in NRT, and final-perimeter live features.

## Explicit non-claims

- No spread forecast or consequence forecast was implemented.
- ECMWF is weather context, not fire evidence.
- An empty provider response is not a physical negative without a valid observation opportunity.
- The retained real historical corpus does not meet multi-region, two-season or negative-control gates.
- Sentinel-3 catalogue/auth readiness is not a live Sentinel-3 physical observation.
- No ML model was advanced because the evaluation corpus is insufficient for calibrated deployment claims.
