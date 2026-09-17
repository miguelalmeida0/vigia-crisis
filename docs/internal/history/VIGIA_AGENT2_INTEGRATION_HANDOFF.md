# VIGIA Agent 2 integration handoff

Status: sealed engineering release candidate. This document is a handoff, not authorization to merge, deploy, resume acquisition, or enable consequential execution.

## Release identity

| Item | Sealed value |
|---|---|
| Backend release ID | `vigia-agent2-intelligence-2026.08.25-rc1` |
| Annotated tag to be created after the commit | `vigia-agent2-backend-2026.08.25-rc1` |
| Expected pre-commit HEAD | `124ac703d2ffcb2569db64b8db1955ce2a2363a4` |
| Code fingerprint | `sha256:ae3ed4f083b0e4e550a39c3d80dd9a9357634dde8f2bee0b737adc5d4e3226d3` (authoritative value is in `AGENT2_RELEASE_IDENTITY.json`) |
| Migration head | `017` / `vigia-postgis-017` |
| API/domain schema identity | `vigia-api-v10.4`; `vigia-domain-v10.4`; operations `operations-api-v6`; validation `validation-api-v8`; FieldNet `fieldnet-api-v5` |
| Ontology | Crisis ontology objects and source-family classes in `packages/domain/src/intelligence/ontology/objects.mjs`; release identity `vigia-domain-v10.4` |
| Evidence Contracts | `vigia.evidence-contract.v1`; wildfire live contract `wildfire-live-reality@2` |
| Policy versions | wildfire control policies `1.0.0`; Decision Foundry doctrine `VIGIA_WILDFIRE_OPERATIONS@2.0.0`; decision priority `VIGIA_DECISION_PRIORITY@2.0.0`; official-truth doctrine `2026-08-25.1` |
| Trust-policy versions | proof-plane schemas v1; compartment policy is proposed migration 019 only and is not active on this branch |
| Decision Packet | `vigia.crisis-decision-packet.v1`; authoritative truth packet `vigia.authoritative-truth-decision-packet.v1` |
| Consumer snapshots | `vigia.operational-intelligence-snapshot.v2`; `vigia.reality-consumer-snapshot.v1`; `vigia.forecast-consumer-snapshot.v1`; `vigia.authoritative-truth-operator-consumer-snapshot.v1`; data-foundry snapshots v1 |
| Docker image evidence | Prior bounded image only: `vigia-scientific-truth-1709222c2115ab87-api@sha256:d46039e1eed3f310130434cae5bba72796a1d2b4a260698270bfa992f08a20f0`, linux/arm64. It predates this finalizer and must not be represented as the final commit image. |
| SBOM reference | Prior image SPDX 2.2 fingerprint `image-spdx-sbom:sha256:b07c26395ba5b56172dba53d1816f2060db4d1da3fefbb482e6ceb78d3466ffa`; local evidence is in the never-stage `data/validation/scientific-truth-closure/release-images.json`. Rebuild and regenerate an SBOM from the committed tag before deployment. |

`AGENT2_RELEASE_IDENTITY.json` is the machine-readable authority for release identity. A digest from a pre-finalizer image is evidence of an earlier build, not proof that the future commit produced the same image.

## Architecture ownership

Agent 2 owns the following implementation boundaries in this release:

| Capability | Owned implementation |
|---|---|
| Crisis Ontology | `packages/domain/src/intelligence/ontology`, shared intelligence objects and state vocabulary |
| Evidence Graph and Evidence Contracts | `packages/domain/src/intelligence/evidence`, `contracts`, `evaluation`, `debt`, and replay |
| Event Fabric | `packages/domain/src/event-fabric`; API journal and operational-intelligence service |
| Operational Twin | `packages/domain/src/operational-twin` |
| Data Products and Data Foundry | `packages/domain/src/data-foundry`; `apps/api/src/modules/data-foundry` |
| Decision Foundry | `packages/domain/src/decision-foundry`; `apps/api/src/modules/decision-foundry` |
| Forecasting and historical corpus | `packages/domain/src/forecasting`, `forecast-corpus`; matching API modules |
| Proof Plane, Continuous Trust, Authority | `packages/domain/src/proof-plane`; API proof-plane service and FieldNet proof authority |
| CAP | Event Fabric CAP adapter, Reality Network NWS CAP provider, and government CAP evidence/gateway services |
| Source registry and provider adapters | Event Fabric source registry; `apps/api/src/modules/reality-network` provider portfolio and adapters |
| Authoritative truth network | `apps/api/src/modules/authoritative-truth` and its bounded command script |
| Replay | intelligence, Operational Twin, Proof Plane, forecast, corpus, Reality Network, Decision Foundry, and authoritative-truth replay implementations |
| Query service | Decision Foundry object-set projection and `OperationalIntelligenceQueryServiceV2` |
| PostGIS storage | migration runner, migration 017, and Postgres intelligence repository |
| Prospective archive | knowledge-time archive model, Postgres `prospective_archive_snapshot`, corpus and truth-network capture logic |

