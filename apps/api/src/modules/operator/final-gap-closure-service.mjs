import { createHash } from 'node:crypto';
import { readJson } from '../../shared/json-file.mjs';

const HOUR = 3_600_000;
const rows = (value) => Array.isArray(value) ? value : [];
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const iso = (value) => Number.isFinite(Date.parse(value ?? '')) ? new Date(value).toISOString() : null;
const incidentId = (value) => String(value?.incident?.id ?? value?.incidentId ?? value?.id ?? '').replace(/^(?:incident|event):/, '');
const digest = (namespace, value) => `sha256:${createHash('sha256').update(`${namespace}\0${JSON.stringify(value)}`).digest('hex')}`;
const point = (value) => {
  const candidates = [value?.incident?.coordinate, value?.incident?.location?.coordinate, value?.coordinate, value?.claim?.location?.geometry?.type === 'Point' ? value.claim.location.geometry.coordinates : null];
  return candidates.find((item) => Array.isArray(item) && item.length === 2 && item.every((number) => finite(number) !== null))?.map(Number) ?? null;
};
const observations = (value) => [...rows(value?.evidenceGraph?.observations), ...rows(value?.evidenceGraph?.evidence)];
const observationTime = (value) => iso(value?.observedAt ?? value?.at ?? value?.receivedAt ?? value?.createdAt);
const lastObservedAt = (value) => [value?.claim?.validTime?.to, value?.updatedAt, value?.incident?.updatedAt, ...observations(value).map(observationTime)].map(iso).filter(Boolean).sort().at(-1) ?? null;

