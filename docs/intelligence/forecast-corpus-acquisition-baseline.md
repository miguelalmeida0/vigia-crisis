# Forecast corpus acquisition baseline

Recorded on 2026-08-24 before historical corpus acquisition on branch
`feat/vigia-intelligence-foundation` in
`/Users/malmeida/Documents/Development/vigia-intelligence`.

## Repository boundary

- Repository and writable root: verified.
- Branch: verified.
- Root write probe: created, checked, deleted successfully.
- `apps/operator-console` and `apps/web` source status: unchanged.
- Sibling checkout `/Users/malmeida/Documents/Development/vigia`: not accessed or modified.
- Pre-existing worktree changes: retained as the authoritative implementation state.
- `git diff --check`: passed.

## Inherited layer verification

| Layer | Command | Result |
| --- | --- | --- |
| Intelligence | `npm run test:intelligence` | 60 passed, 0 failed |
| Event Fabric and Twin | `npm run test:event-fabric` | 7 passed, 0 failed |
| Control Plane | `npm run test:control-plane` | 16 passed, 0 failed |
| Proof Plane | `npm run test:proof-plane` | 14 passed, 0 failed |
| Reality Network | `npm run test:reality-network` | 12 passed, 0 failed |
| Forecasting Plane | `npm run test:forecasting` | 19 passed, 0 failed |

The Intelligence suite includes the Event Fabric, Operational Twin, Control Plane,
Proof Plane, Reality Network, and Forecasting domain tests. Layer-specific commands
were also run independently so the baseline does not depend on one aggregate result.

## Forecasting quality state

`npm run report:forecast-quality` reproduced the inherited decision:

```text
DO_NOT_ADVANCE
```

The exact corpus state was:

| Measure | Value |
| --- | ---: |
| Forecast-eligible incidents | 0 |
| Positive cases | 0 |
| Valid negative controls | 0 |
| Excluded candidate controls | 100 |
| Hard negatives | 0 |
| Regions | 0 |
| Seasons | 0 |
| Calibration samples | 0 |
| Evaluated horizons | 0 / 5 |

The shadow forecast remained correctly abstained. Its durable replay was valid and
identical, no physical solver ran, and zero external actions executed. Failed gates
were negative-control coverage, two-region and two-season coverage, split isolation,
all forecast horizons, baseline comparisons, extreme-tail comparison, calibration,
source ablation, and stratified performance.

## Acquisition doctrine

This baseline must not be improved by relabelling final perimeters as operational
progression, simulating unknown labels, weakening observation-opportunity rules, or
moving retrospective data into issue-time features. The historical corpus vertical
starts from zero forecast-eligible incidents and must preserve that fact until real,
lineage-complete examples pass all knowledge-time gates.
