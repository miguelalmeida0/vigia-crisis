# VIGIA known limitations

## Physical-world coverage

- No configured point-level thermal source is running. FIRMS lacks a key; MTG/Sentinel-3 point paths are parsers without acquisition.
- The current production event set is public-report-only. It has no current physical fire observations.
- Operational MSG WMS is raster context, not point evidence, a fire perimeter, or proof of absence.
- Exact overpass footprints and detection limits are absent; negative evidence is therefore not authorized.

## Acquisition and evidence storage

- Original provider bytes use one local content-addressed filesystem archive. The archive is append-only by checksum in code, but is not WORM/object-locked and has no external retention policy.
- The physical critical path now has a PostgreSQL/PostGIS transaction for raw-product metadata, physical observations, stable events, associations, checkpoints, and lineage. The verified deployment is a single local Docker database, not a replicated or managed production data plane.
- Other operator, evidence, audit, alert, and compatibility event state still uses local JSON files. There is no distributed scheduler, acquisition lease, dead-letter queue, durable domain-event outbox, backup proof, or disaster-recovery exercise.
- ptdata licensing metadata is recorded only as `provider_terms_apply`; licence terms and retention permissions have not been encoded.
- Copernicus discovery and geostationary WMS imagery are not yet routed through the raw archive.
- Raw-to-canonical provenance is attached for ptdata and configured FIRMS; complete operator provenance inspection is not yet exposed in the UI.

## Identity and operations

- Production is public read-only. No OIDC/JWKS/session gateway or provisioned principals exist.
- ACTION and FIELD are unavailable to production users. The prior fake field app and local event-save workflow are not served.
- Operator, evidence, alert and compatibility event state still uses local JSON files. This is restart persistence, not an agency-grade production data plane.
- Audit entries are a mutable local hash chain, not immutable or externally anchored audit evidence.
- Alerts lack a durable delivery outbox, receipts and retry policy.

## Science and performance

- Fire-detection, event-association, geometry, prevention and outcome performance are `UNMEASURED` on real Portuguese incidents.
- Deterministic spread screens are not forecasts or probabilities.
- PREVENT and OUTCOMES remain hidden because no real release evidence earns them.
- No agency exercise, independent validation policy, safety case, SLO history or disaster-recovery drill exists.
