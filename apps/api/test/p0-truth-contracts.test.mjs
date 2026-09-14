import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '../src/http/static-files.mjs';
import { buildEventObservations } from '../../../packages/domain/src/fire-event-tracker.mjs';
import { compareOperationalEvents, mapWithConcurrency, operationalEventClass } from '../src/modules/events/fire-event-service.mjs';
import { isNumberValue, number } from '../../web/src/v2/utils/format.js';
import { liveInspector, liveIntro } from '../../web/src/v2/views/live.js';
import { normalizePhysicalObservation } from '../../../packages/domain/src/physical-observation.mjs';
import { eventPriority } from '../src/modules/events/event-context.mjs';

test('missing numeric values never render as measured zero', () => {
  assert.equal(isNumberValue(null), false);
  assert.equal(isNumberValue(undefined), false);
  assert.equal(isNumberValue(''), false);
  assert.equal(isNumberValue('  '), false);
  assert.equal(isNumberValue(0), true);
  assert.equal(number(null), '—');
  assert.equal(number(0), '0');

  const at = '2026-08-10T12:00:00Z';
  const event = {
    id: 'PT-2026-TRUTH', label: 'Truth contract', coordinate: [-8, 40], firstSeenAt: at, lastSeenAt: at,
    evidenceState: 'reported', evolutionState: 'current', knowledgeState: 'report_only', behaviorState: 'unknown',
    reportState: { sourceActivity: 'current', freshness: 'current', lastAt: at },
    physicalState: { freshness: 'unobserved' }, actionNeed: { needsRouting: false }, timeline: [], observations: [],
    weather: { name: 'Nearest station', temperatureC: null, humidityPercent: null, windSpeedKph: null, distanceKm: null }
  };
  const html = liveInspector({ view: 'live', bootstrap: { control: { actors: [] }, operations: { evidenceRequests: [] }, detection: { incidents: [] } } }, event).content;
  assert.equal(html.includes('0°C'), false);
  assert.equal(html.includes('0%'), false);
  assert.equal(html.includes('0 km/h'), false);
  assert.equal((html.match(/Unavailable/g) ?? []).length, 3);
});

test('missing physical measurements remain absent in domain state and ranking', () => {
  const observation=normalizePhysicalObservation({id:'thermal:nulls',type:'thermal',source:'NASA FIRMS',sourceFamily:'viirs',independenceGroup:'noaa20',at:'2026-08-10T12:00:00Z',receivedAt:'2026-08-10T12:01:00Z',coordinate:[-8,40],frpMw:null,brightnessK:null});
  assert.equal('frpMw' in observation.measurement,false);assert.equal('brightnessK' in observation.measurement,false);
  const priority=eventPriority({evidenceState:'reported',evolutionState:'current',leadTime:null},{weather:{humidityPercent:null,windSpeedKph:null},risk:null});
  assert.equal(priority.rank,0);assert.equal(priority.reasons.includes('Low relative humidity'),false);assert.equal(priority.reasons.includes('Strong local wind'),false);
});

test('broad raster context is never labelled as an Earth or event observation', () => {
  const html = liveIntro({ live: { meta: { generatedAt: '2026-08-10T12:01:00Z' }, clocks: { mtg: { observedAt: '2026-08-10T12:00:00Z' } }, summary: {}, alerts: [], events: [] }, persistentAlerts: [] });
  assert.match(html, /Broad satellite context timestamp/);
  assert.doesNotMatch(html, /Earth observed/i);
});

test('SPA history fallback excludes unknown API routes', async () => {
  let wrote = false;
  const response = { writeHead() { wrote = true; }, end() { wrote = true; } };
  assert.equal(await serveStatic(response, fileURLToPath(new URL('../../web', import.meta.url)), '/api/v10/does-not-exist'), false);
  assert.equal(wrote, false);
});

test('public report observations retain exact raw-product provenance', () => {
  const at = '2026-08-10T12:00:00Z';
  const [observation] = buildEventObservations({ now: new Date(at), fires: [{ id: 'report-1', coordinate: [-8, 40], startedAt: at, updatedAt: at, provenance: { synthetic: false, provider: 'ptdata', rawSourceProductId: 'raw:ptdata:fires:abc', checksumSha256: 'abc', normalizerVersion: 'ptdata-v1' } }] });
  assert.equal(observation.provenance.rawSourceProductId, 'raw:ptdata:fires:abc');
  assert.equal(observation.provenance.checksumSha256, 'abc');
  assert.equal(observation.provenance.normalizerVersion, 'ptdata-v1');
});

test('FIRMS thermal observations retain a support footprint when the provider supplies only scan geometry', () => {
  const at='2026-08-10T12:00:00Z';
  const [observation]=buildEventObservations({now:new Date('2026-08-10T12:01:00Z'),thermalDetections:[{id:'n20:1',observedAt:at,coordinate:[-8,40],source:'NASA FIRMS VIIRS',sourceFamily:'viirs',independenceGroup:'viirs_noaa_20',instrument:'VIIRS',satellite:'VIIRS NOAA-20',scanKm:.42,trackKm:.38,provenance:{synthetic:false,rawSourceProductId:'raw:nasa:abc'}}]});
  assert.equal(observation.footprint.type,'Feature');assert.equal(observation.footprint.geometry.type,'Polygon');assert.equal(observation.footprint.properties.geometryBasis,'nominal_pixel_support');assert.equal(observation.footprint.properties.authoritativePerimeter,false);
});

test('stale reports rank below current physical and current report events', () => {
  const stale = { id: 'stale', evolutionState: 'stale', reportState: { sourceActivity: 'stale_open' }, physicalState: { freshness: 'unobserved' }, evidenceState: 'reported', priority: { rank: 999 }, lastSeenAt: '2026-08-10T12:00:00Z' };
  const report = { id: 'report', evolutionState: 'current', reportState: { sourceActivity: 'current' }, physicalState: { freshness: 'unobserved' }, evidenceState: 'reported', priority: { rank: 1 }, lastSeenAt: '2026-08-10T11:00:00Z' };
  const physical = { id: 'physical', evolutionState: 'current', reportState: { sourceActivity: 'no_report' }, physicalState: { freshness: 'current' }, evidenceState: 'satellite-only', priority: { rank: 1 }, lastSeenAt: '2026-08-10T10:00:00Z' };
  assert.equal(operationalEventClass(stale), 'stale_report');
  assert.deepEqual([stale, report, physical].sort(compareOperationalEvents).map((item) => item.id), ['physical', 'report', 'stale']);
});

test('event enrichment is bounded so PostGIS work cannot exhaust its connection pool',async()=>{
  let active=0,maximum=0;
  const values=await mapWithConcurrency(Array.from({length:20},(_,index)=>index),4,async(value)=>{
    active+=1;maximum=Math.max(maximum,active);
    await new Promise((resolve)=>setImmediate(resolve));
    active-=1;return value*2;
  });
  assert.equal(maximum,4);
  assert.deepEqual(values,Array.from({length:20},(_,index)=>index*2));
});
