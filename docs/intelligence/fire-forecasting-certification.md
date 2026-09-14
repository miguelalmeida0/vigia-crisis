# Fire forecasting certification record

## Fixed evaluation policy

The promotion policy was defined before results: two regions, two seasons, at least 20 valid negative opportunity controls, incident and upstream-observation isolation, 1/3/6/12/24-hour labels, wins over no-growth and recent-growth persistence, mean absolute calibration error no greater than 0.10, extreme underprediction no worse than 1.05 times the best baseline, complete ablations and stratification, and identical shadow replay.

## Available corpus

The inherited Portugal 2024 source corpus contains 35 large official incidents. It is useful source material for incident detection and association, but it contains final burned area and archival thermal matches—not issue-time initial perimeter sequences and later perimeter labels. The current Western US incident is a live state, not a historical target. The thermal-site context contains diagnostic candidates but lacks a pinned healthy observation opportunity and authoritative no-incident doctrine, so valid negative controls remain zero.

The largest retained Portugal case, `PT-2024-ICNF-59214` (19,996.02 ha), is the non-trivial flagship candidate. It is blocked because the repository lacks its issue-time perimeter sequence, issue-time weather archive, future perimeter labels, fuel/terrain pack, and attributable asset outcomes. No pseudo-forecast or fabricated metric is substituted.

## Current result

- Forecast-eligible incidents: 0
- Forecast-eligible positive cases: 0
- Valid negative opportunity controls: 0
- Hard negatives: 0
- Measured forecast horizons: 0 of 5
- Calibration samples: 0
- Physical solver runs: 0
- Historical impact labels: 0
- Current shadow replay: deterministic
- Consequential actions: 0

Spread, calibration, tail-risk, and impact metrics are `UNMEASURED`. Baselines and ensemble mechanics are implemented and tested, but uncalibrated contour thresholds are not probabilities suitable for operations.

## Decision

`DO_NOT_ADVANCE`

Failed gates and their current values are emitted in `data/validation/forecasting/forecast-quality.json`. The shortest corrective path is to acquire a knowledge-time historical corpus with official perimeter progressions, matched issue-time ensemble weather, retained fuel/terrain packs, asset labels, and valid negative opportunities in at least two regions and two seasons; then run the already-fixed leakage, baseline, calibration, tail-risk, ablation, and replay gates without changing thresholds after seeing results.
