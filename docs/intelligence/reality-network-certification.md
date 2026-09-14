# Reality Network activation record

Certification time: 2026-08-24. Latest stable evidence should always be read from `data/validation/reality-network/latest-live-run.json`; numeric provider values below describe run `bf5d8b3c-c164-4b05-8a50-205c72cf34fe` and will age.

## Actually live and verified

| Provider | Product/role | Current run | Raw bytes | Limitation |
|---|---|---:|---:|---|
| NIFC WFIGS | current official perimeters | 25 records, 25 normalized | 3,120,084 | US programme; not every incident has a perimeter |
| NOAA GOES-18/19 | ABI L2 FDCC physical | 2 products, 4 current pixels in survey | 814,778 | Western Hemisphere; ABI G18/G19 is one instrument family |
| NASA FIRMS | VIIRS S-NPP/N20/N21 and MODIS NRT | 4 products, 154 bounded pixels | 13,266 | map key required; polar cadence and false thermal anomalies apply |
| NASA FEDS | VIIRS-derived NRT perimeters | 5 records | 29,724 | context only; cannot add a VIIRS-independent witness |
| NWS | active CAP/GeoJSON alerts | 1 record, no supporting fire warning | 4,049 | US jurisdiction; fire-weather alert is not fire confirmation |
| ECMWF | IFS 0.25° weather sample | index + four ranged GRIB messages, 1 context event | 2,865,949 | deterministic member only; not a spread forecast |
| OpenStreetMap | bounded critical assets | valid zero mapped assets, 1 context event | 372 | contributor completeness varies; live road segments are excluded to respect shared Overpass budgets |

The selected current incident was WFIGS `2026-WAOWF-260420` (Three Queens). The live contract reported `CORROBORATED` from ABI, MODIS and VIIRS plus WFIGS. The run retained 314 associated canonical events, recorded an exposure opportunity with zero mapped assets, and attached IFS weather. All seven active runtime providers were live, the Twin incident binding resolved, and replay hash verification passed.

## Implemented but not live

- Sentinel-3 SLSTR FRP: catalogue reachable and credentials present/redacted in the doctor, but no Sentinel-3 payload was acquired by this new runtime. Status is readiness, not live evidence.
- EUMETSAT MTG FCI: credentials/product endpoint and payload schema not confirmed. `CREDENTIALS_REQUIRED`.
- EFFIS, CAMS and non-US CAP: explicit partner ports, no lawful validated endpoint. `PARTNER_REQUIRED`.
- Static GHSL, WorldCover, DEM and LANDFIRE packs: registered with metadata requirements; only OSM context was live-fetched here.

## Evaluation

The retained real corpus has 35 Portugal 2024 official incidents and 2,523 arrival records. Leakage tests pass and replay is order-invariant. Opportunity-adjusted recall is 1 within this selected positive-only corpus, but this is not a general detection estimate: negative controls are zero, false-incident rate is therefore `null`, and independent physical-family corroboration is 0 because multiple VIIRS platforms remain one family. The prior validated replay reports association rate 1, fragmentation rate 0, false-merge rate 0 and observation-level association accuracy 0.7556. Multi-region and two-season historical gates are not met. ML status is `NOT_ADVANCED_TO_SHADOW_ML`.

## Source ablation interpretation

Removing the official ICNF source removes official lead/lag measurement. Removing individual VIIRS platform feeds reduces observation coverage but does not remove an independent modality because all are VIIRS. The current live US run proves ABI/MODIS/VIIRS diversity, but it is not a held-out historical evaluation. Incremental value beyond these statements is not claimed.

## Safety, rights and volume

The run’s derived export-rights assessment passed with required attributions for ECMWF, NASA, NOAA/NWS, NIFC and OpenStreetMap. The raw vault held 52 objects and 21,115,863 bytes across 127 retrieval records at the measured quality report. No secret values are stored in run/retrieval output. SHADOW reconciliation durably retains three would-have consequential actions from the activated control plane; no external executor ran.

## Known gaps and next vertical

The largest measured gap is not the absence of another detector. It is the absence of leakage-safe multi-region, multi-season negative opportunity controls and decision-grade future-state evaluation. The next single vertical should be **decision-grade fire spread and impact forecasting**, but only after acquiring those evaluation controls. It should use forecast issue time, ensembles, calibration and impact labels; current ECMWF context must not be relabelled as a spread forecast.
