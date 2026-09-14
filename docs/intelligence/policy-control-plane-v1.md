# Policy Engine and Reconciliation Controllers v1

This vertical turns the canonical Operational Twin into a deterministic control loop without creating a second truth model:

```text
canonical event → twin transition → versioned policy → desired state → action plan
→ authority/budget/circuit/kill-switch checks → bounded internal effect
→ postcondition → hash-bound receipt → canonical control event → updated twin
```

## Safety and truth boundaries

- Policy evaluation and planning are pure functions of an explicit twin, policy fingerprint, authority context, and evaluation time.
- Control events use `hazardType: control-plane`, a `SYSTEM` source family, null geometry, and no evidence stance or observation state. The twin projects them into `controlPlane` and never associates them as physical evidence.
- `REVERSIBLE` and `BOUNDED_OPERATIONAL` actions require explicit capabilities. `CONSEQUENTIAL` actions always stop at `AUTHORITY_REQUIRED` in v1, even if a supplied context claims the capability.
- Internal effects only create or transition acquisition requests and contradiction work. The external executor is an unconfigured port and never pretends to be live.
- Action identity binds the incident, subject, desired state, policy fingerprint, action type, and exact target. Exact retries deduplicate; a materially different target produces a different action.
- A restarted `STARTED` action checks its postcondition before retrying. If late truth makes the desire obsolete, the action becomes `SUPERSEDED` before any effect.
- Per-cycle/incident/provider budgets, maximum attempts, cooldown, circuit state, a kill switch, and a maximum cycle count bound failure and oscillation.

## Policy set

The wildfire v1 set handles missing independent corroboration, stale sources, unavailable providers, blocking contradictions, resolved-work closure, and the consequential warning boundary. Policy versions are immutable and fingerprinted. Replay with a different policy version fails comparison rather than silently substituting current doctrine.

## Consumer boundary

Consumers should read `twin.controlPlane` and `ControlPlaneService.status()` for governed work, policy decisions, desired states, current and historical actions, blocked reasons, authority requirements, postconditions, receipts, cycles, and aggregate runtime metrics. A future UI must not recalculate these concepts.

## Operator commands

```bash
npm run test:control-plane
npm run demo:control-plane
npm run benchmark:control-plane
```

The demo uses a durable append-only journal under `.tmp`, executes only bounded internal effects, asserts zero consequential execution, and verifies both Operational Twin and control-plane replay.
