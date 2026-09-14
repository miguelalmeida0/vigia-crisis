import path from 'node:path';
import { evaluateFreshness } from '../../../../../packages/domain/src/source-health.mjs';
import { clone } from '../../shared/values.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { emptySource, SOURCE_DEFINITIONS } from './source-catalog.mjs';
import { validateSourceBatch, retainObservationHistory } from './observation-validation.mjs';
import { operationalSourceRegistry } from './operational-source-registry.mjs';

const DATA_KEYS = Object.freeze({
  fires: 'fires',
  riskToday: 'riskToday',
  riskTomorrow: 'riskTomorrow',
  weather: 'weather',
  warnings: 'warnings',
  ipmaWeather: 'directWeather',
  ipmaWarnings: 'directWarnings',
  history: 'history',
  copernicus: 'earthObservations',
  firms: 'thermalDetections'
});

function emptySnapshot(now) {
  return {
    meta: {
      mode: 'production',
      generatedAt: now,
      region: 'Portugal mainland',
      notice: 'Near-real-time public-source intelligence. Coordinates, timestamps and counts may be approximate, delayed or corrected. Not an official emergency channel.'
    },
    sources: Object.fromEntries(Object.keys(SOURCE_DEFINITIONS).map((id) => [id, emptySource(id)])),
    fires: [],
    riskToday: [],
    riskTomorrow: [],
    weather: [],
    warnings: [],
    directWeather: [],
    weatherHistory: [],
    directWarnings: [],
    history: [],
    earthObservations: [],
    thermalDetections: []
  };
}

function stateWithFreshness(state, now) {
  const freshness = evaluateFreshness({
    upstreamAt: state.upstreamAt,
    fetchedAt: state.fetchedAt,
    staleAfterSeconds: state.staleAfterSeconds,
    now,
    error: state.error
  });
  const latestSourceObservation=state.latestSourceObservation??state.upstreamAt??null,lastPollAt=state.lastPollAt??state.lastAcquisitionAttemptAt??state.fetchedAt??null;
  const lastSuccessAt=state.lastSuccessAt??(!state.error&&state.fetchedAt?state.fetchedAt:null),ingestLagSeconds=state.ingestLagSeconds??(latestSourceObservation&&lastSuccessAt?Math.max(0,Math.round((Date.parse(lastSuccessAt)-Date.parse(latestSourceObservation))/1000)):null);
  const operational={...state,provider:state.provider??state.origin??'Provider not declared',configurationState:state.configurationState??(state.configured===false?'not_configured':'configured'),lastPollAt,lastSuccessAt,latestSourceObservation,ingestLagSeconds,accepted:Number.isFinite(Number(state.accepted))?Number(state.accepted):0,rejected:Number.isFinite(Number(state.rejected))?Number(state.rejected):0,currentCoverage:state.currentCoverage??'Coverage depends on the latest provider product.',nextExpectedOpportunity:state.nextExpectedOpportunity??null};
  if (state.state === 'not_configured') return operational;
  return { ...operational, state: freshness.state, ageSeconds: freshness.ageSeconds, timeConflict: freshness.timeConflict };
}

function withTransitionHistory(previous, current, now) {
  const priorState = previous?.state ?? null;
  const nextState = current?.state ?? null;
  const changed = Boolean(priorState && nextState && priorState !== nextState);
  const history = Array.isArray(previous?.transitionHistory) ? previous.transitionHistory.slice(-19) : [];
  if (changed) history.push({ from: priorState, to: nextState, at: now.toISOString() });
  const recovered = changed && ['unavailable', 'stale', 'not_configured'].includes(priorState) && nextState === 'current';
  const staleStart = ['unavailable', 'stale'].includes(priorState) ? previous?.currentStateSince : null;
  return {
    ...current,
    currentStateSince: changed || !previous?.currentStateSince ? now.toISOString() : previous.currentStateSince,
    transitionHistory: history,
    lastRecoveryAt: recovered ? now.toISOString() : previous?.lastRecoveryAt ?? null,
    lastStaleDurationMs: recovered && staleStart ? Math.max(0, now.getTime() - Date.parse(staleStart)) : previous?.lastStaleDurationMs ?? null
  };
}

