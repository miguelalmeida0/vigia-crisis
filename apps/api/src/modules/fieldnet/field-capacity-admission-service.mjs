import { writeJsonAtomic } from '../../shared/json-file.mjs';
import {
  appendFieldCapacityAudit,
  assertFieldCapacityInput,
  emptyFieldCapacityAdmissionLedger,
  FIELD_CAPACITY_ADMISSION_INPUT,
  FIELD_CAPACITY_AUTHORIZATION_SCOPE,
  FIELD_CAPACITY_ENVIRONMENTS,
  FIELD_CAPACITY_REPORT_TYPES,
  FIELD_CAPACITY_REVOCATION_INPUT,
  FIELD_CAPACITY_REVOCATION_REASONS,
  fieldCapacityEnvironment,
  fieldCapacityOpaque,
  fieldCapacityStateKey,
  readFieldCapacityAdmissionLedger,
  verifyFieldCapacityAdmissionLedger
} from './field-capacity-admission-ledger.mjs';
import { assertAdmissibleCapacityObservation, authorizeFieldCapacityDecision, createFieldCapacityAdmission, createFieldCapacityRevocation } from './field-capacity-admission-records.mjs';

/**
 * Durable, authorization-injected admission overlay for synced FieldNet
 * aggregate capacity reports. It deliberately cannot change the central raw
 * observation. The provider sees the decision only through decorateSnapshot.
 */
export class FieldCapacityAdmissionService {
  #state = emptyFieldCapacityAdmissionLedger();
  #write = Promise.resolve();
  #initialized = false;

  constructor({
    filePath,
    snapshotForIncident,
    authorizeAdmission,
    clock = () => new Date(),
    writer = writeJsonAtomic,
    maxObservationAgeMs = 15 * 60_000,
    maxPages = 1_000
  } = {}) {
    if (!filePath || typeof snapshotForIncident !== 'function' || typeof authorizeAdmission !== 'function') throw new Error('field_capacity_admission_configuration_required');
    if (!Number.isFinite(maxObservationAgeMs) || maxObservationAgeMs <= 0) throw new Error('field_capacity_admission_freshness_invalid');
    if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('field_capacity_admission_max_pages_invalid');
    Object.assign(this, { filePath, snapshotForIncident, authorizeAdmission, clock, writer, maxObservationAgeMs, maxPages });
  }

  async initialize() {
    const state = await readFieldCapacityAdmissionLedger(this.filePath);
    const integrity = verifyFieldCapacityAdmissionLedger(state);
    if (!integrity.valid) throw Object.assign(new Error('field_capacity_admission_integrity_failed'), { details: integrity });
    this.#state = state;
    this.#initialized = true;
    return this.status();
  }

