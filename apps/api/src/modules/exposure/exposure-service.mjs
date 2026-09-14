import { TtlCache } from '../../shared/ttl-cache.mjs';
import { buildPublicContext } from './exposure-context.mjs';
import { loadOverpassExposure, loadOverpassStructureContext } from './overpass-adapter.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';

function validateCoordinate(lon, lat) {
  const coordinate = [Number(lon), Number(lat)];
  if (!coordinate.every(Number.isFinite)) throw new Error('invalid_coordinate');
  if(coordinate[0]<-10.5||coordinate[0]>-5.5||coordinate[1]<36||coordinate[1]>43)throw new Error('coordinate_outside_pilot_region');
  return coordinate;
}

export class ExposureService {
  #fetchImpl;
  #clock;
  #worldService;
  #cache = new TtlCache({ maxEntries: 120 });
  #structureCache = new TtlCache({ maxEntries: 120 });
  #gate;#singleFlight=new SingleFlight({maxKeys:180});

  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date(), worldService = null,gate=new RequestGate({maxConcurrent:6,maxConcurrentPerClient:2,maxRequestsPerWindow:90}) } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#clock = clock;
    this.#worldService = worldService;
    this.#gate=gate;
  }

  async inspect({ lon, lat,clientKey='internal' }) {
    const coordinate = validateCoordinate(lon, lat);
    const key = coordinate.map((value) => value.toFixed(3)).join(':');
    const cached = this.#cache.get(key);
    if (cached) return cached;
    return this.#singleFlight.run(`exposure:${key}`,()=>this.#gate.run(clientKey,async()=>{const again=this.#cache.get(key);if(again)return again;const inspectedAt = this.#clock().toISOString();

    const world = await this.#worldService?.snapshot?.().catch(() => null);
    const context = buildPublicContext(coordinate, world);
    try {
      const result = await loadOverpassExposure({ coordinate, fetchImpl: this.#fetchImpl });
      const state = result.partial ? 'partial' : 'current';
      const value = this.#value({ coordinate, inspectedAt, result, state, provider: 'OpenStreetMap via Overpass', context });
      return this.#remember(key, value, state === 'current' ? 15 * 60_000 : 4 * 60_000);
    } catch (error) {
      const value = {
        coordinate,
        state: 'partial',
        inspectedAt,
        provider: 'Public-source context fallback',
        buildingCountWithin3Km: null,
        buildingPoints: [],
        assets: [],
        context,
        limitation: 'OpenStreetMap building and critical-asset geometry could not be loaded. VIGIA retained nearby public occurrence, fire-danger and weather context instead of leaving the workflow blank.',
        error: String(error.message ?? error)
      };
      return this.#remember(key, value, 2 * 60_000);
    }}));
  }

  async inspectStructures({ lon, lat,clientKey='internal' }) {
    const coordinate = validateCoordinate(lon, lat);
    const key = coordinate.map((value) => value.toFixed(3)).join(':');
    const cached = this.#structureCache.get(key);
    if (cached) return cached;
    return this.#singleFlight.run(`structures:${key}`,()=>this.#gate.run(clientKey,async()=>{const again=this.#structureCache.get(key);if(again)return again;const result = await loadOverpassStructureContext({ coordinate, fetchImpl: this.#fetchImpl });
    const value = {
      coordinate,
      state: result.archived ? 'archived' : result.partial ? 'partial' : 'current',
      inspectedAt: this.#clock().toISOString(),
      provider: result.provider,
      buildingCountWithin3Km: result.buildingCount,
      buildingPoints: result.buildingPoints,
      assets: [],
      endpoint: result.endpoint,
      acquiredAt: result.acquiredAt,
      sourceRecordCount: result.sourceRecordCount,
      sourceChecksum: result.sourceChecksum,
      archivePath: result.archivePath,
      limitation: result.limitation,
      liveError: result.liveError ?? null
    };
    this.#structureCache.set(key, value, result.archived ? 4 * 60_000 : 15 * 60_000);
    return value;}));
  }

  #value({ coordinate, inspectedAt, result, state, provider, context = null }) {
    return {
      coordinate,
      state,
      inspectedAt,
      provider,
      buildingCountWithin3Km: result.buildingCount,
      buildingPoints: result.buildingPoints ?? [],
      assets: result.assets,
      context,
      limitation: result.partial
          ? 'OpenStreetMap returned a partial result. Missing values remain visibly unavailable.'
          : 'OpenStreetMap completeness varies. Building records are context, not a census or evacuation count.',
      endpoint: result.endpoint
    };
  }

  #remember(key, value, ttl) {
    this.#cache.set(key, value, ttl);
    return value;
  }
}
