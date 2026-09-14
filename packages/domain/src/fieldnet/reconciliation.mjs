import { PRIORITY_CLASSES, TASK_STATES, sha256, stableId, validIso } from './contracts.mjs';

const AUTHORITATIVE_TASK_FIELDS = new Set(['state', 'owner', 'priority', 'dueAt']);
const MUTABLE_TASK_PRIORITIES = new Set(['P2_POSITION','P3_TASK','P4_TELEMETRY','P5_THUMBNAIL','P6_BULK_MEDIA']);

export function sanitizeTaskChanges(changes = {}) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('valid_task_changes_required');
  const keys = Object.keys(changes);
  if (!keys.length) throw new Error('task_changes_required');
  const forbidden = keys.filter((field) => !AUTHORITATIVE_TASK_FIELDS.has(field));
  if (forbidden.length) throw Object.assign(new Error('immutable_task_field'), { details:{ fields:forbidden.sort() } });
  const clean = {};
  if ('state' in changes) { if (!TASK_STATES.includes(changes.state)) throw new Error('invalid_task_state'); clean.state = changes.state; }
  if ('owner' in changes) { if (changes.owner !== null && (typeof changes.owner !== 'string' || !changes.owner.trim() || changes.owner.length > 160)) throw new Error('invalid_task_owner'); clean.owner = changes.owner === null ? null : changes.owner.trim(); }
  if ('priority' in changes) { if (!PRIORITY_CLASSES.includes(changes.priority)) throw new Error('invalid_priority_class');if(!MUTABLE_TASK_PRIORITIES.has(changes.priority))throw Object.assign(new Error('protected_task_priority_forbidden'),{statusCode:403});clean.priority = changes.priority; }
  if ('dueAt' in changes) clean.dueAt = changes.dueAt === null ? null : validIso(changes.dueAt, 'invalid_task_due_at');
  return Object.freeze(clean);
}

export function mutableTaskProjection(task = {}) {
  return sanitizeTaskChanges(Object.fromEntries([...AUTHORITATIVE_TASK_FIELDS].filter((field) => Object.hasOwn(task, field)).map((field) => [field, task[field]])));
}

export function compareTaskMutation({ task, baseVersion, changes = {}, actor, mutationId }) {
  if (!Number.isInteger(baseVersion) || baseVersion < 1) throw new Error('valid_base_version_required');
  const safeChanges = sanitizeTaskChanges(changes);
  const conflictingFields = Object.keys(safeChanges).filter((field) => baseVersion !== task.version && safeChanges[field] !== task[field]);
  if (!conflictingFields.length) return { outcome: baseVersion === task.version ? 'APPLY' : 'AUTO_MERGE', conflictingFields: [], applied: { ...task, ...safeChanges, taskId:task.taskId, incidentId:task.incidentId, schemaVersion:task.schemaVersion, version: task.version + 1 }, changes:safeChanges };
  const conflictId = stableId('reconciliation-conflict', task.taskId, mutationId, baseVersion, task.version);
  return { outcome: 'CONFLICT', conflictingFields, conflict: { schemaVersion: 'vigia.reconciliation-conflict.v1', conflictId, incidentId: task.incidentId, subjectType: 'FIELD_TASK', subjectId: task.taskId,
    versions: [{ origin: 'CURRENT_LOCAL', version: task.version, actor: task.lastActor ?? null, values: Object.fromEntries(conflictingFields.map((field) => [field, task[field]])) }, { origin: 'OFFLINE_MUTATION', version: baseVersion, actor, values: Object.fromEntries(conflictingFields.map((field) => [field, safeChanges[field]])) }],
    causalRelationship: 'CONCURRENT_OR_STALE_BASE', conflictingFields, recommendedMergePossibilities: conflictingFields.includes('state') ? ['KEEP_CURRENT', 'ACCEPT_OFFLINE', 'CREATE_FOLLOWUP_TASK'] : ['FIELD_BY_FIELD'],
    resolutionRequirement: 'HUMAN_REQUIRED', state: 'OPEN' }, changes:safeChanges };
}

export function observationRelationship(left, right) {
  const a = left?.payload ?? {}, b = right?.payload ?? {};
  if (!a.subjectKey || a.subjectKey !== b.subjectKey) return 'UNRELATED';
  if (!a.claimField || a.claimField !== b.claimField) return 'REFINES';
  if (a.claimValue === undefined || b.claimValue === undefined) return 'UNRESOLVED';
  return a.claimValue === b.claimValue ? 'SUPPORTS' : 'CONTRADICTS';
}

