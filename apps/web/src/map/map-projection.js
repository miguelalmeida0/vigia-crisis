import { PORTUGAL_BOUNDS } from './portugal-geometry.js';

export const ATLAS_VIEW = Object.freeze({ x: 0, y: 0, width: 1000, height: 1000 });
export const CITY_LABELS = Object.freeze([
  { name: 'Braga', coordinate: [-8.43, 41.55] }, { name: 'Porto', coordinate: [-8.61, 41.15] },
  { name: 'Vila Real', coordinate: [-7.74, 41.30] }, { name: 'Bragança', coordinate: [-6.76, 41.81] },
  { name: 'Viseu', coordinate: [-7.91, 40.66] }, { name: 'Guarda', coordinate: [-7.26, 40.54] },
  { name: 'Coimbra', coordinate: [-8.42, 40.21] }, { name: 'Castelo Branco', coordinate: [-7.49, 39.82] },
  { name: 'Leiria', coordinate: [-8.81, 39.74] }, { name: 'Santarém', coordinate: [-8.68, 39.24] },
  { name: 'Lisboa', coordinate: [-9.14, 38.72] }, { name: 'Évora', coordinate: [-7.91, 38.57] },
  { name: 'Beja', coordinate: [-7.86, 38.02] }, { name: 'Faro', coordinate: [-7.93, 37.02] }
]);

export function mercatorNormalized([lon, lat]) {
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  const x = (Number(lon) + 180) / 360;
  const rad = safeLat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return [x, y];
}

const [[WEST, SOUTH], [EAST, NORTH]] = PORTUGAL_BOUNDS;
const [NX0, NY_TOP] = mercatorNormalized([WEST, NORTH]);
const [NX1, NY_BOTTOM] = mercatorNormalized([EAST, SOUTH]);

export function project(coordinate) {
  const [x, y] = mercatorNormalized(coordinate);
  return [110 + (x - NX0) / (NX1 - NX0) * 780, 52 + (y - NY_TOP) / (NY_BOTTOM - NY_TOP) * 896];
}

export function viewForCoordinate(coordinate, zoom = 9.5) {
  const [cx, cy] = project(coordinate); const numericZoom = Number(zoom || 7.2);
  const scale = Math.max(.18, Math.min(1, 2 ** ((7.2 - numericZoom) / 2)));
  return clampView({ x: cx - ATLAS_VIEW.width * scale / 2, y: cy - ATLAS_VIEW.height * scale / 2, width: ATLAS_VIEW.width * scale, height: ATLAS_VIEW.height * scale });
}

export function scaleView(view, factor, anchor = null) {
  const point = anchor ?? [view.x + view.width / 2, view.y + view.height / 2];
  const width = Math.max(170, Math.min(1000, view.width * factor)); const height = Math.max(170, Math.min(1000, view.height * factor));
  const ratioX = (point[0] - view.x) / view.width; const ratioY = (point[1] - view.y) / view.height;
  return clampView({ x: point[0] - width * ratioX, y: point[1] - height * ratioY, width, height });
}

export function clampView(view) {
  const width = Math.max(170, Math.min(1000, view.width)); const height = Math.max(170, Math.min(1000, view.height));
  return { x: Math.max(0, Math.min(1000 - width, view.x)), y: Math.max(0, Math.min(1000 - height, view.y)), width, height };
}
export function viewBoxValue(view) { return `${view.x} ${view.y} ${view.width} ${view.height}`; }
