import { bboxAround } from '../../../../../packages/domain/src/geo.mjs';
import { fetchBuffer } from '../../shared/fetch.mjs';
import { TtlCache } from '../../shared/ttl-cache.mjs';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { SingleFlight } from '../../shared/request-gate.mjs';
import { randomBytes } from 'node:crypto';
import { createPinnedHttpsFetch } from '../../shared/pinned-https-fetch.mjs';

const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
const ALLOWED_PREVIEW_HOSTS = ['gibs.earthdata.nasa.gov', 'copernicus.eu', 'dataspace.copernicus.eu', 'sentinel-hub.com', 'eox.at', 'earth-search.aws.element84.com', 'sentinel-cogs.s3.us-west-2.amazonaws.com'];

function fit(bounds, aspect = 1.45) {
  const [w, s, e, n] = bounds; const height = n - s; const center = (w + e) / 2; const width = Math.max(e - w, height * aspect);
  return [center - width / 2, s, center + width / 2, n];
}
const blockedAddresses=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blockedAddresses.addSubnet(address,prefix,'ipv4');
for(const [address,prefix] of [['::',128],['::1',128],['64:ff9b:1::',48],['100::',64],['2001:db8::',32],['fc00::',7],['fe80::',10],['ff00::',8]])blockedAddresses.addSubnet(address,prefix,'ipv6');
function allowed(href) { try { const url = new URL(href),hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();return url.protocol === 'https:' && (!url.port||url.port==='443')&&!url.username&&!url.password&&!url.hash&&url.href.length<=4096&&url.pathname.length<=2048&&url.search.length<=2048&&ALLOWED_PREVIEW_HOSTS.some((host) => hostname===host||hostname.endsWith(`.${host}`)); } catch { return false; } }
function privateAddress(address){const value=String(address).replace(/^\[|\]$/g,''),family=isIP(value);return family===0||value.toLowerCase().startsWith('::ffff:')||blockedAddresses.check(value,family===4?'ipv4':'ipv6');}