export class WorldService {
  #sourceGateway;
  #acquisitionStore;
  #clock;
  #refreshMs;
  #cacheFile;
  #snapshot;
  #lastRefreshMs = 0;
  #refreshPromise = null;

  constructor({ sourceGateway, acquisitionStore = null, clock = () => new Date(), refreshMs = 120_000, stateFile }) {
    this.#sourceGateway = sourceGateway;
    this.#acquisitionStore = acquisitionStore;
    this.#clock = clock;
    this.#refreshMs = refreshMs;
    this.#cacheFile = path.join(path.dirname(stateFile), 'source-cache.json');
    this.#snapshot = emptySnapshot(clock().toISOString());
  }

  async loadCache() {
    const cached = await readJson(this.#cacheFile, null);
    if (cached?.meta?.mode === 'production') {
      const now=this.#clock(),base=emptySnapshot(now.toISOString());
      this.#snapshot={...base,...cached,sources:{...base.sources,...cached.sources}};
      for(const [id,key] of Object.entries(DATA_KEYS)){
        try{const checked=validateSourceBatch(id,cached[key]??[],now.toISOString());this.#snapshot[key]=checked.data;if(checked.rejectedCount)this.#snapshot.sources[id]={...this.#snapshot.sources[id],state:'unavailable',error:'cached_records_rejected',rejected:checked.rejectedCount,quarantine:checked.rejected};}
        catch{this.#snapshot[key]=[];this.#snapshot.sources[id]={...this.#snapshot.sources[id],state:'unavailable',error:'cached_schema_invalid'};}
      }
      try{this.#snapshot.weatherHistory=retainObservationHistory(validateSourceBatch('weather',cached.weatherHistory??[],now.toISOString()).data,[],{asOf:now.toISOString()});}catch{this.#snapshot.weatherHistory=[];}
      this.#lastRefreshMs = this.#clock().getTime();
    }
    return clone(this.#snapshot);
  }

  async initialize() {
    await this.loadCache();
    await this.refresh({ force: true });
  }

  async snapshot({ preferCache = false } = {}) {
    // Runtime scheduling owns remote acquisition. Read-plane callers that ask
    // for the cache must never start provider work or inherit its latency.
    if (!preferCache) await this.refresh();
    const snapshot=clone(this.#snapshot),now=this.#clock();
    snapshot.sources=Object.fromEntries(Object.entries(snapshot.sources).map(([id,state])=>[id,stateWithFreshness(state,now)]));
    snapshot.sourceRegistry=operationalSourceRegistry(snapshot,now.toISOString());
    return snapshot;
  }

  sourceStates() {
    const now=this.#clock();return Object.fromEntries(Object.entries(this.#snapshot.sources).map(([id,state])=>[id,stateWithFreshness(clone(state),now)]));
  }

  setSourceState(id, patch = {}) {
    if (!this.#snapshot.sources[id]) return;
    const now = this.#clock();
    const previous = this.#snapshot.sources[id];
    this.#snapshot.sources[id] = withTransitionHistory(previous, stateWithFreshness({
      ...this.#snapshot.sources[id],
      ...patch,
      id
    }, now), now);
    this.#snapshot.meta.generatedAt = now.toISOString();
  }

  async refresh({ force = false } = {}) {
    const nowMs = this.#clock().getTime();
    if (!force && nowMs - this.#lastRefreshMs < this.#refreshMs) return { changed: false, snapshot: clone(this.#snapshot) };
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = this.#performRefresh().finally(() => { this.#refreshPromise = null; });
    return this.#refreshPromise;
  }

  async #performRefresh() {
    const previousSignature = this.#signature(this.#snapshot);
    const results = await this.#sourceGateway.snapshot();
    const next = clone(this.#snapshot);
    const now = this.#clock();
    next.meta = {
      ...next.meta,
      mode: 'production',
      generatedAt: now.toISOString(),
      notice: next.meta.notice
    };

    for (const [id, acquired] of Object.entries(results)) {
      let result=acquired;
      if(!SOURCE_DEFINITIONS[id])continue;
      if(!acquired||!acquired.state||!Array.isArray(acquired.data))result={id,data:[],state:{...next.sources[id],state:'unavailable',error:'provider_result_schema_invalid',lastAcquisitionAttemptAt:now.toISOString()}};
      else if(!['unavailable','failed','not_configured'].includes(acquired.state?.state)) {
        try {
          const validated=validateSourceBatch(id,acquired.data,now.toISOString());
          if(acquired.data.length && !validated.data.length)throw new Error('provider_all_records_rejected');
          result={...acquired,data:validated.data,state:{...acquired.state,accepted:validated.data.length,rejected:(acquired.state.rejected??0)+validated.rejectedCount,quarantine:validated.rejected}};
        } catch(error) {result={id,data:[],state:{...acquired.state,state:'unavailable',error:String(error.message),lastAcquisitionAttemptAt:now.toISOString(),rejected:acquired.data?.length??null}};}
      }
      const dataKey = DATA_KEYS[id];
      const hasData = Array.isArray(result.data) && result.data.length > 0;
      const previousData = dataKey ? next[dataKey] : null;
      const shouldRetain = !hasData && Array.isArray(previousData) && previousData.length > 0
        && ['unavailable', 'stale'].includes(result.state.state);
      if (dataKey && !shouldRetain) next[dataKey] = result.data;
      const sourceState = shouldRetain
        ? { ...next.sources[id], ...result.state, state: 'stale', lastSuccessAt: next.sources[id]?.lastSuccessAt, fetchedAt: next.sources[id]?.fetchedAt, upstreamAt: next.sources[id]?.upstreamAt, retainedLastGood: true }
        : {...result.state,accepted:Array.isArray(result.data)?result.data.length:0,rejected:result.state?.rejected??0,currentCoverage:result.state?.currentCoverage??(id==='fires'?'Portugal mainland · public report feed':id==='firms'?(result.state?.currentCoverage??'Portugal mainland · VIIRS point feed'):id==='weather'?'Portugal mainland · station availability varies':id==='riskToday'||id==='riskTomorrow'?'Portugal mainland municipalities':id==='copernicus'?'Pilot-region catalogue footprints':'Provider/pass dependent')};
      next.sources[id] = withTransitionHistory(next.sources[id], stateWithFreshness(sourceState, now), now);
      if(['weather','ipmaWeather'].includes(id)&&!result.state.error)next.weatherHistory=retainObservationHistory(next.weatherHistory,result.data,{sourceId:id,receivedAt:result.state.lastSuccessAt??result.state.fetchedAt,asOf:now.toISOString()});
    }

    // Prefer the direct official IPMA products for the shared consumer fields.
    // The intermediary feed remains independently visible for degradation and
    // provenance checks and is retained as last-good content during refresh.
    if (next.directWeather.length || next.sources.ipmaWeather?.state === 'current') next.weather = clone(next.directWeather);
    if (next.directWarnings.length || next.sources.ipmaWarnings?.state === 'current') next.warnings = clone(next.directWarnings);

    next.sources.thermal = withTransitionHistory(next.sources.thermal, stateWithFreshness(next.sources.thermal ?? emptySource('thermal'), now), now);
    this.#snapshot = next;
    this.#lastRefreshMs = now.getTime();
    await writeJsonAtomic(this.#cacheFile, next);
    if(this.#acquisitionStore){const ingested=[];for(const[id,result]of Object.entries(results)){ingested.push(...(result?.state?.supportRawSourceProductIds??[]));if(!['fires','firms'].includes(id)){if(result?.state?.rawSourceProductId)ingested.push(result.state.rawSourceProductId);ingested.push(...(result?.state?.rawSourceProductIds??[]));}}if(ingested.length)await this.#acquisitionStore.markProductsIngested(ingested);}
    return { changed: previousSignature !== this.#signature(next), snapshot: clone(next) };
  }

  #signature(snapshot) {
    return JSON.stringify({
      fires: snapshot.fires.map((item) => [item.id, item.operatives, item.updatedAt]),
      risk: snapshot.riskToday.map((item) => [item.id, item.level]),
      weather: snapshot.weather.map((item) => [item.id, item.observedAt]),
      thermal: snapshot.thermalDetections.map((item) => [item.id, item.observedAt]),
      sources: Object.fromEntries(Object.entries(snapshot.sources).map(([id, state]) => [id, state.state]))
    });
  }
}