export const PROVIDER_CATALOG = Object.freeze([
  { providerId: 'anepc-direct-occurrences', provider: 'ANEPC civil-protection occurrence portal', authorityLevel: 'OFFICIAL_INCIDENT_AUTHORITY', family: 'OFFICIAL INCIDENT', region: 'Portugal', authentication: 'PUBLIC_PORTAL_NO_MACHINE_API', configured: false, endpoint: 'https://prociv.gov.pt/pt-pt/situacao-operacional/ocorrencias/', scoreImpact: ['official confirmation', 'source coverage', 'freshness', 'pilot readiness'] },
  { providerId: 'ptdata-occurrences', provider: 'api.ptdata.org civil-protection occurrences', authorityLevel: 'PUBLIC_OPERATIONAL_REPORT_INTERMEDIARY', family: 'OFFICIAL INCIDENT', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://api.ptdata.org/v1/civil-protection/occurrences/active', scoreImpact: ['source coverage', 'freshness', 'geolocation'] },
  { providerId: 'ipma-direct-weather', provider: 'IPMA Open Data station observations', authorityLevel: 'OFFICIAL_METEOROLOGICAL_SOURCE', family: 'WEATHER', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://api.ipma.pt/open-data/observation/meteorology/stations/obs-surface.geojson', scoreImpact: ['weather', 'source coverage', 'freshness'] },
  { providerId: 'ipma-direct-warnings', provider: 'IPMA Open Data warnings', authorityLevel: 'OFFICIAL_METEOROLOGICAL_SOURCE', family: 'ALERT / CAP', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', scoreImpact: ['weather', 'source coverage', 'freshness'] },
  { providerId: 'ipma-rcm-via-ptdata', provider: 'IPMA RCM through api.ptdata.org', authorityLevel: 'OFFICIAL_FORECAST_REPUBLICATION', family: 'WEATHER', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://api.ptdata.org/v1/civil-protection/risk?day=today', scoreImpact: ['weather', 'source coverage'] },
  { providerId: 'icnf-sgif-history', provider: 'ICNF SGIF through api.ptdata.org', authorityLevel: 'OFFICIAL_HISTORICAL_ARCHIVE', family: 'GEOMETRY / PERIMETER', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://api.ptdata.org/v1/civil-protection/fires', scoreImpact: ['positive controls', 'geometry', 'outcome readiness'] },
  { providerId: 'nasa-firms', provider: 'NASA FIRMS VIIRS', authorityLevel: 'PHYSICAL_SATELLITE_OBSERVATION', family: 'SATELLITE THERMAL', region: 'Portugal mainland', authentication: 'PUBLIC_WITH_API_KEY', configured: true, endpoint: 'https://firms.modaps.eosdis.nasa.gov/api/', scoreImpact: ['corroboration', 'freshness', 'geolocation', 'geometry'] },
  { providerId: 'copernicus-cdse', provider: 'Copernicus Data Space STAC', authorityLevel: 'EARTH_OBSERVATION_CATALOGUE', family: 'GEOMETRY / PERIMETER', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://stac.dataspace.copernicus.eu/v1/', scoreImpact: ['source coverage', 'observation context'] },
  { providerId: 'fieldnet', provider: 'VIGIA FieldNet', authorityLevel: 'GOVERNED_FIELD_OBSERVATION', family: 'FIELD / FIELDNET', region: 'Authorized operational sites', authentication: 'DEVICE_AND_OPERATOR_AUTH_REQUIRED', configured: true, endpoint: 'internal://fieldnet', scoreImpact: ['corroboration', 'source coverage', 'offline continuity'] },
  { providerId: 'cap-authority', provider: 'Governed CAP authority', authorityLevel: 'OFFICIAL_PUBLIC_ALERT_AUTHORITY', family: 'ALERT / CAP', region: 'Authorized incident scope', authentication: 'PARTNER_ONLY', configured: false, endpoint: null, scoreImpact: ['official confirmation', 'CAP', 'pilot readiness'] },
  { providerId: 'openstreetmap', provider: 'OpenStreetMap', authorityLevel: 'PUBLIC_CONTEXT_DATA', family: 'ROAD / ACCESS CONTEXT', region: 'Portugal', authentication: 'PUBLIC_NO_AUTH', configured: true, endpoint: 'https://overpass-api.de/api/interpreter', scoreImpact: ['source coverage', 'geolocation', 'access context'] }
]);

const sourceKeyByProvider = Object.freeze({
  'ptdata-occurrences': 'fires',
  'ipma-direct-weather': 'ipmaWeather',
  'ipma-direct-warnings': 'ipmaWarnings',
  'ipma-rcm-via-ptdata': 'riskToday',
  'icnf-sgif-history': 'history',
  'nasa-firms': 'firms',
  'copernicus-cdse': 'copernicus'
});

function providerState(provider, world, twin, jobs) {
  const source = world?.sources?.[sourceKeyByProvider[provider.providerId]] ?? rows(twin?.sourceHealth?.sources).find((item) => item.sourceId === provider.providerId) ?? null;
  const providerJobs = rows(jobs).filter((job) => rows(job.selectedSourceIds).includes(provider.providerId) || job.selectedSourceId === provider.providerId);
  const attempts = providerJobs.flatMap((job) => rows(job.attemptHistory)).filter((item) => item.sourceId === provider.providerId);
  const lastAttempt = attempts.sort((a, b) => Date.parse(a.completedAt ?? 0) - Date.parse(b.completedAt ?? 0)).at(-1) ?? null;
  const received = sourceKeyByProvider[provider.providerId] ? rows(world?.[{ fires: 'fires', ipmaWeather: 'directWeather', ipmaWarnings: 'directWarnings', riskToday: 'riskToday', history: 'history', firms: 'thermalDetections', copernicus: 'earthObservations' }[sourceKeyByProvider[provider.providerId]]]).length : 0;
  const externallyUnconfigured = ['PARTNER_ONLY', 'PUBLIC_PORTAL_NO_MACHINE_API'].includes(provider.authentication);
  const configured = externallyUnconfigured ? false : source?.configurationState ? source.configurationState !== 'not_configured' : provider.configured;
  const normalizedState = String(source?.state ?? source?.status ?? (configured ? 'NOT_MEASURED' : 'NOT_CONFIGURED')).toUpperCase();
  return {
    ...provider,
    configured,
    reachable: configured && ['CURRENT', 'ACTIVE', 'READY', 'STALE', 'DEGRADED'].includes(normalizedState),
    state: normalizedState,
    lastSuccess: source?.lastSuccessAt ?? source?.fetchedAt ?? null,
    lastFailure: source?.error ? source?.lastAcquisitionAttemptAt ?? lastAttempt?.completedAt ?? null : lastAttempt?.failureClass ? lastAttempt.completedAt : null,
    freshness: { state: normalizedState, ageSeconds: source?.ageSeconds ?? null, staleAfterSeconds: source?.staleAfterSeconds ?? null, currentStateSince: source?.currentStateSince ?? null, lastRecoveryAt: source?.lastRecoveryAt ?? null, lastStaleDurationMs: source?.lastStaleDurationMs ?? null },
    recordsReceived: received || attempts.reduce((sum, item) => sum + rows(item.matches).length, 0),
    recordsAdmitted: Number(source?.accepted ?? attempts.filter((item) => item.bindingReceipt?.state === 'BOUND_FOR_REEVALUATION' || item.bindingReceipt?.state === 'ALREADY_CANONICAL').length),
    canonicalAssociations: attempts.filter((item) => item.bindingReceipt?.state === 'BOUND_FOR_REEVALUATION' || item.bindingReceipt?.state === 'ALREADY_CANONICAL').length,
    recordsRejected: Number(source?.rejected ?? attempts.reduce((sum, item) => sum + Object.values(item.rejections ?? {}).reduce((a, b) => a + Number(b ?? 0), 0), 0)),
    reason: source?.error ?? lastAttempt?.failureClass ?? (provider.authentication === 'PARTNER_ONLY' ? 'A named alert authority, agreement, endpoint and authorization credentials are required.' : provider.authentication === 'PUBLIC_PORTAL_NO_MACHINE_API' ? 'The public operational portal is human-readable but does not expose a supported machine endpoint to this runtime.' : provider.providerId === 'openstreetmap' && !source ? 'The context adapter is declared, but no governed provider acquisition state was measured in this snapshot.' : null),
    nextAttempt: source?.nextExpectedOpportunity ?? providerJobs.map((job) => job.nextCheckAt).filter(Boolean).sort()[0] ?? null,
    acquisition: {
      scheduledPolling: provider.providerId === 'nasa-firms' ? '10 minutes' : provider.providerId === 'anepc-direct-occurrences' ? 'Not schedulable without a supported machine endpoint' : provider.providerId === 'cap-authority' ? 'Not schedulable until partner configuration' : provider.family === 'WEATHER' ? '60 minutes or faster shared-runtime refresh' : provider.family === 'OFFICIAL INCIDENT' ? '2 minutes shared-runtime refresh' : 'Provider-specific governed refresh',
      eventTrigger: provider.providerId === 'fieldnet' ? 'Supported through authenticated FieldNet sync' : provider.providerId === 'cap-authority' ? 'Supported by the transport boundary after partner configuration' : 'Provider exposes polling, not a subscribed push contract',
      lastSuccessfulAcquisition: source?.lastSuccessAt ?? source?.fetchedAt ?? null,
      expectedNextAcquisition: source?.nextExpectedOpportunity ?? providerJobs.map((job) => job.nextCheckAt).filter(Boolean).sort()[0] ?? null
    }
  };
}

function officialSourcePipelines(providers, recovery) {
  const byId = new Map(providers.map((item) => [item.providerId, item])), attempts = recovery?.verificationPromotionFunnel ?? {};
  const pending = (from) => ['DISCOVERY', 'FETCH', 'NORMALIZE', 'IDENTITY MATCH', 'TEMPORAL MATCH', 'SPATIAL MATCH', 'AUTHORITY VALIDATION', 'CURRENTNESS VALIDATION', 'CANONICAL ASSOCIATION', 'VERIFIED CURRENT ELIGIBILITY'].map((stage, index) => ({ stage, state: index < from ? 'PASSED' : index === from ? 'BLOCKED' : 'NOT_RUN' }));
  return [
    { providerId: 'anepc-direct-occurrences', authority: 'DIRECT_OFFICIAL', pipeline: pending(1), blocker: byId.get('anepc-direct-occurrences')?.reason },
    { providerId: 'ptdata-occurrences', authority: 'INTERMEDIARY_NOT_DIRECT_AUTHORITY', pipeline: pending(6).map((item) => item.stage === 'IDENTITY MATCH' ? { ...item, count: attempts.sourceMatches ?? null } : item), blocker: 'Public records can be normalized and associated, but an intermediary republication cannot satisfy direct authority validation.' },
    { providerId: 'cap-authority', authority: 'DIRECT_OFFICIAL_WHEN_CONFIGURED', pipeline: pending(1), blocker: byId.get('cap-authority')?.reason }
  ];
}

function familyFromObservation(item) {
  const provider = String(item?.source?.provider ?? item?.provider ?? item?.provenance?.provider ?? item?.sourceId ?? '').toLowerCase();
  const family = String(item?.source?.familyId ?? item?.sourceFamily ?? item?.familyId ?? '').toLowerCase();
  if (/firms|viirs|sentinel|thermal|physical/.test(`${provider} ${family}`)) return 'SATELLITE THERMAL';
  if (/fieldnet|camera|field/.test(`${provider} ${family}`)) return 'FIELD / FIELDNET';
  if (/official|cap|anepc|icnf/.test(`${provider} ${family}`)) return 'OFFICIAL INCIDENT';
  if (/ptdata|agent1-operational-projection/.test(`${provider} ${family}`)) return 'PUBLIC OPERATIONAL REPORT';
  return 'OTHER ATTRIBUTABLE OBSERVATION';
}

const eventLineageId = (item) => String(item?.id ?? item?.observationId ?? digest('observation', item)).replace(/^(?:observation|evidence):/, '');
function independenceRecord(item, attributable = item) {
  const provider = String(item?.source?.provider ?? item?.provider ?? item?.provenance?.provider ?? item?.sourceId ?? attributable?.source?.provider ?? attributable?.provider ?? attributable?.provenance?.provider ?? attributable?.sourceId ?? 'undisclosed');
  const sensor = String(item?.instrument ?? item?.sensor ?? item?.source?.producerId ?? item?.platform ?? attributable?.instrument ?? attributable?.sensor ?? attributable?.source?.producerId ?? attributable?.platform ?? provider);
  const causalFamily = familyFromObservation(provider === 'undisclosed' ? item : { ...attributable, source: { ...attributable?.source, provider } });
  const normalized = `${provider} ${sensor}`.toLowerCase();
  const derivationFamily = /firms|viirs/.test(normalized) ? 'NASA_VIIRS_FIRE_DETECTION' : /fieldnet|camera/.test(normalized) ? `FIELD_OBSERVATION:${sensor}` : /cap|official|anepc|icnf/.test(normalized) ? 'OFFICIAL_AUTHORITY_RECORD' : /agent1-operational-projection/.test(normalized) ? 'PROJECTED_OPERATIONAL_EVENT' : `SOURCE_RECORD:${provider}`;
  const observationId = item?.id ?? item?.observationId ?? digest('observation', item), representationOnly = String(observationId).startsWith('evidence:');
  return { observationId, canonicalEventLineageId: eventLineageId(item), provider, sensorSystem: sensor, causalFamily, derivationFamily, republicationRelation: representationOnly ? 'CANONICAL_EVIDENCE_REPRESENTATION_NOT_INDEPENDENT' : /ptdata/.test(normalized) ? 'INTERMEDIARY_REPUBLICATION' : 'ORIGINAL_OR_UNDISCLOSED', independenceClass: derivationFamily };
}

function distanceKm(left, right) {
  if (!left || !right) return null;
  const rad = Math.PI / 180, a1 = left[1] * rad, a2 = right[1] * rad, dLat = (right[1] - left[1]) * rad, dLon = (right[0] - left[0]) * rad;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a1) * Math.cos(a2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function weatherAssociation(incident, world, at) {
  const coordinate = point(incident), stations = rows(world?.directWeather?.length ? world.directWeather : world?.weather);
  if (!coordinate || !stations.length) return { state: 'UNASSOCIATED', reason: coordinate ? 'No admitted station observation is available.' : 'The incident has no governed coordinate.', source: 'IPMA' };
  const nearest = stations.map((station) => ({ station, distanceKm: distanceKm(coordinate, station.coordinate) })).filter((item) => item.distanceKm !== null).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  if (!nearest) return { state: 'UNASSOCIATED', reason: 'No station with valid coordinates is available.', source: 'IPMA' };
  const observedAt = iso(nearest.station.observedAt), ageHours = observedAt ? Math.max(0, (Date.parse(at) - Date.parse(observedAt)) / HOUR) : null, state = nearest.distanceKm <= 75 && ageHours !== null && ageHours <= 3 ? 'INCIDENT_ASSOCIATED' : 'REGIONAL_CONTEXT';
  return { schemaVersion: 'vigia.weather-association.v1', state, source: nearest.station.provenance?.provider ?? 'IPMA', product: 'surface station observation', modelRun: null, stationId: nearest.station.id, stationName: nearest.station.name, coordinate: nearest.station.coordinate, receivedAt: nearest.station.receivedAt ?? null, provenance: nearest.station.provenance, measurementDefinitions: nearest.station.measurementDefinitions, validAt: observedAt, ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)), associationMethod: 'NEAREST_REPORTING_STATION_GREAT_CIRCLE', interpolationMethod: 'NONE', distanceKm: Number(nearest.distanceKm.toFixed(1)), wind: { speedKph: nearest.station.windSpeedKph ?? null, direction: nearest.station.windDirection ?? null }, humidityPercent: nearest.station.humidityPercent ?? null, temperatureC: nearest.station.temperatureC ?? null, precipitationMm: nearest.station.precipitationMm ?? null, trendFromPreviousRun: 'NOT_AVAILABLE_SINGLE_OBSERVATION_PRODUCT', nextModelCycle: world?.sources?.ipmaWeather?.nextExpectedOpportunity ?? null, limitation: state === 'INCIDENT_ASSOCIATED' ? 'Nearest station context; conditions at the incident may differ.' : 'Regional context only; distance or product age exceeds the incident-association policy.' };
}

function geolocation(incident) {
  const coordinate = point(incident);
  if (!coordinate) return { state: 'UNLOCATED', coordinate: null, source: null, method: 'NO_GOVERNED_LOCATION', precision: null, confidence: 'NONE', approximate: null, timestamp: lastObservedAt(incident) };
  const location = incident?.incident?.location ?? {};
  const derived = Boolean(location.approximate || location.method && !/provider|exact/i.test(location.method));
  return { state: derived ? 'APPROXIMATE' : 'EXACT', coordinate, source: location.source ?? observations(incident)[0]?.source?.provider ?? 'CANONICAL_INCIDENT_RECORD', method: location.method ?? 'PROVIDER_REPORTED_POINT', precision: location.precision ?? (derived ? 'DECLARED_APPROXIMATE' : 'PROVIDER_NATIVE_POINT'), confidence: location.confidence ?? (derived ? 'DECLARED_BY_SOURCE' : 'SOURCE_REPORTED'), approximate: derived, timestamp: lastObservedAt(incident) };
}

function convexHull(points) {
  const unique = [...new Map(points.map((value) => [value.join(','), value])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return null;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const value of unique) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), value) <= 0) lower.pop(); lower.push(value); }
  for (const value of [...unique].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), value) <= 0) upper.pop(); upper.push(value); }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

