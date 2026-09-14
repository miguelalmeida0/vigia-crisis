# FieldNet offline runbook

Confirm `/health` liveness and `/ready` authoritative readiness separately. Readiness requires the owned process, bound listener, matching release quartet, `services_ready`, deployment identity, exact incident scope, writable initialized SQLite/storage, and required internal services. Central connectivity is separate and may be unavailable while local readiness remains true.

During disconnection, record observations and acknowledgements locally, preserve incident scope, and display the central-connectivity state. On reconnect, reconcile with idempotent receipts, surface conflicts, and never replace newer canonical truth silently. If process, storage, release identity, or scope fails, mark FieldNet not ready immediately.
