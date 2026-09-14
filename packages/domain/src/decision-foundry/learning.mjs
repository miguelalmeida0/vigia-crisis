import { immutable, isoTime, requiredText, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export const PROSPECTIVE_CAPTURE_MODES = Object.freeze(['ONCE', 'BOUNDED_DURATION', 'INCIDENT_WATCH', 'REGIONAL_SHADOW']);
const boundedList = (values, name, maximum = 100) => { if (!Array.isArray(values) || values.length < 1 || values.length > maximum) throw new Error(`${name}_invalid`); return uniqueSorted(values); };
const count = (values) => new Set(values ?? []).size;

export function createProspectiveCaptureManifest(input = {}) {
  if (!PROSPECTIVE_CAPTURE_MODES.includes(input.mode)) throw new Error('prospective_capture_mode_invalid');
  const cadenceSeconds = Number(input.cadenceSeconds), retentionDays = Number(input.retentionDays);
  if (!Number.isSafeInteger(cadenceSeconds) || cadenceSeconds < 60 || cadenceSeconds > 86_400) throw new Error('prospective_capture_cadence_invalid');
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('prospective_capture_retention_invalid');
  if (input.rights?.state !== 'READY' || !input.rights?.licenceId) throw new Error('prospective_capture_rights_required');
  const startedAt = isoTime(input.startedAt, 'prospective_capture_start_required'), endsAt = input.endsAt ? isoTime(input.endsAt) : null;
  if (input.mode === 'BOUNDED_DURATION' && (!endsAt || Date.parse(endsAt) <= Date.parse(startedAt))) throw new Error('prospective_capture_bound_required');
  const core = { schemaVersion: 'vigia.prospective-capture-manifest.v1', id: requiredText(input.id, 'prospective_capture_id_required'), mode: input.mode,
    providers: boundedList(input.providers, 'prospective_capture_providers'), products: boundedList(input.products, 'prospective_capture_products'),
    regions: boundedList(input.regions, 'prospective_capture_regions'), incidentIds: boundedList(input.incidentIds, 'prospective_capture_incidents'),
    cadenceSeconds, retentionDays, startedAt, endsAt, rights: structuredClone(input.rights), externalConsequentialActions: false };
  return immutable({ ...core, fingerprint: semanticHash('prospective-capture-manifest', core) });
}

export function createProspectiveSnapshot({ manifest, sequence, incidentId, providerId, productId, providerPublishedAt = null, vigiaReceivedAt, rawObjectReference, rawObjectHash, sourceHealth, perimeterRevision = null, physicalObservations = [], weatherRun = null, assetContext = null, evidenceState = null, evidenceDebt = null, hypotheses = null, decisionPacket = null, shadowActions = [], lineage = null, previousSnapshotFingerprint = null } = {}) {
  if (!manifest?.fingerprint) throw new Error('prospective_snapshot_manifest_required');
  if (!manifest.providers.includes(providerId) || !manifest.products.includes(productId) || !manifest.incidentIds.includes(incidentId)) throw new Error('prospective_snapshot_scope_escape');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('prospective_snapshot_sequence_invalid');
  const received = isoTime(vigiaReceivedAt, 'prospective_snapshot_receipt_required'), published = providerPublishedAt ? isoTime(providerPublishedAt) : null;
  if (published && Date.parse(published) > Date.parse(received)) throw new Error('prospective_snapshot_publication_after_receipt');
  if (!/^(sha256:)?[a-f0-9]{64}$/.test(String(rawObjectHash))) throw new Error('prospective_snapshot_raw_hash_invalid');
  const core = { schemaVersion: 'vigia.prospective-knowledge-time-snapshot.v1', manifestId: manifest.id, manifestFingerprint: manifest.fingerprint, sequence,
    incidentId, providerId, productId, providerPublishedAt: published, vigiaReceivedAt: received, rawObjectReference: requiredText(rawObjectReference, 'prospective_snapshot_raw_reference_required'), rawObjectHash,
    sourceHealth: structuredClone(sourceHealth ?? { state: 'UNKNOWN' }), perimeterRevision: structuredClone(perimeterRevision), physicalObservations: structuredClone(physicalObservations),
    weatherRun: structuredClone(weatherRun), assetContext: structuredClone(assetContext), evidenceState: structuredClone(evidenceState), evidenceDebt: structuredClone(evidenceDebt),
    hypotheses: structuredClone(hypotheses), decisionPacketFingerprint: decisionPacket?.replayFingerprint ?? null, shadowActions: structuredClone(shadowActions),
    rights: manifest.rights, lineage: structuredClone(lineage), previousSnapshotFingerprint, externalConsequentialActions: 0 };
  return immutable({ ...core, fingerprint: semanticHash('prospective-knowledge-time-snapshot', core) });
}

export function createDecisionOutcome(input = {}) {
  const decisionTime = isoTime(input.decisionTime, 'decision_outcome_time_required'), laterEvidence = structuredClone(input.laterEvidence ?? []);
  if (laterEvidence.some((item) => Date.parse(item.availableToVigiaAt) <= Date.parse(decisionTime))) throw new Error('decision_outcome_later_evidence_not_later');
  const core = { schemaVersion: 'vigia.decision-outcome.v1', id: requiredText(input.id, 'decision_outcome_id_required'), incidentId: requiredText(input.incidentId, 'decision_outcome_incident_required'), packetFingerprint: requiredText(input.packetFingerprint, 'decision_outcome_packet_required'), decisionTime,
    factsKnownAtDecision: structuredClone(input.factsKnownAtDecision ?? []), unknownsAtDecision: structuredClone(input.unknownsAtDecision ?? []), acquisitionChosen: structuredClone(input.acquisitionChosen ?? null), actionChosen: structuredClone(input.actionChosen ?? null),
    laterEvidence, laterOperationalState: structuredClone(input.laterOperationalState ?? null), adjudicatedAt: input.adjudicatedAt ? isoTime(input.adjudicatedAt) : null,
    decisionReasonableWithAvailableEvidence: input.decisionReasonableWithAvailableEvidence ?? null, laterRealityMatchedWorkingAssumption: input.laterRealityMatchedWorkingAssumption ?? null,
    operatorInterventionObserved: input.operatorInterventionObserved ?? null, adjudicationBasis: structuredClone(input.adjudicationBasis ?? []), hindsightPunishmentApplied: false };
  return immutable({ ...core, fingerprint: semanticHash('decision-outcome', core) });
}

export function createInformationValueOutcome(input = {}) {
  const predicted = input.predicted ?? {}, actual = input.actual ?? {};
  const core = { schemaVersion: 'vigia.realized-information-value.v1', id: requiredText(input.id, 'information_value_outcome_id_required'), acquisitionId: requiredText(input.acquisitionId, 'information_value_acquisition_required'), incidentId: requiredText(input.incidentId, 'information_value_incident_required'), providerId: requiredText(input.providerId, 'information_value_provider_required'), acquisitionType: requiredText(input.acquisitionType, 'information_value_type_required'), region: input.region ?? 'UNKNOWN', incidentType: input.incidentType ?? 'UNKNOWN', sourceHealth: input.sourceHealth ?? 'UNKNOWN',
    predicted: { decisionsUnlocked: uniqueSorted(predicted.decisionsUnlocked), hypothesesSeparated: uniqueSorted(predicted.hypothesesSeparated), evidenceDebtClosed: uniqueSorted(predicted.evidenceDebtClosed), latencyMs: predicted.latencyMs ?? null, bytes: predicted.bytes ?? null, sourceSuccess: predicted.sourceSuccess ?? null },
    actual: { decisionsUnlocked: uniqueSorted(actual.decisionsUnlocked), hypothesesSeparated: uniqueSorted(actual.hypothesesSeparated), evidenceDebtClosed: uniqueSorted(actual.evidenceDebtClosed), latencyMs: actual.latencyMs ?? null, bytes: actual.bytes ?? null, sourceSuccess: actual.sourceSuccess ?? null }, recordedAt: isoTime(input.recordedAt, 'information_value_recorded_at_required') };
  return immutable({ ...core, fingerprint: semanticHash('realized-information-value', core) });
}

function agreement(predicted, actual) { const p = new Set(predicted), a = new Set(actual), intersection = [...p].filter((item) => a.has(item)).length; return { truePositive: intersection, predicted: p.size, actual: a.size }; }
function ratio(numerator, denominator) { return denominator === 0 ? null : numerator / denominator; }
function statistics(rows) {
  const unlock = rows.map((row) => agreement(row.predicted.decisionsUnlocked, row.actual.decisionsUnlocked)), hypotheses = rows.map((row) => agreement(row.predicted.hypothesesSeparated, row.actual.hypothesesSeparated));
  const sum = (values, key) => values.reduce((total, value) => total + value[key], 0), paired = (field) => rows.filter((row) => Number.isFinite(row.predicted[field]) && Number.isFinite(row.actual[field]));
  return { examples: rows.length, unlockPrecision: ratio(sum(unlock, 'truePositive'), sum(unlock, 'predicted')), unlockRecall: ratio(sum(unlock, 'truePositive'), sum(unlock, 'actual')),
    decisionImpactAgreement: ratio(rows.filter((row) => count(row.predicted.decisionsUnlocked) === count(row.actual.decisionsUnlocked)).length, rows.length),
    hypothesisDiscriminationAgreement: ratio(sum(hypotheses, 'truePositive'), Math.max(sum(hypotheses, 'predicted'), sum(hypotheses, 'actual'))),
    meanAbsoluteLatencyErrorMs: ratio(paired('latencyMs').reduce((sumValue, row) => sumValue + Math.abs(row.predicted.latencyMs - row.actual.latencyMs), 0), paired('latencyMs').length),
    meanAbsoluteByteError: ratio(paired('bytes').reduce((sumValue, row) => sumValue + Math.abs(row.predicted.bytes - row.actual.bytes), 0), paired('bytes').length),
    sourceSuccessRate: ratio(rows.filter((row) => row.actual.sourceSuccess === true).length, rows.filter((row) => row.actual.sourceSuccess !== null).length) };
}

export function calibrateInformationValue(outcomes = []) {
  const dimensions = ['providerId', 'acquisitionType', 'incidentType', 'region', 'sourceHealth'], stratified = {};
  for (const dimension of dimensions) stratified[dimension] = Object.fromEntries(uniqueSorted(outcomes.map((row) => row[dimension])).map((value) => [value, statistics(outcomes.filter((row) => row[dimension] === value))]));
  const core = { schemaVersion: 'vigia.information-value-calibration.v1', qualification: outcomes.length ? 'EMPIRICAL_DESCRIPTIVE_STATISTICS' : 'INSUFFICIENT_OUTCOMES', overall: statistics(outcomes), stratified, automaticDoctrineMutation: false, recommendationRequiresReview: true };
  return immutable({ ...core, fingerprint: semanticHash('information-value-calibration', core) });
}

export function createShadowOperationsRecord(input = {}) {
  const core = { schemaVersion: 'vigia.shadow-operations-record.v1', id: requiredText(input.id, 'shadow_record_id_required'), incidentId: requiredText(input.incidentId, 'shadow_record_incident_required'), recordedAt: isoTime(input.recordedAt, 'shadow_record_time_required'), decisionPacketFingerprint: requiredText(input.decisionPacketFingerprint, 'shadow_record_packet_required'), candidateAcquisitions: structuredClone(input.candidateAcquisitions ?? []), selectedAcquisitions: structuredClone(input.selectedAcquisitions ?? []), blockedAcquisitions: structuredClone(input.blockedAcquisitions ?? []), decisionDelta: structuredClone(input.decisionDelta ?? null), wouldHaveActions: structuredClone(input.wouldHaveActions ?? []), operatorRequiredDecisions: structuredClone(input.operatorRequiredDecisions ?? []), laterOutcomes: structuredClone(input.laterOutcomes ?? []), consequentialActionsExecuted: 0 };
  return immutable({ ...core, fingerprint: semanticHash('shadow-operations-record', core) });
}