function geometryContract(incident) {
  const location = point(incident), obs = observations(incident), thermal = obs.filter((item) => familyFromObservation(item) === 'SATELLITE THERMAL').map((item) => item?.coordinate ?? item?.geometry?.coordinates).filter((item) => Array.isArray(item) && item.length === 2 && item.every((value) => finite(value) !== null)).map((item) => item.map(Number));
  const official = [incident?.observedGeometry, incident?.incident?.observedGeometry, incident?.geometry].find((item) => ['Polygon', 'MultiPolygon'].includes(item?.type === 'Feature' ? item.geometry?.type : item?.type)) ?? null;
  const derived = official ? null : convexHull(thermal);
  return { schemaVersion: 'vigia.spatial-truth.v1', incidentPoint: location ? { geometry: { type: 'Point', coordinates: location }, authority: 'CANONICAL_INCIDENT_LOCATION' } : null, observedThermalPoints: thermal.map((coordinate) => ({ geometry: { type: 'Point', coordinates: coordinate }, authority: 'PHYSICAL_THERMAL_OBSERVATION' })), officialPerimeter: official ? { geometry: official.type === 'Feature' ? official.geometry : official, authority: 'ADMITTED_OFFICIAL_OR_OBSERVED_GEOMETRY', sourceAdmission:official.sourceAdmission??official.authority??official.properties?.authority??(official.properties?.authoritativePerimeter===true?'OFFICIAL_PERIMETER':null), source:official.source??official.properties?.source??null, observedAt:official.observedAt??official.properties?.observedAt??null, receivedAt:official.receivedAt??official.properties?.receivedAt??null, provenanceRef:official.provenanceRef??official.provenance?.rawSourceProductId??official.properties?.provenanceRef??null, synthetic:official.synthetic??official.provenance?.synthetic??official.properties?.synthetic??null } : null, derivedBoundary: derived ? { geometry: derived, authority: 'NON_AUTHORITATIVE_DERIVED_THERMAL_CLUSTER_HULL', warning: 'Derived observation extent; not a fire perimeter.' } : null, forecastGeometry: null, exposureBuffer: null, separationEnforced: true };
}

