import { mercatorNormalized, project } from './map-projection.js';
import { PORTUGAL_BOUNDS } from './portugal-geometry.js';

function tileXY(coordinate, zoom) {
  const [x, y] = mercatorNormalized(coordinate); const n = 2 ** zoom;
  return [Math.floor(x * n), Math.floor(y * n)];
}
function tileLon(x, zoom) { return x / 2 ** zoom * 360 - 180; }
function tileLat(y, zoom) { const value = Math.PI - 2 * Math.PI * y / 2 ** zoom; return 180 / Math.PI * Math.atan(.5 * (Math.exp(value) - Math.exp(-value))); }

export function basemapTiles(detailLevel = 1) {
  const zoom = detailLevel >= 3.4 ? 10 : detailLevel >= 2.1 ? 9 : detailLevel >= 1.35 ? 8 : 7;
  const [[west, south], [east, north]] = PORTUGAL_BOUNDS; const [x0, y0] = tileXY([west, north], zoom); const [x1, y1] = tileXY([east, south], zoom);
  const tiles = [];
  for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) {
    const [left, top] = project([tileLon(x, zoom), tileLat(y, zoom)]); const [right, bottom] = project([tileLon(x + 1, zoom), tileLat(y + 1, zoom)]);
    tiles.push({ zoom, x, y, left, top, width: right - left, height: bottom - top });
  }
  return tiles;
}
