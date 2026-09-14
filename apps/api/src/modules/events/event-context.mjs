import { nearestByCoordinate } from '../../shared/geo.mjs';
const numeric=(value)=>value!==null&&value!==undefined&&!(typeof value==='string'&&value.trim()==='')&&typeof value!=='boolean'&&Number.isFinite(Number(value));

export function nearestWeather(event, weather = []) {
  const nearest = nearestByCoordinate(event.coordinate, weather);
  return nearest ? { ...nearest.item, distanceKm: nearest.distanceKm } : null;
}

export function nearestRisk(event, risks = []) {
  const municipality = event.observations.find((item) => item.municipality)?.municipality;
  const exact = municipality ? risks.find((item) => item.name === municipality) : null;
  if (exact) return { ...exact, distanceKm: 0 };
  const nearest = nearestByCoordinate(event.coordinate, risks);
  return nearest ? { ...nearest.item, distanceKm: nearest.distanceKm } : null;
}

export function eventPriority(event, { weather, risk, candidateAssessment = null } = {}) {
  const reasons = []; let rank = 0;
  if (event.evidenceState === 'satellite-only') {
    const grade = candidateAssessment?.grade ?? 'moderate';
    rank += grade === 'high' ? 34 : grade === 'moderate' ? 20 : 4;
    reasons.push(`${grade === 'high' ? 'High-priority' : grade === 'low' ? 'Low-confidence' : 'Unreported'} satellite thermal candidate`);
  }
  if (event.evidenceState === 'multisource') { rank += 28; reasons.push('Public report and satellite evidence have a defensible association'); }
  if (event.evidenceState === 'association-uncertain') { rank += 8; reasons.push('Report and thermal signal are nearby, but association strength is weak'); }
  if (event.evolutionState === 'growing') { rank += 28; reasons.push('Current thermal observations indicate increasing radiative power'); }
  if (event.evolutionState === 'new') { rank += 14; reasons.push('New event'); }
  if (event.evolutionState === 'stale') { rank -= 32; reasons.push('Current event state is unknown because observations are stale'); }
  if (Number(risk?.level) === 5) { rank += 12; reasons.push('Maximum municipal fire danger'); }
  if (numeric(weather?.humidityPercent) && Number(weather.humidityPercent) <= 25) { rank += 8; reasons.push('Low relative humidity'); }
  if (numeric(weather?.windSpeedKph) && Number(weather.windSpeedKph) >= 25) { rank += 8; reasons.push('Strong local wind'); }
  if (event.leadTime?.thermalBeforeReport) { rank += 10; reasons.push(`Satellite signal preceded public report by ${event.leadTime.minutes} min`); }
  return { band: rank >= 60 ? 'critical' : rank >= 40 ? 'high' : rank >= 22 ? 'elevated' : 'context', rank: Math.max(0, rank), reasons };
}

export function coverageSummary(world, event) {
  const firms = world.sources?.firms ?? null; const hasViirs = event.observations.some((item) => item.source === 'viirs');
  const viirs = !firms || firms.state === 'not_configured'
    ? { state: firms?.state ?? 'unavailable', label: 'VIIRS unavailable', coverageState: 'unknown', conclusion: 'No coverage conclusion possible.' }
    : hasViirs
      ? { state: 'detection', label: 'VIIRS detection present', coverageState: 'observed_with_detection', conclusion: 'At least one FIRMS VIIRS point detection is associated with this event.' }
      : { state: 'coverage_unknown', label: 'No associated VIIRS point', coverageState: 'unknown', conclusion: 'The area feed does not prove that this exact location was observed without a hotspot. Absence of a match is not negative evidence.' };
  return { viirs };
}
