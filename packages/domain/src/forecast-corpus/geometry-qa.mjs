import { semanticHash } from '../intelligence/shared.mjs';

function rings(geometry) {
  if (geometry?.type === 'Feature') return rings(geometry.geometry);
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flat();
  return [];
}
function segmentOrientation(a, b, c) { return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); }
function intersects(a, b, c, d) { const first = segmentOrientation(a, b, c), second = segmentOrientation(a, b, d), third = segmentOrientation(c, d, a), fourth = segmentOrientation(c, d, b); return first !== 0 && second !== 0 && third !== 0 && fourth !== 0 && first !== second && third !== fourth; }
function selfIntersects(ring) {
  for (let first = 0; first < ring.length - 1; first += 1) for (let second = first + 1; second < ring.length - 1; second += 1) {
    if (Math.abs(first - second) <= 1 || first === 0 && second === ring.length - 2) continue;
    if (intersects(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
  }
  return false;
}
function ringArea(ring) { let sum = 0; for (let index = 0; index < ring.length - 1; index += 1) sum += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1]; return Math.abs(sum / 2); }
function approximateAreaKm2(values, latitude) { return values.reduce((sum, ring) => sum + ringArea(ring), 0) * 111.32 * 111.32 * Math.max(.01, Math.cos(latitude * Math.PI / 180)); }
function center(bbox) { return bbox ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : null; }
function distanceKm(first, second) { if (!first || !second) return null; const latitude = (first[1] + second[1]) * Math.PI / 360, x = (second[0] - first[0]) * Math.cos(latitude), y = second[1] - first[1]; return Math.hypot(x, y) * 111.32; }
export function validateCorpusGeometry({ geometry, crs = 'EPSG:4326', axisOrder = 'longitude,latitude', originalHash = null, simplificationErrorMeters = 0, topologyPreserved = true, previousBbox = null, maximumDisplacementKm = 500, sourceResolutionMeters = null, transformedResolutionMeters = null } = {}) {
  const failures = [], values = rings(geometry), points = values.flat();
  if (!['EPSG:4326', 'OGC:CRS84'].includes(crs)) failures.push('CRS_NOT_CANONICAL');
  if (axisOrder !== 'longitude,latitude') failures.push('AXIS_ORDER_INVALID');
  if (!values.length) failures.push('POLYGON_GEOMETRY_REQUIRED');
  if (points.some((point) => !Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite))) failures.push('NON_FINITE_COORDINATE');
  const finite = points.filter((point) => Array.isArray(point) && point.slice(0, 2).every(Number.isFinite));
  if (finite.some(([x, y]) => x < -180 || x > 180 || y < -90 || y > 90)) failures.push('COORDINATE_OUT_OF_RANGE');
  if (values.some((ring) => ring.length < 4 || ring[0]?.[0] !== ring.at(-1)?.[0] || ring[0]?.[1] !== ring.at(-1)?.[1])) failures.push('RING_NOT_CLOSED');
  if (values.some((ring) => ring.length <= 2_000 && selfIntersects(ring))) failures.push('SELF_INTERSECTION');
  if (!Number.isFinite(simplificationErrorMeters) || simplificationErrorMeters < 0) failures.push('SIMPLIFICATION_ERROR_INVALID');
  const xs = finite.map((point) => point[0]), ys = finite.map((point) => point[1]);
  const bbox = finite.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
  if (bbox && (bbox[2] - bbox[0] > 180)) failures.push('ANTIMERIDIAN_UNHANDLED');
  const areaKm2 = bbox ? approximateAreaKm2(values, center(bbox)[1]) : null;
  if (areaKm2 != null && (areaKm2 <= 0 || areaKm2 > 2_000_000)) failures.push('AREA_UNREASONABLE');
  const displacementKm = distanceKm(center(previousBbox), center(bbox));
  if (displacementKm != null && displacementKm > maximumDisplacementKm) failures.push('DISPLACEMENT_UNREASONABLE');
  if (topologyPreserved !== true) failures.push('TOPOLOGY_NOT_PRESERVED');
  if ((sourceResolutionMeters != null || transformedResolutionMeters != null) && (!Number.isFinite(sourceResolutionMeters) || !Number.isFinite(transformedResolutionMeters) || sourceResolutionMeters <= 0 || transformedResolutionMeters <= 0 || transformedResolutionMeters > sourceResolutionMeters * 4)) failures.push('RESOLUTION_INCONSISTENT');
  const transformedHash = semanticHash('corpus-geometry', geometry);
  return { schemaVersion: 'vigia.corpus-geometry-qa.v1', passed: failures.length === 0, failures: [...new Set(failures)].sort(), crs, axisOrder, bbox, approximateAreaKm2: areaKm2, displacementKm, coordinateCount: finite.length, originalHash, transformedHash, simplificationErrorMeters, topologyPreserved };
}
