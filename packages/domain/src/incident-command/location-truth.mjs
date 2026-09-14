import { LOCATION_STATES,instant,member,required,stableId } from './contracts.mjs';

export function createLocationReport(input,{now=new Date(),releaseId,actor,eventVerificationState='UNVERIFIED',confirmationAuthority=null}={}){
  const state=member(input.verificationState??'UNKNOWN',LOCATION_STATES,'invalid_location_verification_state');
  const observedAt=instant(input.observedAt??now.toISOString(),'invalid_location_observed_at'),receivedAt=instant(input.receivedAt??now.toISOString(),'invalid_location_received_at');
  if(state==='DEVICE_ESTIMATED'&&!(Number(input.horizontalUncertaintyM)>0))throw new Error('device_location_uncertainty_required');
  if(state==='UNKNOWN'&&input.geometry)throw new Error('unknown_location_cannot_have_exact_geometry');
  if(!input.geometry&&!input.operationalAreaId&&state!=='UNKNOWN')throw new Error('location_geometry_or_area_required');
  const canonicalActor=required(actor,'location_actor_required'),claimedObserverId=input.observerId??null,trustedConfirmation=state==='CONFIRMED'&&eventVerificationState==='VERIFIED'&&confirmationAuthority?.validated===true&&String(confirmationAuthority.checkpointId??'')===String(input.checkpointId??'')&&String(confirmationAuthority.observerId??'')===String(canonicalActor);
  if(state==='CONFIRMED'&&!trustedConfirmation)throw new Error('confirmed_location_transition_required');
  return{schemaVersion:'vigia.location-report.v1',locationReportId:input.locationReportId??stableId('location',input.incidentId,input.personId,observedAt,input.geometry,input.operationalAreaId),incidentId:required(input.incidentId,'incident_id_required'),personId:required(input.personId,'person_id_required'),geometry:input.geometry??null,operationalAreaId:input.operationalAreaId??null,horizontalUncertaintyM:Number.isFinite(Number(input.horizontalUncertaintyM))?Number(input.horizontalUncertaintyM):null,verticalUncertaintyM:Number.isFinite(Number(input.verticalUncertaintyM))?Number(input.verticalUncertaintyM):null,floor:input.floor??null,source:required(input.source,'location_source_required'),observedAt,receivedAt,deviceId:input.deviceId??null,observerId:canonicalActor,claimedObserverId:claimedObserverId&&claimedObserverId!==canonicalActor?claimedObserverId:null,checkpointId:input.checkpointId??null,verificationState:state,eventVerificationState,confidenceCategory:input.confidenceCategory??(state==='CONFIRMED'?'HIGH':state==='UNKNOWN'?'NONE':'DECLARED'),releaseId:required(input.releaseId??releaseId,'release_id_required')};
}

export function projectLocation(report,{now=new Date(),staleAfterMs=300_000}={}){
  if(!report)return{verificationState:'UNKNOWN',display:'UNKNOWN',geometry:null,ageMs:null,uncertainty:null};
  const ageMs=Math.max(0,now.getTime()-Date.parse(report.observedAt)),stale=ageMs>staleAfterMs,effective=report.verificationState==='CONFIRMED'&&report.eventVerificationState!=='VERIFIED'?'REPORTED':report.verificationState,state=stale?'STALE':effective;
  const uncertainty={horizontalM:report.horizontalUncertaintyM,verticalM:report.verticalUncertaintyM,floor:report.floor};
  if(state==='UNKNOWN')return{verificationState:state,display:'UNKNOWN',geometry:null,operationalAreaId:report.operationalAreaId??null,ageMs,uncertainty};
  if(report.operationalAreaId&&!report.geometry)return{verificationState:state,display:'OPERATIONAL_AREA',geometry:null,operationalAreaId:report.operationalAreaId,ageMs,uncertainty};
  if(report.geometry&&Number(report.horizontalUncertaintyM)>50)return{verificationState:state,display:'UNCERTAINTY_REGION',geometry:{type:'UncertaintyRegion',center:report.geometry, radiusM:report.horizontalUncertaintyM},operationalAreaId:report.operationalAreaId??null,ageMs,uncertainty};
  return{verificationState:state,display:state==='CONFIRMED'?'CONFIRMED_POINT':'APPROXIMATE_POINT',geometry:report.geometry??null,operationalAreaId:report.operationalAreaId??null,ageMs,uncertainty};
}
