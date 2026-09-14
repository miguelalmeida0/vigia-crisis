# WHAT CAN VIGIA NOW TELL A HUMAN THAT IT COULD NOT BEFORE?

Vigia can distinguish recently observed incident records from old stored records, explain why verification work was suspended, identify the latest nearby thermal observation, match an IPMA warning to the incident's district, and name nearby roads, settlements and support points. Observation time, transport time, verification and operational availability remain separate.

## Observed operational result

Authenticated local API snapshot, 14 September 2026, 11:01 UTC:

| Category | Records |
| --- | ---: |
| Current | 14 |
| Monitoring | 43 |
| Stale | 204 |
| Historical | 65 |
| Reopened | 0 |
| Supported resolved | 0 |
| Stored total | 326 |
| Operational queue | 57 |
| Verified current | 0 |

These are repository-backed operational attention counts, **not a census of confirmed Portuguese emergencies**. The 14 current records remain detection candidates under the independent verification contract. Unknown or stale records are never declared extinguished. Four records crossed the historical policy boundary on the snapshot's UTC date.

1,076 retained verification jobs are suspended because their incident is outside the operational queue. The recovery projection retains 1,304 planned jobs, of which 228 remain relevant; previous attempts and relevance transitions survive suspension. The repository also retains 588 completed job outcomes. These are distinct summary scopes, not additive completion percentages.

The startup ingested 378 previously retained, attributable fire observations through the native evidence boundary. Compatibility refreshes are still SYSTEM records and never become physical witnesses. Archived NASA observations retain their source sensing time; PTData reports enter as REPORT evidence, not official authority. Duplicate measurements and ambiguous multiple-incident ownership are excluded from new ingestion. Event Fabric ingestion happens now; historical knowledge is not backdated.

## Concrete live answers

For **Póvoa De Lanhoso · Esperança E Brunhais**, the authenticated API returned:

- Latest MODIS Aqua detection: 1.1 km from the incident point, observed roughly five hours earlier. It was not presented as a fresh fire perimeter.
- IPMA heat warning for Braga, valid until 14 September, 18:00 UTC.
- Temperature 25.5 °C, wind 4.7 km/h SW, humidity 50%, rain 0 mm, measured at Cabeceiras de Basto, 16.6 km away and 48 minutes old at the check.
- EN 205, 1.4 km to the mapped road feature centre; no road-safety claim.
- Posto da GNR, 4.4 km from the incident point; mapping does not establish availability.
- Esperança, 0.7 km away, followed by other named nearby settlements.

Ask now supports 13 typed intent groups covering current/historical/reopened records, new thermal activity, latest detection and distance, 30-minute/one-hour/three-hour counts, trend, since-review comparison, applicable warnings, weather, geography, material changes, source impact, queue inclusion and suspended work. It respects incident authorization and historical knowledge time. Without a recorded operator review, it says a since-review comparison is unavailable. Historical task queries do not substitute today's task state.

## Materiality, degradation and design

The deterministic five-update weather scenario retains five audit events and emits one consolidated, informational attention item. Small changes do not create danger alerts. Existing material weather rules remain supported, and thresholds can be configured explicitly. Native fire observations, incident currentness transitions, applicable notices, road restrictions and relevant source failures retain operational meaning.

Currentness is present in every compact route response. The bounded command inventory places queue records before history, and regional maps exclude historical records from current attention. Incidents defaults to current, monitoring and actionable review, with history behind the existing filter. Existing metric strips, lists, drawers and activity surfaces carry the data. No CSS redesign, new navigation, top-level section or map renderer was introduced.

FIRMS failure leaves weather, warnings and mapped context independently usable. Retained thermal observations expire from the primary answer after 72 hours; unavailable coverage does not become zero detection counts or a zero trend. Source registry baselines without a health event are not reported as outages and do not falsely block a task. Source-dependent tasks retain blocking reasons and previous attempts.

## Sources and remaining data gaps

The [coverage matrix](SOURCE_COVERAGE.md) records each field, source, clock, scope and blocker.

