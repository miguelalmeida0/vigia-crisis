import { createHash } from 'node:crypto';

export const PERSON_STATES=['AVAILABLE','STAGED','ASSIGNED','WORKING','WITHDRAWING','OUT','REHABILITATION','INJURED','MISSING','MAYDAY','DEMOBILIZED'];
export const ORDER_STATES=['CREATED','AUTHORIZED','SENT','DELIVERED','ACKNOWLEDGED','ACTION_UNDERWAY','COMPLETED','FAILED','CANCELLED','EXPIRED'];
export const RESOURCE_STATES=['REQUESTED','APPROVED','DISPATCHED','EN_ROUTE','ARRIVED','CHECKED_IN','STAGED','ASSIGNED','WORKING','REHABILITATION','AVAILABLE','OUT_OF_SERVICE','REASSIGNED','DEMOBILIZED'];
export const LOCATION_STATES=['CONFIRMED','DEVICE_ESTIMATED','REPORTED','STALE','UNKNOWN'];
export const MAYDAY_STATES=['ACTIVE','ACKNOWLEDGED','RESCUE_ASSIGNED','RESCUE_ENTRY','PHYSICALLY_RECOVERED'];
export const EVACUATION_STATES=['ORDER_AUTHORIZED','ORDER_SENT','ORDER_DELIVERED','CREW_ACKNOWLEDGED','CREW_WITHDRAWING','MEMBERS_EXIT_CONFIRMED','CREW_REUNITED','PAR_CONFIRMED','COMPLETE'];
export const ROLES=['FIREFIGHTER','COMPANY_OFFICER','DIVISION_SUPERVISOR','INCIDENT_COMMAND','DISPATCH_EOC','ACCOUNTABILITY','MAYDAY_RESCUE'];
export const CRITICAL_CHANGE_TYPES=['WATER_ESTABLISHED','WATER_DEGRADED','WATER_LOST','PUMP_ENGAGED_NO_FLOW','FIRE_BELOW_CREW','FIRE_ABOVE_CREW','FIRE_BEHIND_CREW','RAPID_THERMAL_GROWTH','CONCEALED_SPACE_EXTENSION','STRUCTURAL_DETERIORATION','VENTILATION_FLOW_PATH_CHANGE','COLLAPSE_ZONE_VIOLATION','STRATEGY_CHANGE','EVACUATION_UNACKNOWLEDGED','WIND_SHIFT','RATE_OF_SPREAD_ACCELERATION','SPOT_FIRE_BEYOND_CONTROL','TRIGGER_POINT_CROSSED','ESCAPE_ROUTE_THREATENED','SAFETY_ZONE_VIABILITY_CHANGED','ROAD_ACCESS_LOST','COMMUNICATIONS_LOST','NEW_CIVILIAN_OR_ASSET_THREAT'];
export const LIFE_SAFETY_INCIDENT_COMMAND_TYPES=Object.freeze(['MAYDAY_ACTIVATED','MAYDAY_TRANSITIONED','EVACUATION_CREATED','EVACUATION_TRANSITIONED','EVACUATION_ZONE_UPSERTED','PAR_REQUESTED','PAR_RESPONDED','CRITICAL_CHANGE_RECORDED','CRITICAL_CHANGE_DELIVERY_RECORDED']);
export const INCIDENT_COMMAND_SEMANTIC_VALIDATION='INCIDENT_COMMAND_REDUCER_V1';
export const isLifeSafetyIncidentCommandType=(value)=>LIFE_SAFETY_INCIDENT_COMMAND_TYPES.includes(String(value??''));

export const canonical=(value)=>JSON.stringify(value,Object.keys(value??{}).sort());
export const hash=(value)=>createHash('sha256').update(typeof value==='string'?value:canonicalDeep(value)).digest('hex');
export const stableId=(prefix,...parts)=>`${prefix}-${hash(parts).slice(0,24)}`;
export function canonicalDeep(value){if(Array.isArray(value))return`[${value.map(canonicalDeep).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalDeep(value[key])}`).join(',')}}`;return JSON.stringify(value);}
export function required(value,code){if(value==null||value==='')throw new Error(code);return value;}
export function member(value,allowed,code){if(!allowed.includes(value))throw new Error(code);return value;}
export function instant(value,code){const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error(code);return new Date(parsed).toISOString();}

export function evidenceMeta(input={},context={}){
  const receivedAt=instant(input.receivedAt??context.now?.toISOString?.()??new Date().toISOString(),'invalid_received_at');
  return{
    source:required(input.source??context.source,'source_required'),
    author:required(input.author??context.actor,'author_required'),
    observedAt:instant(input.observedAt??input.occurredAt??receivedAt,'invalid_observed_at'),
    receivedAt,
    lastUpdatedAt:instant(input.lastUpdatedAt??receivedAt,'invalid_last_updated_at'),
    verificationState:input.verificationState??'UNVERIFIED',confidence:input.confidence??null,
    uncertainty:input.uncertainty??null,responsibleOwner:required(input.responsibleOwner??context.owner??input.author??context.actor,'responsible_owner_required'),
    scope:input.scope??null,reviewAt:input.reviewAt?instant(input.reviewAt,'invalid_review_at'):null,expiresAt:input.expiresAt?instant(input.expiresAt,'invalid_expires_at'):null,
    releaseId:required(input.releaseId??context.releaseId,'release_id_required'),auditReference:input.auditReference??null
  };
}

export function commandEvent({incidentId,type,payload,eventId,exercise=true,...meta},context={}){
  required(incidentId,'incident_id_required');required(type,'event_type_required');
  const evidence=evidenceMeta(meta,context),id=eventId??stableId('command-event',incidentId,type,evidence.author,evidence.observedAt,payload);
  return{schemaVersion:'vigia.incident-command-event.v1',eventId:id,incidentId,type,payload:structuredClone(payload??{}),exercise:Boolean(exercise),...evidence};
}
