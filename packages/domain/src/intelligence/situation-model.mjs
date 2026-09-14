import {roadObservationApplies} from "./road-observations.mjs";
import {hash,distanceKm,validPoint} from './world-knowledge.mjs';

export const SITUATION_VERSION='vigia.incident-situation.v1';
const clone=value=>structuredClone(value);
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,clone(value[k])]));
function retainedFacility(value){
  const result=pick(value,['canonicalName','canonicalType','fields','address','contact','coordinate','location','operator','authority','designation','activation','capabilities','resolutionState','unavailable']);
  result.provenance=Object.fromEntries(Object.entries(value.provenance??{}).map(([key,rows])=>[key,rows.map(p=>pick(p,['factId','url','provider','authority','publishedAt','retrievedAt','validFrom','validUntil','sourceLocator','resolutionMethod']))]));
  return result;
}
const dated=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export const atOrBefore=(value,at)=>dated(value)&&Date.parse(value)<=Date.parse(at);
export const effectiveAt=(record,at)=>atOrBefore(record.knownAt??record.receivedAt??record.observedAt,at)&&(!record.validFrom||atOrBefore(record.validFrom,at))&&(!record.validUntil||Date.parse(record.validUntil)>Date.parse(at));
export const roadKey=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/\b(?:ESTRADA NACIONAL|EN)\s*/g,'N').replace(/\b(A|N|EM|CM|IP|IC)\s+(?=\d)/g,'$1').replace(/\s+/g,' ').trim();
const pointOf=f=>f.coordinate??f.location?.geometry?.coordinates;
const entityId=f=>f.canonicalId??f.id;
const provenance=f=>Object.values(f.provenance??{}).flat().filter(v=>v&&typeof v==='object').map(v=>({source:v.provider??v.source,url:v.url,observedAt:v.observedAt??v.publishedAt,receivedAt:v.retrievedAt,factId:v.factId,validFrom:v.validFrom,validUntil:v.validUntil}));
const verified=(f,key)=>f.fields?.[`capabilities.${key}`]?.state==='RESOLVED'&&f.capabilities?.[key]===true;
const byDistance=(a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||a.id.localeCompare(b.id);
const active=f=>f.activation?.state==='ACTIVATED'&&f.fields?.['activation.state']?.state==='RESOLVED'&&(f.provenance?.['activation.state']??[]).some(p=>p.validUntil&&effectiveAt({...p,knownAt:p.retrievedAt},f.evaluatedAt));
export function sourceHealth(source,at){
  const success=source.lastSuccessfulFetch??source.lastFetch??source.lastSuccessAt;
  const expected=source.pollIntervalMs??source.expectedRefreshMs??null;
  const failed=['SOURCE_UNAVAILABLE','unavailable','failed','degraded','offline'].includes(source.status??source.state);
  const stale=dated(success)&&expected!==null&&Date.parse(at)-Date.parse(success)>expected;
  return {...clone(source),state:failed?(success?'LAST_KNOWN':'UNAVAILABLE'):stale?'STALE':success?'CURRENT':'UNAVAILABLE',lastSuccessfulRefresh:success??null,lastRelevantObservation:source.lastRelevantObservation??source.observedAt??null,expectedRefreshMs:expected,evaluatedAt:at};
}
export function evaluateRoute(route,{restrictions=[],roadCoverage=null,unavailableRoads=[]}={},at){
  const roads=(route.roads??[]).map(r=>typeof r==='string'?{name:r,ref:r}:r);
  const keys=new Set(roads.flatMap(r=>[r.ref,r.name].filter(Boolean).flatMap(v=>v.split(';')).map(roadKey)));
  const hits=restrictions.filter(r=>r.admitted===true&&['CLOSED','RESTRICTED','UNAVAILABLE'].includes(r.state)&&effectiveAt(r,at)&&roadObservationApplies(r,route));
  const assumed=unavailableRoads.filter(r=>keys.has(roadKey(r)));
  const routeExpired=route.validUntil&&Date.parse(route.validUntil)<=Date.parse(at);
  const connected=roadCoverage?.connected===true&&dated(roadCoverage.checkedAt)&&Date.parse(roadCoverage.checkedAt)<=Date.parse(at);
  const covered=new Set((roadCoverage?.coveredRoads??[]).map(roadKey));
  const allCovered=roads.length>0&&roads.every(r=>[r.ref,r.name].some(k=>k&&covered.has(roadKey(k))));
  const fresh=connected&&allCovered&&roadCoverage.validUntil&&Date.parse(roadCoverage.validUntil)>Date.parse(at);
  const state=hits.length||assumed.length?'AFFECTED_BY_RESTRICTION':routeExpired?'STALE':route.geometry?.type==='LineString'?'CALCULATED':'UNAVAILABLE';
  const roadState=hits.length?'INGESTED_RESTRICTION':roadCoverage?.state==='UNAVAILABLE'?'UNAVAILABLE':roadCoverage?.state==='STALE'?'LAST_KNOWN':fresh?'NO_INGESTED_RESTRICTION':connected&&!allCovered?'PARTIAL_COVERAGE':connected?'LAST_KNOWN':'NOT_CONNECTED';
  return {...clone(route),roads,state,restrictionIds:hits.map(r=>r.id),assumedRoads:assumed,roadInformation:{state:roadState,checkedAt:roadCoverage?.checkedAt??null,source:roadCoverage?.source??null,sourceUrl:roadCoverage?.sourceUrl??null,coverageState:roadCoverage?.state??(fresh?"CURRENT":connected?"PARTIAL":"NOT_CONNECTED"),sourceAgeMs:roadCoverage?.sourceAgeMs??null,observations:hits.map(r=>({id:r.id,road:r.roadRef,direction:r.direction,publishedAt:r.publishedAt,observedAt:r.observedAt,source:r.source})),observedAt:hits.map(r=>r.observedAt).filter(Boolean).sort().at(-1)??null,limitation:roadState==='NO_INGESTED_RESTRICTION'?'No ingested restriction affects this calculated route within the connected source coverage. This is not confirmation of road safety.':'Current road information is incomplete. A calculated route is not proof of reachability or safety.'}};
}
export function evaluateRouteAlternatives(route,context,at){
  const assessed=evaluateRoute(route,context,at);
  if(assessed.state!=='AFFECTED_BY_RESTRICTION')return assessed;
  const alternate=(route.alternatives??[]).map(a=>evaluateRoute({...a,id:route.id,facilityId:route.facilityId,direction:route.direction,source:route.source,calculatedAt:route.calculatedAt,validUntil:route.validUntil},context,at)).find(a=>a.state==='CALCULATED');
  return alternate?{...alternate,alternatives:route.alternatives,normalRoute:assessed,recalculation:'RETAINED_ALTERNATIVE',facilityCoordinate:route.facilityCoordinate,incidentCoordinate:route.incidentCoordinate}:{...assessed,normalRoute:route,travelTimeMinutes:null,distanceKm:null,normalEstimate:{minutes:route.travelTimeMinutes,distanceKm:route.distanceKm},reason:'No retained alternative avoids the restriction. Network-wide rerouting was not performed.'};
}
export function rankFacilities(facilities,routes){
  const ordered=[...facilities].filter(f=>Number.isFinite(f.distanceKm)).sort(byDistance),available=ordered.filter(f=>!f.unavailable);
  const choose=predicate=>available.find(predicate)?.id??null;
  const emergency=available.filter(f=>f.canonicalType==='hospital'&&verified(f,'emergencyDepartment'));
  const access=emergency.flatMap(f=>routes.filter(r=>r.facilityId===f.id&&r.state==='CALCULATED'&&Number.isFinite(r.travelTimeMinutes)).map(r=>({id:f.id,routeId:r.id,minutes:r.travelTimeMinutes}))).sort((a,b)=>a.minutes-b.minutes||a.id.localeCompare(b.id));
  return {nearestHospital:choose(f=>f.canonicalType==='hospital'),nearestEmergencyHospital:choose(f=>f.canonicalType==='hospital'&&verified(f,'emergencyDepartment')),nearestCalculatedEmergencyOption:access[0]?.id??null,nearestFireStation:choose(f=>f.canonicalType==='fire_station'),nearestVerifiedFireStation:choose(f=>f.canonicalType==='fire_station'&&verified(f,'fireResponse')),nearestMapShelter:choose(f=>f.canonicalType==='shelter_generic'),nearestOfficialRefuge:choose(f=>f.canonicalType==='official_wildfire_refuge'&&!!f.designation?.kind),nearestReception:choose(f=>f.canonicalType==='temporary_reception_center'),activeReception:available.filter(f=>active(f)).map(f=>f.id),basis:{nearest:'STRAIGHT_LINE_FROM_REPORTED_INCIDENT_POINT',calculatedOption:'LOWEST_RETURNED_QUALIFIED_ROUTE_ETA',limitation:'Nearest is not best, available or safe. Calculated options do not imply live road clearance.'}};
}
export function buildSituation(input,{at,universe='OPERATIONAL'}={}){
  if(!dated(at)||!input?.incident?.id||!validPoint(input.incident.coordinate))throw new Error('dated_geolocated_incident_required');
  if(!['OPERATIONAL','CONTROLLED_TEST','SCENARIO'].includes(universe))throw new Error('situation_universe_invalid');
  const incident=clone(input.incident),facilities=(input.facilities??[]).slice(0,200).filter(f=>entityId(f)&&validPoint(pointOf(f))).map(f=>{
    const canonical=f.canonicalIntelligence??f;
    return {...retainedFacility(canonical),id:entityId(f),rawId:f.id,canonicalName:canonical.canonicalName??f.name??null,canonicalType:canonical.canonicalType??f.canonicalType,coordinate:pointOf(f),distanceKm:distanceKm(incident.coordinate,pointOf(f)),distanceReference:'REPORTED_INCIDENT_POINT',evidence:provenance(canonical),evaluatedAt:at};
  });
  const ids=new Set(facilities.map(f=>f.id));
  const retainedRoutes=(input.routes??[]).filter(r=>ids.has(r.facilityId)&&atOrBefore(r.calculatedAt,at)).slice(0,100);
  const communityRoutes=(input.communityRoutes??[]).filter(r=>ids.has(r.facilityId)&&atOrBefore(r.calculatedAt,at)).slice(0,48);
  // National feed order must never discard a known restriction on a retained route.
  // Retain every applicable report and only a bounded sample of unrelated reports.
  const candidates=(input.roadReports??[]).filter(r=>r.admitted===true&&effectiveAt(r,at));
  const applicable=[],unrelated=[];
  for(const report of candidates)([...retainedRoutes,...communityRoutes].some(r=>[r.normalRoute??r,...r.alternatives??[]].some(route=>roadObservationApplies(report,route)))?applicable:unrelated).push(report);
  const restrictions=[...applicable,...unrelated.slice(0,200)];
  const routes=retainedRoutes.map(r=>evaluateRouteAlternatives(r.normalRoute??r,{restrictions,roadCoverage:input.roadCoverage},at));
  const snapshot={schemaVersion:SITUATION_VERSION,universe,incident,knownAt:at,perimeter:input.perimeter??null,facilities,routes,roadReports:restrictions,roadCoverage:input.roadCoverage??{connected:false,checkedAt:null},weather:input.weather??null,thermal:(input.thermal??[]).filter(r=>atOrBefore(r.receivedAt??r.observedAt,at)).slice(0,500),places:(input.places??[]).slice(0,200),warningCoverage:input.warningCoverage??'UNKNOWN',notices:(input.notices??[]).filter(r=>atOrBefore(r.receivedAt??r.observedAt??r.publishedAt,at)).slice(0,100),sources:(input.sources??[]).slice(0,100).map(s=>sourceHealth(s,at))};
  snapshot.rankings=rankFacilities(facilities,routes);
  snapshot.communityRoutes=communityRoutes.map(r=>evaluateRouteAlternatives(r.normalRoute??r,{restrictions,roadCoverage:input.roadCoverage},at));
  const edges=[],edge=(kind,to,detail={})=>{edges.push({id:'edge:'+hash([incident.id,kind,to]).slice(0,32),incidentId:incident.id,kind,from:incident.id,to,...detail});};
  for(const f of facilities)edge('NEAR_FACILITY',f.id,{distanceKm:f.distanceKm,reference:'REPORTED_INCIDENT_POINT',dependencies:[incident.id,f.id],evidence:f.evidence});
  for(const r of routes){edge('HAS_ROUTE_TO_FACILITY',r.id,{facilityId:r.facilityId,direction:r.direction,dependencies:[incident.id,r.facilityId,...r.roads.map(road=>roadKey(road.ref??road.name))],evidence:[r.source].filter(Boolean)});for(const road of r.roads)edges.push({id:'edge:'+hash([r.id,roadKey(road.ref??road.name)]).slice(0,32),incidentId:incident.id,kind:'ROUTE_USES_ROAD',from:r.id,to:roadKey(road.ref??road.name),dependencies:[r.id],evidence:[r.source].filter(Boolean)});}
  for(const p of snapshot.places)if(p.id)edge(p.intersects===true&&p.kind==='road'?'INTERSECTS_ROAD':p.kind==='settlement'?'NEAR_SETTLEMENT':p.kind==='road'?'NEAR_ROAD':'NEAR_REFERENCE',p.id,{dependencies:[incident.id,p.id,...(snapshot.perimeter?[snapshot.perimeter.id??snapshot.perimeter.provenanceRef]:[])],distanceM:p.distanceM??null,reference:p.distanceReference??'REPORTED_INCIDENT_POINT',evidence:[p.source].filter(Boolean)});
  if(snapshot.weather?.station?.id)edge('WEATHER_CONTEXT',snapshot.weather.station.id,{dependencies:[snapshot.weather.station.id],observedAt:snapshot.weather.station.observedAt??null});
  for(const observation of snapshot.thermal)if(observation.id)edge('HAS_THERMAL_OBSERVATION',observation.id,{observedAt:observation.observedAt,evidence:[observation.source??observation.provenance].filter(Boolean)});
  for(const notice of snapshot.notices)if(notice.id)edge('REFERENCED_BY_NOTICE',notice.id,{evidence:[notice.source??notice.authority].filter(Boolean)});
  for(const source of snapshot.sources)if(source.id)edge('SOURCE_HEALTH',source.id,{dependencies:[source.id],state:source.state,lastSuccessfulRefresh:source.lastSuccessfulRefresh,lastRelevantObservation:source.lastRelevantObservation});
  if(incident.municipality)edge('AFFECTS_MUNICIPALITY',incident.municipality,{meaning:'REPORTED_INCIDENT_LOCATION_MEMBERSHIP_ONLY',evidence:incident.locationEvidence??[]});
  snapshot.relationships=edges;snapshot.contentHash=situationHash(snapshot);snapshot.id='situation:'+hash([incident.id,at,snapshot.contentHash]);return snapshot;
}
export function situationHash(snapshot){
  const semantic=clone(snapshot);for(const key of ['knownAt','id','contentHash','changes','impactChains','causalEvents'])delete semantic[key];
  for(const f of semantic.facilities??[]){delete f.updatedAt;delete f.evaluatedAt;}
  for(const s of semantic.sources??[])delete s.evaluatedAt;
  if(semantic.roadCoverage)for(const key of ['sourceAgeMs','checkedAt','validUntil','lastAttemptAt'])delete semantic.roadCoverage[key];
  for(const r of semantic.routes??[])if(r.roadInformation)for(const key of ['sourceAgeMs','checkedAt'])delete r.roadInformation[key];
  for(const r of semantic.roadReports??[])if(r.admissionRule==='OFFICIAL_IP_PUBLISHED_OCCURRENCE'){
    delete r.knownAt;delete r.ingestedAt;
    if(Object.hasOwn(r,'publishedValidUntil'))r.validUntil=r.publishedValidUntil;
  }
  return hash(semantic);
}
export function compareSituations(before,after){
  if(!before||!after)return {state:'HISTORY_UNAVAILABLE',changes:[]};
  const changes=[],add=(kind,subject,previous,current,dependencies=[],priority=50)=>changes.push({id:'change:'+hash([before.id,after.id,kind,subject]),kind,subject,previous,current,knownAt:after.knownAt,dependencies,priority});
  const oldEdges=new Map(before.relationships.map(r=>[r.id,r])),newEdges=new Map(after.relationships.map(r=>[r.id,r]));
  for(const [id,r]of newEdges)if(!oldEdges.has(id))add('RELATIONSHIP_ADDED',r.to,null,r.kind,r.dependencies,20);
  for(const [id,r]of oldEdges)if(!newEdges.has(id))add('RELATIONSHIP_REMOVED',r.to,r.kind,null,r.dependencies,20);
  for(const [key,value]of Object.entries(after.rankings))if(key!=='basis'&&JSON.stringify(before.rankings[key])!==JSON.stringify(value))add('FACILITY_RANKING_CHANGED',key,before.rankings[key],value,[...(before.rankings[key]?[before.rankings[key]]:[]),...(value?[value]:[])],90);
  for(const f of after.facilities){const old=before.facilities.find(x=>x.id===f.id);if(!old)continue;if(hash(old.coordinate)!==hash(f.coordinate))add('FACILITY_LOCATION_CHANGED',f.id,{coordinate:old.coordinate,distanceKm:old.distanceKm},{coordinate:f.coordinate,distanceKm:f.distanceKm},[f.id,after.incident.id],90);for(const key of ['contact.phone','address.street','capabilities.emergencyDepartment','capabilities.fireResponse','activation.state']){const [a,b]=key.split('.');if(JSON.stringify(old[a]?.[b])!==JSON.stringify(f[a]?.[b]))add(key==='activation.state'?'RECEPTION_ACTIVATION_CHANGED':key.startsWith('capabilities.')?'CAPABILITY_CHANGED':'FACILITY_INTELLIGENCE_CHANGED',f.id,{field:key,value:old[a]?.[b]??null},{field:key,value:f[a]?.[b]??null},[f.id],key==='activation.state'?95:70);}}
  for(const r of after.routes){
    const old=before.routes.find(x=>x.id===r.id);if(!old)continue;const etaChanged=Number.isFinite(old.travelTimeMinutes)!==Number.isFinite(r.travelTimeMinutes)||Number.isFinite(old.travelTimeMinutes)&&Number.isFinite(r.travelTimeMinutes)&&Math.abs(old.travelTimeMinutes-r.travelTimeMinutes)>=1;if(!etaChanged&&hash([old.state,old.geometry,old.restrictionIds])===hash([r.state,r.geometry,r.restrictionIds]))continue;
    const geometryChanged=hash(old.geometry)!==hash(r.geometry),restrictionChanged=hash(old.restrictionIds)!==hash(r.restrictionIds),freshnessOnly=['STALE','CALCULATED'].includes(r.state)&&['STALE','CALCULATED'].includes(old.state)&&old.travelTimeMinutes===r.travelTimeMinutes&&!geometryChanged&&!restrictionChanged;
    add('ROUTE_CHANGED',r.id,{state:old.state,eta:old.travelTimeMinutes},{state:r.state,eta:r.travelTimeMinutes},[r.facilityId,...r.restrictionIds,...r.roads.map(x=>roadKey(x.ref??x.name))],freshnessOnly?35:95);Object.assign(changes.at(-1),{geometryChanged,restrictionChanged,freshnessOnly});
  }
  for(const source of after.sources){const old=before.sources.find(x=>x.id===source.id);if(old&&old.state!==source.state)add('SOURCE_FRESHNESS_CHANGED',source.id,old.state,source.state,[source.id],source.state==='CURRENT'?40:65);}
  if(before.weather?.station?.id&&before.weather.station.id===after.weather?.station?.id){for(const metric of ['windSpeed','temperature','humidity']){const a=before.weather[metric],b=after.weather[metric];if(Number.isFinite(a?.value)&&Number.isFinite(b?.value)&&a.observedAt!==b.observedAt&&Math.abs(a.value-b.value)>=(metric==='windSpeed'?5:metric==='temperature'?3:10))add('WEATHER_CHANGED',metric,a,b,[after.weather.station.id],85);}}
  const oldThermal=new Set(before.thermal.map(x=>x.id)),newThermal=after.thermal.filter(x=>!oldThermal.has(x.id));if(newThermal.length)add('NEW_THERMAL_OBSERVATIONS',after.incident.id,before.thermal.length,{added:newThermal.length,latest:newThermal.map(x=>x.observedAt).filter(Boolean).sort().at(-1)},newThermal.map(x=>x.id),newThermal.some(x=>Date.parse(after.knownAt)-Date.parse(x.observedAt)>=0&&Date.parse(after.knownAt)-Date.parse(x.observedAt)<=3600000)?80:20);
  const oldNotices=new Map((before.notices??[]).map(n=>[n.id,n])),newNotices=new Map((after.notices??[]).map(n=>[n.id,n]));
  for(const n of newNotices.values())if(n.state==='ACTIVE'&&oldNotices.get(n.id)?.state!=='ACTIVE')add('APPLICABLE_WARNING_ACTIVE',n.id,oldNotices.get(n.id)?.state??null,{state:n.state,type:n.type,area:n.area,expiresAt:n.expiresAt??n.expires},[n.id],80);
  for(const n of oldNotices.values())if(n.state==='ACTIVE'&&!newNotices.has(n.id)&&(after.warningCoverage==='CURRENT'||Date.parse(n.expiresAt??n.expires)<=Date.parse(after.knownAt)))add('APPLICABLE_WARNING_ENDED',n.id,n.state,Date.parse(n.expiresAt??n.expires)<=Date.parse(after.knownAt)?'EXPIRED':'NO_LONGER_PUBLISHED_FOR_AREA',[n.id],70);
  if(hash(before.perimeter)!==hash(after.perimeter))add('ADMITTED_GEOMETRY_CHANGED',after.incident.id,before.perimeter?.id??null,after.perimeter?.id??null,[after.incident.id],95);
  return {state:'AVAILABLE',from:before.id,to:after.id,fromTime:before.knownAt,toTime:after.knownAt,changes,material:changes.filter(c=>c.priority>=65).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,5)};
}
export function explainFacility(snapshot,id){
  const f=snapshot.facilities.find(f=>f.id===id);if(!f)return {state:'NOT_IN_INCIDENT',claims:[]};
  const relation=snapshot.relationships.find(r=>r.kind==='NEAR_FACILITY'&&r.to===id),claims=[{text:`${f.canonicalName??'Facility'} is ${f.distanceKm.toFixed(1)} km from the reported incident point.`,relationshipId:relation?.id,evidence:f.evidence}];
  if(verified(f,'emergencyDepartment'))claims.push({text:'An emergency department is verified by an accepted authoritative fact.',factIds:f.fields['capabilities.emergencyDepartment'].provenance});
  for(const [key,value]of Object.entries(snapshot.rankings))if(value===id)claims.push({text:{nearestHospital:'This is the nearest mapped hospital.',nearestEmergencyHospital:'This is the nearest hospital with a verified emergency department.',nearestCalculatedEmergencyOption:'This has the lowest returned route estimate among verified emergency-capable hospitals.',nearestVerifiedFireStation:'This is the nearest facility with verified fire-response capability.'}[key]??`This facility matches ${key.replace(/([A-Z])/g,' $1').toLowerCase()}.`,calculation:{snapshotId:snapshot.id,ranking:key,basis:snapshot.rankings.basis}});
  const route=snapshot.routes.find(r=>r.facilityId===id);if(route)claims.push({text:route.roadInformation.limitation,relationshipId:route.id,checkedAt:route.roadInformation.checkedAt,evidence:[route.source]});
  return {state:'AVAILABLE',facilityId:id,snapshotId:snapshot.id,knownAt:snapshot.knownAt,claims};
}
export function scenario(snapshot,assumption){
  const assumptions=Array.isArray(assumption)?assumption:[assumption];
  if(!assumptions.length||assumptions.length>8||assumptions.some(a=>!a||Object.keys(a).some(k=>!['kind','entityId'].includes(k))||!['ROAD_UNAVAILABLE','FACILITY_UNAVAILABLE','REFUGE_UNAVAILABLE'].includes(a.kind)||typeof a.entityId!=='string'||!a.entityId||a.entityId.length>180))throw new Error('scenario_assumption_invalid');
  const after=clone(snapshot);after.universe='SCENARIO';after.scenario={label:'SCENARIO — NOT OBSERVED REALITY',assumption:clone(assumption),basedOn:snapshot.id};
  const allRoutes=[...after.routes,...after.communityRoutes??[]],unavailableRoads=assumptions.filter(a=>a.kind==='ROAD_UNAVAILABLE').map(a=>roadKey(a.entityId));
  for(const road of unavailableRoads)if(!allRoutes.some(r=>[r.normalRoute??r,...r.alternatives??[]].some(x=>(x.roads??[]).some(v=>String(v.ref??v.name??'').split(';').map(roadKey).includes(road)))))throw new Error('road_not_in_retained_routes');
  for(const a of assumptions.filter(a=>a.kind!=='ROAD_UNAVAILABLE')){const f=after.facilities.find(f=>f.id===a.entityId);if(!f||a.kind==='REFUGE_UNAVAILABLE'&&!['official_wildfire_refuge','temporary_reception_center'].includes(f.canonicalType))throw new Error('scenario_facility_not_applicable');f.unavailable=true;}
  const assess=r=>{
    if(after.facilities.find(f=>f.id===r.facilityId)?.unavailable)return {...r,state:'SCENARIO_FACILITY_UNAVAILABLE',travelTimeMinutes:null,distanceKm:null};
    const context={restrictions:after.roadReports,roadCoverage:after.roadCoverage,unavailableRoads},base=r.normalRoute??r;
    const candidates=[base,...r.alternatives??[]].map(a=>evaluateRoute({...a,id:r.id,facilityId:r.facilityId,settlementId:r.settlementId,direction:r.direction,source:a.source??r.source,calculatedAt:a.calculatedAt??r.calculatedAt,validUntil:a.validUntil??r.validUntil},context,after.knownAt));
    const chosen=candidates.find(a=>a.state==='CALCULATED');
    return chosen?{...chosen,alternatives:r.alternatives}:{...candidates[0],travelTimeMinutes:null,distanceKm:null,reason:'No current retained alternative avoids all assumed failures. Network-wide rerouting was not performed.'};
  };
  after.routes=after.routes.map(assess);after.communityRoutes=(after.communityRoutes??[]).map(assess);
  after.rankings=rankFacilities(after.facilities,after.routes);after.id='scenario:'+hash([snapshot.id,assumption]);return {snapshot:after,diff:compareSituations(snapshot,after),operationalWrites:0};
}
