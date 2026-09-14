# Autonomous Crisis Decision Foundry baseline

Captured on 2026-08-24 in `/Users/malmeida/Documents/Development/vigia-intelligence` on `feat/vigia-intelligence-foundation` before Decision Foundry implementation.

| Current capability | Preserved boundary | Extension required | Reason |
|---|---|---|---|
| Crisis Ontology and Evidence Graph | Canonical objects, causal lineage, evidence qualification, contracts and debt remain authoritative | Add hazard-configured hypotheses that reference canonical evidence IDs without becoming evidence | Competing explanations must not create a parallel truth model |
| Event Fabric and Operational Twin | Append-only events, knowledge-time projection, incident association and material transitions remain authoritative | Compile an immutable decision view from an explicit twin snapshot and cutoff | Decision reasoning must inherit the existing bitemporal truth boundary |
| Policy Engine and Control Plane | Versioned pure policy decisions, desired state, action budgets, idempotency, receipts and consequential-action guard remain authoritative | Add decision-dependency compilation and decision-aware acquisition work only | The new layer may propose bounded information acquisition but may not bypass policy or authority |
| Proof Plane | Capability grants, continuous trust, Ed25519 proof, revocation and replay remain authoritative | Bind Decision Packets and acquisition tasks to existing proof references and exact capabilities | Internal workers must not gain ambient authority |
| Reality Network | Trusted endpoints, provider manifests, health, causal independence, opportunity and rights remain authoritative | Add source marginal-value and discriminator eligibility views | Provider volume and republishing must not masquerade as independent value |
| Forecasting Plane | Issue-time manifests, abstention, baselines, metrics and action prohibition remain authoritative | Add contract counterfactuals and bounded baseline safety envelopes | Forecast output remains non-evidence and uncalibrated output remains non-probabilistic |
| Corpus Foundation | Bronze/Silver/Gold, knowledge-time construction, splits, leakage, readiness and replay remain authoritative | Add label/progression stability analysis, split feasibility and strategic negative-opportunity value | Decision Foundry must improve the corpus without weakening scientific gates |
| Crisis Data Foundry | 55 products, 78 versions, 11 packages, 100-node/148-edge lineage, 881 gaps, six eligible actions and deterministic replay remain authoritative | Add decision dependencies, explicit information value, active plans, object sets and decision replay | A missing product must be connected to the operational decision it blocks |
| File-backed runtime and PostGIS port | Portable atomic state is the active certified runtime; the existing PostGIS adapter remains the production port | Persist Decision Foundry reports/snapshots atomically and keep PostGIS certification external | Database authentication must not be weakened |
| Existing 100 negative candidates | Preserve all as `UNKNOWN`/uncertified with their provenance | Build an atlas and executable certification contract; never infer absence from zero rows | Valid negatives and hard negatives remain zero |
| WFIGS/FEDS sequences | Preserve original geometry, clocks, classifications and causal relationship | Classify revision semantics and reject noncausal, invalid or implausible progression states | Current sequences contain clock and geometry instability |
| Two certified HRRR slices and two LANDFIRE context packs | Preserve trusted Rasterio/GDAL decoding, source hashes, cutoff applicability and datum certification | Add availability graph and scale-readiness views; do not fabricate gust or unavailable layers | Weather/context completeness must remain product- and issue-time-specific |
| Existing backend consumer contracts | Frontend never recalculates readiness, evidence or policy truth | Add `vigia.crisis-decision-packet.v1` and explainable object-set snapshots | No frontend source work is authorized |

## Reproduced measured state

- Intelligence Foundation: 78/78 passed.
- Event Fabric/Twin: 7/7 passed.
- Control Plane: 16/16 passed.
- Proof Plane: 14/14 passed.
- Reality Network: 12/12 passed.
- Forecasting Plane: 19/19 passed.
- Corpus Foundation: 11/11 passed.
- Crisis Data Foundry: 18/18 passed.
- Corpus readiness: `CORPUS_NOT_READY`.
- Eligible incidents: 2; regions: 1; seasons: 2; Gold examples: 11.
- Horizon counts: 1h 0, 3h 0, 6h 1, 12h 3, 24h 7.
- Valid negatives: 0; valid hard negatives: 0; calibration examples: 0.
- No tracked frontend source diff exists under `apps/operator-console` or `apps/web`.

This vertical will extend these boundaries. It will not rewrite them or weaken their gates.
