import { semanticHash } from '../intelligence/shared.mjs';
import { normalizedSource, optionalInstant, stablePlanningId } from './contracts.mjs';
import {
  admissionState, finite, idOf, isCurrentPlanningContext, projectionEnvelope, rows, text, unique,
} from './projection-helpers.mjs';

function routeSourceValid(route, asOf) {
  const source = normalizedSource(route);
  return source.attributable && isCurrentPlanningContext(route, asOf);
}

const EVACUATION_CONSTRAINT_AXES = Object.freeze([
  ['TERRAIN', 'terrainConstraints'],
  ['WEATHER', 'weatherConstraints'],
  ['RESOURCE', 'resourceConstraints'],
]);
const CLEAR_CONSTRAINT_STATES = new Set(['CLEAR', 'SATISFIED', 'ELIGIBLE', 'NO_KNOWN_CONSTRAINT', 'WITHIN_LIMITS', 'AVAILABLE']);
const BLOCKING_CONSTRAINT_STATES = new Set(['BLOCKED', 'UNSAFE', 'INELIGIBLE', 'CLOSED', 'UNAVAILABLE', 'EXCEEDED', 'INSUFFICIENT']);

function evacuationConstraintAssessment(evacuation, route, asOf) {
  const routeId = idOf(route);
  const requiredAxes = new Set(EVACUATION_CONSTRAINT_AXES.map(([axis]) => axis));
  const assessments = EVACUATION_CONSTRAINT_AXES.map(([axis, field]) => {
    if (!requiredAxes.has(axis)) return { axis, state: 'NOT_REQUIRED', eligible: true, records: [], reason: null };
    const supplied = [...rows(evacuation?.[field]), ...rows(route?.[field])].filter((constraint) => {
      const scoped = unique(constraint?.routeIds ?? [constraint?.routeId]);
      return !scoped.length || scoped.includes(routeId);
    });
    if (!supplied.length) return { axis, state: 'UNKNOWN', eligible: false, records: [], reason: `${axis}_CONSTRAINT_ASSESSMENT_REQUIRED` };
    const records = supplied.map((constraint, index) => {
      const source = normalizedSource(constraint), updatedAt = optionalInstant(constraint?.updatedAt ?? constraint?.observedAt ?? constraint?.checkedAt), reportedState = String(constraint?.state ?? constraint?.assessment ?? '').toUpperCase();
      const current = source.attributable && updatedAt && isCurrentPlanningContext({ ...constraint, updatedAt }, asOf);
      const state = !current ? 'UNVERIFIED_OR_STALE' : BLOCKING_CONSTRAINT_STATES.has(reportedState) || constraint?.eligible === false ? 'BLOCKING' : CLEAR_CONSTRAINT_STATES.has(reportedState) || constraint?.eligible === true ? 'CLEAR' : 'UNKNOWN';
      return { constraintId: idOf(constraint, stablePlanningId('evacuation-constraint', { routeId, axis, index, constraint })), axis, state, reportedState: reportedState || null, eligible: state === 'CLEAR', description: text(constraint?.description ?? constraint?.reason), source, updatedAt };
    });
    const blocking = records.some((record) => record.state === 'BLOCKING'), unknown = records.some((record) => record.state === 'UNKNOWN' || record.state === 'UNVERIFIED_OR_STALE');
    return { axis, state: blocking ? 'BLOCKING' : unknown ? 'UNKNOWN' : 'CLEAR', eligible: !blocking && !unknown, records, reason: blocking ? `${axis}_CONSTRAINT_BLOCKS_ROUTE` : unknown ? `${axis}_CONSTRAINT_NOT_ATTRIBUTABLE_CURRENT_OR_DECISIVE` : null };
  });
  return { state: assessments.every((item) => item.eligible) ? 'ELIGIBLE' : 'INELIGIBLE', eligible: assessments.every((item) => item.eligible), requiredAxes: [...requiredAxes], assessments, blockingReasons: assessments.map((item) => item.reason).filter(Boolean) };
}

