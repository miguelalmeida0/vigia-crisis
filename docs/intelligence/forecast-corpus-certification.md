# Historical forecast corpus certification

## Scope and result

The bounded real-data pilot proves acquisition, provenance, canonicalization,
rejection, leakage auditing, rights assessment, and deterministic replay. It does
not meet the scientific corpus gates.

```text
CORPUS_NOT_READY
```

## Measured pilot

| Measure | Value |
| --- | ---: |
| Regions represented in discovered records | 2 |
| Seasons represented in discovered records | 2 |
| Discovered incidents | 36 |
| Incidents with at least three retained states | 1 |
| Forecast-eligible incidents | 0 |
| Gold examples | 0 |
| Rejected candidates | 375 |
| Valid negative opportunities | 0 |
| Horizon counts (1/3/6/12/24 h) | 0 / 0 / 0 / 0 / 0 |
| Leakage violations in retained Gold | 0 |
| Crosswalk incident groups | 36 |
| Ambiguous crosswalk groups | 0 |

The Western US pilot is Dragon Bravo (`2025-AZGCP-000597`): 40 WFIGS captured
revisions, HRRR run `HRRR:20250707:21`, five LF2023 v2.4.0 fuel layers, three
LF2020 terrain layers, and nine FIRMS VIIRS standard observations. The bounded run
processed 57 objects/records and 12,563,167 bytes. The 35 Portugal records are
official historical context but final-only and cannot support progression.

## Failed gates

- fewer than two eligible regions and seasons;
- fewer than 100 eligible incidents;
- zero valid negatives, below both 100 target and 20 promotion minimum;
- zero measurable examples at every required horizon;
- no decoded/missing-value-certified issue-time weather grid;
- no Portugal issue-time perimeter sequence;
- no versioned asset context or future impact outcomes;
- no non-vacuous baseline evaluation.

Rights and replay gates pass for the derived, non-raw corpus manifest. Passing those
gates does not compensate for missing scientific cases.

## Exact access and data barriers

- WFIGS Daily history begins in 2025 and NIFC warns that captured geometry changes
  are not an official progression.
- ICNF annual burned-area geography is retrospective; exposed data does not contain
  an issue-time revision sequence.
- EFFIS product publication/revision timing and satellite lineage are not sufficiently
  established for this corpus.
- Copernicus EMS activations are sparse, activation-specific operational snapshots.
- historical ECMWF delivery is partner/service-agreement dependent; rolling open
  data cannot reconstruct old Portugal incidents.
- Copernicus DEM 30 m access requires current licence acceptance/user category.
- no defensible sensor opportunity/health archive has yet produced strong negative
  controls.

## Replay evidence

The retained semantic fingerprint is:

```text
forecast-corpus:sha256:9487027ff16bc7a6abc3b8ef8fff2fdbc4503dd6abc75a4bd94804a77c7e6be5
```

Reversed raw and rejected-example ordering reproduces the identical fingerprint.

## Brutal self-audit

- The WFIGS states are true captured operational snapshots, not claimed official
  progression. Final-only Portugal geometry never enters features.
- Later perimeter/weather availability and retrospective/reanalysis features fail
  automated audits. Current fuel cannot rewrite earlier incident state.
- FEDS cannot inflate VIIRS; provider downtime, empty responses, and unresolved
  prescribed fire cannot become valid negatives.
- Incident and upstream physical observations are isolated across splits. Ambiguous
  crosswalks remain ambiguous.
- Missing OSM assets do not become zero exposure. Malformed geometry cannot enter
  Gold. Gold requires Bronze/Silver lineage and export rights.
- Selection rules are fingerprinted before evaluation. The pilot was selected to
  exercise a nontrivial 40-revision incident, not because a baseline performed well.
- With zero Gold examples, forecasting evaluation remains vacuous.

## Shortest legitimate corrective path

Run `TARGETED CORPUS GAP CLOSURE`: decode and QA the retained HRRR fields; acquire
official future-label geometry and sensor opportunity/health evidence; construct at
least 100 valid hard negative opportunities; expand bounded WFIGS acquisition across
two US seasons; and secure a Portugal issue-time progression plus historical ECMWF
access. Rebuild without changing the readiness gates.
