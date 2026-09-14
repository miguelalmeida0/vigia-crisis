# Audit and Evidence Export

Use `GET /api/v10/operator/operational-periods/:periodId/audit-bundle` with an authenticated actor holding `read:audit`. The bundle contains the complete period, linked after-action package, incident-scoped receipts, export time, and a content fingerprint.

For incident truth, export canonical identity, four-state classification, freshness axes, evidence graph/evaluation, eight-family coverage matrix, independence lineage, geolocation derivation, spatial-truth kinds, weather association, resolver attempts, binding receipts, and material events. For actions, export the action, acknowledgement, expected postcondition, observation schedule, observed postcondition, classification, and each persistence receipt.

Preserve raw-source product IDs and checksums separately from operator labels. Verify the bundle fingerprint after transfer. Record release ID, timezone (`UTC`), exporting actor, incident scope, reason, recipient, and retention classification in the case record. Redact credentials, session tokens, protected personal data, and unrestricted device details; do not redact authority state, timestamps, rejection reasons, or truth-boundary warnings.

An export proves what VIGIA retained and decided. It does not prove an external event, public dispatch, or causal outcome unless the corresponding authoritative object and receipt are present.