export class CurrentImageryService {
  #fetchImpl; #cache = new TtlCache({ maxEntries: 80 });
  #active=0;#clients=new Map();#singleFlight=new SingleFlight({maxKeys:120});
  #previewHandles=new Map();#previewByTarget=new Map();
  constructor({ fetchImpl = null, requestImpl=https.request,resolveHost=(hostname)=>lookup(hostname,{all:true,verbatim:true}), maxConcurrent=4, requestsPerMinute=60 } = {}) { this.resolveHost=resolveHost;this.#fetchImpl = fetchImpl??createPinnedHttpsFetch({resolveHost,requestImpl,timeoutMs:18_000});this.maxConcurrent=maxConcurrent;this.requestsPerMinute=requestsPerMinute; }
  async #validate(target){if(!allowed(target))throw new Error('preview_host_not_allowed');const hostname=target.hostname.replace(/^\[|\]$/g,'');const addresses=isIP(hostname)?[{address:hostname}]:await this.resolveHost(hostname);if(!Array.isArray(addresses)||!addresses.length||addresses.some((item)=>privateAddress(item.address??item)))throw new Error('preview_destination_not_public');}
  #rate(clientKey){const key=String(clientKey??'anonymous'),now=Date.now(),row=this.#clients.get(key);if(!row||now-row.startedAt>=60_000){this.#clients.set(key,{startedAt:now,count:1});return;}if(row.count>=this.requestsPerMinute)throw Object.assign(new Error('preview_rate_limit_exceeded'),{statusCode:429});row.count+=1;}
  async #bounded(work){if(this.#active>=this.maxConcurrent)throw Object.assign(new Error('preview_concurrency_limit_reached'),{statusCode:429});this.#active+=1;try{return await work();}finally{this.#active-=1;}}
  frameDescriptor({ coordinate, date, radiusKm = 9 }) {
    const bbox = fit(bboxAround(coordinate, radiusKm));
    return {
      source: 'NASA Global Imagery Browse Services',
      sensor: 'NOAA-20 VIIRS Corrected Reflectance True Color',
      acquiredDate: date.slice(0, 10),
      bbox,
      imageUrl: `/api/v2/observations/frame/${date.slice(0, 10)}?bbox=${encodeURIComponent(bbox.join(','))}`,
      resolutionNotice: 'Broad visual context from a different sensor. It is not the selected Sentinel scene.'
    };
  }
  frameUrl(args) { return this.frameDescriptor(args).imageUrl; }
  proxyUrl(href) {if(!allowed(href))return null;this.#pruneHandles();let entry=this.#previewByTarget.get(href);if(!entry||entry.expiresAt<=Date.now()){if(this.#previewHandles.size>=160){const oldest=this.#previewHandles.values().next().value;if(oldest){this.#previewHandles.delete(oldest.token);this.#previewByTarget.delete(oldest.href);}}entry={token:randomBytes(24).toString('base64url'),href,expiresAt:Date.now()+15*60_000};this.#previewHandles.set(entry.token,entry);this.#previewByTarget.set(href,entry);}return`/api/v2/observations/proxy?handle=${entry.token}`; }
  async frame({ date, bbox,clientKey='anonymous',signal=null }) {
    const bounds = String(bbox).split(',').map(Number); if (bounds.length !== 4 || !bounds.every(Number.isFinite)) throw new Error('invalid_imagery_bbox');
    const key = `${date}:${bounds.map((v) => v.toFixed(4)).join(',')}`; const cached = this.#cache.get(key); if (cached) return { ...cached, buffer: Buffer.from(cached.buffer) };
    this.#rate(clientKey);const url = new URL(GIBS); const params = { SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', STYLES: '', FORMAT: 'image/jpeg', TRANSPARENT: 'FALSE', SRS: 'EPSG:4326', BBOX: bounds.join(','), WIDTH: '1600', HEIGHT: '1100', TIME: date };
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    const result = await this.#singleFlight.run(key,()=>this.#bounded(()=>fetchBuffer(url, { fetchImpl: this.#fetchImpl, timeoutMs: 18_000, maxBytes:8*1024*1024,signal,validateUrl:(target)=>this.#validate(target),userAgent: 'VIGIA/9.0 sensor-fusion-core' })));
    const value = { ...result, sourceState: 'current', sourceUrl: url.toString() }; this.#cache.set(key, { ...value, buffer: Buffer.from(value.buffer) }, 6 * 60 * 60_000); return value;
  }
  async proxy(handle,{clientKey='anonymous',signal=null}={}) {
    this.#pruneHandles();const entry=/^[A-Za-z0-9_-]{32}$/.test(String(handle))?this.#previewHandles.get(String(handle)):null;if(!entry)throw new Error('preview_handle_invalid');const href=entry.href;
    if (!allowed(href)) throw new Error('preview_host_not_allowed');
    this.#rate(clientKey);
    const key = `proxy:${href}`; const cached = this.#cache.get(key); if (cached) return { ...cached, buffer: Buffer.from(cached.buffer) };
    const result = await this.#singleFlight.run(key,()=>this.#bounded(()=>fetchBuffer(href, { fetchImpl: this.#fetchImpl, timeoutMs: 18_000, maxBytes:8*1024*1024,signal,validateUrl:(target)=>this.#validate(target),userAgent: 'VIGIA/9.0 sensor-fusion-core' })));
    const value = { ...result, sourceState: 'current' };
    this.#cache.set(key, { ...value, buffer: Buffer.from(value.buffer) }, 6 * 60 * 60_000); return value;
  }
  #pruneHandles(){const now=Date.now();for(const entry of this.#previewHandles.values())if(entry.expiresAt<=now){this.#previewHandles.delete(entry.token);if(this.#previewByTarget.get(entry.href)===entry)this.#previewByTarget.delete(entry.href);}}
}
