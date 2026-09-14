import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveThermalAdapter, parseCapabilities, timeDimension } from '../src/modules/live/live-thermal-adapter.mjs';
import { LiveFireService, freshnessFor } from '../src/modules/live/live-fire-service.mjs';

test('MTG capabilities resolve an FRP layer and replay slots', () => {
  const xml = `<?xml version="1.0"?><WMT_MS_Capabilities><Capability><Layer><Layer><Name>QualityProduct</Name></Layer><Layer><Name>MTG_FRP_PIXEL</Name><Dimension name="time" default="2026-08-08T12:40:00Z">2026-08-08T12:20:00Z,2026-08-08T12:30:00Z,2026-08-08T12:40:00Z</Dimension></Layer></Layer></Capability></WMT_MS_Capabilities>`;
  const parsed = parseCapabilities(xml, { id: 'mtg-frp', label: 'MTG', cadenceMinutes: 10, nominalResolutionKm: 1, productStatus: 'demonstration', priority: 1, baseUrl: 'https://example.test' },new Date('2026-08-08T12:50:00Z'));
  assert.equal(parsed.layer, 'MTG_FRP_PIXEL');
  assert.equal(parsed.latestTime, '2026-08-08T12:40:00.000Z');
  assert.equal(parsed.timeSlots.length, 3);
});

test('time dimension synthesizes replay slots from an interval endpoint', () => {
  const parsed = timeDimension('<Dimension name="time">2026-08-08T10:00:00Z/2026-08-08T12:40:00Z/PT10M</Dimension>');
  assert.equal(parsed.latest, '2026-08-08T12:40:00.000Z');
});


test('live thermal overlay falls back from MTG to operational MSG when the preferred map fails', async () => {
  const capabilities = (layer, time) => `<?xml version="1.0"?><WMT_MS_Capabilities><Capability><Layer><Layer><Name>${layer}</Name><Dimension name="time" default="${time}">${time}</Dimension></Layer></Layer></Capability></WMT_MS_Capabilities>`;
  const fetchImpl = async (input) => {
    const url = new URL(String(input)); const dataset = url.searchParams.get('DATASET') ?? url.searchParams.get('dataset'); const request = url.searchParams.get('REQUEST');
    if (request === 'GetCapabilities') return new Response(capabilities(dataset === 'MTG-FRP' ? 'MTG_FRP_PIXEL' : 'MSG_FRP_PIXEL', '2026-08-08T12:40:00Z'), { status:200, headers:{'content-type':'application/xml'} });
    if (dataset === 'MTG-FRP') return new Response('down', { status:503 });
    return new Response(new Uint8Array([137,80,78,71,13,10,26,10]), { status:200, headers:{'content-type':'image/png'} });
  };
  const adapter = new LiveThermalAdapter({ fetchImpl, timeoutMs:1000 });
  const overlay = await adapter.overlay({ providerId:'auto', time:'latest' });
  assert.equal(overlay.providerId, 'msg-frp');
  assert.equal(overlay.contentType, 'image/png');
});

