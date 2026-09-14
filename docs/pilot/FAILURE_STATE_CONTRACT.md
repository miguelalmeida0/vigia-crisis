# Failure-State Contract

## Canonical dependency states

| State | Meaning | Permitted rendering | Prohibited rendering |
|---|---|---|---|
| `LOADING` | No current result yet | Loading/pending label; disabled duplicate action | Current, ready, healthy, success |
| `READY` | The latest bounded request succeeded | Current value plus successful-at timestamp | Implying a different dependency also succeeded |
| `STALE` | Latest request failed but a last-good value exists | Last-known value, explicit stale label, last-good and last-attempt timestamps | Current/available/success language |
| `FAILED` | Latest request failed and no retained value exists | Unavailable/failure state and named failure class | Zero, empty, healthy, or current substitute |
| `NOT_CONFIGURED` | Required integration is absent | Explicit not-configured boundary and unavailable actions | Empty live feed or inferred capability |
| `MEASUREMENT_REQUIRED` | Screening lacks qualified decision-grade measurement/review | Withheld measurements and next evidence step | Authoritative area, corridor, exposure, treatment, or promotion claim |

## Operation rules

- Required dependencies determine overall runtime readiness. Optional dependency success cannot mask required dependency failure.
- A retained value remains useful only as last-known context and must carry its last-good timestamp.
- A refresh succeeds only after every required stage for that action succeeds. Partial completion is labelled `PARTIAL` or `STALE`, never success.
- Critical refreshes are single-flight. While pending, the initiating control is disabled and visibly pending. It is restored only after a terminal state.
- Event-detail requests are abortable and generation-bound; event A cannot overwrite a later selection of event B.
- A basemap starts as loading, becomes `REAL BASEMAP · VIGIA PROXY` only after all governed layers load, and becomes `MAP VISUALIZATION DEGRADED` if any governed layer fails.
- FieldNet central readiness proves only the current central read plane. It never proves local node availability, communications coverage, delivery, or absence of unsynced local work.

## Operator response

On `STALE` or `FAILED`, stop any decision that requires current data, identify the failed dependency, preserve the last-good timestamp, and use the governing external procedure. On `MEASUREMENT_REQUIRED`, acquire qualified evidence or review; do not promote screening. On identity or release contradiction, stop the entire rehearsal.

## Verification

The contract is verified by focused runtime-loader/rendering tests, source and FieldNet partial-failure tests, event-race tests, map-load tests, and controlled live-browser injections. A test result is evidence of behavior in the certified release only; it is not evidence that an external provider or field network will always be available.
