# VIGIA Operational Truth and Action Recovery

## 1. Release identity

- Release: `vigia-intelligence-fabric-5e6cdfff54eac5a5`
- Code-state hash: `sha256:d02467c52e3c92aaf67f9b5c888184832e842ab4824d706b2cbed36dcea6d57f`
- Operational-data hash: `sha256:09514b1ba2f2fff31a241e99ebbf6a00cdb4f0732f35283aec80c3228c9da344`
- Statement hash: `sha256:712a157421697b36e9b54d765de515364f643a42b822f95e5e88ede67920f6fa`
- Runtime profile: `local_shadow`
- Dirty/staged/committed state: the pre-existing dirty worktree was preserved. Final certification recorded 173 dirty paths, zero staged paths, and no commit. No runtime-data reset was performed.

Evidence: [`release-identity.json`](../../../.artifacts/operational-truth-recovery/final/release-identity.json), [`certification-index.json`](../../../.artifacts/operational-truth-recovery/final/certification-index.json).

## 2. Executive result

- Previous overall operator-value score: not governed in the supplied baseline; no scalar is invented.
- Final evidence-based score: 11/11 P0 gate groups, 16/16 API invariants, 7/7 exact-release desktop routes, and 63/63 responsive route/viewport cases passed.
- P0 gates passed: 11.
- P0 gates blocked: 0.
- Exact external blockers: none. Current external-source and authority limitations remain visible and are listed in section 12; they do not prevent the implemented resolver, classification, replay, or abstention paths from operating truthfully.

Evidence: [`scorecard-before-after.json`](../../../.artifacts/operational-truth-recovery/final/scorecard-before-after.json).

## 3. Operational scope

| Class | Before | After | Rule |
|---|---:|---:|---|
| Verified current | 173 records were labelled active without this governed class | 0 | Only records satisfying the complete current-evidence contract count as active. |
| Detection candidates | Not separated | 41 | Physical detections remain actionable candidates, never confirmed incidents. |
| Needs revalidation | 128 stale records were still inside the active label | 148 | Stale or incomplete canonical records require named source resolution before promotion. |
| Historical/closed | Not governed in the supplied UI | 0 | Closure requires canonical historical/closed evidence; none is inferred. |
| Total canonical | 173 | 189 | Counts are read from the current canonical twin and reconcile across Command, Incidents, Reports, and Global Awareness. |

The live feed increased the canonical total during certification; the final invariant run at `2026-09-03T15:45:48Z` is authoritative for the after column. Only `VERIFIED_CURRENT` contributes to active incident count.

## 4. Contradictions eliminated

1. The former `173 active / 128 stale` contradiction is removed by the four-class contract. Active is now 0 because no record currently satisfies `VERIFIED_CURRENT`.
2. `Needs Attention = 0` alongside unresolved decisions/manual escalation is removed. The current human-decision workload is 189 and 752 resolver jobs are escalated.
3. The former 692 evidence requirements labelled System Actions are removed from response work. Evidence requirements now create Source Resolution jobs; response-action count from evidence requirements is 0.
4. Green platform health no longer masks data or SLO failure. Platform, map transport, source availability, freshness, verification, scientific admission, and workload are separate states.
5. Incident and geography selection are atomic. A→B→C selection keeps URL, selected row, incident contract, camera, highlighted feature, and route context on the same final incident with zero map remounts/style reloads.
6. Source availability, incident coverage, freshness, verification, and scientific admission are distinct contract dimensions and distinct operator chips.
7. Operations no longer presents evidence needs as operational response. Source Resolution, Response Operations, and Protect / Recover are separate governed lanes.
8. Passive external waiting is replaced by named provider/source class, owner, last attempt, next check, retry policy, deadline, escalation, unlock condition, and completion criteria.
9. A persisted isolated certified action→acknowledgement→expected→observed→outcome chain now exists without entering production truth.
10. Situation Quality now exposes governed dimensions and incident drill-downs; an empty verified-current denominator remains explicitly null rather than green.
11. Global Awareness uses semantic clustered WebGL markers and a one-click Quicklook. Missing operational-subset geolocation is not hidden by a whole-universe percentage.
12. Internal enums, hashes, and pipeline codes are translated out of primary workflows and retained only in technical/provenance disclosure.
13. The supplied 5.78 s map, 3,370 ms API p95, and 72 tile-failure baseline is replaced by measured SLO state and honest degradation.

