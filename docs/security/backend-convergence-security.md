# Backend Convergence Security Boundary

## Protected properties

The backend must preserve event and object semantic identity, bitemporal knowledge, lineage, rights, authority, projection coherence, archive history, Decision Packet proof, Decision Outcome integrity, and Information Value integrity. External consequential execution remains disabled.

## Controls

- Postgres writes use parameterized statements and serializable transactions with bounded retry.
- Dedicated packet, receipt, archive, Decision Outcome, and Information Value rows commit atomically with their semantic object.
- File writes use a cross-instance lock and atomic replacement; failed transactions do not publish state.
- Object and event semantic identities are unique in both adapters.
- Lineage and outcome references fail closed on missing parents.
- Archive chains reject missing predecessors, duplicate manifest sequence, and duplicate raw identity.
- Stable cursors bind to a projection version and cannot be replayed after mutation.
- Query routes require explicit route policy, authentication, capability, and incident scope.
- Rights states `BLOCKED`, `DENIED`, and `REVOKED` are filtered before consumer projection.
- Global object-set access requires wildcard incident scope.
- CWFIS transport is HTTPS-only, host-allowlisted, redirect-denied, body-bounded, feature-bounded, and region-bounded.
- Provider response timestamps, detection timestamps, publication timestamps, and receipt timestamps remain separate.
- Doctrine configuration rejects cycles, unknown policy/capability references, and authority-free consequential escalation.
- Shadow records hard-code zero consequential actions.

## Adversarial coverage

Dedicated tests cover event duplication and identity collision, simultaneous acquisition, optimistic revision races, failed transaction rollback, lineage corruption, archive predecessor failure, rights revocation, authority and source-health degradation, scope escape, cursor corruption, consistency-token substitution, malformed CWFIS bounds, false publication time, doctrine cycles, unsafe escalation, packet/outcome foreign keys, Information Value uniqueness, restart, replay, and partial response signaling.

The isolated PostGIS certificate additionally injects failure before transaction work, after event insertion, before and during projection update, after action planning, before receipt persistence, during lineage persistence, and during materialization. Every injected transaction rolls back without a partial trusted row. Concurrent duplicate events, controller reconciliation, Data Product acquisition, optimistic updates, and stale packet/history reads converge or fail closed.

Proof Plane tests additionally cover credential expiry, revocation TOCTOU, cross-incident escalation, delegation bounds, key rotation, device compromise, proof replay, and trust-policy mutation.

## Remaining deployment controls

Postgres race execution, file↔database semantic equivalence, database backup/restore, and measured local RPO/RTO now pass in isolated certification. This does not certify managed production infrastructure, replication, regional failover, operator identity-provider integration, or real emergency-practitioner validation.
