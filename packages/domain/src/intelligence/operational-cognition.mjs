import {operationalSupport,supportComparison} from './operational-support.mjs';
import {failureAnalysis} from './access-resilience.mjs';
import {roadKey} from './situation-model.mjs';

const categories=['emergency_hospital','fire_response','civil_protection','designated_reception'];
const compactOption=o=>o?Object.fromEntries(['facilityId','routeId','name','minutes','roadDistanceKm','roads','calculatedAt','validUntil','direction','source'].map(k=>[k,o[k]]).concat([['roadInformation',o.roadInformation?{state:o.roadInformation.state,checkedAt:o.roadInformation.checkedAt,limitation:o.roadInformation.limitation}:null]])):null;
const compactGroup=g=>({id:g.id,label:g.label,qualifiedCount:g.qualifiedCount,primary:compactOption(g.primary),secondary:compactOption(g.secondary),options:g.options.map(compactOption),sharedSegments:g.sharedSegments});
const compactCommunity=c=>({id:c.id,name:c.name,coordinate:c.coordinate,municipality:c.municipality,population:c.population,distanceKm:c.distanceKm,source:c.source,receivedAt:c.receivedAt,groups:c.groups.map(compactGroup),nearbyDesignations:c.nearbyDesignations.map(f=>({id:f.id,name:f.name,distanceKm:f.distanceKm,activationConfirmed:f.activationConfirmed})),resilience:c.resilience});
export function communityResilience(c){
 const health=c.groups.find(g=>g.id==='emergency_hospital'),fire=c.groups.find(g=>g.id==='fire_response'),reasons=[];
 if(health?.options.length===1)reasons.push('Only one retained qualified emergency hospital');
 if(fire?.options.length===1)reasons.push('Only one retained qualified fire-response option');
 const shared=health?.primary?.roads.filter(r=>fire?.primary?.roads.includes(r))??[];
 if(shared.length)reasons.push('Primary hospital and fire routes share '+shared.join(', '));
 if(c.nearbyDesignations?.length&&!c.nearbyDesignations.some(f=>f.activationConfirmed))reasons.push('Nearby reception activation is unconfirmed');
 if(!health?.primary)reasons.push('No current qualified healthcare route retained');
 if(!fire?.primary)reasons.push('No current qualified fire-response route retained');
 return {id:c.id,name:c.name,reasons,sharedRoads:shared};
}
export function intelligenceGaps(s,support){
 const gaps=[];
 for(const g of support.groups.filter(g=>categories.includes(g.id))){if(!g.primary)gaps.push({category:g.label,text:'No current qualified facility route retained',state:'NOT_RETAINED'});else if(!g.secondary&&['emergency_hospital','fire_response'].includes(g.id))gaps.push({category:g.label,text:'No retained second qualified option',state:'NOT_RETAINED'});}
 if(!support.groups.find(g=>g.id==='active_reception')?.primary)gaps.push({category:'Reception',text:'No current activation confirmed',state:'NOT_RETAINED'});
 const unavailable=(s.sources??[]).filter(x=>x.state!=='CURRENT');
 if(unavailable.length)gaps.push({category:'Source coverage',text:unavailable.length+' retained sources are stale or unavailable',state:'SOURCE_UNAVAILABLE'});
 return gaps;
}
export function operationalPicture(s,{at=s.knownAt,road=null,entityId=null,communityId=null,category=null,limited=false,filter=null,before=null,historical=false}={}){
 const support=operationalSupport(s,{at}),features=[],seen=new Set(),add=(geometry,properties)=>{if(!geometry)return;const key=JSON.stringify([geometry,properties]);if(!seen.has(key)){features.push({type:'Feature',geometry,properties});seen.add(key);}};
 const allRoutes=[...s.routes,...s.communityRoutes??[]],communityRows=support.communities.map(c=>({...c,resilience:communityResilience(c)}));
 const eligible=c=>filter==='SINGLE_HEALTHCARE'?c.groups.find(g=>g.id==='emergency_hospital')?.options.length===1:filter==='SINGLE_FIRE'?c.groups.find(g=>g.id==='fire_response')?.options.length===1:!limited||c.resilience.reasons.length>0;
 const important=new Set([...communityRows.filter(c=>c.groups.some(g=>g.primary)).slice(0,6),...communityRows.slice(0,6)].map(c=>c.id));
 const match=o=>(!category||o.category===category)&&(!entityId||o.facilityId===entityId)&&(!road||o.roads.includes(roadKey(road)));
 const qualified=[];
 for(const subject of [{id:s.incident.id,name:s.incident.name,groups:support.groups},...communityRows])for(const g of subject.groups.filter(g=>categories.includes(g.id))){
  if(communityId&&subject.id!==communityId)continue;
  if(filter&&!communityRows.find(c=>c.id===subject.id&&eligible(c)))continue;
  if(limited&&!communityRows.find(c=>c.id===subject.id)?.resilience.reasons.length)continue;
  for(const o of g.options.slice(0,category?50:2)){const row={...o,category:g.id,subjectId:subject.id};if(!match(row))continue;qualified.push(row);const r=allRoutes.find(r=>r.id===o.routeId),f=s.facilities.find(f=>f.id===o.facilityId);
   add(r?.geometry,{kind:'route',state:'retained',entityId:o.facilityId,subjectId:subject.id,road:o.roads[0]??'',name:o.name,category:g.id,calculatedAt:o.calculatedAt});
   if(f)add({type:'Point',coordinates:f.coordinate},{kind:'facility',entityId:f.id,name:f.canonicalName,category:g.id});
  }
 }
 add({type:'Point',coordinates:s.incident.coordinate},{kind:'incident',entityId:s.incident.id,name:s.incident.name});
 add(s.perimeter?.geometry,{kind:'admitted',name:'Admitted perimeter'});
 for(const c of communityRows){if(!c.coordinate||communityId&&c.id!==communityId||!eligible(c)||!category&&!road&&!entityId&&!communityId&&!limited&&!filter&&!important.has(c.id))continue;
  if((road||entityId)&&!qualified.some(o=>o.subjectId===c.id))continue;
  const g=c.groups.find(g=>g.id===category),minutes=g?.primary?.minutes??null,bands=category==='fire_response'?[10,20]:[15,30];
  const band=category==='designated_reception'?(c.nearbyDesignations.some(f=>f.activationConfirmed)?'activation_confirmed':c.nearbyDesignations.length?'activation_unconfirmed':'no_designation'):minutes===null?'no_route':minutes<=bands[0]?'near':minutes<=bands[1]?'middle':'long';
  add({type:'Point',coordinates:c.coordinate},{kind:'community',entityId:c.id,name:c.name,band,minutes,category:category??'',reasons:c.resilience.reasons.join('; ')});
 }
 // A route geometry is never promoted to a surveyed road centerline.
 for(const o of qualified){const r=allRoutes.find(r=>r.id===o.routeId);for(const step of r?.roads??[]){if(step.geometry&&(!road||roadKey(step.ref??'')===roadKey(road)))add(step.geometry,{kind:'road',road:roadKey(step.ref),name:step.ref,state:'retained'});}}
 if(before){const old=operationalPicture(before,{at:before.knownAt,road,entityId,communityId,category,limited,filter});const retained=new Set(features.filter(f=>f.properties.kind==='route').map(f=>JSON.stringify([f.properties.entityId,f.properties.subjectId,f.geometry])));
  for(const f of old.features.filter(f=>f.properties.kind==='route'))if(!retained.has(JSON.stringify([f.properties.entityId,f.properties.subjectId,f.geometry]))){add(f.geometry,{...f.properties,state:'lost'});for(const point of old.features.filter(p=>p.geometry.type==='Point'&&[f.properties.entityId,f.properties.subjectId].includes(p.properties.entityId)))add(point.geometry,{...point.properties,state:'affected'});}
 }
 if(historical)for(const o of s.thermal??[]){const coordinate=o.coordinate??o.geometry?.coordinates;if(Array.isArray(coordinate)&&coordinate.length===2&&coordinate.every(Number.isFinite))add({type:'Point',coordinates:coordinate},{kind:'thermal',name:'Thermal observation',observedAt:o.observedAt});}
 const corridorRows=support.corridors.map(c=>({...c,roadInformation:{state:s.roadCoverage?.state??'UNAVAILABLE',checkedAt:s.roadCoverage?.checkedAt??null,restrictions:(s.roadReports??[]).filter(r=>roadKey(r.roadRef??r.road??'')===c.road).map(r=>({state:r.state,observedAt:r.observedAt,validUntil:r.validUntil})),limitation:'Partial source coverage; no matched restriction is not proof that a road is open.'}}));
 return {schemaVersion:'vigia.operational-picture.v1',snapshotId:s.id,knownAt:s.knownAt,evaluatedAt:at,universe:s.universe??'CURRENT_RETAINED',incident:s.incident,weather:s.weather,support:{groups:support.groups.map(compactGroup),corridors:corridorRows,notices:support.notices},communities:communityRows.filter(eligible).map(compactCommunity),gaps:intelligenceGaps(s,support),features,selection:{road,entityId,communityId,category,limited,filter},limitation:'Calculated facility-to-subject paths; partial road information. Named corridors are not proof of a shared physical segment.'};
}
export function stressSupport(s){
 const support=operationalSupport(s),roads=support.corridors.slice(0,6).map(c=>({kind:'ROAD_UNAVAILABLE',entityId:c.road})),facilities=support.groups.filter(g=>['emergency_hospital','fire_response'].includes(g.id)&&g.primary).map(g=>({kind:'FACILITY_UNAVAILABLE',entityId:g.primary.facilityId}));
 const cases=[...roads,...facilities].map(x=>[x]);for(const r of roads.slice(0,2))for(const f of facilities)cases.push([r,f]);
 const results=cases.slice(0,12).map(failures=>{const result=failureAnalysis(s,failures),after=operationalSupport(result.snapshot),changes=supportComparison(s,result.snapshot).changes;const lost=support.relationships.filter(r=>!after.relationships.some(a=>a.from===r.from&&a.to===r.to));return{failures,affectedRelationships:lost.length,changedSupport:changes.length,changes,noAlternative:changes.filter(c=>c.previous.options>0&&c.current.options===0),affectedCommunities:[...new Set(changes.filter(c=>c.subjectId!==s.incident.id).map(c=>c.subjectId))]};});
 return {universe:'SCENARIO',label:'Stress test — not observed reality',snapshotId:s.id,knownAt:s.knownAt,limit:12,results:results.sort((a,b)=>b.affectedRelationships-a.affectedRelationships||b.changedSupport-a.changedSupport),operationalWrites:0};
}
