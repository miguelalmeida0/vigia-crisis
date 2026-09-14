# Existing Intelligence Capability Map

VIGIA Intelligence Fabric V1 extends the existing governed domain. It does not create a second evidence model.

| Existing object or capability | Owner module | Persistence | Reuse decision | V1 extension |
|---|---|---|---|---|
| Fire event graph and incident association | `fire-event-tracker.mjs`, `event-association*.mjs`, `FireEventService` | PostGIS physical truth plus bounded event projection | Reuse as the canonical incident/evidence graph | Bind intelligence snapshots to the event version and evidence graph hash |
| Physical observations and raw source products | `physical-observation.mjs`, `EventObservationRepository`, `AcquisitionStore` | PostGIS plus immutable raw archive | Reuse without copying observations into intelligence tables | Reference observation and product IDs in support, exclusion, and explanation traces |
| Public reports | Fire event normalization and fusion | PostGIS physical truth | Reuse as report evidence, never as a physical family | Add report-only and physical/report-conflict situation rules |
| Evidence fusion and fire truth state | `evidence-fusion.mjs`, `fire-evidence-state.mjs`, `fire-truth-state.mjs` | Reconstructable event projection | Reuse conclusions and governed family/dependency boundaries | Produce a concise deterministic situation projection |
| Evidence needs and debt | `evidence-need.mjs`, `EvidenceNeedService`, validation debt modules | Operator state mirrored to PostGIS | Reuse lifecycle, owner, request, and closure bindings | Classify unresolved unknowns by deterministic decision impact |
| Evidence requests | `evidence-request.mjs`, `EvidenceRequestService` | Operator state mirrored to PostGIS | Reuse authorization and lifecycle | Reference active acquisition work; never create work without authority |
| Next-best evidence and observation opportunities | `next-best-evidence.mjs`, `observation-opportunity.mjs`, `ObservationOpportunityService` | Configured schedules and PostGIS opportunity records | Reuse eligibility, availability, coverage, and owner contracts | Rank only real eligible candidates against material unknowns |
| Coverage intelligence and evidence race | `coverage-intelligence.mjs`, `evidence-race.mjs` | Reconstructable projection | Reuse measured coverage and timing facts | Feed source passport and TDT stages where attributable |
| Source health | `source-health.mjs`, world/source gateways | Runtime source state and acquisition checkpoints | Reuse health/freshness semantics | Keep provider availability separate from incident evidence |
| Incident decision ledger | incident-command event stream and audit service | Immutable PostGIS event ledger | Reuse command facts and human-decision authority | Add version-bound operator intelligence decisions without changing command authority |
| Decision delta | `apps/operator-console/src/decisionDelta.js` | Bounded operator session state | Reuse UI change vocabulary | Add canonical server-side fact/recompute/human distinction |
| Replay | `ReplayService`, Portugal replay corpus | Official archive and PostGIS retained products | Reuse governed clock and future-evidence policy | Recompute intelligence from evidence visible at replay time only |
| Handoff snapshots | `operationalExports.js` | Integrity-bound operator export | Reuse current/stale/unavailable separation | Include only material intelligence changes and blocking unknowns |
| PREVENT findings | prevention finding and measurement-debt services | Operator state, review corpus, validation artifacts | Reuse measurement and review boundaries | Project measurement-required unknown and next governed evidence |
| FieldNet state | `CentralFieldNetService`, incident-command reconciliation | Bounded ledger/archive plus PostGIS command state | Reuse conflict, sync, and ownership boundaries | Emit FieldNet reconciliation deltas and source context |
| Operator corrections | `EventCorrectionService` and audit ledger | Durable operator/audit state | Reuse correction authority and provenance | Invalidate affected projection and classify the resulting delta as `CORRECTION` |

New persistence is limited to immutable intelligence snapshots and version-bound operator intelligence decisions. Intelligence remains a projection over the objects above and never enters the physical observation graph.
