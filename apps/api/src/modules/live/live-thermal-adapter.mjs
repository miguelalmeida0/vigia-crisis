import { fetchBuffer, fetchText } from '../../shared/fetch.mjs';
import { TtlCache } from '../../shared/ttl-cache.mjs';
import { RequestGate, SingleFlight } from '../../shared/request-gate.mjs';

const PROVIDERS = Object.freeze([
  {
    id: 'msg-frp',
    label: 'MSG SEVIRI Fire Radiative Power',
    baseUrl: 'https://adaguc.lsasvcs.ipma.pt//adagucserver?dataset=MSG-FRP',
    cadenceMinutes: 15,
    nominalResolutionKm: 3,
    productStatus: 'operational',
    priority: 1
  }
]);

const PORTUGAL_BBOX = Object.freeze([-9.75, 36.7, -6.0, 42.3]);

function clean(value) { return String(value ?? '').trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function isoOrNull(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function layerCandidates(xml) {
  const names = [...String(xml).matchAll(/<(?:[A-Za-z0-9_]+:)?Name>\s*([^<]+?)\s*<\/(?:[A-Za-z0-9_]+:)?Name>/gi)]
    .map((match) => clean(match[1]));
  const scored = unique(names).map((name) => {
    const lower = name.toLowerCase();
    let score = 0;
    if (lower.includes('frp')) score += 10;
    if (lower.includes('fire')) score += 7;
    if (lower.includes('pixel')) score += 4;
    if (lower.includes('mtg') || lower.includes('msg')) score += 2;
    if (lower.includes('quality') || lower.includes('flag') || lower.includes('confidence')) score -= 5;
    return { name, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.map((item) => item.name);
}

function timeDimension(xml) {
  const text = String(xml);
  const dimension = text.match(/<(?:[A-Za-z0-9_]+:)?(?:Dimension|Extent)\b([^>]*)name=["']time["']([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:Dimension|Extent)>/i);
  if (!dimension) return { latest: null, slots: [] };
  const attrs = `${dimension[1]} ${dimension[2]}`;
  const body = dimension[3].replace(/\s+/g, ' ').trim();
  const defaultMatch = attrs.match(/default=["']([^"']+)["']/i);
  const explicit = [...body.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?/g)]
    .map((match) => isoOrNull(match[0])).filter(Boolean);
  const intervalParts = body.includes('/') ? body.split('/').map((value) => clean(value)) : [];
  const intervalEnd = intervalParts.length >= 2 ? isoOrNull(intervalParts[1]) : null;
  const defaultTime = isoOrNull(defaultMatch?.[1]);
  const slots = unique(explicit).sort();
  return { latest: defaultTime ?? slots.at(-1) ?? intervalEnd, slots: slots.slice(-72) };
}

function validHistoricalSlots(slots, now = new Date()) { const max = now.getTime() + 2 * 60_000; const min = now.getTime() - 7 * 86_400_000; return slots.filter((slot) => { const ms = Date.parse(slot); return Number.isFinite(ms) && ms >= min && ms <= max; }); }

function parseCapabilities(xml, provider, now = new Date()) {
  const layers = layerCandidates(xml);
  if (!layers.length) throw new Error(`${provider.id}_frp_layer_not_found`);
  const time = timeDimension(xml);
  const latestTime = time.latest;
  const generatedSlots = latestTime && time.slots.length < 2
    ? Array.from({ length: 18 }, (_, index) => new Date(Date.parse(latestTime) - (17 - index) * provider.cadenceMinutes * 60_000).toISOString())
    : time.slots;
  const validSlots = validHistoricalSlots(generatedSlots, now);
  const safeLatest = validHistoricalSlots([latestTime].filter(Boolean), now)[0] ?? validSlots.at(-1) ?? null;
  return {
    ...provider,
    layer: layers[0],
    alternativeLayers: layers.slice(1, 6),
    latestTime: safeLatest,
    timeSlots: validSlots,
    capabilitiesFetchedAt: new Date().toISOString()
  };
}

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export class LiveThermalAdapter {
  #fetchImpl;
  #timeoutMs;
  #clock;
  #metadataCache = new TtlCache({ maxEntries: 4 });
  #imageCache = new TtlCache({ maxEntries: 80 });
  #gate;#singleFlight=new SingleFlight({maxKeys:120});#metadataPromise=null;

  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 14_000, clock = () => new Date(),gate=new RequestGate({maxConcurrent:12,maxConcurrentPerClient:6,maxRequestsPerWindow:360}) } = {}) {
    this.#fetchImpl = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#clock = clock;
    this.#gate=gate;
  }

  async metadata() {
    if(this.#metadataPromise)return this.#metadataPromise;
    this.#metadataPromise=(async()=>{
      const providers=await Promise.all(PROVIDERS.map((provider)=>this.#probe(provider)));
      const healthy=providers.filter((item)=>item.state==='current').sort((a,b)=>a.priority-b.priority),selected=healthy[0]??null;
      return{state:selected?'current':'unavailable',selectedProvider:selected?.id??null,selected,providers,fetchedAt:new Date().toISOString()};
    })().finally(()=>{this.#metadataPromise=null;});
    return this.#metadataPromise;
  }

  peek() {
    const providers = PROVIDERS.map((provider) => this.#metadataCache.get(provider.id)).filter(Boolean);
    const healthy = providers.filter((item) => item.state === 'current').sort((a, b) => a.priority - b.priority);
    const selected = healthy[0] ?? null;
    return { state: selected ? 'current' : providers.length ? 'unavailable' : 'loading', selectedProvider:selected?.id??null, selected, providers, fetchedAt:null, error:providers.length?null:'Thermal context is loading in the background.' };
  }

  async overlay({ providerId = 'auto', time = null, bbox = PORTUGAL_BBOX, width = 980, height = 1280,clientKey='internal' } = {}) {
    const metadata = await this.metadata();
    const candidates = providerId === 'auto'
      ? metadata.providers.filter((item) => item.state === 'current').sort((a, b) => a.priority - b.priority)
      : metadata.providers.filter((item) => item.id === providerId && item.state === 'current');
    if (!candidates.length) throw new Error('thermal_provider_unavailable');
    const errors = [];
    for (const provider of candidates) {
      try { return await this.#overlayFor(provider, { time, bbox, width, height,clientKey }); }
      catch (error) { errors.push(`${provider.id}:${String(error.message ?? error)}`); }
    }
    throw new Error(`thermal_overlay_failed:${errors.join('|')}`);
  }

  async #overlayFor(provider, { time, bbox, width, height,clientKey }) {
    const safeBbox = Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite) ? bbox : PORTUGAL_BBOX;
    const selectedTime = time && time !== 'latest' ? isoOrNull(time) : provider.latestTime;
    const cacheKey = `${provider.id}:${selectedTime ?? 'latest'}:${safeBbox.join(',')}:${width}x${height}`;
    const cached = this.#imageCache.get(cacheKey);
    if (cached) return { ...cached, body: Buffer.from(cached.body) };
    return this.#singleFlight.run(cacheKey,()=>this.#gate.run(clientKey,async()=>{const again=this.#imageCache.get(cacheKey);if(again)return{...again,body:Buffer.from(again.body)};const request = buildUrl(provider.baseUrl, {
      SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: provider.layer,
      STYLES: '', FORMAT: 'image/png', TRANSPARENT: 'TRUE', SRS: 'EPSG:4326',
      BBOX: safeBbox.join(','), WIDTH: Math.max(320, Math.min(1600, Number(width) || 980)),
      HEIGHT: Math.max(320, Math.min(1800, Number(height) || 1280)), TIME: selectedTime
    });
    const result = await fetchBuffer(request, { fetchImpl: this.#fetchImpl, timeoutMs: this.#timeoutMs, userAgent: 'VIGIA/9.0 sensor-fusion-core' });
    const value = { body: result.body, contentType: result.contentType, providerId: provider.id, layer: provider.layer, acquiredAt: selectedTime, sourceUrl: request.toString(), state: 'current' };
    this.#imageCache.set(cacheKey, { ...value, body:Buffer.from(value.body) }, Math.min(provider.cadenceMinutes * 60_000, 10 * 60_000));
    return value;
    }));
  }

  async #probe(provider) {
    const cached = this.#metadataCache.get(provider.id);
    if (cached) return cached;
    try {
      const url = buildUrl(provider.baseUrl, { SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.1.1' });
      const xml = await fetchText(url, { fetchImpl: this.#fetchImpl, timeoutMs: this.#timeoutMs, userAgent: 'VIGIA/9.0 sensor-fusion-core' });
      const value = { state: 'current', ...parseCapabilities(xml, provider, this.#clock()), error: null };
      this.#metadataCache.set(provider.id, value, 5 * 60_000);
      return value;
    } catch (error) {
      const value = { state: 'unavailable', ...provider, layer: null, latestTime: null, timeSlots: [], error: String(error.message ?? error) };
      this.#metadataCache.set(provider.id, value, 60_000);
      return value;
    }
  }
}

export { PORTUGAL_BBOX, parseCapabilities, layerCandidates, timeDimension, validHistoricalSlots };
