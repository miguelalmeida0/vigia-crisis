# VIGIA proof plane

Status: implemented foundation, 2026-08-24.

## Trust doctrine

Privileged trust starts with a valid Ed25519 signature over a deterministic, domain-separated statement. It then requires an effective issuer key, a non-revoked credential, an exact principal/session/device binding, a scoped capability, and a current trust-policy decision. Soft risk may preserve, limit, require step-up, deny, or quarantine independently proven authority. It cannot create authority.

The proof plane distinguishes:

- principal: a human, service, controller, device, or organization that can sign or be the subject of a credential;
- organization: the institutional boundary on whose authority a credential is issued;
- role: a named organizational grouping which may reference capability templates;
- capability grant: an explicit permission with organization, incident, resource, action-class, geography, and time bounds;
- delegation: a bounded subset of a delegator's grants with a finite depth and validity window;
- device identity and attestation: the registered device-to-principal binding and signed attestation claim;
- session: an organization-issued principal, credential, device, and channel binding;
- proof envelope: the signed statement, key reference, signature, nonce, and sequence;
- authority decision: the deterministic result of hard proof, capability, device, session, and continuous-trust evaluation;
- transparency receipt: a dedicated-key Ed25519 receipt in a hash-linked sequence.

## Decision flow

```text
canonical request fingerprint
  -> signed action/evidence statement
  -> trust-root and Ed25519 verification
  -> time and revocation checks
  -> credential subject/organization binding
  -> session/credential/device binding
  -> device attestation requirement
  -> capability and exact scope
  -> continuous-trust restriction
  -> AUTHORIZED | STEP_UP_REQUIRED | LIMITED | DENIED | QUARANTINED
  -> signed transparency receipt
```

Control execution adds safety, budget, circuit-breaker, and cooldown checks. Authority is re-evaluated immediately before execution. A fully authorized consequential action is recorded as `AUTHORIZED_BUT_EXECUTION_DISABLED`; the external executor remains unavailable and no consequential effect is emitted.

## Proof envelope

`vigia.proof-envelope.v1` wraps `vigia.signed-statement.v1`. The signed statement binds the statement type, issuer, principal, organization, subject, payload, capability request fingerprint, scope, credential references, device, session, issue/not-before/expiry times, nonce, monotonic sequence, and key ID. The signature material is:

```text
VIGIA::SIGNED_STATEMENT::v1\n<stable canonical JSON>
```

Node's built-in Ed25519 implementation performs signing and verification. Repository tests and demos generate ephemeral keys explicitly marked TEST ONLY. No production private key is committed.

## Trust roots and adapters

Trust roots are versioned key records with issuer, organization, usages, validity, rotation lineage, and fingerprints. Historical verification resolves the key at statement issue time. Revocation knowledge is evaluated as of the requested replay time; `compromisedSince` invalidates statements at or after the compromise boundary once that revocation is known.

The adapter boundary recognizes future `W3C_VC`, `VLEI`, `EIDAS_WALLET`, `WEBAUTHN`, and `RATS_EAT` integrations. An adapter result explicitly sets `complianceClaimed: false`. This foundation does not claim conformance, certification, or legal equivalence for those ecosystems.

## Trust zones

- `PUBLIC_OBSERVATIONAL`: unsigned public evidence allowed by source policy, with no institutional authority.
- `PROVENANCE_BOUND`: a statement bound to attributable provenance but not yet organization-authorized.
- `CRYPTOGRAPHICALLY_VERIFIED`: signature and issuer key verified.
- `ORGANIZATION_AUTHORIZED`: credential, session, device, capability, scope, and current trust permit the statement.
- `PRIVILEGED_OPERATIONAL`: a proof-bound internal control record derived from an opaque verified controller context.

Unsigned physical, official, human-field, or system input is quarantined when the proof plane is enabled. Quarantined input is not appended to the operational journal and cannot satisfy an Evidence Contract.

## Revocation and current evidence

Ordinary revocation takes effect at its recorded/effective boundary. A replay before that boundary preserves the historical decision. Current projection filters evidence whose credential or device is now revoked. `compromisedSince` filters evidence created at or after the compromise time. Hash-linked control/audit records remain visible so a later revocation cannot erase what the system previously decided.

## Machine principals

FieldNet retains its HMAC transport integrity and local nonce defense. When a proof plane is configured, each incident-scoped sync also requires a signed machine-principal bundle with `fieldnet:sync`. Command-survival mutations separately require `fieldnet:command-survival`; a powerful internal service cannot lend that capability to a weaker node. Sensor ingest similarly requires `publish:evidence` when proof enforcement is configured and records the authority decision in observation provenance.

## Consumer boundary

The non-UI consumer surface is:

- `ProofPlaneService.verifyEnvelope(envelope, options)`;
- `ProofPlaneService.authorize(bundle, capabilityRequest, options)`;
- `ProofPlaneService.openControlContext(bundle, scope, options)`;
- `ProofPlaneService.authorizeControlAction(action, opaqueContext, at)`;
- `ProofPlaneService.assessOperationalEvent(event, options)`;
- `ProofPlaneService.eventsForProjection(events, asOf)`;
- `ProofPlaneService.quarantineLog()` and `transparencyReceipts()`;
- `ProofPlaneService.createReplay(asOf)` and `verifyReplay(replay)`;
- `OperationalIntelligenceService.quarantineLog()`, `createTrustedReplay(asOf)`, and `verifyTrustedReplay(replay)`.

No operator-console code was changed in this vertical.
