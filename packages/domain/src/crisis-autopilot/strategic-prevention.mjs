import { instant, object, rows, state, strategicId, text, truthSource } from './strategic-helpers.mjs';

const STRATEGIC_AXES = Object.freeze([
  'fuelContinuity', 'terrain', 'roads', 'waterPoints', 'population', 'shelters',
  'communityCommunications', 'evacuationBottlenecks', 'powerDependencies',
  'telecomDependencies', 'historicalIncidents', 'sensorBlindSpots', 'dangerousWeatherWindows',
]);

function riskAxis(name, value, asOf) {
  if (value === undefined || value === null) return {
    axis: name, state: 'UNKNOWN', value: null, source: null, observedAt: null,
    validUntil: null, temporalState: 'NO_INPUT', reason: 'No governed regional input is attached.',
  };
  const source = truthSource(value), observedAt = instant(value.observedAt ?? value.updatedAt ?? value.retrievedAt);
  const validUntil = instant(value.validUntil ?? value.reviewBy), future = observedAt && Date.parse(observedAt) > Date.parse(asOf);
  return {
    axis: name,
    state: future ? 'FUTURE_INPUT_EXCLUDED' : source ? state(value.state ?? value.status ?? 'RECORDED_CONTEXT') : 'UNATTRIBUTED',
    value: future ? null : structuredClone(value.value ?? value.measurement ?? value),
    source: future ? null : source, observedAt: future ? null : observedAt, validUntil: future ? null : validUntil,
    temporalState: future ? 'FUTURE_EXCLUDED' : !observedAt ? 'OBSERVATION_TIME_UNKNOWN' : validUntil && Date.parse(validUntil) < Date.parse(asOf) ? 'EXPIRED' : 'AVAILABLE_AT_AS_OF',
    reason: future ? 'The regional input was not available at the projection clock.' : source ? text(value.reason) : 'Context without an attributable source/reference cannot support a prevention recommendation.',
  };
}

function campaignFor(axis, region, asOf) {
  const proposalByAxis = {
    sensorBlindSpots: ['SENSOR_PLACEMENT_REVIEW', 'Review sensor placement or source redundancy for the documented blind spot.'],
    roads: ['ROAD_ACCESS_RESILIENCE_REVIEW', 'Review weak emergency access, alternate routing, and exercise requirements.'],
    waterPoints: ['WATER_SUPPORT_RESILIENCE_REVIEW', 'Review water-support coverage and governed refill-point verification.'],
    shelters: ['SHELTER_CAPACITY_REVIEW', 'Review shelter coverage and obtain current capacity evidence.'],
    communityCommunications: ['COMMUNITY_COMMUNICATION_REVIEW', 'Review trusted multilingual communication and acknowledgement paths.'],
    evacuationBottlenecks: ['EVACUATION_EXERCISE_REVIEW', 'Review a corridor exercise around the documented bottleneck.'],
    powerDependencies: ['POWER_REDUNDANCY_REVIEW', 'Review the documented power dependency and continuity options.'],
    telecomDependencies: ['TELECOM_REDUNDANCY_REVIEW', 'Review the documented communications dependency and alternate path.'],
  }[axis.axis];
  if (!proposalByAxis || !axis.source || axis.temporalState !== 'AVAILABLE_AT_AS_OF' || !axis.validUntil
    || Date.parse(axis.validUntil) <= Date.parse(asOf) || !/GAP|DEGRADED|WEAK|BLIND|INSUFFICIENT|SINGLE_POINT|UNKNOWN/.test(axis.state)) return null;
  return {
    recommendationId: strategicId('resilience-recommendation', { region, axis: axis.axis, source: axis.source }),
    type: proposalByAxis[0], recommendation: proposalByAxis[1], region, source: axis.source,
    supportingAxis: axis.axis, supportingState: axis.state, basisObservedAt: axis.observedAt,
    assumptions: ['The supplied regional context remains valid through human review.'],
    validFrom: asOf, validUntil: axis.validUntil,
    unlockCondition: 'Human review confirms the recommendation against current regional evidence before the governed validity deadline.',
    state: 'PLANNING_RECOMMENDATION', humanReviewRequired: true, authorityGranted: false, executionClaimed: false,
  };
}

export function projectPrevention(regionalRiskContext, asOf) {
  const context = object(regionalRiskContext), region = text(context.region ?? context.scope) ?? 'REGION_NOT_SUPPLIED';
  const axes = STRATEGIC_AXES.map((axis) => riskAxis(axis, context[axis], asOf));
  const recommendations = axes.map((axis) => campaignFor(axis, region, asOf)).filter(Boolean);
  const governedAxes = axes.filter((axis) => axis.source), unknownAxes = axes.filter((axis) => axis.state === 'UNKNOWN');
  const futureAxes = axes.filter((axis) => axis.temporalState === 'FUTURE_EXCLUDED');
  return {
    preventionTwin: {
      schemaVersion: 'vigia.prevention-twin.v1', generatedAt: asOf, region,
      state: axes.some((axis) => axis.source) ? 'GOVERNED_CONTEXT_AVAILABLE' : 'NO_GOVERNED_INPUT', axes,
      coverage: { totalAxes: axes.length, governedAxes: governedAxes.length, unknownAxes: unknownAxes.length, futureAxesExcluded: futureAxes.length, attributableCoveragePercent: Number((governedAxes.length / axes.length * 100).toFixed(1)) },
      reason: governedAxes.length ? null : 'No attributable regional risk context is attached to a prevention axis.',
      unlockCondition: governedAxes.length ? null : 'Admit attributable, time-bounded regional context for one or more prevention axes.',
      owner: 'VIGIA_PREVENTION_REVIEW', source: 'CANONICAL_REGIONAL_RISK_CONTEXT',
      truthBoundary: 'Regional context and prevention screening are not incident evidence, current hazard, authority, or proof that an intervention will work.',
    },
    resilienceCampaigns: {
      schemaVersion: 'vigia.autonomous-resilience-campaigns.v1', generatedAt: asOf,
      state: recommendations.length ? 'PLANNING_RECOMMENDATIONS_AVAILABLE' : 'NO_SUPPORTED_RECOMMENDATION', recommendations,
      reason: recommendations.length ? null : 'No attributable, current prevention axis satisfies a governed planning-recommendation rule.',
      unlockCondition: recommendations.length ? null : 'Admit an attributable current gap, degradation, blind spot, or resilience dependency with a governed validity window.',
      owner: 'VIGIA_PREVENTION_REVIEW', source: 'PREVENTION_TWIN_GOVERNED_AXES',
      truthBoundary: 'Campaigns are reviewable planning recommendations only. No resource, intervention, exercise, or public action is authorized or executed.',
    },
  };
}
