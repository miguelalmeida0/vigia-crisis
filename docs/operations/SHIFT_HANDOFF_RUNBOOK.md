# Shift Handoff Runbook

The outgoing commander reviews the active operational period: incident owners, open objectives, critical decisions, critical actions, deadlines, source degradations, protection items, resource status, freshness debt, unresolved conflicts, and pending observation schedules.

Create the handoff package with named outgoing/incoming leads. The incoming lead checks canonical incident/map synchronization, the top ranked incident explanation, source resolver next checks, authority expiry, transport-disable state, and any FieldNet/offline work before acknowledging.

Do not close the old period merely because a handoff package exists. Acknowledgement must be retained. Start the next period with explicit roles, authority matrix, owners, objectives, and end time; never copy stale authority automatically.

If the API is unavailable, use the last exported package in read-only mode and retain signed FieldNet records for later reconciliation. No offline action may claim server acknowledgement until the canonical ledger accepts it.