- FIRMS native VIIRS/MODIS and IPMA station/warning data are connected. Sensor/product quality retains its published meaning; transport duplication cannot create additional independent evidence.
- The official IP traffic feed returned 210 published occurrences during the 10:50 UTC check; 189 met its provider-active/effective-time filter. Coverage remains partial, and absence of an occurrence is not proof of an open road.
- The checksum-verified mapped reference inventory contains 151,277 features. Nearest returned features include settlements, roads, hospitals, fire stations, police and water points. Non-point feature-centre distances are labelled explicitly. Actual admitted polygons can support inside-area relationships; thermal pixels cannot substitute for those polygons.
- Sentinel-3 integration exists and credentials are configured, but the retained CDSE attempt returned HTTP 401. Valid authentication is still required before new SLSTR observations can be used.
- APA exposes structured QualAr metadata, but the current-data query timed out. No unverified AQ measurement, averaging period or category was invented.
- No verified current observed-gust source was found in the inspected IPMA schema. Forecast gust and daily maximum gust are not substituted.
- ICNF publishes historical annual burned-area geometry; no verified live official perimeter channel was established. Current incident geometry remains unavailable where no admitted polygon exists.
- The existing compatibility reconciliation reports 226 immutable revision conflicts. They remain quarantined; this sprint does not relax identity or verification contracts to turn readiness green.

## Verification and performance

119 targeted domain/API tests pass, covering currentness, reopening, relevance history, source failure, warning geography/expiry, native observation admission, authorization, no-future knowledge, clock semantics and existing API contracts. Nineteen frontend hierarchy/physical-metric tests pass. The console production build, static contracts, syntax, asset integrity and operational-hardening checks pass. `git diff --check` passes.

The live backend check exercised all six route APIs and 19 deterministic Ask queries successfully, followed by a historical-record query that returned four suspended tasks for Vila Nova De Gaia · Lever. The latest route requests ranged from 1416 ms to 10.55 seconds; Ask queries ranged from 15 ms to 1037 ms. Cold portfolio reads reached 15.1 seconds across the restart checks. The latest command response was about 2.36 MB after decompression, dominated by the existing portfolio physical-data projection. These measurements do not establish a no-regression or sub-seven-second certification: cold inventory/command latency remains a practical limitation. Connection reuse, compression, indexed reads and cooperative projection code were preserved.

A separate broad public `/api/v1/world` probe returned the existing `public_projection_capacity_exceeded` guard. The six authenticated operator route APIs succeeded, and their internal physical-source access remained usable. The public endpoint failure remains a documented limitation rather than a passing check.

Browser approval review denied access to the local preview. Rendered interaction, responsive appearance and actual screen-delay measurements remain **UNVERIFIED**. Browser access was not a completion requirement to override in this sprint; no pixel certification is claimed.

## Run commands

```sh
node --test packages/domain/test/intelligence/operational-reality.test.mjs apps/api/test/operational-reality.test.mjs apps/api/test/operational-recovery-service.test.mjs apps/api/test/canonical-operator-api.test.mjs apps/api/test/situation-intelligence.test.mjs packages/domain/test/intelligence/physical-world.test.mjs packages/domain/test/intelligence/event-fabric-and-twin.test.mjs apps/api/test/source-failure.test.mjs apps/api/test/live-physical-intelligence.test.mjs apps/api/test/physical-metrics.test.mjs
node --test apps/operator-console/tests/hierarchy.mjs apps/operator-console/tests/physical-metrics.mjs
npm --prefix apps/operator-console run verify:static
git diff --check
node .tmp/reality/check-api.mjs
```

Backend check artifacts are under `.tmp/reality/`: `live-api.json`, `final-domain-api.log`, `frontend-targeted.log`, `static.log` and `road-audit.log`. The live script uses local protected credentials internally and does not print them. No commit, push or deployment was performed. Pre-existing `.gitignore` changes and the deletion of `CLAUDE_HANDOFF.md` were preserved.

## Exact changed files

Implementation, tests, permanent instructions and handoff files:

