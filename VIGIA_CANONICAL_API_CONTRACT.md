# VIGIA canonical operator API contract

All routes return `vigia.canonical-operator-api.v1`. The envelope includes the locked screen identity, backend generation time, canonical incident identity, backend-owned sections and an availability summary. Every section has `state`, `authority`, `value` and, when unavailable, `reason`. Missing values are not converted to zero.

| Screen | Method and path | Primary backend authority |
|---|---|---|
| 01 Command Overview | `GET /api/v10/operator/command-overview` | Event Fabric/Twin plus Agent 1 command reliability projection |
| 02 Incidents | `GET /api/v10/operator/incidents` | Operational Twin incident projection |
| 03 Incident Detail | `GET /api/v10/operator/incidents/:incidentId` | Twin, semantic object repository and reliability adapter |
| 04 Intelligence & Evidence | `GET /api/v10/operator/incidents/:incidentId/intelligence` | Evidence Graph/Contracts and Decision Foundry |
| 05 Evidence Debt | `GET /api/v10/operator/incidents/:incidentId/evidence-debt` | Contract-derived Debt and ranked information-value acquisitions |
| 06 Operations | `GET /api/v10/operator/incidents/:incidentId/operations` | Incident command, FieldNet and operations ledgers |
| 07 Authority & Trust | `GET /api/v10/operator/authority` | Session/capabilities and Proof Plane |
| 08 Control Plane | `GET /api/v10/operator/control-plane` | Operational Twin control projection and governed receipts |
| 09 Reports & Analytics | `GET /api/v10/operator/reports` | Twin, scientific gate and governed replay |
| 10 Global Situational Awareness | `GET /api/v10/operator/global-situational-awareness` | Twin source health, CAP lifecycle and authoritative truth network |

All routes require an authenticated operator with `read:incident_command`. Incident routes additionally enforce exact incident scope before the handler executes. Rights/compartment filtering occurs in the semantic repository. Global routes return only incidents within the actor's scopes; a frontend must not expand scope or infer excluded objects.

The frontend may render, filter and navigate backend-delivered projections. It must not calculate evidence qualification, causal independence, source health, Decision Value, Evidence Debt, authority, perimeter admissibility, contradiction resolution, forecast applicability or abstention.
