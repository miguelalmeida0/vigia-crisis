# VIGIA pilot integration boundaries

VIGIA owns evidence-backed physical intelligence and operator comprehension. It does not become the system of record for dispatch, personnel accountability, apparatus location, agency identity, or command authority without a governed integration.

| Boundary | Read contract | Write contract | Required truth / failure state |
|---|---|---|---|
| CAD / incident dispatch | Incident ID, timestamps, location, status, agency routing | None in the initial pilot unless explicitly authorised | Show `NOT CONFIGURED`, `UNAVAILABLE`, or last successful sync; never create a local incident that appears dispatched. |
| AVL / apparatus | Governed resource ID, type, position, timestamp, availability | None initially | Age and source must be visible; missing feed is not zero resources. |
| Identity / access | Agency subject, role, authentication assurance, session expiry | Authentication/audit events only | Read-only sessions remain explicit; role labels must come from the provider. |
| Field sensors / FieldNet | Sensor identity, observation, quality, timestamp, connectivity | Acknowledgement only when the sensor protocol supports it | Separate central-ledger readiness from field-mesh proof. |
| Agency alerts | Alert ID, severity, jurisdiction, evidence link, acknowledgement state | Governed acknowledgement with actor and timestamp | Acknowledgement failure remains visible; no local-only success state. |
| Evidence repositories | Immutable source reference, observation metadata, checksum/provenance | Governed attachment or review decision | Image failure must not erase metadata; substitute imagery is prohibited. |
| Command / accountability | Objectives, assignments, PAR/Mayday state, command transfer | Only through authorised command workflows | `NOT CONFIGURED` and `UNAVAILABLE` remain distinct; exercise state is never substituted. |

## Pilot sequence

1. Agree the authoritative owner and identifier for each entity.
2. Define freshness, retry, revocation, and fail-closed policy.
3. Validate read-only projections and incident-ID reconciliation.
4. Add writes only after audit identity, idempotency, error recovery, and agency approval are proven.
5. Re-run continuity, degraded-mode, source-semantics, and handoff tasks for every connected boundary.

Integration success is not “endpoint returned 200.” It is correct identity, freshness, attribution, authority, failure semantics, and operator interpretation under degraded conditions.
