# Technical debt that matters

This list excludes cosmetic refactoring, style preferences, and abstractions that do not change safety, evidence quality, operability, or buyer value.

## 1. The delivered product has no Git identity

**Risk:** Critical release-control failure.

Both engineering programs exist only as one dirty tree over `c6e28bd`. There is no Agent 1 checkpoint, Reality Cutover commit, tag, build attestation, or rollback target. The successful tests cannot be tied to a deployable revision.

**Consequence:** No reproducible release, trustworthy rollback, code provenance, or clean agent comparison.

**Required action:** Commit the reviewed engineering state only after this read-only audit is dispositioned; require protected CI, signed release tag, dependency lock verification, generated SBOM, and build provenance for every future release.

## 2. Local JSON/filesystem is carrying operational-domain responsibility

**Risk:** Data loss, split brain, corruption, and non-scalability.

Operator state, event observations/mappings/corrections/projections, acquisition metadata, raw products, alerts, audit, and geo proofs use local files. In-process promise chains serialize writers, but there is no multi-process lock, transaction across raw/metadata/event, scheduler lease, object lock, backup policy, restore proof, or HA replication.

**Evidence:** `apps/api/src/modules/acquisition/acquisition-store.mjs:21`; `apps/api/src/modules/events/event-observation-repository.mjs:114`; `docs/reality/KNOWN_LIMITATIONS.md:12`.

**Required action:** Postgres/PostGIS for metadata/event/workflow, object-locked storage for raw products/proofs, transactional outbox/job model, leases/idempotency, backups and restore drills.

## 3. End-to-end provenance breaks at the most important observation

**Risk:** Incident investigation cannot reproduce why an event was displayed.

ptdata normalizers attach `rawSourceProductId`, and source/context records retain it. `buildEventObservations` reconstructs public-report provenance with only `synthetic` and `origin`, dropping the raw product ID (`packages/domain/src/fire-event-tracker.mjs:21`). The selected Sintra report therefore cannot be linked directly to its exact archived payload.

The HTTP acquirer also parses before committing raw bytes (`apps/api/src/modules/acquisition/http-acquirer.mjs:10`), so invalid/malformed provider responses are unavailable for forensic review.

**Required action:** Preserve raw product ID/checksum, provider item ID, parser/normalizer version, source/receive time, quality flags, and derivation across canonical observations and event projections. Quarantine all received bytes, including rejected payloads, with secure retention.

## 4. Event association is deterministic but under-modelled

**Risk:** Nearby fires can be silently merged or split incorrectly.

Association uses fixed spatial/temporal/confidence weights and best pair (`packages/domain/src/event-association.mjs:51`). Event building greedily chooses the first sorted candidate (`packages/domain/src/fire-event-tracker.mjs:105`). It ignores footprint, uncertainty, trajectory, event geometry, and competing hypotheses. It can reject weak fits but does not represent genuine ambiguity among multiple plausible events.

**Required action:** Event-sourced hypothesis model in PostGIS; explicit competing candidates/ambiguity; footprint/uncertainty/movement; correction commands; governed benchmark.

## 5. Durable identity is coupled to a 72-hour observation retention window

**Risk:** Long incidents, retrospective evidence, and corrections can lose their identity basis.

The repository drops observation-event and manual-event mappings for observations outside retention (`apps/api/src/modules/events/event-observation-repository.mjs:103`). Event records remain, but the association/correction basis can disappear as observations age out.

**Required action:** Retain immutable observation/event links and correction history independently of the hot operational observation window; materialize current projections separately.

## 6. There is no authenticated operational principal

**Risk:** The product is safely unusable rather than safely operational.

Public mutation correctly returns 401 and fake actor headers do not authorize. Readiness hard-codes `authenticated_operator_boundary=false` (`apps/api/src/modules/mission/operational-readiness-service.mjs:16`). There is no OIDC/JWKS/session, principal provisioning, tenant/territory boundary, service identity, or access review.

**Required action:** Build identity only for the narrow evidence-acquisition product: OIDC operators, service/device principals, tenant/territory authorization, immutable actor audit, least privilege, and credential rotation.

## 7. Hidden product breadth remains live production complexity

**Risk:** Unnecessary attack surface, regressions, cognitive load, and false strategic confidence.

Production constructs and registers prevention, detection, response, exposure, consequence, remediation, command, outcome, mission, sensor task, and alert planes even though only Live/Fire are earned. `createServices()` imports more than 50 modules and returns the entire graph; `registerRoutes()` registers all route families.

**Required action:** A production composition containing only acquisition, events, evidence needs, readiness, sources, and the served Live/Fire read surface. Everything else moves to bounded experimental entrypoints or is deleted.

## 8. Acquisition is a poll loop, not a resilient fabric

**Risk:** Provider outages and partial commits are not operationally controlled.

