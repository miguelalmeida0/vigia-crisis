import { fingerprint } from './contracts.mjs';

const round = (value) => Number(Number(value).toFixed(6));
const position = (value) => Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1])) ? [round(value[0]), round(value[1])] : null;
const compare = (left, right) => left[0] - right[0] || left[1] - right[1];
const same = (left, right) => left?.[0] === right?.[0] && left?.[1] === right?.[1];

function canonicalRing(values) {
  let points = values.map(position).filter(Boolean).filter((item, index, rows) => index === 0 || !same(item, rows[index - 1]));
  if (points.length > 1 && same(points[0], points.at(-1))) points = points.slice(0, -1);
  if (points.length < 3) return null;
  const rotate = (rows) => { let start = 0; for (let index = 1; index < rows.length; index += 1) if (compare(rows[index], rows[start]) < 0) start = index; return [...rows.slice(start), ...rows.slice(0, start)]; };
  const forward = rotate(points), reverse = rotate([...points].reverse()), selected = JSON.stringify(forward) <= JSON.stringify(reverse) ? forward : reverse;
  return [...selected, selected[0]];
}

function canonicalPolygon(value) {
  if (!Array.isArray(value)) return null; const rings = value.map(canonicalRing).filter(Boolean).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return rings.length ? rings : null;
}

export function normalizeGeometry(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return { valid: false, reason: 'UNSUPPORTED_GEOMETRY', geometry: null };
  const polygons = geometry.type === 'Polygon' ? [canonicalPolygon(geometry.coordinates)] : (geometry.coordinates ?? []).map(canonicalPolygon);
  if (polygons.some((item) => !item)) return { valid: false, reason: 'INVALID_RING', geometry: null };
  const flat = polygons.flat(3), positions = []; for (let index = 0; index < flat.length; index += 2) positions.push([flat[index], flat[index + 1]]);
  if (!positions.length || positions.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90)) return { valid: false, reason: 'COORDINATE_RANGE_INVALID', geometry: null };
  const sorted = polygons.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), normalized = sorted.length === 1 ? { type: 'Polygon', coordinates: sorted[0] } : { type: 'MultiPolygon', coordinates: sorted };
  return { valid: true, reason: null, geometry: normalized, hash: fingerprint('normalized-perimeter-geometry', normalized), bbox: bounds(normalized), areaSquareKm: areaSquareKm(normalized), centroid: centroid(normalized), quality: 'VALID_NORMALIZED' };
}

export function bounds(geometry) {
  const flat = geometry?.coordinates?.flat?.(8) ?? [], points = []; for (let index = 0; index < flat.length; index += 2) if (Number.isFinite(flat[index]) && Number.isFinite(flat[index + 1])) points.push([flat[index], flat[index + 1]]);
  return points.length ? [Math.min(...points.map((item) => item[0])), Math.min(...points.map((item) => item[1])), Math.max(...points.map((item) => item[0])), Math.max(...points.map((item) => item[1]))] : null;
}

export function centroid(geometry) { const box = bounds(geometry); return box ? [round((box[0] + box[2]) / 2), round((box[1] + box[3]) / 2)] : null; }
export function areaSquareKm(geometry) {
  const box = bounds(geometry); if (!box) return 0; const latitude = (box[1] + box[3]) / 2 * Math.PI / 180, x = 111.32 * Math.cos(latitude), y = 110.574;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates; let total = 0;
  for (const polygon of polygons) for (const ring of polygon) { let sum = 0; for (let index = 0; index < ring.length - 1; index += 1) sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]; total += Math.abs(sum / 2) * x * y; }
  return Number(total.toFixed(6));
}

export function centroidDistanceKm(left, right) { if (!left || !right) return null; const p = Math.PI / 180, dLat = (right[1] - left[1]) * p, dLon = (right[0] - left[0]) * p, q = Math.sin(dLat / 2) ** 2 + Math.cos(left[1] * p) * Math.cos(right[1] * p) * Math.sin(dLon / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); }

export function bboxIou(left, right) { if (!left || !right) return null; const intersection = Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0])) * Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1])), a = Math.max(0, left[2] - left[0]) * Math.max(0, left[3] - left[1]), b = Math.max(0, right[2] - right[0]) * Math.max(0, right[3] - right[1]); return a + b - intersection > 0 ? intersection / (a + b - intersection) : 1; }
