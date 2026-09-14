# Reality Network security model

## Protected assets

Provider credentials, raw observations, provider cursors, licence restrictions, event identity, causal lineage, knowledge-time replay and control authority are protected assets. Provider bytes are untrusted even when retrieved from an official host.

## Boundary controls

- HTTPS only, exact hostname allowlists, standard port only, no embedded URL credentials and no private/loopback targets.
- Redirects are disabled; credentials cannot be redirected to another host.
- Secrets are loaded from environment, a private local secret file, container secret file or macOS Keychain. They are redacted from request identity and never written to run reports.
- Per-request timeouts and byte ceilings, per-provider run budgets, bounded ArcGIS pages, bounded FIRMS day windows, bounded Overpass result counts, and raw-vault capacity limits.
- CAP XML rejects DTD/entity declarations, stylesheets, invalid controls, excessive bytes, tags and depth.
- GOES NetCDF and ECMWF GRIB parsers run out of process with file-size, record-count, timeout and output-buffer limits. Required schemas are checked before acceptance.
- Full native perimeter geometry remains in immutable raw storage. Canonical payloads omit oversized geometry and retain a bounded summary/reference.
- Product maturity and processing mode are explicit. Standard/reprocessed data cannot silently enter NRT evaluation.
- Raw/query snapshot identity includes content hash. Record identity uses stable per-record hashes so unrelated container changes cannot rewrite event history.

## Failure semantics

Rate limit, timeout, schema drift, unavailable provider, invalid opportunity and empty valid product are separate states. Downtime and rate limits never become evidence of absence. Parser failures do not advance a successful cursor. A repeated raw object is a duplicate, not another observation.

## Adversarial coverage

Tests cover SSRF targets, non-HTTPS URLs, hostile CAP entity declarations, deeply nested ArcGIS geometry, raw-vault restart, immutable provider manifests, record-level causal duplicates, invalid observation opportunities, future-information leakage and split contamination. Remaining hardening work: fuzz native HDF5/NetCDF/GRIB parsers under resource isolation, exercise corrupt cursor recovery, and run the PostGIS transaction path when a database is available.

## Control safety

The live runtime invokes only `SHADOW` reconciliation. It records a would-have consequential action and receipt, but the executor is never called. No public warning, dispatch, provider mutation or external message is authorized by this activation.