export function projectEvacuationCorridor({ incidentScenario, evacuation, responseCapability, contexts, asOf }) {
  if (!incidentScenario || !admissionState(incidentScenario)) return projectionEnvelope('vigia.evacuation-corridor-planning.v1', 'WITHHELD_NO_ADMITTED_SCENARIO', null, 'An admitted incident scenario is required for corridor planning.');
  const scenarioSource = normalizedSource(incidentScenario);
  const scenarioValidUntil = optionalInstant(incidentScenario.validUntil);
  if (!scenarioSource.attributable || !text(incidentScenario.admissionReference) || !scenarioValidUntil || Date.parse(scenarioValidUntil) <= Date.parse(asOf)) return projectionEnvelope('vigia.evacuation-corridor-planning.v1', 'WITHHELD_INVALID_SCENARIO_CONTRACT', null, 'The admitted scenario requires an admission reference, attributable provenance, and a future validity bound.');
  const closures = rows(responseCapability?.roadContext?.closures);
  const closedSegments = new Set(closures.flatMap((closure) => closure.segmentIds ?? [closure.segmentId, closure.roadId]).filter(Boolean).map(String));
  const sheltersById = new Map(rows(contexts.shelters).map((shelter) => [idOf(shelter), shelter]).filter(([shelterId]) => shelterId));
  const assessed = rows(evacuation?.routeCandidates).map((route) => {
    const routeId = idOf(route);
    const segments = unique(route.segmentIds ?? route.segments?.map((segment) => idOf(segment) ?? segment));
    const blockedSegments = segments.filter((segment) => closedSegments.has(segment));
    const shelterId = text(route.shelterId);
    const shelter = sheltersById.get(shelterId);
    const shelterSource = normalizedSource(shelter ?? {});
    const shelterUpdatedAt = optionalInstant(shelter?.updatedAt ?? shelter?.observedAt ?? shelter?.checkedAt);
    const shelterState = text(shelter?.operationalState ?? shelter?.availabilityState ?? shelter?.state)?.toUpperCase() ?? 'UNKNOWN';
    const shelterAvailable = ['OPEN_CONFIRMED', 'AVAILABLE_CONFIRMED', 'OPEN'].includes(shelterState)
      && shelterSource.attributable && isCurrentPlanningContext(shelter, asOf);
    const currentState = text(route.currentState ?? route.state)?.toUpperCase() ?? 'UNKNOWN';
    const travelTimeMinutes = finite(route.travelTimeMinutes);
    const constraintAssessment = evacuationConstraintAssessment(evacuation, route, asOf);
    const valid = Boolean(routeId && routeSourceValid(route, asOf) && shelterId && shelterAvailable
      && travelTimeMinutes !== null && travelTimeMinutes >= 0
      && ['OPEN_CONFIRMED', 'ROUTED_AVAILABLE', 'AVAILABLE'].includes(currentState) && !blockedSegments.length && constraintAssessment.eligible);
    return {
      routeId,
      communityId: text(route.communityId),
      shelterId,
      shelterState,
      shelterSource,
      shelterUpdatedAt,
      travelTimeMinutes,
      routeDistanceKm: finite(route.routeDistanceKm ?? route.distanceKm),
      segments,
      blockedSegments,
      currentState,
      source: normalizedSource(route),
      updatedAt: optionalInstant(route.updatedAt ?? route.checkedAt),
      confidence: route.confidence ?? { state: 'NOT_SCORED', score: null },
      assumptions: unique(route.assumptions ?? []),
      constraintAssessment,
      eligible: valid,
      exclusionReason: valid ? null : !routeId ? 'ROUTE_ID_REQUIRED' : !routeSourceValid(route, asOf) ? 'ATTRIBUTABLE_CURRENT_ROUTE_SOURCE_REQUIRED' : !shelter ? 'GOVERNED_SHELTER_REQUIRED' : !shelterAvailable ? 'CURRENT_ATTRIBUTABLE_SHELTER_AVAILABILITY_REQUIRED' : travelTimeMinutes === null || travelTimeMinutes < 0 ? 'NON_NEGATIVE_ROUTE_TRAVEL_TIME_REQUIRED' : blockedSegments.length ? 'ROUTE_INTERSECTS_RECORDED_CLOSURE' : !constraintAssessment.eligible ? constraintAssessment.blockingReasons[0] ?? 'EVACUATION_CONSTRAINTS_NOT_SATISFIED' : 'ROUTE_NOT_CONFIRMED_AVAILABLE',
    };
  });
  const eligible = assessed.filter((route) => route.eligible).sort((left, right) => (left.travelTimeMinutes ?? Number.MAX_SAFE_INTEGER) - (right.travelTimeMinutes ?? Number.MAX_SAFE_INTEGER) || left.routeId.localeCompare(right.routeId));
  if (!eligible.length) return projectionEnvelope('vigia.evacuation-corridor-planning.v1', 'WITHHELD_NO_GOVERNED_OPEN_CORRIDOR', {
    scenarioId: idOf(incidentScenario),
    routesAssessed: assessed,
    closures: closures.map((closure) => ({ id: idOf(closure), segmentIds: unique(closure.segmentIds ?? [closure.segmentId, closure.roadId]), source: normalizedSource(closure), updatedAt: optionalInstant(closure.updatedAt ?? closure.observedAt) })),
    officialEvacuationOrder: false,
    execution: false,
  }, 'No attributable current route to a governed shelter remains confirmed open.');
  const primary = eligible[0];
  const value = {
    generatedAt: asOf,
    scenario: { scenarioId: idOf(incidentScenario), source: scenarioSource, validUntil: scenarioValidUntil, state: 'ADMITTED_SCENARIO' },
    recommendedCorridor: primary,
    alternativeCorridors: eligible.slice(1),
    alternativeCorridor: eligible[1] ?? null,
    blockedRoutes: assessed.filter((route) => !route.eligible),
    blockedSegments: unique(assessed.flatMap((route) => route.blockedSegments)),
    terrainConstraints: primary.constraintAssessment.assessments.find((item) => item.axis === 'TERRAIN')?.records ?? [],
    weatherConstraints: primary.constraintAssessment.assessments.find((item) => item.axis === 'WEATHER')?.records ?? [],
    resourceConstraints: primary.constraintAssessment.assessments.find((item) => item.axis === 'RESOURCE')?.records ?? [],
    constraintAssessment: primary.constraintAssessment,
    decisionDeadline: optionalInstant(evacuation?.decisionDeadline),
    confidence: primary.confidence,
    assumptions: unique([...(evacuation?.assumptions ?? []), ...primary.assumptions]),
    authorityState: 'PLANNING_ONLY_HUMAN_AUTHORITY_REQUIRED',
    officialEvacuationOrder: false,
    officialOrder: false,
    planningOnly: true,
    execution: false,
    truthBoundary: 'A corridor is eligible only when its admitted scenario, current route and shelter, closures, and required terrain, weather, and resource constraints are attributable and satisfied. It remains planning support, not an official evacuation order, dispatch, delivery, acknowledgement, or guarantee of safe passage.',
  };
  const decisionDeadlineReady = value.decisionDeadline && Date.parse(value.decisionDeadline) > Date.parse(asOf);
  return projectionEnvelope('vigia.evacuation-corridor-planning.v1', decisionDeadlineReady ? 'READY_FOR_AUTHORITY_REVIEW' : 'BLOCKED_DECISION_DEADLINE_REQUIRED', { ...value, proposalHash: semanticHash('evacuation-corridor-proposal', value) }, decisionDeadlineReady ? null : 'A future decision deadline is required before authority review.');
}

