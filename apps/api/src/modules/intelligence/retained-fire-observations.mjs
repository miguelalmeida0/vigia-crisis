import {canonicalIncidentId} from '../../../../../packages/domain/src/authorization.mjs';
import {createCanonicalOperationalEvent,FirmsOperationalAdapter} from '../../../../../packages/domain/src/event-fabric/index.mjs';

// Reuse the retained measurement, never the compatibility projection's refresh clock.
// Public aggregator reports remain REPORT evidence, not an official authority admission.
export function retainedFireObservation(observation,incidentId,at){
 const o=observation??{},p=o.provenance??{},observed=Date.parse(o.at),received=Date.parse(o.receivedAt),now=Date.parse(at);
 if(!o.id||p.synthetic!==false||!p.rawSourceProductId||!p.checksumSha256||!Number.isFinite(observed)||!Number.isFinite(received)||observed>now||received>now||!Array.isArray(o.coordinate)||o.coordinate.length!==2||!o.coordinate.every(Number.isFinite))return null;
 const correlationKeys=['incident:'+canonicalIncidentId(incidentId)],context={receivedAt:o.receivedAt,correlationKeys,rawPayloadHash:p.checksumSha256,rawObjectRef:p.rawSourceProductId};
 if(o.type==='thermal'&&p.provider==='NASA FIRMS'&&['VIIRS','MODIS'].includes(o.instrument)){
  const time=new Date(observed).toISOString();
  return new FirmsOperationalAdapter().adaptOne({id:o.id,measurement_id:o.thermalId??o.id,latitude:o.coordinate[1],longitude:o.coordinate[0],acq_date:time.slice(0,10),acq_time:time.slice(11,16).replace(':',''),instrument:o.instrument,satellite:o.satellite,frp:o.frpMw,brightness:o.brightnessK,confidence:o.confidence},context);
 }
 if(o.type!=='report'||p.provider!=='ptdata'||p.origin!=='ptdata_public_report')return null;
 return createCanonicalOperationalEvent({eventType:'wildfire.public_report',hazardType:'wildfire',provider:{adapterId:'ptdata-retained-report',adapterVersion:'vigia-retained-public-report.v1',providerEventId:o.id},source:{sourceId:'ptdata-public-reports',familyId:'report.ptdata-anepc',familyClass:'REPORT',producerId:'ptdata',upstreamOrigin:'ANEPC-derived public records via PTData'},clocks:{occurredAt:o.at,observedAt:o.at,receivedAt:o.receivedAt,ingestedAt:null},geometry:o.coordinate,correlationKeys,subjectRefs:['public-report:'+o.id],payload:{observationState:'OBSERVED_POSITIVE',stance:'SUPPORTING',reportedStatus:o.status??null,limitation:'Public report observation; transport refresh and aggregator status do not establish a new official incident observation or resolution.'},provenance:{strength:'DERIVED',upstreamMeasurementId:o.id,rawPayloadHash:p.checksumSha256,rawObjectRef:p.rawSourceProductId,authority:'PTData public report',proofStatus:'PROVIDER_ATTRIBUTED'},proof:{synthetic:false}});
}

const measurementKey=e=>[e.source?.sourceId,e.clocks?.observedAt,JSON.stringify(e.geometry?.coordinates??e.geometry),e.payload?.instrument??e.eventType].join('|');
export class RetainedFireObservationReconciler{
 constructor({service,clock=()=>new Date()}){this.service=service;this.clock=clock;this.running=null;this.lastResult=null;}
 reconcile(records){
  if(this.running)return this.running;
  this.running=this.run(records).finally(()=>{this.running=null;});return this.running;
 }
 async run(records){
  const at=this.clock().toISOString(),existing=await this.service.getOperationalEvents(),ids=new Set(existing.flatMap(e=>[e.provenance?.upstreamMeasurementId,e.provider?.providerEventId].filter(Boolean))),keys=new Set(existing.filter(e=>e.source?.familyClass==='PHYSICAL').map(measurementKey)),result={at,considered:0,accepted:0,duplicates:0,rejected:0,ambiguous:0};
  // One observation assigned to multiple retained incidents is not silently merged.
  const owners=new Map();for(const r of records??[])for(const o of r.observations??[]){const set=owners.get(o.id)??new Set();set.add(canonicalIncidentId(r.id));owners.set(o.id,set);}
  for(const r of records??[])for(const o of r.observations??[]){
   result.considered++;if(owners.get(o.id)?.size!==1||r.associationState==='ambiguous'||r.evidenceState==='association-uncertain'){result.ambiguous++;continue;}
   const event=retainedFireObservation(o,r.id,at);if(!event)continue;
   if(ids.has(event.provenance?.upstreamMeasurementId)||ids.has(o.id)||(event.source.familyClass==='PHYSICAL'&&keys.has(measurementKey(event)))){result.duplicates++;continue;}
   const persisted=await this.service.ingestOperationalEvent(event,{receivedAt:at,ingestedAt:at,project:false});
   if(persisted.state==='ACCEPTED'){result.accepted++;ids.add(o.id);ids.add(event.provenance.upstreamMeasurementId);keys.add(measurementKey(event));}else result.rejected++;
  }
  this.lastResult=result;return result;
 }
}
