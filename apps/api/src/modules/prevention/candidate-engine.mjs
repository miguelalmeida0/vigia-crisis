import { computePreventionPriority, rankPreventionCandidates } from '../../../../../packages/domain/src/prevention-priority.mjs';
import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';
function firePressure(coordinate, fires) {
  const distances = fires.map((item) => haversineKm(coordinate, item.coordinate)).filter(Number.isFinite); const nearestKm = distances.length ? Math.min(...distances) : null;
  const within40Km = distances.filter((distance) => distance <= 40).length; return { nearestKm, within40Km, signal: Math.min(1, within40Km / 4 + (nearestKm !== null && nearestKm <= 15 ? .24 : 0)) };
}
function observationFreshness(observation) {
  const acquired = Date.parse(observation?.latest?.acquiredAt); if (!Number.isFinite(acquired)) return .15;
  const ageDays = Math.max(0, (Date.now() - acquired) / 86_400_000); const cloud = Number.isFinite(Number(observation.latest.cloudCover)) ? Number(observation.latest.cloudCover) : 55;
  return Math.max(.05, 1 - ageDays / 30) * .7 + Math.max(.05, 1 - cloud / 100) * .3;
}
function reasons({ risk, weather, pressure, observation }) {
  const output = [`${risk.label} municipal rural-fire danger (${risk.level}/5).`];
  if (Number.isFinite(Number(weather?.humidityPercent))) output.push(`${Math.round(weather.humidityPercent)}% relative humidity at the nearest station.`);
  if (Number.isFinite(Number(weather?.windSpeedKph))) output.push(`${Math.round(weather.windSpeedKph)} km/h observed wind at the nearest station.`);
  if (pressure.within40Km) output.push(`${pressure.within40Km} reported occurrence${pressure.within40Km === 1 ? '' : 's'} within 40 km.`);
  output.push(observation?.latest?.acquiredAt ? 'Regional Earth-observation catalogue metadata exists; renderability and scene quality are resolved when this place is opened.' : 'No regional catalogue scene is preloaded; the Observation Resolver will query live optical/radar sources on demand.'); return output;
}
function displayPlace(riskPoint) {
  const name = String(riskPoint.name ?? '').trim();
  if (name && !/(unknown municipality|district · code|unresolved municipality)/i.test(name)) return name;
  const [lon, lat] = riskPoint.coordinate ?? [];
  if (Number.isFinite(lat) && Number.isFinite(lon)) return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  return riskPoint.district ? `${riskPoint.district} district` : 'Selected territory';
}
export function buildPreventionCandidates(world, detectorRegistry, operations = {}, { limit = 8 } = {}) {
  const candidates = (world.riskToday ?? []).filter((item) => Number(item.level) >= 3).map((riskPoint) => {
    const weatherMatch = nearestByCoordinate(riskPoint.coordinate, world.weather ?? []); const observationMatch = nearestByCoordinate(riskPoint.coordinate, world.earthObservations ?? []); const observation = observationMatch?.item ?? null;
    const pressure = firePressure(riskPoint.coordinate, world.fires ?? []); const priority = computePreventionPriority({ riskLevel: riskPoint.level, temperatureC: weatherMatch?.item?.temperatureC, humidityPercent: weatherMatch?.item?.humidityPercent, windSpeedKph: weatherMatch?.item?.windSpeedKph, exposureSignal: .45 + Math.min(.24, riskPoint.level * .035), recentFirePressure: pressure.signal, observationFreshness: observationFreshness(observation) });
    const id = `inspection:${riskPoint.id}`; const place = displayPlace(riskPoint); const candidate = {
      id, municipalityId: riskPoint.id, municipality: place, district: riskPoint.district ?? null, coordinate: riskPoint.coordinate,
      dangerLevel: riskPoint.level, dangerLabel: riskPoint.label, priority: priority.priority, band: priority.band, priorityFactors: priority.factors,
      title: `Inspect conditions near ${place}`, summary: 'Risk-driven inspection priority. VIGIA has not detected or confirmed a physical hazard at this location.',
      reasons: reasons({ risk: riskPoint, weather: weatherMatch?.item, pressure, observation }), weather: weatherMatch ? { ...weatherMatch.item, distanceKm: weatherMatch.distanceKm } : null,
      evidenceState: 'inspection_priority', physicalHazardConfirmed: false,
      observationCoverage: { region: observation?.label ?? null, latestAcquiredAt: observation?.latest?.acquiredAt ?? null, cloudCover: observation?.latest?.cloudCover ?? null, currentObservationEndpoint: `/api/v2/observations/resolve?lon=${riskPoint.coordinate[0]}&lat=${riskPoint.coordinate[1]}` },
      recommendedAction: 'Create explicit human inspection work only if an operator accepts this risk-driven priority, or review an attributable detector finding when one exists.',
      trustNotice: 'Priority is derived from environmental risk and exposure context. It is not an object-detection result.',
      evidenceRequests: (operations.evidenceRequests ?? []).filter((item) => item.targetId === id), intervention: (operations.interventions ?? []).find((item) => item.targetId === id) ?? null
    };
    return { ...candidate, detectorFindings: detectorRegistry.findings(candidate) };
  });
  return rankPreventionCandidates(candidates).slice(0, limit);
}
