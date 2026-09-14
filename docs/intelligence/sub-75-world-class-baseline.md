# Sub-7.5 World-Class Backend Baseline

Measured on 2026-08-25 before the sub-7.5 corrective work began. The
authoritative workspace is `/Users/malmeida/Documents/Development/vigia-intelligence`
on branch `feat/vigia-intelligence-foundation` at
`124ac703d2ffcb2569db64b8db1955ce2a2363a4`. A repository-root create/delete
probe passed. `git diff --check` passed and no frontend source diff existed.
The sibling `vigia` checkout was not modified.

## Scoring doctrine

Scores use a fixed 0–10 evidence ladder: 0 means absent; 2 means a contract or
interface only; 4 means a deterministic local implementation; 6 means a tested
implementation over retained or representative data; 7 means all engineering
prerequisites are ready but a critical environmental or external gate remains;
7.5 requires every critical engineering and real-evidence gate for the category;
8.5 requires independent cross-environment reproduction. The final defensible
score is the minimum of engineering readiness, real-world evidence, and any
explicit critical-gate cap. Synthetic fixtures can raise engineering readiness
but never real-world evidence.

## Exact reproduced state

| Measure | Baseline |
| --- | --- |
| Aggregate Intelligence suite | 106/106 pass |
| Event Fabric/Twin | 7/7 pass |
| Control Plane | 16/16 pass |
| Proof Plane | 14/14 pass |
| Reality Network | 12/12 pass |
| Forecasting | 19/19 pass |
| Forecast corpus | 11/11 pass |
| Data Foundry | 18/18 pass |
| Decision Foundry | 20/20 pass |
| Backend convergence | 25 pass, 0 fail, 1 environment-injected skip |
| Full repository suite | 715 total; 706 pass; 8 fail; 1 skip; 45.378 s |
| Database | PostgreSQL 17 / PostGIS 3.5; migration head 017; certification PASS |
| Corpus verdict | `CORPUS_NOT_READY` |
| Backend verdict | `BACKEND_PRODUCTION_SHAPED` / convergence report PASS |
| Compact object-set query | p50 0.020 ms; p95 0.026 ms |
| PostGIS object-set query | p50 0.307 ms; p95 0.592 ms |
| Compact convergence RSS | 209.7 MiB baseline; 257.7 MiB peak; 255.7 MiB steady |
| Historical Data Foundry RSS | 1,781,301,248 bytes peak (1.66 GiB) |
| Forecast corpus RSS | 1,497,415,680 bytes peak (1.39 GiB) |
| Prospective archive | 2 immutable snapshots; 2 providers; 3,424,537 raw bytes |
| Decision Memory | 1 shadow record; 0 realized outcomes; 0 calibration examples |
| Doctrine | version 2.0.0; 18 decisions; 2 retained scenario states |
| Frontend source diff | none |

The eight reproduced failures are seven `measurement-debt-api.test.mjs` cases
whose required governed prevention-validation artifact chain is absent, plus one
`release-contract-governance.test.mjs` case caused by a frontend-owned literal
`vigia-postgis-014`. The latter cannot be changed on this branch. Missing evidence
will not be replaced with fabricated artifacts.

## Category baseline and 7.5 exit gates

