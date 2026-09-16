# Operational Truth & Safety Guide

Use this guide whenever a change affects operational facts, provenance, uncertainty, source health, demo/synthetic data, incident identity, or fail-closed behavior.

## Truth model
- Preserve source, source timestamp, ingestion timestamp, freshness, and material limitations for operational claims.
- Keep these states distinct where the product contract supports them: current/known, last-known/stale, unknown, and unavailable.
- Missing is not zero. Unknown is not safe. A successful HTTP response is not proof that the underlying data is healthy.
- “No currently ingested restriction affects this route” is not equivalent to “the road is open”.
- Do not promote model output, heuristic ranking, display order, or visual emphasis into authoritative fact.
- Do not infer capability, occupancy, availability, readiness, or qualification from a facility name alone.

## Evidence classes
Do not blur:
- observed/current operational data
- official/admitted geometry or status
- historical records
- forecasts
- deterministic derived relationships (distance, intersection, route dependency)
- model-generated wording
- synthetic/demo scenario data

Derived statements must remain reproducible from their underlying inputs.

## Production / demo boundary
- Production and portfolio demo databases must be physically/configurationally isolated.
- Demo records remain explicitly synthetic and use the repository's existing `SHADOW` / `exercise` semantics.
- Never weaken production safety gates to make the demo easier to run.
- Never seed synthetic records into the production operational database.
- A demo startup/recovery fix must preserve deterministic identity and domain invariants rather than suppressing legitimate conflicts globally.

## Failure behavior
- Fail closed where the existing safety contract requires it.
- Surface stale/unavailable state rather than silently dropping or fabricating data.
- Preserve last-known-good information only when its staleness is explicit and the domain permits reuse.
- Never convert an upstream failure into PASS merely because the application stayed running.

## Verification
When changing truth-sensitive behavior, add tests for both the intended result and at least one unsafe/misleading result the change must prevent. Use `docs/agent/testing.md` for reporting and certification rules.
