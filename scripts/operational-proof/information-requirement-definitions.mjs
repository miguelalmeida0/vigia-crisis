const rows = (value) => Array.isArray(value) ? value : [];

export function buildSchedulerBaseline(runtime, now) {
  return rows(runtime.sourceResolutionJobs).map((job) => ({
    id: job.requirementId,
    incidentId: job.incidentId,
    question: job.decisionImpact ?? job.requirementType,
    decisionBlocked: job.decisionImpact ?? null,
    priority: null,
    state: ['COMPLETED', 'SATISFIED'].includes(job.state)
      ? 'SATISFIED'
      : job.state === 'BLOCKED_AUTHORITY' ? 'BLOCKED_AUTHORITY' : 'COLLECTING',
    createdAt: job.createdAt,
    deadline: job.deadlineAt,
    collectionPlanId: `plan:${job.requirementId}`,
    taskCount: 1,
    tasksAttempted: Number(job.attemptCount ?? 0) > 0 ? 1 : 0,
    qualifyingEvidenceCount: ['COMPLETED', 'SATISFIED'].includes(job.state) ? 1 : 0,
    lastAttemptAt: job.lastAttemptAt,
    nextAttemptAt: job.nextCheckAt,
    terminalReason: job.lastResult?.failureClass ?? null,
    satisfactionRule: job.completionCriteria ?? job.unlockCondition,
    satisfiedAt: ['COMPLETED', 'SATISFIED'].includes(job.state) ? job.lastAttemptAt : null,
    incidentRevisionBefore: null,
    incidentRevisionAfter: null,
    sourceResolutionJobId: job.jobId,
    requiredEvidenceClasses: String(job.requiredSourceClass ?? '').split(/\s*\+\s*/).filter(Boolean),
    capturedAt: now(),
    truthBoundary: 'Baseline preserves the pre-release source-resolution requirement exactly; it does not infer satisfaction from a provider response or task state.',
  }));
}

export const informationRequirementDefinitions = Object.freeze([
  { key: 'GOVERNED_GEOLOCATION', question: 'What governed incident coordinate anchors operator context?', value: (row) => ({ coordinate: row.incident.coordinate, recordId: row.incident.id, observedAt: row.incident.updatedAt }), source: 'Canonical incident projection' },
  { key: 'TERRAIN_CONTEXT', question: 'What governed terrain context is available at the incident coordinate?', value: (_row, context) => context.terrain?.state === 'AVAILABLE' ? context.terrain : null, source: 'EU-DEM v1.1 through OpenTopoData' },
  { key: 'WEATHER_ASSOCIATION', question: 'Is a weather record explicitly classified for this incident coordinate?', value: (row) => ['INCIDENT_ASSOCIATED', 'REGIONAL_CONTEXT'].includes(row.weatherAssociation?.state) ? row.weatherAssociation : null, source: 'Canonical IPMA weather-association projection' },
  { key: 'THERMAL_OBSERVATION', question: 'Is a current incident-matched thermal observation admitted?', value: (row) => rows(row.sourceCoverage).some((item) => item.familyClass === 'PHYSICAL' && item.current === true) ? { families: rows(row.sourceCoverage).filter((item) => item.familyClass === 'PHYSICAL' && item.current === true) } : null, source: 'Canonical physical-observation fabric' },
  { key: 'INDEPENDENT_CORROBORATION', question: 'Are at least two distinct qualifying causal source families admitted?', value: (row) => rows(row.sourceCoverage).filter((item) => item.qualifying === true).length >= 2 ? { families: rows(row.sourceCoverage).filter((item) => item.qualifying === true) } : null, source: 'Canonical source-family qualification' },
  { key: 'OFFICIAL_STATUS', question: 'Is a current incident-matched official authority record admitted?', value: (row) => rows(row.sourceCoverage).some((item) => item.familyClass === 'OFFICIAL' && item.current === true && item.qualifying === true) ? { families: rows(row.sourceCoverage).filter((item) => item.familyClass === 'OFFICIAL' && item.current === true && item.qualifying === true) } : null, source: 'Canonical official-authority adapter' },
  { key: 'GEOMETRY_EXTENT', question: 'Is a non-thermal observed extent or official perimeter admitted?', value: (row) => row.spatialTruth?.officialPerimeter ?? row.spatialTruth?.observedDerivedExtent ?? null, source: 'Canonical spatial-truth projection' },
  { key: 'FIELD_VERIFICATION', question: 'Is an incident-matched FieldNet field-verification record admitted?', value: (row) => rows(row.sourceCoverage).some((item) => item.sourceId === 'fieldnet' && item.current === true && item.qualifying === true) ? { families: rows(row.sourceCoverage).filter((item) => item.sourceId === 'fieldnet' && item.current === true && item.qualifying === true) } : null, source: 'VIGIA FieldNet canonical ledger' },
  { key: 'COMMUNITY_CONTEXT', question: 'What is the closest mapped community to the incident coordinate?', value: (_row, context) => context.pointContext?.community, source: 'OpenStreetMap contributors' },
  { key: 'MAJOR_ROAD_CONTEXT', question: 'What is the closest mapped major-road feature center to the incident coordinate?', value: (_row, context) => context.pointContext?.majorRoad, source: 'OpenStreetMap contributors' },
  { key: 'EMERGENCY_ACCESS_CONTEXT', question: 'What is the closest mapped fire-station or medical-access point?', value: (_row, context) => context.pointContext?.fireStation ?? context.pointContext?.medicalAccess, source: 'OpenStreetMap contributors' },
  { key: 'PROTECTED_AREA_CONTEXT', question: 'What is the closest mapped protected-area feature center?', value: (_row, context) => context.pointContext?.protectedArea, source: 'OpenStreetMap contributors' },
  { key: 'WILDFIRE_LAND_CONTEXT', question: 'What retained wildfire-relevant land or heat-source context is closest?', value: (_row, context) => context.pointContext?.wildfireRelevantAsset, source: 'Retained governed Portugal thermal-context reference' },
]);
