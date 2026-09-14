import { bboxAround } from '../../../../../packages/domain/src/geo.mjs';
import { fetchBuffer } from '../../shared/fetch.mjs';
import { TtlCache } from '../../shared/ttl-cache.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';

const EOX_WMS = 'https://tiles.maps.eox.at/map';
const ANNUAL_YEARS = new Set(['2024', '2025']);
const PORTUGAL_BBOX = Object.freeze([-9.72, 36.78, -6.05, 42.22]);

function validateCoordinate(lon, lat) {
  const coordinate = [Number(lon), Number(lat)];
  if (!coordinate.every(Number.isFinite)) throw new Error('invalid_coordinate');
  return coordinate;
}

function validateBbox(value) {
  const bounds = Array.isArray(value) ? value.map(Number) : String(value).split(',').map(Number);
  if (bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('invalid_imagery_bbox');
  return bounds;
}

function fitBboxToAspect(bounds, aspect = 1.6) {
  const [west, south, east, north] = bounds;
  const centerLat = (south + north) / 2;
  const physicalWidth = (east - west) * Math.cos(centerLat * Math.PI / 180);
  const physicalHeight = north - south;
  const current = physicalWidth / Math.max(.0001, physicalHeight);
  if (current >= aspect) return bounds;
  const extraPhysical = physicalHeight * aspect - physicalWidth;
  const extraDegrees = extraPhysical / Math.max(.2, Math.cos(centerLat * Math.PI / 180));
  return [west - extraDegrees / 2, south, east + extraDegrees / 2, north];
}

export function buildEoxWmsUrl({ year, bbox, width = 1600, height = 1000 }) {
  if (!ANNUAL_YEARS.has(String(year))) throw new Error('invalid_imagery_year');
  const url = new URL(EOX_WMS);
  const params = {
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1',
    LAYERS: `s2cloudless-${year}`, STYLES: '', FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE',
    SRS: 'EPSG:4326', BBOX: validateBbox(bbox).join(','), WIDTH: String(width), HEIGHT: String(height)
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

export class ImageryService {
  #fetchImpl;
  #cache = new TtlCache({ maxEntries: 90 });
  #gate;#singleFlight=new SingleFlight({maxKeys:120});

  constructor({ fetchImpl = globalThis.fetch, gate = new RequestGate({maxConcurrent:6,maxConcurrentPerClient:2,maxRequestsPerWindow:90}) } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#gate=gate;
  }

  observationPair({ lon, lat, radiusKm = 8 }) {
    const coordinate = validateCoordinate(lon, lat);
    const bbox = fitBboxToAspect(bboxAround(coordinate, Math.max(3.5, Math.min(18, Number(radiusKm) || 8))), 1.2);
    const query = new URLSearchParams({ bbox: bbox.join(',') });
    return {
      provider: 'EOxCloudless · EOX',
      sensor: 'Copernicus Sentinel-2 MSI annual cloudless mosaic',
      cadence: 'annual baseline · not near-real-time',
      beforeDate: '2024 annual mosaic',
      afterDate: '2025 annual mosaic',
      bbox,
      beforeUrl: `/api/v1/imagery/frame/2024?${query}`,
      afterUrl: `/api/v1/imagery/frame/2025?${query}`,
      resolutionNotice: 'High-resolution annual Sentinel-2 context. It is a clear baseline, not a current acquisition or confirmed physical change.',
      interpretationNotice: 'Differences can reflect seasonal composition, land use, harvest, mosaic selection or genuine landscape change. Human verification remains mandatory.'
    };
  }

  async frame({ date, bbox,clientKey='internal' }) {
    const year = String(date);
    if (!ANNUAL_YEARS.has(year)) throw new Error('invalid_imagery_year');
    const bounds = validateBbox(bbox);
    return this.#remoteFrame({ year, bbox: bounds, width: 1440, height: 1200,clientKey });
  }

  async nationalFrame({ year = '2025',clientKey='internal' } = {}) {
    return this.#remoteFrame({ year: String(year), bbox: PORTUGAL_BBOX, width: 1600, height: 2200,clientKey });
  }

  async #remoteFrame({ year, bbox, width, height,clientKey }) {
    const key = `eox:${year}:${width}x${height}:${bbox.map((value) => value.toFixed(5)).join(',')}`;
    const cached = this.#cache.get(key);
    if (cached) return { ...cached, buffer: Buffer.from(cached.buffer) };
    return this.#singleFlight.run(key,()=>this.#gate.run(clientKey,async()=>{
      const again=this.#cache.get(key);if(again)return{...again,buffer:Buffer.from(again.buffer)};
      const url = buildEoxWmsUrl({ year, bbox, width, height });
      const result = await fetchBuffer(url, { fetchImpl: this.#fetchImpl, timeoutMs: 18_000, userAgent: 'VIGIA/1.2',maxBytes:8_000_000 });
      const value = { ...result, sourceState: 'current', sourceUrl: url.toString() };
      this.#cache.set(key, { ...value, buffer:Buffer.from(value.buffer) }, 24 * 60 * 60_000);
      return value;
    }));
  }
}
