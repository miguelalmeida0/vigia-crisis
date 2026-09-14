# NOAA NGFS benchmark

Reviewed against current official material on 2026-08-24.

NOAA describes the experimental Next Generation Fire System as combining GOES ABI data with automated detection, alerting, geolocation, fire intensity and ongoing spread tracking. NOAA also reports minute-scale regional imagery and five-minute CONUS refresh, while the underlying ABI Fire/Hot Spot Characterization product uses visible and infrared bands for fire location and sub-pixel characterization. Sources: [NOAA NGFS release](https://prod-01-alb-www-noaa.woc.noaa.gov/news-release/noaa-unveils-powerful-convergence-of-ai-and-science-with-revolutionary-next-generation-fire-system), [NOAA Wildland Fire Data Portal announcement](https://www.nesdis.noaa.gov/news/noaa-launches-wildfire-data-portal-expanding-public-access-satellite-fire-information), [GOES-R Fire/Hot Spot Characterization](https://goes-r.noaa.gov/products/baseline-fire-hot-spot.html).

## Comparison

| Property | NGFS benchmark | VIGIA v1 evidence |
|---|---|---|
| Geostationary cadence | Minute-scale regional / five-minute CONUS claims | Current GOES-18/19 FDCC product retrieval; no one-minute claim |
| Fire algorithm | NGFS experimental higher-order detection/alerting | Provider-native ABI FDC plus FIRMS; no proprietary NGFS algorithm |
| Cross-sensor model | Sensor-agnostic direction reported by NOAA | Explicit VIIRS, MODIS and ABI families with causal hierarchy |
| Incident model | Event-oriented situational awareness | WFIGS-seeded Operational Twin with exact correlation and 25 km association cap |
| Fire intensity | NGFS intensity and evolution | Native FRP/temperature/mask fields retained; no calibrated intensity forecast |
| Weather/terrain/fuels | NGFS reports complementary geospatial layers | Live ECMWF context; declared OSM/DEM/land-cover/fuel packs; only OSM live in this run |
| Proof/rights/replay | Not evaluated from public product description | Raw hash, retrieval manifest, licence registry, append-only journal and verified replay |
| Official state | Operational partner workflows | WFIGS and NWS; no global authority feed |

## Honest position

VIGIA v1 is stronger at explicit causal accounting, immutable raw provenance, licence gates and replay. It is weaker at geostationary latency, cloud-tolerant higher-order algorithms, terrain/fuel integration, operational user validation and measured global generalization. NOAA’s published operational adoption evidence is not reproduced here. The next comparison must use shared incidents and measure latency, precision, false alerts and operator value; architecture checklists are not a substitute.

NASA documentation is also relevant to the non-independence rule: FEDS perimeters are modelled from VIIRS detections and therefore remain derived context, not another witness. Source: [NASA FIRMS FEDS description](https://firms.modaps.eosdis.nasa.gov/descriptions/FEDS_VIIRS_SNPP.html).
