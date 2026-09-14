import {hash,distanceKm,validPoint} from './world-knowledge.mjs';
import {evaluateRouteAlternatives,atOrBefore} from './situation-model.mjs';
import {accessResilience,significantRoads} from './access-resilience.mjs';

export const COVERAGE_BANDS=Object.freeze({emergency_hospital:[15,30,45],fire_response:[10,20,30],designated_reception:[15,30,45]});
export function settlementObjects(s){
  return (s.places??[]).filter(p=>p.kind==='settlement'&&p.id&&p.name).map(p=>{
    const coordinate=p.coordinate??(p.geometry?.type==='Point'?p.geometry.coordinates:null);
    const population=p.population?.authority==='INE'&&Number.isInteger(p.population.value)&&p.population.value>=0&&Number.isInteger(p.population.referenceYear)&&p.population.geographicUnit==='SETTLEMENT'&&p.population.sourceUrl&&atOrBefore(p.population.retrievedAt,s.knownAt)?p.population:null;
    return {id:p.id,name:p.name,coordinate:validPoint(coordinate)?coordinate:null,geometry:p.geometry??null,municipality:p.municipality??null,population,distanceKm:validPoint(coordinate)?distanceKm(s.incident.coordinate,coordinate):Number.isFinite(p.distanceM)?p.distanceM/1000:null,distanceReference:'REPORTED_INCIDENT_POINT',distanceToAdmittedPerimeterKm:Number.isFinite(p.distanceFromPerimeterM)?p.distanceFromPerimeterM/1000:null,source:p.source,provenanceRef:p.provenanceRef,receivedAt:p.receivedAt??null};
  }).sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity)||a.id.localeCompare(b.id));
}
export function operationalSupport(s,{at=s.knownAt}={}){
  const access=accessResilience(s,{at}),communities=settlementObjects(s).map(place=>{
    const routes=(s.communityRoutes??[]).filter(r=>r.settlementId===place.id).map(r=>s.universe==='SCENARIO'?r:evaluateRouteAlternatives(r.normalRoute??r,{restrictions:s.roadReports,roadCoverage:s.roadCoverage},at));
    const support=accessResilience({...s,routes},{at});
    const designated=support.groups.find(g=>g.id==='designated_reception').qualifiedIds,activated=support.groups.find(g=>g.id==='active_reception').qualifiedIds;
    return {...place,groups:support.groups,corridors:support.corridors,holes:support.holes,routes,nearbyDesignations:s.facilities.filter(f=>designated.includes(f.id)&&place.coordinate&&distanceKm(place.coordinate,f.coordinate)<=8).map(f=>({facilityId:f.id,name:f.canonicalName,distanceKm:distanceKm(place.coordinate,f.coordinate),authority:f.authority,evidence:f.evidence,activationConfirmed:activated.includes(f.id)})),basis:'FACILITY_TO_SETTLEMENT_CALCULATED_ROUTES',routeSearchState:routes.length?'RETAINED_ROUTES':'NO_RETAINED_ROUTES'};
  });
  const relationships=[];
  for(const subject of [{id:s.incident.id,groups:access.groups},...communities])for(const group of subject.groups)for(const option of group.options)for(const road of option.roads){
    relationships.push({id:'edge:'+hash([subject.id,option.routeId,group.id,road]),kind:'SHARED_ACCESS_DEPENDENCY',incidentId:s.incident.id,from:option.routeId,to:road,subjectId:subject.id,facilityId:option.facilityId,category:group.id,routeRevision:hash([option.routeId,option.calculatedAt,option.minutes,option.roads]),calculatedAt:option.calculatedAt,validUntil:option.validUntil,roadCheckedAt:option.roadInformation?.checkedAt??null,observationTime:option.roadInformation?.observedAt??null,dependencies:[subject.id,option.facilityId,option.routeId,road],evidence:option.evidence??[]});
  }
  const corridors=[...new Set(relationships.map(r=>r.to))].map(road=>{
    const rows=relationships.filter(r=>r.to===road),routeIds=[...new Set(rows.map(r=>r.from))];
    return {road,routeCount:routeIds.length,routeIds,relationships:rows,categories:[...new Set(rows.map(r=>r.category))],settlementIds:[...new Set(rows.map(r=>r.subjectId).filter(id=>id!==s.incident.id))],facilityIds:[...new Set(rows.map(r=>r.facilityId))]};
  }).sort((a,b)=>b.routeCount-a.routeCount||a.road.localeCompare(b.road));
  const notices=[];
  const known=o=>['NO_INGESTED_RESTRICTION','PARTIAL_COVERAGE'].includes(o?.roadInformation?.state)&&o.roadInformation.checkedAt&&Date.parse(s.roadCoverage?.validUntil)>Date.parse(at);
  const health=access.groups.find(g=>g.id==='emergency_hospital'),fire=access.groups.find(g=>g.id==='fire_response');
  if(known(health?.primary)&&known(fire?.primary))for(const road of health.primary.roads.filter(r=>fire.primary.roads.includes(r)))notices.push({id:'notice:'+hash([s.incident.id,road,'SHARED_PRIMARY_ACCESS']),kind:'LIMITED_REDUNDANCY',title:'Shared primary access',text:`${health.primary.name} and ${fire.primary.name} use ${road} in their primary calculated routes.`,alternatives:[health,fire].map(g=>({category:g.label,alternative:g.secondary?.name??null})),relationshipIds:relationships.filter(r=>r.to===road&&[health.primary.routeId,fire.primary.routeId].includes(r.from)).map(r=>r.id),knownAt:at});
  for(const group of access.groups.filter(g=>['emergency_hospital','fire_response','designated_reception'].includes(g.id)))if(group.primary&&!group.secondary&&known(group.primary))notices.push({id:'notice:'+hash([s.incident.id,group.id,'NO_ALTERNATIVE']),kind:'NO_RETAINED_ALTERNATIVE',title:'No retained alternative',text:`${group.primary.name} is the only ${group.label.toLowerCase()} with a current calculated route in this retained set.`,relationshipIds:relationships.filter(r=>r.from===group.primary.routeId).map(r=>r.id),knownAt:at});
  return {schemaVersion:'vigia.operational-support.v1',snapshotId:s.id,knownAt:s.knownAt,evaluatedAt:at,...access,communities,corridors,relationships,notices:notices.slice(0,3),coverage:coverageRelationships(communities),limitation:'Retained qualified options only. Facility-to-subject route calculations exclude live traffic and do not establish operational availability or safe access. Road-source coverage is partial.'};
}
function coverageRelationships(communities){
  return Object.entries(COVERAGE_BANDS).map(([category,bands])=>({category,bands,geometryKind:'RETAINED_ROUTE_RELATIONSHIPS',boundary:null,isochrones:false,relationships:communities.flatMap(c=>{const g=c.groups.find(g=>g.id===category);return g.options.map(o=>({settlementId:c.id,settlementName:c.name,facilityId:o.facilityId,name:o.name,minutes:o.minutes,bandMinutes:bands.find(n=>o.minutes<=n)??null,calculatedAt:o.calculatedAt,validUntil:o.validUntil,source:o.source,facilityEvidence:o.evidence,roadInformation:o.roadInformation,geometry:c.routes.find(r=>r.id===o.routeId)?.geometry??null,direction:o.direction}));}),gaps:communities.filter(c=>!c.groups.find(g=>g.id===category)?.options.some(o=>o.minutes<=bands[1])).map(c=>({settlementId:c.id,name:c.name,thresholdMinutes:bands[1],text:`No retained qualified ${category.replaceAll('_',' ')} route within ${bands[1]} minutes.`})),limitation:'Only calculated paths to retained settlement points. No continuous area boundary or unmeasured coverage is inferred.'}));
}
export function supportComparison(before,after){
  if(!before||!after)return {state:'HISTORY_UNAVAILABLE',changes:[]};
  const a=operationalSupport(before),b=operationalSupport(after),changes=[];
  const groups=x=>[{subjectId:x.incidentId??before.incident.id,groups:x.groups},...x.communities.map(c=>({subjectId:c.id,groups:c.groups}))];
  const old=new Map(groups(a).flatMap(s=>s.groups.map(g=>[s.subjectId+':'+g.id,g])));
  for(const subject of groups(b))for(const g of subject.groups){const previous=old.get(subject.subjectId+':'+g.id);if(!previous)continue;
    const brief=x=>({primary:x.primary?.facilityId??null,primaryName:x.primary?.name??null,secondary:x.secondary?.facilityId??null,secondaryName:x.secondary?.name??null,minutes:x.primary?.minutes??null,options:x.options.length,sharedRoads:x.sharedSegments});
    if(hash(brief(previous))!==hash(brief(g)))changes.push({subjectId:subject.subjectId,subjectName:[...b.communities,...a.communities].find(c=>c.id===subject.subjectId)?.name??after.incident.name??before.incident.name??'Incident',category:g.id,previous:brief(previous),current:brief(g)});
  }
  return {state:'AVAILABLE',from:before.id,to:after.id,fromTime:before.knownAt,toTime:after.knownAt,changes};
}
export function causalSupportEvents(before,after,changes=[]){
  if(!before)return[];
  const comparison=supportComparison(before,after),triggers=changes.filter(c=>['ROUTE_CHANGED','CAPABILITY_CHANGED','RECEPTION_ACTIVATION_CHANGED','FACILITY_LOCATION_CHANGED','ADMITTED_GEOMETRY_CHANGED'].includes(c.kind)&&!c.freshnessOnly);
  return triggers.map(trigger=>{
    const dependencies=trigger.dependencies??[];
    const facts=after.facilities.filter(f=>dependencies.includes(f.id)).flatMap(f=>Object.values(f.provenance??{}).flat().map(p=>p.factId).filter(Boolean));
    facts.push(...after.roadReports.filter(r=>dependencies.includes(r.id)).map(r=>r.id));
    return {id:'cause:'+hash([after.id,trigger.id]),triggerId:trigger.id,triggerKind:trigger.kind,triggerFactIds:[...new Set(facts)],knownAt:after.knownAt,snapshotId:after.id,affectedEntities:after.facilities.filter(f=>dependencies.includes(f.id)).map(f=>f.id),relationshipIds:after.relationships.filter(r=>(r.dependencies??[]).some(id=>dependencies.includes(id))).map(r=>r.id),supportChanges:comparison.changes.filter(c=>[c.previous.primary,c.current.primary,c.previous.secondary,c.current.secondary].some(id=>id&&dependencies.includes(id))),observed:true};
  }).filter(c=>c.supportChanges.length||c.relationshipIds.length);
}
