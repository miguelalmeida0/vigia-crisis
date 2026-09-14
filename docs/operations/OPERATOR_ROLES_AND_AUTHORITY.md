# Operator Roles and Authority

| Role | May do | Must not do | Required evidence |
|---|---|---|---|
| Viewer | Read authorized incidents, maps, source state, reports | Mutate incident or protection state | Authenticated scoped session |
| Intelligence operator | Triage, inspect evidence, acknowledge assigned decisions | Approve protection or widen scope | Incident scope and retained sources |
| Incident operator | Record incident-command actions and ownership | Claim external dispatch without receipt | Command capability and incident scope |
| Supervisor | Start/close operational periods, approve protection, assign roles | Override expired authority or truth admission | Current authority, scope, audit receipt |
| Administrator | Configure controlled integrations and recover services | Manufacture confirmation or bypass evidence gates | Change record and independent review |
| FieldNet node/operator | Submit signed field observations within assignment | Self-promote observations to official truth | Device identity, signature, clock, location |

The operational-period authority matrix narrows these maximum permissions. The narrower scope always wins. Every consequential mutation rechecks authentication, capability, incident scope, current authority, and universe. Authority expiry fails closed. Emergency access requires the repository's audited break-glass procedure; it does not relax source or scientific admission.

Shift assignment records person, organization, role, start/end time, incident scope, and handoff acknowledgement. Incident ownership assigns coordination responsibility, not civil-protection authority. The kill switch disables external effects; read-only fallback preserves current and last-good decision context.
