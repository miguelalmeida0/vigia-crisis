# Crisis Data Foundry baseline

Recorded on 2026-08-24 in
`/Users/malmeida/Documents/Development/vigia-intelligence` on branch
`feat/vigia-intelligence-foundation` before Foundry implementation.

The repository root, branch, and root write access were re-verified. The temporary
write probe was deleted immediately. No source under `apps/operator-console` or
`apps/web` is changed; the existing untracked Operator Console `dist` directory is
preserved and is not an input to this vertical. The sibling checkout is out of
scope and was not modified.

## Capability map

| Existing capability | Decision | Reason |
| --- | --- | --- |
| Immutable Raw Data Vault and acquisition state | Keep and extend | Already persists bytes before cursor advancement, hashes content, deduplicates, quarantines, and survives restart. Foundry products should reference it rather than create another archive. |
| Fingerprinted corpus acquisition manifests and run store | Keep and extend | Existing budgets, retry ceilings, storage limits, resumability, and run identity are the correct acquisition boundary. |
| Forecast corpus Bronze/Silver/Gold builder | Extend | Knowledge-time, rejection, split, rights, and replay rules are sound, but products are file-oriented and there is no general product registry, lineage graph, gap graph, or incremental materializer. |
| Reality Network provider manifests and trusted fetch | Keep | Existing SSRF, redirect, secret-redaction, size, timeout, provider-health, and causal-lineage controls should remain the network boundary. |
| Event Fabric and Operational Twin | Keep; bind by reference | Foundry material-change events are operational metadata, never wildfire evidence. Incident products should bind to ontology identities without altering physical truth. |
| Policy/reconciliation controllers | Extend | Existing desired-state, bounded work, retry/backoff, circuit-breaker, idempotency, receipt, and postcondition patterns are suitable for data-gap reconciliation. |
| Proof Plane | Extend at the worker boundary | Machine acquisition/materialization needs least-privilege capabilities; it must not invent authority merely because work is internal. |
| Forecasting Plane and four baselines | Keep | The consumer boundary is already deterministic and explicitly non-authoritative. It should consume certified Foundry packages, not be rewritten. |
| File-backed JSON persistence | Keep as portable authority | Local PostGIS authentication remains unavailable. Atomic deterministic files remain the executable path while a transactional adapter boundary stays explicit. |
| HRRR byte-range acquisition | Extend | Five required messages and their archive index are immutable in Bronze, but decoding, unit/missing-value certification, incident-local slicing, and product lineage are absent. |
| WFIGS Daily acquisition | Extend | One bounded 2025 incident has 40 captured revisions. Multi-incident/multi-season plans, progression QA, and horizon labels are missing. WFIGS remains an archived operational snapshot, not an official progression. |
| FIRMS archive and LANDFIRE packs | Extend | Real data and provenance exist for one incident; repeatable incident materialization, observation-opportunity records, additional context layers, and solver datum certification are incomplete. |
| Corpus reports/data cards | Keep and supersede with queryable snapshots | They accurately report failure, but the missing requirements must become canonical gaps with executable plans and readiness impact rather than remain report text only. |

No existing subsystem requires replacement.

## Reproduced starting state

| Gate | Result |
| --- | --- |
| Event Fabric and Twin | 7 passed, 0 failed |
| Control Plane | 16 passed, 0 failed |
| Proof Plane | 14 passed, 0 failed |
| Reality Network | 12 passed, 0 failed |
| Forecasting Plane | 19 passed, 0 failed |
| Corpus Foundation | 11 passed, 0 failed |

`npm run corpus:validate` reproduced 36 discovered incidents, 0 eligible examples,
375 explicit rejections, a passing but empty-row leakage audit, registered rights
for the used derived corpus, and an identical reversed-order replay fingerprint.
The current readiness decision remains `CORPUS_NOT_READY`.

The environment has no `wgrib2`, ecCodes, cfgrib, or pygrib installation. The
reviewed repository Python environment does include Rasterio backed by GDAL's GRIB
driver. A retained HRRR message opens as a one-band Lambert Conformal GRIB dataset
with NCEP reference time, valid time, forecast step, native unit, element, and grid
metadata. Foundry decoding will use that bounded mature parser path rather than a
custom decoder.
