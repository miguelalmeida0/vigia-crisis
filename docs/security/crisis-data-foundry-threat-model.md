# Crisis Data Foundry threat model

Protected assets are raw provider bytes, credentials, bitemporal clocks, lineage hashes, rights policies, split manifests, labels, tasks, cursors, and readiness decisions.

The main attack paths are malicious or oversized GRIB, malformed geometry, path traversal from raw-object metadata, archive expansion, redirects and SSRF, credential forwarding, query/cursor injection, lineage cycles and hash substitution, schema downgrade, rights/split tampering, future-data injection, cross-incident leakage, and internal worker privilege escalation.

Controls include trusted-host fetching, redirect and response-size bounds, redacted request identities, no shell execution, a 12 MiB GRIB-message cap, Bronze realpath containment, pre/post SHA-256 verification, a 45-second parser timeout and 8 MiB output cap, finite-value/unit/clock/CRS contracts, immutable semantic identities, lineage cycle/missing-node/hash/rights checks, hash-chained material events, deterministic task identities and retry budgets, strict split/leakage audits, and exact Proof Plane incident/resource/action capability scopes.

Raw-containing exports and derived exports are evaluated separately. A restrictive upstream cannot silently become a permissive downstream. Every export boundary must carry attribution, rights, and blocked-content manifests.

Known external boundary: authenticated PostGIS is unavailable. The system preserves the adapter boundary and file-backed deterministic operation; it does not disable authentication or embed credentials to obtain certification.
