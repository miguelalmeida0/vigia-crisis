# VIGIA Government Pilot Runbook

## Entry gate

The pilot lead records the named sponsoring authority, legal/data-sharing agreement, authorized territory, operator roster, incident scopes, provider credentials, exercise dates, escalation contacts, and whether public-alert dispatch is disabled. Missing fields remain explicit blockers; they are never inferred from a successful login or healthy API.

## Commissioning sequence

1. Verify `/api/v10/ready`, release identity, audit storage, clock synchronization, and the canonical operator-console origin.
2. Review the provider coverage matrix. Prove direct IPMA acquisition, intermediary occurrence acquisition, FIRMS status, FieldNet status, and any authority feed separately.
3. Start an `EXERCISE` operational period with commander, roles, authority matrix, incident owners, objectives, deadlines, and the read-only/offline posture.
4. Use retained or explicitly isolated exercise incidents. Confirm that every screen displays the universe label and that no exercise record enters live-production counts.
5. Execute detect → verify → decide → respond → protect/recover → learn. Record acknowledgement, expected postcondition, observation schedule, observation, and conservative classification.
6. Exercise provider loss, read-only fallback, FieldNet continuity, kill switch, shift handoff, expired authority, duplicate alert idempotency, and unavailable transport.
7. Close the period and export its fingerprinted after-action and audit bundles.

## Go/no-go

Go requires zero truth-boundary failures, zero unauthorized mutations, zero replay/live mixing, complete audit receipts, named incident ownership, acknowledged objectives, and a documented rollback owner. A live public alert remains no-go until the authorized Portuguese authority supplies a legal mandate, approving role, credentialed transport, target policy, and witnessed live exercise.

## Stop conditions

Stop the pilot for release-identity mismatch, clock drift that invalidates freshness, map/incident selection divergence, source lineage loss, authority expiry, unbounded provider retries, audit persistence failure, or any display that promotes intermediary evidence as direct official confirmation.
