import { haversineKm } from '../../../../packages/domain/src/geo.mjs';

export function nearestByCoordinate(origin, items = []) {
  let best = null;
  let distanceKm = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (!Array.isArray(item?.coordinate)) continue;
    const distance = haversineKm(origin, item.coordinate);
    if (distance < distanceKm) {
      best = item;
      distanceKm = distance;
    }
  }
  return best ? { item: best, distanceKm } : null;
}

export function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== -99 && parsed !== -99.0 ? parsed : null;
}

export function textOr(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function parseIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isMainlandPortugal([lon, lat]) {
  return Number(lon) >= -9.75 && Number(lon) <= -6
    && Number(lat) >= 36.75 && Number(lat) <= 42.25;
}
