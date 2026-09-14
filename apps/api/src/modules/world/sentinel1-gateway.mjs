import { postJson } from '../../shared/fetch.mjs';
import { PILOT_REGIONS, PORTUGAL_BBOX } from './pilot-regions.mjs';

function daysAgo(days, clock) { return new Date(clock().getTime() - days * 86_400_000).toISOString(); }
function intersects(a, b) { return a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function normalize(item) {
  const bbox = Array.isArray(item.bbox) ? item.bbox.slice(0, 4).map(Number) : null;
  if (!bbox?.every(Number.isFinite)) return null;
  return {
    id: String(item.id), sensor: 'Sentinel-1', acquiredAt: item.properties?.datetime ?? item.properties?.start_datetime ?? null,
    orbitDirection: item.properties?.['sat:orbit_state'] ?? null, polarization: item.properties?.['sar:polarizations'] ?? [],
    bbox, coordinate: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], previewUrl: item.assets?.thumbnail?.href ?? null,
    source: 'Copernicus Data Space Ecosystem STAC'
  };
}

export class Sentinel1Gateway {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 16_000, userAgent = 'VIGIA/3.0', clock = () => new Date() } = {}) { this.options = { fetchImpl, timeoutMs, userAgent }; this.clock = clock; }
  async snapshot() {
    const fetchedAt = this.clock().toISOString();
    const payload = { collections: ['sentinel-1-grd'], bbox: PORTUGAL_BBOX, datetime: `${daysAgo(20, this.clock)}/${fetchedAt}`, limit: 100, sortby: [{ field: 'properties.datetime', direction: 'desc' }] };
    try {
      const response = await postJson('https://stac.dataspace.copernicus.eu/v1/search', payload, this.options);
      const items = (response.features ?? []).map(normalize).filter(Boolean);
      return PILOT_REGIONS.map((region) => ({ ...region, scenes: items.filter((item) => intersects(item.bbox, region.bbox)).slice(0, 6) }));
    } catch { return PILOT_REGIONS.map((region) => ({ ...region, scenes: [] })); }
  }
}