  status() {
    this.#assertInitialized();
    const current = Object.values(this.#state.current);
    return {
      schemaVersion: 'vigia.field-capacity-admission-status.v1',
      state: 'READY',
      liveAdmissions: current.filter((item) => item.state === 'ADMITTED' && item.truthEnvironment === 'LIVE_OPERATIONAL').length,
      isolatedExerciseAdmissions: current.filter((item) => item.state === 'ADMITTED' && item.truthEnvironment === 'ISOLATED_EXERCISE').length,
      revokedAdmissions: current.filter((item) => item.state === 'REVOKED').length,
      auditRecords: this.#state.audit.length,
      updatedAt: this.#state.updatedAt,
      integrity: verifyFieldCapacityAdmissionLedger(this.#state)
    };
  }

  admit(actor, input) {
    const operation = this.#write.then(() => this.#admit(actor, input));
    this.#write = operation.catch(() => undefined);
    return operation;
  }

  revoke(actor, input) {
    const operation = this.#write.then(() => this.#revoke(actor, input));
    this.#write = operation.catch(() => undefined);
    return operation;
  }

  admissionFor(incidentId, observationId, { truthEnvironment = 'LIVE_OPERATIONAL' } = {}) {
    this.#assertInitialized();
    const scopedEnvironment = fieldCapacityEnvironment(truthEnvironment);
    const key = fieldCapacityStateKey(scopedEnvironment, fieldCapacityOpaque(incidentId, 'field_capacity_incident_id_required'), fieldCapacityOpaque(observationId, 'field_capacity_observation_id_required'));
    const current = this.#state.current[key];
    if (!current) return null;
    const admission = this.#state.admissions[current.admissionReference];
    return structuredClone(current.state === 'ADMITTED' ? admission : {
      ...admission,
      state: 'REVOKED',
      revocationReference: current.revocationReference,
      revokedAt: this.#state.revocations[current.revocationReference]?.revokedAt ?? null
    });
  }

  decorateSnapshot(incidentId, snapshot, { truthEnvironment = 'LIVE_OPERATIONAL' } = {}) {
    this.#assertInitialized();
    const scopedIncidentId = fieldCapacityOpaque(incidentId, 'field_capacity_incident_id_required');
    const scopedEnvironment = fieldCapacityEnvironment(truthEnvironment);
    if (!snapshot || typeof snapshot !== 'object') throw new Error('field_capacity_snapshot_unavailable');
    if (snapshot.incidentId && String(snapshot.incidentId) !== scopedIncidentId) throw new Error('field_capacity_snapshot_scope_mismatch');
    return {
      ...snapshot,
      incidentId: scopedIncidentId,
      observations: (Array.isArray(snapshot.observations) ? snapshot.observations : []).map((observation) => {
        if (String(observation.incidentId) !== scopedIncidentId) throw new Error('field_capacity_snapshot_observation_scope_mismatch');
        const capacityAdmission = this.admissionFor(scopedIncidentId, observation.observationId, { truthEnvironment: scopedEnvironment });
        return capacityAdmission ? { ...observation, capacityAdmission } : observation;
      })
    };
  }

  verifyIntegrity() {
    this.#assertInitialized();
    return verifyFieldCapacityAdmissionLedger(this.#state);
  }

  async #admit(actor, input) {
    this.#assertInitialized();
    assertFieldCapacityInput(input, FIELD_CAPACITY_ADMISSION_INPUT, 'field_capacity_admission_input_invalid');
    const incidentId = fieldCapacityOpaque(input.incidentId, 'field_capacity_incident_id_required');
    const observationId = fieldCapacityOpaque(input.observationId, 'field_capacity_observation_id_required');
    const expectedReportType = String(input.expectedReportType ?? '').toUpperCase();
    if (!FIELD_CAPACITY_REPORT_TYPES.has(expectedReportType)) throw new Error('field_capacity_report_type_invalid');
    const expectedRawEvidenceHash = String(input.expectedRawEvidenceHash ?? '');
    if (!/^sha256:[a-f0-9]{64}$/.test(expectedRawEvidenceHash)) throw new Error('field_capacity_expected_evidence_hash_required');
    const truthEnvironment = fieldCapacityEnvironment(input.truthEnvironment);
    const observation = await this.#findObservation(incidentId, observationId);
    assertAdmissibleCapacityObservation(observation, { incidentId, observationId, expectedReportType, expectedRawEvidenceHash }, this);
    const authorization = await authorizeFieldCapacityDecision((context) => this.authorizeAdmission(context), actor, { action: 'ADMIT', incidentId, observationId, reportType: expectedReportType, truthEnvironment });
    const key = fieldCapacityStateKey(truthEnvironment, incidentId, observationId);
    const current = this.#state.current[key];
    const crossEnvironment = Object.entries(this.#state.current).find(([candidateKey, value]) => candidateKey !== key && value.state === 'ADMITTED' && this.#state.admissions[value.admissionReference]?.incidentId === incidentId && this.#state.admissions[value.admissionReference]?.observationId === observationId);
    if (crossEnvironment) throw new Error('field_capacity_cross_environment_admission_forbidden');
    if (current?.state === 'ADMITTED') {
      const existing = this.#state.admissions[current.admissionReference];
      const decisionReference = input.decisionReference ? fieldCapacityOpaque(input.decisionReference, 'field_capacity_decision_reference_invalid') : null;
      if (existing.sourceEvidenceHash !== expectedRawEvidenceHash || existing.reportType !== expectedReportType || existing.decisionReference !== decisionReference) throw new Error('field_capacity_admission_identity_conflict');
      return { admission: structuredClone(existing), duplicate: true };
    }
    if (current?.state === 'REVOKED') throw new Error('field_capacity_admission_revoked_requires_new_observation');

    const admittedAt = this.clock().toISOString();
    const decisionReference = input.decisionReference ? fieldCapacityOpaque(input.decisionReference, 'field_capacity_decision_reference_invalid') : null;
    const admission = createFieldCapacityAdmission({ observation, authorization, incidentId, observationId, expectedReportType, expectedRawEvidenceHash, truthEnvironment, decisionReference, admittedAt });
    const { admissionReference } = admission;
    const candidate = structuredClone(this.#state);
    candidate.admissions[admissionReference] = admission;
    candidate.current[key] = { state: 'ADMITTED', admissionReference, truthEnvironment };
    candidate.updatedAt = admittedAt;
    appendFieldCapacityAudit(candidate, { type: 'CAPACITY_ADMITTED', reference: admissionReference, incidentId, observationId, truthEnvironment, principalId: authorization.principalId, at: admittedAt });
    await this.#persist(candidate);
    return { admission: structuredClone(admission), duplicate: false };
  }

  async #revoke(actor, input) {
    this.#assertInitialized();
    assertFieldCapacityInput(input, FIELD_CAPACITY_REVOCATION_INPUT, 'field_capacity_revocation_input_invalid');
    const incidentId = fieldCapacityOpaque(input.incidentId, 'field_capacity_incident_id_required');
    const observationId = fieldCapacityOpaque(input.observationId, 'field_capacity_observation_id_required');
    const truthEnvironment = fieldCapacityEnvironment(input.truthEnvironment);
    const reasonCode = String(input.reasonCode ?? '').toUpperCase();
    if (!FIELD_CAPACITY_REVOCATION_REASONS.has(reasonCode)) throw new Error('field_capacity_revocation_reason_invalid');
    const admissionReference = fieldCapacityOpaque(input.admissionReference, 'field_capacity_admission_reference_required');
    const key = fieldCapacityStateKey(truthEnvironment, incidentId, observationId);
    const current = this.#state.current[key];
    if (!current || current.admissionReference !== admissionReference) throw new Error('field_capacity_active_admission_not_found');
    if (current.state === 'REVOKED') {
      const existing = this.#state.revocations[current.revocationReference];
      const decisionReference = input.decisionReference ? fieldCapacityOpaque(input.decisionReference, 'field_capacity_decision_reference_invalid') : null;
      if (existing.reasonCode !== reasonCode || existing.decisionReference !== decisionReference) throw new Error('field_capacity_revocation_identity_conflict');
      return { revocation: structuredClone(existing), duplicate: true };
    }
    const authorization = await authorizeFieldCapacityDecision((context) => this.authorizeAdmission(context), actor, { action: 'REVOKE', incidentId, observationId, reportType: this.#state.admissions[admissionReference].reportType, truthEnvironment });
    const revokedAt = this.clock().toISOString();
    const decisionReference = input.decisionReference ? fieldCapacityOpaque(input.decisionReference, 'field_capacity_decision_reference_invalid') : null;
    const revocation = createFieldCapacityRevocation({ authorization, incidentId, observationId, admissionReference, truthEnvironment, reasonCode, decisionReference, revokedAt });
    const { revocationReference } = revocation;
    const candidate = structuredClone(this.#state);
    candidate.revocations[revocationReference] = revocation;
    candidate.current[key] = { state: 'REVOKED', admissionReference, revocationReference, truthEnvironment };
    candidate.updatedAt = revokedAt;
    appendFieldCapacityAudit(candidate, { type: 'CAPACITY_ADMISSION_REVOKED', reference: revocationReference, incidentId, observationId, truthEnvironment, principalId: authorization.principalId, at: revokedAt });
    await this.#persist(candidate);
    return { revocation: structuredClone(revocation), duplicate: false };
  }

  async #findObservation(incidentId, observationId) {
    let cursor = '';
    for (let pageIndex = 0; pageIndex < this.maxPages; pageIndex += 1) {
      const snapshot = await this.snapshotForIncident(incidentId, { afterCursor: Number.MAX_SAFE_INTEGER, limit: 250, collectionCursors: { observations: cursor } });
      if (!snapshot || typeof snapshot !== 'object') throw new Error('field_capacity_snapshot_unavailable');
      if (snapshot.incidentId && String(snapshot.incidentId) !== incidentId) throw new Error('field_capacity_snapshot_scope_mismatch');
      const matches = (Array.isArray(snapshot.observations) ? snapshot.observations : []).filter((item) => String(item?.observationId) === observationId);
      if (matches.length > 1) throw new Error('field_capacity_observation_identity_conflict');
      if (matches.length === 1) return matches[0];
      const page = snapshot.collectionPages?.observations;
      if (!page?.hasMore) throw new Error('field_capacity_observation_not_found');
      const nextCursor = typeof page.nextCursor === 'string' ? page.nextCursor : '';
      if (!nextCursor || nextCursor === cursor) throw new Error('field_capacity_snapshot_cursor_stalled');
      cursor = nextCursor;
    }
    throw new Error('field_capacity_snapshot_page_limit_reached');
  }

  async #persist(candidate) {
    const integrity = verifyFieldCapacityAdmissionLedger(candidate);
    if (!integrity.valid) throw Object.assign(new Error('field_capacity_admission_integrity_failed'), { details: integrity });
    await this.writer(this.filePath, candidate);
    this.#state = candidate;
  }

  #assertInitialized() {
    if (!this.#initialized) throw new Error('field_capacity_admission_not_initialized');
  }
}

export const FIELD_CAPACITY_ADMISSION_AUTHORIZATION_SCOPE = FIELD_CAPACITY_AUTHORIZATION_SCOPE;
export const FIELD_CAPACITY_TRUTH_ENVIRONMENTS = Object.freeze([...FIELD_CAPACITY_ENVIRONMENTS]);
