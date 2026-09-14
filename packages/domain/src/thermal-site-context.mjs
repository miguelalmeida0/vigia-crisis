const EARTH_KM_PER_DEGREE = 111.32;
const THERMAL_SOURCES = new Set(['gas', 'diesel', 'biomass', 'biogas', 'waste', 'oil', 'coal', 'geothermal']);
const NON_THERMAL_SOURCES = new Set(['solar', 'wind', 'hydro', 'tidal', 'wave', 'electricity_network']);

export function thermalContextClass(tags = {}) {
  const source = String(tags['generator:source'] ?? tags['plant:source'] ?? '').toLowerCase();
  if (NON_THERMAL_SOURCES.has(source)) return null;
  if (tags.man_made === 'flare' || tags.man_made === 'kiln' || tags.man_made === 'gas_plant') return 'DIRECT_HIGH_TEMPERATURE_INDUSTRIAL';
  if (THERMAL_SOURCES.has(source) && ['plant', 'generator'].includes(tags.power)) return 'THERMAL_POWER';
  if (tags.landuse === 'landfill' || ['waste_transfer_station'].includes(tags.amenity)) return 'WASTE_PROCESSING';
  if (tags.landuse === 'quarry') return 'QUARRY';
  if (tags.man_made === 'works' || tags.industrial === 'factory') return 'INDUSTRIAL_WORKS';
  if (tags.landuse === 'industrial') return 'INDUSTRIAL_LANDUSE';
  return null;
}

function coordinateOf(value) {
  const lon = Number(value?.lon), lat = Number(value?.lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

function pathsOf(element) {
  if (Array.isArray(element.geometry)) return [element.geometry.map(coordinateOf).filter(Boolean)].filter((item) => item.length);
  if (Array.isArray(element.members)) return element.members.map((item) => (item.geometry ?? []).map(coordinateOf).filter(Boolean)).filter((item) => item.length);
  const point = coordinateOf(element) ?? coordinateOf(element.center);
  return point ? [[point]] : [];
}

export function compactThermalContext(osmPayload, boundaryPayload) {
  const features = [];
  for (const element of osmPayload?.elements ?? []) {
    const contextClass = thermalContextClass(element.tags);
    if (!contextClass) continue;
    const paths = pathsOf(element);
    if (!paths.length) continue;
    features.push({
      id: `${element.type}/${element.id}`,
      contextClass,
      name: element.tags?.name ?? element.tags?.operator ?? null,
      tags: Object.fromEntries(['landuse', 'power', 'generator:source', 'plant:source', 'man_made', 'industrial', 'amenity'].filter((key) => element.tags?.[key]).map((key) => [key, element.tags[key]])),
      paths
    });
  }
  const boundary = (Array.isArray(boundaryPayload) ? boundaryPayload : []).find((item) => item?.geojson)?.geojson ?? null;
  return { schema: 'vigia.thermal-site-context-index.v1', features, portugalBoundary: boundary };
}

const bounds = (paths) => {
  const points = paths.flat();
  return { west: Math.min(...points.map((item) => item[0])), east: Math.max(...points.map((item) => item[0])), south: Math.min(...points.map((item) => item[1])), north: Math.max(...points.map((item) => item[1])) };
};
const cellKey = (x, y, size) => `${Math.floor(x / size)}:${Math.floor(y / size)}`;
const ringContains = (ring, point) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j], [x, y] = point;
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const polygonContains = (polygon, point) => polygon?.length > 0 && ringContains(polygon[0], point) && !polygon.slice(1).some((ring) => ringContains(ring, point));
const insideBoundary = (boundary, point) => {
  if (boundary?.type === 'Polygon') return polygonContains(boundary.coordinates, point);
  if (boundary?.type === 'MultiPolygon') return boundary.coordinates.some((polygon) => polygonContains(polygon, point));
  return null;
};
const segmentDistanceKm = (point, first, second) => {
  const latitude = (point[1] + first[1] + second[1]) / 3 * Math.PI / 180;
  const scaleX = EARTH_KM_PER_DEGREE * Math.cos(latitude), scaleY = EARTH_KM_PER_DEGREE;
  const px = (point[0] - first[0]) * scaleX, py = (point[1] - first[1]) * scaleY;
  const dx = (second[0] - first[0]) * scaleX, dy = (second[1] - first[1]) * scaleY;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, (px * dx + py * dy) / denominator)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
};
function featureDistanceKm(feature, point) {
  let nearest = Infinity;
  for (const path of feature.paths) {
    if (path.length >= 4 && path[0][0] === path.at(-1)[0] && path[0][1] === path.at(-1)[1] && ringContains(path, point)) return 0;
    if (path.length === 1) nearest = Math.min(nearest, segmentDistanceKm(point, path[0], path[0]));
    for (let index = 1; index < path.length; index += 1) nearest = Math.min(nearest, segmentDistanceKm(point, path[index - 1], path[index]));
  }
  return nearest;
}

export function buildThermalContextResolver(compact, { cellSizeDegrees = .05, searchRadiusKm = 2 } = {}) {
  const cells = new Map(), margin = searchRadiusKm / EARTH_KM_PER_DEGREE;
  for (let index = 0; index < (compact?.features ?? []).length; index += 1) {
    const area = bounds(compact.features[index].paths);
    const minX = Math.floor((area.west - margin) / cellSizeDegrees), maxX = Math.floor((area.east + margin) / cellSizeDegrees);
    const minY = Math.floor((area.south - margin) / cellSizeDegrees), maxY = Math.floor((area.north + margin) / cellSizeDegrees);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const key = `${x}:${y}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(index);
    }
  }
  return (coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) return { insidePortugal: null, heatContext: null };
    const candidates = cells.get(cellKey(coordinate[0], coordinate[1], cellSizeDegrees)) ?? [];
    let nearest = null;
    for (const index of candidates) {
      const feature = compact.features[index], distanceKm = featureDistanceKm(feature, coordinate);
      if (distanceKm <= searchRadiusKm && (!nearest || distanceKm < nearest.distanceKm)) nearest = { id: feature.id, contextClass: feature.contextClass, name: feature.name, tags: feature.tags, distanceKm: Number(distanceKm.toFixed(3)) };
    }
    return { insidePortugal: insideBoundary(compact.portugalBoundary, coordinate), heatContext: nearest };
  };
}
