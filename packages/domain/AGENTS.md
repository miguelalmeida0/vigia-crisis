# packages/domain/AGENTS.md

## Scope
This package owns shared VIGIA domain contracts, invariants, event-fabric behavior, deterministic projections, identities, and decision logic.

## Local rules
- Read `../../docs/agent/truth-safety.md` before changing incident identity, event semantics, projection/fingerprint material, evidence state, source classification, or demo/production boundaries.
- Keep domain logic deterministic and independent of presentation concerns.
- Preserve established schemas, identities, ordering, hashing/fingerprint semantics, and backward compatibility unless the task explicitly changes the contract.
- Equivalent domain inputs must produce equivalent deterministic outputs. Do not let accidental object-reference topology affect hashes, identities, or persistence semantics.
- Do not suppress legitimate conflicts globally to make a fixture/demo path pass; fix the narrow caller or domain bug proven by tests.
- Add regression tests for changed invariants, including unsafe/conflicting cases where relevant.

## Validation
Run the nearest domain tests first. Broaden to intelligence/integration tests when the changed invariant is consumed across package or API boundaries.
