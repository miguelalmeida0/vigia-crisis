# Protection approval runbook

Verify the target, evidence/proximity boundary, explicit threshold, recommendation, named authority requirement, authority owner and expiry, provenance references, expected postcondition, and universe. Move `DRAFT → REVIEW → APPROVED → DISPATCH_ELIGIBLE` only with current authority.

For the pilot, generate an `Exercise` CAP draft and transition to `EXTERNAL_SEND_DISABLED`. A valid draft is not a sent alert. Never claim dispatch without a credentialed transport receipt. Reject expired, duplicate, replay, out-of-scope, or non-production sends. Record cancellation or supersession explicitly.
