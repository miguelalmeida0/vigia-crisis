import { createHash } from 'node:crypto';
import { fetchJson } from '../../../shared/fetch.mjs';

export const CMR_GRANULE_SEARCH='https://cmr.earthdata.nasa.gov/search/granules.umm_json';
export const PORTUGAL_BBOX=Object.freeze([-9.75,36.7,-6,42.3]);
export const VIIRS_ACTIVE_FIRE_COLLECTIONS=Object.freeze([
  Object.freeze({shortName:'VNP14IMG',version:'002',platform:'VIIRS S-NPP',sourceKey:'VIIRS_SNPP_ARCHIVE',independenceGroup:'viirs_s_npp',geoShortName:'VNP03IMG',geoVersion:'2'}),
  Object.freeze({shortName:'VJ114IMG',version:'002',platform:'VIIRS NOAA-20',sourceKey:'VIIRS_NOAA20_ARCHIVE',independenceGroup:'viirs_noaa_20',geoShortName:'VJ103IMG',geoVersion:'2.1'})
]);

const wait=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
const midpoint=(start,end)=>new Date((Date.parse(start)+Date.parse(end))/2).toISOString();
const round=(value,digits=3)=>Number.isFinite(value)?Number(value.toFixed(digits)):null;
const EARTHDATA_ASSET_ORIGIN='https://data.laadsdaac.earthdatacloud.nasa.gov';

export function assertTrustedEarthdataUrl(value){
  let target;
  try{target=value instanceof URL?value:new URL(value);}catch{throw new Error('earthdata_asset_url_rejected');}
  if(target.origin!==EARTHDATA_ASSET_ORIGIN||target.protocol!=='https:'||target.username||target.password||target.hash||target.href.length>4096||target.pathname.length>3072)throw new Error('earthdata_asset_url_rejected');
  return target;
}

export function pointInPolygon([longitude,latitude],polygon=[]){
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||polygon.length<3)return false;
  let inside=false;
  for(let index=0,prior=polygon.length-1;index<polygon.length;prior=index++){
    const [xi,yi]=polygon[index],[xj,yj]=polygon[prior];
    if(((yi>latitude)!==(yj>latitude))&&longitude<((xj-xi)*(latitude-yi))/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}

export function polygonEdgeDistanceKm([longitude,latitude],polygon=[]){
  if(polygon.length<3)return 0;
  const scaleX=111.32*Math.cos(latitude*Math.PI/180),scaleY=111.32;
  let minimum=Infinity;
  for(let index=0;index<polygon.length;index+=1){
    const first=polygon[index],second=polygon[(index+1)%polygon.length];
    const ax=(first[0]-longitude)*scaleX,ay=(first[1]-latitude)*scaleY,bx=(second[0]-longitude)*scaleX,by=(second[1]-latitude)*scaleY;
    const dx=bx-ax,dy=by-ay,denominator=dx*dx+dy*dy,t=denominator?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denominator)):0;
    minimum=Math.min(minimum,Math.hypot(ax+t*dx,ay+t*dy));
  }
  return Number.isFinite(minimum)?minimum:0;
}

function polygonFrom(item){
  const points=item?.umm?.SpatialExtent?.HorizontalSpatialDomain?.Geometry?.GPolygons?.[0]?.Boundary?.Points??[];
  return points.map((point)=>[Number(point.Longitude),Number(point.Latitude)]).filter((point)=>point.every(Number.isFinite));
}

function dataUrl(item){
  for(const entry of item?.umm?.RelatedUrls??[]){
    if(entry.Type!=='GET DATA')continue;
    try{return assertTrustedEarthdataUrl(entry.URL).href;}catch{}
  }
  return null;
}

export function normalizeCmrGranule(item,collection){
  const range=item?.umm?.TemporalExtent?.RangeDateTime??{},startAt=range.BeginningDateTime??null,endAt=range.EndingDateTime??startAt;
  return {
    conceptId:item?.meta?.['concept-id']??null,
    revisionId:item?.meta?.['revision-id']??null,
    nativeId:item?.meta?.['native-id']??null,
    shortName:collection.shortName,
    version:collection.version,
    platform:collection.platform,
    sourceKey:collection.sourceKey,
    independenceGroup:collection.independenceGroup,
    startAt,
    endAt,
    midpointAt:startAt&&endAt?midpoint(startAt,endAt):startAt,
    polygon:polygonFrom(item),
    downloadUrl:dataUrl(item)
  };
}

async function fetchJsonWithRetry(url,{fetchImpl=globalThis.fetch,attempts=5,timeoutMs=30_000}={}){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt+=1){
    try{
      return await fetchJson(url,{fetchImpl,timeoutMs,maxBytes:4*1024*1024,headers:{accept:'application/vnd.nasa.cmr.umm_results+json'},userAgent:'VIGIA physical-sensing gold/1'});
    }catch(error){
      lastError=error;
      const status=Number(String(error?.message??'').match(/upstream_http_(\d+)/)?.[1]);
      const transient=error?.name==='AbortError'||/timeout/i.test(String(error?.message))||status===429||status>=500;
      if(!transient||attempt===attempts-1)throw error;
      await wait(Math.min(8_000,500*2**attempt));
    }
  }
  throw lastError;
}

