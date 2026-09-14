# Autonomous Crisis Decision Foundry

## Boundary

The Decision Foundry is a deterministic backend compiler. It consumes an operational snapshot, evidence facts, Data Product Versions, policies, authority, source capabilities, Data Gaps, rights, health and explicit budgets. It emits `vigia.crisis-decision-packet.v1`. It does not call a language model, infer a probability, fetch provider data during pure evaluation, or execute consequential actions.

The preserved chain is:

```text
Operational Twin and Evidence Graph
  -> pure multi-hypothesis evaluation
  -> typed decision-dependency graph
  -> material unknowns and Data Gaps
  -> explicit Decision Value components
  -> bounded acquisition plan
  -> capability-authorized PipelineTask
  -> existing Data Foundry contracts, quality, rights and lineage
  -> pure recompilation and Decision Delta
  -> signed packet and deterministic replay
```

Counterfactuals are marked `CONTRACT_COUNTERFACTUAL`, admit zero evidence and cannot mutate operational truth. Forecast outputs remain forecast products, never physical corroboration. FEDS retains its VIIRS causal root and cannot become an independent witness through republication.

## Compiler products

The compiler emits hypotheses with support, contradiction, exclusion and unresolved discriminators; decisions with typed blockers; ranked acquisitions with every weight and component; source marginal value based on unique root measurements; an acquisition plan; lineage, rights, quality and proof references; and a replay fingerprint. The Ed25519 private key remains local with mode `0600`; packets expose only signed proof material.

The backend object-set boundary returns a query definition, filter doctrine, Data Product Version references, cutoff, results, exclusions and a result fingerprint. A consumer must render these products without recalculating operational semantics.

## Safety invariants

- Hypothesis configurations contain bounded tokens, not executable predicates.
- An unsupported hypothesis cannot be admitted as evidence.
- Missing budgets fail closed.
- Rights, coverage, source health, causal duplication and observation-opportunity blockers precede scheduling.
- Capability grants are incident- and action-scoped and non-delegable.
- Consequential warning work requires explicit authority and remains blocked in retained demonstrations.
- Task identity is semantic and idempotent.
- A packet binds compiler inputs, hypothesis graph, decision graph, acquisition ranking and proof.
- Geometry is normalized and assessed by Shapely and PyProj; invalid rows are quarantined.
- Revision corrections, clock anomalies and unsafe extrapolations cannot silently become future labels or growth baselines.

## Readiness distinction

Decision Foundry shadow readiness is independent of forecast-corpus promotion. A deterministic system may safely explain and block work while the corpus remains scientifically insufficient. Corpus gates are never averaged into a score and model training remains prohibited while critical gates fail.
