# Autonomous Decision Foundry Operations

## Bounded commands

All commands support `--help`, terminate without background workers and print deterministic JSON. Incident-scoped commands default to retained Dragon Bravo (`2025-AZGCP-000597`). Reconciliation requires `--once`.

```text
npm run decision-foundry:doctor
npm run intelligence:compile -- --incident=<id>
npm run hypotheses:explain -- --incident=<id>
npm run decisions:dependencies -- --incident=<id>
npm run decisions:delta -- --incident=<id>
npm run acquisitions:value -- --incident=<id>
npm run acquisitions:plan -- --incident=<id>
npm run acquisitions:reconcile -- --once
npm run negatives:build-atlas
npm run negatives:certify
npm run progression:expand
npm run labels:build-horizons
npm run corpus:scale
npm run regions:adjudicate
npm run report:decision-foundry
npm run benchmark:decision-foundry
npm run demo:autonomous-decision-foundry
```

The default acquisition budget permits at most two acquisitions per incident, 64 MiB per incident, two requests per provider, three provider retries, two concurrent tasks, ten cost units, three controller cycles and three blocked-provider attempts. Missing budget state is an error.

## Triage

`NO_VALID_OBSERVATION_OPPORTUNITY`, `PARTNER_REQUIRED`, `RIGHTS_BLOCKED`, `OUTSIDE_COVERAGE`, `SOURCE_DEGRADED` and `CAUSAL_DUPLICATE` are terminal planning explanations, not retry prompts. Dragon Bravo +1h/+3h labels remain blocked because retained WFIGS snapshots do not contain a horizon-compatible causal revision and FEDS lacks the publication chronology required for a knowledge-time label. Historical GOES ABI would add an independent physical family, but no eligible retained observation opportunity has been proven.

The negative atlas never certifies an empty response. Each candidate requires all ten proof fields: coverage, health, product availability, observation opportunity, quality, official checks, physical checks, doctrine, knowledge-time validity and rights.

## Recovery

PipelineTasks are semantic and idempotent. A repeated controller cycle reuses the same task identity. Existing Data Foundry crash recovery moves interrupted work to bounded retry or failure; superseded late results do not reopen obsolete work. Provider blocks retain attempt counts and stop at their explicit ceiling. Replay or proof mismatch is a hard failure and should not be overridden manually.

## Artifacts

Runtime packets, replays, progression products, future labels, region adjudication, weather availability and the negative atlas are under `data/runtime/decision-foundry`. Validation reports, consumer snapshots, demonstrations and benchmarks are under `data/validation/decision-foundry`. These generated products are backend artifacts; consumers must not infer missing semantics from raw files or local paths.