The runtime uses process-local `setInterval` and logs errors (`apps/api/src/application/create-runtime.mjs:38`). Checkpoints have `nextAttemptAt`, but normal failures do not calculate backoff. There is no lease, jitter policy, circuit breaker history, dead-letter/reprocess queue, or accepted/rejected metrics. A raw file can be written before metadata persistence fails, leaving an orphan; a malformed body is not retained.

**Required action:** Durable scheduled jobs with leases, retry/backoff/jitter, product quarantine, reconciliation of raw objects versus metadata, source-specific SLOs, and reprocessing by immutable product ID.

## 9. “Fusion” depends on self-declared strings

**Risk:** Correlated sources can be counted as independent or negative evidence can be misclassified.

Dependency groups come from `independenceGroup`/`sourceFamily` strings, and evidence polarity is partly inferred by regex over classification text (`packages/domain/src/evidence-fusion.mjs:3`, `packages/domain/src/evidence-fusion.mjs:10`). This is a useful guard, not a governed dependence model.

**Required action:** Provider/instrument/processing lineage graph with versioned dependence policy; typed observation classifications; explicit coverage and detection-limit objects; calibration scoped to policy and geography.

## 10. Observation opportunity is static configuration, not future sensing intelligence

**Risk:** The product cannot tell an operator when useful physical evidence will arrive.

The default opportunity file is empty. The service reads externally supplied confirmed records and ranks them alongside a manual fallback. It does not calculate VIIRS/SLSTR/Sentinel-2 overpasses, MTG cadence/footprint, cloud usability, tasking availability, or reliability.

**Required action:** Provider-specific schedule/coverage integration only after the first physical source is live. Do not generalize; start with the real source used by the product.

## 11. Alert delivery is fire-and-forget

**Risk:** High-severity alerts can disappear silently.

The alert service writes local JSON and optionally performs a one-shot webhook. Delivery errors are swallowed; there is no durable delivery state, retry, receipt, escalation, or dead letter (`apps/api/src/modules/alerts/alert-service.mjs:9`).

**Required action:** Keep alerts out of production until there is a transactional outbox, delivery state, retries, receipts, authenticated destinations, and an operator acknowledgement policy.

## 12. Source health is state, not operational history

**Risk:** Operators cannot distinguish a currently healthy source from a source that is intermittently failing or stale by policy.

The acquisition API exposes current checkpoint fields, while the drawer shows only a simplified state/timestamp/error. No availability history, delay distribution, reject rate, recovery time, last N failures, or next attempt is retained/presented as an SLO.

**Required action:** Time-series source metrics and product-quality counters; role-specific status (`report`, `catalogue`, `raster context`, `point evidence`); UI visibility of blindness and next recovery/action.

## 13. UI truth contracts are not schema-tested

**Risk:** Unknown physical values can become exact measurements.

The Sintra API returned null temperature, humidity, and wind. `live.js` converts the values with `Number(...)`, so null passed the finite check and rendered as zero (`apps/web/src/v2/views/live.js:18`). The generic number formatter has the same issue (`apps/web/src/v2/utils/format.js:17`).

**Required action:** Typed presentation schema with `missing`, `zero`, `stale`, `not_applicable`, and `value`; contract tests from API fixture to visible text; truth-critical assertions in browser QA.

## 14. Browser QA tests state classes, not operator comprehension

**Risk:** A green browser gate can coexist with misleading or unusable content.

The mobile gate checks visible product labels, app state classes, horizontal document overflow, and console errors (`scripts/production_browser_qa.py:69`). It does not assert that queue/detail content is readable, null values remain unavailable, drawers close within the viewport, evidence timestamps are unambiguous, or primary tasks can be completed.

**Required action:** Truth assertions for nulls/roles/labels; screenshot-based visual review in a controlled viewport; task-level accessibility and comprehension tests with representative data states.

## 15. API misses can masquerade as successful HTML

**Risk:** Broken clients and monitoring can record 200 success for a nonexistent API endpoint.

The static server returns `index.html` for any extensionless GET after router miss, including `/api/...` (`apps/api/src/http/static-files.mjs:43`). The audit confirmed `/api/v2/prevention` returned HTML 200.

**Required action:** Return structured 404 for all `/api/` misses before SPA fallback; add contract tests and content-type assertions.

## 16. Validation is an external dependency with no owner

**Risk:** The architecture can expand indefinitely without learning whether it detects or associates fires correctly.

Real corpus, labels, adjudication, Portuguese performance, prospective shadow run, and safety-case acceptance are all absent. This is not code debt; it is the central product debt.

**Required action:** Assign budget and ownership to corpus governance and pilot evaluation now. No algorithmic release proceeds without held-out real evidence and named approval scope.

## Priority order

1. Name and freeze a clean release target.
2. Fix the truth defects: null-to-zero and end-to-end raw provenance.
3. Complete real point-thermal acquisition.
4. Build the governed corpus and identity benchmark.
5. Replace local persistence/scheduling for the narrow core.
6. Add authenticated evidence work.
7. Delete dormant production breadth.
8. Only then expand UI, alerting, prevention, or outcomes.
