const terminal=new Set(['COMPLETED','SATISFIED','RESOLVED','CLOSED','NO_LONGER_REQUIRED','SUPERSEDED','CANCELLED','REJECTED']);
export function evaluateTaskRelevance(task,currentness,{asOf=currentness?.evaluatedAt,sources=[],changes=[]}={}){
 const original=task.state??task.status??'ACTIVE',dependencies=[...(task.sourceIds??[]),...(task.dependsOnSourceIds??[]),...(task.selectedSourceIds??[]),task.sourceId,task.selectedSourceId].filter(Boolean),failed=sources.filter(s=>dependencies.includes(s.sourceId??s.id)&&!(s.reason==='Registered source baseline.'&&!s.lastHealthEventId)&&['FAILED','UNAVAILABLE','DEGRADED','STALE'].includes(String(s.status??s.state).toUpperCase()));
 let state,reason;
 if(terminal.has(original)||String(original).startsWith('COMPLETED_')){state=original==='SATISFIED'?'COMPLETED':original;reason='The recorded work outcome is preserved.';}
 else if(currentness?.state==='RESOLVED'){state='NO_LONGER_REQUIRED';reason='The incident has a supported resolution; this verification task is no longer required.';}
 else if(currentness&&!currentness.inActiveQueue){state='SUSPENDED';reason='Incident is no longer in the active operational window.';}
 else if(currentness?.state==='REOPENED'){state='NEEDS_REVIEW';reason='New fire-related activity makes this task eligible for review and reactivation.';}
 else if(failed.length){state='BLOCKED';reason='A source required for this task is currently unavailable.';}
 else if(/WAITING|SCHEDULED/.test(original)){state='WAITING';reason='Waiting for the declared observation or source update.';}
 else{state='ACTIVE';reason='The incident remains in the operational queue and this work has no recorded completion.';}
 const prior=task.relevance,transition=prior?.state!==state?{from:prior?.state??original,to:state,at:asOf,reason}:null;
 return{...task,sourceWorkState:original,relevance:{state,reason,createdBecause:task.createdBecause??[task.requirementId??task.requirement?.id??'Recorded operational requirement'],relevantWhile:['Incident remains operationally current, monitored, or has actionable review'],invalidatedBy:['Supported incident resolution','Recorded completion or supersession'],suspendedBy:state==='SUSPENDED'?[currentness.state]:[],reopenedBy:currentness?.reopenedAt?[currentness.latestSignal?.id].filter(Boolean):[],blockedBy:failed.map(s=>s.sourceId??s.id),lastEvaluatedAt:asOf,triggers:['CURRENTNESS','OFFICIAL_STATUS','THERMAL_ACTIVITY','FIELD_OBSERVATION','SOURCE_STATE','WARNING','ROAD_CONTEXT','CONTRADICTION'],changeIds:changes.map(c=>c.id).filter(Boolean),history:[...(prior?.history??[]),...(transition?[transition]:[])]}};
}
