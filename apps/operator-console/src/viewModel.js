import { finiteNumberOrNull, formatMeasuredNumber } from './truth.js?v=2.1.0';
export const PORTUGAL_BBOX = [-9.75, 36.7, -6.0, 42.3];
export function validCoordinate(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function inRing(point, ring = []) {
  if (!validCoordinate(point) || !Array.isArray(ring) || ring.length < 3) return false;
  const [x, y] = point; let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const [xi, yi] = a, [xj, yj] = b;
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
function inPolygon(point, coordinates = []) {
  if (!inRing(point, coordinates[0])) return false;
  return !(coordinates.slice(1).some(ring => inRing(point, ring)));
}
export function monitoredPortugalGeometry(state) {
  const territories = state?.runtime?.operationsTerritories?.territories ?? [];
  const territory = territories.find(item => String(item.id ?? '').includes('portugal')) ?? territories[0];
  return territory?.geometry ?? null;
}

export function inPortugal(value, geometry = null) {
  if (!validCoordinate(value)) return false;
  if (geometry?.type === 'Polygon') return inPolygon(value, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(polygon => inPolygon(value, polygon));
  const [lon, lat] = value;
  const [west, south, east, north] = PORTUGAL_BBOX;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export function portugalEvents(state) {
  const rows = state.runtime?.events?.events ?? [];
  const geometry = monitoredPortugalGeometry(state);
  const territoryIds = new Set((state.runtime?.territory?.signals ?? []).filter(signal => signal.resourceKind === 'event').map(signal => String(signal.resourceId)));
  return rows.filter(item => inPortugal(item.coordinate, geometry) && (!territoryIds.size || territoryIds.has(String(item.id))));
}

export function activeOperationalEvents(state) {
  return portugalEvents(state).filter(event =>
    event?.physicalState?.freshness === 'current' ||
    event?.reportState?.sourceActivity === 'current' ||
    event?.actionNeed?.needsRouting === true
  );
}

export function selectedEventSummary(state) {
  const rows = portugalEvents(state);
  if (!rows.length) return null;
  return rows.find(item => String(item.id) === String(state.selectedEventId)) ?? rows[0];
}

export function selectedEventDetail(state) {
  const summary = selectedEventSummary(state);
  if (!summary) return null;
  return state.runtime?.eventDetails?.[summary.id]?.event ?? summary;
}

export function selectedOperationsIncident(state) {
  const event = selectedEventSummary(state);
  if (!event) return null;
  return state.runtime?.operationsIncidents?.[event.id] ?? null;
}

export function preventionFindings(state) {
  const rows = state.runtime?.bootstrap?.prevention?.findings ?? state.runtime?.command?.prevention?.findings ?? [];
  const geometry = monitoredPortugalGeometry(state);
  const territoryIds = new Set((state.runtime?.territory?.signals ?? []).filter(signal => signal.resourceKind === 'finding').map(signal => String(signal.resourceId)));
  return rows.filter(item => inPortugal(item.coordinate, geometry) && (!territoryIds.size || territoryIds.has(String(item.findingId ?? item.id))));
}

export function selectedFinding(state) {
  const rows = preventionFindings(state);
  if (!rows.length) return null;
  return rows.find(item => String(item.findingId ?? item.id) === String(state.selectedFindingId)) ?? rows[0];
}

export function selectedReplayCase(state) {
  const rows = (state.runtime?.replay?.cases ?? []).filter(item => state.runtime?.replay?.corpus?.synthetic !== true);
  if (!rows.length) return null;
  return rows.find(item => String(item.id) === String(state.selectedReplayCaseId)) ?? rows.find(item => item.hero) ?? rows[0];
}

export function eventFreshness(event) {
  return event?.physicalState?.freshness ?? event?.reportState?.sourceActivity ?? 'unknown';
}

export function eventTone(event) {
  const fresh = eventFreshness(event);
  if (fresh === 'current') return event?.physicalFirst ? 'critical' : 'teal';
  if (fresh === 'delayed') return 'warning';
  if (event?.actionNeed?.needsRouting) return 'warning';
  return 'teal';
}

export function eventStatus(event) {
  const physical = event?.physicalState?.freshness;
  const report = event?.reportState?.sourceActivity;
  if (physical === 'current' && event?.physicalFirst) return 'Physical-first';
  if (physical === 'current') return 'Current physical';
  if (physical === 'delayed') return 'Delayed physical';
  if (report === 'current') return 'Report only';
  if (event?.actionNeed?.needsRouting) return 'Needs review';
  return 'Historical';
}

export function ageLabel(value, now = Date.now()) {
  const ms = Date.parse(value ?? '');
  if (!Number.isFinite(ms)) return 'time unavailable';
  const minutes = Math.max(0, Math.round((now - ms) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function sourceLabel(key) {
  const labels = {
    firms: 'VIIRS / NASA FIRMS', sentinel3Pixels: 'Sentinel-3 / SLSTR', mtgPixels: 'MTG / FCI',
    observationSchedule: 'Observation scheduling', riskToday: 'IPMA / ICNF fire risk', weather: 'IPMA weather',
    warnings: 'Civil-protection warnings', preventionImagery: 'Copernicus Sentinel-2', fires:'Public fire reports', thermal:'Thermal overlay'
  };
  return labels[key] ?? String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

export function sourceTone(state) {
  const s = String(state ?? '').toLowerCase();
  if (['current','ready','healthy','operational','configured'].includes(s)) return 'green';
  if (['stale','delayed','partial','degraded','empty','loading','initializing'].includes(s)) return 'warning';
  if (['unavailable','failed','not_configured','error','insufficient'].includes(s)) return 'critical';
  return 'teal';
}

export function sourceRows(state) {
  const liveSources = state.runtime?.events?.sources ?? state.runtime?.operationsStatus?.physicalSensing?.sources ?? {};
  const merged = { ...(state.runtime?.bootstrap?.sources ?? {}), ...liveSources };
  return Object.entries(merged).map(([key, value]) => {
    const row = value && typeof value === 'object' ? value : { state: value };
    const freshnessAt = row.latestPhysicalObservation ?? row.latestSuccess ?? row.upstreamAt ?? row.fetchedAt ?? row.updatedAt ?? row.generatedAt ?? null;
    return {
      key,
      name: row.label ?? sourceLabel(key),
      state: row.state ?? (row.configured === false ? 'not_configured' : 'unknown'),
      freshnessAt,
      accepted: row.acceptedObservations ?? row.accepted ?? row.observationCount ?? row.acquiredProducts ?? null,
      fetchedAt: row.fetchedAt ?? row.latestPoll ?? null,
      configured: row.configured ?? null,
      authenticated: row.authenticated ?? null,
      latestProduct: row.latestProduct ?? null,
      errorPresent: row.errorPresent ?? Boolean(row.error),
      provider: row.provider ?? row.origin ?? null,
      configurationState: row.configurationState ?? (row.configured === false ? 'not_configured' : null),
      lastPollAt: row.lastPollAt ?? row.latestPoll ?? row.lastAcquisitionAttemptAt ?? row.fetchedAt ?? null,
      lastSuccessAt: row.lastSuccessAt ?? null,
      latestObservationAt: row.latestSourceObservation ?? row.latestPhysicalObservation ?? row.upstreamAt ?? null,
      ingestLagSeconds: finiteNumberOrNull(row.ingestLagSeconds ?? row.sourceLagSeconds),
      rejected: finiteNumberOrNull(row.rejected ?? row.rejectedProducts),
      nextPollAt: row.nextPollAt ?? null,
      parserState: row.parserState ?? null,
      persistenceState: row.persistenceState ?? row.postgisState ?? null,
      currentCoverage: row.currentCoverage ?? null,
      lastError: row.lastError ?? row.error ?? null,
      raw: row
    };
  }).sort((a,b) => a.name.localeCompare(b.name));
}

export function evidenceGroups(event) {
  const observations=event?.observations??event?.recentObservations??[],groups=new Map();
  for(const obs of observations){const key=obs.sourceFamily??obs.source??obs.instrument??obs.type??'unknown';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(obs);}
  return[...groups.entries()].map(([key,values])=>{const rows=[...values].sort((a,b)=>Date.parse(b.at??b.observedAt??'')-Date.parse(a.at??a.observedAt??''));return{key,label:rows[0]?.instrument??rows[0]?.satellite??rows[0]?.source??sourceLabel(key),rows,latest:rows[0]};});
}
const PHYSICAL_OBSERVATION_TYPES=new Set(['thermal','thermal_reading','weather','satellite','imagery','camera','drone','ground_sensor','field_sensor']);
export function evidenceKind(observation={}){
  const type=String(observation.type??observation.observationType??'').toLowerCase();
  const sourceKind=String(observation.sourceIdentity?.kind??'').toUpperCase();
  if(sourceKind==='SENSOR'||sourceKind==='SATELLITE'||sourceKind==='IMAGERY'||observation.physicalFamilyQualification==='QUALIFIED_FIELD_SENSOR_INDEPENDENT_PHYSICAL_FAMILY'||PHYSICAL_OBSERVATION_TYPES.has(type))return'PHYSICAL_OBSERVATION';
  if(type==='field_report'||sourceKind==='FIELD_REPORT'||(sourceKind==='HUMAN'&&observation.sourceIdentity?.field===true))return'FIELD_REPORT';
  if(type==='imported_record'||sourceKind==='IMPORT'||observation.importMode)return'IMPORTED_RECORD';
  if(type==='derived_projection'||sourceKind==='DERIVED')return'DERIVED_PROJECTION';
  if(type==='screening_result'||sourceKind==='SCREENING')return'SCREENING_RESULT';
  if(type==='human_decision'||sourceKind==='DECISION')return'HUMAN_DECISION';
  if(type==='source_status'||sourceKind==='SOURCE_STATUS')return'SOURCE_STATUS';
  if(type==='report'||type==='public_report'||sourceKind==='HUMAN')return'PUBLIC_REPORT';
  return'UNCLASSIFIED_EVIDENCE';
}
export function physicalEvidenceGroups(event){return evidenceGroups({...event,observations:(event?.observations??event?.recentObservations??[]).filter((item)=>evidenceKind(item)==='PHYSICAL_OBSERVATION'),recentObservations:[]});}
const OPEN_EVIDENCE_STATES=new Set(['OPEN','ACKNOWLEDGED','IN_PROGRESS','REQUEST_ACTIVE','WAITING_FOR_SCHEDULED_OBSERVATION','WAITING_FOR_OBSERVATION','MANUAL_ESCALATION_REQUIRED','FIELD_CAPACITY_NOT_CONFIGURED','NO_AVAILABLE_OBSERVATION','FAILED']);
export function isOpenEvidenceNeed(need){return Boolean(need)&&OPEN_EVIDENCE_STATES.has(String(need.state??need.resolutionState??need.status??'').toUpperCase());}
export function openEvidenceNeeds(state,{eventId=null}={}){
  const needs=state?.runtime?.evidenceNeeds?.needs??state?.runtime?.command?.operations?.evidenceNeeds??[];
  return needs.filter(isOpenEvidenceNeed).filter((need)=>!eventId||String(need.subjectId??'')===String(eventId)||String(need.targetId??'').endsWith(String(eventId)));
}
export function numeric(value, fallback = null) {
  return finiteNumberOrNull(value) ?? fallback;
}

export function formatMw(value) {
  return formatMeasuredNumber(value, { suffix: ' MW', missing: 'Unmeasured', fractionDigits: 1 });
}

export function formatCoordinate(coordinate) {
  if (!validCoordinate(coordinate)) return 'Coordinate unavailable';
  const [lon, lat] = coordinate;
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
}

export function compactValue(value, fallback='—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replaceAll('_',' ');
}
