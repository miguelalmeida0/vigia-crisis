import { clamp } from './math.mjs';

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees) => Number(degrees) * Math.PI / 180;
const toDegrees = (radians) => Number(radians) * 180 / Math.PI;

export function haversineKm(first, second) {
  const [lon1, lat1] = first.map(Number);
  const [lon2, lat2] = second.map(Number);
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function destinationPoint(origin, distanceKm, bearingDeg) {
  const [lon, lat] = origin.map(Number);
  const angularDistance = Number(distanceKm) / EARTH_RADIUS_KM;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lon1 = toRadians(lon);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
      + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [((toDegrees(lon2) + 540) % 360) - 180, toDegrees(lat2)];
}

export function ellipsePolygon(input, options = null) {
  const config = Array.isArray(input)
    ? {
        origin: input,
        downwindKm: options?.majorKm,
        upwindKm: Number(options?.majorKm ?? 0) * Number(options?.rearRatio ?? 0.32),
        crosswindKm: options?.minorKm,
        bearingDeg: options?.bearingDegrees,
        points: options?.points
      }
    : input;
  const {
    origin,
    downwindKm,
    upwindKm,
    crosswindKm,
    bearingDeg,
    points = 72
  } = config ?? {};
  const safePoints = Math.max(24, Math.min(180, Math.round(points)));
  const downwind = Math.max(0.02, Number(downwindKm));
  const upwind = Math.max(0.01, Number(upwindKm));
  const crosswind = Math.max(0.01, Number(crosswindKm));
  const centerOffset = (downwind - upwind) / 2;
  const semiMajor = (downwind + upwind) / 2;
  const center = destinationPoint(origin, centerOffset, bearingDeg);
  const ring = [];

  for (let index = 0; index <= safePoints; index += 1) {
    const angle = index / safePoints * Math.PI * 2;
    const along = semiMajor * Math.cos(angle);
    const across = crosswind * Math.sin(angle);
    const distance = Math.hypot(along, across);
    const localBearing = Number(bearingDeg) + toDegrees(Math.atan2(across, along));
    ring.push(destinationPoint(center, distance, localBearing));
  }

  if (Array.isArray(input)) return ring;
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
}

export function pointInPolygon(point, polygon) {
  const ring = Array.isArray(polygon?.[0])
    ? polygon
    : polygon?.geometry?.coordinates?.[0] ?? polygon?.coordinates?.[0] ?? [];
  const [x, y] = point.map(Number);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function bboxAround(coordinate, radiusKm) {
  const [lon, lat] = coordinate.map(Number);
  const north = destinationPoint([lon, lat], radiusKm, 0);
  const east = destinationPoint([lon, lat], radiusKm, 90);
  const south = destinationPoint([lon, lat], radiusKm, 180);
  const west = destinationPoint([lon, lat], radiusKm, 270);
  return [west[0], south[1], east[0], north[1]];
}

export function normalizeBearing(value) {
  return ((Number(value) % 360) + 360) % 360;
}

export function windDirectionFromId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  const eightPoint = { 1: 0, 2: 45, 3: 90, 4: 135, 5: 180, 6: 225, 7: 270, 8: 315, 9: 0 };
  if (id in eightPoint) return eightPoint[id];
  return normalizeBearing((id - 1) * 22.5);
}

export function nearestTo(origin, items = [], coordinateSelector = (item) => item.coordinate) {
  let item = null;
  let distanceKm = Number.POSITIVE_INFINITY;
  for (const candidate of items) {
    const distance = haversineKm(origin, coordinateSelector(candidate));
    if (distance < distanceKm) {
      item = candidate;
      distanceKm = distance;
    }
  }
  return { item, distanceKm };
}

export { clamp };

export function confidenceBand(value) {
  const numeric = clamp(value, 0, 1);
  if (numeric >= 0.78) return 'high';
  if (numeric >= 0.5) return 'moderate';
  return 'low';
}

export function bboxViewport(coordinate, widthKm, heightKm) {
  const [lon, lat] = coordinate.map(Number);
  const halfWidth = Math.max(0.5, Number(widthKm) / 2);
  const halfHeight = Math.max(0.5, Number(heightKm) / 2);
  const north = destinationPoint([lon, lat], halfHeight, 0);
  const east = destinationPoint([lon, lat], halfWidth, 90);
  const south = destinationPoint([lon, lat], halfHeight, 180);
  const west = destinationPoint([lon, lat], halfWidth, 270);
  return [west[0], south[1], east[0], north[1]];
}
