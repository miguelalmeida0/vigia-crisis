import { CRITICAL_CHANGE_TYPES,member,required,stableId } from './contracts.mjs';

export function targetCriticalChange(input,state){
  member(input.type,CRITICAL_CHANGE_TYPES,'invalid_critical_change_type');required(input.owner,'critical_change_owner_required');
  const crewIds=new Set(input.affectedCrewIds??[]),areaIds=new Set(input.affectedOperationalAreaIds??[]),roles=new Set(['INCIDENT_COMMAND']);
  for(const crew of Object.values(state.crews??{}))if(areaIds.has(crew.operationalAreaId))crewIds.add(crew.crewId);
  if(input.type.startsWith('WATER_')||input.type==='PUMP_ENGAGED_NO_FLOW'){roles.add('OPERATIONS');roles.add('WATER_SUPPLY');for(const crew of Object.values(state.crews??{}))if(['WORKING','WITHDRAWING'].some((status)=>crew.operationalState===status))crewIds.add(crew.crewId);}
  if(input.type==='ESCAPE_ROUTE_THREATENED'||input.type==='SAFETY_ZONE_VIABILITY_CHANGED')roles.add('SAFETY_OFFICER');
  if(input.type==='COMMUNICATIONS_LOST')roles.add('DISPATCH_EOC');
  const recipients=[...new Set([...crewIds,...roles,...(input.additionalRecipients??[])])];
  return{...input,criticalChangeId:input.criticalChangeId??stableId('critical-change',input.incidentId,input.type,input.observedAt,input.scope),targeting:{rationale:{assignmentRelations:[...crewIds],operationalAreas:[...areaIds],commandRoles:[...roles],hazardScope:input.scope??null},recipients,deliveryState:Object.fromEntries(recipients.map((id)=>[id,'PENDING'])),exceptions:[]}};
}

export function maydayPriorityContract(state,recipientRole){const active=Object.values(state.maydays??{}).filter((item)=>item.pinned);return{schemaVersion:'vigia.mayday-priority-contract.v1',active:active.length>0,priority:active.length?'P0_LIFE_SAFETY':'NORMAL',recipientRole,suppressNonessential:active.length>0,alwaysVisible:['MAYDAY','ACCOUNTABILITY','PAR','EVACUATION','RESCUE','CRITICAL_CHANGE'],suppressedWhenActive:['PREVENTION_MEASUREMENT','ROUTINE_VALIDATION','NONCRITICAL_TELEMETRY'],maydayIds:active.map((item)=>item.maydayId)};}