Attached invariant proof: [`invariant-report.json`](../../../.artifacts/operational-truth-recovery/final/invariant-report.json). Contradiction count: **0**.

## 5. Source-resolution engine

- Jobs created: 756 persisted jobs.
- Jobs with identified source: 756/756 (100%).
- Jobs attempted: 756/756 (100%).
- Jobs resolved: 0; no source success is fabricated.
- Jobs escalated: 752.
- Oldest job: `2026-09-03T09:31:16.121Z`.
- Median next-check delay: 60 minutes.
- Providers activated: CAP Authority, NASA FIRMS, FieldNet, and Agent1 operational projection. All four were truthfully `STALE` at the final certification instant.
- Retry/circuit-breaker proof: 752 circuit-open jobs; ten concurrent projection reads caused a maximum attempt delta of 0, proving reads do not multiply attempts. Every active job has provider/source class, owner, last attempt, next attempt, retry policy, deadline/escalation rule, decision impact, unlock condition, and completion criteria.

Evidence: [`runtime-scheduler-proof.json`](../../../.artifacts/operational-truth-recovery/final/source-resolution/runtime-scheduler-proof.json).

## 6. Route value

### Command Overview

Command metrics now use governed lifecycle classes: verified current, material changes, resolver workload, and canonical attention. The health strip distinguishes platform availability from source, freshness, verification, map, and workload state. Screenshot: [`01-command-overview-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/01-command-overview-1672x941.png).

### Incidents

Rows expose classification, ranking rationale, freshness, source strength, and next action. Search keeps the same connected DOM node, focus, value, and caret (`CascXais`, caret 5). A→B→C selection resolves atomically to the final Grândola selection with the same document, application mount, and MapLibre instance. Screenshot: [`02-incidents-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/02-incidents-1672x941.png). Proof: [`search-caret-proof.json`](../../../.artifacts/operational-truth-recovery/final/search-caret-proof.json), [`atomic-incident-map-sync.json`](../../../.artifacts/operational-truth-recovery/final/atomic-incident-map-sync.json).

### Incident Detail

The shared Incident Context Switcher preserves incident continuity. The route presents freshness, source coverage/strength, known risk, unresolved fields, owner, next check, unlock condition, and next decision without treating a stale OPEN record as current. Screenshot: [`03-incident-detail-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/03-incident-detail-1672x941.png).

### Intelligence

The route follows Now → Next → Watch → Uncertainty → Decision. Thermal and incident-associated weather remain visible when forecast geometry is scientifically withheld. `View on map` changes the actual map filter, focuses/highlights the relevant observation, exposes Clear focus, and does not remount or reload the map. Screenshot: [`04-intelligence-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/04-intelligence-1672x941.png). Interaction: [`intelligence-thermal-weather-and-focus.png`](../../../.artifacts/operational-truth-recovery/final/screenshots/intelligence-thermal-weather-and-focus.png).

### Operations

Operations is a prioritized command queue with a selected-action inspector and shared incident switcher. Source Resolution shows full lifecycle ownership. Response Operations does not synthesize a row when no real response work exists. Protect / Recover contains the isolated certified replay and keeps external send disabled. Screenshots: [`operations-source-resolution.png`](../../../.artifacts/operational-truth-recovery/final/screenshots/operations-source-resolution.png), [`operations-response-operations.png`](../../../.artifacts/operational-truth-recovery/final/screenshots/operations-response-operations.png), [`operations-protect-recover.png`](../../../.artifacts/operational-truth-recovery/final/screenshots/operations-protect-recover.png).

### Reports & Analytics

