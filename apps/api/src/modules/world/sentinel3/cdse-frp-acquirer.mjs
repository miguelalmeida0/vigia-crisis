import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRaw, postJson } from '../../../shared/fetch.mjs';
import { HttpAcquirer } from '../../acquisition/http-acquirer.mjs';
import { normalizeContentChecksum } from '../../../shared/content-checksum.mjs';
import { runBoundedJsonProcess } from '../../../shared/bounded-json-process.mjs';
import { createPinnedHttpsFetch } from '../../../shared/pinned-https-fetch.mjs';

const PARSER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'parse_sentinel3_frp.py');
const CATALOGUE = 'https://stac.dataspace.copernicus.eu/v1/search';
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const PORTUGAL = [-9.75, 36.7, -6, 42.3];
const NRT_COLLECTION = 'sentinel-3-sl-2-frp-nrt';
const NTC_COLLECTION = 'sentinel-3-sl-2-frp-ntc';
const COLLECTIONS = new Set([NRT_COLLECTION, NTC_COLLECTION]);
const DEFAULT_LOOKBACK_HOURS = 48;
const DEFAULT_LIMIT = 16;
const CDSE_ASSET_ORIGINS = new Set([
  'https://download.dataspace.copernicus.eu',
  'https://zipper.dataspace.copernicus.eu'
]);

export function assertTrustedCdseAssetUrl(value) {
  let target;
  try { target = value instanceof URL ? value : new URL(value); } catch { throw new Error('cdse_asset_url_rejected'); }
  if (!CDSE_ASSET_ORIGINS.has(target.origin) || target.protocol !== 'https:' || target.username || target.password || target.hash || target.href.length > 4096 || target.pathname.length > 3072) throw new Error('cdse_asset_url_rejected');
  return target;
}

function parseProduct(file, extractionDir, pythonBinary,{timeoutMs=30_000,maxOutputBytes=2*1024*1024}={}) {
  return runBoundedJsonProcess({command:pythonBinary,args:[PARSER,file,extractionDir],filePath:file,timeoutMs,maxOutputBytes});
}

export async function parseBody(body, pythonBinary, tempRoot, asset) {
  await mkdir(tempRoot, { recursive:true });
  const directory = await mkdtemp(path.join(tempRoot, 'product-'));
  const file = path.join(directory, asset.format === 'zip' ? 'sentinel3-sl2-frp.zip' : `${asset.name}.nc`),extractionDir=path.join(directory,'expanded');
  try { await mkdir(extractionDir);await writeFile(file, body); return await parseProduct(file,extractionDir,pythonBinary); }
  finally { await rm(directory, { recursive:true, force:true }); }
}

function collectionName(value) {
  const name=String(value || NRT_COLLECTION).trim().toLowerCase();
  if(!COLLECTIONS.has(name))throw new Error(`unsupported_cdse_frp_collection:${name}`);
  return name;
}

function itemAsset(item) {
  // ESA defines FRP_in.nc as the NTC 1 km thermal FRP measurement file.
  // FRP_an.nc is the nighttime 500 m SWIR A-stripe product, so it is a
  // secondary fallback rather than a substitute for the primary MWIR file.
  // Prefer either compact science component to the whole SAFE ZIP.
  const preferred=item.collection === NTC_COLLECTION ? ['FRP_in','FRP_an','product'] : ['FRP_MWIR1km_STANDARD','product'];
  for(const name of preferred){
    const asset=item.assets?.[name];if(!asset)continue;
    const url=asset.alternate?.https?.href??(/^https:/i.test(asset.href??'')?asset.href:null),format=name==='product'||/zip/i.test(asset.type??'')?'zip':'netcdf',size=asset['file:size']??null;
    if(Number.isFinite(Number(size))&&Number(size)>50*1024*1024)continue;
    let checksumIntegrity;try{if(!url)continue;assertTrustedCdseAssetUrl(url);checksumIntegrity=normalizeContentChecksum(asset['file:checksum'],{allowMissing:false});}catch{continue;}
    return{name,url,format,mediaType:asset.type??(format==='zip'?'application/zip':'application/netcdf'),size,checksum:asset['file:checksum'],checksumIntegrity};
  }
  return null;
}

