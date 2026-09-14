import { incidentInScope, canonicalIncidentId } from '../../../../../packages/domain/src/authorization.mjs';
import { incidentQuestions } from '../../../../../packages/domain/src/operational-twin/operator-questions.mjs';

const rows=v=>Array.isArray(v)?v:[];
const value=(data,key)=>['READY','DEGRADED'].includes(data[key]?.state)?data[key].value:null;
/** Only dated persisted human/work events enter physical history; evaluation ticks remain audit-only. */
export function appendOperationalActivity(physical,data,actor,incidentId) {
  const attention=rows(value(data,'humanAttention')?.items).flatMap(item=>{
    const state=item.humanAttention?.state??item.state,at=item.humanAttention?.lastUpdatedAt??item.acknowledgedAt??item.lastUpdatedAt,id=item.incidentId??incidentId;
    if(!['ACKNOWLEDGED','OWNED','IN_PROGRESS','ESCALATED','RESOLVED','COMPLETED'].includes(state)||!Number.isFinite(Date.parse(at))||!id||!incidentInScope(actor,id))return [];
    return [{id:item.attentionId??item.id,incidentId:id,at,type:'Operations',source:'Vigia operations',material:true,where:physical.incidents.find(i=>canonicalIncidentId(i.incidentId)===canonicalIncidentId(id))?.locationLabel??'Associated incident',text:`${item.title??item.question??'Operator task'}: ${state.toLowerCase().replaceAll('_',' ')}${item.owner?' · '+item.owner:''}.`,evidence:[item.attentionId??item.id].filter(Boolean)}];
  });
  const response=rows(value(data,'responseOperations')?.activity).filter(item=>/^(TASK_ASSIGNED|RESOURCE_ASSIGNED|TASK_COMPLETED|TASK_ESCALATED|FIELD_REPORT|ROAD_RESTRICTION)$/.test(item.eventType??item.type??'')).filter(item=>Number.isFinite(Date.parse(item.observedAt??item.at))&&incidentInScope(actor,item.incidentId??incidentId)).map(item=>({...item,at:item.observedAt??item.at,incidentId:item.incidentId??incidentId,type:/FIELD/.test(item.eventType??item.type)?'Field report':/ROAD/.test(item.eventType??item.type)?'Road':'Operations',source:item.source??'Vigia operations',material:true,text:item.title??item.summary??'Operational assignment updated.'}));
  const events=[...attention,...response].filter(e=>Date.parse(e.at)<=Date.parse(physical.asOf));
  physical.activity=[...physical.activity,...events].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,100);
  for(const i of physical.incidents){i.changes=[...i.changes,...events.filter(e=>canonicalIncidentId(e.incidentId)===canonicalIncidentId(i.incidentId))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,40);if(i.questions)i.questions=incidentQuestions(i);}
  return physical;
}
