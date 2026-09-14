import {roadKey,scenario,compareSituations,evaluateRouteAlternatives} from './situation-model.mjs';

export const significantRoads=route=>[...new Set((route?.roads??[]).flatMap(r=>[r.ref,r.name].filter(Boolean).flatMap(v=>roadKey(v).split(';')).map(v=>v.trim())).filter(v=>/^(?:A|N|IP|IC|EM|CM)\d+(?:-\d+)?$/.test(v)))];
const qualified=(f,key)=>!f.unavailable&&f.fields?.['capabilities.'+key]?.state==='RESOLVED'&&f.capabilities?.[key]===true;
const categories={
  emergency_hospital:{label:'Verified emergency hospital',accept:f=>f.canonicalType==='hospital'&&qualified(f,'emergencyDepartment')},
  fire_response:{label:'Verified fire-response facility',accept:f=>f.canonicalType==='fire_station'&&qualified(f,'fireResponse')},
  civil_protection:{label:'Civil protection',accept:f=>!f.unavailable&&f.canonicalType==='civil_protection'&&f.fields?.canonicalType?.state==='RESOLVED'},
  official_refuge:{label:'Officially designated refuge',accept:f=>!f.unavailable&&f.canonicalType==='official_wildfire_refuge'&&f.fields?.['designation.kind']?.state==='RESOLVED'&&!!f.designation?.kind},
  designated_reception:{label:'Designated reception location',accept:f=>!f.unavailable&&['temporary_reception_center','official_wildfire_refuge'].includes(f.canonicalType)&&f.fields?.['designation.kind']?.state==='RESOLVED'&&!!f.designation?.kind},
  active_reception:{label:'Current reception activation',accept:(f,s)=>!f.unavailable&&f.fields?.['activation.state']?.state==='RESOLVED'&&s.rankings.activeReception.includes(f.id)},
};
const usable=r=>r?.state==='CALCULATED'&&Number.isFinite(r.travelTimeMinutes)&&Number.isFinite(r.distanceKm);
export function accessResilience(s,{at=s.knownAt}={}){
  const facilities=s.facilities.map(f=>{const fields={...f.fields};for(const [key,rows]of Object.entries(f.provenance??{}))if(rows.length&&!rows.some(p=>(!p.retrievedAt||Date.parse(p.retrievedAt)<=Date.parse(at))&&(!p.validFrom||Date.parse(p.validFrom)<=Date.parse(at))&&(!p.validUntil||Date.parse(p.validUntil)>Date.parse(at))))fields[key]={...fields[key],state:'STALE'};return {...f,fields};});
  const groups=Object.entries(categories).map(([id,c])=>{
    const qualifiedFacilities=facilities.filter(f=>c.accept(f,s)).sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id));
    const options=qualifiedFacilities.flatMap(f=>{const r=s.routes.find(r=>r.facilityId===f.id&&usable(r)&&Date.parse(r.calculatedAt)<=Date.parse(at)&&Date.parse(r.validUntil)>Date.parse(at));return r?[{facilityId:f.id,name:f.canonicalName,distanceKm:f.distanceKm,routeId:r.id,minutes:r.travelTimeMinutes,roadDistanceKm:r.distanceKm,direction:r.direction,roads:significantRoads(r),calculatedAt:r.calculatedAt,validUntil:r.validUntil,roadInformation:r.roadInformation,source:r.source,evidence:f.evidence,contact:f.contact,authority:f.authority,alternativeRoutes:(r.alternatives??[]).filter(a=>Number.isFinite(a.travelTimeMinutes)).length}]:[];}).sort((a,b)=>a.minutes-b.minutes||a.facilityId.localeCompare(b.facilityId));
    const alternativeCount=Math.max(0,options.length-1);
    return {id,label:c.label,qualifiedCount:qualifiedFacilities.length,qualifiedIds:qualifiedFacilities.map(f=>f.id),options,primary:options[0]??null,secondary:options[1]??null,alternativeCount,redundancy:alternativeCount===0?'NO_RETAINED_ALTERNATIVE':alternativeCount===1?'ONE_RETAINED_ALTERNATIVE':'MULTIPLE_RETAINED_ALTERNATIVES',sharedSegments:options[0]?.roads.filter(r=>options[1]?.roads.includes(r))??[],basis:'LOWEST_RETURNED_QUALIFIED_ROUTE_ETA'};
  });
  const relevant=new Map();for(const g of groups)for(const o of g.options)if(!relevant.has(o.routeId))relevant.set(o.routeId,{...o,categories:[g.id]});else relevant.get(o.routeId).categories.push(g.id);
  const roadMap=new Map();for(const o of relevant.values())for(const road of o.roads){const rows=roadMap.get(road)??[];rows.push(o);roadMap.set(road,rows);}
  const corridors=[...roadMap].filter(([,rows])=>rows.length>1).map(([road,routes])=>({road,routeCount:routes.length,facilityIds:routes.map(r=>r.facilityId),routes,label:'Shared access dependency',explanation:`${routes.length} currently qualified calculated routes use ${road}.`})).sort((a,b)=>b.routeCount-a.routeCount||a.road.localeCompare(b.road));
  const holes=groups.flatMap(g=>!g.qualifiedCount?[{category:g.id,kind:'NO_RETAINED_QUALIFICATION',text:`No ${g.label.toLowerCase()} is verified in the returned incident facilities.`}]:!g.options.length?[{category:g.id,kind:'NO_CURRENT_CALCULATED_ROUTE',text:`No current calculated route is retained for the ${g.qualifiedCount} returned ${g.label.toLowerCase()} options.`}]:g.options.every(o=>o.roadInformation.state!=='NO_INGESTED_RESTRICTION')?[{category:g.id,kind:'ROAD_INFORMATION_INCOMPLETE',text:`Road information does not establish an unrestricted ingested state for the returned ${g.label.toLowerCase()} routes.`}]:[]);
  return {snapshotId:s.id,knownAt:s.knownAt,groups,corridors,holes,scope:{facilityCount:s.facilities.length,maxReturnedDistanceKm:s.facilities.length?Math.max(...s.facilities.map(f=>f.distanceKm)):null,completeSearchRadiusKm:null},limitation:'Returned facilities and retained calculated routes only. Missing qualification is not proof that a facility does not exist. Road estimates do not establish current reachability.'};
}
export function routeIntelligence(s,id,{at=s.knownAt}={}){
  const facility=s.facilities.find(f=>f.id===id);if(!facility)return {state:'NOT_IN_INCIDENT'};
  const retained=s.routes.find(r=>r.facilityId===id),route=retained?evaluateRouteAlternatives(retained.normalRoute??retained,{restrictions:s.roadReports,roadCoverage:s.roadCoverage},at):null,access=accessResilience(s,{at}),groups=access.groups.filter(g=>g.qualifiedIds.includes(id));
  return {state:'AVAILABLE',snapshotId:s.id,knownAt:s.knownAt,facility,route,majorRoads:significantRoads(route),alternatives:groups.map(g=>({category:g.label,facility:g.options.find(o=>o.facilityId!==id)??null})),sharedDependencies:access.corridors.filter(c=>c.facilityIds.includes(id)),limitation:access.limitation};
}
export function failureAnalysis(s,assumption){
  const simulated=scenario(s,assumption),before=accessResilience(s),after=accessResilience(simulated.snapshot);
  const routes=s.routes.flatMap(r=>{const next=simulated.snapshot.routes.find(n=>n.id===r.id);if(!next||JSON.stringify([r.state,r.geometry])===JSON.stringify([next.state,next.geometry]))return[];return [{routeId:r.id,facilityId:r.facilityId,name:s.facilities.find(f=>f.id===r.facilityId)?.canonicalName,previousMinutes:r.travelTimeMinutes,minutes:usable(next)?next.travelTimeMinutes:null,extraMinutes:usable(next)&&Number.isFinite(r.travelTimeMinutes)?next.travelTimeMinutes-r.travelTimeMinutes:null,state:next.state,alternativeRetained:usable(next)}];});
  return {...simulated,resilience:{routes,categories:before.groups.map(g=>{const next=after.groups.find(n=>n.id===g.id);return {category:g.label,previous:g.primary,current:next.primary,previousOptions:g.options.length,currentOptions:next.options.length,redundancyLost:g.options.length>=2&&next.options.length<2};}),before,after},label:'Scenario — not observed reality'};
}

