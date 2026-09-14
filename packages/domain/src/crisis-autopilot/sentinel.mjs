import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { isActiveWork, objectId, requiredProjectionClock, stateOf, validInstant, workNextCheck, workOwner, workSource } from './contracts.mjs';

const DEGRADED = new Set(['DEGRADED', 'UNAVAILABLE', 'FAILED', 'STALE', 'SILENT', 'COMPROMISED']);
const ACTIVE = new Set(['ACTIVE', 'READY', 'HEALTHY', 'CURRENT']);
const EXPLICIT_NEGATIVE_THERMAL = new Set(['OBSERVED_NEGATIVE', 'NO_DETECTION', 'NO_THERMAL_SIGNAL', 'ZERO_RESULT']);

function anomaly(type, inputs, asOf) {
  const material = {
    type,
    incidentId: inputs.incidentId,
    affectedObjectIds: [...new Set((inputs.affectedObjectIds ?? []).filter(Boolean).map(String))].sort(),
    reason: inputs.reason,
    mayAffect: [...new Set((inputs.mayAffect ?? []).filter(Boolean).map(String))].sort(),
    evidenceReferences: [...new Set((inputs.evidenceReferences ?? []).filter(Boolean).map(String))].sort(),
  };
  return {
    schemaVersion: 'vigia.unknown-unknown-anomaly.v1',
    anomalyId: semanticHash('unknown-unknown-anomaly', material),
    detectedAt: asOf,
    state: 'OPEN_INDICATOR',
    ...material,
    currentWork: inputs.currentWork ?? null,
    whatVigiaIsDoingNext: inputs.currentWork ? 'MONITOR_BACKING_RESOLUTION_WORK' : inputs.nextAction ?? 'OPEN_TARGETED_REVIEW',
    truthEffect: 'NONE',
    qualification: 'Anomaly indicator only. It may trigger collection or review but does not change canonical incident truth.',
  };
}

function resolutionWork(kind, reference, work, asOf) {
  const candidate = work.find((item) => isActiveWork(item, { asOf }) && [item.anomalyType, item.kind, item.sourceId, item.assignmentId, item.requirement].filter(Boolean).map((value) => String(value).toUpperCase()).some((value) => value.includes(String(reference ?? kind).toUpperCase()))) ?? null;
  if (!candidate) return null;
  return { id: objectId(candidate), state: stateOf(candidate), owner: workOwner(candidate), source: workSource(candidate), nextCheckAt: workNextCheck(candidate) };
}

function sourceTimestamp(source, keys, asOf) {
  for (const key of keys) {
    const value = validInstant(source[key]);
    if (value && Date.parse(value) <= Date.parse(asOf)) return value;
  }
  return null;
}

function futureSourceTimestamps(source, asOf) {
  return ['lastObservationAt', 'latestObservationAt', 'lastSuccessAt', 'latestSuccess', 'lastPositiveAt', 'lastCompletedOpportunityAt']
    .flatMap((key) => {
      const value = validInstant(source[key]);
      return value && Date.parse(value) > Date.parse(asOf) ? [{ key, value }] : [];
    });
}

function sourceRole(source) {
  const value = [source.familyClass, source.sourceClass, source.familyId, source.sourceFamily, source.sourceId, source.id, source.platform, source.instrument]
    .filter(Boolean).join(' ').toUpperCase();
  return {
    official: /OFFICIAL|AUTHORITY|\bCAP\b/u.test(value),
    satelliteThermal: /SATELLITE|THERMAL|VIIRS|MODIS|FIRMS|SENTINEL|SLSTR/u.test(value),
  };
}

function expectedSourceSilence(source, asOf) {
  const expected = validInstant(source.nextExpectedAt ?? source.expectedNextAt ?? source.nextCheckAt);
  if (!expected || Date.parse(expected) >= Date.parse(asOf)) return false;
  const last = sourceTimestamp(source, ['lastObservationAt', 'lastSuccessAt', 'latestSuccess'], asOf);
  return !last || Date.parse(last) < Date.parse(expected);
}

