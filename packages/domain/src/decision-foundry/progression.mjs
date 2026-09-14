import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';
import { REVISION_CLASSES } from './constants.mjs';

export const DEFAULT_PROGRESSION_SAFETY = Object.freeze({ minimumDeltaHours: .25, maximumAreaRatio: 8, minimumAreaRatio: .2, maximumCentroidDisplacementKm: 50, maximumBoundaryVelocityKmH: 5, maximumGeometryRepairAreaChangeRatio: .05, maximumExtrapolationToObservedDeltaRatio: 2, maximumSparseHistoryExtrapolationHours: 12 });
export function classifyProgressionRevision({ current, previous = null, geometry = {}, safety = DEFAULT_PROGRESSION_SAFETY } = {}) {
  const flags = uniqueSorted([...(geometry.failures ?? []), Date.parse(current?.clocks?.observedAt) > Date.parse(current?.clocks?.availableToVigiaAt) ? 'CLOCK_NONCAUSAL' : null].filter(Boolean));
  const deltaHours = previous ? (Date.parse(current.clocks?.observedAt) - Date.parse(previous.clocks?.observedAt)) / 3_600_000 : null, areaRatio = Number(geometry.areaRatio), displacement = Number(geometry.centroidDisplacementKm), sameHash = previous && current?.originalGeometryHash === previous?.originalGeometryHash;
  let classification = !previous ? 'NEW_OBSERVATION' : sameHash ? 'DUPLICATE' : flags.length ? flags.includes('CLOCK_NONCAUSAL') ? 'CLOCK_ANOMALY' : 'INVALID' : current?.supersedes ? 'SUPERSESSION' : current?.correctionState === true ? 'CORRECTION' : Number.isFinite(deltaHours) && deltaHours < safety.minimumDeltaHours ? 'GEOMETRY_REFINEMENT' : Number.isFinite(areaRatio) && (areaRatio > safety.maximumAreaRatio || areaRatio < safety.minimumAreaRatio) ? 'CORRECTION' : Number.isFinite(displacement) && displacement > safety.maximumCentroidDisplacementKm ? 'INCIDENT_IDENTITY_CHANGE' : 'NORMAL_PROGRESSION';
  if (!REVISION_CLASSES.includes(classification)) throw new Error('revision_classification_invalid');
  const physicallyPlausible = ['NEW_OBSERVATION', 'NORMAL_PROGRESSION', 'GEOMETRY_REFINEMENT'].includes(classification) && !flags.length, core = { schemaVersion: 'vigia.progression-revision-classification.v1', stateId: current?.id, previousStateId: previous?.id ?? null, classification, deltaHours, areaRatio: Number.isFinite(areaRatio) ? areaRatio : null, centroidDisplacementKm: Number.isFinite(displacement) ? displacement : null, geometryFingerprint: geometry.fingerprint ?? null, flags, physicallyPlausible };
  return immutable({ ...core, fingerprint: semanticHash('progression-revision-classification', core) });
}

export function materializeProgressionSequence({ incident, geometryResults = [], safety = DEFAULT_PROGRESSION_SAFETY } = {}) {
  const states = [...(incident?.perimeterStates ?? [])].sort((a, b) => Date.parse(a.clocks?.observedAt) - Date.parse(b.clocks?.observedAt) || String(a.id).localeCompare(String(b.id))), geometry = new Map(geometryResults.map((item) => [item.stateId, item])), revisions = states.map((state, index) => classifyProgressionRevision({ current: state, previous: states[index - 1], geometry: geometry.get(state.id) ?? { failures: ['GEOMETRY_RESULT_MISSING'] }, safety })), accepted = revisions.filter((item) => item.physicallyPlausible && item.classification !== 'DUPLICATE');
  const core = { schemaVersion: 'vigia.progression-sequence-factory.v1', incidentId: incident.id, sourceClassification: incident.perimeterSourceClass, safety, revisions, acceptedStateIds: accepted.map((item) => item.stateId), rejectedStateIds: revisions.filter((item) => !accepted.includes(item)).map((item) => item.stateId), rejectionReasons: Object.fromEntries(uniqueSorted(revisions.flatMap((item) => item.flags.concat(item.physicallyPlausible ? [] : [item.classification]))).map((reason) => [reason, revisions.filter((item) => item.flags.includes(reason) || item.classification === reason).length])) };
  return immutable({ ...core, fingerprint: semanticHash('progression-sequence-factory', core) });
}