// Fingerprints compare retained observations; they neither estimate missing values nor predict outcomes.
export function incidentFingerprint(s){
  const observed=s.incident.observedAt??s.incident.startedAt??null,date=observed?new Date(observed):null,valid=date&&Number.isFinite(date.getTime());
  const metric=key=>Number.isFinite(s.weather?.[key]?.value)?{value:s.weather[key].value,observedAt:s.weather[key].observedAt,source:s.weather.station?.name}:null;
  const settlements=s.places.filter(p=>p.kind==='settlement'&&Number.isFinite(p.distanceM));
  const access=accessResilience(s),support={};
  for(const id of ['emergency_hospital','fire_response','designated_reception']){
    const g=access.groups.find(g=>g.id===id);
    // Missing acquisition is missing comparison evidence, not zero coverage.
    support[id]=g.options.length?{qualified:g.qualifiedCount,options:g.options.length,minutes:g.primary.minutes,sharedCorridors:g.sharedSegments.length}:null;
  }
  return {support,incidentId:s.incident.id,observedAt:observed,region:s.incident.district??s.incident.municipality??null,month:valid?date.getUTCMonth()+1:null,hour:valid?date.getUTCHours():null,wind:metric('windSpeed'),temperature:metric('temperature'),humidity:metric('humidity'),nearestSettlementKm:settlements.length?Math.min(...settlements.map(p=>p.distanceM))/1000:null,majorRoadCount:new Set(s.routes.flatMap(significantRoads)).size,fireStationCount:s.facilities.filter(f=>f.canonicalType==='fire_station').length,admittedPerimeter:!!s.perimeter?.geometry};
}
export function historicalAnalogs(current,candidates){
  const a=incidentFingerprint(current),matches=[];
  for(const s of candidates){if(s.incident.id===current.incident.id||s.universe!==current.universe||Date.parse(s.knownAt)>Date.parse(current.knownAt))continue;const b=incidentFingerprint(s);if(!b.observedAt||!a.observedAt||Date.parse(b.observedAt)>=Date.parse(a.observedAt))continue;
    const similar=[],different=[],missing=[];
    for(const [key,label,tolerance]of [['wind','wind speed',5],['temperature','temperature',3],['humidity','humidity',10]]){if(!a[key]||!b[key])missing.push(label);else(Math.abs(a[key].value-b[key].value)<=tolerance?similar:different).push({attribute:label,current:a[key],historical:b[key],tolerance});}
    if(a.region&&b.region)(a.region===b.region?similar:different).push({attribute:'reported area',current:a.region,historical:b.region});else missing.push('reported area');
    if(a.nearestSettlementKm!==null&&b.nearestSettlementKm!==null)(Math.abs(a.nearestSettlementKm-b.nearestSettlementKm)<=2?similar:different).push({attribute:'returned settlement proximity',current:a.nearestSettlementKm,historical:b.nearestSettlementKm,tolerance:2});else missing.push('settlement proximity');
    different.push(...(a.admittedPerimeter!==b.admittedPerimeter?[{attribute:'admitted perimeter available',current:a.admittedPerimeter,historical:b.admittedPerimeter}]:[]));
    for(const category of ['emergency_hospital','fire_response','designated_reception']){
      const x=a.support[category],y=b.support[category],label=category.replaceAll('_',' ');
      if(!x||!y){missing.push(label+' access topology');continue;}
      for(const [key,title,tolerance]of [['qualified','qualified facilities',0],['options','calculated options',0],['minutes','primary calculated minutes',5],['sharedCorridors','shared primary/alternative corridors',0]]){
        (Math.abs(x[key]-y[key])<=tolerance?similar:different).push({attribute:label+' '+title,current:x[key],historical:y[key],tolerance});
      }
    }
    if(similar.length>=3)matches.push({incidentId:s.incident.id,name:s.incident.name??s.incident.id,snapshotId:s.id,knownAt:s.knownAt,similar,different,missing,fingerprint:b});
  }
  return {state:matches.length?'AVAILABLE':'INSUFFICIENT_COMPARABLE_HISTORY',matches:matches.sort((a,b)=>b.similar.length-a.similar.length||a.incidentId.localeCompare(b.incidentId)).slice(0,5),fingerprint:a,rule:'At least three comparable retained attributes within explicit tolerances; earlier incident observation and no future snapshot.',limitation:'Context from retained incidents only. Similar conditions do not imply similar evolution.'};
}
export function evolutionBetween(first,last){return !first||!last||first.incident.id!==last.incident.id||Date.parse(last.knownAt)<=Date.parse(first.knownAt)?{state:'HISTORY_UNAVAILABLE',changes:[]}:compareSituations(first,last);}
