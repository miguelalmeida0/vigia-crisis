# VIGIA 4.0 — Portugal Live

## Direction change

VIGIA 3.0 proved an evidence and remediation architecture. VIGIA 4.0 moves the product's centre of gravity to the physical world **now**.

The default question is no longer “which workflow should I inspect?” It is:

> What is happening in Portugal right now, what changed recently, and which signal deserves attention first?

## Primary release surface

Portugal Live is the default route and fuses four independent clocks:

1. active civil-protection occurrence updates;
2. MTG/MSG geostationary Fire Radiative Power imagery;
3. optional VIIRS point detections;
4. IPMA weather and municipal fire danger.

No clock is relabelled as instantaneous. Every source keeps its own time, state and limitations.

## New capabilities

- MTG FCI FRP dynamic WMS discovery.
- Automatic MSG FRP raster fallback.
- Thermal replay from provider time dimensions.
- Current public occurrence correlation.
- Optional 375 m VIIRS support and unmatched thermal candidates.
- Source-specific freshness.
- New-report, thermal-support, mobilization and high-attention alerts.
- Portugal map that renders actual FRP pixels rather than synthetic fire art.
- Public-source mode is the standard launch command; fixtures are developer-only.

## Safety boundary

“Live” is a product surface, not a claim of zero latency. MTG FRP, MSG FRP, VIIRS and public occurrence feeds have different latency and detection characteristics. A satellite-only signal is a candidate, not a verified incident. A public occurrence is a report until independent evidence supports it.
