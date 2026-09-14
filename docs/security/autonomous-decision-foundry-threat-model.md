# Autonomous Decision Foundry Threat Model

## Assets and trust boundaries

Protected assets are operational evidence, knowledge-time history, policy versions, authority grants, source lineage, acquisition budgets, Data Product Versions, negative labels, split manifests, Decision Packets, proofs and replay records. Provider bytes cross an untrusted boundary and continue through the existing bounded Bronze/contract/quality/rights pipeline. Counterfactuals and forecasts occupy non-evidence namespaces.

## Principal threats and controls

- Malicious hypothesis configuration: definitions accept bounded uppercase tokens only; arbitrary functions and oversized lists fail.
- Policy or hypothesis substitution: definition fingerprints and packet/replay fingerprints bind evaluated semantics.
- Counterfactual injection: only an allowlisted contract type is accepted; `evidenceAdmissions` is empty and graph-leak verification is mandatory.
- Rights or coverage bypass: planner states are derived before selection and reconciliation repeats the safety checks.
- Causal laundering: marginal value deduplicates root measurements; FEDS and FIRMS-derived VIIRS cannot count as two physical families.
- SSRF or provider URL injection: reconciliation selects repository-defined provider identities and creates bounded tasks; no candidate-supplied URL is executed.
- Acquisition budget bypass or retry loop: complete budgets are mandatory and provider/task attempts are bounded.
- Privilege escalation: machine grants are scoped by incident, resource, action and validity time, and are non-delegable.
- Geometry and GRIB attacks: shell-free bounded subprocesses, safe real paths, input ceilings, mature parsers and quarantine on invalidity.
- Hindsight and split leakage: availability cutoffs and causal-isolation split groups cover incidents, original observations, republishers, persistent sites and near-duplicate geometries.
- Packet/hash/replay substitution: signed proof, input hash, packet hash, graph hashes, plan hash and proof fingerprint are verified independently.
- Concurrent duplicate work: semantic PipelineTask identity makes repeated scheduling idempotent.

## Consequential action boundary

Shadow compilation may explain a warning proposal but cannot authorize it. `PROPOSE_OFFICIAL_WARNING` requires the impact fact, independent physical corroboration, a sufficiently supported wildfire hypothesis, an acceptable perimeter and an explicit capability. Retained demonstrations provide none of the missing authority. Unsafe actions executed must remain zero for shadow readiness.

## Residual risk

The local file-backed state store provides semantic idempotency but is not a certified PostGIS transactional deployment. Cross-process serialization and the PostGIS transaction path remain deployment gates. External provider archives, rights and timestamp claims remain untrusted until captured in signed contracts.
