import { haversineKm } from './geo.mjs';
import { eventAssociationIndex } from './event-association-index.mjs';

const PHYSICAL_TYPES = new Set(['thermal', 'camera', 'ground_sensor', 'drone', 'field']);

function clamp(value, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, value)); }
function round(value, digits = 3) { return Number.isFinite(value) ? Number(value.toFixed(digits)) : null; }
function centroid(observations = []) {
  const points = observations.filter((item) => Array.isArray(item.coordinate) && item.coordinate.every(Number.isFinite)).map((item) => item.coordinate);
  if (!points.length) return null;
  return [points.reduce((sum, item) => sum + item[0], 0) / points.length, points.reduce((sum, item) => sum + item[1], 0) / points.length];
}
function observationUncertaintyKm(item = {}) {
  const native = Number(item.geolocationUncertaintyM) / 1000;
  const scan = Number(item.scanKm); const track = Number(item.trackKm); const nominal = Number(item.nominalResolutionKm);
  return Math.max(.2, Number.isFinite(native) ? native : 0, Number.isFinite(scan) ? scan / 2 : 0, Number.isFinite(track) ? track / 2 : 0, Number.isFinite(nominal) ? nominal / 2 : 0);
}
function recencyWeight(ageHours) { return clamp(1 - Math.max(0, ageHours) / 36, .15, 1); }

function minutesApart(a, b) {
  const first = Date.parse(a); const second = Date.parse(b);
  return Number.isFinite(first) && Number.isFinite(second) ? Math.abs(second - first) / 60_000 : null;
}

function spatialScore(distanceKm) {
  if (!Number.isFinite(distanceKm)) return 0;
  if (distanceKm <= 0.5) return 1;
  if (distanceKm <= 1) return .9;
  if (distanceKm <= 2) return .72;
  if (distanceKm <= 3.5) return .48;
  return .2;
}

function temporalScore(minutes) {
  if (!Number.isFinite(minutes)) return .25;
  if (minutes <= 20) return 1;
  if (minutes <= 60) return .86;
  if (minutes <= 180) return .62;
  if (minutes <= 360) return .35;
  return .14;
}

