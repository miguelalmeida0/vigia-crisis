import { fireStationCapacityProjection, hospitalCapacityProjection } from './capacity-report-mapping.mjs';

/**
 * Strict bridge from central FieldNet observations to response-capability
 * projections. A synced or role-attested report is still only an observation.
 * This bridge emits capacity only when a separate central admission record is
 * bound to the exact observation and incident.
 */

const CAPACITY_REPORT_TYPES = new Set([
  'HOSPITAL_CAPACITY_UPDATE',
  'FIRE_STATION_CAPACITY_UPDATE'
]);

const TRUSTED_VERIFICATION_STATE = 'ROLE_ATTESTED';
const ADMISSION_SCHEMA = 'vigia.field-capacity-admission.v1';
const ADMISSION_SCOPE = 'AGGREGATE_OPERATIONAL_CAPACITY';
const TRUTH_ENVIRONMENTS = new Set(['LIVE_OPERATIONAL', 'ISOLATED_EXERCISE']);

function text(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function validIso(value) {
  const parsed = new Date(value ?? '');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function reportObserver(report) {
  return report.observerIdentity ?? {
    observerId: report.provenance?.observerId,
    observerClass: report.provenance?.observerClass,
    verificationState: report.provenance?.observerVerificationState,
    trustBand: report.sourceIdentity?.observerTrustBand
  };
}

function excluded(reasonCode, report = null) {
  return Object.freeze({ admitted: false, item: null, reasonCode, observationId: text(report?.observationId) });
}

/**
 * Inspect one central observation and, only for an exact governed admission,
 * return the allowlisted aggregate projection consumed by response capability.
 * No observer name, note, media, free text, or geometry crosses this boundary.
 */
export function evaluateFieldCapacityReportAdmission(report, { incidentId, now = new Date(), truthEnvironment = 'LIVE_OPERATIONAL' } = {}) {
  if (!report || typeof report !== 'object') return excluded('NOT_AN_OBSERVATION');
  if (!CAPACITY_REPORT_TYPES.has(report.reportType)) return excluded('NOT_A_CAPACITY_REPORT', report);
  const expectedIncidentId = text(incidentId);
  const reportIncidentId = text(report.incidentId);
  if (!expectedIncidentId || reportIncidentId !== expectedIncidentId) return excluded('INCIDENT_SCOPE_MISMATCH', report);

  const observer = reportObserver(report);
  if (observer?.verificationState !== TRUSTED_VERIFICATION_STATE || observer?.trustBand !== 'TRUSTED_ROLE_ATTESTED' || observer?.observerClass === 'PUBLIC') {
    return excluded('OBSERVER_NOT_ROLE_ATTESTED', report);
  }

  const admission = report.capacityAdmission;
  if (!admission || admission.schemaVersion !== ADMISSION_SCHEMA || admission.state !== 'ADMITTED') return excluded('GOVERNED_ADMISSION_REQUIRED', report);
  if (admission.scope !== ADMISSION_SCOPE) return excluded('ADMISSION_SCOPE_INVALID', report);
  if (!TRUTH_ENVIRONMENTS.has(truthEnvironment) || admission.truthEnvironment !== truthEnvironment) return excluded('TRUTH_ENVIRONMENT_MISMATCH', report);
  if (text(admission.incidentId) !== reportIncidentId || text(admission.observationId) !== text(report.observationId) || admission.reportType !== report.reportType) {
    return excluded('ADMISSION_BINDING_MISMATCH', report);
  }
  const admissionReference = text(admission.admissionReference);
  const sourceReference = text(admission.sourceReference);
  const authorityReference = text(admission.authorityReference);
  const admittedBy = text(admission.admittedBy);
  if (!admissionReference || !sourceReference || !authorityReference || !admittedBy) return excluded('ADMISSION_PROVENANCE_INCOMPLETE', report);

  const observedAt = validIso(report.claimedObservedAt ?? report.observedAt);
  const admittedAt = validIso(admission.admittedAt);
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs) || !observedAt || !admittedAt || Date.parse(observedAt) > Date.parse(admittedAt) || Date.parse(admittedAt) > nowMs) {
    return excluded('ADMISSION_CHRONOLOGY_INVALID', report);
  }

  const answers = report.payload?.structuredAnswers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return excluded('STRUCTURED_ANSWERS_MISSING', report);
  const aggregate = report.reportType === 'HOSPITAL_CAPACITY_UPDATE' ? hospitalCapacityProjection(answers) : fireStationCapacityProjection(answers);
  if (!aggregate.facilityId) return excluded('FACILITY_ID_MISSING', report);

  return Object.freeze({
    admitted: true,
    reasonCode: null,
    observationId: report.observationId,
    item: Object.freeze({
      ...aggregate,
      state: 'FIELD_REPORTED',
      admitted: true,
      admissionState: 'ADMITTED',
      admissionReference,
      observedAt,
      source: Object.freeze({ name: 'VIGIA FieldNet', reference: sourceReference }),
      reporterRole: observer.observerClass,
      fieldObservationId: report.observationId,
      admission: Object.freeze({
        schemaVersion: ADMISSION_SCHEMA,
        scope: ADMISSION_SCOPE,
        truthEnvironment,
        admittedAt,
        admittedBy,
        authorityReference
      })
    })
  });
}

