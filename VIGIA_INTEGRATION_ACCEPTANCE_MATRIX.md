# VIGIA integration acceptance matrix

No row is accepted by assertion. The integration branch must attach command output, release/schema fingerprints, and an accountable reviewer. `PASS` means reproducible from a clean checkout or approved state transfer; `BLOCKED` must name the external prerequisite.

## Schema

| Acceptance | Required proof | Status before integration |
|---|---|---|
| One migration DAG | Ordered manifest and checksum ledger, no branches or rewritten history | `REQUIRES_INTEGRATION_BRANCH_DECISION` |
| One schema head above Agent 1 021 | Head is newly numbered above 021 and published in release contract | Not attempted |
| No duplicate migration IDs | Automated ID/name/checksum uniqueness check | Not attempted |
| Clean migration from Agent 1 release DB | Backup copy → integrated migrate → schema/repository tests | Blocked on Agent 1 DB/manifest |
| Clean migration from Agent 2 certification DB | Agent 2 head 017 DB → integrated migrate → semantic equivalence | Not attempted |
| Forward recovery | Interrupted/failing migration rollback plus corrected forward migration | Not attempted |
| Backup/restore | Restore events, objects, archive, packets/outcomes/receipts; rebuild projections; RPO 0 target and recorded RTO | Agent 2-only proof passed; combined pending |

## Intelligence

| Acceptance | Required proof | Status before integration |
|---|---|---|
| Evidence Contracts | Version/fingerprint pinning, qualification/exclusion, transition and debt tests | Agent 2 passed; combined pending |
| Causal Evidence Quorum | Duplicate/republisher/common-mode evidence cannot inflate independent family counts | Agent 2 passed; combined pending |
| Operational Twin | Deterministic event projection, relationship/incident association and replay | Agent 2 passed; combined pending |
| Decision Packet | v1 packet hash/proof/storage/rights and consumer delivery | Agent 2 passed; API integration pending |
| Decision Delta | Correct before/after knowledge time and causing products/revisions | Agent 2 passed; UI integration pending |
| CAP | Canonical parse, provenance, update/cancel/reference lifecycle and official-not-physical separation | Agent 2 passed; combined gateway pending |
| Authoritative truth | Revision classification, conflicts, official-only label gates and honest time accumulation | 14/14 targeted pass; official 1h/3h remain 0 |
| Source health | Healthy-zero vs evidence, staleness, outage/recovery, cursor/restart | Agent 2 passed; one canonical writer pending |
| Replay | No future evidence, chain/fingerprint/backup restore equality | Agent 2 passed; combined pending |

## FieldNet

| Acceptance | Required proof | Status before integration |
|---|---|---|
| Reserve/accounting invariants | Agent 1 complete invariant suite against integrated API/schema | Blocked on Agent 1 handoff |
| No duplicate evidence | Offline retry/merge/dedupe cannot create a second causal witness | Agent 2 proof boundary passed; combined pending |
| Proof Plane compatibility | Field receipt/proof verifies centrally and survives replay/revocation | Agent 2 tests passed; combined pending |
| Correct source/device trust | Device attestation, principal/org/incident scope, source identity and step-up/deny | Agent 2 tests passed; Agent 1 identity mapping pending |

## Operator

| Acceptance | Required proof | Status before integration |
|---|---|---|
| One canonical API | All ten screens use the accepted Operator API and versioned Agent 2 consumer contracts | Pending |
| No frontend reasoning | Static/runtime tests prove prohibited calculations are absent | Pending; current Agent 2 changed no frontend source |
| Real map/perimeter data | Source/authority/provenance/time shown; no fixture/generated substitute | Pending integrated browser run |
| Loading/stale/partial/unavailable | Each state and reason exercised on every affected screen | Pending |
| Knowledge-time replay | Cutoff changes snapshot without future leakage or live mutation | Backend passed; browser pending |
| Authority boundary | Deny/step-up/quarantine/rights/disabled consequential actions are enforced server-side and rendered | Backend passed; browser pending |

## Reliability

| Acceptance | Required proof | Status before integration |
|---|---|---|
| Agent 1 browser/session/map guarantees | Agent 1 suite and release contract pass unchanged or with reviewed updates | Blocked on Agent 1 handoff |
| Agent 2 database/replay guarantees | `npm run db:certify-intelligence`, truth replay, backend tests | Passed on Agent 2 head |
| Combined soak | API, workers, providers, FieldNet and browser under restart/degradation for agreed duration | Pending |
| Combined deployment/recovery | Immutable images/SBOM, canary, rollback, DB/runtime restore and fingerprints | Pending; prior image is not final commit image |
| Combined security | Auth/session/capability/compartment/rights/SSRF/secrets/tenant isolation and revocation | Pending; proposed RLS is not active |

## Design

| Acceptance | Required proof | Status before integration |
|---|---|---|
| Exact locked design | Visual comparison against the approved source at required breakpoints | Pending; no frontend work in this release |
| All ten routes | Command Overview, Incidents, Incident Detail, Intelligence & Evidence, Evidence Debt, Operations, Authority & Trust, Control Plane, Reports & Analytics, Global Situational Awareness | Pending |
| No placeholder operational content | Every operational datum has a real backend contract/provenance or an explicit unavailable state | Pending |
| All controls wired | Every enabled control invokes an authorized backend command and exposes receipt/outcome | Pending |
| Responsive/accessibility | Keyboard, focus, semantics, contrast, text scaling, reduced motion and required viewport suite | Pending |

## Minimum integration command set

The integration branch may add exact compatibility commands, but it may not omit these foundations:

```bash
npm run db:up
npm run db:migrate
npm run db:certify-intelligence
node --test apps/api/test/authoritative-truth-network.test.mjs
npm run truth-network:replay
npm run test:proof-plane
npm run test:backend-convergence
npm run test:worldclass
npm test
npm run check
docker build --file infra/Dockerfile.api --tag vigia-integrated-backend:acceptance .
```

Acceptance additionally requires a fresh immutable image digest, SPDX SBOM, secret/rights scan, Agent 1 browser/session/map suite, all ten route/browser tests, FieldNet invariant suite, and combined restore/soak evidence. The known protected frontend baseline failure is not acceptable on the final integration branch; it remains tolerated only as an unchanged pre-integration baseline in this Agent 2 release.
