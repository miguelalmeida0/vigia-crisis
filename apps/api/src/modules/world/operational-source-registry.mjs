import { SOURCE_DEFINITIONS } from './source-catalog.mjs';

const categories = {
  fires: ['incident'], riskToday: ['fire_danger'], riskTomorrow: ['fire_danger'],
  weather: ['weather','wind','temperature','humidity','precipitation'],
  ipmaWeather: ['weather','wind','temperature','humidity','precipitation'],
  warnings: ['weather_warning'], ipmaWarnings: ['weather_warning'], history: ['incident_history'],
  firms: ['fire_detections','satellite_thermal'], thermal: ['satellite_thermal'], copernicus: ['satellite_catalogue']
};
export const OPERATIONAL_SOURCE_CATEGORIES = Object.freeze([
  ...new Set(Object.values(categories).flat()), 'fire_perimeter','air_quality','road_geography',
  'road_conditions','evacuation','settlements','shelters','hospital_location','hospital_capacity',
  'water_points','response_assets','terrain','administrative_boundaries','telecommunications'
]);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function observationTime(world,id){
  const rows=value=>Array.isArray(value)?value:[];
  const records=id==='fires'?rows(world?.fires):id==='ipmaWeather'?rows(world?.directWeather):id==='weather'?[...rows(world?.weatherHistory).filter(r=>r.sourceId==='weather'),...rows(world?.weather).filter(r=>r.provenance?.provider==='ptdata')]:id==='firms'?rows(world?.thermalDetections):id==='copernicus'?rows(world?.earthObservations).flatMap(r=>rows(r.scenes)):[];
  return records.filter(r=>r.provenance?.synthetic!==true).map(r=>instant(id==='fires'?r.updatedAt:id==='copernicus'?r.acquiredAt:r.observedAt)).filter(Boolean).sort().at(-1)??null;
}

/** Acquisition health and measurement age are different axes. A fresh download cannot refresh an old observation. */
export function sourceFreshness(source = {}, asOf) {
  const now = Date.parse(asOf), observedAt = instant(source.latestSourceObservation ?? source.upstreamAt ?? source.lastObservationAt);
  const receivedAt = instant(source.lastSuccessAt ?? source.fetchedAt ?? source.lastIngestedAt);
  const observationAgeSeconds = observedAt && Number.isFinite(now) ? Math.round((now-Date.parse(observedAt))/1000) : null;
  const ingestionAgeSeconds = receivedAt && Number.isFinite(now) ? Math.round((now-Date.parse(receivedAt))/1000) : null;
  const threshold = Number.isFinite(source.staleAfterSeconds) ? source.staleAfterSeconds : null;
  const age = observationAgeSeconds ?? ingestionAgeSeconds;
  const failed = Boolean(source.error) || /unavailable|failed|not_configured|not_initialized/i.test(source.state ?? '');
  const configured = source.configured !== false && source.configurationState !== 'not_configured' && source.state !== 'not_configured';
  const conflict = (observationAgeSeconds !== null && observationAgeSeconds < 0)||(ingestionAgeSeconds !== null && ingestionAgeSeconds < 0);
  const freshness = conflict ? 'TIME_CONFLICT' : age === null ? 'UNKNOWN' : threshold === null ? 'AGE_ONLY'
    : age > threshold ? 'STALE' : age >= threshold * .8 ? 'APPROACHING_STALE' : 'CURRENT';
  return { status: !configured || failed ? 'unavailable' : conflict || age === null ? 'degraded' : freshness === 'STALE' ? 'stale' : 'healthy',
    configuration: configured ? 'configured' : 'not_configured', observedAt, receivedAt,
    observationAgeSeconds, ingestionAgeSeconds, freshness, staleAfterSeconds: threshold,
    ageBasis: observedAt ? 'OBSERVATION' : receivedAt ? 'ACQUISITION_ONLY' : 'UNKNOWN',
    retainedLastGood: Boolean(source.retainedLastGood || (failed && receivedAt)),
    limitation: failed ? 'Source unavailable; any retained records keep their original observation time.' : observedAt ? null : 'Acquisition time does not establish when each feature was observed.' };
}

export function operationalSourceRegistry(world, asOf, additional = []) {
  const sources = Object.entries(SOURCE_DEFINITIONS).map(([id, definition]) => {
    const source = { ...definition, ...world?.sources?.[id] }, observedAt=observationTime(world,id);
    const health = sourceFreshness({...source,latestSourceObservation:observedAt,upstreamAt:null,lastObservationAt:null}, asOf);
    return { id, name: source.label, provider: source.origin, categories: categories[id], authority: source.authority,
      ...health, expectedUpdateIntervalSeconds: /hourly/.test(source.cadence) ? 3600 : id === 'fires' ? 120 : null,
      cadence: source.cadence, lastObservationAt: health.observedAt, lastIngestedAt: health.receivedAt,
      sourcePublicationAt:instant(source.upstreamAt),
      lastAttemptAt: instant(source.lastAcquisitionAttemptAt ?? source.lastPollAt),
      provenanceRef: source.rawSourceProductId ?? null, accepted: source.accepted ?? null, rejected: source.rejected ?? null,
      coverage: source.currentCoverage ?? 'Provider coverage not established',
      dataClass: health.status === 'unavailable' && !health.receivedAt ? 'UNAVAILABLE' : (id==='history'&&health.receivedAt)||health.retainedLastGood || health.freshness === 'STALE' ? 'CACHED' : health.status === 'healthy' ? 'LIVE' : 'UNAVAILABLE',
      emptyMeaning: source.emptyProductMeaning ?? null };
  }).concat(additional);
  const represented = new Set(sources.flatMap(s => s.categories ?? []));
  const gaps = OPERATIONAL_SOURCE_CATEGORIES.filter(category => !represented.has(category)).map(category => ({
    id: `unconfigured:${category}`, name: category.replaceAll('_',' '), categories:[category], provider:null,
    status:'unavailable', configuration:'not_configured', dataClass:'UNAVAILABLE', freshness:'UNKNOWN',
    lastObservationAt:null, lastIngestedAt:null, limitation:'No attributable source is connected for this capability.'
  }));
  return { schemaVersion:'vigia.operational-source-registry.v1', asOf, sources:[...sources,...gaps] };
}
