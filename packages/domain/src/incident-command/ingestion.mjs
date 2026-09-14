import { hash,required,stableId } from './contracts.mjs';
import { adaptIncidentSource } from './source-adapters.mjs';

export const INCIDENT_IMPORT_ADAPTERS=Object.freeze(['CAD_JSON','CAD_CSV','ROSTER_JSON','ROSTER_CSV','SHADOW_JSON','SHADOW_CSV']);
const allowed=INCIDENT_IMPORT_ADAPTERS;
const identityFields=Object.freeze({people:'personId',crews:'crewId',resources:'resourceId',waterSources:'waterSourceId',hazards:'hazardId'});
const reservedIdentifiers=new Set(['__proto__','prototype','constructor']);
const maxRecordsPerType=1_000,maxRecordsTotal=2_000;
const plainObject=(value)=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const validRecord=(value)=>plainObject(value)&&value.__vigiaImportParseError!==true;
const payloadBytes=(value)=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value??null),'utf8');
const safeSourceFilename=(value)=>String(value??'unavailable').split(/[\\/]/).at(-1).replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,160)||'unavailable';

export function previewIncidentImport(input,{releaseId,maxPayloadBytes=750_000}={}){
  const adapter=String(input?.adapter??'');
  if(!allowed.includes(adapter))return{schemaVersion:'vigia.incident-command-import-preview.v1',status:'UNSUPPORTED',adapter,acceptedRecords:0,rejectedRecords:0,recordCounts:{},rejections:[{row:null,code:'unsupported_incident_import_adapter',message:'Only the existing CAD, roster and shadow JSON/CSV adapters are supported.'}],sourcePayloadHash:null,validated:null};
  if(payloadBytes(input?.sourcePayload)>maxPayloadBytes)return{schemaVersion:'vigia.incident-command-import-preview.v1',status:'REJECTED',adapter,acceptedRecords:0,rejectedRecords:1,recordCounts:{},rejections:[{row:null,code:'incident_import_payload_too_large',message:`Import payload exceeds ${maxPayloadBytes} bytes.`}],sourcePayloadHash:null,validated:null};
  let validated;
  try{validated=validateIncidentImport(input,{releaseId});}
  catch(error){return{schemaVersion:'vigia.incident-command-import-preview.v1',status:'REJECTED',adapter,acceptedRecords:0,rejectedRecords:1,recordCounts:{},rejections:[{row:null,code:String(error?.message??error).slice(0,120),message:'The import envelope does not satisfy the governed incident-import contract.'}],sourcePayloadHash:null,validated:null};}
  const rejections=[];
  if(adapter.endsWith('_CSV')){
    for(const[index,row]of(validated.sourceRecords??[]).entries()){
      const kind=String(row.record_type??row.kind??'').toUpperCase();
      if(!['INCIDENT','ORGANIZATION','PERSON','CREW','RESOURCE','WATER_SOURCE','HAZARD','PREPLAN'].includes(kind))rejections.push({row:index+2,code:'unsupported_record_type',message:`Record type ${kind||'EMPTY'} is not supported by this adapter.`});
      if(row.payload_json){try{const parsed=JSON.parse(row.payload_json);if(!plainObject(parsed))throw new Error('object_required');}catch{rejections.push({row:index+2,code:'invalid_payload_json',message:'payload_json must contain a valid JSON object.'});}}
    }
  }
  const normalized={...validated,incident:validRecord(validated.incident)?validated.incident:{},organization:validRecord(validated.organization)?validated.organization:{}};
  if(!validRecord(validated.incident)&&validated.incident!=null)rejections.push({row:null,code:'invalid_incident_record',message:'Incident data must be an object.'});
  if(!validRecord(validated.organization)&&validated.organization!=null)rejections.push({row:null,code:'invalid_organization_record',message:'Organization data must be an object.'});
  for(const[field,idField]of Object.entries(identityFields)){
    normalized[field]=(Array.isArray(validated[field])?validated[field]:[]).filter((item,index)=>{
      const identifier=String(item?.[idField]??'').trim(),reserved=reservedIdentifiers.has(identifier);
      const valid=validRecord(item)&&identifier.length>0&&!reserved;
      if(!valid)rejections.push({row:index+1,code:reserved?'incident_import_identifier_reserved':`${idField}_required`,message:reserved?`${idField} uses a reserved identifier.`:`${field} record is missing ${idField}.`});
      return valid;
    });
  }
  normalized.preplans=(Array.isArray(validated.preplans)?validated.preplans:[]).filter((item,index)=>{const valid=validRecord(item);if(!valid)rejections.push({row:index+1,code:'preplan_object_required',message:'Preplan record must be an object.'});return valid;});
  const recordCounts={incident:Object.keys(normalized.incident).length?1:0,organization:Object.keys(normalized.organization).length?1:0,people:normalized.people.length,crews:normalized.crews.length,resources:normalized.resources.length,waterSources:normalized.waterSources.length,hazards:normalized.hazards.length,preplans:normalized.preplans.length};
  const acceptedRecords=Object.values(recordCounts).reduce((sum,count)=>sum+count,0),rejectedRecords=rejections.length;
  const status=acceptedRecords===0?'REJECTED':rejectedRecords?'PARTIALLY_VALID':'VALID',boundedRejections=rejections.slice(0,100),sourceFilename=safeSourceFilename(input.sourceFilename??String(input.sourceSystem??'').split(':').at(-1)),importMode='MANUAL_SHADOW_NOT_LIVE_SYNCED';
  const effectiveReceiptEnvelope={schemaVersion:'vigia.incident-command-import-receipt-envelope.v1',adapter,universe:normalized.universe,sourceSystem:normalized.sourceSystem,incidentId:normalized.incidentId,canonicalEventIds:normalized.canonicalEventIds,reportRecordIds:normalized.reportRecordIds,accepted:{incident:normalized.incident,organization:normalized.organization,people:normalized.people,crews:normalized.crews,resources:normalized.resources,waterSources:normalized.waterSources,hazards:normalized.hazards,preplans:normalized.preplans},rejected:boundedRejections,sourceContentHash:normalized.sourceContentHash,sourceFilename,recordCounts,acceptedRecords,rejectedRecords,importMode,releaseId:normalized.releaseId};
  const sourcePayloadHash=hash(effectiveReceiptEnvelope),importId=input.importId??stableId('command-import',adapter,normalized.universe,sourcePayloadHash),effectiveNormalized={...normalized,sourcePayloadHash,sourceContentHash:normalized.sourceContentHash,sourceFilename,importMode,importId,receiptEnvelope:effectiveReceiptEnvelope};
  return{schemaVersion:'vigia.incident-command-import-preview.v1',status,adapter,universe:normalized.universe,sourceSystem:normalized.sourceSystem,incidentId:normalized.incidentId,canonicalEventIds:normalized.canonicalEventIds,sourcePayloadHash,sourceContentHash:normalized.sourceContentHash,sourceFilename,importMode,acceptedRecords,rejectedRecords,recordCounts,rejections:boundedRejections,validated:status==='REJECTED'?null:effectiveNormalized};
}
export function validateIncidentImport(input,{releaseId}={}){
  const verifiedReleaseId=required(releaseId,'release_id_required');
  if(input?.releaseId!=null&&input.releaseId!==verifiedReleaseId)throw new Error('incident_import_release_identity_mismatch');
  const adapter=required(input.adapter,'incident_import_adapter_required');if(!allowed.includes(adapter))throw new Error('unsupported_incident_import_adapter');
  const universe=input.universe??'SHADOW';if(!['PRODUCTION','SHADOW'].includes(universe))throw new Error('invalid_incident_import_universe');if(universe==='PRODUCTION'&&adapter.startsWith('SHADOW_'))throw new Error('shadow_roster_cannot_enter_production_truth');
  const canonicalEventIds=input.canonicalEventIds??[];if(!canonicalEventIds.length)throw new Error('canonical_vigia_event_required');
  const adapted=adaptIncidentSource(input,adapter),incidentId=required(input.incidentId,'incident_id_required'),sourceSystem=required(input.sourceSystem,'source_system_required'),reportRecordIds=input.reportRecordIds??[],effectivePayload={adapter,universe,sourceSystem,incidentId,canonicalEventIds,reportRecordIds,incident:adapted.incident??{},organization:adapted.organization??{},people:adapted.people??[],crews:adapted.crews??[],resources:adapted.resources??[],waterSources:adapted.waterSources??[],hazards:adapted.hazards??[],preplans:adapted.preplans??[]},sourceContentHash=hash(input.sourcePayload??null),sourcePayloadHash=hash(effectivePayload),counts=Object.values(identityFields).map((_,index)=>adapted[Object.keys(identityFields)[index]]?.length??0),preplans=adapted.preplans?.length??0,total=counts.reduce((sum,count)=>sum+count,0)+preplans+(Object.keys(adapted.incident??{}).length?1:0)+(Object.keys(adapted.organization??{}).length?1:0);if(counts.some((count)=>count>maxRecordsPerType)||preplans>maxRecordsPerType||total>maxRecordsTotal)throw new Error('incident_import_record_limit_exceeded');return{schemaVersion:'vigia.incident-command-import.v1',importId:input.importId??stableId('command-import',adapter,universe,sourcePayloadHash),incidentId,adapter,universe,sourceSystem,sourcePayloadHash,sourceContentHash,canonicalEventIds,reportRecordIds,...adapted,releaseId:verifiedReleaseId};
}
