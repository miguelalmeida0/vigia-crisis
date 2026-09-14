# VIGIA V10 validation contract

V10 does not equate passing software tests with proven wildfire performance. Unit, integration and browser QA prove implementation invariants; labelled fire-season replay/prospective evaluation proves operational performance.

Run:

```bash
npm run validation:fire -- labelled-cases.json validation-policy.json
```

A labelled dataset is either an array or `{ "records": [...] }`. Each record can contain:

```json
{
  "id": "case-001",
  "truth": {
    "fire": true,
    "eventId": "official-fire-A",
    "hazard": false
  },
  "prediction": {
    "fireCandidate": true,
    "eventId": "PT-2026-...",
    "hazardCandidate": false,
    "abstained": false
  },
  "firstPhysicalAt": "2026-08-09T12:00:00Z",
  "firstReportAt": "2026-08-09T12:18:00Z"
}
```

The evaluator reports physical-detection precision/recall/F1, prevention precision/recall/F1, event fragmentation rate, false-merge rate, measured pre-report lead time and abstention rate.

VIGIA intentionally ships **no self-authored life-safety thresholds**. A policy file must come from the actual validation program, for example:

```json
{
  "id": "external-pilot-policy-v1",
  "rules": [
    { "metric": "physicalDetection.precision", "min": 0.0 },
    { "metric": "eventIdentity.falseMergeRate", "max": 1.0 }
  ]
}
```

The numbers above are schema examples, not recommended safety thresholds. Operational gates must be set from the deployment context, regulator/agency requirements, labelled dataset quality and accepted risk budget.
