# Scientific Truth Closure — Pre-Modification Baseline

Captured on 2026-08-25 before application-code changes for the Scientific Truth Closure mandate.

## Repository identity

- Workspace: `/Users/malmeida/Documents/Development/vigia-intelligence`
- Branch: `feat/vigia-intelligence-foundation`
- HEAD: `124ac703d2ffcb2569db64b8db1955ce2a2363a4`
- Working tree: intentionally dirty from the preceding VIGIA mandates; unrelated changes are preserved.
- Protected sibling repository: `/Users/malmeida/Documents/Development/vigia` was not accessed or modified.

## Reproduction commands

```text
git status --short
git diff --stat
git diff --check
git branch --show-current
git rev-parse HEAD
npm run evidence:source-manifest
npm run evidence:canada:corpus
npm run evidence:negatives:status
npm run evidence:near-term-labels:status
npm run evidence:prospective:status
npm run decision-memory:status
npm run science:build-corpora
npm run science:evaluate
```

## Evidence snapshot

| Surface | Baseline result | Deterministic fingerprint |
| --- | --- | --- |
| Public source manifest | 499 raw objects; 351,253,592 bytes | `public-evidence-source-manifest:sha256:d9c4277d...` |
| CWFIS | 30 objects; 315,642,681 bytes | Included in source manifest |
| Alberta | 74 objects; 13,538,313 bytes | Included in source manifest |
| British Columbia | 19 objects; 14,267,192 bytes | Included in source manifest |
| NWS | 139 objects; 1,815,401 bytes | Included in source manifest |
| ECCC | 237 objects; 5,990,005 bytes | Included in source manifest |
| Canadian incident corpus | 12,322 discovered; 0 forecast-eligible; 1,893 final-perimeter; 12,322 issue-time candidates | `canadian-evidence-corpus:sha256:72d182...` |
| Certified negatives | 0 valid; 0 hard; 0 promoted `UNKNOWN` | `3f8ed...` |
| Near-term labels | 0 at every required horizon; 18 provider states changed | `eb932...` |
| Prospective archive | 227 snapshots; 108 incidents; 3 classes; 101 unchanged; 18 changed; zero rewrite | `68718...` |
| Decision Memory | 100 episodes; 100 opportunities; 25 outcomes; audit not yet run | `1928b...` |

The abbreviated fingerprints above are the prefixes emitted by the pre-existing repository commands and are recorded exactly as surfaced by the baseline run. New closure artifacts must carry complete SHA-256 fingerprints.

## Gate state

- Historical corpus: `CORPUS_NOT_READY`
- Forecast evaluation: `BLOCKED_BY_CORPUS`
- Forecast metrics: unavailable (`null`)
- Decision-learning score: 7.5 before the required audit
- Scientific Truth Closure: **not passed at baseline**

## Blocking reasons

1. No candidate has a certified GOES fire-detection plus cloud-mask observation opportunity.
2. The negative corpus contains neither 25 valid negatives nor 10 hard negatives.
3. Canadian incidents have no demonstrated nonzero fuel-and-terrain physical binding.
4. The prospective archive has no nonzero 1-hour or 3-hour labels.
5. Evaluation cannot be nonvacuous while the qualifying corpus is empty.
6. Decision-memory records have not yet passed the mandate-specific leakage and audit checks.

This baseline is evidence, not a waiver. The closure gate thresholds remain unchanged.
