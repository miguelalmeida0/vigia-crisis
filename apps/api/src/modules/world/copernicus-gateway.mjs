import { postJson } from '../../shared/fetch.mjs';
import { numberOrNull, textOr } from '../../shared/values.mjs';
import { SOURCE_DEFINITIONS } from './source-catalog.mjs';

const PORTUGAL_BBOX = Object.freeze([-9.75, 36.7, -6, 42.3]);
const PILOT_REGIONS = Object.freeze([
  { id: 'north-interior', label: 'North interior', coordinate: [-7.35, 41.45], bbox: [-8.2, 40.95, -6.55, 42.25] },
  { id: 'viseu-dao', label: 'Viseu · Dão', coordinate: [-7.9, 40.66], bbox: [-8.55, 40.1, -7.2, 41.15] },
  { id: 'central-pinhal', label: 'Central Pinhal', coordinate: [-8.05, 39.85], bbox: [-8.85, 39.25, -7.2, 40.45] },
  { id: 'castelo-branco', label: 'Castelo Branco', coordinate: [-7.49, 39.82], bbox: [-8.15, 39.2, -6.75, 40.35] },
  { id: 'alentejo', label: 'Alentejo', coordinate: [-7.9, 38.4], bbox: [-9, 37.45, -6.85, 39.25] },
  { id: 'algarve', label: 'Algarve', coordinate: [-8.05, 37.18], bbox: [-9.55, 36.85, -7.1, 37.65] }
]);

function isoDaysAgo(days, clock) {
  return new Date(clock().getTime() - days * 86_400_000).toISOString();
}

function itemBbox(item) {
  if (Array.isArray(item?.bbox) && item.bbox.length >= 4) return item.bbox.slice(0, 4).map(Number);
  const coordinates = item?.geometry?.coordinates?.flat?.(4)?.filter?.(Number.isFinite) ?? [];
  if (coordinates.length < 4) return null;
  const lons = coordinates.filter((_, index) => index % 2 === 0);
  const lats = coordinates.filter((_, index) => index % 2 === 1);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function intersects(a, b) {
  return a && b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function previewAsset(assets = {}) {
  const keys = ['thumbnail', 'rendered_preview', 'preview', 'visual', 'overview', 'TCI'];
  for (const key of keys) {
    const href = assets?.[key]?.href;
    if (typeof href === 'string' && /^https?:\/\//.test(href)) return href;
  }
  return null;
}

function normalizeItem(item) {
  const bbox = itemBbox(item);
  if (!bbox) return null;
  return {
    id: String(item.id),
    acquiredAt: item.properties?.datetime ?? item.properties?.start_datetime ?? null,
    cloudCover: numberOrNull(item.properties?.['eo:cloud_cover']),
    processingLevel: textOr(item.properties?.processing_level ?? item.properties?.['s2:processing_baseline']),
    bbox,
    coordinate: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    previewUrl: previewAsset(item.assets),
    itemUrl: item.links?.find?.((link) => link.rel === 'self')?.href ?? null
  };
}

function pairRegions(items) {
  return PILOT_REGIONS.map((region) => {
    const relevant = items
      .filter((item) => intersects(item.bbox, region.bbox))
      .sort((a, b) => String(b.acquiredAt).localeCompare(String(a.acquiredAt)));
    return {
      ...region,
      latest: relevant[0] ?? null,
      previous: relevant.find((item) => item.id !== relevant[0]?.id) ?? null,
      scenes: relevant.slice(0, 8),
      availableCount: relevant.length
    };
  });
}

export class CopernicusGateway {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 16_000, userAgent = 'VIGIA/9.0 sensor-fusion-core', clock = () => new Date() } = {}) {
    this.options = { fetchImpl, timeoutMs, userAgent };
    this.clock = clock;
  }

  async snapshot() {
    const definition = SOURCE_DEFINITIONS.copernicus;
    const fetchedAt = this.clock().toISOString();
    const payload = {
      collections: ['sentinel-2-l2a'],
      bbox: PORTUGAL_BBOX,
      datetime: `${isoDaysAgo(40, this.clock)}/${fetchedAt}`,
      limit: 20,
      query: { 'eo:cloud_cover': { lt: 80 } },
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      fields: {
        include: ['id', 'bbox', 'geometry', 'properties.datetime', 'properties.start_datetime', 'properties.eo:cloud_cover', 'properties.processing_level', 'assets', 'links']
      }
    };
    try {
      const response = await postJson('https://stac.dataspace.copernicus.eu/v1/search', payload, this.options);
      if(!Array.isArray(response?.features))throw new Error('copernicus_catalogue_schema_drift');
      const items = (response.features ?? []).map(normalizeItem).filter(Boolean);
      return {
        id: 'copernicus',
        data: pairRegions(items).map(region=>({...region,receivedAt:fetchedAt,provenance:{synthetic:false,provider:'Copernicus Data Space Ecosystem STAC',normalizerVersion:'stac-catalogue-regions-v1'}})),
        state: {
          id: 'copernicus',
          ...definition,
          state: 'current',
          fetchedAt,
          upstreamAt: items.map((item) => item.acquiredAt).filter(Boolean).sort().at(-1) ?? null,
          error: null,
          currentCoverage:'At most 20 latest returned Sentinel-2 catalogue items over mainland Portugal; not complete scene coverage or a fire measurement.',
          emptyProductMeaning:items.length?null:'Provider responded successfully with no matching Sentinel-2 catalogue items.'
        }
      };
    } catch (error) {
      return {
        id: 'copernicus',
        data: PILOT_REGIONS.map((region) => ({ ...region, latest: null, previous: null, availableCount: 0 })),
        state: { id: 'copernicus', ...definition, state: 'unavailable', fetchedAt: null, upstreamAt: null, error: String(error.message ?? error) }
      };
    }
  }
}