function sensorScore(confidence) {
  const value = String(confidence ?? '').trim().toLowerCase();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.max(.2, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
  if (['h', 'high'].includes(value)) return 1;
  if (['n', 'nominal', 'medium'].includes(value)) return .78;
  if (['l', 'low'].includes(value)) return .42;
  return .62;
}

function grade(score) {
  if (score >= .82) return 'strong';
  if (score >= .58) return 'moderate';
  return 'weak';
}

export function eventAssociation(observations = []) {
  const reports = observations.filter((item) => item.type === 'report');
  const physical = observations.filter((item) => PHYSICAL_TYPES.has(item.type));
  if (!reports.length || !physical.length) return {
    state: 'not_applicable', grade: null, score: null, calibrated: false, associationProbability: null, scoreKind: 'heuristic_fit_score', nearestDistanceKm: null,
    timeSeparationMinutes: null, pairCount: 0, reasons: []
  };
  let best = null;
  for (const report of reports) for (const point of physical) {
    const distanceKm = haversineKm(report.coordinate, point.coordinate);
    const timeSeparationMinutes = minutesApart(report.at, point.at);
    const score = spatialScore(distanceKm) * .55 + temporalScore(timeSeparationMinutes) * .3 + sensorScore(point.confidence) * .15;
    if (!best || score > best.score) best = { report, point, distanceKm, timeSeparationMinutes, score };
  }
  const reasons = [];
  const evidenceLabel = best.point.type === 'thermal' ? 'Thermal point' : `${String(best.point.type).replaceAll('_',' ')} observation`;
  if (best.distanceKm <= 1) reasons.push(`${evidenceLabel} is ${best.distanceKm.toFixed(1)} km from the report location.`);
  else reasons.push(`Nearest ${evidenceLabel.toLowerCase()} is ${best.distanceKm.toFixed(1)} km from the report location.`);
  if (best.timeSeparationMinutes !== null) reasons.push(`Observation times differ by ${Math.round(best.timeSeparationMinutes)} min.`);
  reasons.push(`Best association uses ${best.point.satellite || best.point.sensorId || best.point.instrument || best.point.type || 'physical sensor'} evidence.`);
  return {
    state: 'associated', grade: grade(best.score), score: Number(best.score.toFixed(3)), calibrated: false, associationProbability: null, scoreKind: 'heuristic_fit_score',
    nearestDistanceKm: Number(best.distanceKm.toFixed(3)),
    timeSeparationMinutes: best.timeSeparationMinutes === null ? null : Math.round(best.timeSeparationMinutes),
    pairCount: reports.length * physical.length,
    reportObservationId: best.report.id, physicalObservationId: best.point.id, thermalObservationId: best.point.type === 'thermal' ? best.point.id : null,
    reasons
  };
}

/**
 * Scores one explicit event-membership hypothesis. This is an interpretable fit
 * score, not a calibrated probability. Hard contradictions reject the hypothesis;
 * the caller must still compare it with the next-best event and the new-event
 * hypothesis before assigning evidence.
 */
export function scoreEventHypothesis(event, observation, { maxGapHours = 32 } = {}) {
  if(!observation?.coordinate)return null;const index=eventAssociationIndex(event,observation),history=index.history;
  if (!history.length) return null;
  const at = Date.parse(observation.at); const lastAt = Date.parse(history.at(-1).at);
  const gapHours = Math.abs(at - lastAt) / 3_600_000;
  if (!Number.isFinite(gapHours) || gapHours > maxGapHours) return null;

  let nearest=null;for(const item of index.nearby){const km=haversineKm(item.coordinate,observation.coordinate);if(!nearest||km<nearest.km)nearest={item,km};}
  if(!nearest)return null;
  const recentCenter = centroid(index.recent) ?? index.centroid;
  const centroidDistanceKm = recentCenter ? haversineKm(recentCenter, observation.coordinate) : nearest.km;
  const uncertaintyKm = observationUncertaintyKm(observation) + observationUncertaintyKm(nearest.item);
  const effectiveDistanceKm = Math.max(0, nearest.km - uncertaintyKm);
  const physical = PHYSICAL_TYPES.has(observation.type);
  const reports = index.reports;
  const physicalHistory = index.physical;
  const otherReport = observation.type === 'report' && reports.some((item) => item.incidentId && observation.incidentId && item.incidentId !== observation.incidentId);
  // Distinct provider incident identities remain distinct until an explicit
  // merge operation records lineage. Spatial proximity is not merge authority.
  if (otherReport) return null;

  const spatial = clamp(1 - effectiveDistanceKm / (physical ? 18 : 5));
  const temporal = clamp(1 - gapHours / maxGapHours);
  const continuityRadius = Math.max(6, Math.min(18, 6 + gapHours * .28 + uncertaintyKm));
  const withinMovementEnvelope = nearest.km <= continuityRadius || centroidDistanceKm <= continuityRadius * 1.35;
  const continuity = physical
    ? clamp((withinMovementEnvelope ? .7 : .15) + recencyWeight(gapHours) * .2 + clamp(1 - centroidDistanceKm / 18) * .1)
    : clamp(1 - nearest.km / 6);
  const source = sensorScore(observation.confidence) * (observation.type === 'thermal' ? 1 : .9);
  const sameIncident = Boolean(observation.incidentId && index.incidentIds.has(observation.incidentId));
  const sameLocality = Boolean(observation.municipality && index.municipalities.has(observation.municipality));
  const reportContext = sameIncident ? 1 : sameLocality ? .72 : reports.length && observation.type === 'report' ? .18 : .5;
  const score = spatial * .34 + temporal * .18 + continuity * .27 + source * .09 + reportContext * .12;
  const crossSource = (physical && reports.length > 0) || (observation.type === 'report' && physicalHistory.length > 0);
  // One isolated physical point more than 3 km from a report is not enough to
  // collapse the two identities. A multi-observation physical track may carry
  // continuity across that distance; otherwise stronger evidence must arrive.
  const crossSourceContinuity = !crossSource || nearest.km <= 3 || physicalHistory.length >= 2 || sameIncident;
  const accepted = score >= .56 && crossSourceContinuity && (withinMovementEnvelope || sameIncident || (observation.type === 'report' && effectiveDistanceKm <= 3.5));
  const reasonCodes = [
    effectiveDistanceKm <= 1 ? 'SPATIAL_NEAR' : effectiveDistanceKm <= 4 ? 'SPATIAL_COMPATIBLE' : 'SPATIAL_DISTANT',
    gapHours <= 2 ? 'TEMPORAL_NEAR' : gapHours <= 18 ? 'TEMPORAL_SAME_OPERATIONAL_PERIOD' : 'TEMPORAL_CROSS_PASS',
    withinMovementEnvelope ? 'WITHIN_MOVEMENT_ENVELOPE' : 'OUTSIDE_MOVEMENT_ENVELOPE',
    crossSourceContinuity ? 'CROSS_SOURCE_CONTINUITY_SUPPORTED' : 'ISOLATED_CROSS_SOURCE_DISTANCE',
    sameIncident ? 'SAME_PROVIDER_INCIDENT' : sameLocality ? 'SAME_LOCALITY' : 'NO_REPORT_CONTEXT'
  ];
  return {
    eventId: event.id ?? event.manualEventId ?? null,
    score: round(score), grade: grade(score), accepted, calibrated: false, scoreKind: 'interpretable_evidence_fit_score',
    terms: { spatial: round(spatial), temporal: round(temporal), physicalContinuity: round(continuity), sourceCharacteristics: round(source), reportContext: round(reportContext) },
    nearestDistanceKm: round(nearest.km), effectiveDistanceKm: round(effectiveDistanceKm), centroidDistanceKm: round(centroidDistanceKm), gapHours: round(gapHours, 2),
    movementEnvelopeKm: round(continuityRadius), reasonCodes,
    reasons: [
      `${round(nearest.km, 1)} km from nearest event evidence (${round(uncertaintyKm, 1)} km combined support/uncertainty allowance).`,
      `${round(gapHours, 1)} h from the event's latest evidence.`,
      withinMovementEnvelope ? 'Position is compatible with the observed movement envelope.' : 'Position falls outside the observed movement envelope.',
      sameIncident ? 'Provider incident identity matches.' : sameLocality ? 'Report locality is consistent.' : 'No report-identity shortcut was applied.'
    ]
  };
}

export function chooseEventHypothesis(events, observation, options = {}) {
  const ranked = events.map((event) => ({ event, hypothesis: scoreEventHypothesis(event, observation, options) }))
    .filter((item) => item.hypothesis?.accepted).sort((a, b) => b.hypothesis.score - a.hypothesis.score || a.hypothesis.nearestDistanceKm - b.hypothesis.nearestDistanceKm);
  const best = ranked[0] ?? null; const alternative = ranked[1] ?? null;
  const margin = best ? round(best.hypothesis.score - (alternative?.hypothesis.score ?? .42)) : null;
  const bestHasReport = best?.event?.observations?.some((item) => item.type === 'report') === true;
  const alternativeHasReport = alternative?.event?.observations?.some((item) => item.type === 'report') === true;
  const ambiguityIsOperationallyMeaningful = observation.type === 'report' || (bestHasReport && alternativeHasReport);
  const ambiguous = Boolean(best && alternative && ambiguityIsOperationallyMeaningful && margin < (options.ambiguityMargin ?? .08));
  return {
    state: !best ? 'new_event' : ambiguous ? 'ambiguous' : 'associated',
    calibrated: false, scoreKind: 'interpretable_evidence_fit_score', best: best?.hypothesis ?? null, alternative: alternative?.hypothesis ?? null,
    separationMargin: margin, reasonCodes: ambiguous ? ['COMPETING_EVENTS', 'INSUFFICIENT_SEPARATION_MARGIN'] : best?.hypothesis.reasonCodes ?? ['NO_COMPATIBLE_EVENT'],
    target: !ambiguous ? best?.event ?? null : null
  };
}
