const active = (item) => !['CLEARED', 'OPEN', 'NO_IMPACT'].includes(String(item?.state ?? item?.impact ?? '').toUpperCase());
const point = (value) => Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
  ? [Number(value[0]), Number(value[1])] : null;

function geometryOf(closure) {
  const raw = closure?.geometry ?? (point(closure?.coordinate) ? { type: 'Point', coordinates: closure.coordinate } : null);
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type === 'Point') return point(raw.coordinates) ? { type: 'Point', coordinates: point(raw.coordinates) } : null;
  if (raw.type === 'LineString') {
    const coordinates = Array.isArray(raw.coordinates) ? raw.coordinates.map(point).filter(Boolean) : [];
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
  }
  if (raw.type === 'Polygon') {
    const rings = Array.isArray(raw.coordinates) ? raw.coordinates.map((ring) => Array.isArray(ring) ? ring.map(point).filter(Boolean) : []).filter((ring) => ring.length >= 4) : [];
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  return null;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (value, left, right, epsilon = 1e-9) => value >= Math.min(left, right) - epsilon && value <= Math.max(left, right) + epsilon;
function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (Math.abs(abC) < 1e-9 && between(c[0], a[0], b[0]) && between(c[1], a[1], b[1]))
    || (Math.abs(abD) < 1e-9 && between(d[0], a[0], b[0]) && between(d[1], a[1], b[1]))
    || (Math.abs(cdA) < 1e-9 && between(a[0], c[0], d[0]) && between(a[1], c[1], d[1]))
    || (Math.abs(cdB) < 1e-9 && between(b[0], c[0], d[0]) && between(b[1], c[1], d[1]));
}

function pointToSegmentDegrees(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (((a[1] > p[1]) !== (b[1] > p[1])) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function lineHitsGeometry(line, geometry, toleranceDegrees = 0.0002) {
  if (geometry.type === 'Point') return line.slice(1).some((end, index) => pointToSegmentDegrees(geometry.coordinates, line[index], end) <= toleranceDegrees);
  const constraintLines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (geometry.type === 'Polygon' && line.some((coordinate) => pointInRing(coordinate, geometry.coordinates[0]))) return true;
  for (let routeIndex = 1; routeIndex < line.length; routeIndex += 1) {
    for (const constraintLine of constraintLines) for (let constraintIndex = 1; constraintIndex < constraintLine.length; constraintIndex += 1) {
      if (segmentsIntersect(line[routeIndex - 1], line[routeIndex], constraintLine[constraintIndex - 1], constraintLine[constraintIndex])) return true;
    }
  }
  return false;
}

export function classifyGovernedConstraints(context = {}) {
  const closures = (Array.isArray(context?.roadContext?.closures) ? context.roadContext.closures : []).filter(active);
  const vehicleConstraints = Array.isArray(context?.vehicleConstraints?.constraints) ? context.vehicleConstraints.constraints : Array.isArray(context?.vehicleConstraints) ? context.vehicleConstraints : [];
  const geometricClosures = closures.map((closure) => ({ closure, geometry: geometryOf(closure) })).filter((item) => item.geometry);
  const unresolvedClosures = closures.filter((closure) => !geometryOf(closure));
  return { closures, geometricClosures, unresolvedClosures, vehicleConstraints };
}

export function closureImpactForRoute(route, geometricClosures = []) {
  const line = route?.geometry?.type === 'LineString' && Array.isArray(route.geometry.coordinates) ? route.geometry.coordinates.map(point).filter(Boolean) : [];
  if (line.length < 2) return { evaluable: false, impactedClosureIds: [] };
  const impacted = geometricClosures.filter((item) => lineHitsGeometry(line, item.geometry)).map((item) => item.closure?.id ?? item.closure?.closureId ?? 'unnamed-closure');
  return { evaluable: true, impactedClosureIds: impacted };
}