function platform(item) { return String(item.properties?.platform ?? item.id?.slice(0, 3) ?? 'Sentinel-3'); }
function observedAt(item) { return item.properties?.datetime ?? item.properties?.start_datetime ?? null; }
function validDate(value) { const date=new Date(value); return Number.isFinite(date.getTime()) ? date : null; }

export function summarizeCdseFrpItem(item) {
  const asset=itemAsset(item);
  return {
    id:item.id,
    platform:platform(item),
    observedAt:observedAt(item),
    startAt:item.properties?.start_datetime ?? observedAt(item),
    endAt:item.properties?.end_datetime ?? observedAt(item),
    bbox:Array.isArray(item.bbox) ? item.bbox.map(Number) : null,
    collection:item.collection ?? NRT_COLLECTION,
    asset:asset ? { name:asset.name,format:asset.format,mediaType:asset.mediaType,size:asset.size,checksum:asset.checksum,checksumIntegrity:asset.checksumIntegrity } : null,
    officialItemUrl:item.links?.find((link) => link.rel === 'self')?.href ?? null
  };
}

export class CdseFrpAcquirer {
  constructor({ username='', password='', accessToken='', acquisitionStore, fetchImpl=null,requestImpl=https.request,resolveHost=(hostname)=>lookup(hostname,{all:true,verbatim:true}), timeoutMs=20_000, userAgent='VIGIA/10.0', pythonBinary='python3', clock=()=>new Date(), tempRoot=path.join(process.cwd(),'.tmp','sentinel3'), searchStart='', searchEnd='', lookbackHours=DEFAULT_LOOKBACK_HOURS, maxProducts=8, collection=NRT_COLLECTION } = {}) {
    const transport=fetchImpl??createPinnedHttpsFetch({resolveHost,requestImpl,timeoutMs});
    Object.assign(this, { username, password, accessToken, acquisitionStore, fetchImpl:transport, timeoutMs, userAgent, pythonBinary, clock, tempRoot, searchStart, searchEnd, lookbackHours, maxProducts, collection:collectionName(collection) });
    this.acquirer = acquisitionStore ? new HttpAcquirer({ store:acquisitionStore, fetchImpl:transport, timeoutMs, userAgent, clock }) : null;
    this.cachedToken = accessToken || '';
    this.tokenPromise = null;
  }
  configured() { return Boolean(this.accessToken || (this.username && this.password)); }
  async catalogue({ start=this.searchStart, end=this.searchEnd, lookbackHours=this.lookbackHours, limit=DEFAULT_LIMIT, collection=this.collection } = {}) {
    const endDate=validDate(end) ?? this.clock();
    const startDate=validDate(start) ?? new Date(endDate.getTime() - Math.max(1,Number(lookbackHours)||DEFAULT_LOOKBACK_HOURS) * 3_600_000);
    if(startDate.getTime()>endDate.getTime())throw new Error('cdse_catalogue_invalid_time_window');
    const requestWindow={ aoi:PORTUGAL, collection:collectionName(collection), start:startDate.toISOString(), end:endDate.toISOString() };
    const payload = await postJson(CATALOGUE, { collections:[requestWindow.collection], bbox:PORTUGAL, datetime:`${requestWindow.start}/${requestWindow.end}`, limit:Math.max(1,Math.min(100,Number(limit)||DEFAULT_LIMIT)), sortby:[{ field:'datetime', direction:'desc' }] }, { fetchImpl:this.fetchImpl, timeoutMs:this.timeoutMs, userAgent:this.userAgent });
    const items=(payload.features ?? []).filter((item) => itemAsset(item));
    return { items, products:items.map(summarizeCdseFrpItem), requestWindow, cataloguedAt:this.clock().toISOString() };
  }
  async acquire(options={}) {
    if (!this.configured()) throw new Error('cdse_credentials_required');
    if (!this.acquirer) throw new Error('cdse_acquisition_store_required');
    const token = await this.#token();
    const catalogue = options.catalogueResult ?? await this.catalogue(options);
    const selectedIds=new Set((options.productIds??[]).map(String)),available=selectedIds.size?catalogue.items.filter((item)=>selectedIds.has(String(item.id))):catalogue.items;
    const items = available.slice(0,Math.max(1,Number(options.maxProducts??this.maxProducts)||8));
    const outputs = [],failures=[],selectionMode=options.selectionMode??(this.searchStart||this.searchEnd||options.start||options.end||catalogue.requestWindow.collection===NTC_COLLECTION?'governed_window':'current_recent');
    for (const item of items) {
      const asset = itemAsset(item); if (!asset) continue;
      try{const result = await this.acquirer.acquire({
        sourceId:`sentinel3:${catalogue.requestWindow.collection.endsWith('-ntc')?'ntc':'nrt'}:${platform(item)}`, provider:'copernicus-data-space', url:asset.url,
        archiveUri:item.links?.find((link) => link.rel === 'self')?.href ?? `cdse-stac:${item.id}`,
        accept:`${asset.mediaType},application/octet-stream`, headers:{ authorization:`Bearer ${token}` },
        validateUrl:assertTrustedCdseAssetUrl, maxBytes:50*1024*1024,
        expectedChecksum:asset.checksum,
        parserVersion:'sentinel3-sl2-frp-netcdf-v3', requestWindow:{ ...catalogue.requestWindow, itemId:item.id, asset:asset.name, assetChecksum:asset.checksum, assetChecksumAlgorithm:asset.checksumIntegrity.algorithm, assetChecksumDigest:asset.checksumIntegrity.digest, assetChecksumStrength:asset.checksumIntegrity.strength, platform:platform(item), sourceTimestamp:observedAt(item), sensingStartAt:item.properties?.start_datetime??observedAt(item), sensingEndAt:item.properties?.end_datetime??observedAt(item), providerDiscoveredAt:catalogue.cataloguedAt, selectionMode },
        licenceMetadata:{ state:'provider_terms_apply', provider:'Copernicus Data Space Ecosystem' },
        parse:async(_text, raw) => {
          const parsed = await parseBody(raw.body, this.pythonBinary, this.tempRoot, asset);
          if (!parsed.ok) throw new Error(parsed.error ?? 'sentinel3_frp_parse_failed');
          return { value:parsed, sourceTimestamp:observedAt(item), sourceTimestampRange:{ start:item.properties?.start_datetime ?? observedAt(item), end:item.properties?.end_datetime ?? observedAt(item) }, providerProductId:`${item.id}:${asset.name}`, normalizerVersion:'sentinel3-slstr-frp-v3' };
        }
      });
      outputs.push({ item, parsed:result.value, rawSourceProduct:result.rawSourceProduct, duplicate:result.duplicate, acquisitionTimings:result.acquisitionTimings });}
      catch(error){failures.push({itemId:item.id,platform:platform(item),error:String(error.message??error)});if(options.failFast)throw error;}
    }
    return { ...catalogue, items, outputs, failures, selectionMode };
  }
  async #token() {
    if (this.cachedToken) return this.cachedToken;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise=(async()=>{
      const body = new URLSearchParams({ client_id:'cdse-public', username:this.username, password:this.password, grant_type:'password' });
      const response=await fetchRaw(TOKEN_URL,{fetchImpl:this.fetchImpl,method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body,timeoutMs:this.timeoutMs,userAgent:this.userAgent,maxBytes:1024*1024});
      if (!response.ok) throw new Error(`cdse_auth_http_${response.status}`);
      let value;try{value=JSON.parse(response.body.toString('utf8'));}catch{throw new Error('cdse_auth_invalid_json');}
      if (!value.access_token) throw new Error('cdse_access_token_missing');
      this.cachedToken=value.access_token;return this.cachedToken;
    })();
    try{return await this.tokenPromise;}finally{this.tokenPromise=null;}
  }
}

export const CDSE_FRP_COLLECTION = NRT_COLLECTION;
export const CDSE_FRP_NTC_COLLECTION = NTC_COLLECTION;
export const CDSE_FRP_COLLECTIONS = Object.freeze([...COLLECTIONS]);
export const CDSE_PORTUGAL_BBOX = Object.freeze([...PORTUGAL]);
