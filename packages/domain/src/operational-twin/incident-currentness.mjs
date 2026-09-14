// Operational queue windows, not estimates of fire duration or extinguishment.
export const CURRENTNESS_POLICY=Object.freeze({candidateCurrentWindowHours:24,monitoringWindowHours:72,staleReviewWindowHours:168,historicalWindowHours:336});
export const CURRENTNESS_STATES=Object.freeze(['NEW','CURRENT','MONITORING','STALE','HISTORICAL','RESOLVED','REOPENED']);
const date=value=>Number.isFinite(Date.parse(value??''))?Date.parse(value):null;
const iso=value=>new Date(value).toISOString();
const HOUR=3600000;
export function currentnessPolicy(overrides={}){
 const p={...CURRENTNESS_POLICY,...overrides},values=Object.values(p);
 if(values.some(v=>!Number.isFinite(v)||v<=0)||p.candidateCurrentWindowHours>p.monitoringWindowHours||p.monitoringWindowHours>p.staleReviewWindowHours||p.staleReviewWindowHours>p.historicalWindowHours)throw new Error('invalid_currentness_queue_policy');
 return p;
}
export function fireSignal(event,asOf){
 const now=date(asOf),observed=date(event.clocks?.observedAt??event.observedAt??event.clocks?.occurredAt),received=date(event.clocks?.ingestedAt??event.receivedAt),payload=event.payload??event.value??{},family=event.source?.familyClass??event.familyClass,type=event.eventType??event.type??'',sourceId=event.source?.sourceId??event.sourceId;
 if(now===null||observed===null||observed>now||(received!==null&&received>now)||!sourceId||(event.provenance?.synthetic===true||event.proof?.synthetic===true)||event.action==='CANCEL'||(event.hazardType&&!/wildfire|fire|incend/i.test(event.hazardType))||/weather|warning|danger|forecast|context|health|synchron/i.test(type)||['CONTEXT','SYSTEM'].includes(family))return null;
 const status=String(payload.officialIncidentStatus??payload.incidentStatus??payload.resolutionState??'').toUpperCase();
 const authorized=family==='OFFICIAL'||(family==='HUMAN'&&payload.operatorResolution===true);
 if(authorized&&['RESOLVED','EXTINGUISHED','CLOSED'].includes(status))return{id:event.id,kind:'RESOLUTION',sourceId,observedAt:iso(observed),receivedAt:received===null?null:iso(received)};
 const thermal=family==='PHYSICAL'&&/thermal|viirs|modis|slstr|fire_detection/i.test(type)&&payload.stance!=='OPPOSING'&&payload.observationState!=='OBSERVED_NEGATIVE';
 const official=family==='OFFICIAL'&&/wildfire|fire\.incident/i.test(type)&&!['CANCELLED','RESOLVED','CLOSED','EXTINGUISHED'].includes(status);
 const field=family==='PHYSICAL'&&/field_observation/i.test(type)&&payload.observationState==='OBSERVED_POSITIVE'&&payload.stance!=='OPPOSING';
 const reported=['HUMAN','REPORT'].includes(family)&&/fire|wildfire/i.test(type)&&['SUPPORTING','OBSERVED_POSITIVE'].some(v=>[payload.stance,payload.observationState].includes(v));
 if(!thermal&&!official&&!reported&&!field)return null;
 return{id:event.id,kind:thermal?'THERMAL':official?'OFFICIAL':family==='HUMAN'||field?'FIELD':'REPORT',sourceId,observedAt:iso(observed),receivedAt:received===null?null:iso(received),measurementId:event.provenance?.upstreamMeasurementId??event.id};
}
export function deriveIncidentCurrentness({events=[],asOf,policy={},reviewReasons=[]}){
 const p=currentnessPolicy(policy),now=date(asOf);if(now===null)throw new Error('currentness_as_of_required');
 const signals=[...new Map(events.map(e=>fireSignal(e,asOf)).filter(Boolean).map(s=>[`${s.sourceId}:${s.measurementId??s.id}:${s.observedAt}`,s])).values()].sort((a,b)=>date(a.observedAt)-date(b.observedAt)||String(a.id).localeCompare(String(b.id)));
 const activity=signals.filter(s=>s.kind!=='RESOLUTION'),last=activity.at(-1),resolution=signals.filter(s=>s.kind==='RESOLUTION').at(-1),age=last?(now-date(last.observedAt))/HOUR:null;
 const afterGap=activity.filter((s,index)=>index>0&&(date(s.observedAt)-date(activity[index-1].observedAt))/HOUR>p.monitoringWindowHours).at(-1),afterResolution=resolution?activity.find(s=>date(s.observedAt)>date(resolution.observedAt)):null,reopeningSignal=[afterGap,afterResolution].filter(Boolean).sort((a,b)=>date(b.observedAt)-date(a.observedAt))[0];
 const reopening=reopeningSignal&&(now-date(reopeningSignal.observedAt))/HOUR<=p.candidateCurrentWindowHours;
 let state=resolution&&(!last||date(resolution.observedAt)>=date(last.observedAt))?'RESOLVED':age===null?'STALE':age<=p.candidateCurrentWindowHours?(reopening?'REOPENED':'CURRENT'):age<=p.monitoringWindowHours?'MONITORING':age>=p.historicalWindowHours?'HISTORICAL':'STALE';
 const reason=state==='RESOLVED'?'An official or authorized operator resolution is recorded.':state==='REOPENED'?'New fire-related activity returned this record to current review.':age===null?'No attributable fire-related observation time is retained.':state==='HISTORICAL'?`No meaningful fire-related activity for ${Math.floor(age/24)} days; removed from active attention.`:state==='STALE'?'Incident is outside the active operational window.':state==='MONITORING'?'Latest fire-related activity is outside the current window; retain for monitoring.':'Recent fire-related activity is within the operational queue window.';
 const actionableReview=state==='STALE'&&reviewReasons.length>0&&(age===null||age<=p.staleReviewWindowHours);
 const stateSince=state==='RESOLVED'?resolution.observedAt:last?iso(date(last.observedAt)+(state==='HISTORICAL'?p.historicalWindowHours:state==='STALE'?p.monitoringWindowHours:state==='MONITORING'?p.candidateCurrentWindowHours:0)*HOUR):null;
 return{schemaVersion:'vigia.incident-currentness.v1',stateSince,state,label:({CURRENT:'Current',MONITORING:'Monitoring',STALE:'Stale',HISTORICAL:'Historical',RESOLVED:'Resolved',REOPENED:'Reopened',NEW:'New'})[state],lastMeaningfulAt:last?.observedAt??null,lastReceivedAt:last?.receivedAt??null,ageHours:age===null?null:Number(age.toFixed(2)),latestSignal:last??null,resolution:state==='RESOLVED'?resolution:null,reopenedAt:reopening?reopeningSignal.observedAt:null,reason,reviewReasons,actionableReview,inActiveQueue:['NEW','CURRENT','REOPENED','MONITORING'].includes(state)||actionableReview,countsAsCurrent:['NEW','CURRENT','REOPENED'].includes(state),evaluatedAt:asOf,policy:p,meaning:'Operational attention policy; stale and historical never mean extinguished.'};
}
