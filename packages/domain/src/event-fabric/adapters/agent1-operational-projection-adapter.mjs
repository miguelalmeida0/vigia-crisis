import { canonicalIncidentId } from '../../authorization.mjs';
import { semanticHash } from '../../intelligence/shared.mjs';
import { createCanonicalOperationalEvent } from '../operational-event.mjs';

const VERSION='vigia-agent1-operational-projection-adapter.v2';
const instant=(value,fallback)=>new Date(value??fallback).toISOString();
const sortedUnique=(values)=>[...new Set((values??[]).map(String))].sort((left,right)=>left.localeCompare(right));

export function canonicalAgent1CompatibilityRecord(record={}){
  const value=structuredClone(record??{});
  if(Array.isArray(value.incidentIds))value.incidentIds=sortedUnique(value.incidentIds);
  return value;
}

export function agent1CompatibilityRawPayloadHash(record={}){
  return semanticHash('agent1-operational-projection',canonicalAgent1CompatibilityRecord(record));
}

export class Agent1OperationalProjectionAdapter{
  constructor({id='agent1-operational-projection'}={}){this.id=id;this.version=VERSION;}
  adaptOne(record,context={}){
    const providerEventId=String(record?.id??'').trim();
    if(!providerEventId)throw Object.assign(new Error('agent1_operational_event_id_required'),{code:'INVALID_AGENT1_OPERATIONAL_PROJECTION',details:['agent1_operational_event_id_required']});
    const action=String(context.action??'CREATE').toUpperCase(),targetEventId=context.targetEventId?String(context.targetEventId):null;
    const incidentId=canonicalIncidentId(providerEventId),observedAt=instant(record.lastSeenAt??record.firstSeenAt,context.receivedAt),coordinate=Array.isArray(record.coordinate)?record.coordinate.map(Number):null;
    const sourceIncidentIds=sortedUnique(record.incidentIds);
    const payload={
      observationState:'OBSERVED_UNDETERMINED',stance:'IRRELEVANT',compatibilityProjection:true,
      assessment:{evidenceState:record.evidenceState??null,knowledgeState:record.knowledgeState??null,behaviorState:record.behaviorState??null,evolutionState:record.evolutionState??null,physicalOperationalState:record.physicalOperationalState??null},
      sourceIncidentIds,label:record.label??null,
      limitation:'Compatibility projection only. Physical and official evidence must enter through their native Event Fabric adapters and this row never adds an independent witness.'
    };
    return createCanonicalOperationalEvent({
      eventType:'wildfire.compatibility_incident_projection',hazardType:'wildfire',action,targetEventId,
      provider:{adapterId:this.id,adapterVersion:this.version,providerEventId,providerRevision:String(record.lastSeenAt??record.updatedAt??record.firstSeenAt??'initial')},
      source:{sourceId:this.id,familyId:'system.agent1-operational-projection',familyClass:'SYSTEM',producerId:'vigia-agent1-runtime',upstreamOrigin:'VIGIA Agent 1 certified operational projection'},
      clocks:{occurredAt:instant(record.firstSeenAt,observedAt),observedAt,publishedAt:record.updatedAt?instant(record.updatedAt,observedAt):null,receivedAt:instant(context.receivedAt,observedAt),ingestedAt:null,substitutions:{}},
      geometry:coordinate,correlationKeys:[`incident:${incidentId}`,...sourceIncidentIds.map((value)=>`incident:${canonicalIncidentId(value)}`)],subjectRefs:[`legacy-operational-event:${providerEventId}`],
      payload,provenance:{strength:'DERIVED',upstreamMeasurementId:null,derivedFromEventIds:targetEventId?[targetEventId]:[],rawPayloadHash:agent1CompatibilityRawPayloadHash(record),authority:'VIGIA Agent 1 compatibility adapter',proofStatus:'COMPATIBILITY_BOUNDARY',chain:[{system:'agent1-operational-event-service',role:'RELIABILITY_PROJECTION_ONLY'},...(targetEventId?[{priorAcceptedEventId:targetEventId,relationship:action}]:[])]},
      proof:{adapter:this.version,synthetic:false,parallelTruthOwner:false},ingestionMetadata:{adapterRecordIndex:context.recordIndex}
    });
  }
}

export const AGENT1_OPERATIONAL_PROJECTION_ADAPTER_VERSION=VERSION;
