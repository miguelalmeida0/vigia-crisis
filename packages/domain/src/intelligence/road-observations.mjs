import {hash,validPoint} from './world-knowledge.mjs';
const key=v=>String(v??'').toUpperCase().replace(/^EN\s*/,'N').replace(/\s+/g,'');
const iso=v=>typeof v==='number'&&Number.isFinite(v)?new Date(v).toISOString():null;
export function ipRoadObservations(data,source,knownAt){
 if(data.error||!Array.isArray(data.features)||data.exceededTransferLimit)throw new Error('road_source_incomplete_response');
 return data.features.flatMap(f=>{
  const a=f.attributes??{},point=[f.geometry?.x,f.geometry?.y],observedAt=iso(a.dataobservacao),start=iso(a.datainicio),end=iso(a.datafim);
  if(!validPoint(point)||!observedAt||Date.parse(observedAt)>Date.parse(knownAt)||!a.objectid||!a.description)return [];
  const rawState=String(a.estado).toLowerCase(),text=String(a.commentsummary??''),closed=/cortad[oa]|interdit[oa]|corte (?:total|da|do)/i.test(text);
  // ArcGIS objectids rotate when IP republishes an otherwise unchanged feed.
  // Preserve that raw identifier as provenance, not operational identity.
  const {objectid,...semantic}=a,id='ip-road:'+source.layer+':'+hash([key(a.description),point,start??observedAt,a.direction??null,a.pkbegin??null]).slice(0,32);
  return [{id,revision:hash(semantic),roadRef:key(a.description),geometry:{type:'Point',coordinates:point},geometryMeaning:'Published occurrence point; not the extent of a closed road segment',restrictionType:closed?'CLOSED':/Works/.test(a.tipo)?'ROADWORKS':a.tipo==='Accident'?'INCIDENT':'RESTRICTED',state:rawState==='ativo'?(closed?'CLOSED':'RESTRICTED'):'INACTIVE',direction:a.direction??null,observedAt,publishedAt:observedAt,knownAt,ingestedAt:knownAt,validFrom:start??observedAt,validUntil:end,providerActive:rawState==='ativo',summary:text,municipality:a.concelho??null,district:a.distrito??null,kilometre:a.pkbegin??null,source:{...source,recordId:String(a.objectid)},admitted:true,admissionRule:'OFFICIAL_IP_PUBLISHED_OCCURRENCE',raw:a}];
 });
}
export function pointRouteDistanceM(point,line){
 if(!validPoint(point)||line?.type!=='LineString'||!Array.isArray(line.coordinates)||line.coordinates.length<2)return Infinity;
 const scale=Math.cos(point[1]*Math.PI/180),xy=p=>[(p[0]-point[0])*111320*scale,(p[1]-point[1])*110540];let best=Infinity;
 for(let i=1;i<line.coordinates.length;i++){const a=xy(line.coordinates[i-1]),b=xy(line.coordinates[i]),dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));}return best;
}
export function roadObservationApplies(report,route){
 const refs=new Set((route.roads??[]).flatMap(r=>typeof r==='string'?[r]:[r.ref,r.name]).filter(Boolean).flatMap(v=>v.split(';')).map(key));
 if(!refs.has(key(report.roadRef??report.name)))return false;
 // Existing explicitly admitted road-wide notices retain their contract.
 if(!report.geometry)return report.admissionRule!=='OFFICIAL_IP_PUBLISHED_OCCURRENCE';
 if(report.geometry.type!=='Point')return false;
 // IP increasing/decreasing directions cannot be inferred from OSRM compass
 // bearings. Keep those observations visible, without a confirmed route hit.
 if(report.direction&&!/^(ambos|both)$/i.test(report.direction))return false;
 return pointRouteDistanceM(report.geometry.coordinates,route.geometry)<=75;
}
