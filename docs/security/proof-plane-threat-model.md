# Proof-plane threat model

Scope: proof verification, organization authority, capability/delegation, device and session trust, Event Fabric admission, controller execution, revocation, transparency receipts, and replay. This is an implementation-oriented threat model, not a certification claim.

## Assets and boundaries

Assets are private signing keys outside VIGIA, trust-root and revocation registries, credentials, signed requests, device attestations, sessions, capability scope, operational evidence, controller actions, quarantine records, and receipt history.

Untrusted boundaries are public provider input, FieldNet and sensor transport, user/service requests, serialized proof bundles, external identity adapters, cached verification results, and replay material. The in-process opaque controller context is trusted only while its object identity is registered by the same `ProofPlaneService` instance; serialized caller JSON is never accepted as authority.

## Material threats and controls

| Threat | Control | Residual limitation |
| --- | --- | --- |
| Forged or mutated actor/statement | Ed25519 verification over domain-separated canonical statement; statement and envelope fingerprints are recomputed | Trust-root provisioning remains an operator responsibility |
| Replay or reordered request | Principal/session nonce set plus monotonic sequence; transport-level FieldNet/sensor replay defenses remain | Durable distributed nonce storage is not yet implemented |
| Expired, revoked, or compromised credential/key/device/session | Time-aware registry checks at admission and immediately before execution; `compromisedSince` semantics | Revocation distribution latency is external to this repository |
| Cross-incident, resource, geography, or action-class escalation | Exact capability-scope evaluation with deny-by-default matching | Polygon/geodesic scope beyond bounding boxes is not implemented |
| Delegation escalation | Explicit parent credential, subset check, finite depth, and time window | Multi-hop graph discovery is not yet a persistent service |
| Confused deputy | Principal/credential/session/device equality; per-capability FieldNet command check; opaque controller context | Cross-process capability tokens require a future protocol |
| Soft-risk authority creation | Continuous trust only restricts the independently derived base authority decision | Risk signal collection remains adapter-owned |
| Attestation downgrade | Sensitivity-to-minimum-level policy and explicit step-up result | Test attestation is deterministic/signed but is not hardware attestation |
| Unsigned privileged event admission | Proof-aware Event Fabric quarantines unsigned non-public sources | Existing deployments without a configured proof plane retain legacy behavior |
| Public observation gaining authority | `PUBLIC_OBSERVATIONAL` zone always records `authority: NONE` | Source classification must be governed correctly |
| Quarantine satisfying evidence | Quarantined records never enter the operational journal/projection | A future persistent quarantine store is needed |
| Controller bypass | Configured control plane requires an opaque context and rechecks every action capability | Legacy mode remains for existing tests/deployments that do not configure the proof plane |
| Revocation race / TOCTOU | Authority and revocation are re-evaluated after `STARTED` persistence and immediately before executor invocation | Remote executor handoff will need its own proof protocol |
| Kill-switch bypass | Kill switch is evaluated in the same fail-closed safety chain before action start; consequential execution is separately absent | Distributed kill-switch propagation is not implemented |
| Cached verification ignoring revocation | No authorization result cache bypasses dynamic revocation; every execution recheck uses the current registry fingerprint | Performance optimization must preserve this invariant |
| Key rotation breaking history | Trust root is resolved at signed statement issue time; registry keeps rotation lineage | Long-term archival of external trust roots is deployment work |
| Trust policy rewriting history | Every decision and replay binds the policy fingerprint; policy changes require `trust-policy:modify` | Persistent policy receipt storage is not yet wired to a database |
| Receipt deletion/substitution | Dedicated-key Ed25519 signatures, sequence numbers, previous hashes, decision hashes, replay hash | In-memory service storage is not durable/WORM |
| Source revocation erasing history | As-of replay uses revocation knowledge at that time; current evidence filters revoked sources; control audit stays visible | Historical UI/API comparison is not added here |

## Abuse-case answers

- A low-privilege user cannot borrow a controller or command service's capability: the original principal and scoped grant are checked at the sink.
- A device cannot silently claim another device: action, session, registered identity, and attestation must bind the same device and principal.
- An attestation downgrade returns step-up or denial; it is never normalized upward.
- A controller cannot turn a valid reconciliation credential into consequential execution: the capability must be present and external consequential execution still remains disabled.
- A valid signature from an untrusted or out-of-window key is not authority.
- An authority decision from before a later revocation remains provable as a historical decision, while current operation uses the new revocation state.

## Verification evidence

`npm run test:proof-plane` covers forgery, mutation, replay, expiry, revocation, compromised-since, cross-incident escalation, delegation escalation, soft-risk non-escalation, device downgrade/compromise, confused deputy, policy modification, signed receipts, replay substitution, proof-aware evidence admission, proof-bound controller operation, consequential disablement, and a revocation race at execution.

`npm run demo:proof-plane` is a 22-step executable scenario. `npm run benchmark:proof-plane` measures the required proof, cryptographic, capability, continuous-trust, revocation, and replay workloads.