export function buildHorizonLabels({ incident, sequence, horizons = [1, 3, 6, 12, 24] } = {}) {
  const accepted = new Set(sequence.acceptedStateIds), states = (incident.perimeterStates ?? []).filter((item) => accepted.has(item.id)).sort((a, b) => Date.parse(a.clocks.observedAt) - Date.parse(b.clocks.observedAt)), labels = [], rejected = [];
  for (const issue of states) for (const horizonHours of horizons) { const target = Date.parse(issue.clocks.observedAt) + horizonHours * 3_600_000, toleranceMs = Math.max(1_800_000, horizonHours * 900_000), candidates = states.filter((state) => Date.parse(state.clocks.observedAt) > Date.parse(issue.clocks.observedAt) && Date.parse(state.clocks.availableToVigiaAt) > Date.parse(issue.clocks.availableToVigiaAt)).sort((a, b) => Math.abs(Date.parse(a.clocks.observedAt) - target) - Math.abs(Date.parse(b.clocks.observedAt) - target) || a.id.localeCompare(b.id)), label = candidates[0], difference = label ? Date.parse(label.clocks.observedAt) - target : Infinity;
    const id = semanticHash('decision-foundry-future-label', { incidentId: incident.id, issueStateId: issue.id, horizonHours });
    if (!label || Math.abs(difference) > toleranceMs) { rejected.push({ id, incidentId: incident.id, issueStateId: issue.id, horizonHours, reason: label ? 'NO_HORIZON_COMPATIBLE_REVISION' : 'NO_LATER_CAUSAL_REVISION' }); continue; }
    labels.push({ id, incidentId: incident.id, issueStateId: issue.id, labelStateId: label.id, horizonHours, targetTime: new Date(target).toISOString(), futureGeometry: label.geometry, publicationTime: label.clocks.availableToVigiaAt, source: incident.perimeterSourceClass, maturity: 'PROVISIONAL_ARCHIVED_SNAPSHOT', revisionClassification: sequence.revisions.find((item) => item.stateId === label.id)?.classification, horizonOffsetMinutes: difference / 60_000, toleranceMinutes: toleranceMs / 60_000, knowledgeTimeValidity: 'CAUSAL', qualityState: 'ELIGIBLE' }); }
  const counts = Object.fromEntries(horizons.map((horizon) => [horizon, labels.filter((item) => item.horizonHours === horizon).length])), core = { schemaVersion: 'vigia.future-label-factory.v1', incidentId: incident.id, labels: labels.sort((a, b) => a.id.localeCompare(b.id)), rejections: rejected.sort((a, b) => a.id.localeCompare(b.id)), horizonCounts: counts };
  return immutable({ ...core, fingerprint: semanticHash('future-label-factory', core) });
}

export function assessBaselineSafety({ currentAreaKm2, previousAreaKm2, deltaHours, horizonHours = null, boundaryVelocityKmH, revisionClassification, geometryValid, safety = DEFAULT_PROGRESSION_SAFETY } = {}) {
  const failures = [];
  if (!Number.isFinite(deltaHours) || deltaHours < safety.minimumDeltaHours) failures.push('TIME_DELTA_BELOW_VALIDITY_FLOOR');
  const ratio = Number(previousAreaKm2) > 0 ? Number(currentAreaKm2) / Number(previousAreaKm2) : null;
  if (!Number.isFinite(ratio) || ratio < safety.minimumAreaRatio || ratio > safety.maximumAreaRatio) failures.push('AREA_RATIO_OUTSIDE_SAFETY_ENVELOPE');
  if (!Number.isFinite(boundaryVelocityKmH) || boundaryVelocityKmH < 0 || boundaryVelocityKmH > safety.maximumBoundaryVelocityKmH) failures.push('BOUNDARY_VELOCITY_OUTSIDE_SAFETY_ENVELOPE');
  if (Number.isFinite(horizonHours) && Number.isFinite(deltaHours) && horizonHours > deltaHours * safety.maximumExtrapolationToObservedDeltaRatio) failures.push('EXTRAPOLATION_BEYOND_OBSERVED_HISTORY_ENVELOPE');
  if (Number.isFinite(horizonHours) && horizonHours > safety.maximumSparseHistoryExtrapolationHours) failures.push('SPARSE_HISTORY_HORIZON_UNSUPPORTED');
  if (['CORRECTION', 'MERGE', 'SPLIT', 'INCIDENT_IDENTITY_CHANGE', 'CLOCK_ANOMALY', 'INVALID'].includes(revisionClassification)) failures.push('REVISION_NOT_PHYSICAL_GROWTH');
  if (geometryValid !== true) failures.push('GEOMETRY_NOT_CERTIFIED');
  return immutable({ passed: failures.length === 0, failures: uniqueSorted(failures), safety, areaRatio: ratio });
}
