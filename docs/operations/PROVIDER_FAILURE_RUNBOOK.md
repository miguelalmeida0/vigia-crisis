# Provider Failure Runbook

## Diagnose

Use the provider matrix to capture provider, family, authority level, configuration, reachability, last success, last failure, record counts, freshness budget, rejection reason, and next attempt. Distinguish authentication, rate limit, schema drift, transport, no coverage, stale product, and association failure.

## Operate

- Retain last-good content with its original timestamp and degraded state.
- Keep the resolver bounded. Respect backoff, rate-limit state, circuit breaker, deadline, and hourly probe after escalation.
- Assign the VIGIA source-resolution scheduler for automatic retries; assign the duty intelligence lead for an escalated decision; assign the partnership lead for a required authority/agreement.
- Do not translate provider availability into incident coverage or currentness.
- Do not substitute a republication for an independent sensor family.

## Recover

Record the state transition, recovery time, stale duration, accepted/rejected counts, and the first successful canonical association. Re-evaluate affected incidents; do not bulk-promote. Confirm that duplicate products preserve idempotency and that source timestamps do not move backward.

## Escalation

Escalate immediately when a failure blocks a due human decision or protection review. Otherwise escalate at the job deadline or bounded-attempt threshold. A partner-only endpoint requires the exact party, agreement, endpoint, credential, and positive-control result in the blocker record.
