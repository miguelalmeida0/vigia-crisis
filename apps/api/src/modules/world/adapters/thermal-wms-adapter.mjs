import { fetchBuffer, fetchText } from '../../../shared/fetch.mjs';
import { TtlCache } from '../../../shared/ttl-cache.mjs';
import { RequestGate, SingleFlight } from '../../../shared/request-gate.mjs';

const WORLD_METERS = 20037508.342789244;
const BASE_URL = 'https://adaguc.lsasvcs.ipma.pt/adagucserver?dataset=MSG-FRP';

function tileBbox3857(z, x, y) {
  const tiles = 2 ** z;
  const span = (WORLD_METERS * 2) / tiles;
  const minX = -WORLD_METERS + x * span;
  const maxX = minX + span;
  const maxY = WORLD_METERS - y * span;
  const minY = maxY - span;
  return [minX, minY, maxX, maxY];
}

function parseLayers(xml) {
  const names = [...String(xml).matchAll(/<(?:[A-Za-z0-9_]+:)?Name>\s*([^<]+?)\s*<\/(?:[A-Za-z0-9_]+:)?Name>/g)]
    .map((match) => match[1].trim())
    .filter((name) => /(frp.*pixel|pixel.*frp|frppixel|frp)/i.test(name));
  return [...new Set([...names, 'FRP-PIXEL', 'FRPPixel', 'FRP', 'MSG-FRP'])];
}

export class ThermalWmsAdapter {
  #fetchImpl;
  #timeoutMs;
  #cache = new TtlCache({ maxEntries: 500 });
  #layerCache = null;
  #gate;#singleFlight=new SingleFlight({maxKeys:520});

  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 14_000,gate=new RequestGate({maxConcurrent:8,maxConcurrentPerClient:3,maxRequestsPerWindow:180}) } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#gate=gate;
  }

  async probe(clientKey='internal') {
    return this.#gate.run(clientKey,async()=>{
      const layers = await this.#layers();
      return { layers: layers.slice(0, 6), upstreamAt: null };
    });
  }

  async tile(z, x, y,clientKey='internal') {
    if(!Number.isInteger(z)||z<0||z>22||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=2**z||y>=2**z)throw Object.assign(new Error('invalid_thermal_tile'),{statusCode:400});
    const key = `${z}:${x}:${y}`;
    const cached = this.#cache.get(key);
    if (cached) return cached;
    return this.#singleFlight.run(`tile:${key}`,()=>this.#gate.run(clientKey,async()=>{try{
      const layers = await this.#layers();
      let lastError = null;
      for (const layer of layers.slice(0, 8)) {
        try {
          const tile = await this.#fetchTile(layer, z, x, y);
          this.#cache.set(key, tile, 120_000);
          return tile;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError??new Error('no_layer');
    }catch(error){throw Object.assign(new Error(`thermal_wms_unavailable:${String(error?.message??error)}`),{statusCode:503});}}));
  }

  async #layers() {
    const cached=()=>{if(!this.#layerCache||this.#layerCache.expiresAt<=Date.now())return null;if(this.#layerCache.error)throw new Error(this.#layerCache.error);return this.#layerCache.layers;};
    const available=cached();if(available)return available;
    return this.#singleFlight.run('metadata:layers',async()=>{
      const shared=cached();if(shared)return shared;
      const url = new URL(BASE_URL);
      url.searchParams.set('SERVICE', 'WMS');
      url.searchParams.set('REQUEST', 'GetCapabilities');
      url.searchParams.set('VERSION', '1.1.1');
      try{
        const xml = await fetchText(url, { fetchImpl: this.#fetchImpl, timeoutMs: this.#timeoutMs, maxBytes:2*1024*1024 });
        const layers = parseLayers(xml);
        this.#layerCache = { layers, expiresAt: Date.now() + 30 * 60_000 };
        return layers;
      }catch(error){this.#layerCache={error:String(error.message??error),expiresAt:Date.now()+30_000};throw error;}
    });
  }

  async #fetchTile(layer, z, x, y) {
    const bbox = tileBbox3857(z, x, y);
    const url = new URL(BASE_URL);
    const params = {
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '',
      FORMAT: 'image/png', TRANSPARENT: 'TRUE', SRS: 'EPSG:3857', BBOX: bbox.join(','), WIDTH: '512', HEIGHT: '512'
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const result=await fetchBuffer(url,{fetchImpl:this.#fetchImpl,timeoutMs:this.#timeoutMs,headers:{accept:'image/png,image/*;q=.9,*/*;q=.1'},userAgent:'VIGIA/1.1',maxBytes:4_000_000});
    if(!result.contentType.startsWith('image/'))throw new Error('thermal_wms_not_image');
    return { body: result.body, contentType:result.contentType, state: 'current' };
  }
}

export { parseLayers, tileBbox3857 };
