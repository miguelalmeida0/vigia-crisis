# VIGIA Agent 2 / Agent 1 collision addendum

Status: anticipated collisions only. This branch does not resolve them, access the protected sibling worktree, or invent Agent 1 implementation details. The integration branch owns final evidence-backed decisions.

Principles:

- `AGENT1_AUTHORITATIVE`: preserve Agent 1 implementation/contract and adapt Agent 2.
- `AGENT2_AUTHORITATIVE`: preserve Agent 2 semantics and adapt consumers.
- `MERGE_REQUIRED`: create one reviewed canonical implementation from both.
- `ADAPTER_REQUIRED`: keep boundaries distinct and translate explicitly.
- `RETIRED_AFTER_CONVERGENCE`: preserve only during transition, then remove after migration/replay proof.

| Collision surface | Proposed principle | Integration decision/evidence required |
|---|---|---|
| Migration IDs and schema head | `AGENT1_AUTHORITATIVE` for applied `017–021`; `MERGE_REQUIRED` for new head | Import exact Agent 1 checksums, inspect Agent 2 017 objects, renumber additive convergence above 021, prove upgrades from both databases. `REQUIRES_INTEGRATION_BRANCH_DECISION`. |
| Incident canonical model | `MERGE_REQUIRED` | Select one canonical incident ID, jurisdiction/status/time model; publish crosswalks and replay both identity histories without silent reassociation. |
| Event storage | `MERGE_REQUIRED` | Reconcile Agent 1 command/event stream with Agent 2 `intelligence_event`, raw/canonical events and journals; one authoritative append path, explicit projections. |
| Evidence Debt | `AGENT2_AUTHORITATIVE` semantics; `ADAPTER_REQUIRED` for Operator API | Preserve closure-contract, causal eligibility, opportunity and decision-block semantics; map into Agent 1 work/UX without frontend recomputation. |
| Source state/cursors | `AGENT2_AUTHORITATIVE`; `RETIRED_AFTER_CONVERGENCE` for duplicates | Choose one provider state writer/cursor per source, preserve historical health, dedupe raw identities, retire parallel pollers only after resume proof. |
| CAP | `MERGE_REQUIRED` | Preserve Agent 1 delivery/browser lifecycle guarantees and Agent 2 canonical CAP provenance/update-cancel semantics; one lifecycle/API projection. |
| FieldNet evidence | `MERGE_REQUIRED` | Preserve Agent 1 reserve/accounting/offline guarantees and Agent 2 Evidence Contract/Proof Plane/source-device trust; prove no duplicate witness inflation. |
| Replay | `AGENT2_AUTHORITATIVE` for knowledge-time/evidence/decision verification; `ADAPTER_REQUIRED` for Agent 1 UI replay | One cutoff vocabulary and identity; replay may not mutate live state or bypass rights/session constraints. |
| Trust and authority | `MERGE_REQUIRED` | Map Agent 1 roles/session enforcement to Agent 2 capabilities, device proof, continuous trust and compartments; deny on disagreement. |
| Session/user identity | `AGENT1_AUTHORITATIVE`; `ADAPTER_REQUIRED` | Agent 1 authenticates sessions/users; translate authenticated principals/org/scopes into Agent 2 proof/capability inputs without trusting UI role labels. |
| Operator API | `AGENT1_AUTHORITATIVE` transport; `AGENT2_AUTHORITATIVE` intelligence semantics | Expose Agent 2 snapshots/packets through one canonical Agent 1 API; deprecate duplicate intelligence routes only after consumer contract tests. |
| Release manifests | `MERGE_REQUIRED` | One release ID must bind browser, API, FieldNet, schema head, image digest, SBOM, migrations and consumer contracts; reject stale/pre-finalizer evidence. |
| Browser release contract | `AGENT1_AUTHORITATIVE` | Preserve Agent 1 browser/session/map compatibility and fail-closed release handshake. Update database head through authorized integration work, not in this branch. |
| Docker/Compose | `MERGE_REQUIRED` | One network, database volume, secret mechanism, health gates and immutable images; no local-only password in deployable profile. |
| Backup/restore | `MERGE_REQUIRED` | Combine Agent 1 operational backup guarantees with Agent 2 database, archive, Decision Memory, receipt and replay validation; prove RPO/RTO. |
| Runtime ports | `AGENT1_AUTHORITATIVE` unless integration assigns new canonical ports | Inventory bind addresses/ports for browser, API, FieldNet, PostGIS and workers; fail on collision and update all health/release contracts together. |
| Raw vault and prospective archive | `AGENT2_AUTHORITATIVE`; `ADAPTER_REQUIRED` | Preserve content hashes, rights, provider clocks and append-only sequences; Agent 1 references them through stable IDs, never copies raw evidence into UI state. |
| Frontend-derived intelligence | `RETIRED_AFTER_CONVERGENCE` | Any Agent 1 UI logic that derives evidence, authority, source health, perimeter authority, forecast applicability or rights must be replaced by Agent 2 consumer fields. |

## Convergence sequence

1. Produce an Agent 1 compatibility manifest: commit, migrations 017–021 filenames/checksums, schema head, API schemas, browser identity, ports, container/backup contracts.
2. Diff names and semantics against the Agent 2 migration and consumer inventories.
3. Decide each row above on the integration branch and record the decision owner/evidence.
4. Add only migrations above Agent 1 021; never overwrite a numeric ID or checksum.
5. Build adapters before retiring duplicate stores/routes.
6. Run the full acceptance matrix from both database/runtime starting points.
7. Retire transition adapters only after replay, browser, FieldNet, security, recovery and design acceptance all pass.
