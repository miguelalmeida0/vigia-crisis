import test from 'node:test';
import assert from 'node:assert/strict';
import { PtDataGateway } from '../src/modules/world/ptdata-gateway.mjs';
import { CopernicusGateway } from '../src/modules/world/copernicus-gateway.mjs';
import { FirmsGateway } from '../src/modules/world/firms-gateway.mjs';
import { normalizeHistory, normalizeOccurrences } from '../src/modules/world/ptdata-normalizers.mjs';

const clock = () => new Date('2026-08-07T12:00:00Z');
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

function ptdataPayload(url) {
  if (url.includes('/occurrences/active')) return {
    data: { occurrences: [{ id: 'fire-1', nature_code: '3101', nature_desc: 'Incêndio rural', status: 'active', district: 'Viseu', municipality: 'Nelas', lat: 40.53, lon: -7.85, started_at: '2026-08-07T11:50:00Z', operatives: 24, ground: 6, aerial: 1, important: true }] },
    meta: { timestamp: '2026-08-07T11:59:00Z' }
  };
  if (url.includes('/risk?')) return {
    data: { risks: [{ forecast_day: '2026-08-07', municipality_code: '1809', dico: 'Nelas', risk_level: 5, risk_label: 'Máximo', lat: 40.53, lon: -7.85 }] },
    meta: { timestamp: '2026-08-07T06:00:00Z' }
  };
  if (url.includes('/weather/observations')) return {
    data: { observations: [{ station_id: 1, station_name: 'Viseu', observed_at: '2026-08-07T11:00:00Z', temperature: 34, humidity: 19, wind_speed_kmh: 28, wind_dir_id: 3, lat: 40.66, lon: -7.91 }] },
    meta: { timestamp: '2026-08-07T11:05:00Z' }
  };
  if (url.includes('/weather/warnings')) return {
    data: { warnings: [{ id: 3, area_id: 'VIS', area_name: 'Viseu', awareness_type: 'Heat', awareness_level: 'orange', description: 'Persistent high temperature', start_time: '2026-08-07T09:00:00Z', end_time: '2026-08-08T18:00:00Z', district_code: '18' }] },
    meta: { timestamp: '2026-08-07T10:00:00Z' }
  };
  if (url.includes('/civil-protection/fires')) return {
    data: { fires: [{ id: 99, year: 2026, district: 'Viseu', municipality: 'Nelas', cause: 'Negligente', total_area: 41.2, ignition_date: '2026-07-18T13:00:00Z', lat: 40.54, lon: -7.84 }] },
    meta: { timestamp: '2026-08-06T00:00:00Z' }
  };
  throw new Error(`unexpected_url_${url}`);
}

test('ptdata adapter normalizes documented civil-protection and weather shapes', async () => {
  const calls = [];
  const gateway = new PtDataGateway({
    currentYear: 2026,
    clock,
    fetchImpl: async (url) => { calls.push(String(url)); return json(ptdataPayload(String(url))); }
  });
  const snapshot = await gateway.snapshot();
  assert.equal(snapshot.fires.data[0].id, 'fire-1');
  assert.equal(snapshot.fires.data[0].resourceBand, 'moderate');
  assert.equal(snapshot.fires.data[0].resourceDataAvailable, true);
  assert.equal(snapshot.riskToday.data[0].level, 5);
  assert.equal(snapshot.weather.data[0].humidityPercent, 19);
  assert.equal(snapshot.weather.data[0].windDirection, 'E');
  assert.equal(snapshot.warnings.data[0].level, 'orange');
  assert.equal(snapshot.history.data.length, 2);
  assert.ok(calls.some((url) => url.endsWith('/occurrences/active')));
  assert.ok(calls.some((url) => url.includes('/risk?day=today')));
});

test('occurrence locality strips provider resource disclaimers from the place label', () => {
  const [fire] = normalizeOccurrences({ data:{ occurrences:[{ id:'clean-place', nature_desc:'Incêndio rural', lat:39.7, lon:-8.8, municipality:'Leiria', parish:'Monte Redondo Sem informação do número de meios neste momento. Informação recolhida via Fogos.pt' }] } });
  assert.equal(fire.parish, 'Monte Redondo');
});

test('copernicus adapter requests Sentinel-2 L2A and pairs recent observations', async () => {
  let requestBody;
  const gateway = new CopernicusGateway({
    clock,
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return json({ features: [
        { id: 'new', bbox: [-8.5, 39.3, -7.3, 40.4], properties: { datetime: '2026-08-06T11:00:00Z', 'eo:cloud_cover': 10 }, assets: {} },
        { id: 'old', bbox: [-8.5, 39.3, -7.3, 40.4], properties: { datetime: '2026-07-25T11:00:00Z', 'eo:cloud_cover': 18 }, assets: {} }
      ] });
    }
  });
  const snapshot = await gateway.snapshot();
  const region = snapshot.data.find((item) => item.id === 'central-pinhal');
  assert.deepEqual(requestBody.collections, ['sentinel-2-l2a']);
  assert.equal(region.latest.id, 'new');
  assert.equal(region.previous.id, 'old');
  assert.equal(snapshot.state.state, 'current');
});

test('FIRMS adapter remains explicit when unconfigured and parses configured CSV', async () => {
  const missing = await new FirmsGateway({ mapKey: '', clock }).snapshot();
  assert.equal(missing.state.state, 'not_configured');
  const configured = new FirmsGateway({
    mapKey: 'test-key',
    clock,
    fetchImpl: async () => new Response('latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,bright_ti4\n40.52,-7.84,2026-08-07,1156,N20,VIIRS,h,12.4,341.2', { status: 200 })
  });
  const snapshot = await configured.snapshot();
  assert.equal(snapshot.data.length, 1);
  assert.equal(snapshot.data[0].frpMw, 12.4);
  assert.equal(snapshot.data[0].observedAt, '2026-08-07T11:56:00.000Z');
});

test('ICNF SGIF archive fields preserve alert time, burned area and lifecycle evidence', () => {
  const [fire] = normalizeHistory({ data: { fires: [{
    id: 109,
    year: 2024,
    fire_type: 'Florestal',
    cause_type: 'Natural',
    cause_family: 'Naturais - Raio',
    district: 'Bragança',
    municipality: 'Vimioso',
    parish: 'Angueira',
    locality: 'Vale de Pena',
    municipality_code: '0411',
    lat: 41.614267,
    lon: -6.385612,
    alert_at: '2024-08-10T18:10:00Z',
    first_response_at: '2024-08-10T18:25:00Z',
    extinction_at: '2024-08-12T20:14:00Z',
    duration_min: 3004,
    area_total_ha: 1935.52,
    temperature: 35.2,
    humidity: 17.1,
    wind_speed: 18.4,
    fwi: 51.2
  }] } });
  assert.equal(fire.startedAt, '2024-08-10T18:10:00.000Z');
  assert.equal(fire.burnedAreaHa, 1935.52);
  assert.equal(fire.firstResponseAt, '2024-08-10T18:25:00.000Z');
  assert.equal(fire.extinctionAt, '2024-08-12T20:14:00.000Z');
  assert.equal(fire.causeFamily, 'Naturais - Raio');
  assert.equal(fire.weather.fwi, 51.2);
});