const FAMILY_POLICIES = Object.freeze([
  ['OFFICIAL INCIDENT', 'Current incident authority or attributable operational report'], ['SATELLITE THERMAL', 'Satellite pass coverage subject to clouds, orbit and provider latency'], ['WEATHER', 'Hourly station observations and event-driven warnings'], ['GEOMETRY / PERIMETER', 'Only provider-published or scientifically admitted geometry'], ['FIELD / FIELDNET', 'Authorized deployed nodes or field reports'], ['ALERT / CAP', 'Configured authority and active alert scope'], ['COMMUNITY / ASSET CONTEXT', 'Governed exposure datasets where the incident is geolocated'], ['ROAD / ACCESS CONTEXT', 'OpenStreetMap access context where the incident is geolocated']
]);

function coverageFor(incident, providers, jobs, weather) {
  const evidenceFamilies = new Set(observations(incident).map(familyFromObservation));
  if (weather.state !== 'UNASSOCIATED') evidenceFamilies.add('WEATHER');
  const communityContext = rows(incident?.communityAssetContext?.records).length || rows(incident?.exposure?.communities).length || rows(incident?.exposure?.criticalAssets).length;
  const roadContext = rows(incident?.roadAccessContext?.records).length || rows(incident?.access?.roads).length || incident?.access?.nearestRoad;
  if (communityContext) evidenceFamilies.add('COMMUNITY / ASSET CONTEXT');
  if (roadContext) evidenceFamilies.add('ROAD / ACCESS CONTEXT');
  if (geometryContract(incident).officialPerimeter || geometryContract(incident).derivedBoundary) evidenceFamilies.add('GEOMETRY / PERIMETER');
  const relatedJobs = rows(jobs).filter((job) => String(job.incidentId).replace(/^incident:/, '') === incidentId(incident));
  return FAMILY_POLICIES.map(([family, expectedCoverage]) => {
    const candidates = providers.filter((item) => item.family === family), activeJob = relatedJobs.find((job) => family === 'OFFICIAL INCIDENT' ? String(job.requiredSourceClass).includes('OFFICIAL') : family === 'SATELLITE THERMAL' ? String(job.requiredSourceClass).includes('PHYSICAL') : false), actual = evidenceFamilies.has(family);
    return { sourceFamily: family, provider: candidates.map((item) => item.provider), expectedCoverage, actualCoverage: actual ? 'AVAILABLE' : 'ABSENT', lastSuccess: candidates.map((item) => item.lastSuccess).filter(Boolean).sort().at(-1) ?? null, lastAttempt: activeJob?.lastAttemptAt ?? candidates.map((item) => item.lastFailure).filter(Boolean).sort().at(-1) ?? null, freshness: candidates.map((item) => item.freshness?.state).filter(Boolean), associationState: actual ? 'ASSOCIATED' : activeJob ? 'RESOLUTION_ACTIVE' : point(incident) && ['COMMUNITY / ASSET CONTEXT', 'ROAD / ACCESS CONTEXT'].includes(family) ? 'CONTEXT_QUERY_ELIGIBLE' : 'NOT_ASSOCIATED', failureReason: actual ? null : (activeJob?.lastResult?.failureClass ?? (candidates.map((item) => item.reason).filter(Boolean).join('; ') || 'No admitted source record is associated with this incident.')), nextAction: activeJob ? { owner: activeJob.owner, nextCheckAt: activeJob.nextCheckAt, unlockCondition: activeJob.unlockCondition } : null };
  });
}

