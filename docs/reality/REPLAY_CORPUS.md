# VIGIA replay corpus status

## Replay universe contract

REPLAY accepts recorded real source products only, processes them in arrival order, preserves event time separately from arrival time, and cannot see future records. Synthetic data belongs to TEST.

`npm run replay:portugal -- /path/to/corpus.json` has no bundled default and rejects any corpus whose `metadata.evidenceClass` is not `externally_labelled`. An external corpus must include attributable label authority (`organization`, `approvedAt`, `datasetId`). Replay repositories reject synthetic provenance.

## Available corpora

| Corpus | Universe | Evidence class | Operational use |
|---|---|---|---|
| `apps/api/test/fixtures/replay/portugal-software-replay.json` | TEST | `synthetic_software_fixture` | Software mechanics only via `npm run test:replay` |
| Real Portugal historical source corpus | REPLAY | absent | **BLOCKED** |

The TEST corpus proves late-arrival handling, stable software event identity, persistence and refusal of perimeter authority. It does not measure wildfire detection or association performance.

## Required real corpus

R2 cannot pass until a corpus contains attributable original products and retrieval metadata for at least:

- one point-level thermal provider (VIIRS, MTG FCI FRP pixels, or Sentinel-3 SLSTR FRP);
- later public reports for the same fires;
- original source timestamps, arrival timestamps, checksums and licensing metadata;
- independently governed event labels or incident references;
- documented geographic/time scope and known coverage gaps.

Current state: **BLOCKED — no real replay corpus supplied or acquired.**
