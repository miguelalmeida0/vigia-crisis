# Backend Convergence Baseline

Measured on 2026-08-25 before backend-convergence source changes. The authoritative
workspace was `/Users/malmeida/Documents/Development/vigia-intelligence` on branch
`feat/vigia-intelligence-foundation`; a repository-root create/delete probe passed.
The sibling `vigia` repository was not accessed.

## Correctness baseline

| Surface | Result | Duration |
| --- | ---: | ---: |
| Aggregate Intelligence domain | 90/90 pass | 1.637 s |
| Event Fabric + Operational Twin | 7/7 pass | 0.421 s |
| Control Plane | 16/16 pass | 1.138 s |
| Proof Plane | 14/14 pass | 0.549 s |
| Reality Network | 12/12 pass | 0.271 s |
| Forecasting | 19/19 pass | 0.401 s |
| Forecast corpus | 11/11 pass | 0.328 s |
| Crisis Data Foundry | 18/18 pass | 1.550 s |
| Decision Foundry | 20/20 pass | 3.093 s |
| Architecture/check | pass; 854 files, 763 modules | 12.37 s |

A first direct Data Foundry test invocation produced four `EPERM` failures because
it omitted the repository's sandbox-safe `TMPDIR`. The identical suite passed 18/18
when rerun with `TMPDIR=$PWD/.tmp/test`; this is an invocation/environment result,
not a product regression.

## Decision and query baseline

A retained Dragon Bravo (`2025-AZGCP-000597`) Decision Packet recompiled and
verified with replay fingerprint
`crisis-decision-packet:sha256:4e0573deb28766112fd1f207ee3e2cebd020b399a7ed958b91c31b1f1a41f1eb`.
Decision Foundry reports `DECISION_FOUNDRY_READY_FOR_SHADOW`.

The pre-change object-set benchmark repeatedly reads and parses packet artifacts:

| Workload | p50 | p95 | Throughput |
| --- | ---: | ---: | ---: |
| Large object-set query | 78.664 ms | 92.629 ms | 12.46/s |
| Full packet compilation | 1.346 ms | 1.634 ms | 725.14/s |
| Decision Delta | 0.0128 ms | 0.0153 ms | 73,806/s |

The measured object-set p95 misses the `<25 ms` common-query target by 3.7x even
on the retained small corpus. Packet compilation itself is not the bottleneck;
artifact discovery/deserialization is.

## Scientific readiness baseline

Corpus readiness remains `CORPUS_NOT_READY`:

- 37 discovered incidents; 2 eligible incidents.
- 11 examples across one region and two seasons.
- 0 valid negatives and 0 hard negatives.
- 0 calibration examples.
- horizon counts: 1h 0, 3h 0, 6h 1, 12h 3, 24h 7.
- failed gates: two regions, 100 incidents, negative minimums, progression
  completeness, calibration split, 1h horizon, and 3h horizon.

The negative atlas contains 100 candidates, 0 certified negatives, and 0 valid
hard negatives. No predictive or multi-region claim is justified by this corpus.

## Persistence ownership baseline

Transactional Postgres persistence exists for the earlier physical-truth,
operations, alert, and incident-command surfaces. The intelligence layers below
remain wholly or partly file-backed:

| Semantic state | Pre-change owner |
| --- | --- |
| Canonical operational event journal | JSONL append-only journal / memory adapter |
| Operational Twin | replayed in-memory projection |
| Data Product Registry and versions | generated JSON registry |
| Lineage graph | generated JSON graph |
| Data Gaps and acquisition plans | generated JSON files |
| Pipeline tasks and material events | JSON foundry state/event chain |
| Decision Packets and replay records | per-incident JSON files |
| Object-set views | packet-file scan and deserialization |
| Forecasts, scores, receipts | bounded JSON store |
| Provider/source state | JSON store |
| Forecast acquisition runs/manifests | per-run JSON and raw-vault objects |
| Proof/revocation state | primarily immutable in-memory/domain records plus receipts |
| Prospective archive manifests | no converged repository-backed archive |

## Postgres/PostGIS baseline

`npm run db:doctor:json` returned `DOCKER_UNAVAILABLE`. The Docker client is
installed at `/opt/homebrew/bin/docker`, but the daemon is not running. The
configured local target at `127.0.0.1:55432/vigia` refused connections; PostGIS,
migrations, schema integrity, transactions, concurrency, recovery, and restart
reconstruction therefore cannot be certified in the pre-change environment.
No credentials or authentication settings were weakened.

## Memory baseline

The host blocked `/usr/bin/time -l` kernel clock introspection, so authoritative
peak RSS comes from the existing in-process benchmark instrumentation:

| Workload | Baseline/peak RSS |
| --- | ---: |
| Forecast packaging/replay | 310,689,792 bytes (296.3 MiB) |
| Decision Foundry benchmark | 582,909,952 bytes (555.9 MiB) |
| Forecast corpus benchmark | 1,122,926,592 bytes (1.05 GiB) |
| Data Foundry benchmark | 1,781,301,248 bytes (1.66 GiB) |

These values are disproportionate to two forecast-eligible incidents and confirm
the mandate's memory concern. The Data Foundry peak is the primary starting risk.

## Other measured performance

- Event normalization: 15,194 events/s; durable fsync journal: 162 events/s.
- Operational Twin projection: 966 events/s; full replay: 898 events/s.
- Reconciliation planning: 0.603 ms average; 100-need incident: 14.103 ms average.
- Data Foundry lineage traversal p95: 0.0062 ms; gap evaluation p95: 0.0254 ms.
- Forecast example generation p95: 13.567 s in Data Foundry and 6.418 s in the
  corpus benchmark.
- Data Foundry single-increment cost: 0.201 ms for 18 affected products versus
  245.972 ms for a full rebuild.

## Baseline verdict

The deterministic reasoning foundation is healthy and shadow-capable. The
backend is not production-shaped at baseline because intelligence persistence is
not transactionally certified, object-set projections are not indexed, memory is
too high for the retained scope, critical reasoning lacks deep generative
invariants, and empirical outcome/knowledge-time learning is incomplete.