export async function discoverViirsGranules({collection,start,end,bbox=PORTUGAL_BBOX,fetchImpl=globalThis.fetch}={}){
  const query=new URLSearchParams({short_name:collection.shortName,version:collection.version,temporal:`${start},${end}`,bounding_box:bbox.join(','),page_size:'200'});
  const payload=await fetchJsonWithRetry(`${CMR_GRANULE_SEARCH}?${query}`,{fetchImpl});
  return (payload.items??[]).map((item)=>normalizeCmrGranule(item,collection)).filter((item)=>item.conceptId&&item.downloadUrl&&item.startAt&&item.polygon.length>=3);
}

export function chooseOpportunityGranule(reference,granules=[]){
  const alertMs=Date.parse(reference.alertAt),windowStart=Date.parse(reference.timeWindow?.start??reference.alertAt),windowEnd=Date.parse(reference.timeWindow?.end??reference.alertAt);
  const temporal=granules.filter((granule)=>Date.parse(granule.midpointAt)>=windowStart&&Date.parse(granule.midpointAt)<=windowEnd);
  const causal=temporal.filter((granule)=>Date.parse(granule.midpointAt)>=alertMs);
  const pool=causal.length?causal:[];
  const spatial=pool.filter((granule)=>pointInPolygon(reference.coordinate,granule.polygon));
  const ranked=spatial.map((granule)=>({...granule,catalogueEdgeMarginKm:round(polygonEdgeDistanceKm(reference.coordinate,granule.polygon),2)})).sort((a,b)=>b.catalogueEdgeMarginKm-a.catalogueEdgeMarginKm||Date.parse(a.midpointAt)-Date.parse(b.midpointAt));
  const selected=ranked[0]??null;
  return {
    state:selected?'ASSIGNED':pool.length?'OUTSIDE_SWATH':'NO_GRANULE',
    temporalGranules:pool.length,
    insideSwathGranules:spatial.length,
    selected,
    timeSeparationHours:selected?round((Date.parse(selected.midpointAt)-alertMs)/3_600_000,2):null
  };
}

function acquisitionStem(nativeId=''){
  const match=String(nativeId).match(/\.A(\d{7})\.(\d{4})\./);
  return match?`A${match[1]}.${match[2]}`:null;
}

export async function discoverCompanionGeolocation(activeGranule,collection,{fetchImpl=globalThis.fetch}={}){
  const start=new Date(Date.parse(activeGranule.startAt)-60_000).toISOString(),end=new Date(Date.parse(activeGranule.endAt)+60_000).toISOString();
  const query=new URLSearchParams({short_name:collection.geoShortName,version:collection.geoVersion,temporal:`${start},${end}`,page_size:'20'});
  const payload=await fetchJsonWithRetry(`${CMR_GRANULE_SEARCH}?${query}`,{fetchImpl});
  const stem=acquisitionStem(activeGranule.nativeId),candidates=(payload.items??[]).map((item)=>normalizeCmrGranule(item,{...collection,shortName:collection.geoShortName,version:collection.geoVersion})).filter((item)=>item.downloadUrl);
  const selected=candidates.find((item)=>item.downloadUrl.includes(`.${stem}.`))??null;
  return selected?{...selected,activeConceptId:activeGranule.conceptId,activeNativeId:activeGranule.nativeId}:null;
}

export function selectReportStratifiedCohort(cases=[]){
  const eligible=cases.filter((item)=>item.referenceLabel==='FIRE_POSITIVE'&&Number(item.burnedAreaHa)<10&&Number.isFinite(Date.parse(item.alertAt)));
  const byDate=new Map();
  for(const item of eligible){const date=item.alertAt.slice(0,10),rows=byDate.get(date)??[];rows.push(item);byDate.set(date,rows);}
  const months=['04','05','06','07','08','09'],selectedDates=[];
  for(const month of months){
    const best=[...byDate].filter(([date])=>date.slice(5,7)===month).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0];
    if(best)selectedDates.push(best[0]);
  }
  const supplemental=[...byDate].filter(([date])=>!selectedDates.includes(date)).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))[0];
  if(supplemental)selectedDates.push(supplemental[0]);
  const selected=new Set(selectedDates);
  return {
    selectedDates:selectedDates.sort(),
    cases:eligible.filter((item)=>selected.has(item.alertAt.slice(0,10))).sort((a,b)=>Date.parse(a.alertAt)-Date.parse(b.alertAt)||a.caseId.localeCompare(b.caseId)),
    policy:'All <10 ha ICNF-positive cases on the highest report-volume date in each month April-September, plus the highest-volume remaining date. Selection uses reference reports only and is blind to VIIRS detections.'
  };
}

export function granuleEvidenceId(granule){return `viirs-granule:${createHash('sha256').update(`${granule.conceptId}:${granule.nativeId}`).digest('hex').slice(0,20)}`;}
