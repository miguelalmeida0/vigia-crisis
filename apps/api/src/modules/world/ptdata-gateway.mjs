import { fetchJson } from '../../shared/fetch.mjs';
import { unwrap } from '../../shared/values.mjs';
import { SOURCE_DEFINITIONS } from './source-catalog.mjs';
import { HttpAcquirer } from '../acquisition/http-acquirer.mjs';
import {
  normalizeHistory,
  normalizeOccurrences,
  normalizeRisk,
  normalizeWarnings,
  normalizeWeather,
  upstreamTimestamp
} from './ptdata-normalizers.mjs';

const REQUESTS = Object.freeze({
  fires: { normalizer: normalizeOccurrences },
  riskToday: { normalizer: normalizeRisk },
  riskTomorrow: { normalizer: normalizeRisk },
  weather: { normalizer: normalizeWeather },
  warnings: { normalizer: normalizeWarnings }
});

async function settled(id, definition, normalizer, options, context = null) {
  const fetchedAt = options.clock().toISOString();
  try {
    const acquired = await acquiredJson(`ptdata:${id}`, definition.url, options);
    const payload = acquired.payload;
    const key=({fires:'occurrences',riskToday:'risks',riskTomorrow:'risks',weather:'observations',warnings:'warnings'})[id];
    const container=payload?.data?.[key]??payload?.[key]??payload?.data;
    if(!Array.isArray(container)||container.length>20000)throw new Error('ptdata_schema_drift');
    const normalized=normalizer({data:{[key]:container.filter(item=>item&&typeof item==='object'&&!Array.isArray(item))}},context);
    return {
      id,
      data: attribute(normalized, acquired.rawSourceProduct,options.clock().toISOString()),
      state: {
        id,
        ...definition,
        state: 'current',
        fetchedAt,
        lastSuccessAt: options.clock().toISOString(),
        lastAcquisitionAttemptAt:fetchedAt,
        accepted:normalized.length,
        rejected:container.length-normalized.length,
        upstreamAt: upstreamTimestamp(payload),
        error: null,
        rawSourceProductId: acquired.rawSourceProduct?.id ?? null,
        supportRawSourceProductIds: context?.rawSourceProductId ? [context.rawSourceProductId] : []
      }
    };
  } catch (error) {
    return {
      id,
      data: [],
      state: { id, ...definition, state: 'unavailable', fetchedAt: null, upstreamAt: null, lastAcquisitionAttemptAt:fetchedAt,error: String(error.message ?? error) }
    };
  }
}

function attribute(items,raw,receivedAt=null){return items.map((item)=>({...item,receivedAt:raw?.receivedAt??receivedAt,provenance:{...(item.provenance??{}),synthetic:false,provider:'ptdata',rawSourceProductId:raw?.id??null,checksumSha256:raw?.checksumSha256??null,providerProductId:raw?.providerProductId??null,normalizerVersion:'ptdata-normalizers-v2'}}));}
async function acquiredJson(sourceId,url,options){
  if(!options.acquirer)return{payload:await fetchJson(url,options),rawSourceProduct:null};
  const result=await options.acquirer.json({sourceId,provider:'ptdata',url,parserVersion:'ptdata-json-v1',licenceMetadata:{state:'provider_terms_apply',provider:'ptdata'},describe:async(payload)=>{const sourceTimestamp=upstreamTimestamp(payload);return{sourceTimestamp,providerProductId:sourceTimestamp?`${sourceId}:${sourceTimestamp}`:undefined,normalizerVersion:'ptdata-normalizers-v1'};}});
  return{payload:result.value,rawSourceProduct:result.rawSourceProduct};
}

export class PtDataGateway {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 12_000, userAgent = 'VIGIA/1.3', clock = () => new Date(), currentYear = new Date().getUTCFullYear(), acquisitionStore = null } = {}) {
    const acquirer=acquisitionStore?new HttpAcquirer({store:acquisitionStore,fetchImpl,timeoutMs,userAgent}):null;
    this.options = { fetchImpl, timeoutMs, userAgent, clock, acquirer };
    this.currentYear = currentYear;
  }

  async snapshot() {
    const historyPromise=this.#history();
    const municipalityLookup = await this.#municipalityLookup();
    const core = await Promise.all(Object.entries(REQUESTS).map(([id, config]) => settled(
      id,
      SOURCE_DEFINITIONS[id],
      config.normalizer,
      this.options,
      municipalityLookup
    )));
    const history = await historyPromise;
    return Object.fromEntries([...core, history].map((entry) => [entry.id, entry]));
  }

  async #municipalityLookup() {
    try {
      const {payload,rawSourceProduct}=await acquiredJson('ptdata:municipalities','https://api.ptdata.org/v1/geo/municipalities?limit=500',this.options);
      const lookup=new Map(unwrap(payload, 'municipalities').map((item) => [
        String(item.code ?? item.municipality_code ?? ''),
        String(item.name ?? item.municipality ?? '').trim()
      ]).filter(([code, name]) => code && name));
      lookup.rawSourceProductId=rawSourceProduct?.id??null;return lookup;
    } catch {
      return new Map();
    }
  }

  async #history() {
    const definition = SOURCE_DEFINITIONS.history;
    const years = [this.currentYear, this.currentYear - 1];
    const fetchedAt = this.options.clock().toISOString();
    try {
      const acquired=await Promise.all(years.map((year)=>acquiredJson(`ptdata:history:${year}`,`${definition.url}?year=${year}&limit=500`,this.options)));
      const payloads=acquired.map((item)=>item.payload),rawProducts=acquired.map((item)=>item.rawSourceProduct).filter(Boolean);
      const containers=payloads.map(payload=>payload?.data?.fires??payload?.fires??payload?.data);
      if(containers.some(items=>!Array.isArray(items)||items.length>20000))throw new Error('ptdata_history_schema_drift');
      const normalized=containers.map(items=>normalizeHistory({data:{fires:items.filter(item=>item&&typeof item==='object'&&!Array.isArray(item))}}));
      return {
        id: 'history',
        data: normalized.flatMap((items,index)=>attribute(items,acquired[index].rawSourceProduct,this.options.clock().toISOString())),
        state: {
          id: 'history',
          ...definition,
          state: 'current',
          fetchedAt,
          lastSuccessAt:this.options.clock().toISOString(),lastAcquisitionAttemptAt:fetchedAt,
          accepted:normalized.flat().length,rejected:containers.flat().length-normalized.flat().length,
          upstreamAt: payloads.map(upstreamTimestamp).filter(Boolean).sort().at(-1) ?? null,
          error: null,
          rawSourceProductIds: rawProducts.map((item)=>item.id)
        }
      };
    } catch (error) {
      return {
        id: 'history',
        data: [],
        state: { id: 'history', ...definition, state: 'unavailable', fetchedAt: null, upstreamAt: null, error: String(error.message ?? error) }
      };
    }
  }
}
