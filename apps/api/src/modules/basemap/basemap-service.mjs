import { fetchBuffer } from '../../shared/fetch.mjs';
import { TtlCache } from '../../shared/ttl-cache.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';
import {BasemapDiskCache} from './basemap-disk-cache.mjs';

const SOURCE = Object.freeze({
  imagery: {
    provider: 'Esri World Imagery',
    contentType: 'image/jpeg',
    url: ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  },
  labels: {
    provider: 'Esri World Boundaries and Places',
    contentType: 'image/png',
    url: ({ z, x, y }) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`
  },
  streets: {
    provider: 'CARTO dark basemap',
    contentType: 'image/png',
    url: ({ z, x, y }) => `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`
  }
});

function tileCoordinate(value, name, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > max) throw new Error(`invalid_${name}`);
  return numeric;
}

export class BasemapService {
  #fetchImpl;
  #cache = new TtlCache({ maxEntries: 800 });
  #lastGood = new TtlCache({ maxEntries: 800 });
  #gate;#singleFlight=new SingleFlight({maxKeys:320});
  #clock;
  #cacheTtlMs;#lastGoodTtlMs;#upstreamTimeoutMs;#disk;

  constructor({ fetchImpl = globalThis.fetch,gate=new RequestGate({maxConcurrent:32,maxConcurrentPerClient:24,maxRequestsPerWindow:3_600}),clock=()=>new Date(),cacheTtlMs=12*60*60_000,lastGoodTtlMs=7*24*60*60_000,upstreamTimeoutMs=4_500,cacheDirectory=null } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#disk=cacheDirectory?new BasemapDiskCache(cacheDirectory):null;
    this.#gate=gate;
    this.#clock=clock;
    this.#cacheTtlMs=Math.max(1,Number(cacheTtlMs));this.#lastGoodTtlMs=Math.max(this.#cacheTtlMs,Number(lastGoodTtlMs));this.#upstreamTimeoutMs=Math.max(50,Number(upstreamTimeoutMs));
  }

  async tile({ kind, z, x, y,clientKey='anonymous' }) {
    const source = SOURCE[kind];
    if (!source) throw new Error('invalid_basemap_kind');
    const zoom = tileCoordinate(z, 'zoom', 19);
    const limit = 2 ** zoom - 1;
    const coordinate = {
      z: zoom,
      x: tileCoordinate(x, 'x', limit),
      y: tileCoordinate(y, 'y', limit)
    };
    const key = `${kind}:${coordinate.z}:${coordinate.x}:${coordinate.y}`;
    const cached = this.#cache.get(key);
    if (cached) return { ...cached, buffer: Buffer.from(cached.buffer) };
    const stored=await this.#disk?.get(key),age=stored?this.#clock().getTime()-Date.parse(stored.acquiredAt):Infinity;
    if(stored&&age>=0&&age<this.#lastGoodTtlMs){this.#lastGood.set(key,stored,this.#lastGoodTtlMs-age);if(age<this.#cacheTtlMs){this.#cache.set(key,stored,this.#cacheTtlMs-age);return stored;}}

    try {
      const result = await this.#singleFlight.run(key,()=>this.#gate.run(clientKey,()=>fetchBuffer(source.url(coordinate), {
        fetchImpl: this.#fetchImpl,
        timeoutMs: this.#upstreamTimeoutMs,
        maxBytes:3*1024*1024,
        headers: { accept: source.contentType }
      })));
      const normalizedType=String(result.contentType).split(';')[0].trim().toLowerCase();
      if(normalizedType!==source.contentType)throw new Error('basemap_content_type_mismatch');
      const acquiredAt=this.#clock().toISOString();
      const value = {
        buffer: result.buffer,
        contentType: normalizedType,
        state: 'current',
        provider:source.provider,
        acquiredAt,
        lastGoodAt:acquiredAt,
        provenance:`governed:${new URL(source.url(coordinate)).origin}`
      };
      this.#cache.set(key, { ...value, buffer: Buffer.from(value.buffer) }, this.#cacheTtlMs);
      this.#lastGood.set(key,{...value,buffer:Buffer.from(value.buffer)},this.#lastGoodTtlMs);
      void this.#disk?.set(key,value).catch(()=>undefined);
      return value;
    } catch (error) {
      const stale=this.#lastGood.get(key);
      if(stale)return{...stale,buffer:Buffer.from(stale.buffer),state:'stale'};
      throw Object.assign(new Error(`basemap_upstream_unavailable:${String(error.message??error)}`),{statusCode:503});
    }
  }
}
