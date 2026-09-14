# Executed verification

Run from the repository root. Logs are copied alongside this report. All quoted pass totals describe these commands, not the full repository suite.

## Backend: 90 passed, 0 failed, 0 skipped

```sh
VIGIA_PDF_PYTHON=/Users/malmeida/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 TMPDIR="$PWD/.tmp" node --test apps/api/test/access-resilience.test.mjs apps/api/test/situation-intelligence.test.mjs apps/api/test/world-knowledge.test.mjs apps/api/test/canonical-operator-api.test.mjs apps/api/test/canonical-operator-response-projection.test.mjs
```

Includes scope/argument/claim boundaries, no future leakage, historical material reads, append-only snapshots, route direction and alternatives, capability/activation expiry, source watcher behavior, exact passages, reviewed facts, actual PDF parsing, scenario isolation, shared roads and temporal analog rules.

## PostgreSQL: 9 passed

```sh
node scripts/mega_iii_iv_postgres_proof.mjs
```

Uses session-local temporary tables and real constraints. Output contains the exact controlled source text and candidates. Operational fixture writes: zero.

## Deterministic corpora: 120 + 24 passed

```sh
node scripts/mega_iii_iv_benchmark.mjs
node scripts/mega_iii_iv_intent_benchmark.mjs
```

These are deterministic parser/intent cases. Model benchmark cases were not executed after the startup failures.

## Local model startup

```sh
python3 scripts/mega_iii_iv_model_gate.py
```

All three installed candidates rejected on their first failed sentinel. No 20-consecutive-sentinel gate passed. Exact attempts and unexecuted counts are in `model-gate.json`.

## Frontend static and asset checks

```sh
node apps/operator-console/tests/syntax.mjs
node apps/operator-console/tests/map-contract.mjs
node apps/operator-console/tests/asset-integrity.mjs
```

139 JavaScript modules pass syntax verification; map and asset checks pass. The production build is exercised by `node scripts/local_runtime.mjs up`. Its private admission URL is excluded from the report.

## Live retained-data proof

```sh
node scripts/mega_iii_iv_live.mjs
```

Captures three real incident contexts, hospital/route/Why, grounded Ask, access dependencies, history, comparison, scenarios, analog availability, queues, direct PostGIS latency and snapshot query plan.

After the final runtime restart, `node scripts/mega_iii_iv_restart_proof.mjs` verified three exact pre-restart snapshot IDs through the authenticated historical API. `readiness-final.json` records the subsequent public readiness check: HTTP 503, audit chain invalid and physical source families insufficient.

## Canonical rendered UI and timings

The pinned container is `vigia-visual-qa:playwright-1.54.0`, Chromium 139.0.7258.5. A transparent loopback proxy preserves browser caching and authenticated local API behavior.

```sh
docker run --rm --entrypoint python \
  -v '/Users/malmeida/Documents/ChatGPT/VIGIA Integration:/workspace:ro' \
  -v '/Users/malmeida/.codex/visualizations/2026/09/08/01a08086-9c18-7c51-b96e-12ccfed16259:/output' \
  vigia-visual-qa:playwright-1.54.0 /workspace/scripts/mega_iii_iv_ui_qa.py
```

The same container/mount command executed `mega_iii_iv_ui_focus.py` and `mega_iii_iv_document_ui.py`. The document UI uses a clearly labeled controlled extraction response; all other route/Ask/history/scenario captures use canonical retained responses.

For the final timing run, add `-e LANE=mega-iii-final-ondemand -e COLD_SAMPLES=3` and execute `/workspace/scripts/mega_iii_iv_map_benchmark.py`. This run completed 24 cases. Raw intermediate failures/regressions remain in `map-*.json`.

```sh
node scripts/mega_iii_iv_performance_report.mjs
/Users/malmeida/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/mega_iii_iv_visual_evidence.py
```

## Evidence boundaries

The browser harness initially encountered a CSP-incompatible wait implementation and locator/hidden-mobile-preview assumptions; these were corrected without weakening the product CSP. A targeted attempt also ran during a runtime admission rotation and failed authentication; it was rerun after the build finished. Final JSON reports, not attempted commands, determine the reported passes. The full repository suite and deployment certification were not run.