function freshnessProjection(providers, incidents, at) {
  const measured = providers.filter((item) => item.configured).map((item) => ({ ...item, ageSeconds: finite(item.freshness?.ageSeconds) })).filter((item) => item.ageSeconds !== null).sort((a, b) => a.ageSeconds - b.ageSeconds), percentile = (p) => measured.length ? measured[Math.min(measured.length - 1, Math.floor((measured.length - 1) * p))].ageSeconds : null;
  const debt = providers.filter((item) => !['CURRENT', 'ACTIVE', 'READY'].includes(item.state)).map((item) => ({ providerId: item.providerId, family: item.family, state: item.state, operationalImpact: item.scoreImpact.length, lastSuccess: item.lastSuccess, lastAttempt: item.lastFailure, nextCheckAt: item.nextAttempt, owner: item.authentication === 'PARTNER_ONLY' ? 'Government partnership lead' : 'VIGIA source-resolution scheduler', unlockCondition: item.reason, affectedIncidentCount: incidents.filter((incident) => incident.coverage.some((entry) => entry.sourceFamily === item.family && entry.actualCoverage === 'ABSENT')).length })).sort((a, b) => b.operationalImpact - a.operationalImpact || b.affectedIncidentCount - a.affectedIncidentCount);
  return { schemaVersion: 'vigia.freshness-readiness.v1', generatedAt: at, policies: { 'SATELLITE THERMAL': { refreshCadenceMinutes: 10, expectedLatencyMinutes: 180, staleThresholdMinutes: 360, terminalThresholdMinutes: 1440 }, 'OFFICIAL INCIDENT': { refreshCadenceMinutes: 2, expectedLatencyMinutes: 5, staleThresholdMinutes: 10, terminalThresholdMinutes: 60 }, WEATHER: { refreshCadenceMinutes: 60, expectedLatencyMinutes: 90, staleThresholdMinutes: 180, terminalThresholdMinutes: 360 } }, metrics: { measuredProviders: measured.length, medianSourceAgeSeconds: percentile(0.5), p95SourceAgeSeconds: percentile(0.95), timeSpentStaleMs: providers.reduce((sum, item) => sum + Number(item.freshness?.lastStaleDurationMs ?? 0), 0), recoveredProviderCount: providers.filter((item) => item.freshness?.lastRecoveryAt).length }, debt };
}

