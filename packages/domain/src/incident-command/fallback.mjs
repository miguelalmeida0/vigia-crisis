import { roleProjection } from './projections.mjs';

const line=(...cells)=>cells.map((cell)=>String(cell??'UNKNOWN').replaceAll('\n',' ')).join(' | ');
export function fallbackExport(state,kind,{now=new Date(),releaseId,lastSyncAt=null}={}){
  const header=[`VIGIA COMMAND SURVIVAL · ${kind}`,`generated_at: ${now.toISOString()}`,`data_freshness: ${state.lastUpdatedAt??'UNKNOWN'}`,`release_id: ${releaseId??state.incident?.releaseId??'UNKNOWN'}`,`incident_id: ${state.incidentId}`,`last_sync: ${lastSyncAt??'UNKNOWN'}`,`unknowns: ${roleProjection(state,'INCIDENT_COMMAND',{now}).unknowns.map((item)=>`${item.rule}:${item.crewId}`).join(', ')||'none recorded'}`,''];
  let rows=[];
  if(kind==='ACCOUNTABILITY_ROSTER')rows=['PERSON | CREW | STATE | LAST LOCATION',...Object.values(state.persons).map((person)=>line(person.name,person.currentCrewId,person.operationalState,state.locations[person.personId]?.operationalAreaId??state.locations[person.personId]?.verificationState))];
  else if(kind==='CREW_PASSPORT')rows=['CREW | LEADER | MEMBERS | ASSIGNMENT',...Object.values(state.crews).map((crew)=>line(crew.crewId,crew.leaderId,(crew.memberIds??[]).join(','),crew.assignmentId))];
  else if(kind==='ASSIGNMENTS')rows=['ASSIGNMENT | OBJECTIVE | AREA | SUPERVISOR | STATUS',...Object.values(state.assignments).map((item)=>line(item.assignmentId,item.objectiveId,item.operationalAreaId,item.supervisorId,item.state))];
  else if(kind==='PAR_SHEET')rows=['PAR | SUBJECT | ACCOUNTED | CONDITION | TIME',...Object.values(state.parRequests).flatMap((request)=>Object.values(request.responses??{}).map((item)=>line(request.parRequestId,item.subjectId,item.accounted,item.condition,item.observedAt)))];
  else if(kind==='MAYDAY_RESCUE')rows=['MAYDAY | PERSON | STATE | LAST LOCATION | PINNED',...Object.values(state.maydays).map((item)=>line(item.maydayId,item.personId,item.state,state.locations[item.personId]?.operationalAreaId??state.locations[item.personId]?.verificationState,item.pinned))];
  else if(kind==='CRITICAL_ORDERS')rows=['ORDER | TYPE | STATE | UNRESOLVED RECIPIENTS',...Object.values(state.orders).map((item)=>line(item.orderId,item.orderType,item.state,(item.unresolvedRecipients??[]).join(',')))];
  else if(kind==='RESOURCE_STATUS')rows=['RESOURCE | KIND | STATE | ASSIGNMENT',...Object.values(state.resources).map((item)=>line(item.resourceId,item.kind,item.state,item.assignmentId))];
  else if(kind==='COMMAND_TRANSFER')rows=['TRANSFER | FROM | TO | TIME',...Object.values(state.commandTransfers).map((item)=>line(item.commandTransferId,item.fromActorId,item.toActorId,item.observedAt))];
  else throw new Error('unsupported_fallback_export');return{schemaVersion:'vigia.manual-fallback-export.v1',kind,contentType:'text/plain; charset=utf-8',generatedAt:now.toISOString(),body:[...header,...rows].join('\n')};
}
