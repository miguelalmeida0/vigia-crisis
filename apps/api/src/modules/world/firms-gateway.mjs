import { createHash } from 'node:crypto';
import { parseCsv } from '../../shared/csv.mjs';
import { fetchText } from '../../shared/fetch.mjs';
import { SOURCE_DEFINITIONS } from './source-catalog.mjs';
import { HttpAcquirer } from '../acquisition/http-acquirer.mjs';
import {
  FIRMS_NORMALIZER_VERSION,
  firmsDetectionKey,
  firmsObservedAt,
  firmsSatelliteLabel,
  normalizeFirmsRows
} from './firms-normalizer.mjs';

const AREA = '-9.75,36.7,-6,42.3';
const SOURCES = Object.freeze(['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT', 'MODIS_NRT']);
const DAY_RANGE = 3;


export class FirmsGateway {
  #lastSnapshot=null;#nextPollAt=0;#inflight=null;#failureStreak=0;#controller=null;#stopped=false;
  constructor({ mapKey = '', fetchImpl = globalThis.fetch, timeoutMs = 16_000, userAgent = 'VIGIA/10.0', clock = () => new Date(), acquisitionStore = null, pollIntervalMs = 300_000, maxBackoffMs = 1_800_000 } = {}) {
    this.mapKey = mapKey; this.options = { fetchImpl, timeoutMs, userAgent }; this.clock = clock;
    this.pollIntervalMs=Math.max(60_000,Number(pollIntervalMs)||300_000);this.maxBackoffMs=Math.max(this.pollIntervalMs,Number(maxBackoffMs)||1_800_000);
    this.acquirer=acquisitionStore?new HttpAcquirer({store:acquisitionStore,fetchImpl,timeoutMs,userAgent,clock}):null;
  }
  async snapshot() {
    const definition = SOURCE_DEFINITIONS.firms;
    if (!this.mapKey) return { id:'firms', data:[], state:{ id:'firms', ...definition, provider:'NASA FIRMS', configured:false, configurationState:'NASA_FIRMS_MAP_KEY required', accessClassification:'CREDENTIAL_BLOCKED', evidenceRole:'independent physical point evidence', state:'not_configured', fetchedAt:null, lastPollAt:null, lastSuccessAt:null, upstreamAt:null, latestSourceObservation:null, ingestLagSeconds:null, accepted:0, rejected:0, currentCoverage:'Portugal mainland · no acquisition while unconfigured', nextPollAt:null, nextExpectedOpportunity:null, error:'Set NASA_FIRMS_MAP_KEY to enable point-level VIIRS and MODIS event tracking.' } };
    if(this.#stopped)return this.#lastSnapshot??{id:'firms',data:[],state:{id:'firms',...definition,configured:true,state:'stopped',fetchedAt:null,upstreamAt:null,nextPollAt:null,error:'FIRMS acquisition stopped during graceful shutdown.'}};
    const nowMs=this.clock().getTime();if(this.#lastSnapshot&&nowMs<this.#nextPollAt)return structuredClone(this.#lastSnapshot);
    if(this.#inflight)return this.#inflight;
    this.#controller=new AbortController();this.#inflight=this.#poll(definition,this.#controller.signal).finally(()=>{this.#inflight=null;this.#controller=null;});return this.#inflight;
  }
  stop(){this.#stopped=true;this.#controller?.abort(new Error('firms_acquisition_cancelled'));}
  async #poll(definition,signal){
    const fetchedAt = this.clock().toISOString();
    const results = await Promise.all(SOURCES.map((sourceKey) => this.#source(sourceKey,signal)));
    const successful = results.filter((item) => item.ok); const errors = results.filter((item) => !item.ok);
    if (!successful.length){this.#failureStreak+=1;const delay=Math.min(this.maxBackoffMs,this.pollIntervalMs*2**Math.min(5,this.#failureStreak-1));this.#nextPollAt=this.clock().getTime()+delay;this.#lastSnapshot={ id:'firms', data:[], state:{ id:'firms', ...definition, provider:'NASA FIRMS',configured:true,configurationState:'configured',accessClassification:'LIVE_ACCESSIBLE',evidenceRole:'independent physical point evidence',state:'unavailable', fetchedAt:null,upstreamAt:null,lastPollAt:fetchedAt,lastAcquisitionAttemptAt:fetchedAt,lastSuccessAt:this.#lastSnapshot?.state?.lastSuccessAt??null,latestSourceObservation:this.#lastSnapshot?.state?.latestSourceObservation??null,ingestLagSeconds:null,accepted:0,rejected:errors.length,currentCoverage:'Portugal mainland · acquisition failed',nextPollAt:new Date(this.#nextPollAt).toISOString(),nextExpectedOpportunity:null,consecutiveFailures:this.#failureStreak,error:errors.map((item) => `${item.sourceKey}:${item.error}`).join(' | ') } };return structuredClone(this.#lastSnapshot);}
    const deduped = new Map();
    for (const result of successful) for (const item of result.data) deduped.set(firmsDetectionKey(item), item);
    const data = [...deduped.values()].sort((a,b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    this.#failureStreak=0;this.#nextPollAt=this.clock().getTime()+this.pollIntervalMs;const upstreamAt=data.map((item)=>item.observedAt).filter(Boolean).sort().at(-1)??null;this.#lastSnapshot={ id:'firms', data, state:{ id:'firms', ...definition, provider:'NASA FIRMS',configured:true,configurationState:'configured',accessClassification:'LIVE_ACCESSIBLE',evidenceRole:'independent physical point evidence',state:errors.length ? 'degraded' : 'current', fetchedAt,upstreamAt,lastPollAt:fetchedAt,lastAcquisitionAttemptAt:fetchedAt,lastSuccessAt:fetchedAt,latestSourceObservation:upstreamAt,ingestLagSeconds:upstreamAt?Math.max(0,Math.round((Date.parse(fetchedAt)-Date.parse(upstreamAt))/1000)):null,accepted:data.length,rejected:errors.length,currentCoverage:`Portugal mainland · ${successful.length}/${SOURCES.length} thermal feeds`,nextPollAt:new Date(this.#nextPollAt).toISOString(),nextExpectedOpportunity:null,pollIntervalMs:this.pollIntervalMs,consecutiveFailures:0,error:errors.length ? `${errors.length} of ${SOURCES.length} thermal feeds unavailable.` : null, feeds:SOURCES, healthyFeeds:successful.map((item)=>item.sourceKey), rawSourceProductIds:successful.map((item)=>item.rawSourceProductId).filter(Boolean) } };return structuredClone(this.#lastSnapshot);
  }
  async #source(sourceKey,signal) {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(this.mapKey)}/${sourceKey}/${AREA}/${DAY_RANGE}`;
      let text,rawSourceProduct=null;
      if(this.acquirer){const archiveUri=`https://firms.modaps.eosdis.nasa.gov/api/area/csv/REDACTED/${sourceKey}/${AREA}/${DAY_RANGE}`;const result=await this.acquirer.text({sourceId:`firms:${sourceKey}`,provider:'nasa-firms',url,archiveUri,accept:'text/csv,text/plain',parserVersion:'nasa-firms-area-csv-v1',requestWindow:{aoi:AREA,dayRange:DAY_RANGE,sourceKey},signal,licenceMetadata:{state:'provider_terms_apply',provider:'NASA FIRMS'},describe:async(value)=>{if(!/latitude/i.test(value)||!/longitude/i.test(value)||!/acq_date/i.test(value))throw new Error('firms_csv_schema_invalid');const parsed=parseCsv(value),times=parsed.map(firmsObservedAt).filter(Boolean).sort(),sourceTimestamp=times.at(-1)??null,snapshotHash=createHash('sha256').update(value).digest('hex');return{sourceTimestamp,sourceTimestampRange:times.length?{start:times[0],end:times.at(-1)}:null,providerProductId:`${sourceKey}:area-snapshot:${snapshotHash}`,normalizerVersion:FIRMS_NORMALIZER_VERSION};}});text=result.value;rawSourceProduct=result.rawSourceProduct;}else text=await fetchText(url,{...this.options,signal});
      const rows = parseCsv(text),canonicalizedAt=this.clock().toISOString();
      const data=normalizeFirmsRows(rows,sourceKey,{rawSourceProductId:rawSourceProduct?.id??null,checksumSha256:rawSourceProduct?.checksumSha256??null,providerProductId:rawSourceProduct?.providerProductId??null}).map((item)=>({...item,
        rawSourceProductId:rawSourceProduct?.id??null,receivedAt:rawSourceProduct?.receivedAt??null,providerReceivedAt:null,
        providerDiscoveredAt:rawSourceProduct?.requestedAt??null,productSensingStartAt:rawSourceProduct?.sourceTimestampRange?.start??null,productSensingEndAt:rawSourceProduct?.sourceTimestampRange?.end??null,
        vigiaAcquisitionStartedAt:rawSourceProduct?.acquisitionTimings?.acquisitionStartedAt??null,downloadStartedAt:rawSourceProduct?.acquisitionTimings?.downloadStartedAt??null,downloadCompletedAt:rawSourceProduct?.acquisitionTimings?.downloadCompletedAt??null,archivePersistedAt:rawSourceProduct?.acquisitionTimings?.archivePersistedAt??null,parseStartedAt:rawSourceProduct?.acquisitionTimings?.parseStartedAt??null,
        vigiaAcquiredAt:rawSourceProduct?.receivedAt??rawSourceProduct?.acquisitionTimings?.downloadCompletedAt??null,vigiaParsedAt:rawSourceProduct?.parsedAt??rawSourceProduct?.acquisitionTimings?.parseCompletedAt??null,vigiaCanonicalizedAt:canonicalizedAt,vigiaIngestedAt:rawSourceProduct?.ingestedAt??null
      }));
      return { ok:true, sourceKey, data, rawSourceProductId:rawSourceProduct?.id??null };
    } catch (error) { return { ok:false, sourceKey, data:[], error:String(error.message ?? error) }; }
  }
}

export { SOURCES as FIRMS_SOURCES, firmsSatelliteLabel as satelliteLabel };
