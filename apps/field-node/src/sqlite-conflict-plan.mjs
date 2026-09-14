const observationGeometry = (version) => version?.geometry ?? version?.subject?.geometry ?? null;

const timeSeparationMs = (versions) => {
  const times = versions.map((version) => Date.parse(version.observedAt ?? version.createdAt)).filter(Number.isFinite);
  return times.length > 1 ? Math.max(...times) - Math.min(...times) : null;
};

const spatialSeparationM = (versions) => {
  const points = versions.map((version) => observationGeometry(version)?.coordinates).filter((coordinate) => Array.isArray(coordinate));
  if (points.length < 2) return null;
  const [left, right] = points;
  const meanLatitude = (left[1] + right[1]) * Math.PI / 360;
  return Math.round(Math.hypot((left[0] - right[0]) * 111_320 * Math.cos(meanLatitude), (left[1] - right[1]) * 111_320));
};

export function withResolutionPlan(conflict) {
  if (conflict.resolutionPlan) return conflict;
  const versions = conflict.versions ?? [];
  const fieldObservation = conflict.subjectType === 'FIELD_OBSERVATION';
  const separationM = spatialSeparationM(versions);
  return {
    ...conflict,
    resolutionPlan: {
      schemaVersion: 'vigia.fieldnet-conflict-resolution-plan.v1',
      dimensions: conflict.conflictingFields ?? [],
      involvedEvidence: versions.map((version) => version.observationId ?? `${version.origin ?? 'version'}:${version.version ?? 'unknown'}`),
      spatialSeparationM: separationM,
      spatialOverlap: separationM == null ? 'NOT_COMPUTABLE' : separationM <= Math.max(...versions.map((version) => Number(version.horizontalUncertaintyM ?? 0))) ? 'UNCERTAINTY_ENVELOPES_OVERLAP' : 'SEPARATE_POSITIONS',
      timeSeparationMs: timeSeparationMs(versions),
      sourceQualifications: versions.map((version) => ({ evidenceId: version.observationId ?? version.origin ?? null, sourceKind: version.sourceIdentity?.kind ?? version.origin ?? 'UNKNOWN', physicalFamilyQualification: version.physicalFamilyQualification ?? 'NOT_APPLICABLE', clockQuality: version.deviceClockQuality ?? 'NOT_RECORDED' })),
      possibleResolutionEvidence: fieldObservation ? ['INDEPENDENT_FIELD_OBSERVATION', 'QUALIFIED_FIELD_SENSOR_OBSERVATION', 'GEOLOCATED_MEDIA_WITH_OPERATOR_IDENTITY'] : ['AUTHORIZED_TASK_VERSION_DECISION'],
      recommendedVerificationTask: fieldObservation ? 'Observe the same subject independently from a non-coincident approach and preserve location, time, observer, and raw evidence.' : 'Review both causal task versions and record the authorized operational state.',
      responsibility: fieldObservation ? { system: 'PROPOSE_AND_PRESERVE', humanOrNewEvidence: 'RESOLVE' } : { system: 'PRESERVE', humanAuthority: 'RESOLVE' },
      closesWhen: fieldObservation ? 'Independent evidence resolves the conflicting dimension or an authorized operator records context dependence.' : 'An authorized operator selects or replaces the task state with rationale.'
    }
  };
}
