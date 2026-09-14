import { createHash } from 'node:crypto';

const rows=value=>Array.isArray(value)?value:[];
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const iso=value=>Number.isFinite(Date.parse(value??''))?new Date(value).toISOString():null;
const digest=value=>`sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const sourceState=value=>String(value??'UNKNOWN').toUpperCase();
const point=value=>Array.isArray(value)&&value.length===2&&value.every(item=>finite(item)!==null)?value.map(Number):null;

const STRATEGIES=Object.freeze({
  'nasa-firms':Object.freeze({strategyId:'NASA_FIRMS_AREA_POLL_AND_SPATIOTEMPORAL_ASSOCIATION',providerInstance:'NASA FIRMS Area API · Portugal mainland · VIIRS S-NPP/NOAA-20/NOAA-21 + MODIS',sourceClass:'PHYSICAL',acquisitionMode:'LIVE_PROVIDER_POLL',queryTemplate:{area:'-9.75,36.7,-6,42.3',dayRange:3,products:['VIIRS_NOAA20_NRT','VIIRS_NOAA21_NRT','VIIRS_SNPP_NRT','MODIS_NRT']}}),
  'sentinel3-slstr':Object.freeze({strategyId:'COPERNICUS_SENTINEL3_SLSTR_FRP_POLL_AND_SPATIOTEMPORAL_ASSOCIATION',providerInstance:'Copernicus Data Space · Sentinel-3A/3B SLSTR L2 FRP',sourceClass:'PHYSICAL',acquisitionMode:'LIVE_PROVIDER_POLL',queryTemplate:{collection:'sentinel-3-sl-2-frp-nrt',platforms:['Sentinel-3A','Sentinel-3B'],area:'Portugal mainland'}}),
  fieldnet:Object.freeze({strategyId:'FIELDNET_CENTRAL_LEDGER_INCIDENT_ASSOCIATION',providerInstance:'VIGIA Central FieldNet ledger',sourceClass:'PHYSICAL',acquisitionMode:'DURABLE_INTERNAL_LEDGER',queryTemplate:{collections:['observations','tasks','acknowledgements','conflicts'],maximumRecords:250}}),
  'agent1-operational-projection':Object.freeze({strategyId:'CANONICAL_EVENT_PROJECTION_IDENTITY_LOOKUP',providerInstance:'VIGIA retained canonical incident-report projection',sourceClass:'REPORT',acquisitionMode:'DURABLE_INTERNAL_PROJECTION',queryTemplate:{identityKeys:['canonicalEventId','incidentId','correlationKeys']}}),
  'cap-authority':Object.freeze({strategyId:'OASIS_CAP_FEED_POLL_AND_IDENTITY_ASSOCIATION',providerInstance:'Configured governed CAP authority feed',sourceClass:'OFFICIAL',acquisitionMode:'LIVE_PROVIDER_POLL',queryTemplate:{standard:'OASIS CAP 1.2',messageTypes:['ALERT','UPDATE','CANCEL']}})
});

function distanceKm(left,right){
  if(!point(left)||!point(right))return null;
  const rad=Math.PI/180,lat1=left[1]*rad,lat2=right[1]*rad,dLat=(right[1]-left[1])*rad,dLon=(right[0]-left[0])*rad,a=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function identityMatches(record,incidentId){
  const values=[record?.id,record?.incidentId,record?.eventId,record?.targetEventId,...rows(record?.incidentIds),...rows(record?.correlationKeys)].filter(Boolean).map(value=>String(value).replace(/^(?:event|incident):/,''));
  const target=String(incidentId??'').replace(/^(?:event|incident):/,'');
  return Boolean(target&&values.includes(target));
}

function associateFirms(records,query){
  const center=point(query?.coordinate),anchor=iso(query?.anchorObservedAt??query?.observedAt),maximumDistanceKm=Number(query?.maximumDistanceKm??30),maximumAgeHours=Number(query?.maximumAgeHours??72),spatial=[],temporal=[];
  for(const record of rows(records)){
    const distance=distanceKm(center,record?.coordinate);if(distance===null||distance>maximumDistanceKm){spatial.push(record);continue;}
    const observedAt=iso(record?.observedAt),ageHours=anchor&&observedAt?Math.abs(Date.parse(anchor)-Date.parse(observedAt))/3_600_000:null;
    if(ageHours===null||ageHours>maximumAgeHours){temporal.push(record);continue;}
    return{matches:[{recordId:record.id,observedAt,distanceKm:Number(distance.toFixed(2)),sourceFamily:record.sourceFamily,independenceGroup:record.independenceGroup,rawSourceProductId:record.rawSourceProductId??null,bindingRecord:record}],rejections:{identity:0,spatial:spatial.length,temporal:temporal.length,duplicateFamily:0}};
  }
  return{matches:[],rejections:{identity:0,spatial:spatial.length,temporal:temporal.length,duplicateFamily:0}};
}

function associateFieldNet(snapshot,incidentId){
  const values=[...rows(snapshot?.observations),...rows(snapshot?.tasks),...rows(snapshot?.acknowledgements),...rows(snapshot?.conflicts)],matches=values.filter(item=>String(item?.incidentId)===String(incidentId)).slice(0,25).map(item=>({recordId:item.observationId??item.taskId??item.acknowledgementId??item.conflictId??item.centralRecordId,observedAt:iso(item.observedAt??item.centralReceivedAt),sourceFamily:'fieldnet',independenceGroup:item.originNode?`fieldnet:${item.originNode}`:'fieldnet'}));
  return{matches,rejections:{identity:Math.max(0,values.length-matches.length),spatial:0,temporal:0,duplicateFamily:0}};
}

function associateProjection(snapshot,incidentId){
  const values=rows(snapshot?.events),matches=values.filter(item=>identityMatches(item,incidentId)).slice(0,25).map(item=>({recordId:item.id,observedAt:iso(item.updatedAt??item.lastSeenAt??snapshot.generatedAt),sourceFamily:'incident-report',independenceGroup:'vigia-canonical-report'}));
  return{matches,rejections:{identity:Math.max(0,values.length-matches.length),spatial:0,temporal:0,duplicateFamily:0}};
}

function associateCap(snapshot,incidentId){
  const values=rows(snapshot?.outcomes),matches=values.filter(item=>['ACCEPTED','DUPLICATE'].includes(item?.state)&&String(item?.incidentId)===String(incidentId)).map(item=>({recordId:item.replayKey,observedAt:iso(snapshot?.health?.lastSuccessAt??snapshot?.completedAt),sourceFamily:'official.cap-alert',independenceGroup:'configured-cap-authority'}));
  return{matches,rejections:{identity:Math.max(0,values.length-matches.length),spatial:0,temporal:0,duplicateFamily:0}};
}

export function sourceResolutionStrategy(sourceId,{incidentId,coordinate,observedAt,requirementId}={}){
  const strategy=STRATEGIES[sourceId]??{strategyId:'REGISTERED_SOURCE_CONTRACT_LOOKUP',providerInstance:String(sourceId),sourceClass:'CANONICAL_SOURCE',acquisitionMode:'REGISTERED_PROVIDER',queryTemplate:{}};
  return{...strategy,query:{...strategy.queryTemplate,incidentId:String(incidentId??''),requirementId:String(requirementId??''),coordinate:point(coordinate),anchorObservedAt:iso(observedAt),maximumDistanceKm:30,maximumAgeHours:72}};
}

export class SourceResolutionRouter{
  constructor({firmsGateway=null,sentinel3FrpGateway=null,centralFieldNetService=null,operationalEventService=null,operationalIntelligenceService=null,capFeedAdapter=null,clock=()=>new Date()}={}){this.firmsGateway=firmsGateway;this.sentinel3FrpGateway=sentinel3FrpGateway;this.centralFieldNetService=centralFieldNetService;this.operationalEventService=operationalEventService;this.operationalIntelligenceService=operationalIntelligenceService;this.capFeedAdapter=capFeedAdapter;this.clock=clock;}

  strategy(sourceId,context={}){return sourceResolutionStrategy(sourceId,context);}

  async acquire(sourceIds=[]){
    const unique=[...new Set(sourceIds)],results=await Promise.all(unique.map(async sourceId=>{
      const startedAt=this.clock().toISOString(),started=performance.now();let payload,state='TERMINAL_UNAVAILABLE',providerHealth='NOT_CONFIGURED',rateLimit={state:'CLEAR'},failureClass=null;
      try{
        if(sourceId==='nasa-firms')payload=await this.firmsGateway?.snapshot?.();
        else if(sourceId==='sentinel3-slstr')payload=await this.sentinel3FrpGateway?.snapshot?.();
        else if(sourceId==='fieldnet')payload=this.centralFieldNetService?.snapshot?.(null,{limit:250});
        else if(sourceId==='agent1-operational-projection')payload=await this.operationalEventService?.compatibilitySnapshot?.();
        else if(sourceId==='cap-authority')payload=await this.capFeedAdapter?.poll?.();
        if(payload===undefined||payload===null){state=sourceId==='cap-authority'?'AUTH_REQUIRED':'TERMINAL_UNAVAILABLE';providerHealth='NOT_CONFIGURED';failureClass=sourceId==='cap-authority'?'CAP_PROVIDER_NOT_CONFIGURED':'PROVIDER_EXECUTOR_NOT_CONFIGURED';}
        else{
          const raw=payload?.state?.state??payload?.state??payload?.health?.state??'READY',normalized=sourceState(raw);providerHealth=normalized;
          if(['CURRENT','READY','ACTIVE','DEGRADED','STALE','LOADING'].includes(normalized))state=['STALE','LOADING'].includes(normalized)?'STALE_PROVIDER':'RECEIVED';
          else if(normalized.includes('RATE')){state='RATE_LIMITED';rateLimit={state:'LIMITED',nextAllowedAt:payload?.state?.nextPollAt??payload?.health?.nextAttemptAt??null};}
          else if(normalized.includes('AUTH')||normalized==='NOT_CONFIGURED'){state='AUTH_REQUIRED';failureClass=payload?.state?.error??payload?.failureClass??'PROVIDER_AUTHORITY_OR_CONFIGURATION_REQUIRED';}
          else{state='RETRYING';failureClass=payload?.state?.error??payload?.failureClass??`PROVIDER_${normalized}`;}
        }
      }catch(error){state=String(error?.message??error).includes('429')?'RATE_LIMITED':'RETRYING';providerHealth='UNAVAILABLE';failureClass=String(error?.message??error).slice(0,160);}
      const completedAt=this.clock().toISOString(),latencyMs=Number((performance.now()-started).toFixed(2)),receipt={schemaVersion:'vigia.source-acquisition-receipt.v1',sourceId,startedAt,completedAt,latencyMs,state,providerHealth,rateLimit,failureClass,payloadFingerprint:payload?digest(payload):null};
      return[sourceId,{sourceId,state,providerHealth,rateLimit,failureClass,payload,receipt}];
    }));
    return new Map(results);
  }

  #evaluateSource(job,acquisition,sourceId){
    const contextQuery=job.queryParameters??job.executionStrategy?.query??{},result=acquisition.get(sourceId),strategy=sourceId===job.selectedSourceId&&job.executionStrategy?job.executionStrategy:this.strategy(sourceId,{incidentId:job.incidentId,coordinate:contextQuery.coordinate,observedAt:contextQuery.anchorObservedAt,requirementId:job.requirementId});
    if(!result)return{sourceId,strategy,state:'TERMINAL_UNAVAILABLE',matches:[],rejections:{identity:0,spatial:0,temporal:0,duplicateFamily:0},receipt:null,providerHealth:'NOT_CONFIGURED',failureClass:'ACQUISITION_RESULT_MISSING'};
    if(result.state!=='RECEIVED')return{sourceId,strategy,state:result.state,matches:[],rejections:{identity:0,spatial:0,temporal:0,duplicateFamily:0},receipt:result.receipt,providerHealth:result.providerHealth,failureClass:result.failureClass,rateLimit:result.rateLimit};
    let association={matches:[],rejections:{identity:0,spatial:0,temporal:0,duplicateFamily:0}};
    if(sourceId==='nasa-firms'||sourceId==='sentinel3-slstr')association=associateFirms(result.payload?.data,strategy.query);
    else if(sourceId==='fieldnet')association=associateFieldNet(result.payload,job.incidentId);
    else if(sourceId==='agent1-operational-projection')association=associateProjection(result.payload,job.incidentId);
    else if(sourceId==='cap-authority')association=associateCap(result.payload,job.incidentId);
    const state=association.matches.length?'QUALIFIED':'NO_COVERAGE';
    return{sourceId,strategy,state,...association,receipt:result.receipt,providerHealth:result.providerHealth,failureClass:null,rateLimit:result.rateLimit};
  }

  evaluate(job,acquisition){return this.evaluateCandidates(job,acquisition);}

  evaluateCandidates(job,acquisition){
    const attempts=rows(job.selectedSourceIds?.length?job.selectedSourceIds:[job.selectedSourceId]).map(sourceId=>this.#evaluateSource(job,acquisition,sourceId));
    const priority={QUALIFIED:0,CONFLICTING:1,AUTH_REQUIRED:2,RATE_LIMITED:3,STALE_PROVIDER:4,NO_COVERAGE:5,RETRYING:6,TERMINAL_UNAVAILABLE:7},selected=[...attempts].sort((left,right)=>(priority[left.state]??99)-(priority[right.state]??99)||String(left.sourceId).localeCompare(String(right.sourceId)))[0]??this.#evaluateSource(job,acquisition,job.selectedSourceId);
    return{...selected,providerAttempts:attempts.map(item=>({...item,matches:rows(item.matches).map(({bindingRecord,...match})=>match)}))};
  }

  async bind(job,evaluation){
    const match=rows(evaluation?.matches)[0];
    if(evaluation?.state!=='QUALIFIED'||!match)return evaluation;
    const sourceId=evaluation.sourceId??job.selectedSourceId;
    if(!['nasa-firms','sentinel3-slstr'].includes(sourceId))return{...evaluation,state:'INCIDENT_REEVALUATION',qualificationState:'QUALIFIED',bindingReceipt:{schemaVersion:'vigia.source-binding-receipt.v1',state:'ALREADY_CANONICAL',sourceId,incidentId:job.incidentId,recordId:match.recordId,boundAt:this.clock().toISOString()}};
    if(!this.operationalIntelligenceService?.ingestRawProviderPayload)return evaluation;
    const record=match.bindingRecord,observedAt=iso(record?.observedAt),coordinate=point(record?.coordinate);
    if(!record||!observedAt||!coordinate)return{...evaluation,state:'REJECTED',qualificationState:'QUALIFIED',failureClass:'QUALIFIED_RECORD_NOT_BINDABLE'};
    const date=observedAt.slice(0,10),time=observedAt.slice(11,16).replace(':',''),raw={id:String(record.id),measurement_id:String(record.id),latitude:coordinate[1],longitude:coordinate[0],acq_date:date,acq_time:time,satellite:record.satellite??'VIIRS',instrument:record.instrument??'VIIRS',confidence:record.confidence??null,frp:record.frpMw??null,bright_ti4:record.brightnessK??null,daynight:record.dayNight==='DAY'?'D':record.dayNight==='NIGHT'?'N':null};
    const adapterId=sourceId==='sentinel3-slstr'?'sentinel3-slstr':'nasa-firms',result=await this.operationalIntelligenceService.ingestRawProviderPayload(adapterId,raw,{receivedAt:evaluation.receipt?.completedAt??this.clock(),projectedAt:this.clock(),context:{correlationKeys:[`incident:${String(job.incidentId).replace(/^incident:/,'')}`],rawPayloadHash:evaluation.receipt?.payloadFingerprint,rawObjectRef:record.rawSourceProductId??record.provenance?.rawSourceProductId??null}}),ingestion=rows(result?.ingestion),accepted=ingestion.every(item=>['ACCEPTED','DUPLICATE'].includes(item?.state))&&ingestion.length>0,state=accepted?'INCIDENT_REEVALUATION':ingestion.some(item=>item?.rejection?.code==='PROVIDER_EVENT_IDENTITY_CONFLICT')?'CONFLICTING':'REJECTED';
    return{...evaluation,state,qualificationState:'QUALIFIED',failureClass:accepted?null:ingestion[0]?.rejection?.code??'CANONICAL_BINDING_REJECTED',bindingReceipt:{schemaVersion:'vigia.source-binding-receipt.v1',state:accepted?'BOUND_FOR_REEVALUATION':state,sourceId,incidentId:job.incidentId,recordId:match.recordId,boundAt:this.clock().toISOString(),ingestionStates:ingestion.map(item=>item.state),projectionState:result?.projection?.state??null,projectionHash:result?.projection?.projectionHash??null}};
  }
}