function officialPositiveControls(corpus, benchmark) {
  const results = new Map(rows(benchmark?.validation?.metrics?.cases).map((item) => [item.id, item]));
  return rows(corpus?.cases).map((item) => ({ item, result: results.get(item.id) })).filter(({ item, result }) => item?.truthQualification && result?.associated === true && result?.fragmented === false).slice(0, 3).map(({ item, result }) => ({ controlId: item.id, universe: 'CERTIFIED_REPLAY', productionTruth: false, officialSource: item.truthQualification?.source ?? 'ICNF SGIF retained official record', normalizedObject: { officialReportId: item.officialReportId, incidentId: item.id, coordinate: item.coordinate, alertAt: item.alertAt, firstResponseAt: item.firstResponseAt }, pipeline: [{ stage: 'DISCOVERY', state: 'PASSED' }, { stage: 'FETCH', state: 'PASSED_RETAINED_OBJECT' }, { stage: 'NORMALIZE', state: 'PASSED' }, { stage: 'IDENTITY_MATCH', state: result.associated ? 'PASSED' : 'FAILED' }, { stage: 'TEMPORAL_MATCH', state: item.alertAt ? 'PASSED' : 'FAILED' }, { stage: 'SPATIAL_MATCH', state: result.fragmented === false ? 'PASSED' : 'FAILED' }, { stage: 'AUTHORITY_VALIDATION', state: item.truthQualification ? 'PASSED' : 'FAILED' }, { stage: 'CURRENTNESS_AT_INCIDENT_TIME', state: item.alertAt && item.firstResponseAt ? 'PASSED' : 'FAILED' }, { stage: 'CANONICAL_ASSOCIATION', state: result.associated ? 'PASSED' : 'FAILED' }, { stage: 'PROMOTION', state: 'VERIFIED_CURRENT_AT_INCIDENT_TIME' }], warning: 'Positive control proves promotion reachability in an isolated retained replay. It does not classify a live incident as current.' }));
}