function thermalDisappeared(source, asOf) {
  if (!sourceRole(source).satelliteThermal) return null;
  const positiveAt = sourceTimestamp(source, ['lastPositiveAt', 'previousPositiveAt'], asOf);
  const completedAt = sourceTimestamp(source, ['lastCompletedOpportunityAt', 'latestObservationAt', 'lastObservationAt'], asOf);
  const resultState = stateOf({ state: source.latestObservationState ?? source.latestResultState ?? source.thermalSignalState });
  const explicitNegative = EXPLICIT_NEGATIVE_THERMAL.has(resultState) || Number(source.consecutiveZeroResultCount ?? 0) >= 2;
  if (!positiveAt || !completedAt || Date.parse(completedAt) <= Date.parse(positiveAt) || !explicitNegative) return null;
  const cadence = Math.max(0, Number(source.expectedCadenceMs ?? source.expectedIntervalMs ?? 0));
  const suddenWindowMs = cadence ? Math.max(cadence * 3, 60 * 60_000) : 6 * 60 * 60_000;
  if (Date.parse(completedAt) - Date.parse(positiveAt) > suddenWindowMs) return null;
  return { positiveAt, completedAt, resultState, suddenWindowMs };
}

export function projectUnknownUnknownSentinel({ incident = {}, intelligence = {}, sourceStates = [], assignments = [], requiredContext = {}, protection = {}, resolutionWork: work = [], asOf } = {}) {
  asOf = requiredProjectionClock(asOf);
  const incidentId = String(incident.id ?? incident.incidentId), rows = [];
  for (const source of sourceStates) {
    const sourceId = String(source.sourceId ?? source.id ?? 'unknown-source'), state = stateOf(source);
    const futureTimestamps = futureSourceTimestamps(source, asOf);
    if (futureTimestamps.length) rows.push(anomaly('SOURCE_STATE_FUTURE_DATED', { incidentId, affectedObjectIds: [sourceId], reason: `Source state contains ${futureTimestamps.length} timestamp(s) after the projection clock; those values are excluded from anomaly resolution.`, mayAffect: ['SOURCE_FRESHNESS', 'AS_OF_INTEGRITY'], evidenceReferences: [source.healthEventId], currentWork: resolutionWork('SOURCE_TIME_INTEGRITY', sourceId, work, asOf), nextAction: 'OPEN_SOURCE_TIME_INTEGRITY_REVIEW' }, asOf));
    if (expectedSourceSilence(source, asOf)) {
      const currentWork = resolutionWork('PROVIDER_FAILURE', sourceId, work, asOf);
      rows.push(anomaly('EXPECTED_PROVIDER_SILENT', { incidentId, affectedObjectIds: [sourceId], reason: `Expected update at ${validInstant(source.nextExpectedAt ?? source.expectedNextAt ?? source.nextCheckAt)} was not followed by a newer attributable observation.`, mayAffect: source.mayAffect ?? ['SOURCE_COVERAGE', 'FRESHNESS'], evidenceReferences: [source.healthEventId, source.latestObservationId], currentWork, nextAction: 'TASK_ALTERNATIVE_SOURCE_OR_REVIEW_PROVIDER' }, asOf));
    } else if (DEGRADED.has(state)) {
      const currentWork = resolutionWork('PROVIDER_FAILURE', sourceId, work, asOf);
      rows.push(anomaly('PROVIDER_DEGRADED', { incidentId, affectedObjectIds: [sourceId], reason: `Provider state is ${state}; liveness is not treated as usable incident coverage.`, mayAffect: source.mayAffect ?? ['SOURCE_COVERAGE'], evidenceReferences: [source.healthEventId], currentWork, nextAction: 'TASK_ALTERNATIVE_SOURCE_OR_REVIEW_PROVIDER' }, asOf));
    }
    const disappearance = thermalDisappeared(source, asOf);
    if (disappearance) {
      const currentWork = resolutionWork('THERMAL_DISAPPEARANCE', sourceId, work, asOf);
      rows.push(anomaly('THERMAL_SIGNAL_DISAPPEARED', { incidentId, affectedObjectIds: [sourceId], reason: `An attributable positive thermal signal at ${disappearance.positiveAt} was followed by ${disappearance.resultState} at ${disappearance.completedAt} within the configured sudden-change window. This does not establish fire extinction.`, mayAffect: ['INCIDENT_FRESHNESS', 'THERMAL_TREND', 'DECISION_CONFIDENCE'], evidenceReferences: [source.lastPositiveObservationId, source.latestObservationId, source.latestOpportunityId], currentWork, nextAction: 'TASK_INDEPENDENT_THERMAL_OR_FIELD_CONFIRMATION' }, asOf));
    }
  }
  const officialStale = sourceStates.filter((source) => sourceRole(source).official && ['STALE', 'SILENT', 'UNAVAILABLE'].includes(stateOf(source)));
  const satelliteActive = sourceStates.filter((source) => sourceRole(source).satelliteThermal && ACTIVE.has(stateOf(source)) && sourceTimestamp(source, ['lastObservationAt', 'latestObservationAt', 'lastSuccessAt'], asOf));
  if (officialStale.length && satelliteActive.length) {
    const officialIds = officialStale.map((source) => String(source.sourceId ?? source.id)).filter(Boolean).sort();
    const satelliteIds = satelliteActive.map((source) => String(source.sourceId ?? source.id)).filter(Boolean).sort();
    const currentWork = resolutionWork('OFFICIAL_SOURCE_STALE', officialIds[0], work, asOf);
    rows.push(anomaly('OFFICIAL_FEED_STALE_WHILE_SATELLITE_ACTIVE', { incidentId, affectedObjectIds: [...officialIds, ...satelliteIds], reason: 'At least one attributable official source is stale or unavailable while a satellite thermal source has a current attributable observation. Satellite activity cannot substitute for official confirmation.', mayAffect: ['OFFICIAL_CONFIRMATION', 'INCIDENT_VERIFICATION', 'AUTHORITY_READINESS'], evidenceReferences: [...officialStale.map((source) => source.healthEventId), ...satelliteActive.map((source) => source.latestObservationId)], currentWork, nextAction: 'TASK_OFFICIAL_SOURCE_RESOLUTION_WITHOUT_PROMOTION' }, asOf));
  }
  if (intelligence?.situation?.underlyingState === 'PHYSICAL_REPORT_CONFLICT' || intelligence?.situation?.state === 'PHYSICAL_REPORT_CONFLICT') {
    const currentWork = resolutionWork('SOURCE_CONFLICT', incidentId, work, asOf);
    rows.push(anomaly('ATTRIBUTABLE_SOURCE_CONFLICT', { incidentId, affectedObjectIds: [incidentId], reason: 'The canonical intelligence projection reports attributable physical/report disagreement.', mayAffect: ['INCIDENT_VERIFICATION', 'DECISION_READINESS'], evidenceReferences: intelligence.situation.contradictingEvidenceIds, currentWork, nextAction: 'OPEN_TARGETED_CONFLICT_RESOLUTION_COLLECTION' }, asOf));
  }
  for (const assignment of assignments) {
    const due = validInstant(assignment.acknowledgementDueAt ?? assignment.ackDueAt), acknowledged = assignment.acknowledgement ?? assignment.acknowledgedAt ?? assignment.receipt;
    if (due && Date.parse(due) < Date.parse(asOf) && !acknowledged && !['CANCELLED', 'SUPERSEDED', 'COMPLETED'].includes(stateOf(assignment))) {
      const id = objectId(assignment), currentWork = resolutionWork('RESOURCE_ACKNOWLEDGEMENT', id, work, asOf);
      rows.push(anomaly('RESOURCE_ACKNOWLEDGEMENT_MISSING', { incidentId, affectedObjectIds: [id], reason: `No persisted acknowledgement receipt is present after ${due}.`, mayAffect: ['ASSIGNMENT_READINESS', 'RESOURCE_PLAN'], evidenceReferences: [], currentWork, nextAction: 'ESCALATE_ASSIGNMENT_ACKNOWLEDGEMENT' }, asOf));
    }
  }
  const priority = String(incident.priorityState ?? incident.priority?.state ?? incident.priority?.band ?? '').toUpperCase();
  if (['P0', 'P1', 'HIGH', 'CRITICAL', 'LIFE_SAFETY'].includes(priority) && !(incident.owner ?? incident.ownerId ?? incident.commandOwner)) {
    const currentWork = resolutionWork('OWNER', incidentId, work, asOf);
    rows.push(anomaly('HIGH_PRIORITY_INCIDENT_WITHOUT_OWNER', { incidentId, affectedObjectIds: [incidentId], reason: `Incident priority is ${priority}, but no canonical human owner is attached.`, mayAffect: ['HUMAN_ATTENTION', 'DECISION_ACCOUNTABILITY'], evidenceReferences: [incident.priority?.decisionId], currentWork, nextAction: 'CREATE_HUMAN_ATTENTION_OWNER_ITEM' }, asOf));
  }
  for (const key of ['roads', 'weather']) {
    const requirement = requiredContext[key];
    if (requirement?.required === true && requirement.available !== true) {
      const currentWork = resolutionWork(key.toUpperCase(), incidentId, work, asOf);
      rows.push(anomaly(`${key.toUpperCase()}_CONTEXT_MISSING`, { incidentId, affectedObjectIds: [incidentId], reason: requirement.reason ?? `${key} context is explicitly required and not present in the governed incident context.`, mayAffect: requirement.mayAffect ?? (key === 'roads' ? ['ACCESS_PLANNING', 'RESPONSE_REACHABILITY'] : ['WATCH_CONDITIONS', 'SCENARIO_EVALUATION']), evidenceReferences: requirement.evidenceReferences, currentWork, nextAction: `OPEN_${key.toUpperCase()}_CONTEXT_REQUIREMENT` }, asOf));
    }
  }
  if (protection.thresholdReached === true && !protection.authorityItem) {
    const currentWork = resolutionWork('PROTECTION', incidentId, work, asOf);
    rows.push(anomaly('PROTECTION_THRESHOLD_WITHOUT_AUTHORITY_ITEM', { incidentId, affectedObjectIds: [incidentId], reason: protection.thresholdReason ?? 'A governed protection threshold is marked reached without a linked authority-review item.', mayAffect: ['PROTECTION_DECISION'], evidenceReferences: protection.thresholdEvidenceIds, currentWork, nextAction: 'PREPARE_AUTHORITY_REVIEW_ITEM_WITHOUT_SENDING' }, asOf));
  }
  const unique = [...new Map(rows.map((item) => [item.anomalyId, item])).values()].sort((left, right) => left.type.localeCompare(right.type) || left.anomalyId.localeCompare(right.anomalyId));
  return immutable({
    schemaVersion: 'vigia.unknown-unknown-sentinel.v1', generatedAt: asOf,
    state: unique.length ? 'ANOMALY_INDICATORS_AVAILABLE' : 'NO_ANOMALY_INDICATOR',
    anomalies: unique,
    counts: { openIndicators: unique.length, withActiveResolutionWork: unique.filter((item) => item.currentWork).length, requiringNewResolutionWork: unique.filter((item) => !item.currentWork).length },
    reason: unique.length ? null : 'No deterministic anomaly rule was triggered by the governed inputs available at the projection clock.',
    unlockCondition: unique.length ? null : 'A governed source, context, assignment, acknowledgement, or protection input triggers a deterministic anomaly rule.',
    owner: 'VIGIA_UNKNOWN_UNKNOWN_SENTINEL',
    source: 'CANONICAL_SOURCE_CONTEXT_AND_OPERATIONAL_LIFECYCLES',
    qualification: 'Sentinel output is deterministic anomaly screening. Silence, conflict, missing context, and missing acknowledgement remain indicators—not negative observations, incident facts, or evidence of operational failure.',
  });
}
