# VIGIA 10.0 recovery verification record

Verification performed on 2026-08-09 against the packaged source tree.

## Software and domain regression

- `npm test`: **114 / 114 passing**.
- Includes evidence-need/request lifecycle, confirmed future opportunities, deadline escalation, accepted-evidence feedback, event identity, fusion ambiguity, physical coverage, persistence rollback, source failure, Portugal replay, real native-pixel integrity and prevention screening.

## Architecture

- `npm run check`: **297 files inspected; 241 runtime/test modules syntactically valid, import-resolved, acyclic, and within the 220-line budget**.
- `git diff --check`: passed after cleanup.

## Runtime and API smoke

- `npm run smoke`: passed.
- Runtime created two durable acquisition states for two unresolved events.
- One event moved `REQUEST_ACTIVE → acknowledged → in_progress → submitted → accepted → RESOLVED`; the accepted device-GPS observation entered the same retained event identity and made physical state current.
- `/api/v10/live` reported process liveness. `/api/v10/ready` truthfully returned `503 not_ready` for production while the fixture-free integrity checks passed and physical-source/authentication dependencies remained absent.

## Scientific runtime

- `npm run geo:doctor`: passed.
- Python 3.12.13; numpy 2.2.6; rasterio 1.4.3; pyproj 3.7.1; shapely 2.1.1; h5py 3.14.0.
- Native GeoTIFF pixel round-trip, wrong-place rejection, and required-band integrity tests passed.

## Portugal replay

- `npm run test:replay`: passed 3 synthetic TEST arrivals including 1 late observation.
- Preserved 1 event identity across 3 observation assignments, persisted 1 derived state, reached two declared physical dependency groups, and kept thermal geometry non-authoritative.
- Operational validation remained `UNMEASURED`; the synthetic corpus is TEST-only and no real replay corpus exists.

## Browser regression

- Desktop QA passed acquisition-state visibility, physical-event truth, location-bound observation switching, comparison interaction and rapid-selection handling.
- Fire/consequence QA passed event correction access and deterministic low/central/high sensitivity semantics.
- Mobile QA passed at 390×844.
- In-app browser independently showed 3 active requests, 0 untracked unknowns, explicit acquisition owner/state/unmeasured fields, and no console errors.

## What this record does not prove

This is not agency certification or Portuguese wildfire-performance validation. It does not prove detection sensitivity/specificity, calibrated probability, exact negative-evidence coverage, authoritative perimeter accuracy, operational spread accuracy, reliable future acquisition delivery, production identity security, or autonomous dispatch/public-warning authority. Those require external data, infrastructure, exercises and acceptance policy.
