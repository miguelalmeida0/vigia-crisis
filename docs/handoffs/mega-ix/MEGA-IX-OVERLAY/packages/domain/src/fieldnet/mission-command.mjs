import { pointRouteDistanceM, roadObservationApplies } from '../intelligence/road-observations.mjs';
import { operationalSupport } from '../intelligence/operational-support.mjs';
export const REPORT_TYPES = Object.freeze({ ROAD_BLOCKED:'Road blocked', ROAD_PARTIAL:'Road partially blocked', FIRE:'Fire observed', SMOKE:'Smoke observed', DAMAGE:'Damaged infrastructure', WATER_AVAILABLE:'Water available', WATER_UNAVAILABLE:'Water unavailable', RECEPTION:'Reception centre status', FACILITY_UNAVAILABLE:'Facility unavailable', COMMS:'Communications problem', CUSTOM:'Custom observation' });
export const SERVICES = Object.freeze({ emergency_hospital:'emergency healthcare', fire_response:'fire response', designated_reception:'reception' });
export const validPoint = p => Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const fresh = (end, now) => Number.isFinite(Date.parse(end))&&Date.parse(end)>Date.parse(now);
const roadNames = r => (r?.roads??[]).map(v=>typeof v==='string'?v:v.ref??v.name).filter(Boolean);
export function missionCatalog(snapshot, at) {
  if (!snapshot) return [];
  const support=operationalSupport(snapshot,{at});
  return [{id:snapshot.incident.id,name:snapshot.incident.name,coordinate:snapshot.incident.coordinate,groups:support.groups,routes:snapshot.routes??[]},...support.communities].map(subject=>({
    id:subject.id,name:subject.name,coordinate:subject.coordinate,
    services:Object.keys(SERVICES).map(id=>{ const group=subject.groups.find(g=>g.id===id); return {id,label:SERVICES[id],routes:(group?.options??[]).flatMap(o=>{
      const route=subject.routes.find(r=>r.id===o.routeId), facility=snapshot.facilities.find(f=>f.id===o.facilityId);
      const primary={id:o.routeId,facilityId:o.facilityId,name:o.name,minutes:o.minutes,distanceKm:route?.distanceKm??null,roads:o.roads,geometry:route?.geometry,source:o.source,calculatedAt:o.calculatedAt,validUntil:o.validUntil,direction:route?.direction??'FACILITY_TO_INCIDENT',qualified:true,openingConfirmed:id!=='designated_reception'||facility?.fields?.['activation.state']?.state==='RESOLVED'&&snapshot.rankings?.activeReception?.includes(facility.id)};
      return [primary,...(route?.alternatives??[]).filter(a=>Number.isFinite(a.travelTimeMinutes)&&a.geometry?.type==='LineString').map((a,n)=>({...primary,id:o.routeId+':alternative:'+n,minutes:a.travelTimeMinutes,distanceKm:a.distanceKm,roads:roadNames(a),geometry:a.geometry}))];
    })};})
  }));
}
export function reportMatches(report, route) {
  return validPoint(report.coordinate)&&Number.isFinite(report.accuracyM)&&report.accuracyM<=100&&pointRouteDistanceM(report.coordinate,route.geometry)<=Math.min(100,Math.max(25,report.accuracyM));
}
export function verification(report, confirmations) {
  const responses=confirmations.filter(c=>c.reportId===report.id&&c.senderId!==report.senderId);
  const latest=new Map();for(const c of [...responses].sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)))latest.set(c.senderId,c);
  const values=[...latest.values()], yes=values.filter(c=>c.answer==='CONFIRM'), no=values.filter(c=>['NOT_BLOCKED','PARTIALLY_BLOCKED'].includes(c.answer));
  return {state:yes.length&&no.length||no.length?'CONFLICTING_REPORTS':yes.length?'FIELD_CONFIRMED':'UNCONFIRMED',responders:[report.senderId,...yes.map(c=>c.senderId)],responses};
}
export function evaluateMission(mission, { routes = [], reports = [], confirmations = [], restrictions = [], sourceValidUntil, notices = [], at }) {
  reports=reports.filter(r=>r.incidentId===mission.incidentId&&r.lane===mission.lane&&Date.parse(r.observedAt)<=Date.parse(at));
  const current=routes.find(r=>r.id===mission.currentRouteId)??null;
  const relevant=reports.filter(r=>r.incidentId===mission.incidentId&&r.lane===mission.lane&&Date.parse(r.observedAt)<=Date.parse(at)&&fresh(r.validUntil,at)&&(r.facilityId&&mission.facilityIds.includes(r.facilityId)||current&&reportMatches(r,current)));
  const hits=relevant.filter(r=>['ROAD_BLOCKED','ROAD_PARTIAL','DAMAGE','FACILITY_UNAVAILABLE'].includes(r.type)&&current&&(r.facilityId===current.facilityId||reportMatches(r,current)));
  const official=current?restrictions.filter(r=>fresh(r.validUntil??sourceValidUntil,at)&&['CLOSED','RESTRICTED'].includes(r.state)&&roadObservationApplies(r,current)):[];
  const routeUsable=r=>r.qualified===true&&Number.isFinite(r.minutes)&&fresh(r.validUntil,at)&&!reports.some(p=>fresh(p.validUntil,at)&&['ROAD_BLOCKED','ROAD_PARTIAL','DAMAGE','FACILITY_UNAVAILABLE'].includes(p.type)&&(p.facilityId===r.facilityId||reportMatches(p,r)))&&!restrictions.some(p=>fresh(p.validUntil??sourceValidUntil,at)&&['CLOSED','RESTRICTED'].includes(p.state)&&roadObservationApplies(p,r));
  const alternatives=routes.filter(r=>r.id!==mission.currentRouteId&&routeUsable(r)).sort((a,b)=>a.minutes-b.minutes||a.id.localeCompare(b.id));
  const fallback=alternatives[0]??null, ended=Date.parse(mission.endAt)<=Date.parse(at), future=Date.parse(mission.startAt)>Date.parse(at);
  let state='GOOD',reason='The stored route and service checks are current. Road conditions still need local confirmation.';
  if(ended||future){state='UNKNOWN';reason=ended?'The mission time window has ended.':'This mission has not started yet.';}
  else if(hits.length||official.length){state='PROBLEM';reason=official.length?`Published restriction on ${official[0].roadRef??'the current route'}.`:`${REPORT_TYPES[hits[0].type]} at ${hits[0].locationName}. ${mission.subjectName}’s ${SERVICES[mission.service]} route uses this location.`;}
  else if(!current||!routeUsable(current)){state='UNKNOWN';reason=current?'The stored route or protected service needs a new check.':'No current route is stored for this objective.';}
  else if(!fresh(sourceValidUntil,at)){state='UNKNOWN';reason='Road information has not been checked recently.';}
  else if(current.openingConfirmed===false){state='WATCH';reason='Reception opening is not confirmed.';}
  else if(relevant.length||notices.length){state='WATCH';reason=relevant[0]?`${REPORT_TYPES[relevant[0].type]} near this route at ${relevant[0].locationName}.`:notices[0].text;}
  return {...mission,state,lifecycle:ended?'ENDED':future?'SCHEDULED':'ACTIVE',reason,currentRoute:current,fallback,alternativeCondition:fallback?'Condition of the alternative is not confirmed.':null,relevantReports:relevant.map(r=>({...r,verification:verification(r,confirmations)})),officialRestrictions:official,lastCheckedAt:at,previousMinutes:current?.minutes??null,alternativeMinutes:fallback?.minutes??null,routeDirection:current?.direction??null};
}
export function importantReports(reports, missions, confirmations) {
  return reports.map(r=>{const affected=missions.filter(m=>m.relevantReports.some(p=>p.id===r.id));return {...r,verification:verification(r,confirmations),missions:affected.map(m=>({id:m.id,objective:m.objective,subjectName:m.subjectName,service:m.service,currentMinutes:m.previousMinutes,alternativeMinutes:m.alternativeMinutes,facility:m.currentRoute?.name??null})),reason:affected.length?`Changes ${affected.map(m=>`${m.subjectName} ${SERVICES[m.service]}`).join(', ')}`:'Recent team observation; no watched route match established.'};}).sort((a,b)=>b.missions.length-a.missions.length||b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
}
