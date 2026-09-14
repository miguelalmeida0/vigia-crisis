import {assertCan,assertIncidentScope,canonicalIncidentId} from '../../../../../packages/domain/src/authorization.mjs';
import {normalize,hash} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {roadKey} from '../../../../../packages/domain/src/intelligence/situation-model.mjs';
import {significantRoads} from '../../../../../packages/domain/src/intelligence/access-resilience.mjs';

export const SITUATION_TOOLS=Object.freeze(['getIncident','getIncidentChanges','getFacilitiesNearIncident','getQualifiedFacilities','getFacilityDetails','getFacilityRoute','getRoadState','getRelevantWeather','getThermalObservations','getOfficialRefuges','getSourceHealth','getIntelligenceGaps','getImpactChain','getHistoricalSnapshot','getIncidentBrief','getMaterialChanges','getRouteRoads','getAccessDependencies','getAlternativeFacilities','compareSnapshots','runScenario','getHistoricalAnalogs','getHistoricalEvolution','getOperationalSupport','getCommunitySupport','getOperationalCoverage','getRoadDependencies','getCausalTimeline']);
const error=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export function answerMapIntents(tool,args,result){
 if(tool==='getRoadDependencies'&&args.road)return[{type:'FOCUS_ROAD',road:roadKey(args.road)}];
 if(tool==='getCommunitySupport')return[{type:'SHOW_COMMUNITIES',entityIds:(result.communities??[result.community]).filter(Boolean).map(c=>c.id),filter:args.filter??null,road:args.road??null}];
 if(tool==='runScenario')return[{type:'ENTER_SCENARIO',failures:result.scenario?.snapshot?.scenario?.assumption??[]}];
 if(tool==='getOperationalCoverage')return[{type:'SHOW_COVERAGE',category:args.type??'emergency_hospital'}];
 if(tool==='getHistoricalSnapshot'&&result.snapshot)return[{type:'SHOW_HISTORICAL_SNAPSHOT',at:result.snapshot.knownAt}];
 return[];
}
function roadSummary(info={}){
 const observations=info.observations??[],state=info.state==='INGESTED_RESTRICTION'?'Route affected by a published restriction'+(observations.length?': '+observations.map(o=>`${o.road} · observed ${o.observedAt??'time not published'}`).join('; '):''):info.state==='NO_INGESTED_RESTRICTION'?'No currently ingested restriction affects this calculated route':info.state==='PARTIAL_COVERAGE'?'No matched restriction in the returned partial road coverage':info.state==='LAST_KNOWN'?'Road information is out of date':'Road information is unavailable';
 return state+'. '+(info.checkedAt?'Source checked '+info.checkedAt+'. ':'')+(info.limitation??'A calculated route does not establish road safety.');
}
export class SituationAsk{
  constructor(service){this.service=service;this.metrics={successfulToolCalls:0,abstentions:0,unsupportedAnswerBlocks:0};}
  authorize(actor,id,at){assertCan(actor,'read:incident_command');if(!id)throw error('incident_required');assertIncidentScope(actor,id);if(at)assertCan(actor,'read:replay');return canonicalIncidentId(id);}
  async tool(actor,name,args={}){
    if(!SITUATION_TOOLS.includes(name)||Object.keys(args).some(k=>!['incidentId','at','since','type','capability','entityId','routeId','road','kind','from','to','ranking','contact','order','filter','failures'].includes(k))||Object.entries(args).some(([k,v])=>v!==null&&(typeof v!=='string'||v.length>(k==='failures'?2400:180)))||(args.ranking&&!['STRAIGHT_LINE','CALCULATED_ROAD'].includes(args.ranking))||(args.contact&&args.contact!=='PUBLIC_PHONE'))throw error('unapproved_tool_or_arguments');
    const id=this.authorize(actor,args.incidentId,args.at??args.since??args.from??(name.startsWith('getHistorical')?'history':null)),view=await this.service.snapshot(id,args.at);
    if(!view.snapshot)return view;
    const s=view.snapshot,facilities=()=>s.facilities.filter(f=>(!args.type||f.canonicalType===args.type)&&(!args.contact||Boolean(f.contact?.phone))),route=()=>s.routes.find(r=>args.routeId?r.id===args.routeId:r.facilityId===args.entityId);
    const minutes=f=>Math.min(...s.routes.filter(r=>r.facilityId===f.id&&r.state==='CALCULATED'&&Number.isFinite(r.travelTimeMinutes)).map(r=>r.travelTimeMinutes));
    const rank=rows=>args.ranking==='CALCULATED_ROAD'?rows.filter(f=>Number.isFinite(minutes(f))).sort((a,b)=>minutes(a)-minutes(b)||a.id.localeCompare(b.id)):rows.sort((a,b)=>a.distanceKm-b.distanceKm);
    let result;
    switch(name){
      case 'getOperationalSupport':result={support:await this.service.support(id,args.at)};break;
      case 'getCommunitySupport':{
        const support=await this.service.support(id,args.at);let communities=support.communities??[];
        if(args.entityId)communities=communities.filter(c=>c.id===args.entityId);
        if(args.road)communities=communities.filter(c=>c.groups.find(g=>g.id==='emergency_hospital')?.primary?.roads.includes(roadKey(args.road)));
        if(args.filter==='SINGLE_FIRE')communities=communities.filter(c=>c.groups.find(g=>g.id==='fire_response')?.options.length===1);
        else if(args.filter==='SINGLE_HEALTHCARE')communities=communities.filter(c=>c.groups.find(g=>g.id==='emergency_hospital')?.options.length===1);
        else if(args.filter==='RECEPTION')communities=communities.filter(c=>c.nearbyDesignations.length);
        else if(args.filter)throw error('community_filter_invalid');
        if(args.order==='LONGEST_HEALTHCARE')communities=communities.filter(c=>c.groups.find(g=>g.id==='emergency_hospital')?.primary).sort((a,b)=>b.groups.find(g=>g.id==='emergency_hospital').primary.minutes-a.groups.find(g=>g.id==='emergency_hospital').primary.minutes);
        else if(args.order)throw error('community_order_invalid');
        result=args.entityId?{community:communities[0]??null}:{communities,scope:'Retained settlements and facility-to-settlement routes only',basis:args.order??args.filter??'INCIDENT_PROXIMITY'};break;
      }
      case 'getOperationalCoverage':{const support=await this.service.support(id,args.at);result={coverage:(support.coverage??[]).filter(c=>!args.type||c.category===args.type)};break;}
      case 'getRoadDependencies':{
        const support=await this.service.support(id,args.at);result={support:{snapshotId:support.snapshotId,knownAt:support.knownAt,corridors:support.corridors},...args.road?{selectedRoad:roadKey(args.road)}:{}};
        if(args.road)result.roadDependencies=(support.corridors??[]).filter(c=>c.road===roadKey(args.road)).flatMap(c=>c.relationships).filter(r=>!args.type||r.category===args.type).map(r=>({...r,name:s.facilities.find(f=>f.id===r.facilityId)?.canonicalName,routeId:r.from,state:'CALCULATED'}));
        break;
      }
      case 'getCausalTimeline':result=await this.service.causalTimeline(id,args.at);break;
      case 'getIncidentBrief':result={brief:await this.service.briefing(id,args.at)};break;
      case 'getMaterialChanges':result=args.since?await this.service.compare(id,args.since,args.at??s.knownAt):args.at?{changes:s.changes??[]}:await this.service.whatMatters(id);break;
      case 'getRouteRoads':result={intelligence:await this.service.facilityRoute(id,args.entityId,args.at)};break;
      case 'getAccessDependencies':{const access=await this.service.access(id,args.at);result={access,...args.road?{road:roadKey(args.road),roadDependencies:s.routes.filter(r=>significantRoads(r).includes(roadKey(args.road))).map(r=>({facilityId:r.facilityId,name:s.facilities.find(f=>f.id===r.facilityId)?.canonicalName,routeId:r.id,state:r.state,calculatedAt:r.calculatedAt,direction:r.direction}))}:{} };break;}
      case 'getAlternativeFacilities':result={access:await this.service.access(id,args.at)};break;
      case 'runScenario':{let assumption={kind:args.kind??'ROAD_UNAVAILABLE',entityId:args.road??args.entityId};if(args.failures){try{assumption=JSON.parse(args.failures);}catch{throw error('scenario_assumption_invalid');}}result={scenario:await this.service.simulate(id,assumption,args.at)};break;}
      case 'compareSnapshots':if(!args.from||!args.to||Date.parse(args.from)>Date.parse(args.to))throw error('ordered_comparison_times_required');result=await this.service.compare(id,args.from,args.to);break;
      case 'getHistoricalAnalogs':result={analogs:await this.service.analogs(id,candidate=>{try{assertIncidentScope(actor,candidate);return true;}catch{return false;}},args.at)};break;
      case 'getHistoricalEvolution':if(!args.from)throw error('historical_time_required');result=await this.service.evolution(id,args.from);break;
      case 'getIncident':result={incident:s.incident,perimeter:s.perimeter};break;
      case 'getIncidentChanges':result=args.since?await this.service.compare(id,args.since,args.at??s.knownAt):args.at?{changes:s.changes}:await this.service.whatMatters(id);break;
      case 'getFacilitiesNearIncident':result={facilities:rank(facilities()),rankingBasis:args.ranking??'STRAIGHT_LINE',rankings:s.rankings};break;
      case 'getQualifiedFacilities':{
        const key={emergency_department:'emergencyDepartment',fire_response:'fireResponse'}[args.capability];if(!key)throw error('capability_not_supported');
        result={facilities:rank(facilities().filter(f=>f.fields?.['capabilities.'+key]?.state==='RESOLVED'&&f.capabilities?.[key]===true)),rankingBasis:args.ranking??'STRAIGHT_LINE',rankings:s.rankings};break;
      }
      case 'getFacilityDetails':result={facility:s.facilities.find(f=>f.id===args.entityId)??null,why:await this.service.why(id,args.entityId,args.at)};break;
      case 'getFacilityRoute':{const intelligence=await this.service.facilityRoute(id,args.entityId,args.at);result={route:intelligence.route??null,intelligence};break;}
      case 'getRoadState':result={routeId:route()?.id??null,roadInformation:route()?.roadInformation??{state:'UNAVAILABLE'},restrictions:s.roadReports.filter(r=>route()?.restrictionIds.includes(r.id))};break;
      case 'getRelevantWeather':result={weather:s.weather};break;
      case 'getThermalObservations':result={observations:s.thermal.slice(0,30),returnedCount:s.thermal.length};break;
      case 'getOfficialRefuges':result={facilities:s.facilities.filter(f=>['official_wildfire_refuge','temporary_reception_center'].includes(f.canonicalType)&&f.designation?.kind).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,30),activeReception:s.rankings.activeReception};break;
      case 'getSourceHealth':result={sources:s.sources};break;
      case 'getIntelligenceGaps':result={gaps:this.service.gaps(s)};break;
      case 'getImpactChain':result={chains:(s.impactChains??[]).filter(c=>!args.entityId||c.dependencies?.includes(args.entityId)).slice(0,10)};break;
      case 'getHistoricalSnapshot':result={snapshot:s};break;
    }
    this.metrics.successfulToolCalls++;return{state:'AVAILABLE',mode:view.mode,knownAt:s.knownAt,snapshotId:s.id,tool:name,result};
  }
  parse(question,snapshot,contextEntityId=null){
    const q=normalize(question);if(!q||q.length>800)return null;
    if(/\b(sql|http|delete|update|insert|ignore|safest|seguro|evacuate|evacuar|definitely reachable)\b/.test(q))return null;
    const matched=snapshot?.facilities.filter(f=>f.canonicalName&&q.includes(normalize(f.canonicalName))).sort((a,b)=>b.canonicalName.length-a.canonicalName.length)??[];
    const entityId=matched.length===1?matched[0].id:matched.length===0&&snapshot?.facilities.some(f=>f.id===contextEntityId)?contextEntityId:null;
    const road=q.match(/\b(?:n|en|a|ip|ic|em|cm)\s*\d+(?:-\d+)?\b/)?.[0]?.replace(/\s/g,'').toUpperCase();
    const community=snapshot?.places?.filter(p=>p.kind==='settlement'&&p.name&&q.includes(normalize(p.name))).sort((a,b)=>b.name.length-a.name.length)[0];
    if(/what if|what happens if|e se/.test(q)){const roads=[...q.matchAll(/\b(?:n|en|a|ip|ic|em|cm)\s*\d+(?:-\d+)?\b/g)].map(m=>roadKey(m[0])),failures=[...new Set(roads)].map(entityId=>({kind:'ROAD_UNAVAILABLE',entityId}));for(const f of matched)failures.push({kind:'FACILITY_UNAVAILABLE',entityId:f.id});return failures.length?{tool:'runScenario',failures:JSON.stringify(failures)}:null;}
    if(/settlement|communit|povoac|localidade|aldeia/.test(q)||community){return {tool:'getCommunitySupport',...community?{entityId:community.id}:{},...road?{road}:{},.../longest|mais demor/.test(q)?{order:'LONGEST_HEALTHCARE'}:/only one.*hospital|one retained hospital|apenas um.*hospital/.test(q)?{filter:'SINGLE_HEALTHCARE'}:/only one.*fire|one retained fire|apenas um.*bombeir/.test(q)?{filter:'SINGLE_FIRE'}:/reception|refuge|acolhimento/.test(q)?{filter:'RECEPTION'}:{}};}
    if(/operational support|support options|apoio operacional/.test(q))return {tool:'getOperationalSupport'};
    if(/coverage|cobertura/.test(q))return {tool:'getOperationalCoverage'};
    if(/causal|what changed because/.test(q))return {tool:'getCausalTimeline'};
    if(/depend|which roads.*support|routes.*share|share.*road|routes.*use/.test(q))return {tool:'getRoadDependencies',...road?{road}:{},.../hospital/.test(q)?{type:'emergency_hospital'}:/fire/.test(q)?{type:'fire_response'}:{}};
    if(/brief me|incident brief|resumo/.test(q))return {tool:'getIncidentBrief'};
    if(/similar|analog|comparavel/.test(q))return {tool:'getHistoricalAnalogs'};
    if(/what if|what happens if|e se/.test(q)&&road)return {tool:'runScenario',road};
    if(/depend|corridor|resilience|redundan/.test(q))return {tool:'getAccessDependencies',...road?{road}:{}};
    if(/alternative hospital|alternativa|alternative facility/.test(q))return {tool:'getAlternativeFacilities'};
    if(/hospital/.test(q)&&/by road|por estrada|shortest.*time/.test(q))return {tool:'getQualifiedFacilities',type:'hospital',capability:'emergency_department',ranking:'CALCULATED_ROAD'};
    if(/hospital/.test(q)&&/with.*(?:phone|contact)|com.*(?:telefone|contacto)/.test(q))return {tool:'getFacilitiesNearIncident',type:'hospital',contact:'PUBLIC_PHONE'};
    if(/civil protection|protecao civil/.test(q)&&!entityId)return {tool:'getFacilitiesNearIncident',type:'civil_protection'};
    if(/how.*reach|como.*cheg/.test(q)&&entityId)return {tool:'getFacilityRoute',entityId};
    if(/know at|sabia.*\d|knew at/.test(q))return {tool:'getHistoricalSnapshot'};
    if(/why.*chang|porque.*mud/.test(q))return {tool:'getImpactChain'};
    if(/what matters|importa/.test(q))return {tool:'getMaterialChanges'};
    if(/what changed|changes|mudou|alterou/.test(q))return {tool:'getIncidentChanges'};
    if(/historical|history|sabia|snapshot|know an hour ago/.test(q))return {tool:'getHistoricalSnapshot'};
    if(/why|porque|destacad/.test(q))return entityId?{tool:'getFacilityDetails',entityId}:null;
    if(/restriction|restric|closure|cortad|encerrad/.test(q))return entityId?{tool:'getRoadState',entityId}:null;
    if(/route|road|rota|estrada/.test(q))return entityId?{tool:'getFacilityRoute',entityId}:null;
    if(/phone|telefone|address|morada|open|aberto/.test(q)&&entityId)return {tool:'getFacilityDetails',entityId};
    if(/hospital/.test(q))return /verified|emergency|urgencia|verificad|look at first|most useful/.test(q)?{tool:'getQualifiedFacilities',type:'hospital',capability:'emergency_department'}:{tool:'getFacilitiesNearIncident',type:'hospital'};
    if(/fire station|bombeir/.test(q))return /verified|verificad/.test(q)?{tool:'getQualifiedFacilities',type:'fire_station',capability:'fire_response'}:{tool:'getFacilitiesNearIncident',type:'fire_station'};
    if(/refuge|refugio|acolhimento/.test(q))return {tool:'getOfficialRefuges'};
    if(/stale|source|desatualiz|fonte/.test(q))return {tool:'getSourceHealth'};
    if(/missing|gap|falta/.test(q))return {tool:'getIntelligenceGaps'};
    if(/weather|wind|vento|tempo/.test(q))return {tool:'getRelevantWeather'};
    if(/thermal|termic/.test(q))return {tool:'getThermalObservations'};
    return null;
  }
  // A model can select existing claims by ID. Free-form model text never crosses this boundary.
  groundedSelection(proposal,claims){if(!proposal||Object.keys(proposal).some(k=>k!=='claimIds')||!Array.isArray(proposal.claimIds)||proposal.claimIds.some(id=>!claims.some(c=>c.id===id))){this.metrics.unsupportedAnswerBlocks++;throw error('unsupported_model_claim');}return proposal.claimIds.map(id=>claims.find(c=>c.id===id));}
  async answer(actor,{incidentId,question,asOf=null,entityId=null}={}){
    if(!asOf&&/know an hour ago|sabia ha uma hora/i.test(normalize(question)))asOf=new Date(this.service.clock().getTime()-3600000).toISOString();
    const historical=String(question??'').match(/(?:know at|knew at|sabia (?:as|às))\s+(\d{1,2}):(\d{2})/i);
    if(!asOf&&historical){if(+historical[1]>23||+historical[2]>59)throw error('historical_time_invalid');asOf=this.service.clock().toISOString().slice(0,10)+'T'+historical[1].padStart(2,'0')+':'+historical[2]+':00.000Z';}
    const id=this.authorize(actor,incidentId,asOf),view=await this.service.snapshot(id,asOf);let intent=this.parse(question,view.snapshot,entityId);
    if(!intent&&view.snapshot&& !/ignore|sql|delete|evacuat|safest/i.test(question)){const s=view.snapshot,proposal=await this.service.knowledge?.model.intent?.({question,tools:SITUATION_TOOLS,entities:s.facilities.map(f=>({id:f.id,name:f.canonicalName})),roads:[...new Set(s.routes.flatMap(significantRoads))],communities:s.places.filter(p=>p.kind==='settlement').map(p=>({id:p.id,name:p.name}))});if(proposal&&Object.keys(proposal.args).every(k=>['entityId','road','type','capability','filter','order','ranking'].includes(k))&&(!proposal.args.entityId||[...s.facilities,...s.places].some(f=>f.id===proposal.args.entityId))&&(!proposal.args.road||s.routes.some(r=>significantRoads(r).includes(roadKey(proposal.args.road)))))intent={tool:proposal.tool,...proposal.args};}

    if(!intent){this.metrics.abstentions++;return{state:'ABSTAINED',answer:'Ask about a named facility, verified capability, routes, changes, weather, sources or missing information. VIGIA cannot confirm safety or give an evacuation recommendation.',results:[],toolCalls:[]};}
    const {tool,...args}=intent;
    if(tool==='getHistoricalSnapshot'&&!asOf)return {state:'ABSTAINED',answer:'Choose a historical time in UTC to inspect what VIGIA knew then.',results:[],toolCalls:[]};
    const since=String(question).match(/(?:since|desde)\s+(\d{1,2}):(\d{2})/i);let from=null;
    if(tool==='getIncidentChanges'&&since){if(+since[1]>23||+since[2]>59)throw error('historical_time_invalid');from=(asOf??this.service.clock().toISOString()).slice(0,10)+'T'+since[1].padStart(2,'0')+':'+since[2]+':00.000Z';}
    else if(tool==='getIncidentChanges'&&/last hour|ultima hora/i.test(normalize(question)))from=new Date(Date.parse(asOf??this.service.clock().toISOString())-3600000).toISOString();
    const callArgs={incidentId:id,at:asOf,...args,...from?{since:from}:{}},response=await this.tool(actor,tool,callArgs),calls=[{name:tool,args:callArgs,snapshotId:response.snapshotId}];
    if(response.state!=='AVAILABLE')return{...response,answer:'Not available for this time. No retained situation snapshot exists.',results:[],toolCalls:calls};
    const r=response.result,claims=[];const add=(text,evidence)=>claims.push({id:'claim:'+hash([response.snapshotId,text,evidence]),text,grounding:{snapshotId:response.snapshotId,tool,knownAt:response.knownAt,...evidence}});
    if(r.support&&tool==='getRoadDependencies'){const corridors=(r.support.corridors??[]).filter(c=>!args.road||c.road===roadKey(args.road));for(const c of corridors.slice(0,5)){const rows=c.relationships.filter(d=>!args.type||d.category===args.type);if(rows.length)add(c.road+' supports '+new Set(rows.map(d=>d.from)).size+' retained qualified calculated routes. This is a named corridor dependency, not a verified shared physical segment.',{relationshipIds:rows.map(d=>d.id),calculatedAt:rows.map(d=>d.calculatedAt).sort()[0]});}if(!claims.length)add('No matching current qualified route dependency is retained.',{});}
    if(r.support&&tool!=='getRoadDependencies'){const primary=r.support.groups?.filter(g=>g.primary&&['emergency_hospital','fire_response','designated_reception'].includes(g.id))??[];for(const g of primary)add(g.label+': '+g.primary.name+' · '+Math.round(g.primary.minutes)+' minutes calculated, facility to incident. '+(g.secondary?'Alternative: '+g.secondary.name+' · '+Math.round(g.secondary.minutes)+' minutes.':'No current qualified alternative route retained.'),{entityId:g.primary.facilityId,calculatedAt:g.primary.calculatedAt,validUntil:g.primary.validUntil,evidence:g.primary.evidence});if(!primary.length)add('No current qualified support routes are retained for this time.',{});}
    if(r.communities){add(r.communities.length+' settlements match this question in the retained set. Facility-to-settlement route calculations do not establish safe access.',{basis:r.basis});}
    if(r.community)add(r.community.name+': '+Number(r.community.distanceKm).toFixed(1)+' km from the reported incident point.',{entityId:r.community.id,evidence:[{source:r.community.source,receivedAt:r.community.receivedAt}]});
    if(r.coverage)add('Coverage describes retained calculated paths to settlement points. No continuous coverage boundary is inferred.',{});
    if(r.causalEvents)add(r.causalEvents.length+' material causal events are retained at this snapshot.',{});
    if(r.facilities){const f=r.facilities[0];if(f){const qualification=tool==='getQualifiedFacilities'?args.capability==='emergency_department'?'hospital with a verified emergency department':'facility with verified fire-response capability':args.type==='hospital'?'mapped hospital':args.type==='fire_station'?'mapped fire station':args.type==='civil_protection'?'civil-protection facility':'returned officially designated support point';add(`${f.canonicalName??'Unnamed facility'} ${r.rankingBasis==='CALCULATED_ROAD'?'is the first-ranked':'is the closest'} ${qualification}${r.rankingBasis==='CALCULATED_ROAD'?' by calculated travel time':''}${args.contact?' with a public phone':''} in the retained results: ${f.distanceKm.toFixed(1)} km from the reported incident point.`,{entityId:f.id,evidence:f.evidence,rankingBasis:r.rankingBasis??'STRAIGHT_LINE'});
      const route=await this.tool(actor,'getFacilityRoute',{incidentId:id,at:asOf,entityId:f.id});calls.push({name:'getFacilityRoute',args:{entityId:f.id},snapshotId:route.snapshotId});const rr=route.result?.route;if(rr){add(`${rr.direction==='FACILITY_TO_INCIDENT'?'Facility to incident':'Incident to facility'}: ${rr.state==='CALCULATED'?`${Math.round(rr.travelTimeMinutes)} min estimated, ${rr.distanceKm.toFixed(1)} km by road`:'a current usable road estimate is unavailable'}. Named segments: ${significantRoads(rr).join(' → ')||'not returned'}.`,{routeId:rr.id,source:rr.source,calculatedAt:rr.calculatedAt,validUntil:rr.validUntil});add(roadSummary(rr.roadInformation),{routeId:rr.id,roadInformation:rr.roadInformation});}
    }else add('No facility with this qualification is retained for this incident. This does not establish that none exists.',{resultPath:'facilities'});}
    else if(r.why){
      const q=normalize(question),f=r.facility;
      if(/phone|telefone/.test(q))add(f?.contact?.phone?`${f.canonicalName}: public phone ${f.contact.phone}.`:'A public phone number is not verified in the retained information.',{entityId:f?.id,evidence:f?.evidence});
      else if(/address|morada/.test(q))add(f?.address?.street?`${f.canonicalName}: ${[f.address.street,f.address.postcode,f.address.locality].filter(Boolean).join(', ')}.`:'An address is not verified in the retained information.',{entityId:f?.id,evidence:f?.evidence});
      else if(/open|aberto/.test(q))add('Current opening or admission status is not verified in this retained situation.',{entityId:f?.id,resultPath:'facility'});
      else for(const c of r.why.claims??[])add(c.text,{relationship:c});
    }
    else if(r.brief)add(`${r.brief.incident?.name??'Incident'}: retained briefing at ${response.knownAt}.`,{resultPath:'brief'});
    else if(r.scenario)add(`Scenario — not observed reality. ${r.scenario.resilience?.routes.length??0} retained routes change under this assumption.`,{resultPath:'scenario',basedOn:r.scenario.snapshot?.scenario?.basedOn});
    else if(r.roadDependencies)add(`${r.roadDependencies.length} retained facility routes use ${r.road}. Inspect route state and calculation times; a retained route is not proof of current access.`,{resultPath:'roadDependencies',routeIds:r.roadDependencies.map(r=>r.routeId)});
    else if(r.access)add(r.access.corridors.length?`${r.access.corridors.length} shared named-road dependencies in the returned qualified routes.`:'No shared named-road dependency is established by the currently qualified returned routes.',{resultPath:'access',snapshotId:r.access.snapshotId});
    else if(r.analogs)add(r.analogs.matches?.length?`${r.analogs.matches.length} retained earlier incidents meet the explicit comparison rules.`:'There is insufficient comparable retained history. No historical analog is inferred.',{resultPath:'analogs'});
    else if(r.route)add(`Retained route (${r.route.state.toLowerCase()}, calculated ${r.route.calculatedAt}) uses ${r.intelligence?.majorRoads.join(' → ')||'no major named segments returned'}. ${r.route.roadInformation.limitation}`,{routeId:r.route.id,source:r.route.source,calculatedAt:r.route.calculatedAt});
    else if(r.roadInformation)add(roadSummary(r.roadInformation),{roadInformation:r.roadInformation});
    else if(r.changes)add(r.state==='HISTORY_UNAVAILABLE'?'Not available for this time. No retained comparison snapshot exists.':r.changes.length?`${(r.material??r.changes).length} meaningful retained changes. Inspect the structured changes for affected entities and times.`:'No meaningful changes are retained for this interval.',{changes:(r.material??r.changes).map(c=>c.id)});
    else if(r.weather){const q=normalize(question),keys=/temperatur/.test(q)?['temperature']:/humid/.test(q)?['humidity']:/wind|vento/.test(q)?['windSpeed']:['windSpeed','temperature','humidity'],readings=keys.map(k=>r.weather[k]).filter(m=>Number.isFinite(m?.value));add(readings.length?`${r.weather.station?.name??'Retained weather station'}: ${readings.map(m=>`${m.label??'Reading'} ${m.value} ${m.unit??''}, measured ${m.observedAt}`).join('; ')}. ${r.weather.station?.distanceKm!==undefined?r.weather.station.distanceKm+' km from the incident. ':''}Regional context; conditions at the incident may differ.`:'No applicable retained weather reading is available.',{station:r.weather.station,readings});}
    else if(r.observations){const latest=r.observations.map(o=>o.observedAt).filter(Boolean).sort().at(-1);add(latest?`${r.returnedCount} retained thermal observations; latest observed ${latest}. Thermal detections are not an official fire perimeter.`:'No matching thermal observation is retained. This does not establish absence of fire.',{observationIds:r.observations.map(o=>o.id),latest});}
    else if(r.sources)add(`${r.sources.filter(s=>s.state!=='CURRENT').length} of ${r.sources.length} retained sources are stale, unavailable or last known.`,{sources:r.sources.map(s=>({id:s.id,state:s.state}))});
    else if(r.gaps)add(`${r.gaps.length} prioritized facility information gaps are retained.`,{entities:r.gaps.map(g=>g.entityId)});
    else if(r.chains)add(r.chains.length?`${r.chains.length} retained impact chains explain dependent changes.`:'No impact chain is retained for this selection.',{chains:r.chains.map(c=>c.id)});
    else add('The retained backend result is available below.',{resultPath:Object.keys(r).join(',')});
    return{state:'ANSWERED',uiIntents:answerMapIntents(tool,args,r),intent:tool,answer:claims[0]?.text,primaryAnswer:(response.mode==='HISTORICAL'?'Historical view · '+response.knownAt+'. ':'')+(claims[0]?.text??''),claims,results:[r],toolCalls:calls,asOf:response.knownAt,mode:response.mode,limitations:['Retained knowledge; nearest is not safest or confirmed available. ']};
  }
}
