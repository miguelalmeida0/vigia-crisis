# Data-source and observation contracts

Every adapter is isolated. Source failure degrades its capability only; public-source mode never replaces a failed source with synthetic values.

## Current observation resolver

For a requested coordinate, the fabric attempts to return:

1. latest suitable Sentinel-2 observation;
2. previous comparable Sentinel-2 observation;
3. Sentinel-1 radar fallback when optical evidence is unsuitable or unavailable;
4. NASA GIBS broad context where needed;
5. historical annual mosaic only as an explicitly separated baseline.

Selection considers acquisition age, cloud, resolution, sensor suitability and availability. The response includes the reason a source was selected and what it cannot prove.

## api.ptdata.org

Used for ANEPC-derived occurrences, IPMA municipal rural-fire danger, IPMA station observations/warnings and ICNF history. Coordinates, timestamps and resource counts can be approximate or corrected upstream.

## Copernicus Data Space Ecosystem

- Sentinel-2 catalogue metadata and preview assets.
- Sentinel-1 catalogue fallback.
- Acquisition time, cloud metadata, footprint and product identity.

Catalogue presence is not physical-hazard evidence. Preview imagery supports inspection and tasking; acceptance remains human-gated.

## MTG / MSG Fire Radiative Power

Portugal Live discovers EUMETSAT LSA SAF Fire Radiative Power layers from WMS capabilities at runtime.

- **MTG FCI FRP Pixel** is preferred when available: 1 km nominal resolution, 10-minute product cadence, demonstration status.
- **MSG SEVIRI FRP Pixel** is the operational fallback: 3 km nominal resolution, 15-minute cadence.
- WMS time dimensions drive the replay control.
- GetMap failure on the preferred provider falls through to the next healthy provider.
- The raster is live thermal context. It is not automatically promoted to a verified incident.

## NASA FIRMS

Optional point-level VIIRS thermal evidence configured with `NASA_FIRMS_MAP_KEY`. An absent key is `not_configured`; it is not interpreted as “no fire.”

## IPMA / EUMETSAT thermal context

Optional visual context. A successful raster response does not independently verify an incident.

## OpenStreetMap / Overpass

Screens mapped buildings and critical features. Completeness varies, so output is “mapped exposure,” never a complete asset inventory. The API terminates as available, partial or unavailable.

## External spread provider

`VIGIA_SPREAD_PROVIDER_URL` can connect a separately validated fire-behaviour service. The provider must return named model/version, issue time, inputs, scenarios, uncertainty and limitations. Without it, VIGIA exposes only explicitly unvalidated screening geometry.

## Field and camera evidence

The evidence service accepts attributable human/camera/drone observations through the same request/package/review contract. The local reference app stores attachment references; production media belongs in encrypted object storage.

## Source-state model

```text
id
label
origin
cadence
state
fetchedAt
upstreamAt
ageSeconds
timeConflict
error
```

States:

- `current`
- `stale`
- `unavailable`
- `not_configured`
- `fixture`

## Timestamp firewall

Source times are rejected when null, empty, epoch-like, implausibly old for an active record, materially future-dated or otherwise invalid. Rejected times display as unavailable/conflicting and cannot be used for freshness ranking.
