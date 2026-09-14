import {canonicalIncidentId} from '../../../../../packages/domain/src/authorization.mjs';
import {roadObservationApplies} from '../../../../../packages/domain/src/intelligence/road-observations.mjs';
import {buildSituation,compareSituations,explainFacility,scenario,effectiveAt,roadKey,situationHash,sourceHealth} from '../../../../../packages/domain/src/intelligence/situation-model.mjs';
import {hash,validPoint,enrichmentPriority} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {enqueueJob} from './world-knowledge-store.mjs';
import {validateOperationalGeometry,querySpatialRelationships} from './reference-spatial-query.mjs';
import {responseSituationInput,physicalSituationInput} from './situation-projection.mjs';
import {accessResilience,routeIntelligence,failureAnalysis,historicalAnalogs,evolutionBetween} from '../../../../../packages/domain/src/intelligence/access-resilience.mjs';
import {operationalSupport,supportComparison,causalSupportEvents} from '../../../../../packages/domain/src/intelligence/operational-support.mjs';
import {CommunitySupportService} from './community-support-service.mjs';
import {operationalPicture,stressSupport} from '../../../../../packages/domain/src/intelligence/operational-cognition.mjs';

function readableChanges(s,changes){return changes.filter(c=>!(c.kind==='ROUTE_CHANGED'&&c.geometryChanged!==true&&c.restrictionChanged!==true&&['CALCULATED','STALE'].includes(c.previous?.state)&&['CALCULATED','STALE'].includes(c.current?.state)&&c.previous?.state!==c.current?.state&&c.previous?.eta===c.current?.eta)).map(c=>{const route=s.routes.find(r=>r.id===c.subject),facility=s.facilities.find(f=>f.id===(route?.facilityId??c.subject));return {...c,subjectLabel:(c.kind==='APPLICABLE_WARNING_ACTIVE'?[c.current?.type,c.current?.area].filter(Boolean).join(' · '):null)??facility?.canonicalName??s.sources.find(x=>x.id===c.subject)?.name??({nearestHospital:'Nearest mapped hospital',nearestEmergencyHospital:'Nearest verified emergency hospital',nearestCalculatedEmergencyOption:'Lowest calculated hospital route',nearestVerifiedFireStation:'Nearest verified fire-response facility',windSpeed:'Wind speed',temperature:'Temperature',humidity:'Humidity'}[c.subject])??'Incident relationship'};});}

