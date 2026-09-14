# Authorization Matrix

All registered HTTP routes require an explicit policy. A missing policy is a startup/runtime error, not an implicit allow. Capabilities are exact; no role receives a wildcard capability. Client-supplied actor identity, role, capability, or incident scope is never authoritative.

| Boundary | Authentication | Required capability | Incident scope | Operator intent | Audit/redaction |
|---|---|---|---|---|---|
| Public health and release identity | Public | None | None | No | Release-safe projection only |
| Public read projections | Public | None | Public universe only | No | Explicit redaction projection; no actors, notes, sensitive geometry, or command state |
| Operator read routes | Governed session or configured operator bearer | Route-specific read capability | Requested incident must be in actor scope | No | Actor and policy included in request audit context |
| Alert lifecycle mutation | Governed authenticated operator | Exact alert transition capability | Alert canonical incident must be in actor scope | Required | Lifecycle receipt and actor attribution |
| Incident-command mutation | Governed authenticated operator | Exact command capability | Target incident must be in actor scope | Required | Append-only mutation/audit receipt |
| Evidence-request mutation | Governed authenticated operator | Exact evidence capability | Evidence subject incident must be in actor scope | Required | Request transition receipt; unknown remains open on cancellation |
| Manual SHADOW import | Governed authenticated operator | Exact import/command capability | Canonical binding must be in actor scope | Required | Effective-envelope hash, source hash, filename, counts, mode, release ID |
| FieldNode control API | Signed control principal | Route-specific FieldNode capability | Signed principal scope | Signed request is intent | HMAC envelope, key ID, timestamp, nonce, body hash |
| Central FieldNet sync | Registered signed node | `fieldnet:sync` | Registry-bound incident list | Signed request is intent | Node ID/body match, nonce, body hash, monotonic sequence, conflict preservation |
| Sensor gateway | Signed FieldNode control principal | Sensor-gateway capability | Registered sensor/incident | Signed request is intent | Destination derived from registry; caller URL is not authority |

## Local supervised profile

Local automatic sign-in is valid only for the loopback, non-production `local_shadow` runtime. The issued HTTP-only session cookie must survive reload with the same actor identity. The profile is not a production authentication mechanism and creates no authority outside explicit route capability and incident-scope checks.

## Denial behavior

Unauthenticated is `401`; authenticated but wrong capability/scope/intent is `403`; replayed signed request is rejected; missing route policy fails closed. Denials must not leak operational payloads and must remain auditable without recording secrets.