| Category | Engineering readiness | Real-world evidence | Final defensible score | Current evidence | Weakest critical gate | Required 7.5 gate |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Scientific corpus maturity | 6.0 | 3.5 | **3.5** | 37 discovered incidents, 2 eligible, 11 examples, 1 region, 2 seasons, 0 negatives, 0 hard negatives; calibration split empty; 1h/3h empty | Valid negative and short-horizon corpus absent | 2 regions, 2 seasons, 100 eligible incidents, 100 negatives, 25 hard negatives, nonempty development/calibration/held-out splits, 1h or 3h examples, 3 scoreable horizons, lineage and leakage PASS |
| Predictive validity and calibration | 5.5 | 2.0 | **2.0** | Deterministic research contours and abstention exist; promotion gate fails closed | No calibration corpus or predictive outcomes | Fixed five-stage ladder, preregistered metrics/gates/splits, non-null calibration and tail-risk metrics on eligible held-out data |
| Realized decision learning | 7.0 | 0.0 | **0.0** | Outcome and Information Value schemas persist and replay; 0 outcomes | No attributable later outcomes | Nonempty governed outcomes with unlock precision/recall, latency/cost error, source success, hypothesis and decision agreement; no automatic doctrine mutation |
| Prospective operational history | 7.0 | 1.0 | **1.0** | Four capture modes implemented; 2 immutable snapshots from 2 providers | 7-day/25-incident/1,000-snapshot campaign absent | Bounded 7-day campaign, 25 incidents, 3 source classes, 1,000 immutable snapshots, restart, restore, rights, outcomes and replay |
| Multi-region resilience | 3.0 | 0.0 | **0.0** | Single-node disposable PostGIS recovery only | No HA topology or failover evidence | Primary, synchronous standby, async regional replica, fencing, routing, 100 cycles, zone RTO <60 s/RPO 0, region RTO <5 m, explicit region RPO, zero split-brain/duplicate actions |
| Security compartmentation and independent assurance | 6.0 | 1.5 | **1.5** | Capability proofs, revocation, incident scope and adversarial tests pass | No Postgres RLS/organization-region-classification ABAC or independent assurance | End-to-end ABAC/RLS/markings, least privilege, key abstraction/rotation, SBOM/signing/scanning, audit anchoring, cross-tenant proofs, 0 unresolved applicable HIGH/MEDIUM findings, independent execution |
| Integrated release cleanliness | 6.0 | 5.0 | **5.0** | Build/check pass and convergence report PASS; full suite has 8 failures | Full repository suite is red; migration 018 ownership unresolved | One migration DAG/head, backend-owned failures resolved, cross-branch compatibility tests, signed manifest/SBOM, canary/rollback and zero stale certification |
| Operational doctrine coverage | 6.5 | 2.0 | **2.0** | 18 definitions exercised over 2 retained states | 100-scenario corpus absent | 100 versioned states with positive/negative high-consequence cases, authority/degradation/revocation coverage, zero P0 gaps/cycles/authority-free paths |
| Data Foundry memory and sustained workload efficiency | 5.0 | 4.5 | **4.5** | Incremental update 0.201 ms, but historical peak is 1.66 GiB and example p95 13.567 s | Peak RSS and example construction miss targets | Peak <512 MiB, 4× faster example construction, ordinary incremental <100 ms, stage CPU/RSS, sustained stability, backpressure and interactive SLO preservation |
| Human operator validation readiness | 3.0 | 0.0 | **0.0** | Product behavior tests exist; no governed practitioner study package or sessions | No real practitioner evidence | Complete consent/de-identification/task/grader/trace/export harness plus 10 sessions, 5 practitioners, 3 perspectives and all stated performance/safety targets |
| Real agency integration readiness | 4.5 | 2.0 | **2.0** | Real public-source adapters exist, but no selected authenticated institutional integration meets the complete contract | No agency-authorized endpoint/credential and end-to-end cancellation/outage proof | One real CAP/CAD/resource feed with authentication, schema, provenance, ingest, Twin, update/cancel, retry, recovery, audit, replay and operator-visible effect |
| Independent clean-room certification | 3.0 | 0.0 | **0.0** | Individual deterministic scripts and evidence fingerprints exist | No single clean-room bundle and no independent execution | Release identity, digests, SBOM, checksums, seeds, fixtures, histories, fingerprints, threat model and rubric in one command, reproduced by a separate reviewer |

## Corpus gate detail

`CORPUS_NOT_READY` is reproduced with 37 discovered incidents, 2 eligible
incidents, 11 examples, 0 valid negatives, 0 hard negatives, 1 region and 2
seasons. Horizon counts are 1h=0, 3h=0, 6h=1, 12h=3 and 24h=7. Split counts
are development=1, calibration=0 and held-out=10. Nine gates fail: two regions,
100 incidents, 100 negatives, promotion negatives, 25 hard negatives,
progression completeness, calibration split, 1h and 3h.

## Release and ownership boundary

The current branch owns backend migration 017. Agent 1's future migration 018
must be reconciled through an explicit compatibility dossier and test; it is not
assumed, copied from, or modified in the sibling checkout. Frontend source remains
outside this workstream. A frontend-owned release-contract mismatch therefore
remains an integration gate rather than a backend change on this branch.
