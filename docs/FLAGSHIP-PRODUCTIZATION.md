# Flagship productization evidence

VIGIA is organized around the wildfire lifecycle: Territory Command, Prevent, Detect, Living Fire, and Action. Public reports, physical observations, pre-ignition screening findings, and response activity remain separate truth classes.

## Pre-ignition review contract

Fuel-continuity findings are durable screening candidates bound to native Sentinel-2 observations and a detector version. Review decisions persist in the operator state and the `prevention_finding_review` PostGIS table.

- `DEVELOPER_REVIEW` supports product and detector QA but never contributes to expert precision.
- `DOMAIN_EXPERT_REVIEW` requires the actor qualification `wildfire_prevention_domain_expert`.
- Candidate precision is calculated only from non-abstaining domain-expert reviews for the current detector version.
- Recall remains unmeasured until an exhaustive ground-truth denominator exists.
- Every review records a decision, a reason from the governed error taxonomy, a note, actor identity, detector version, and timestamp.

## Living Fire entry

The Living Fire workspace opens a governed physical-first replay at the first physical observation. The Replay workspace still opens at the beginning of the controlled clock, so it can demonstrate that later report knowledge never leaks backward in time.

## Readiness semantics

The unknown-to-work invariant applies orphan detection only to fire-event evidence needs. Prevention-finding work remains visible and owned without being misclassified as an orphaned fire event. Readiness remains false when fewer than two structured physical source families are configured.

## Verification

```bash
npm test
npm run check
npm run smoke
npm run reality:gate
VIGIA_DATABASE_URL='<verification database URL using the generated local password>' npm run verify:postgis
```

The production reality gate rejects synthetic observations, fixture-provider imports, demo identities, served synthetic assets, and the legacy fixture switch. Browser validation is a separate visual gate and must run in an approved browser environment.

## Current unmeasured or provider-blocked areas

- Live structured physical source families remain unavailable until NASA FIRMS and at least one independent MTG, Sentinel-3, camera, or ground-sensor feed are configured.
- Pre-ignition expert precision, recall, and prospective drift remain unmeasured until qualified external labels are collected.
- Current fire behavior and geometry cannot be claimed when no fresh physical observations exist.
