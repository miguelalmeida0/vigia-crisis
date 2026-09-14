import { usable, number, dated } from './field.js';
import { displayMetric } from './physical.js';
import {value} from '../../canonicalViewModel.js';

export function primaryMetric(metric) {
  return usable(metric) && metric.value!==null && metric.value!==undefined
    && (typeof metric.value!=='number'||number(metric.value))
    && !/^(unknown|unavailable|not reported|not connected|no result)$/i.test(String(metric.value).trim());
}

export function nationalCurrentMetric(vm) {
  const count=value(vm.source,'operationalTruth')?.activeCount;
  if(!number(count)||count<0||!dated(vm.generatedAt))return null;
  return displayMetric({id:'verifiedCurrent',label:'Verified current incidents',value:count,unit:'',measurementType:'DERIVED',source:'VIGIA canonical incident projection',calculatedAt:vm.generatedAt,receivedAt:vm.generatedAt,definition:{statistic:'Backend activeCount under the current verification policy'},limitations:['Verified-current count differs from membership in an active public incident feed. Detection candidates and earlier reports are not counted as verified-current incidents.']});
}

export const namedArea=name=>Boolean(name)&&!/^[-+]?\d+(?:\.\d+)?°[NS]/i.test(name)&&!/unknown|not reported|unavailable/i.test(name);

export function currentSignals(physical={},now=Date.now()) {
  const metrics=physical.metrics??{},station=physical.station;
  const candidates=['temperature','wind','humidity','rain','fireDanger','thermalTime','warnings'].map(id=>metrics[id]);
  if(station?.name&&number(station.distanceKm)&&station.distanceKm>=0&&dated(station.observedAt)&&station.source){
    candidates.push(displayMetric({id:'stationDistance',label:'Observation station',value:station.distanceKm,unit:'km',source:station.source,sourceName:station.source,observedAt:station.observedAt,location:station.name,sourceLocation:{name:station.name},distanceToSubject:station.distanceKm,context:'Straight-line distance to the observation station; conditions at the incident may differ.'},now));
  }
  return candidates.filter(primaryMetric).slice(0,6);
}

// Shared time domain; no resampling, smoothing or interpolation of source data.
export function conditionsTrend(f) {
  const now=f.now??Date.now();
  const series=['temperature','wind','rain'].map(id=>{
    const metric=f.metrics?.[id];
    if(!primaryMetric(metric))return null;
    const samples=(metric.trend?.samples??[]).filter(s=>number(s.value)&&dated(s.at)&&Date.parse(s.at)<=now)
      .filter((s,n,all)=>all.findIndex(x=>Date.parse(x.at)===Date.parse(s.at))===n)
      .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    if(samples.length<2)return null;
    const latest=Date.parse(samples.at(-1).at),recent=samples.filter(s=>Date.parse(s.at)>=latest-3*3600000);
    if(recent.length<2)return null;
    const first=recent[0],last=recent.at(-1),delta=Number((last.value-first.value).toFixed(2));
    return {id,metric,samples:recent,current:last.value,delta,minutes:Math.round((Date.parse(last.at)-Date.parse(first.at))/60000),latest:last.at,ageMinutes:Math.max(0,Math.floor((now-Date.parse(last.at))/60000))};
  }).filter(Boolean);
  const times=[...new Set(series.flatMap(s=>s.samples.map(p=>Date.parse(p.at))))].sort((a,b)=>a-b);
  return {series,times,start:times[0],end:times.at(-1)};
}

export function rankedRoutes(f) {
  return [...(f.routes??[])].filter(r=>r.kind!=='PUBLIC_INSTITUTION'&&r.reachability?.state==='ROUTED'&&number(r.reachability.travelTimeMinutes)&&r.reachability.travelTimeMinutes>=0&&number(r.reachability.routeDistanceKm)&&r.reachability.routeDistanceKm>=0&&dated(r.reachability.checkedAt))
    .sort((a,b)=>a.reachability.travelTimeMinutes-b.reachability.travelTimeMinutes||a.reachability.routeDistanceKm-b.reachability.routeDistanceKm||String(a.id).localeCompare(String(b.id)));
}

export function nearestSupport(f) {
  return ['FIRE_STATION','WATER_POINT','POLICE','HOSPITAL','CIVIL_PROTECTION','AIR_SUPPORT_BASE','EMS_BASE','SHELTER']
    .map(kind=>[...(f.facilities?.[kind]??[])].filter(x=>number(x.distanceKm)&&x.distanceKm>=0).sort((a,b)=>a.distanceKm-b.distanceKm||String(a.id).localeCompare(String(b.id)))[0]).filter(Boolean);
}

// These are returned area labels, not inferred administrative regions. Never
// sum nearby-thermal metrics: their incident query radii can overlap.
export function regionalPriorities(vm) {
  const now=Date.parse(vm.generatedAt)||Date.now(),groups=new Map();
  for(const incident of vm.incidents??[]){
    const name=incident.region;
    if(!namedArea(name))continue;
    if(!groups.has(name))groups.set(name,{name,incidents:[],current:0,recent:0,earlier:0,latest:null});
    const group=groups.get(name),at=Date.parse(incident.observedAt);
    group.incidents.push(incident);
    if(['VERIFIED_CURRENT','DETECTION_CANDIDATE'].includes(incident.classification))group.current++;
    else if(Number.isFinite(at)&&at<=now&&now-at<=24*3600000)group.recent++;
    else group.earlier++;
    if(Number.isFinite(at)&&at<=now&&(!group.latest||at>Date.parse(group.latest)))group.latest=incident.observedAt;
  }
  return [...groups.values()].sort((a,b)=>b.current-a.current||b.recent-a.recent||(Date.parse(b.latest)||0)-(Date.parse(a.latest)||0)||b.incidents.length-a.incidents.length||a.name.localeCompare(b.name));
}