export class SituationService{
  constructor({store,knowledge,routingAdapter=null,clock=()=>new Date(),universe='OPERATIONAL'}){Object.assign(this,{store,knowledge,routingAdapter,clock,universe});this.communities=new CommunitySupportService({routingAdapter,clock});this.pending=new Map();this.active=new Set();this.running=false;this.counters={captured:0,unchanged:0,recalculations:0,routeRecalculations:0,errors:0};}
  observePhysical(value){const input=physicalSituationInput(value);this.observe(input.incidentId,input.patch);}
  observeResponse(value){const input=responseSituationInput(value);this.observe(input.incidentId,input.patch);}
  observe(incidentId,patch){
    incidentId=canonicalIncidentId(incidentId);if(!incidentId||!validPoint(patch?.incident?.coordinate))return;
    if(this.pending.size>=32&&!this.pending.has(incidentId))return;
    const before=this.pending.get(incidentId)??{};this.pending.set(incidentId,{...before,...patch,incident:{...before.incident,...Object.fromEntries(Object.entries(patch.incident).filter(([,v])=>v!==undefined)),id:incidentId}});this.active.add(incidentId);
  }
  async flush(){for(const [id,input]of this.pending){await this.store.enqueue(id,input,this.clock().toISOString());if(this.pending.get(id)===input)this.pending.delete(id);}}
  async changedEntities(ids){for(const incidentId of await this.store.affected(ids))await this.store.enqueue(incidentId,{reason:'ACCEPTED_ENTITY_CHANGED',changedEntities:ids},this.clock().toISOString());}
  async sourceStateChanged(id){const source=this.knowledge.sourceCache?.get(id);if(!source)return;const at=this.clock().toISOString(),health=sourceHealth(source,at);for(const incidentId of await this.store.affected([id])){const previous=(await this.store.latest(incidentId,at))?.sources.find(s=>s.id===id);if(previous&&previous.state!==health.state)await this.store.enqueue(incidentId,{reason:'SOURCE_HEALTH_CHANGED'},at);}}
  async initialize(){for(const s of await this.store.recent())await this.store.enqueue(s.incident.id,{reason:'RESTORE_VALIDITY'},this.clock().toISOString());}
  async scheduleExpiry(s){
    const now=this.clock().getTime(),dates=[...s.routes.map(r=>r.validUntil),...(s.communityRoutes??[]).map(r=>r.validUntil),s.roadCoverage?.validUntil,...s.roadReports.map(r=>r.validUntil),...s.facilities.flatMap(f=>Object.values(f.provenance??{}).flat().map(p=>p.validUntil)),...s.sources.map(x=>x.lastSuccessfulRefresh&&x.expectedRefreshMs?new Date(Date.parse(x.lastSuccessfulRefresh)+x.expectedRefreshMs+1).toISOString():null)].map(Date.parse).filter(t=>Number.isFinite(t)&&t>now).sort((a,b)=>a-b);
    const pending=s.routingPending===true?now+15000:Infinity;
    const next=Math.min(pending,dates[0]??Infinity,Math.max(now+60000,Date.parse(s.knownAt)+1800000));await this.store.enqueue(s.incident.id,{reason:'VALIDITY_OR_CONTINUITY_CHECK'},new Date(next).toISOString());
  }
  async tick(){if(this.running)return;this.running=true;try{if(this.store.retainHistory&&(!this.retainedAt||this.clock().getTime()-this.retainedAt>86400000)){this.retention=await this.store.retainHistory(this.clock().toISOString());this.retainedAt=this.clock().getTime();}await this.flush();for(const job of await this.store.jobs(this.clock().toISOString())){try{const result=await this.rebuild(job);await this.store.finish(job);await this.scheduleExpiry(result.snapshot);}catch(error){this.counters.errors++;await this.store.finish(job,error.message);}}}finally{this.running=false;}}
  async rebuild(job){
    let at=this.clock().toISOString();const before=await this.store.latest(job.incidentId,at),input={...(before??{}),...job.input,incident:{...before?.incident,...job.input?.incident,id:canonicalIncidentId(job.incidentId)}};
    if(!validPoint(input.incident.coordinate))throw new Error('situation_incident_location_unavailable');
    delete input.id;delete input.contentHash;if(/^Incident near /i.test(input.incident.name??"")&&before?.incident.name&&!/^Incident near /i.test(before.incident.name))input.incident.name=before.incident.name;
    input.facilities=(input.facilities??[]).map(f=>{const id=f.canonicalId??f.id,cached=this.knowledge?.cache.get(id);if(!cached)return f;const decorated=this.knowledge.decorate({id,coordinate:f.coordinate??cached.location?.geometry?.coordinates});return {...decorated.canonicalIntelligence,id,canonicalId:id,coordinate:decorated.coordinate};});
    const relevantUrls=new Set(input.facilities.flatMap(f=>Object.values(f.provenance??{}).flat().map(p=>p.url)));
    const watched=[...(this.knowledge?.sourceCache?.values()??[])].filter(s=>relevantUrls.has(s.url)).map(s=>({id:s.id??s.url,name:s.provider,provider:s.provider,lastFetch:s.lastFetch,status:s.status,pollIntervalMs:s.pollIntervalMs,lastRelevantObservation:s.publishedAt??null,url:s.url}));
    input.sources=[...new Map([...(input.sources??[]),...watched].map(s=>[s.id,s])).values()];
    if(this.roadStateService){const road=this.roadStateService.context(at);input.roadReports=[...(input.roadReports??[]).filter(r=>r.admissionRule!=='OFFICIAL_IP_PUBLISHED_OCCURRENCE'),...road.roadReports];input.roadCoverage=road.roadCoverage;}
    const admissions=await this.store.admissions(job.incidentId,at),accepted=admissions.filter(r=>r.decision==='ACCEPT'&&effectiveAt(r,at));
    input.roadReports=[...new Map([...(input.roadReports??[]),...accepted.filter(r=>r.fact.kind==='ROAD_RESTRICTION').map(r=>({...r.fact,id:r.id,admitted:true,knownAt:r.knownAt,source:r.source,validFrom:r.validFrom,validUntil:r.validUntil}))].filter(r=>effectiveAt(r,at)).map(r=>[r.id,r])).values()];
    input.routes=await this.recalculateRoutes(input,before,at);
    if(this.store.pool&&before&&(hash(before.perimeter)!==hash(input.perimeter)||hash(before.incident.coordinate)!==hash(input.incident.coordinate))){
      const features=(input.places??[]).filter(p=>validateOperationalGeometry(p.geometry)).map(p=>({...p,kind:p.kind==='road'?'ROAD_REFERENCE':p.kind.toUpperCase()}));
      const spatial=await querySpatialRelationships(this.store.pool,{coordinate:input.incident.coordinate,current:input.perimeter?.geometry,features});
      input.places=spatial.relationships.map(r=>({...r.feature,kind:String(r.feature.kind).toLowerCase().replace(/^road_reference$/,'road'),intersects:r.intersects===true,distanceM:r.distanceFromPointM,distanceFromPerimeterM:r.distanceFromPerimeterM}));
    }
    input.places=await this.communities.places(input,at);
    input.communityRoutes=await this.communities.routes(input,before,at);
    // Routing is asynchronous: knowledge time must follow the returned calculation,
    // otherwise the no-future-evidence filter correctly drops every new route.
    at=this.clock().toISOString();
    const next=buildSituation(input,{at,universe:this.universe});
    next.routingPending=Boolean(this.incidentRoutingPending||this.communities.pendingCount);
    if(next.perimeter?.geometry&&validateOperationalGeometry(next.perimeter.geometry,{polygonOnly:true})&&this.store.pool&&next.facilities.length){
      const rows=await this.store.pool.query("SELECT v->>'id' id,ST_Distance(ST_SetSRID(ST_GeomFromGeoJSON($1),4326)::geography,ST_SetSRID(ST_MakePoint((v->'coordinate'->>0)::float,(v->'coordinate'->>1)::float),4326)::geography)/1000 distance_km FROM jsonb_array_elements($2::jsonb) v",[JSON.stringify(next.perimeter.geometry),JSON.stringify(next.facilities.map(f=>({id:f.id,coordinate:f.coordinate})))]);
      for(const r of rows.rows){const f=next.facilities.find(f=>f.id===r.id);f.distanceToAdmittedPerimeterKm=r.distance_km;next.relationships.push({id:'edge:'+hash([next.incident.id,'DISTANCE_TO_ADMITTED_PERIMETER',f.id]),kind:'DISTANCE_TO_ADMITTED_PERIMETER',from:next.incident.id,to:f.id,distanceKm:r.distance_km,reference:next.perimeter.provenanceRef,dependencies:[next.incident.id,f.id,next.perimeter.provenanceRef].filter(Boolean)});}
    }
    next.relationships.push(...operationalSupport(next).relationships);
    if(before?.continuityWindow)next.continuityWindow=before.continuityWindow;
    if(before&&Date.parse(at)-Date.parse(before.knownAt)>=1800000)next.continuityWindow=Math.floor(Date.parse(at)/1800000);
    next.contentHash=situationHash(next);next.id='situation:'+hash([next.incident.id,at,next.contentHash]);
    const diff=before?compareSituations(before,next):{state:'INITIAL_CAPTURE',changes:[],material:[]};
    next.changes=diff.material??[];next.impactChains=(diff.changes??[]).filter(c=>c.priority>=65).map(c=>({id:'impact:'+c.id,trigger:job.input?.reason??c.kind,changeId:c.id,dependencies:c.dependencies,steps:[{kind:c.kind,subject:c.subject,previous:c.previous,current:c.current},...next.relationships.filter(r=>r.dependencies?.some(id=>c.dependencies?.includes(id))).slice(0,10).map(r=>({kind:r.kind,subject:r.to,relationshipId:r.id}))]}));
    next.causalEvents=causalSupportEvents(before,next,diff.changes??[]);
    const stored=await this.store.append(next);if(stored.state==='UNCHANGED'){this.counters.unchanged++;return stored;}
    this.counters.captured++;this.counters.recalculations++;if(!before||hash(this.gaps(before))!==hash(this.gaps(next)))await this.huntGaps(next);await this.onSnapshotChanged?.(next.incident.id);return stored;
  }
  async recalculateRoutes(input,before,at){
    const routes=[];let recalculated=0;this.incidentRoutingPending=false;
    const priority=route=>{const f=input.facilities?.find(f=>(f.id??f.canonicalId)===route.facilityId);return f?.fields?.['capabilities.emergencyDepartment']?.state==='RESOLVED'&&f.capabilities?.emergencyDepartment===true||f?.fields?.['capabilities.fireResponse']?.state==='RESOLVED'&&f.capabilities?.fireResponse===true?0:f?.fields?.['designation.kind']?.state==='RESOLVED'?1:2;};
    const candidates=[...(input.routes??[])].sort((a,b)=>priority(a)-priority(b)||Date.parse(a.retryAfter??a.validUntil)-Date.parse(b.retryAfter??b.validUntil));
    for(const route of candidates){const f=input.facilities?.find(f=>(f.id??f.canonicalId)===route.facilityId);if(!f)continue;const coordinate=f.coordinate??f.location?.geometry?.coordinates;
      const moved=route.facilityCoordinate&&hash(coordinate)!==hash(route.facilityCoordinate)||route.incidentCoordinate&&hash(input.incident.coordinate)!==hash(route.incidentCoordinate);
      const newlyAffected=(input.roadReports??[]).some(report=>roadObservationApplies(report,route.normalRoute??route)&&!(before?.roadReports??[]).some(old=>old.id===report.id&&old.revision===report.revision&&old.state===report.state));
      const expired=Date.parse(route.retryAfter??route.validUntil)<=Date.parse(at),due=moved||newlyAffected||expired;
      if(due&&recalculated>=4)this.incidentRoutingPending=true;
      if(due&&this.routingAdapter&&recalculated<4){recalculated++;const value=await this.routingAdapter.route(input.incident.coordinate,{id:f.id,coordinate},{}),r=value.reachability?.currentRoute;this.counters.routeRecalculations++;routes.push(r?{...route,...r,retryAfter:null,normalRoute:undefined,facilityCoordinate:coordinate,incidentCoordinate:input.incident.coordinate,calculatedAt:value.reachability.checkedAt,validUntil:new Date(Date.parse(at)+300000).toISOString(),source:value.reachability.source,alternatives:value.reachability.alternativeRoute?[value.reachability.alternativeRoute]:[]}:{...route,retryAfter:new Date(Date.parse(at)+60000).toISOString(),normalRoute:undefined,geometry:null,travelTimeMinutes:null,distanceKm:null,reason:'No replacement road route was returned.'});}
      else routes.push(route);
    }
    return routes.sort((a,b)=>a.id.localeCompare(b.id));
  }
  gaps(snapshot){
    return snapshot.facilities.filter(f=>['hospital','fire_station','police_station','official_wildfire_refuge','temporary_reception_center','shelter_generic','civil_protection'].includes(f.canonicalType)).flatMap(f=>{
      const missing=[];if(!f.contact?.phone)missing.push('contact.phone');if(!f.contact?.website)missing.push('contact.website');if(!f.address?.street)missing.push('address.street');if(!f.authority&&!f.operator)missing.push('authority');
      if(f.canonicalType==='hospital'&&f.fields?.['capabilities.emergencyDepartment']?.state!=='RESOLVED')missing.push('capabilities.emergencyDepartment');
      if(f.canonicalType==='fire_station'&&f.fields?.['capabilities.fireResponse']?.state!=='RESOLVED')missing.push('capabilities.fireResponse');
      if(['shelter_generic','official_wildfire_refuge'].includes(f.canonicalType)&&!f.designation?.kind)missing.push('designation.kind');
      if(!missing.length)return[];const highlighted=Object.values(snapshot.rankings).includes(f.id),priority=enrichmentPriority({type:f.canonicalType,distance:f.distanceKm,missing,visible:highlighted});
      return[{entityId:f.id,name:f.canonicalName,missing,priority,incidentId:snapshot.incident.id,distanceKm:f.distanceKm,factors:{proximityKm:f.distanceKm,type:f.canonicalType,activeRelationship:true,highlighted,missingCritical:missing.length},reason:highlighted?'CURRENT_RANKING_RELATIONSHIP':'NEAR_MONITORED_INCIDENT'}];
    }).sort((a,b)=>b.priority-a.priority||a.entityId.localeCompare(b.entityId)).slice(0,30);
  }
  async huntGaps(snapshot){const gaps=this.gaps(snapshot);if(!this.knowledge?.store||!gaps.length)return;await this.knowledge.store.mutate(state=>{for(const gap of gaps)enqueueJob(state,'ENRICH_FACILITY',gap.entityId,{priority:gap.priority,dueAt:snapshot.knownAt,payload:gap});});}
  async snapshot(incidentId,at=null){
    const requested=at??this.clock().toISOString();if(!Number.isFinite(Date.parse(requested))||Date.parse(requested)>this.clock().getTime())throw Object.assign(new Error('historical_time_invalid'),{statusCode:400});
    const value=await this.store.latest(canonicalIncidentId(incidentId),new Date(requested).toISOString());return value?{state:'AVAILABLE',mode:at?'HISTORICAL':'CURRENT_RETAINED',requestedAt:requested,knownAt:value.knownAt,snapshot:value,limitation:'Captured knowledge only. Later observations and current caches are not joined to historical views.'}:{state:'HISTORY_UNAVAILABLE',mode:at?'HISTORICAL':'CURRENT_RETAINED',requestedAt:requested,snapshot:null,reason:'Not available for this time. No retained situation snapshot exists.'};
  }
  async compare(incidentId,from,to){const [a,b]=await Promise.all([this.snapshot(incidentId,from),this.snapshot(incidentId,to)]),comparison=compareSituations(a.snapshot,b.snapshot);if(a.snapshot&&b.snapshot){const context={...b.snapshot,facilities:[...b.snapshot.facilities,...a.snapshot.facilities],routes:[...b.snapshot.routes,...a.snapshot.routes],sources:[...b.snapshot.sources,...a.snapshot.sources]};comparison.changes=readableChanges(context,comparison.changes??[]);comparison.material=readableChanges(context,comparison.material??[]);}return {...comparison,support:supportComparison(a.snapshot,b.snapshot)};}
  async whatMatters(incidentId,since=null){const current=await this.snapshot(incidentId);if(!current.snapshot)return{state:current.state,changes:[]};if(since){const before=await this.snapshot(incidentId,since);return compareSituations(before.snapshot,current.snapshot);}const rows=await this.store.recentChanges(canonicalIncidentId(incidentId),new Date(this.clock().getTime()-3600000).toISOString(),this.clock().toISOString()),unique=new Map();for(const row of rows){const key=row.kind+':'+row.subject;if(!unique.has(key))unique.set(key,row);}return{state:'AVAILABLE',knownAt:current.knownAt,changes:readableChanges(current.snapshot,[...unique.values()]).sort((a,b)=>b.priority-a.priority).slice(0,5)};}
  async why(incidentId,entityId,at=null){const current=await this.snapshot(incidentId,at);return current.snapshot?explainFacility(current.snapshot,entityId):current;}
  async access(incidentId,at=null){const current=await this.snapshot(incidentId,at);return current.snapshot?accessResilience(current.snapshot,{at:at?current.snapshot.knownAt:this.clock().toISOString()}):current;}
  async support(incidentId,at=null){const current=await this.snapshot(incidentId,at);return current.snapshot?operationalSupport(current.snapshot,{at:at?current.snapshot.knownAt:this.clock().toISOString()}):current;}
  async picture(incidentId,options={}){
    const current=await this.snapshot(incidentId,options.at);if(!current.snapshot)return current;
    const at=options.at?current.knownAt:this.clock().toISOString(),base={...current.snapshot,knownAt:at};
    const failures=options.failures?JSON.parse(options.failures):null;
    const simulated=failures?failureAnalysis(base,failures):null;
    const picture=operationalPicture(simulated?.snapshot??base,{...options,at,limited:options.limited==='true',before:simulated?base:null,historical:Boolean(options.at)});
    picture.changes=readableChanges(base,base.changes??[]);picture.knownAt=current.knownAt;picture.mode=simulated?'SCENARIO':current.mode;
    if(simulated){picture.failures=failures;picture.consequences=supportComparison(base,simulated.snapshot);picture.operationalWrites=0;}
    return picture;
  }
  async stress(incidentId,at=null){const current=await this.snapshot(incidentId,at);return current.snapshot?stressSupport({...current.snapshot,knownAt:at?current.knownAt:this.clock().toISOString()}):current;}
  async facilityRoute(incidentId,id,at=null){const current=await this.snapshot(incidentId,at);return current.snapshot?routeIntelligence(current.snapshot,id,{at:at?current.snapshot.knownAt:this.clock().toISOString()}):current;}
  async analogs(incidentId,allowed,at=null){const current=await this.snapshot(incidentId,at);if(!current.snapshot)return current;const candidates=(await this.store.recent()).filter(s=>allowed(s.incident.id));return historicalAnalogs(current.snapshot,candidates);}
  async causalTimeline(incidentId,at=null){
    const current=await this.snapshot(incidentId,at);if(!current.snapshot)return {state:current.state,causalEvents:[]};
    const end=at??this.clock().toISOString(),from=new Date(Date.parse(end)-3600000).toISOString();
    const events=this.store.causalEvents?await this.store.causalEvents(canonicalIncidentId(incidentId),from,end):(this.store.interval?await this.store.interval(canonicalIncidentId(incidentId),from,end):[current.snapshot]).flatMap(row=>row.causalEvents??[]);
    const unique=new Map();for(const event of events)unique.set(event.id,event);
    return {state:'AVAILABLE',from,to:end,knownAt:current.knownAt,causalEvents:[...unique.values()].reverse().slice(0,20)};
  }
  async evolution(incidentId,from){
    const first=await this.snapshot(incidentId,from),end=new Date(Date.parse(from)+7200000).toISOString();
    if(Date.parse(end)>this.clock().getTime())return {state:'HISTORY_UNAVAILABLE',changes:[]};
    const last=await this.snapshot(incidentId,end),result=evolutionBetween(first.snapshot,last.snapshot);
    if(result.state==='HISTORY_UNAVAILABLE')return result;
    const rows=this.store.interval?await this.store.interval(canonicalIncidentId(incidentId),from,end):[];
    let previous=first.snapshot;const outcomes=[];
    for(const row of rows){const comparison=supportComparison(previous,row);if(comparison.changes.length)outcomes.push({knownAt:row.knownAt,minutesAfter:Math.round((Date.parse(row.knownAt)-Date.parse(from))/60000),snapshotId:row.id,changes:comparison.changes});previous=row;}
    return {...result,support:supportComparison(first.snapshot,last.snapshot),outcomes,window:{from,to:end,lastRetainedAt:last.knownAt,samples:rows.length},limitation:'Retained observations within the following two hours; gaps between captures are unknown. Historical context, not a forecast.'};
  }
  async simulate(incidentId,assumption,at=null){const current=await this.snapshot(incidentId,at);if(!current.snapshot)return current;let result;try{result=failureAnalysis(current.snapshot,assumption);}catch(error){if(['scenario_assumption_invalid','road_not_in_retained_routes','scenario_facility_not_applicable'].includes(error.message))error.statusCode=400;throw error;}return {...result,support:{before:operationalSupport(current.snapshot),after:operationalSupport(result.snapshot),comparison:supportComparison(current.snapshot,result.snapshot)}};}
  async briefing(incidentId,at=null){const current=await this.snapshot(incidentId,at);if(!current.snapshot)return current;const s=current.snapshot,entity=id=>s.facilities.find(f=>f.id===id)??null;return{state:'AVAILABLE',mode:current.mode,knownAt:s.knownAt,incident:s.incident,weather:s.weather,latestThermal:s.thermal.map(o=>o.observedAt).filter(Boolean).sort().at(-1)??null,nearestHospital:entity(s.rankings.nearestHospital),nearestHospitalRoute:routeIntelligence(s,s.rankings.nearestEmergencyHospital??s.rankings.nearestHospital),nearestEmergencyHospital:entity(s.rankings.nearestEmergencyHospital),nearestVerifiedFireStation:entity(s.rankings.nearestVerifiedFireStation),routeImpacts:s.routes.filter(r=>r.state==='AFFECTED_BY_RESTRICTION').length,officialRefuges:s.facilities.filter(f=>f.canonicalType==='official_wildfire_refuge').length,currentReceptionActivations:s.rankings.activeReception.length,whatMatters:at?readableChanges(s,s.changes??[]):(await this.whatMatters(incidentId)).changes,access:accessResilience(s),settlements:s.places.filter(p=>p.kind=="settlement"),notices:s.notices,gaps:this.gaps(s),roadCoverage:s.roadCoverage,support:operationalSupport(s,{at:at?s.knownAt:this.clock().toISOString()}),causalEvents:s.causalEvents??[]};}
}
