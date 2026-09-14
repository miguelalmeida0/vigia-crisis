import {BASE_INCIDENTS, TASK_TEMPLATES, INITIAL_ACTIVITY} from './fixtures.js';
export function initialState(){return {version:1,variant:'populated',selected:'lever',tasks:{},activity:[...INITIAL_ACTIVITY]};}
export function isLimited(state){return state.variant==='limited';}
export function isReadonly(state){return state.variant==='readonly' || state.variant==='limited';}
export function incidentsFor(state){return isLimited(state)?null:BASE_INCIDENTS;}
export function incidentFor(state,id=state.selected){return BASE_INCIDENTS.find(i=>i.id===id)||null;}
export function tasksFor(state,incidentId=state.selected){
 if(isLimited(state)||!incidentFor(state,incidentId))return null;
 return (Array.isArray(state.tasks[incidentId])?state.tasks[incidentId]:null) || TASK_TEMPLATES.map(t=>({...t,id:`${incidentId}:${t.key}`,incidentId,notes:[]}));
}
export function taskCounts(tasks){if(tasks===null)return null;return {attention:tasks.filter(x=>x.status==='attention').length,progress:tasks.filter(x=>x.status==='progress').length,waiting:tasks.filter(x=>x.status==='waiting').length,completed:tasks.filter(x=>x.status==='completed').length,total:tasks.length};}
export function incidentCounts(incidents){if(!incidents)return null;return {total:incidents.length,candidate:incidents.filter(i=>i.status==='candidate').length,confirmed:incidents.filter(i=>i.status==='confirmed').length,monitored:incidents.filter(i=>i.status==='monitored').length,high:incidents.filter(i=>i.priority==='high').length};}
export function filterIncidents(list,{search='',status='all',type='all',priority='all',region='all'}={}){
 const q=search.trim().toLocaleLowerCase();
 return (list||[]).filter(i=>(!q||`${i.name} ${i.region} ${i.id}`.toLocaleLowerCase().includes(q))&&(status==='all'||i.status===status)&&(type==='all'||(type==='heat'?i.type==='Heat detection':i.type!=='Heat detection'))&&(priority==='all'||i.priority===priority)&&(region==='all'||i.region===region));
}
export function updateTask(state,id,changes){
 if(isReadonly(state))throw new Error('This preview mode is read-only.');
 const tasks=tasksFor(state);const task=tasks.find(t=>t.id===id);if(!task)throw new Error('Select a task in the current incident.');
 if(changes.status&&!['attention','progress','waiting','completed'].includes(changes.status))throw new Error('Invalid task status.');
 const valid={};for(const key of ['status','owner','notes'])if(key in changes)valid[key]=changes[key];
 return {...state,tasks:{...state.tasks,[state.selected]:tasks.map(t=>t.id===id?{...t,...valid}:t)}};
}
export function addVerificationTask(state,question){
 if(isReadonly(state))throw new Error('This preview mode is read-only.');
 const tasks=tasksFor(state);const found=tasks.find(t=>t.question===question.id&&t.status!=='completed');
 if(found)return {state,task:found,created:false};
 const task={id:`${state.selected}:check-${question.id}-${tasks.length}`,key:question.id,incidentId:state.selected,title:`Review ${question.short.toLowerCase()}`,summary:question.resolves,status:'attention',priority:'normal',owner:'Unassigned',due:null,blocker:'Source review required',question:question.id,notes:[]};
 return {state:{...state,tasks:{...state.tasks,[state.selected]:[...tasks,task]}},task,created:true};
}
export function parseRoute(hash){
 const clean=hash.replace(/^#\/?/,'');const [path,query='']=clean.split('?');const params=new URLSearchParams(query);
 const aliases={'overview':'command-overview','global-awareness':'national-awareness'};
 const route=aliases[path]||path||'command-overview';
 return {route,params};
}
export function routeURL(route,incidentId,extra={}){const params=new URLSearchParams(extra);if(incidentId&&['incident-detail','intelligence','operations'].includes(route))params.set('id',incidentId);return `#/${route}${params.size?'?'+params.toString():''}`;}
export function timeLabel(date){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(date))+' UTC';}
export function csv(rows){return rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