Decision Summary, Outcome Analysis, System Performance, and Situation Quality are controlled tabs with distinct panels and route-local hash query state. Arrow-key tab navigation changes both selected panel and URL without document/application remount. Outcome stages are distinct canonical records, performance uses SLOs, and quality dimensions drill into governed incident lists. Screenshot: [`06-reports-analytics-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/06-reports-analytics-1672x941.png). Proof: [`reports-tabs-proof.json`](../../../.artifacts/operational-truth-recovery/final/reports-tabs-proof.json).

### Global Awareness

The shared data-backed filters change the visible total, mapped count, URL, and in-place GeoJSON source without remount/style reload, then return focus to the shared dropdown. Markers encode classification semantics and one click opens the shared Incident Quicklook; a second deliberate action opens the workspace. Screenshot: [`07-global-awareness-1672x941.png`](../../../.artifacts/operational-truth-recovery/final/route-screenshots/07-global-awareness-1672x941.png). Proof: [`global-filter-proof.json`](../../../.artifacts/operational-truth-recovery/final/global-filter-proof.json), [`marker-quicklook-proof.json`](../../../.artifacts/operational-truth-recovery/final/marker-quicklook-proof.json).

## 7. Protection flow

- Universe: `CERTIFIED_REPLAY`.
- Incident: `PT-2024-ICNF-59380`, Archived official incident 59380.
- Exposure basis: retained official incident reference and archived thermal observations only; no live exposure inventory asserted.
- Threshold: replay route condition met because a retained physical observation links to the archived official incident. It is not a public-protection threshold.
- Recommendation: complete a controlled verification/protection-review exercise; do not issue a live public action.
- Authority: `NO_LIVE_AUTHORITY`; owner is the VIGIA controlled replay harness, which cannot authorize a live alert or field action.
- Approval: not applicable because no live action was proposed or dispatched.
- Dispatch/draft: `NOT_SENT`; external send disabled; controlled replay route only.
- Acknowledgement: `replay-ack:PT-2024-ICNF-59380` at `2024-09-17T12:46:00.000Z`, from the replay harness only.
- Update/cancel/expire: exercise completed at `2024-09-17T13:06:00.000Z`; cancel not required because nothing was sent; closed with replay.
- Safety proof: production truth false, external send false, authority boundary enforced, exercise data not mixed into production, causal protection outcome `NOT_MEASURED`.

Evidence: [`protection-workflow.json`](../../../.artifacts/operational-truth-recovery/final/protection-flow/protection-workflow.json).

## 8. Outcome chain

- Action: `replay-action:PT-2024-ICNF-59380` at `2024-09-17T12:38:00.000Z`.
- Acknowledgement: `replay-ack:PT-2024-ICNF-59380` at `2024-09-17T12:46:00.000Z`.
- Expected postcondition: `replay-expected:PT-2024-ICNF-59380`; the selected physical observation remains linked and the official first-response timestamp is observable after alert publication.
- Observed postcondition: `replay-observed:PT-2024-ICNF-59380` at `2024-09-17T13:06:00.000Z`; associated true, fragmented false, physical lead 8 minutes, 124 retained thermal observations.
- Outcome classification: `replay-outcome:PT-2024-ICNF-59380`, `WORKFLOW_CAPABILITY_CERTIFIED`.

This is a persisted `CERTIFIED_REPLAY`, not a live outcome. It certifies linkage and timing workflow behavior only. Causal protection outcome remains `NOT_MEASURED`.

Evidence: [`certified-chain.json`](../../../.artifacts/operational-truth-recovery/final/outcome-chain/certified-chain.json).

## 9. Performance

| Metric | Before | After | Target | Result |
|---|---:|---:|---:|---|
| API p95 | 3,370 ms | 193.25 ms, 35-route-request sample | <1,000 ms | PASS |
| Map stable render p95 | 5.78 s | 535 ms across the five map routes | <1.5 s warm | PASS |
| Cold map stable render | Baseline did not separate cold/warm; 5.78 s reported | 535 ms observed first-route local render | <2.5 s | PASS |
| Tile failure rate | 72 failures; denominator absent | 0/32 failed layers in final runtime (0%) | <1% | PASS |
| Blank frames | Visible gray/white flashes; count not governed | 0 ms / 0 frames | 0 | PASS |
| Map remounts | Remount/reload behavior observed; count not governed | 0 during filter, selection, and drag | 0 | PASS |

The installed engine is MapLibre GL `6.7.0`, using native drag and clustered WebGL GeoJSON markers. The five-second Chrome drag trace recorded 597 frames: p50 8.3 ms, p95 9.2 ms, max 41.4 ms, zero frames over 50 ms, zero long tasks, zero application renders, zero map mounts/destroys/style reloads/source updates during drag, and zero DOM markers. The trace batch release was `vigia-intelligence-fabric-0e9f1781aed3a252`, immediately before the final certification-test/browser-lock identity rebuild; exact-release route and interaction evidence separately confirms MapLibre 6.7.0, native drag, LIVE state, one canvas, zero blank time, zero destroys, and zero style reloads on `vigia-intelligence-fabric-5e6cdfff54eac5a5`.

Evidence: [`api-latency.json`](../../../.artifacts/operational-truth-recovery/final/performance/api-latency.json), [`map-performance-live.json`](../../../.artifacts/operational-truth-recovery/final/performance/map-performance-live.json), [`desktop-route-summary.json`](../../../.artifacts/operational-truth-recovery/final/desktop-route-summary.json).

## 10. Quality coverage

Operational subset denominator: **0 VERIFIED_CURRENT incidents**. The percentages below are deliberately null, not passing percentages. The 41 detection candidates and 148 revalidation records remain outside active truth; all 41 candidates have a governed location, but that fact is not substituted for the required verified-current denominator.

| Dimension | Before | After | Target |
|---|---:|---:|---:|
| Fresh/current | Not governed; 128 stale records were inside 173 labelled active | N/A — zero verified-current denominator | ≥80% |
| Geolocated | Not governed | N/A — zero verified-current denominator | ≥95% |
| Independent or official | Not governed | N/A — zero verified-current denominator | ≥70% |
| Source state explicit | Conflated with coverage/freshness | N/A — zero verified-current denominator | 100% |
| Priority rationale | Generic/context ranking | N/A — zero verified-current denominator | 100% |
| Resolver job linked | Passive requirements/waits | 100% for critical unresolved records | 100% |

The gate is enforced by governed exclusion: no record is promoted to `VERIFIED_CURRENT` until it can satisfy the threshold. Evidence: [`quality-coverage.json`](../../../.artifacts/operational-truth-recovery/final/quality-coverage.json).

## 11. Tests

- Domain: PASS; truth classification, canonical incident contract, projection/replay, and evidence boundaries covered by the full suite.
- API: PASS; 35 critical route samples, p95 193.25 ms; operational truth certifier 16/16 invariants.
- FieldNet isolation: PASS; FieldNet tests and retained-scope isolation passed.
- Source resolution: PASS; persistence, identity, owner, retry, deadline, escalation, concurrency, unlock, and completion contracts passed.
- Protection: PASS; isolated replay, authority boundary, disabled external send, lifecycle, and persistence passed.
- Outcomes: PASS; five distinct stages, drill-down identity, replay/production separation, and non-causal classification passed.
- Browser interactions: PASS; exact-release startup/last-good, seven desktop routes, search caret, A→B→C selection, marker Quicklook, Intelligence spatial focus, Operations switcher/lanes, Reports tabs, and Global filter effects.
- Responsive: PASS; 63/63 cases across nine mandated viewports and seven routes, with zero horizontal overflow, clipped controls, broken chips, or map failures.
- Accessibility: PASS; route/select/queue/tab/Quicklook/dialog/map keyboard contracts, focus return, non-color status meaning, and 200% zoom passed.
- Performance: PASS; API SLO, stable map timing, five-second native drag frame trace, zero blank frames/remounts/style reloads, and 32/32 live map layers.
- Cold starts: PASS; 2/2 clean process starts reached Database READY, Central API READY, FieldNet READY, and Operator READY without resetting runtime data.

Full automated result: **995 tests, 987 passed, 8 intentional skips, 0 failed**. Operator static certification also passed the production build, 67-module syntax and asset integrity, seven-route smoke, 86-button dead-action scan, real-data/proxy/admission/persistence/truth/scientific/map/browser/UX/accessibility/operational contracts. Evidence: [`cold-starts.json`](../../../.artifacts/operational-truth-recovery/final/cold-starts.json), [`responsive-matrix.json`](../../../.artifacts/operational-truth-recovery/final/responsive-matrix.json).

## 12. Remaining limitations

- No record currently meets the complete `VERIFIED_CURRENT` contract. CAP Authority, NASA FIRMS, FieldNet, and Agent1 projection were stale at final certification; 756 real resolver jobs remain active and 752 are escalated. VIGIA therefore reports zero active incidents instead of inventing confirmation.
- The verified-current quality denominator is zero. Freshness, geolocation, corroboration, source-state, and priority percentages remain null until at least one incident is legitimately admitted.
- The protection workflow is certified replay only. No live civil-protection authority or configured external dispatch exists, and no live send occurred.
- The replay proves workflow linkage/timing, not a causal protection outcome; causal protection remains `NOT_MEASURED`.
- Forecast geometry remains withheld wherever the scientific admission contract is not satisfied. Thermal observations, associated weather, uncertainty, next checks, and decisions remain usable rather than being blocked with the geometry.

## 13. Changed files

The baseline was captured at [`.artifacts/pre-operational-truth-recovery/20260903-105540`](../../../.artifacts/pre-operational-truth-recovery/20260903-105540). Its 162 dirty paths were preserved; the final worktree has 173. No baseline dirty path disappeared, no file was staged, and no commit was created.

- Domain and operational truth: `apps/api/src/modules/operator/operational-recovery-service.mjs`, `apps/api/src/modules/operator/canonical-operator-api-service.mjs`, `apps/api/src/modules/intelligence/operational-intelligence-service.mjs`, `apps/api/src/modules/intelligence/append-only-event-journal.mjs`, `apps/api/src/modules/intelligence/memory-event-journal.mjs`, `apps/api/src/modules/outcomes/outcome-service.mjs`, `apps/api/src/modules/interventions/operator-state-repository.mjs`, `apps/api/src/modules/live/live-thermal-adapter.mjs`.
- API/runtime integration: `apps/api/src/application/create-runtime.mjs`, `apps/api/src/application/create-services.mjs`, `apps/api/src/modules/basemap/basemap-service.mjs`, `apps/api/src/shared/pinned-https-fetch.mjs`.
- Operator console: `apps/operator-console/index.html`, `apps/operator-console/src/app.js`, `apps/operator-console/src/components.js`, `apps/operator-console/src/map.js`, `apps/operator-console/src/storage.js`, `apps/operator-console/src/canonicalComponents.js`, `apps/operator-console/src/canonicalViewModel.js`, `apps/operator-console/src/incidentSelection.js`, `apps/operator-console/src/mapPerformance.js`, `apps/operator-console/src/routeState.js`, `apps/operator-console/src/routes/commandOverview.js`, `apps/operator-console/src/routes/incidents.js`, `apps/operator-console/src/routes/incidentDetail.js`, `apps/operator-console/src/routes/intelligenceEvidence.js`, `apps/operator-console/src/routes/operations.js`, `apps/operator-console/src/routes/reportsAnalytics.js`, `apps/operator-console/src/routes/globalAwareness.js`, `apps/operator-console/styles/components.css`, `apps/operator-console/styles/responsive.css`, `apps/operator-console/styles/routes.css`.
- Tests: `apps/api/test/basemap-reliability.test.mjs`, `apps/api/test/canonical-operator-api.test.mjs`, `apps/api/test/live-v4.test.mjs`, `apps/api/test/operational-intelligence-service.test.mjs`, `apps/api/test/operational-recovery-service.test.mjs`, `apps/api/test/operator-console-renderer-encoding.test.mjs`, `apps/api/test/pinned-https-fetch.test.mjs`, `apps/operator-console/tests/interaction-contract.mjs`, `apps/operator-console/tests/truth-integrity.mjs`.
- Release and validation: `scripts/certify_operational_truth_recovery.mjs`, `scripts/release/browser-certification-browser-lock.json`, `data/validation/release/checkpoint-commands.sh`, `data/validation/release/checkpoint-handoff.json`, `data/validation/release/current-release-manifest.json`, `data/validation/release/dirty-tree-classification.json`, `data/validation/release/evidence-manifest.json`, `data/validation/release/ignored-runtime-manifest.json`, `data/validation/release/release-source-manifest.json`, `data/validation/release/release-statement.json`, `data/validation/release/unknown-path-report.json`, `.artifacts/operational-truth-recovery/final/`, and this report.

The exact 37 tracked diff sections changed since the baseline snapshot are independently derivable by comparing the saved `working-tree.patch` with the final `git diff`; the three net-new untracked implementation/certification paths are `apps/api/src/modules/operator/operational-recovery-service.mjs`, `apps/api/test/operational-recovery-service.test.mjs`, and `scripts/certify_operational_truth_recovery.mjs`.

## 14. Final phrase

VIGIA_OPERATIONAL_TRUTH_AND_ACTION_RECOVERY_READY
