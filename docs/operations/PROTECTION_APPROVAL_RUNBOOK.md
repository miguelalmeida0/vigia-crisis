# Protection Approval Runbook

Protection stages are `DRAFT → REVIEW → APPROVED → DISPATCH_ELIGIBLE`. From there, the safe default is `EXTERNAL_SEND_DISABLED`. `DISPATCHED` requires a live-production universe, current supervisor/administrator authority, configured transport, unique idempotency key, and provider receipt.

Before review, verify target population/area, exposure basis, threshold, recommendation, provenance, authority owner/expiry, expected postcondition, and workflow expiry. Approval confirms governance only; it does not prove the hazard or send an alert.

A CAP draft requires target area description plus polygon, circle, or geocode; effective/expiry; severity; urgency; certainty; instruction; source attribution; approval state; supersession references; and transport state. Validate before dispatch. Update and cancel messages retain references. Duplicate idempotency keys are rejected. Expired authority is rejected. Exercise/replay dispatch is rejected.

After any authorized send, retain transport receipt and acknowledgement source/receipt. If transport is unavailable, keep the workflow visible as blocked and notify the named authority through an approved out-of-band procedure; never claim dispatch.