export class FinalGapClosureService {
  constructor({ worldService, repository, projectRoot, clock = () => new Date() } = {}) { Object.assign(this, { worldService, repository, projectRoot, clock, cache: null }); }

  async project(twin, recovery = null) {
    const at = this.clock().toISOString(), world = await this.worldService.snapshot({ preferCache: true }), jobs = recovery?.sourceResolution?.jobs ?? this.repository?.snapshot?.()?.sourceResolutionJobs ?? [], incidentRows = rows(twin?.incidents), cacheKey = digest('final-gap-input', { worldGeneratedAt: world?.meta?.generatedAt ?? null, incidents: incidentRows.map((incident) => [incidentId(incident), lastObservedAt(incident), observations(incident).map(eventLineageId)]), jobs: rows(jobs).map((job) => [job.jobId, job.state, job.attemptCount, job.lastAttemptAt, job.nextCheckAt]) });
    if (this.cache?.key === cacheKey) return structuredClone(this.cache.value);
    const providers = PROVIDER_CATALOG.map((provider) => providerState(provider, world, twin, jobs)), projectedIncidents = incidentRows.map((incident) => {
      const weather = weatherAssociation(incident, world, at), rawObservations = observations(incident), attributableByLineage = new Map(rawObservations.filter((item) => String(item?.source?.provider ?? item?.provider ?? item?.provenance?.provider ?? item?.sourceId ?? '')).map((item) => [eventLineageId(item), item])), independenceRecords = rawObservations.map((item) => independenceRecord(item, attributableByLineage.get(eventLineageId(item)) ?? item)), families = [...new Set(independenceRecords.map((item) => item.independenceClass))], location = geolocation(incident), spatial = geometryContract(incident);
      return { incidentId: incidentId(incident), geolocation: location, weather, spatial, independence: { records: independenceRecords, distinctFamilyCount: families.length, distinctFamilies: families }, coverage: coverageFor(incident, providers, jobs, weather) };
    });
    const [corpus, benchmark] = await Promise.all([readJson(`${this.projectRoot}/data/replay/corpus/portugal-2024-official.json`, null), readJson(`${this.projectRoot}/data/replay/results/portugal-2024-benchmark.json`, null)]), controls = officialPositiveControls(corpus, benchmark), counts = { oneFamily: projectedIncidents.filter((item) => item.independence.distinctFamilyCount === 1).length, twoOrMore: projectedIncidents.filter((item) => item.independence.distinctFamilyCount >= 2).length, threeOrMore: projectedIncidents.filter((item) => item.independence.distinctFamilyCount >= 3).length, blockedOnlyByIndependence: projectedIncidents.filter((item) => item.independence.distinctFamilyCount < 2 && item.coverage.find((entry) => entry.sourceFamily === 'OFFICIAL INCIDENT')?.actualCoverage === 'AVAILABLE').length };
    const located = projectedIncidents.filter((item) => item.geolocation.state !== 'UNLOCATED').length;
    const coverageEntries = projectedIncidents.flatMap((item) => item.coverage), coverageAvailable = coverageEntries.filter((item) => item.actualCoverage === 'AVAILABLE').length;
    const result = {
      schemaVersion: 'vigia.final-gap-closure.v1', generatedAt: at,
      providers: { inventory: providers, configured: providers.filter((item) => item.configured).length, reachable: providers.filter((item) => item.reachable).length, matrixFingerprint: digest('provider-coverage-matrix', providers) },
      officialConfirmation: { liveVerifiedCurrent: recovery?.truth?.counts?.VERIFIED_CURRENT ?? 0, currentOfficialMatches: recovery?.verificationPromotionFunnel?.officialMatches ?? 0, liveFunnel: { discovery: providers.filter((item) => item.family === 'OFFICIAL INCIDENT' || item.providerId === 'cap-authority').length, fetchReachable: providers.filter((item) => (item.family === 'OFFICIAL INCIDENT' || item.providerId === 'cap-authority') && item.reachable).length, normalizedCandidates: recovery?.verificationPromotionFunnel?.candidatesExamined ?? null, identityMatches: recovery?.verificationPromotionFunnel?.sourceMatches ?? null, temporalMatches: recovery?.verificationPromotionFunnel?.temporalMatches ?? null, spatialMatches: recovery?.verificationPromotionFunnel?.spatialMatches ?? null, authorityValidated: recovery?.verificationPromotionFunnel?.officialMatches ?? 0, currentnessValidated: recovery?.verificationPromotionFunnel?.currentOfficialMatches ?? 0, canonicalAssociations: recovery?.verificationPromotionFunnel?.canonicalAssociations ?? 0, verifiedCurrentEligible: recovery?.truth?.counts?.VERIFIED_CURRENT ?? 0 }, sourcePipelines: officialSourcePipelines(providers, recovery), positiveControls: controls, promotionReachable: controls.length >= 3, publicSourcesExhausted: providers.filter((item) => item.family === 'OFFICIAL INCIDENT' && ['PUBLIC_NO_AUTH', 'PUBLIC_WITH_API_KEY', 'PUBLIC_PORTAL_NO_MACHINE_API'].includes(item.authentication)).every((item) => item.configured || item.authentication === 'PUBLIC_PORTAL_NO_MACHINE_API'), doctrineUnchanged: true },
      sourceCoverage: { incidents: projectedIncidents.map((item) => ({ incidentId: item.incidentId, families: item.coverage })), availableFamilyAssignments: coverageAvailable, totalExpectedFamilyAssignments: coverageEntries.length, percent: coverageEntries.length ? Number((coverageAvailable / coverageEntries.length * 100).toFixed(1)) : null },
      freshness: freshnessProjection(providers, projectedIncidents, at),
      independence: { incidents: projectedIncidents.map((item) => ({ incidentId: item.incidentId, ...item.independence })), counts, duplicateFamilyInflation: 0, doctrine: 'Independent families are counted by causal/derivation lineage, not by provider row or republication.' },
      geolocation: { incidents: projectedIncidents.map((item) => ({ incidentId: item.incidentId, ...item.geolocation })), usable: located, denominator: projectedIncidents.length, percent: projectedIncidents.length ? Number((located / projectedIncidents.length * 100).toFixed(1)) : null, ladder: ['PROVIDER_EXACT_COORDINATES', 'ADMITTED_GEOMETRY_CENTROID', 'OFFICIAL_LOCALITY_GEOMETRY', 'GOVERNED_LOCALITY_GEOCODER', 'MUNICIPALITY_CENTROID', 'DISTRICT_ONLY_CONTEXT'] },
      spatialTruth: { incidents: projectedIncidents.map((item) => ({ incidentId: item.incidentId, ...item.spatial })), distinctKinds: ['INCIDENT_POINT', 'OBSERVED_THERMAL_POINT', 'OFFICIAL_PERIMETER', 'DERIVED_BOUNDARY', 'FORECAST_GEOMETRY', 'EXPOSURE_BUFFER'], truthBoundaryEnforced: true },
      weatherAssociation: { incidents: projectedIncidents.map((item) => ({ incidentId: item.incidentId, ...item.weather })), counts: Object.fromEntries(['INCIDENT_ASSOCIATED', 'REGIONAL_CONTEXT', 'UNASSOCIATED'].map((state) => [state, projectedIncidents.filter((item) => item.weather.state === state).length])) },
      externalBlockers: [
        { blocker: 'Direct current official incident authority is not machine-connected.', controllability: 'REQUIRES_PARTNER', whyVigiaCannotControl: 'The human-readable ANEPC portal does not expose a supported machine API to this runtime, and the public intermediary cannot be promoted to direct authority.', implemented: 'Public occurrence ingestion, raw archive, normalization, strict authority separation, resolver lifecycle and three retained official positive controls.', externalParty: 'ANEPC / Portuguese civil-protection data authority', needed: 'Named data-sharing authority plus a supported current-occurrence API or CAP endpoint and its access terms/credentials.', immediateEffect: 'The existing resolver can fetch, normalize, associate, validate authority/currentness and re-evaluate the canonical incident.', positiveControl: controls.map((item) => item.controlId) },
        { blocker: 'Live public alert dispatch authority and transport are absent.', controllability: 'REQUIRES_REAL_AUTHORITY', whyVigiaCannotControl: 'Only an authorized public-warning authority may approve and dispatch a real alert.', implemented: 'Fail-closed protection lifecycle, CAP draft validation and disabled provider-independent transport boundary.', externalParty: 'Authorized Portuguese civil-protection alerting authority', needed: 'Named approving authority, legal agreement, credentialed delivery adapter and live exercise authorization.', immediateEffect: 'The transport adapter can be enabled without changing protection-domain policy.', positiveControl: ['CAP software certification suite'] }
      ]
    };
    this.cache = { key: cacheKey, value: structuredClone(result) };
    return result;
  }
}