Agent 1 retains its own frontend/browser/session and migrations 017–021 ownership until an integration branch performs the collision decisions described in the addendum. No ownership statement here overwrites Agent 1 history.

## Runtime dependency direction

`provider → content-addressed raw vault → canonical operational event → Event Fabric → Evidence Graph → Operational Twin → policy/Decision Foundry → versioned consumer snapshot`

Knowledge time, rights, provenance, causal lineage, authority, source health, and consistency tokens travel forward through that chain. Consumers may filter or render the delivered state but must not create a competing truth model.

Frontend code must consume backend results for causal independence, source-family counts, evidence state and debt, hypotheses, Decision Value and acquisition ranking, authority, trust, source health, perimeter authority, forecast applicability/abstention, provenance, knowledge time, and rights. It must never reconstruct any of those decisions from raw observations or presentation fields.

## Exact commands

Run from the repository root. Commands that use public providers remain bounded but depend on current network/provider availability.

| Purpose | Command | Last sealed result |
|---|---|---|
| Database startup | `npm run db:up` | Local PostGIS orchestration command; no credential weakening |
| Migrations | `npm run db:migrate` | Governed through 017 |
| Backend startup | `npm start` | API entry point `apps/api/src/server.mjs` |
| Provider doctor | `npm run providers:doctor` | Provider availability is diagnostic, not evidence |
| Reality Network | `npm run run:wildfire:reality -- --once` | Shadow-only run boundary |
| CAP acquisition | `npm run evidence:cap:acquire` | Government CAP evidence path; public/partner state remains explicit |
| Truth watcher resume | `npm run truth-network:watch -- --resume=authoritative-truth-20260825153724 --all-active` | Verified resumable campaign; do not run as part of finalization |
| Truth replay | `npm run truth-network:replay` | PASS; fingerprint `authoritative-truth-replay:sha256:568173948dfb9325dc0c38ac6839bfb05c61b221305c44eb9e84f5ea4e4e84f3` |
| Database certification | `npm run db:certify-intelligence` | PASS, migration 017, backup/restore and semantic equivalence passed |
| Targeted truth tests | `node --test apps/api/test/authoritative-truth-network.test.mjs` | 14/14 PASS |
| Complete tests | `npm test` | 762 total: 760 pass, 1 skip, 1 known protected frontend baseline failure; zero new backend regressions |
| Architecture check | `npm run check` | PASS |
| Backend image build | `docker build --file infra/Dockerfile.api --tag vigia-agent2-backend:release-candidate .` | Rebuild required from committed tag; record its immutable digest and a fresh SPDX SBOM |

## Current honest product limitations

- `AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED` is the correct state.
- There is no legitimate official 1-hour perimeter label and no legitimate official 3-hour perimeter label.
- Sensor-derived 1-hour and 3-hour progression labels exist only in their separate, explicitly non-official lane.
- Forecast evaluation and promotion remain blocked by missing official truth; the UI must not render a fake forecast polygon.
- Consequential execution remains disabled. Current authority boundaries permit analysis, shadow evaluation, and governed work only.
- Human operator validation is absent.
- Partner-private, bidirectional agency integration is absent.
- The latest image/SBOM evidence predates the final commit and therefore requires a post-commit rebuild.
- Runtime campaign and raw-vault state are local operational state, not Git content. Use the transfer plan or reconstruct it.