- `AGENTS.override.md`
- `apps/api/src/application/create-services.mjs`
- `apps/api/src/modules/intelligence/governed-reference-inventory.mjs`
- `apps/api/src/modules/intelligence/operational-intelligence-service.mjs`
- `apps/api/src/modules/intelligence/reality-questions.mjs`
- `apps/api/src/modules/intelligence/retained-fire-observations.mjs`
- `apps/api/src/modules/intelligence/situation-ask.mjs`
- `apps/api/src/modules/intelligence/situation-projection.mjs`
- `apps/api/src/modules/intelligence/situation-service.mjs`
- `apps/api/src/modules/operator/canonical-operator-view-projection.mjs`
- `apps/api/src/modules/operator/canonical-operator-work-projection.mjs`
- `apps/api/src/modules/operator/incident-briefing-projection.mjs`
- `apps/api/src/modules/operator/operational-recovery-service.mjs`
- `apps/api/src/modules/operator/operator-intelligence-projection.mjs`
- `apps/api/src/modules/world/firms-normalizer.mjs`
- `apps/api/test/canonical-operator-api.test.mjs`
- `apps/api/test/operational-reality.test.mjs`
- `apps/api/test/operational-recovery-service.test.mjs`
- `apps/operator-console/src/appActionController.js`
- `apps/operator-console/src/approved/controller.js`
- `apps/operator-console/src/approved/data/field.js`
- `apps/operator-console/src/approved/data/hierarchy.js`
- `apps/operator-console/src/approved/data/model.js`
- `apps/operator-console/src/approved/data/physical.js`
- `apps/operator-console/src/approved/routes/overview.js`
- `apps/operator-console/src/approved/ui/field.js`
- `apps/operator-console/src/approved/ui/signals.js`
- `apps/operator-console/src/approved/ui/situation-intelligence.js`
- `apps/operator-console/src/routeState.js`
- `apps/operator-console/src/storage.js`
- `apps/operator-console/tests/hierarchy.mjs`
- `apps/operator-console/tests/phase-b-fixture.mjs`
- `apps/operator-console/tests/physical-metrics.mjs`
- `docs/handoffs/operational-reality/FINAL_REPORT.md`
- `docs/handoffs/operational-reality/INTEGRATION.md`
- `docs/handoffs/operational-reality/SOURCE_COVERAGE.md`
- `packages/domain/src/event-fabric/adapters/firms-adapter.mjs`
- `packages/domain/src/intelligence/situation-model.mjs`
- `packages/domain/src/operational-twin/decision-work.mjs`
- `packages/domain/src/operational-twin/evidence-projection.mjs`
- `packages/domain/src/operational-twin/geographic-context.mjs`
- `packages/domain/src/operational-twin/incident-currentness.mjs`
- `packages/domain/src/operational-twin/material-changes.mjs`
- `packages/domain/src/operational-twin/operational-materiality.mjs`
- `packages/domain/src/operational-twin/operator-questions.mjs`
- `packages/domain/src/operational-twin/physical-conditions.mjs`
- `packages/domain/src/operational-twin/physical-world.mjs`
- `packages/domain/src/operational-twin/project-operational-twin.mjs`
- `packages/domain/src/operational-twin/real-world-value.mjs`
- `packages/domain/src/operational-twin/task-relevance.mjs`
- `packages/domain/src/operational-twin/warning-applicability.mjs`
- `packages/domain/test/intelligence/operational-reality.test.mjs`
- `scripts/release/build_release_manifest.mjs`

Generated local release manifests refreshed by the existing build pipeline:

- `data/validation/release/checkpoint-commands.sh`
- `data/validation/release/checkpoint-handoff.json`
- `data/validation/release/current-release-manifest.json`
- `data/validation/release/dirty-tree-classification.json`
- `data/validation/release/evidence-manifest.json`
- `data/validation/release/ignored-runtime-manifest.json`
- `data/validation/release/release-source-manifest.json`
- `data/validation/release/release-statement.json`
- `data/validation/release/unknown-path-report.json`

Final backend release checked: `vigia-intelligence-fabric-947d420b3aae82bc`. All 26 authenticated checks returned HTTP 200. The latest API and compiled console were started locally; rendered review remains unverified.
