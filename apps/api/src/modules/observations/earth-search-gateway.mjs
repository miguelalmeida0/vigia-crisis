import { postJson } from '../../shared/fetch.mjs';
import { bboxAround } from '../../../../../packages/domain/src/geo.mjs';
import { EARTH_SEARCH_RASTER_HOSTS, rasterAssetUrl } from './raster-asset-broker.mjs';

function daysAgo(days, clock) { return new Date(clock().getTime() - days * 86_400_000).toISOString(); }
function assetHref(item, keys,{raster=false}={}) { for (const key of keys) { const href=item?.assets?.[key]?.href; if(typeof href!=='string')continue;if(raster){const safe=rasterAssetUrl(href,{allowedHosts:EARTH_SEARCH_RASTER_HOSTS});if(safe)return safe;}else if(href.startsWith('https://'))return href; } return null; }
function normalize(item) {
  const bbox=Array.isArray(item?.bbox)?item.bbox.slice(0,4).map(Number):null; if(!bbox?.every(Number.isFinite))return null;
  const properties=item.properties??{}; const thumbnail=assetHref(item,['thumbnail','rendered_preview','preview']); const visualCog=assetHref(item,['visual','red'],{raster:true});
  const gridId=[properties['mgrs:utm_zone'],properties['mgrs:latitude_band'],properties['mgrs:grid_square']].filter((value)=>value!==undefined&&value!==null&&String(value)!=='').join('');
  return { id:String(item.id), sensor:'Sentinel-2', source:'Element 84 Earth Search / AWS Open Data', acquiredAt:properties.datetime??properties.start_datetime??null, cloudCover:Number.isFinite(Number(properties['eo:cloud_cover']))?Number(properties['eo:cloud_cover']):null, bbox, coordinate:[(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2], gridId:gridId||null, previewUrl:thumbnail, visualCogUrl:visualCog, redCogUrl:assetHref(item,['red'],{raster:true}), nirCogUrl:assetHref(item,['nir'],{raster:true}), swir16CogUrl:assetHref(item,['swir16'],{raster:true}), swir22CogUrl:assetHref(item,['swir22'],{raster:true}), sclCogUrl:assetHref(item,['scl','SCL'],{raster:true}),rasterAssetHosts:EARTH_SEARCH_RASTER_HOSTS, resolutionMeters:10, kind:'optical', browseQuality:thumbnail?'browse':'metadata_only', renderProduct:thumbnail?'browse_preview':'metadata_only' };
}
export class EarthSearchGateway {
  constructor({ fetchImpl=globalThis.fetch, timeoutMs=14_000, userAgent='VIGIA/9.0', clock=()=>new Date() }={}) { this.options={fetchImpl,timeoutMs,userAgent}; this.clock=clock; }
  async scenes({ coordinate, radiusKm=12 }) {
    // A single 400-day result page is dominated by recent Sentinel-2 passes
    // and can silently omit the prior-season comparator. Query the current
    // and annual windows independently, then merge by immutable scene ID.
    const base={ collections:['sentinel-2-l2a'], bbox:bboxAround(coordinate,radiusKm), query:{'eo:cloud_cover':{lt:35}}, sortby:[{field:'properties.datetime',direction:'desc'}] };
    const current={...base,datetime:`${daysAgo(120,this.clock)}/${this.clock().toISOString()}`,limit:48};
    const annual={...base,datetime:`${daysAgo(430,this.clock)}/${daysAgo(300,this.clock)}`,limit:48};
    const responses=await Promise.allSettled([
      postJson('https://earth-search.aws.element84.com/v1/search',current,this.options),
      postJson('https://earth-search.aws.element84.com/v1/search',annual,this.options)
    ]);
    const scenes=responses.flatMap((entry)=>entry.status==='fulfilled'?(entry.value.features??[]):[]).map(normalize).filter(Boolean);
    return [...new Map(scenes.map((scene)=>[scene.id,scene])).values()].sort((a,b)=>Date.parse(b.acquiredAt)-Date.parse(a.acquiredAt));
  }
}
