import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { nearestByCoordinate } from '../../shared/geo.mjs';

function nearby(origin, items, radiusKm) {
  return (items ?? [])
    .map((item) => ({ ...item, distanceKm: haversineKm(origin, item.coordinate) }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function buildPublicContext(coordinate, world) {
  const occurrences = nearby(coordinate, world?.fires, 40).slice(0, 8).map((item) => ({
    id: item.id,
    label: `${item.municipality}${item.parish ? ` · ${item.parish}` : ''}`,
    kind: 'reported-occurrence',
    distanceKm: item.distanceKm,
    operatives: item.operatives,
    coordinate: item.coordinate
  }));
  const risk = nearby(coordinate, world?.riskToday, 35).filter((item) => Number(item.level) >= 4).slice(0, 10).map((item) => ({
    id: item.id,
    label: item.name,
    kind: 'high-fire-danger',
    distanceKm: item.distanceKm,
    level: item.level,
    coordinate: item.coordinate
  }));
  const weatherMatch = nearestByCoordinate(coordinate, world?.weather ?? []);
  return {
    occurrences,
    risk,
    weather: weatherMatch ? { ...weatherMatch.item, distanceKm: weatherMatch.distanceKm } : null
  };
}
