import {readFile} from 'node:fs/promises';
import {hash,distanceKm,validPoint} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {accessResilience} from '../../../../../packages/domain/src/intelligence/access-resilience.mjs';
import {settlementObjects} from '../../../../../packages/domain/src/intelligence/operational-support.mjs';

export class CommunitySupportService{
  constructor({routingAdapter,clock=()=>new Date(),referenceUrl=new URL('../../../../../data/reference/community-intelligence/ine-evora-2021.json',import.meta.url)}){Object.assign(this,{routingAdapter,clock,referenceUrl});this.reference=null;this.attempted=false;}
  async places(input,at){
    if(!this.attempted){this.attempted=true;try{const value=JSON.parse(await readFile(this.referenceUrl,'utf8'));if(value.schemaVersion==='vigia.census-settlements.v1'&&value.sourceUrl.startsWith('https://mapas.ine.pt/')&&value.records.length<=2000)this.reference=value;}catch(error){if(error.code!=='ENOENT')throw error;}}
    const source=(this.reference?.records??[]).filter(p=>Date.parse(p.receivedAt)<=Date.parse(at)&&validPoint(p.coordinate)&&distanceKm(input.incident.coordinate,p.coordinate)<=25);
    return [...(input.places??[]).filter(p=>!String(p.id).startsWith('ine:settlement:')), ...source].slice(0,200);
  }
  async routes(input,before,at){
    if(!this.routingAdapter)return input.communityRoutes??[];
    const relevant=settlementObjects({...input,knownAt:at}).filter(p=>p.coordinate).sort((a,b)=>Number(!a.population)-Number(!b.population)||(a.distanceKm??Infinity)-(b.distanceKm??Infinity)).slice(0,6);
    const qualified=accessResilience({...input,rankings:input.rankings??{activeReception:[]},routes:input.routes??[],knownAt:at}).groups;
    const tasks=[];
    for(const place of relevant)for(const group of qualified.filter(g=>['emergency_hospital','fire_response','civil_protection','designated_reception'].includes(g.id))){
      const facilities=input.facilities.filter(f=>group.qualifiedIds.includes(f.id)).sort((a,b)=>distanceKm(place.coordinate,a.coordinate)-distanceKm(place.coordinate,b.coordinate)).slice(0,2);
      for(const facility of facilities)if(!tasks.some(t=>t.place.id===place.id&&t.facility.id===facility.id))tasks.push({place,facility,priority:['emergency_hospital','fire_response'].includes(group.id)?0:1});
    }
    const results=[],pending=[];
    for(const task of tasks){
      const id='community-route:'+hash([task.place.id,task.facility.id]),old=(input.communityRoutes??before?.communityRoutes??[]).find(r=>r.id===id);
      if(old&&hash(old.subjectCoordinate)===hash(task.place.coordinate)&&hash(old.facilityCoordinate)===hash(task.facility.coordinate)&&Date.parse(old.retryAfter??old.validUntil)>Date.parse(at))results.push(old);else pending.push({...task,id});
    }
    pending.sort((a,b)=>a.priority-b.priority||Number((input.communityRoutes??[]).some(r=>r.id===a.id))-Number((input.communityRoutes??[]).some(r=>r.id===b.id)));
    this.pendingCount=Math.max(0,pending.length-4);
    // At most four network requests per worker tick, two concurrent. Reads never route.
    let cursor=0;const work=async()=>{while(cursor<Math.min(4,pending.length)){const {place,facility,id}=pending[cursor++],value=await this.routingAdapter.route(place.coordinate,facility,{}),reach=value.reachability,r=reach?.currentRoute;
      results.push({id,settlementId:place.id,facilityId:facility.id,direction:'FACILITY_TO_SETTLEMENT',...(r??{geometry:null,roads:[],travelTimeMinutes:null,distanceKm:null}),calculatedAt:reach?.checkedAt??at,validUntil:new Date(Date.parse(at)+300000).toISOString(),retryAfter:r?null:new Date(Date.parse(at)+60000).toISOString(),source:reach?.source??null,subjectCoordinate:place.coordinate,facilityCoordinate:facility.coordinate,alternatives:reach?.alternativeRoute?[reach.alternativeRoute]:[],reason:r?null:'No route returned by provider.'});
    }};await Promise.all([work(),work()]);
    const ids=new Set(results.map(r=>r.id));for(const old of input.communityRoutes??before?.communityRoutes??[])if(!ids.has(old.id)&&tasks.some(t=>t.place.id===old.settlementId&&t.facility.id===old.facilityId))results.push(old);
    return results.slice(0,48);
  }
}
