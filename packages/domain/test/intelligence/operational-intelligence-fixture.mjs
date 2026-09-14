import { createCanonicalOperationalEvent, commitOperationalEvent, createSourceRegistry, createSourceHealthEvent } from '../../src/event-fabric/index.mjs';

// Isolated test universe; none of these records are imported by production.
export const at = minute => new Date(Date.UTC(2026,8,7,12,minute)).toISOString();
export const actor = {id:'test-operator',role:'supervisor',incidentScopes:['incident:test-fire']};
export const definitions = [
  {sourceId:'thermal',familyId:'physical.viirs',familyClass:'PHYSICAL'},
  {sourceId:'optical',familyId:'physical.optical',familyClass:'PHYSICAL'},
  {sourceId:'official',familyId:'official.authority',familyClass:'OFFICIAL'},
  {sourceId:'thermal-copy',familyId:'physical.viirs',familyClass:'PHYSICAL'},
];
export const registry = () => createSourceRegistry(definitions.map(s=>({...s,registeredAt:at(-1),staleAfterMs:6*60*60*1000})));
export function event(sourceId,minute,extra={}) {
  const definition=definitions.find(s=>s.sourceId===sourceId);
  return createCanonicalOperationalEvent({eventType:definition.familyClass==='OFFICIAL'?'wildfire.official_alert':'wildfire.thermal_observation',hazardType:'wildfire',
    provider:{adapterId:'isolated-test',adapterVersion:'1',providerEventId:`${sourceId}:${minute}`},
    source:{...definition,producerId:sourceId,upstreamOrigin:sourceId==='thermal-copy'?'thermal':sourceId},
    clocks:{occurredAt:at(minute),observedAt:at(minute),publishedAt:at(minute),receivedAt:at(minute)},
    geometry:[-8,40],correlationKeys:['incident:test-fire'],
    payload:{observationState:'OBSERVED_POSITIVE',stance:'SUPPORTING',materiality:'MATERIAL'},
    provenance:{strength:'VERIFIED',upstreamMeasurementId:sourceId==='thermal-copy'?'thermal:0':`${sourceId}:${minute}`,rawPayloadHash:'isolated:test'},
    proof:{synthetic:true},...extra});
}
export const recorded = (sourceId,minute,extra) => commitOperationalEvent(event(sourceId,minute,extra),at(minute));
export const health = (status,minute) => commitOperationalEvent(createSourceHealthEvent({sourceId:'official',status,at:at(minute),reason:'Isolated test source check',...(status==='ACTIVE'?{lastSuccessAt:at(minute)}:{})}),at(minute));
export const requirement = () => ({id:'requirement:test',incidentId:'incident:test-fire',state:'OPEN',collectionTasks:[{id:'task:test',sourceId:'official',state:'BLOCKED',owner:null,deadline:at(30),nextCheckAt:at(10)}]});
