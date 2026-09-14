import { classifyEvidence } from '../../../../../packages/domain/src/evidence-policy.mjs';
import { inspectTimestamp } from '../../../../../packages/domain/src/timestamp-firewall.mjs';
import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';

function freshnessLabel(inspected) {
  if (!inspected.valid) return inspected.reason === 'future' ? 'Source timestamp conflict' : 'Update time unavailable';
  const minutes = Math.round(inspected.ageSeconds / 60);
  if (minutes < 2) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} minutes ago`;
  if (minutes < 24 * 60) return `Updated about ${Math.round(minutes / 60)} hours ago`;
  if (minutes < 48 * 60) return 'Updated yesterday';
  return `Updated ${Math.round(minutes / 1440)} days ago`;
}
function sourceState(world, id) { return world.sources?.[id]?.state ?? 'unavailable'; }
function usable(state) { return ['current', 'stale'].includes(state); }
function thermalMatch(occurrence, detections, clock) {
  const reference = inspectTimestamp(occurrence.updatedAt ?? occurrence.startedAt, { now: clock() });
  if (!reference.valid) return null;
  return detections.map((item) => {
    const observed = inspectTimestamp(item.observedAt, { now: clock() });
    return { item, distanceKm: haversineKm(occurrence.coordinate, item.coordinate), timeDeltaMinutes: observed.valid ? Math.abs(Date.parse(reference.value) - Date.parse(observed.value)) / 60_000 : Infinity };
  }).filter((match) => match.distanceKm <= 5 && match.timeDeltaMinutes <= 360).sort((a, b) => a.distanceKm - b.distanceKm || a.timeDeltaMinutes - b.timeDeltaMinutes)[0] ?? null;
}

export function buildIncidentEvidence(occurrence, world, operatorDecision = null, { clock = () => new Date(), fieldEvidence = [] } = {}) {
  const now = clock(); const time = inspectTimestamp(occurrence.updatedAt ?? occurrence.startedAt, { now });
  const nearestWeather = nearestByCoordinate(occurrence.coordinate, world.weather ?? []);
  const matchedThermal = thermalMatch(occurrence, world.thermalDetections ?? [], clock);
  const thermalState = sourceState(world, 'firms'); const fireState = sourceState(world, 'fires');
  const evidence = [
    { id: `${occurrence.id}:report`, source: 'occurrence-report', independenceGroup: 'civil-protection-public-record', label: 'Public occurrence report', detail: 'ANEPC-derived public record; not independently confirmed by VIGIA.', state: fireState, supports: usable(fireState), authoritative: false, spatiallyCorrelated: true, observedAt: time.value },
    { id: `${occurrence.id}:freshness`, source: 'record-freshness', independenceGroup: 'civil-protection-public-record', label: freshnessLabel(time), detail: time.valid ? 'Freshness describes the source record, not the physical fire state.' : `Timestamp rejected: ${time.reason}.`, state: time.valid ? 'context' : 'conflict', supports: null, authoritative: false, spatiallyCorrelated: false, observedAt: time.value },
    { id: `${occurrence.id}:thermal`, source: 'thermal-detection', independenceGroup: 'thermal', label: matchedThermal ? `Thermal match ${matchedThermal.distanceKm.toFixed(1)} km away` : thermalState === 'not_configured' ? 'Thermal feed not configured' : 'No matched thermal point', detail: matchedThermal ? `${matchedThermal.item.instrument} observed within ${Math.round(matchedThermal.timeDeltaMinutes)} minutes.` : 'No match is not negative evidence; revisit and resolution limits apply.', state: matchedThermal ? thermalState : thermalState === 'not_configured' ? 'not_configured' : 'needed', supports: matchedThermal ? true : null, authoritative: false, spatiallyCorrelated: Boolean(matchedThermal), observedAt: matchedThermal?.item?.observedAt ?? null, payload: matchedThermal?.item ?? null },
    { id: `${occurrence.id}:weather`, source: 'weather-context', independenceGroup: 'weather', label: nearestWeather ? nearestWeather.distanceKm > 25 ? 'Weather context is distant' : 'Nearest weather observation' : 'Weather unavailable', detail: nearestWeather ? `${nearestWeather.item.name} · ${nearestWeather.distanceKm.toFixed(1)} km away. ${nearestWeather.distanceKm > 25 ? 'Too distant to represent local fire-weather truth.' : 'Context only.'}` : 'No station observation loaded.', state: nearestWeather ? sourceState(world, 'weather') : 'unavailable', supports: null, authoritative: false, spatiallyCorrelated: false, observedAt: nearestWeather?.item?.observedAt ?? null, contextQuality: nearestWeather ? nearestWeather.distanceKm <= 10 ? 'local' : nearestWeather.distanceKm <= 25 ? 'regional' : 'distant' : 'unavailable' }
  ];
  for (const item of fieldEvidence) evidence.push({ id: `${occurrence.id}:${item.id}`, source: 'accepted-field-evidence', independenceGroup: 'ground-observation', label: 'Accepted field evidence', detail: item.note || 'Authorized field evidence accepted.', state: 'current', supports: true, authoritative: true, spatiallyCorrelated: true, observedAt: item.capturedAt, payload: { packageId: item.id, observerId: item.observerId } });
  if (operatorDecision) evidence.push({ id: `${occurrence.id}:operator`, source: 'operator-review', independenceGroup: 'human-review', label: `Supervisor review: ${operatorDecision.decision}`, detail: operatorDecision.note || 'No note supplied.', state: 'current', supports: operatorDecision.decision === 'verified' ? true : operatorDecision.decision === 'rejected' ? false : null, kind: operatorDecision.decision === 'rejected' ? 'contradiction' : 'review', authoritative: operatorDecision.decision === 'verified', spatiallyCorrelated: true, observedAt: operatorDecision.at });
  else if (!fieldEvidence.length) evidence.push({ id: `${occurrence.id}:ground`, source: 'camera-or-ground', independenceGroup: 'ground-observation', label: 'Ground confirmation pending', detail: 'Request attributable camera, drone or field evidence.', state: 'unavailable', supports: null, authoritative: false, spatiallyCorrelated: false, observedAt: null });
  const classification = classifyEvidence(evidence); const rejected = operatorDecision?.decision === 'rejected';
  const stage = rejected ? 'rejected' : operatorDecision?.decision === 'verified' ? 'verified' : classification.stage;
  return {
    evidence, classification: { ...classification, stage, rejected, localReview: operatorDecision ?? null }, thermalMatch: matchedThermal,
    weather: nearestWeather ? { ...nearestWeather.item, distanceKm: nearestWeather.distanceKm } : null,
    sourceTimeConflict: time.reason === 'future', timestampState: time,
    nextObservation: ['reported', 'observed'].includes(stage)
      ? { title: 'Get independent confirmation', options: ['Match a thermal detection', 'Request a camera or drone view', 'Assign a field verification'], reason: 'A public occurrence record alone is not independent confirmation.' }
      : stage === 'rejected' ? { title: 'Monitor for new contradictory evidence', options: ['Keep source refresh active'], reason: 'A supervisor rejected this report.' }
        : { title: 'Maintain evidence agreement', options: ['Refresh observations', 'Update the perimeter from attributable field data'], reason: 'Independent evidence exists, but uncertainty remains.' }
  };
}
