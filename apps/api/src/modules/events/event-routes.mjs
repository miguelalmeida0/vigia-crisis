import { readJsonBody } from '../../http/body.mjs';
import { json, problem } from '../../http/responses.mjs';
import { PORTUGAL_BBOX } from '../live/live-thermal-adapter.mjs';
import { assertIncidentScope, incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';
import { publicSourceProjection } from '../mission/ground-truth-service.mjs';

function parseBbox(value) {
  if (!value) return PORTUGAL_BBOX;
  const parts = String(value).split(',').map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : PORTUGAL_BBOX;
}

function publicMethod(method,index){return{kind:method.kind,methodType:method.methodType,availability:method.availability,label:method.kind==='FUTURE'?method.label:`${method.kind==='CURRENT'?'Connected':'Manual'} observation option`,informationGain:method.informationGain,latency:method.latency,reliability:method.reliability,cost:method.cost,scheduledAt:method.scheduledAt??null,ownerId:null,commitment:method.commitment?{scheduleState:method.commitment.scheduleState}:null,publicId:`option-${index+1}`};}
function publicNeed(need){return need?{state:need.state,missingQuantity:need.missingQuantity,reason:need.reason,nextObservationAt:need.nextObservationAt??null,ranking:need.ranking,candidateMethods:(need.candidateMethods??[]).map(publicMethod)}:null;}
const INTERNAL_PHYSICAL_TYPES=new Set(['field','camera','ground_sensor','groundSensor','drone']);
function internalPhysical(item){return INTERNAL_PHYSICAL_TYPES.has(item?.type);}
function publicThermalObservation(item,index){return{id:item.id??`thermal-observation-${index+1}`,type:'thermal',source:item.source??null,sourceFamily:item.sourceFamily??null,measurementType:item.measurementType??null,polarity:item.polarity??null,at:item.at??item.observedAt??null,observedAt:item.observedAt??item.at??null,coordinate:item.coordinate??null,frpMw:item.frpMw??item.measurement?.frpMw??null,brightnessKelvin:item.brightnessKelvin??item.measurement?.brightnessKelvin??null,qualityState:item.qualityState??null,freshness:item.freshness??null,sensorId:null,evidenceUrl:null,independenceGroup:`source-group-${index+1}`,instrument:null,metadata:{negativeEvidenceEligible:item.metadata?.negativeEvidenceEligible===true}};}
function publicObservation(item,index){const internal=internalPhysical(item);if(internal)return{id:`physical-observation-${index+1}`,type:item.type,at:item.at??item.observedAt??null,observedAt:item.observedAt??item.at??null,label:`Attributable ${String(item.type).replaceAll('_',' ')} observation`,source:'Attributable physical evidence',sensorId:null,evidenceUrl:null,independenceGroup:`source-group-${index+1}`,instrument:null,metadata:{locationSource:item.metadata?.locationSource??null,negativeEvidenceEligible:item.metadata?.negativeEvidenceEligible===true}};if(item?.type==='thermal')return publicThermalObservation(item,index);const{sensorId,evidenceUrl,metadata,independenceGroup,instrument,provenance,rawSourceProductId,rawSourceProductIds,processing,rawPayload,...safe}=item;return{...safe,id:item.id,sensorId:null,evidenceUrl:null,independenceGroup,instrument:null,metadata:metadata?{locationSource:metadata.locationSource??null,negativeEvidenceEligible:metadata.negativeEvidenceEligible===true}:null};}
function publicFusion(fusion){
  if(!fusion)return fusion;
  const groupMap=new Map((fusion.witnesses??[]).map((item,index)=>[item.dependencyGroup,`source-group-${index+1}`]));
  const publicGroup=(value,index=0)=>groupMap.get(value)??`source-group-${index+1}`;
  return{
    state:fusion.state,evidenceStrength:fusion.evidenceStrength,independentFamilies:fusion.independentFamilies,physicalObservationCount:fusion.physicalObservationCount,reportObservationCount:fusion.reportObservationCount,
    calibrated:fusion.calibrated===true,existenceProbability:fusion.existenceProbability??null,probabilityReason:fusion.probabilityReason??null,
    witnesses:(fusion.witnesses??[]).map((item,index)=>({dependencyGroup:publicGroup(item.dependencyGroup,index),observationCount:item.observationCount??0,latestAt:item.latestAt??null,source:internalPhysical(item)?'Attributable physical evidence':item.source??null,type:item.type??null,sourceFamily:item.sourceFamily??null,measurementType:item.measurementType??null,polarity:item.polarity??null})),
    dependencies:(fusion.dependencies??[]).map((item,index)=>({dependencyGroup:publicGroup(item.dependencyGroup,index),observationCount:item.observationIds?.length??0,note:item.note??null,observationIds:[]})),
    ambiguities:(fusion.ambiguities??[]).map((item)=>({kind:item.kind,supportGroups:(item.supportGroups??[]).map(publicGroup),negativeGroups:(item.negativeGroups??[]).map(publicGroup),observationIds:Array.isArray(item.observationIds)?[]:undefined}))
  };
}
function publicOpportunity(value,index=0){if(!value)return value;return{state:value.state,availability:value.availability??null,scheduledAt:value.scheduledAt??null,timingState:value.timingState??null,id:value.id?`public-observation-option-${index+1}`:undefined,label:value.label?'Observation option':undefined};}
function publicFireEvidenceState(value){if(!value)return value;const next=value.nextObservationOpportunity??value.nextObservation??null,publicNext=next?{...publicOpportunity(next),options:(next.options??[]).map(publicOpportunity)}:null;return{state:value.state,physicalEvidence:(value.physicalEvidence??[]).map((item,index)=>({dependencyGroup:`source-group-${index+1}`,sourceFamily:item.sourceFamily??null,measurementType:item.measurementType??null,source:internalPhysical(item)?'Attributable physical evidence':item.source,type:item.type,platform:internalPhysical(item)?null:item.platform,instrument:internalPhysical(item)?null:item.instrument,latestAt:item.latestAt??null,observationCount:item.observationCount??0,polarity:item.polarity??null})),reportEvidence:value.reportEvidence?{present:value.reportEvidence.present===true,observationCount:value.reportEvidence.observationCount??0,latestAt:value.reportEvidence.latestAt??null,source:value.reportEvidence.source??null}:null,contradictions:(value.contradictions??[]).map(({observationIds,...item})=>({...item,observationIds:observationIds?[]:undefined})),unresolvedObservations:[],dependencyGroups:(value.dependencyGroups??[]).map((_,index)=>`source-group-${index+1}`),independenceGroups:(value.independenceGroups??[]).map((_,index)=>`source-group-${index+1}`),physicalFamilies:value.physicalFamilies??[],physicalSourceFamilies:value.physicalSourceFamilies??[],physicalSourceFamilyCount:value.physicalSourceFamilyCount??0,twoPhysicalSourceFamilies:value.twoPhysicalSourceFamilies===true,physicalFreshness:value.physicalFreshness??null,freshness:value.freshness??null,coverageGaps:value.coverageGaps??[],associationAmbiguity:value.associationAmbiguity?{state:value.associationAmbiguity.state,count:value.associationAmbiguity.count,reasonCodes:[]}:null,nextObservationOpportunity:publicNext,nextObservation:publicNext,calibrated:value.calibrated===true,existenceProbability:value.existenceProbability??null,probabilityReason:value.probabilityReason??null};}
function publicSourceProfile(value){if(!value)return value;return{...value,independenceGroups:(value.independenceGroups??[]).map((_,index)=>`source-group-${index+1}`)};}
function publicPhysicalState(value){if(!value)return value;return{...value,sensor:null,physical:value.physical?{...value.physical,sensor:null}:value.physical};}
function publicSensorCoverage(value){if(!value)return value;return Object.fromEntries(Object.entries(value).map(([key,item])=>{if(!item||typeof item!=='object'||Array.isArray(item))return[key,item];const internal=['camera','groundSensor','drone','field'].includes(key);const{sensorId,...safe}=item;return[key,{...safe,sensors:internal?[]:safe.sensors}];}));}
function publicTimeline(items=[]){return items.map((item,index)=>{const internal=internalPhysical(item);if(internal)return{id:`physical-timeline-${index+1}`,type:item.type,at:item.at??item.observedAt??null,observedAt:item.observedAt??item.at??null,sensor:null,instrument:null,independenceGroup:`source-group-${index+1}`,label:`Attributable ${String(item.type).replaceAll('_',' ')} observation`};if(item?.type==='thermal')return publicThermalObservation(item,index);return{...item};});}
function publicDetectionTiming(value){return value?{traceId:null,providerObservationAt:value.providerObservationAt??null,apiAvailableAt:value.apiAvailableAt??null,uiFirstSeenAt:value.uiFirstSeenAt??null,uiAvailableAt:value.uiAvailableAt??null,uiFirstSeenSource:value.uiFirstSeenSource??null}:null;}
function publicAssociation(value){return value?{state:value.state,grade:value.grade,nearestDistanceKm:value.nearestDistanceKm,timeSeparationMinutes:value.timeSeparationMinutes,reasons:Array.isArray(value.reasons)?value.reasons.map(String):[]}:null;}
function publicThermal(value){return value?{samples:value.samples,firstMw:value.firstMw,latestMw:value.latestMw,maxMw:value.maxMw,direction:value.direction,currentDirection:value.currentDirection,lastObservedAt:value.lastObservedAt,ageMinutes:value.ageMinutes,currentSamples:value.currentSamples,series:publicTimeline(value.series??[])}:null;}
function publicResponse(value){return value?{state:value.state,source:value.source,observedAt:value.observedAt,status:value.status,personnel:value.personnel,groundVehicles:value.groundVehicles,aircraft:value.aircraft,burnedArea:value.burnedArea,officialProgression:value.officialProgression??[],limitation:value.limitation}:null;}
function publicActionNeed(value){return value?{kind:value.kind,needsRouting:value.needsRouting===true,reason:value.reason,missingQuantity:value.missingQuantity??null}:null;}
function publicObservationPlan(value){return value?{options:(value.options??[]).map(publicMethod),current:(value.current??[]).map(publicMethod),future:(value.future??[]).map(publicMethod),remote:(value.remote??[]).map(publicMethod),recommended:value.recommended?publicMethod(value.recommended,0):null}:null;}
function publicEvent(event){
  return{
    id:event.id,label:event.label,locationLabel:event.locationLabel,municipality:event.municipality,district:event.district,parish:event.parish,coordinate:event.coordinate,type:event.type??'fire_event',status:event.status??null,
    evidenceState:event.evidenceState,knowledgeState:event.knowledgeState,behaviorState:event.behaviorState,evolutionState:event.evolutionState,physicalOperationalState:event.physicalOperationalState,physicalFirst:event.physicalFirst===true,
    firstSeenAt:event.firstSeenAt,lastSeenAt:event.lastSeenAt,createdAt:event.createdAt,closedAt:event.closedAt??null,incidentIds:event.incidentIds??[],burnedAreaHa:event.burnedAreaHa??null,
    physicalState:publicPhysicalState(event.physicalState),reportState:event.reportState??null,physicalSourceProfile:publicSourceProfile(event.physicalSourceProfile),
    thermal:publicThermal(event.thermal),thermalSeries:publicTimeline(event.thermalSeries??[]),leadTime:event.leadTime??null,priority:event.priority??null,actionNeed:publicActionNeed(event.actionNeed),
    association:publicAssociation(event.association),candidateAssessment:event.candidateAssessment??null,prospectiveDetectionTiming:publicDetectionTiming(event.prospectiveDetectionTiming),
    weather:event.weather??null,risk:event.risk??null,response:publicResponse(event.response),thermalMemory:event.thermalMemory??null,siteContext:event.siteContext??null,operationalClass:event.operationalClass??null,coverage:event.coverage??null,mtg:event.mtg??null,
    evidenceNeed:publicNeed(event.evidenceNeed),observations:(event.observations??[]).map(publicObservation),evidenceFusion:publicFusion(event.evidenceFusion),fireEvidenceState:publicFireEvidenceState(event.fireEvidenceState),sensorCoverage:publicSensorCoverage(event.sensorCoverage),
    observationPlan:publicObservationPlan(event.observationPlan),timeline:publicTimeline(event.timeline)
  };
}
export function redactOperationalSnapshot(snapshot,actor){
  if(actor?.authentication?.authenticated){
    const events=(snapshot.events??[]).filter((item)=>incidentInScope(actor,item.id));
    const visible=new Set(events.map((item)=>String(item.id)));
    return{...snapshot,events,evidenceNeeds:(snapshot.evidenceNeeds??[]).filter((item)=>visible.has(String(item.subjectId)))};
  }
  const meta=snapshot.meta?{generatedAt:snapshot.meta.generatedAt??null,mode:snapshot.meta.mode??null,region:snapshot.meta.region??null,state:snapshot.meta.state??null}:undefined;
  const clocks=snapshot.clocks?Object.fromEntries(Object.entries(snapshot.clocks).map(([name,value])=>[name,{observedAt:value?.observedAt??null,receivedAt:value?.receivedAt??null,state:value?.state??null}])):undefined;
  return{...(meta?{meta}:{}),...(clocks?{clocks}:{}),sources:publicSourceProjection(snapshot.sources??{}),summary:snapshot.summary?{currentEvents:Number(snapshot.summary.currentEvents??0),currentPhysicalEvents:Number(snapshot.summary.currentPhysicalEvents??0),unresolvedEvidenceNeeds:Number(snapshot.summary.unresolvedEvidenceNeeds??0)}:undefined,evidenceNeeds:[],events:(snapshot.events??[]).map(publicEvent)};
}

const LIST_OBSERVATION_LIMIT=12;
const LIST_EVENT_LIMIT=40;
function sampled(items=[],limit=LIST_OBSERVATION_LIMIT){
  if(items.length<=limit)return items;
  const sorted=[...items].sort((a,b)=>Date.parse(a.at??a.observedAt??'')-Date.parse(b.at??b.observedAt??''));
  const required=[sorted[0],...sorted.filter((item)=>['report','report_update'].includes(item.type)),...new Map(sorted.map((item)=>[item.sourceFamily,item])).values()];
  const maxFrp=[...sorted].sort((a,b)=>Number(b.frpMw??b.measurement?.frpMw??-Infinity)-Number(a.frpMw??a.measurement?.frpMw??-Infinity))[0];
  const selected=new Map([...required,maxFrp,...sorted.slice(-(limit-required.length-1))].filter(Boolean).map((item)=>[item.id??`${item.at}:${item.sourceFamily}`,item]));
  return [...selected.values()].sort((a,b)=>Date.parse(a.at??a.observedAt??'')-Date.parse(b.at??b.observedAt??'')).slice(-limit);
}
function compactEvent(event){
  const observations=sampled(event.observations),ids=new Set(observations.map((item)=>item.id));
  const support=event.observedThermalSupport?.features?{...event.observedThermalSupport,features:event.observedThermalSupport.features.filter((item)=>ids.has(item.properties?.observationId))}:event.observedThermalSupport;
  const series=sampled(event.thermal?.series??[]),thermalSeries=sampled(event.thermalSeries??[]),timeline=sampled(event.timeline??[]),geometryTimeline=sampled(event.geometryTimeline??[]);
  return{...event,observations,timeline,geometryTimeline,observedThermalSupport:support,associationDecisions:(event.associationDecisions??[]).filter((item)=>ids.has(item.observationId)),thermal:event.thermal?{...event.thermal,series}:event.thermal,thermalSeries,observationInventory:{total:event.observations?.length??0,returned:observations.length,truncated:(event.observations?.length??0)>observations.length,detailHref:`/api/v10/events/${encodeURIComponent(event.id)}`}};
}
export function compactOperationalSnapshot(snapshot){const events=snapshot.events??[],returned=events.slice(0,LIST_EVENT_LIMIT).map(compactEvent);return{...snapshot,events:returned,eventInventory:{total:events.length,returned:returned.length,truncated:events.length>returned.length}};}
function compactNeed(need){return need?{id:need.id,state:need.state,missingQuantity:need.missingQuantity,reason:need.reason,evidenceRequestId:need.evidenceRequestId??null,selectedMethodId:need.selectedMethodId??null,nextObservationAt:need.nextObservationAt??null}:null;}
export function commandEventProjection(event){
  const timing=event.prospectiveDetectionTiming;
  return{
    id:event.id,label:event.label,coordinate:event.coordinate,type:event.type??'fire_event',evidenceState:event.evidenceState,knowledgeState:event.knowledgeState,behaviorState:event.behaviorState,evolutionState:event.evolutionState,physicalOperationalState:event.physicalOperationalState,
    firstSeenAt:event.firstSeenAt,lastSeenAt:event.lastSeenAt,createdAt:event.createdAt,physicalFirst:event.physicalFirst===true,incidentIds:event.incidentIds??[],
    physicalState:event.physicalState,reportState:event.reportState,physicalSourceProfile:event.physicalSourceProfile,
    thermal:event.thermal?{samples:event.thermal.samples,firstMw:event.thermal.firstMw,latestMw:event.thermal.latestMw,maxMw:event.thermal.maxMw,direction:event.thermal.direction,currentDirection:event.thermal.currentDirection,lastObservedAt:event.thermal.lastObservedAt}:null,
    leadTime:event.leadTime,priority:event.priority,actionNeed:event.actionNeed,evidenceNeed:compactNeed(event.evidenceNeed),
    association:event.association?{state:event.association.state,grade:event.association.grade,nearestDistanceKm:event.association.nearestDistanceKm,timeSeparationMinutes:event.association.timeSeparationMinutes}:null,
    candidateAssessment:event.candidateAssessment?{decision:event.candidateAssessment.decision,grade:event.candidateAssessment.grade,conclusion:event.candidateAssessment.conclusion,policyVersion:event.candidateAssessment.policyVersion,thresholdVersion:event.candidateAssessment.thresholdVersion,maxFrpMw:event.candidateAssessment.maxFrpMw}:null,
    prospectiveDetectionTiming:timing?{traceId:timing.traceId,providerObservationAt:timing.providerObservationAt,apiAvailableAt:timing.apiAvailableAt,uiFirstSeenAt:timing.uiFirstSeenAt,uiAvailableAt:timing.uiAvailableAt,uiFirstSeenSource:timing.uiFirstSeenSource}:null,
    observationInventory:{total:event.observations?.length??0,returned:0,truncated:true,detailHref:`/api/v10/events/${encodeURIComponent(event.id)}?projection=operator`},
    projection:{kind:'command-summary',detailOnSelection:true}
  };
}
export function commandOperationalSnapshot(snapshot){const events=snapshot.events??[],returned=events.slice(0,LIST_EVENT_LIMIT).map(commandEventProjection);return{...snapshot,evidenceNeeds:[],events:returned,eventInventory:{total:events.length,returned:returned.length,truncated:events.length>returned.length,projection:'command-summary'}};}
const OPERATOR_OBSERVATION_LIMIT=96;
const OPERATOR_OPPORTUNITY_RESULT_LIMIT=96;
function operatorObservations(items=[]){const sorted=[...items].sort((a,b)=>Date.parse(a.at??'')-Date.parse(b.at??'')),products=new Map();for(const item of sorted){const physical=['thermal','camera','ground_sensor','drone','field'].includes(item.type),product=item.provenance?.rawSourceProductId??item.rawSourceProductId??(physical?`${item.type}:${item.sourceFamily??item.source}:${String(item.at??'').slice(0,10)}`:item.id),prior=products.get(product),frp=Number(item.frpMw??-Infinity),priorFrp=Number(prior?.frpMw??-Infinity);if(!prior||frp>priorFrp||(frp===priorFrp&&Date.parse(item.at)>Date.parse(prior.at)))products.set(product,item);}return sampled([...products.values()],OPERATOR_OBSERVATION_LIMIT);}
function boundedOpportunityResults(event){const results=[...(event.observationPlan?.opportunityResults??[])].sort((left,right)=>Date.parse(left.created_at??left.createdAt??0)-Date.parse(right.created_at??right.createdAt??0)||String(left.id??'').localeCompare(String(right.id??''))),returned=results.slice(-OPERATOR_OPPORTUNITY_RESULT_LIMIT);return{results:returned,inventory:{total:results.length,returned:returned.length,truncated:results.length>returned.length,detailHref:`/api/v10/operations/opportunity-results?eventId=${encodeURIComponent(event.id)}&limit=1000`}};}
export function operatorEventProjection(event){const observations=operatorObservations(event.observations),ids=new Set(observations.map((item)=>item.id)),support=event.observedThermalSupport?.features?{...event.observedThermalSupport,features:event.observedThermalSupport.features.filter((item)=>ids.has(item.properties?.observationId))}:event.observedThermalSupport,thermalSeries=sampled(event.thermalSeries??[],240),timeline=sampled(event.timeline??[],180),geometryTimeline=sampled(event.geometryTimeline??[],120),opportunity=boundedOpportunityResults(event),observationPlan=event.observationPlan?{...event.observationPlan,opportunityResults:opportunity.results,opportunityResultInventory:opportunity.inventory}:event.observationPlan;return{...event,observations,observationPlan,observedThermalSupport:support,associationDecisions:(event.associationDecisions??[]).filter((item)=>ids.has(item.observationId)),thermal:event.thermal?{...event.thermal,series:sampled(event.thermal.series??[],240)}:event.thermal,thermalSeries,timeline,geometryTimeline,observationInventory:{total:event.observations?.length??0,returned:observations.length,truncated:(event.observations?.length??0)>observations.length,fullDetailHref:`/api/v10/events/${encodeURIComponent(event.id)}`},timelineInventory:{total:event.timeline?.length??0,returned:timeline.length,truncated:(event.timeline?.length??0)>timeline.length},projection:{kind:'operator',completeTruthRetained:true,qualification:'The operator projection retains product-level representatives, source-family extrema and bounded history. Complete physical truth remains durable and available from the unprojected event and opportunity-result endpoints.'}};}

function registerVersion(router, prefix, { operationalEventService, liveThermalAdapter }) {
  router.get(`${prefix}/events`, async ({ res,context }) => {const snapshot=prefix==='/api/v10'?await operationalEventService.commandSnapshot():compactOperationalSnapshot(await operationalEventService.snapshot());json(res,200,redactOperationalSnapshot(snapshot,context.actor));});
  router.get(`${prefix}/events/thermal/overlay`, async ({ req,res, url,context }) => {
    try {
      const image = await liveThermalAdapter.overlay({
        providerId: url.searchParams.get('provider') ?? 'auto', time: url.searchParams.get('time') ?? 'latest',
        bbox: parseBbox(url.searchParams.get('bbox')), width: Number(url.searchParams.get('width') ?? 980), height: Number(url.searchParams.get('height') ?? 1280),clientKey:visualizationClientKey(req,context)
      });
      res.writeHead(200, {
        'content-type': image.contentType, 'content-length': image.body.length, 'cache-control': 'public, max-age=60',
        'x-vigia-provider': image.providerId, 'x-vigia-acquired-at': image.acquiredAt ?? '',
        'x-vigia-source-state': image.state, 'x-content-type-options': 'nosniff'
      });
      res.end(image.body);
    } catch (error) { problem(res, 503, 'event_thermal_unavailable', String(error.message ?? error)); }
  });
  router.get(`${prefix}/events/:id`, async ({ res, params,context,url }) => {
    if(context.actor?.authentication?.authenticated)assertIncidentScope(context.actor,params.id);
    if(prefix==='/api/v10'&&url.searchParams.get('projection')==='operator'){
      const cached=await operationalEventService.operatorEvent(params.id);if(cached)return json(res,200,{...cached,event:context.actor?.authentication?.authenticated?cached.event:publicEvent(cached.event)});
    }
    const snapshot = redactOperationalSnapshot(await operationalEventService.snapshot(),context.actor);
    const event = snapshot.events.find((item) => String(item.id) === String(params.id));
    if (!event) return problem(res, 404, 'fire_event_not_found', 'The requested fire event is not present in the retained event window.');
    const value=prefix==='/api/v10'&&url.searchParams.get('projection')==='operator'?operatorEventProjection(event):context.actor?.authentication?.authenticated&&prefix==='/api/v10'?event:compactEvent(event);
    json(res, 200, { meta: snapshot.meta, clocks: snapshot.clocks, event:value });
  });
}

export function registerEventRoutes(router, services) {
  const { eventCorrectionService,fireEventService,operationalEventService } = services;
  router.post('/api/v10/events/:id/ui-first-seen',async({req,res,params})=>{
    try{const result=await fireEventService.recordUiFirstSeen({eventId:params.id,...await readJsonBody(req)});operationalEventService.invalidate();json(res,200,result);}
    catch(error){const code=String(error.message??error);const status=code==='prospective_trace_not_found'?404:code==='prospective_trace_mismatch'?409:code==='prospective_trace_repository_unavailable'?503:400;problem(res,status,code,code.replaceAll('_',' '));}
  });
  router.get('/api/v10/events/corrections', async ({ res, context }) => json(res, 200, await eventCorrectionService.list(context.actor)));
  router.post('/api/v10/events/corrections/merge', async ({ req, res, context }) => json(res, 201, await eventCorrectionService.merge(context.actor, await readJsonBody(req))));
  router.post('/api/v10/events/corrections/split', async ({ req, res, context }) => json(res, 201, await eventCorrectionService.split(context.actor, await readJsonBody(req))));
  router.post('/api/v10/events/corrections/reject', async ({ req, res, context }) => json(res, 201, await eventCorrectionService.reject(context.actor, await readJsonBody(req))));
  registerVersion(router, '/api/v10', services);
  registerVersion(router, '/api/v9', services);
  registerVersion(router, '/api/v8', services);
  registerVersion(router, '/api/v7', services);
  registerVersion(router, '/api/v6', services);
  registerVersion(router, '/api/v5', services);
}