export function projectAdmittedFieldCapacityReport(report, options = {}) {
  return evaluateFieldCapacityReportAdmission(report, options).item;
}

/**
 * Adapter over the canonical central FieldNet snapshot. The injected reader is
 * responsible for authorization; this provider reasserts exact incident scope
 * and admission before projecting any operational capacity value.
 */
export class FieldCapacityReportProvider {
  constructor({ snapshotForIncident, clock = () => new Date(), maxPages = 1_000, truthEnvironment = 'LIVE_OPERATIONAL' } = {}) {
    if (typeof snapshotForIncident !== 'function') throw new Error('field_capacity_snapshot_reader_required');
    if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('field_capacity_max_pages_invalid');
    if (!TRUTH_ENVIRONMENTS.has(truthEnvironment)) throw new Error('field_capacity_truth_environment_invalid');
    this.snapshotForIncident = snapshotForIncident;
    this.clock = clock;
    this.maxPages = maxPages;
    this.truthEnvironment = truthEnvironment;
  }

  async listForIncident(incidentId) {
    const scopedIncidentId = text(incidentId);
    if (!scopedIncidentId) throw new Error('field_capacity_incident_id_required');
    const observationById = new Map();
    let cursor = '';
    let pagesRead = 0;
    for (;;) {
      if (pagesRead >= this.maxPages) throw new Error('field_capacity_snapshot_page_limit_reached');
      const snapshot = await this.snapshotForIncident(scopedIncidentId, {
        afterCursor: Number.MAX_SAFE_INTEGER,
        limit: 250,
        collectionCursors: { observations: cursor }
      });
      pagesRead += 1;
      if (!snapshot || typeof snapshot !== 'object') throw new Error('field_capacity_snapshot_unavailable');
      if (snapshot.incidentId && String(snapshot.incidentId) !== scopedIncidentId) throw new Error('field_capacity_snapshot_scope_mismatch');
      for (const observation of Array.isArray(snapshot.observations) ? snapshot.observations : []) {
        const observationId = text(observation?.observationId);
        if (!observationId) throw new Error('field_capacity_snapshot_observation_id_missing');
        const prior = observationById.get(observationId);
        if (prior && JSON.stringify(prior) !== JSON.stringify(observation)) throw new Error('field_capacity_snapshot_observation_identity_conflict');
        observationById.set(observationId, observation);
      }
      const page = snapshot.collectionPages?.observations;
      if (!page?.hasMore) break;
      const nextCursor = text(page.nextCursor);
      if (!nextCursor || nextCursor === cursor) throw new Error('field_capacity_snapshot_cursor_stalled');
      cursor = nextCursor;
    }
    const observations = [...observationById.values()];
    const evaluations = observations
      .filter((report) => CAPACITY_REPORT_TYPES.has(report?.reportType))
      .map((report) => evaluateFieldCapacityReportAdmission(report, { incidentId: scopedIncidentId, now: this.clock(), truthEnvironment: this.truthEnvironment }));
    const items = evaluations.filter((entry) => entry.admitted).map((entry) => entry.item)
      .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt) || left.facilityId.localeCompare(right.facilityId));
    const exclusionCounts = Object.fromEntries([...new Set(evaluations.filter((entry) => !entry.admitted).map((entry) => entry.reasonCode))]
      .sort().map((reason) => [reason, evaluations.filter((entry) => entry.reasonCode === reason).length]));
    return Object.freeze({
      schemaVersion: 'vigia.field-capacity-provider-result.v1',
      incidentId: scopedIncidentId,
      truthEnvironment: this.truthEnvironment,
      source: 'VIGIA FieldNet admitted aggregate capacity observations',
      sourceAvailability: Object.freeze({}),
      admissionProjection: Object.freeze({
        state: 'CONNECTED',
        scope: 'CENTRAL_ADMITTED_FIELD_CAPACITY_READ_MODEL',
        taskingConnectorState: 'NOT_ASSERTED',
        reason: 'Read access to admitted observations does not establish a writable or reachable FieldNet task destination.'
      }),
      items: Object.freeze(items),
      inspection: Object.freeze({
        pagesRead,
        capacityObservationsInspected: evaluations.length,
        admittedReportsProjected: items.length,
        excludedReports: evaluations.length - items.length,
        exclusionCounts: Object.freeze(exclusionCounts),
        truthBoundary: 'Sync receipt and observer attestation do not admit capacity. Only an exact central field-capacity admission is projected.'
      })
    });
  }
}

export const FIELD_CAPACITY_ADMISSION_CONTRACT = Object.freeze({
  schemaVersion: ADMISSION_SCHEMA,
  scope: ADMISSION_SCOPE,
  truthEnvironments: Object.freeze([...TRUTH_ENVIRONMENTS]),
  requiredBindings: Object.freeze(['incidentId', 'observationId', 'reportType', 'truthEnvironment']),
  requiredProvenance: Object.freeze(['admissionReference', 'sourceReference', 'authorityReference', 'admittedBy', 'admittedAt'])
});