export function createConflictResolutionPlan(conflict = {}, { observations = [], now = new Date() } = {}) {
  const conflictId = String(conflict.conflictId ?? conflict.id ?? '');
  if (!conflictId) throw new Error('conflict_id_required');
  const dimensions = [...new Set(conflict.conflictingFields ?? observations.map((item) => item.payload?.claimField).filter(Boolean))];
  const sources = conflict.versions ?? observations.map((item) => ({ origin:item.originNode ?? item.sourceIdentity?.id ?? item.deviceId, actor:item.observerIdentity ?? null, observedAt:item.observedAt, geometry:item.geometry, qualification:item.physicalFamilyQualification ?? item.sourceIdentity?.qualification ?? 'UNASSESSED' }));
  const origins = new Set(sources.map((item) => item.origin).filter(Boolean));
  const times = sources.map((item) => Date.parse(item.observedAt ?? item.at ?? '')).filter(Number.isFinite);
  const geometries = sources.map((item) => item.geometry?.coordinates).filter((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
  const planCore = {
    schemaVersion:'vigia.conflict-resolution-plan.v1',
    conflictId,
    incidentId:conflict.incidentId ?? null,
    subject:{ type:conflict.subjectType ?? 'UNKNOWN', id:conflict.subjectId ?? null },
    conflictingDimensions:dimensions,
    sourceAssessment:{ sourceCount:sources.length, distinctOrigins:origins.size, independence:origins.size >= 2 ? 'DISTINCT_ORIGINS_NOT_YET_PROVEN_INDEPENDENT' : 'NOT_INDEPENDENT_OR_UNKNOWN', qualifications:sources.map((item) => item.qualification ?? 'UNASSESSED') },
    timeSeparation:{ state:times.length >= 2 ? 'MEASURED' : 'UNKNOWN', milliseconds:times.length >= 2 ? Math.max(...times) - Math.min(...times) : null },
    spatialSeparation:{ state:geometries.length >= 2 ? 'MEASURED' : 'UNKNOWN', meters:geometries.length >= 2 ? maxPointDistance(geometries) : null },
    nextUsefulEvidence:nextEvidenceFor(dimensions),
    responsibility:{ automatic:'Validate identity, timing, geometry, source qualification and whether new evidence covers every conflicting dimension.', human:'Interpret operational meaning or choose among concurrent command/task values when physical evidence cannot decide.' },
    resolutionContract:{ required:['ATTRIBUTABLE_EVIDENCE_ID','OBSERVATION_TIME','QUALIFIED_SOURCE','INDEPENDENT_FAILURE_MODE','ALL_CONFLICTING_DIMENSIONS_COVERED'], prohibits:['SOURCE_PRECEDENCE_WITHOUT_EVIDENCE','SILENT_OVERWRITE'], originalValuesRemainImmutable:true },
    state:'OPEN_PRESERVED',
    createdAt:validIso(now)
  };
  return Object.freeze({ ...planCore, planHash:sha256(planCore) });
}

export function appendConflictResolutionEvidence(plan = {}, evidence = {}, { now = new Date() } = {}) {
  if (plan.schemaVersion !== 'vigia.conflict-resolution-plan.v1' || !plan.planHash) throw new Error('conflict_resolution_plan_required');
  const covered = new Set(evidence.coveredDimensions ?? []), required = plan.conflictingDimensions ?? [];
  const attributable = Boolean(evidence.evidenceId) && Number.isFinite(Date.parse(evidence.observedAt ?? ''));
  const qualified = evidence.sourceQualification === 'QUALIFIED' && evidence.independentFailureMode === true;
  const complete = required.length > 0 && required.every((dimension) => covered.has(dimension));
  const resolved = attributable && qualified && complete;
  const resultCore = { schemaVersion:'vigia.conflict-resolution-result.v1', conflictId:plan.conflictId, planHash:plan.planHash, state:resolved ? 'RESOLVED_BY_NEW_ATTRIBUTABLE_EVIDENCE' : 'PRESERVED_UNRESOLVED', evidenceId:evidence.evidenceId ?? null, observedAt:Number.isFinite(Date.parse(evidence.observedAt ?? '')) ? validIso(evidence.observedAt) : null, coveredDimensions:[...covered], sourceQualification:evidence.sourceQualification ?? 'UNASSESSED', independentFailureMode:evidence.independentFailureMode === true, resolvedValue:resolved ? evidence.resolvedValue ?? null : null, reason:resolved ? 'New qualified independent evidence covers every conflicting dimension.' : 'Evidence does not satisfy the frozen resolution contract; conflict is preserved.', appendedAt:validIso(now), originalValuesModified:false };
  return Object.freeze({ ...resultCore, resultHash:sha256(resultCore) });
}

function nextEvidenceFor(dimensions) {
  if (dimensions.includes('state')) return ['Attributable current task-state observation', 'Canonical command acknowledgement with causal timestamp'];
  if (dimensions.some((item) => /location|geometry/i.test(item))) return ['Verified GNSS observation with horizontal uncertainty', 'Independent geospatial corroboration'];
  return ['New attributable observation addressing every conflicting dimension', 'Qualified human adjudication if physical evidence cannot decide'];
}
function maxPointDistance(points) { let maximum = 0; for (let left = 0; left < points.length; left += 1) for (let right = left + 1; right < points.length; right += 1) { const latitude = (points[left][1] + points[right][1]) / 2 * Math.PI / 180; maximum = Math.max(maximum, Math.hypot((points[left][0] - points[right][0]) * 111_320 * Math.cos(latitude), (points[left][1] - points[right][1]) * 110_540)); } return Number(maximum.toFixed(1)); }
