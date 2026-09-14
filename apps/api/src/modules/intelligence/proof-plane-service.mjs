import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { bindOperationalEventTrust, operationalEventStatementHash } from '../../../../../packages/domain/src/event-fabric/index.mjs';
import {
  createProofPlaneReplay, createRevocationRegistry, createTransparencyReceipt, evaluateAuthority, evaluateCapability,
  evaluateContinuousTrust, evaluateCredentialClaim, evaluateDeviceAttestation, evaluateSessionBinding, revocationStatus,
  validateDelegation, verifyProofEnvelope, verifyProofPlaneReplay
} from '../../../../../packages/domain/src/proof-plane/index.mjs';

const privilegedDecision = (decision) => decision === 'AUTHORIZED';
const atIso = (value) => new Date(value).toISOString();

export class ProofPlaneService {
  #trustRoots; #revocations; #policy; #devices; #clock; #signer; #publicKeys; #allowUnsigned; #replay = new Map(); #sequences = new Map();
  #contexts = new WeakMap(); #internalBindings = new Set(); #decisions = []; #receipts = []; #quarantines = [];
  #metrics = { envelopesVerified: 0, cryptoFailures: 0, replayRejected: 0, authorityDecisions: 0, authorized: 0, denied: 0,
    stepUp: 0, limited: 0, quarantined: 0, revocationHits: 0, controlRechecks: 0, publicObservationsAccepted: 0 };

  constructor({ trustRoots, revocations = createRevocationRegistry([]), trustPolicy, devices = [], clock = () => new Date(),
    transparencySigner, transparencyPublicKeys = {}, allowUnsignedSourceClasses = ['REPORT', 'CONTEXT'] } = {}) {
    if (!trustRoots?.fingerprint || !trustPolicy?.fingerprint || !transparencySigner?.privateKey || !transparencySigner?.keyId) throw new Error('proof_plane_dependencies_required');
    this.#trustRoots = trustRoots; this.#revocations = revocations; this.#policy = trustPolicy; this.#devices = new Map(devices.map((device) => [device.id, device]));
    this.#clock = clock; this.#signer = transparencySigner; this.#publicKeys = transparencyPublicKeys; this.#allowUnsigned = new Set(allowUnsignedSourceClasses);
  }

  replaceRevocations(revocations) { if (!revocations?.fingerprint) throw new Error('revocation_registry_required'); this.#revocations = revocations; return this.status(); }
  status() { return { schemaVersion: 'vigia.proof-plane-status.v1', trustRootFingerprint: this.#trustRoots.fingerprint,
    revocationFingerprint: this.#revocations.fingerprint, trustPolicyFingerprint: this.#policy.fingerprint, metrics: structuredClone(this.#metrics),
    receiptHeadHash: this.#receipts.at(-1)?.receiptHash ?? null, quarantineDepth: this.#quarantines.length };
  }

  verifyEnvelope(envelope, options = {}) {
    this.#metrics.envelopesVerified += 1;
    const result = verifyProofEnvelope(envelope, { trustRoots: this.#trustRoots, revocations: this.#revocations,
      at: options.at ?? this.#clock(), expectedStatementHash: options.expectedStatementHash, expectedScope: options.expectedScope, usage: options.usage });
    if (!result.cryptographicallyVerified) this.#metrics.cryptoFailures += 1;
    if (result.status === 'REVOKED') this.#metrics.revocationHits += 1;
    if (result.status !== 'VALID' || options.consume !== true) return result;
    const statement = envelope.statement, replayKey = `${statement.principalId}:${statement.sessionId ?? '-'}:${statement.nonce}`;
    const sequenceKey = `${statement.principalId}:${statement.sessionId ?? '-'}`, prior = this.#sequences.get(sequenceKey) ?? -1;
    if (this.#replay.has(replayKey) || statement.sequence <= prior) {
      this.#metrics.replayRejected += 1;
      return { ...result, status: 'REPLAYED', reasons: ['NONCE_OR_SEQUENCE_REPLAYED'] };
    }
    this.#replay.set(replayKey, statement.expiresAt); this.#sequences.set(sequenceKey, statement.sequence);
    return result;
  }

  authorize(bundle = {}, request = {}, options = {}) {
    const at = atIso(options.at ?? this.#clock()), expected = request.requestFingerprint ?? semanticHash('capability-request', request);
    const actionProof = this.verifyEnvelope(bundle.actionEnvelope, { at, expectedStatementHash: expected, usage: 'ACTION', consume: options.consume === true });
    const credentialProof = this.verifyEnvelope(bundle.credentialEnvelope, { at, usage: 'CREDENTIAL' });
    const sessionProof = this.verifyEnvelope(bundle.sessionEnvelope, { at, usage: 'SESSION' });
    const deviceProof = this.verifyEnvelope(bundle.deviceAttestationEnvelope, { at, usage: 'ATTESTATION' });
    const delegationProof = bundle.delegationEnvelope ? this.verifyEnvelope(bundle.delegationEnvelope, { at, usage: 'CREDENTIAL' }) : { status: 'VALID', valid: true };
    const action = bundle.actionEnvelope?.statement, credentialStatement = bundle.credentialEnvelope?.statement;
    const credential = credentialStatement?.payload, sessionStatement = bundle.sessionEnvelope?.statement, delegation = bundle.delegationEnvelope?.statement?.payload;
    const delegationValidation = delegation ? validateDelegation(delegation, credential?.grants ?? [], at, { parentCredentialId: credential?.credentialId }) : { valid: true, reasons: [] };
    const delegationCheck = delegation && (delegationProof.status !== 'VALID' || delegation.delegatePrincipalId !== action?.principalId || action?.payload?.delegationId !== delegation.id)
      ? { valid: false, reasons: ['DELEGATION_BINDING_INVALID', ...delegationValidation.reasons] } : delegationValidation;
    const credentialCheck = evaluateCredentialClaim(credential, { principalId: delegation?.delegatorPrincipalId ?? action?.principalId, organizationId: request.organizationId, at });
    const credentialRevocation = revocationStatus(this.#revocations, { targets: [{ type: 'CREDENTIAL', id: credential?.credentialId }], statementAt: credential?.issuedAt ?? at, evaluatedAt: at });
    const checkedCredential = credentialRevocation.revoked ? { ...credentialCheck, valid: false, state: 'REVOKED', reasons: credentialRevocation.reasons } : credentialCheck;
    const sessionCheck = evaluateSessionBinding({ verification: sessionProof, statement: sessionStatement, actionStatement: action, at });
    const sessionRevocation = revocationStatus(this.#revocations, { targets: [{ type: 'SESSION', id: sessionStatement?.payload?.sessionId }], statementAt: sessionStatement?.issuedAt ?? at, evaluatedAt: at });
    const checkedSession = sessionRevocation.revoked ? { ...sessionCheck, valid: false, state: 'REVOKED', reasons: sessionRevocation.reasons } : sessionCheck;
    const device = this.#devices.get(action?.deviceId), sensitivity = String(request.sensitivity ?? 'LOW').toUpperCase();
    const deviceCheck = evaluateDeviceAttestation({ verification: deviceProof, statement: bundle.deviceAttestationEnvelope?.statement,
      device, requiredLevel: this.#policy.requiredAttestationBySensitivity[sensitivity] ?? 'SOFTWARE', principalId: action?.principalId, at });
    const deviceRevocation = revocationStatus(this.#revocations, { targets: [{ type: 'DEVICE', id: device?.id }], statementAt: action?.issuedAt ?? at, evaluatedAt: at });
    const checkedDevice = deviceRevocation.revoked ? { ...deviceCheck, valid: false, state: 'DENIED', reasons: deviceRevocation.reasons } : deviceCheck;
    const delegationRevocation = delegation ? revocationStatus(this.#revocations, { targets: [{ type: 'DELEGATION', id: delegation.id }], statementAt: delegation.validFrom, evaluatedAt: at }) : { revoked: false };
    const effectiveDelegation = delegationCheck.valid && !delegationRevocation.revoked, grants = delegation ? effectiveDelegation ? delegation.grants : [] : credential?.grants ?? [];
    const capability = evaluateCapability(grants, request, at);
    const policyEffective = this.#policy.validFrom <= at && (!this.#policy.validUntil || this.#policy.validUntil > at);
    const continuousTrust = evaluateContinuousTrust({ at, policy: this.#policy, hardPrerequisites: { actionProof: actionProof.status === 'VALID',
      credentialProof: credentialProof.status === 'VALID', sessionProof: sessionProof.status === 'VALID', deviceProof: deviceProof.status === 'VALID',
      credential: checkedCredential.valid, session: checkedSession.valid, delegation: effectiveDelegation, capability: capability.allowed, policyEffective,
      quarantineSafe: !['MALFORMED', 'INVALID_PROOF'].includes(actionProof.status) }, softSignals: options.softSignals ?? [] });
    const decision = evaluateAuthority({ at, principalId: action?.principalId, organizationId: request.organizationId,
      proofChecks: { action: actionProof, credential: credentialProof, session: sessionProof, device: deviceProof, delegation: delegationProof }, credentialCheck: checkedCredential,
      sessionCheck: checkedSession, deviceCheck: checkedDevice, grants, request, continuousTrust,
      proofFingerprints: [bundle.actionEnvelope?.fingerprint, bundle.credentialEnvelope?.fingerprint, bundle.sessionEnvelope?.fingerprint, bundle.deviceAttestationEnvelope?.fingerprint, bundle.delegationEnvelope?.fingerprint].filter(Boolean),
      credentialId: credential?.credentialId, sessionId: sessionStatement?.payload?.sessionId, deviceId: device?.id,
      quarantine: actionProof.status === 'MALFORMED' || actionProof.status === 'INVALID_PROOF' });
    if (options.record !== false) this.#recordDecision(decision, at);
    return decision;
  }

  openControlContext(bundle, scope, options = {}) {
    const request = { capability: 'control:reconcile', organizationId: scope.organizationId, incidentId: scope.incidentId,
      resourceType: 'control-plane', resourceId: scope.incidentId, actionClass: 'RECONCILIATION', sensitivity: scope.sensitivity ?? 'MEDIUM',
      requestFingerprint: scope.requestFingerprint };
    const decision = this.authorize(bundle, request, { ...options, consume: true });
    if (!privilegedDecision(decision.decision)) return { context: null, decision };
    const context = Object.freeze({ schemaVersion: 'vigia.opaque-control-context.v1', id: semanticHash('opaque-control-context', { decisionId: decision.decisionId, sequence: this.#decisions.length }) });
    this.#contexts.set(context, { bundle, request, decision }); return { context, decision };
  }

  authorizeControlAction(action, context, at = this.#clock(), phase = 'SAFETY') {
    this.#metrics.controlRechecks += 1; const stored = this.#contexts.get(context), evaluatedAt = atIso(at);
    const finish = (result) => { const decision = { schemaVersion: 'vigia.control-authority-check.v1', actionId: action.id, phase, evaluatedAt,
      authorityDecisionId: result.decision?.decisionId ?? stored?.decision?.decisionId ?? null, state: result.state, allowed: result.allowed, reasons: result.reasons };
      const decisionId = semanticHash('control-authority-check', decision), receipt = this.#appendReceipt({ eventType: 'CONTROL_AUTHORITY_CHECK', subjectId: action.id,
        decisionId, decision, proofFingerprints: result.decision?.proofFingerprints ?? stored?.decision?.proofFingerprints ?? [], at: evaluatedAt });
      return { ...result, controlAuthorityCheckId: decisionId, transparencyReceiptHash: receipt.receiptHash }; };
    if (!stored || action.incidentId !== stored.request.incidentId) return finish({ allowed: false, state: 'DENIED', reasons: ['OPAQUE_CONTROL_CONTEXT_REQUIRED'] });
    const fresh = this.authorize(stored.bundle, stored.request, { at, consume: false, record: false });
    if (!privilegedDecision(fresh.decision)) return finish({ allowed: false, state: fresh.decision, reasons: fresh.reasons, decision: fresh });
    const grants = stored.bundle.delegationEnvelope?.statement?.payload?.grants ?? stored.bundle.credentialEnvelope.statement.payload.grants, checks = action.requiredCapabilities.map((capability) => evaluateCapability(grants,
      { ...stored.request, capability, actionClass: action.safetyClass, resourceType: 'control-action', resourceId: action.id }, at));
    const failed = checks.find((check) => !check.allowed);
    if (failed) return finish({ allowed: false, state: 'DENIED', reasons: failed.reasons, decision: fresh, capabilityChecks: checks });
    if (action.safetyClass === 'CONSEQUENTIAL') return finish({ allowed: false, state: 'AUTHORIZED_BUT_EXECUTION_DISABLED', reasons: ['CONSEQUENTIAL_EXECUTION_DISABLED'], authorityUnderstood: true, decision: fresh, capabilityChecks: checks });
    return finish({ allowed: true, state: 'AUTHORIZED', reasons: [], decision: fresh, capabilityChecks: checks });
  }

  summarizeControlContext(context) { const stored = this.#contexts.get(context); return stored ? { principalId: stored.decision.principalId,
    organizationId: stored.decision.organizationId, authorityRef: stored.decision.decisionId, proofFingerprints: stored.decision.proofFingerprints } : null; }

  assessOperationalEvent(event, options = {}) {
    const at = atIso(options.at ?? this.#clock());
    if (event.trust?.bindingType === 'PROOF_BOUND_INTERNAL_CONTROL' && this.#internalBindings.delete(event.fingerprint)) return { state: 'ACCEPTED', event, trust: event.trust };
    const bundle = event.proof?.bundle;
    if (!bundle) {
      if (this.#allowUnsigned.has(event.source.familyClass)) {
        this.#metrics.publicObservationsAccepted += 1;
        const trust = { schemaVersion: 'vigia.event-trust-assessment.v1', state: 'ACCEPTED_UNVERIFIED', trustZone: 'PUBLIC_OBSERVATIONAL',
          authority: 'NONE', assessedAt: at, reasons: ['UNSIGNED_OBSERVATION_PERMITTED_BY_SOURCE_POLICY'] };
        return { state: 'ACCEPTED', event: bindOperationalEventTrust(event, trust), trust };
      }
      return this.#quarantine(event, at, ['SIGNED_PROOF_BUNDLE_REQUIRED']);
    }
    const requestFingerprint = operationalEventStatementHash(event), incidentId = String(event.correlationId ?? '').replace(/^incident:/, '');
    const decision = this.authorize(bundle, { capability: 'publish:evidence', organizationId: bundle.actionEnvelope?.statement?.organizationId,
      incidentId, resourceType: 'operational-event', resourceId: event.id, actionClass: 'EVIDENCE_INGEST', sensitivity: event.source.familyClass === 'PHYSICAL' ? 'MEDIUM' : 'LOW', requestFingerprint },
    { at, consume: true, softSignals: options.softSignals });
    if (!privilegedDecision(decision.decision)) return this.#quarantine(event, at, [`AUTHORITY_${decision.decision}`, ...decision.reasons]);
    const trust = { schemaVersion: 'vigia.event-trust-assessment.v1', state: 'VERIFIED', trustZone: 'ORGANIZATION_AUTHORIZED', authority: decision.decisionId,
      principalId: decision.principalId, credentialId: decision.credentialId, deviceId: decision.deviceId, proofFingerprints: decision.proofFingerprints,
      statementAt: bundle.actionEnvelope.statement.issuedAt, assessedAt: at, reasons: [] };
    const value = structuredClone(event); delete value.fingerprint; value.provenance.proofStatus = 'VERIFIED'; value.provenance.revocationStatus = 'VALID';
    return { state: 'ACCEPTED', event: bindOperationalEventTrust(value, trust), trust };
  }

  bindInternalControlEvent(event, context, at = this.#clock()) {
    const stored = this.#contexts.get(context); if (!stored) throw new Error('opaque_control_context_required');
    const trust = { schemaVersion: 'vigia.event-trust-assessment.v1', state: 'VERIFIED', trustZone: 'PRIVILEGED_OPERATIONAL', bindingType: 'PROOF_BOUND_INTERNAL_CONTROL',
      authority: stored.decision.decisionId, principalId: stored.decision.principalId, credentialId: stored.decision.credentialId,
      proofFingerprints: stored.decision.proofFingerprints, assessedAt: atIso(at), reasons: [] };
    const bound = bindOperationalEventTrust(event, trust); this.#internalBindings.add(bound.fingerprint); return bound;
  }

  eventsForProjection(events, asOf = this.#clock()) {
    const at = atIso(asOf); return events.filter((event) => {
      if (event.trust?.bindingType === 'PROOF_BOUND_INTERNAL_CONTROL') return true;
      if (!event.trust?.credentialId && !event.trust?.deviceId) return true;
      const status = revocationStatus(this.#revocations, { targets: [{ type: 'CREDENTIAL', id: event.trust.credentialId }, { type: 'DEVICE', id: event.trust.deviceId }],
        statementAt: event.trust.statementAt ?? event.clocks.observedAt ?? event.clocks.occurredAt, evaluatedAt: at });
      return !status.revoked;
    });
  }

  transparencyReceipts() { return structuredClone(this.#receipts); }
  quarantineLog() { return structuredClone(this.#quarantines); }
  createReplay(asOf = this.#clock()) { return createProofPlaneReplay({ trustRoots: this.#trustRoots, revocations: this.#revocations, trustPolicy: this.#policy,
    decisions: this.#decisions, quarantines: this.#quarantines, receipts: this.#receipts, asOf }); }
  verifyReplay(replay) { return verifyProofPlaneReplay(replay, { trustRoots: this.#trustRoots, revocations: this.#revocations, trustPolicy: this.#policy, publicKeys: this.#publicKeys }); }

  #recordDecision(decision, at) {
    this.#decisions.push(decision); this.#metrics.authorityDecisions += 1;
    if (decision.decision === 'AUTHORIZED') this.#metrics.authorized += 1; else if (decision.decision === 'STEP_UP_REQUIRED') this.#metrics.stepUp += 1;
    else if (decision.decision === 'LIMITED') this.#metrics.limited += 1; else if (decision.decision === 'QUARANTINED') this.#metrics.quarantined += 1; else this.#metrics.denied += 1;
    this.#appendReceipt({ eventType: 'AUTHORITY_DECISION', subjectId: decision.principalId, decisionId: decision.decisionId, decision, proofFingerprints: decision.proofFingerprints, at });
  }

  #quarantine(event, at, reasons) {
    const core = { schemaVersion: 'vigia.proof-quarantine.v1', eventId: event.id, eventFingerprint: event.fingerprint, reasons: [...new Set(reasons)].sort(), quarantinedAt: at,
      sourceId: event.source?.sourceId ?? null, state: 'QUARANTINED' }, item = { ...core, id: semanticHash('proof-quarantine', core) };
    this.#quarantines.push(item); this.#metrics.quarantined += 1;
    this.#appendReceipt({ eventType: 'QUARANTINE', subjectId: event.id, decisionId: item.id, decision: item, proofFingerprints: [], at });
    return { state: 'QUARANTINED', event: null, trust: { state: 'QUARANTINED', trustZone: null, authority: 'NONE', reasons: item.reasons }, quarantine: item };
  }

  #appendReceipt({ eventType, subjectId, decisionId, decision, proofFingerprints, at }) {
    const receipt = createTransparencyReceipt({ sequence: this.#receipts.length + 1, previousReceiptHash: this.#receipts.at(-1)?.receiptHash ?? null,
      eventType, subjectId, decisionId, decision, proofFingerprints, recordedAt: at }, this.#signer);
    this.#receipts.push(receipt); return receipt;
  }
}