test('live thermal overlay admits one bounded multi-map viewport burst',async()=>{
  let overlayCalls=0;
  const capabilities='<?xml version="1.0"?><WMT_MS_Capabilities><Capability><Layer><Layer><Name>MSG_FRP_PIXEL</Name><Dimension name="time" default="2026-08-08T12:40:00Z">2026-08-08T12:40:00Z</Dimension></Layer></Layer></Capability></WMT_MS_Capabilities>';
  const fetchImpl=async input=>{const request=new URL(String(input)).searchParams.get('REQUEST');if(request==='GetCapabilities')return new Response(capabilities,{status:200,headers:{'content-type':'application/xml'}});overlayCalls+=1;await new Promise(resolve=>setTimeout(resolve,15));return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{status:200,headers:{'content-type':'image/png'}});};
  const adapter=new LiveThermalAdapter({fetchImpl,timeoutMs:1000,clock:()=>new Date('2026-08-08T12:50:00Z')});
  const rows=await Promise.all(Array.from({length:6},(_,index)=>adapter.overlay({clientKey:'operator-session',bbox:[-9.75+index*.01,36.7,-6,42.3],width:640,height:640})));
  assert.equal(overlayCalls,6);
  assert.equal(rows.every(row=>row.state==='current'&&row.contentType==='image/png'),true);
});
test('live fire snapshot fuses report, risk, weather and VIIRS without fabricating support', async () => {
  const now = new Date('2026-08-08T12:50:00Z');
  const world = {
    meta: { mode: 'public-sources', generatedAt: now.toISOString() },
    sources: {
      fires: { label: 'occurrences', state: 'current' }, weather: { label: 'weather', state: 'current' },
      riskToday: { label: 'risk', state: 'current' }, firms: { label: 'VIIRS', state: 'current' }
    },
    fires: [{ id: 'fire-1', municipality: 'Monchique', municipalityCode: '0809', district: 'Faro', parish: 'Alferce', coordinate: [-8.49, 37.32], startedAt: '2026-08-08T12:20:00Z', updatedAt: '2026-08-08T12:45:00Z', operatives: 39, ground: 11, aerial: 1, important: false }],
    riskToday: [{ id: '0809', municipalityCode: '0809', name: 'Monchique', coordinate: [-8.49, 37.32], level: 5, label: 'Maximum' }],
    weather: [{ id: 'w1', name: 'Monchique', coordinate: [-8.5, 37.31], observedAt: '2026-08-08T12:00:00Z', temperatureC: 36, humidityPercent: 18, windSpeedKph: 31 }],
    thermalDetections: [{ id: 't1', coordinate: [-8.491, 37.321], observedAt: '2026-08-08T12:42:00Z', frpMw: 71, confidence: 'high', satellite: 'NOAA-20' }],
    warnings: []
  };
  const service = new LiveFireService({
    worldService: { snapshot: async () => structuredClone(world) },
    thermalAdapter: { metadata: async () => ({ state: 'current', selectedProvider: 'mtg-frp', selected: { id: 'mtg-frp', label: 'MTG FRP', cadenceMinutes: 10, timeSlots: ['2026-08-08T12:40:00Z'], latestTime: '2026-08-08T12:40:00Z' }, providers: [] }) },
    clock: () => now
  });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.summary.activeReports, 1);
  assert.equal(snapshot.summary.viirsSupported, 1);
  assert.equal(snapshot.incidents[0].truthStage, 'corroborated');
  assert.equal(snapshot.incidents[0].thermal.viirsMatch.frpMw, 71);
  assert.equal(snapshot.incidents[0].risk.level, 5);
  assert.equal(snapshot.incidents[0].freshness.state, 'current');
  assert.equal(snapshot.summary.unmatchedThermal, 0);
  assert.equal(snapshot.alerts[0].type, 'thermal-supported');
});

test('unmatched VIIRS point becomes a satellite-only candidate, never a confirmed fire', async () => {
  const now = new Date('2026-08-08T12:50:00Z');
  const world = { meta:{mode:'public-sources'}, sources:{firms:{state:'current'}}, fires:[], riskToday:[{id:'0502',name:'Castelo Branco',coordinate:[-7.49,39.82],level:5}], weather:[{id:'w',name:'Castelo Branco',coordinate:[-7.48,39.81],humidityPercent:19,windSpeedKph:26}], thermalDetections:[{id:'hot-1',coordinate:[-7.50,39.83],observedAt:'2026-08-08T12:40:00Z',frpMw:42,satellite:'NOAA-20'}], warnings:[] };
  const service = new LiveFireService({ worldService:{snapshot:async()=>structuredClone(world)}, thermalAdapter:{metadata:async()=>({state:'unavailable',providers:[]})}, clock:()=>now });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.summary.unmatchedThermal, 1);
  assert.equal(snapshot.thermalCandidates[0].state, 'satellite-only');
  assert.equal(snapshot.thermalCandidates[0].operationalClaim, false);
  assert.equal(snapshot.alerts[0].type, 'satellite-only');
});

test('epoch-like timestamps never become a believable live age', () => {
  const value = freshnessFor({ updatedAt: null, startedAt: null }, Date.parse('2026-08-08T12:50:00Z'));
  assert.equal(value.state, 'unknown');
  assert.equal(value.ageMinutes, null);
});

test('thermal capabilities never expose future replay slots as live observations', () => {
  const xml = `<?xml version="1.0"?><WMT_MS_Capabilities><Capability><Layer><Layer><Name>MTG_FRP_PIXEL</Name><Dimension name="time" default="2026-08-13T02:10:00Z">2026-08-08T14:40:00Z,2026-08-08T14:50:00Z,2026-08-13T02:10:00Z</Dimension></Layer></Layer></Capability></WMT_MS_Capabilities>`;
  const parsed = parseCapabilities(xml, { id:'mtg-frp', label:'MTG', cadenceMinutes:10, nominalResolutionKm:1, productStatus:'demonstration', priority:1, baseUrl:'https://example.test' }, new Date('2026-08-08T15:00:00Z'));
  assert.equal(parsed.latestTime, '2026-08-08T14:50:00.000Z');
  assert.equal(parsed.timeSlots.at(-1), '2026-08-08T14:50:00.000Z');
});
