import { canonicalIncidents, envelope, incidentEnvelope, incidentId, incidentLabel, incidentLocation, incidentCoordinate, operatorText, timeLabel, value } from '../../canonicalViewModel.js';
import { canManageWork, requirementCopy } from '../../operatorTaskView.js';
import { laneOf, ownerOf, nextOf, sourceOf, impactOf } from '../../routes/operations.js';
import { decisionCategory } from '../../routes/reportsAnalytics.js';

import {namedArea} from './hierarchy.js';

export { timeLabel };
export const rows = x => Array.isArray(x) ? x : [];
export const text = x => operatorText(typeof x === 'string' || typeof x === 'number' ? x : null, {missing:'Not reported'});
export const finite = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
export const stamp = x => x?.observedAt ?? x?.acquiredAt ?? x?.at ?? x?.updatedAt ?? x?.changedAt;
function questionVM(q){const copy=requirementCopy(q),question=String(q.question??'');if(/extent|perimeter|geometry/i.test(question))Object.assign(copy,{title:'Confirm the observed incident boundary',why:'Observed extent is required before spatial conclusions can be supported.'});else if(/weather|environment/i.test(question))Object.assign(copy,{title:'Check local environmental conditions',why:'Attributable environmental context is needed for this incident.'});return {...q,...copy};}
const sections = { 'command-overview':'commandOverview', incidents:'incidents', 'reports-analytics':'reports', 'global-awareness':'globalAwareness', 'national-awareness':'globalAwareness' };
export function sourceFor(runtime, route) { route=({'fire-activity':'intelligence','response-access':'operations'})[route]??route; return sections[route] ? envelope(runtime,sections[route]) : incidentEnvelope(runtime,route==='incident-detail'?'detail':route); }
export function incidentVM(record) {
  const truth=record?.operationalTruth??record?.incident?.operationalTruth??{}, coordinate=incidentCoordinate(record), classification=truth.classification;
  const graph=record?.evidenceGraph??{}, sources=[...rows(graph.sources),...rows(graph.evidence),...rows(graph.observations)];
  const families=[...new Set(sources.map(x=>x.sourceFamily??x.provider??x.platform??x.source).filter(x=>typeof x==='string'))];
  return {raw:record,id:incidentId(record),name:incidentLabel(record),region:incidentLocation(record),classification,
    currentness:truth.currentness??null,status:classification??'UNKNOWN',statusLabel:truth.currentness?.label??text(classification),verified:classification==='VERIFIED_CURRENT',
    priority:text(truth.priority?.level??truth.priority?.band??record?.incident?.priority?.level??record?.priority?.level??(typeof record?.priority==='string'?record.priority:null)),
    priorityScore:finite(truth.priority?.score??record?.priorityScore), type:text(record?.incident?.hazardType??record?.incident?.type??record?.incident?.incidentType??record?.type),
    observedAt:truth.lastObservedAt??record?.incident?.observedAt??record?.observedAt??null,
    coordinate,lon:coordinate?.[0],lat:coordinate?.[1],coverage:families.length?`${families.length} recorded source families`:'Source coverage not returned',
    verification:text(truth.axes?.verification?.state),freshness:text(truth.axes?.freshness?.state),
    statement:truth.currentness?.reason??(classification==='NEEDS_REVALIDATION'?'Earlier information needs revalidation. Current fire presence is not verified.':classification==='DETECTION_CANDIDATE'?'A candidate observation is recorded. A wildfire is not yet verified.':classification==='HISTORICAL_CLOSED'?'Historical record; not a current fire.':classification==='VERIFIED_CURRENT'?'Current source observations meet the incident verification policy.':'The current incident state was not returned. Fire presence is unknown.')};
}
export function incidentsFor(vm) {
 const rank={REOPENED:0,NEW:1,CURRENT:1,MONITORING:2,STALE:3,HISTORICAL:4,RESOLVED:5,VERIFIED_CURRENT:1,DETECTION_CANDIDATE:1,NEEDS_REVALIDATION:3,HISTORICAL_CLOSED:5};
 return rows(vm.incidents).slice().sort((a,b)=>(rank[a.currentness?.state??a.status]??4)-(rank[b.currentness?.state??b.status]??4)||(Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0)||a.name.localeCompare(b.name));
}
export function incidentFor(vm) {return vm.incident;}
export function isLimited(vm) {return !vm.source||(['command-overview','incidents','global-awareness'].includes(vm.route)&&vm.incidents===null);}
export function isReadonly(vm) {return !canManageWork(vm.runtime.runtime?.session,vm.selected);}
export function incidentCounts(list) {if(!list)return null;return {total:list.length,candidate:list.filter(x=>x.status==='DETECTION_CANDIDATE').length,confirmed:list.filter(x=>x.status==='VERIFIED_CURRENT').length,monitored:list.filter(x=>x.status==='NEEDS_REVALIDATION').length,closed:list.filter(x=>x.status==='HISTORICAL_CLOSED').length};}
export function filterIncidents(list,filters={}) {return rows(list).filter(i=>(!filters.search||`${i.name} ${i.region} ${i.id}`.toLowerCase().includes(filters.search.toLowerCase()))&&(!filters.status||filters.status==='ALL'||filters.status==='QUEUE'&&i.currentness?.inActiveQueue===true||filters.status==='CURRENT'&&i.currentness?.countsAsCurrent===true||filters.status==='REVIEW'&&(i.currentness?.actionableReview===true||i.currentness?.state==='REOPENED')||i.currentness?.state===filters.status||i.status===filters.status)&&(!filters.type||filters.type==='ALL'||i.type===filters.type)&&(!filters.priority||filters.priority==='ALL'||i.priority===filters.priority)&&(!filters.region||filters.region==='ALL'||i.region===filters.region));}
export function routeURL(route,id) {const target=({'global-awareness':'national-awareness',intelligence:'fire-activity',operations:'response-access'})[route]??route;return `#/${target}${['incident-detail','fire-activity','response-access'].includes(target)&&id?`?id=${encodeURIComponent(id)}`:''}`;}
export function activityVM(items) {return rows(items).filter(x=>Number.isFinite(Date.parse(stamp(x)))).sort((a,b)=>Date.parse(stamp(b))-Date.parse(stamp(a))).map(x=>({raw:x,time:timeLabel(stamp(x)),title:text(x.title??x.label??x.summary??x.reason??x.eventType??x.to),actor:text(x.actor?.name??x.actor??x.owner)}));}
export function baseVM(runtime,route) {
  const source=sourceFor(runtime,route),inventorySource=['command-overview','incidents','global-awareness','national-awareness'].includes(route)?source:envelope(runtime,'incidents'),inventory=canonicalIncidents(inventorySource),hasInventory=['canonicalIncidents','incidents','situationalAwareness'].some(key=>value(inventorySource,key)!==null);
  const locationSource=incidentEnvelope(runtime,'location'),detailSource=incidentEnvelope(runtime,'detail')??locationSource,rawDetail=value(detailSource,'canonicalIncident'),rawSelected=rawDetail?{...rawDetail,operationalTruth:value(detailSource,'operationalTruth')??rawDetail.operationalTruth}:null;
  const selected=runtime.selectedIncidentId,matching=rawSelected&&incidentId(rawSelected)===selected?rawSelected:inventory.find(i=>incidentId(i)===selected);
  return {runtime,route,source,selected,incidents:hasInventory?inventory.map(incidentVM):null,incident:matching?incidentVM(matching):null,scene:value(source,'mapScene')??(['command-overview','global-awareness','national-awareness'].includes(route)?value(runtime.runtime.canonical.mapContexts?.[route==='command-overview'?'command':'national'],'mapScene'):null)??(matching&&['incident-detail','fire-activity','response-access','intelligence','operations'].includes(route)?value(locationSource,'mapScene'):null),activity:[],generatedAt:source?.generatedAt};
}
export function CommandOverviewViewModel(runtime) {
  const vm=baseVM(runtime,'command-overview'),presentation=value(vm.source,'commandPresentation'),metrics=presentation?.metrics??{},health=value(vm.source,'healthAxes')??{};
  vm.presentation=presentation;vm.currentnessCounts=value(vm.source,'operationalTruth')?.currentnessCounts??null;
  const sources=value(vm.source,'sourceHealth')?.sources;vm.sourceStatuses=Array.isArray(sources)?sources.map(s=>({label:text(s.label),status:s.status})):null;
  vm.workload=[['Information to collect',finite(value(vm.source,'informationCollection')?.summary?.informationRequirements)],['Response actions',finite(value(vm.source,'responseOperations')?.summary?.count)],['Decisions to review',finite(value(vm.source,'humanAttention')?.count)]];
  vm.metrics=[['Detection candidates',finite(metrics.detectionCandidates?.value),'Current detections awaiting corroboration','red'],['Verified current incidents',finite(metrics.activeIncidents?.value),'Governed current verification only','green'],['Human decisions',finite(metrics.needsAttention?.value),'Require operator authority or judgement','amber'],['Historical records',finite(value(vm.source,'operationalTruth')?.historicalCount),'Retained history outside operational attention','blue']];
  const byId=new Map(rows(vm.incidents).map(i=>[i.id,i]));vm.priorities=rows(presentation?.priorityIncidents).map(i=>byId.get(i.incidentId)).filter(i=>i&&i.currentness?.inActiveQueue===true).slice(0,5);
  vm.activity=activityVM(presentation?.activity);vm.health=Object.entries(health).filter(([,v])=>v&&typeof v==='object'&&v.state).map(([key,v])=>({label:text(key.replace(/Health$/,'').replace(/([a-z])([A-Z])/g,'$1 $2')),state:text(v.state),raw:v.state}));return vm;
}
export function IncidentsViewModel(runtime) {const vm=baseVM(runtime,'incidents');vm.ui={incidentFilters:{search:runtime.incidentSearchDraft??runtime.incidentSearch??'',status:runtime.incidentStateFilter??'QUEUE',type:runtime.incidentTypeFilter??'ALL',priority:runtime.incidentPriority??'ALL',region:runtime.incidentRegion??'ALL'},page:runtime.incidentPage??1};vm.statusOptions=[['QUEUE','Operational queue'],['CURRENT','Current'],['MONITORING','Monitoring'],['REVIEW','Needs review'],['HISTORICAL','Historical'],['STALE','Stale'],['RESOLVED','Resolved'],['ALL','All stored records']];vm.typeOptions=[['ALL','All types'],...[...new Set(rows(vm.incidents).map(i=>i.type))].map(x=>[x,x])];vm.priorityOptions=[['ALL','All priorities'],...[...new Set(rows(vm.incidents).map(i=>i.priority))].map(x=>[x,text(x)])];return vm;}
export function IncidentDetailViewModel(runtime) {const vm=baseVM(runtime,'incident-detail');vm.timeline=activityVM(value(vm.source,'operationalTimeline')??vm.incident?.raw?.transitions);const intel=incidentEnvelope(runtime,'intelligence');vm.questions=rows(value(intel,'informationCollection')?.requirements).map(questionVM);vm.assets=rows(vm.scene?.layers?.contextAssets?.value);return vm;}
export function IntelligenceViewModel(runtime) {
  const vm=baseVM(runtime,'intelligence'),collection=value(vm.source,'informationCollection');const seen=new Set();vm.questions=rows(collection?.requirements).filter(q=>{if(!q.id)return false;if(seen.has(q.id))return false;seen.add(q.id);return true;}).map(questionVM);
  vm.question=vm.questions.find(q=>q.id===runtime.approvedQuestionId)??null;
  const next=vm.questions.flatMap(q=>rows(q.collectionTasks)).map(t=>t.nextAttempt).filter(t=>Number.isFinite(Date.parse(t))).sort()[0];
  vm.brief=[['Now',vm.incident?.statusLabel??'Assessment unavailable'],['Next check',next?`Next check ${timeLabel(next)}`:'Next check not reported'],['Confidence gap',collection?`${vm.questions.length} distinct questions`:'Questions unavailable'],['Decision recommendation',text(value(vm.source,'currentAssessment')?.decisionSupport?.decision??'No admitted recommendation')]];
  vm.evidence=['observations','thermalSupport','weather','terrain','contextAssets','observedGeometry'].flatMap(key=>{const layer=vm.scene?.layers?.[key];if(!['READY','DEGRADED'].includes(layer?.state))return[];return rows(layer.value).map(item=>({key,raw:item,source:text(item.platform??item.instrument??item.provider?.label??item.provider??item.source??layer.authority),type:({observations:'Thermal observation',thermalSupport:'Observation support',weather:'Weather',terrain:'Terrain',contextAssets:'Mapped context',observedGeometry:'Observed geometry'})[key],at:timeLabel(stamp(item)),finding:key==='weather'?[Number.isFinite(item.temperatureC)?`${item.temperatureC} °C`:null,Number.isFinite(item.windSpeedKph)?`${item.windSpeedKph} km/h wind`:null].filter(Boolean).join(' · ')||'Weather context':key==='observations'||key==='thermalSupport'?Number.isFinite(item.frpMw)?`${item.frpMw} MW FRP`:'Thermal observation':text(item.properties?.label??item.label??item.summary??item.kind??key),qualification:key==='observedGeometry'?'Governed observed geometry':key==='observations'?'Observation, not official confirmation':key==='thermalSupport'?'Supporting context, not observed extent':'Context, not observed impact'}));});
  const groups=new Map();for(const record of vm.evidence){const key=record.key+'::'+record.source,group=groups.get(key);if(group){group.count++;group.finding=`${group.count} returned records · ${group.firstFinding}`;}else groups.set(key,{...record,count:1,firstFinding:record.finding});}vm.evidence=[...groups.values()];return vm;
}
export function tasksFor(vm) {return vm.tasks;}
export function taskCounts(tasks) {if(!tasks)return null;return Object.fromEntries(['all','attention','progress','waiting','completed'].map(k=>[k==='all'?'total':k,tasks.filter(t=>k==='all'||t.status===k).length]));}

export function OperationsViewModel(runtime) {
  const vm=baseVM(runtime,'operations'),info=value(vm.source,'informationCollection'),response=value(vm.source,'responseOperations'),protection=value(vm.source,'protectWorkflows'),single=value(vm.source,'protectWorkflow');
  const groups={resolution:Array.isArray(info?.requirements)?info.requirements:null,response:response?(rows(response.items).length?response.items:[...rows(response.actions),...rows(response.assignments)]):null,protect:Array.isArray(protection?.workflows)?protection.workflows:single?[single]:null};
  vm.lane=['resolution','response','protect'].includes(runtime.operationsTab)?runtime.operationsTab:'resolution';vm.groups=groups;
  vm.tasks=groups[vm.lane]?.map((raw,index)=>({raw,id:String(raw.id??raw.jobId??raw.actionId??raw.assignmentId??raw.workflowId??raw.chainId??`returned:${index}`),kind:vm.lane,title:raw.question?questionVM(raw).title:text(raw.title??raw.label??raw.name??(vm.lane==='protect'?`${text(raw.universe)} protection workflow`:null)),summary:impactOf(raw),owner:ownerOf(raw),due:nextOf(raw)?timeLabel(nextOf(raw)):null,lastCheck:raw.currentAssessment?.lastCheckedAt??raw.lifecycle?.lastCheckedAt??raw.lastCheckAt??raw.lastAttemptAt??null,source:sourceOf(raw),blocker:raw.currentAssessment?.blocker??raw.reason??'Not reported',statusLabel:raw.humanAttention?.state?text(raw.humanAttention.state):null,status:['IN_PROGRESS','OWNED','ACKNOWLEDGED'].includes(raw.humanAttention?.state)?'progress':{human:'attention',handling:'progress',waiting:'waiting',completed:'completed'}[laneOf(raw)],priority:typeof raw.priority?.level==='string'?raw.priority.level.toLowerCase():null,notes:[],universe:text(raw.universe??'Not declared')}))??null;
  vm.ui={taskTab:runtime.approvedTaskTab??'all',taskId:runtime.selectedOperationId};
  vm.metrics=[['Information to collect',groups.resolution?.length??null,'resolution'],['Response actions',groups.response?.length??null,'response'],['Protect / Recover',groups.protect?.length??null,'protect'],['Decisions to review',finite(value(vm.source,'humanAttention')?.count),null]];
  const attention=value(vm.source,'humanAttention'),activity=[...rows(attention?.items).filter(x=>x.acknowledgedAt||x.lastUpdatedAt).map(x=>({...x,at:x.acknowledgedAt??x.lastUpdatedAt,title:x.decision??x.title})),...rows(response?.activity),...rows(value(vm.source,'operationalTimeline'))];vm.activity=activityVM(activity);return vm;
}

export const reportPeriods=[['H24','Last 24 hours'],['H72','Last 72 hours'],['H168','Last 7 days'],['ALL','All returned history']];
function datedRange(items,range,end,previous=false) {const hours={H24:24,H72:72,H168:168}[range];return rows(items).filter(i=>{const at=Date.parse(i.at??i.createdAt??i.routedAt??i.changedAt??'');if(!Number.isFinite(at))return false;if(!hours)return !previous&&at<=end;const upper=end-(previous?hours*3600000:0);return at>upper-hours*3600000&&at<=upper;});}
function percentile(values,p=.95) {const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;}
export function ReportsViewModel(runtime) {
  const vm=baseVM(runtime,'reports-analytics'),source=vm.source,attention=value(source,'humanAttention'),end=Date.parse(source?.generatedAt??'')||Date.now(),range=runtime.reportsRange??'H24';
  vm.ui={reportTab:runtime.reportsTab==='summary'?'decisions':runtime.reportsTab??'decisions',period:range,compare:runtime.reportsCompare==='true'};
  const unique=[...new Map(rows(attention?.items).filter(i=>i.attentionId??i.id).map(i=>[i.attentionId??i.id,i])).values()];
  vm.decisions=attention?datedRange(unique,range,end):null;vm.previous=attention&&range!=='ALL'?datedRange(unique,range,end,true):null;
  const closed=rows(vm.decisions).filter(i=>['CLOSED','RESOLVED','COMPLETED'].includes(i.state??i.workState));
  const groups=new Map();for(const item of rows(vm.decisions)){const label=decisionCategory(item);groups.set(label,(groups.get(label)??0)+1);}
  const days=new Map();for(const i of rows(vm.decisions)){const key=new Date(i.at??i.createdAt??i.routedAt??i.changedAt).toISOString().slice(0,10);days.set(key,(days.get(key)??0)+1);}const ordered=[...days].sort(([a],[b])=>a.localeCompare(b));
  vm.period={label:reportPeriods.find(([key])=>key===range)?.[1],reviewed:vm.decisions?.length??null,resolved:attention?closed.length:null,open:attention?rows(vm.decisions).filter(i=>['ACKNOWLEDGEMENT_REQUIRED','IN_PROGRESS','OWNED','ESCALATED','ACKNOWLEDGED'].includes(i.state??i.workState)).length:null,series:ordered.map(([,n])=>n),labels:ordered.map(([d])=>d.slice(5)),categories:[...groups],undated:unique.filter(i=>!Number.isFinite(Date.parse(i.at??i.createdAt??i.routedAt??i.changedAt??''))).length};
  vm.plan=value(source,'outcomeMeasurementPlan');vm.outcome=value(source,'outcomeMeasurement');vm.quality=value(source,'situationQuality');
  const telemetry=runtime.runtime.mapObservability??{},scenes=Object.values(telemetry.scenes??{}),api=Object.values(runtime.runtime.performance?.api??{}),apiSamples=api.filter(i=>Number.isFinite(Date.parse(i.attemptedAt??''))&&i.ok&&finite(i.durationMs)!==null),stable=scenes.map(i=>finite(i.timeToStableMapMs)).filter(Number.isFinite);
  const mapMs=stable.length?Math.max(...stable):null,apiMs=percentile(apiSamples.map(i=>i.durationMs)),tileFailures=finite(telemetry.tileFailures),overlayFailures=finite(telemetry.overlayFailures);
  vm.performance=[{label:'Map stable render',value:mapMs===null?null:Number((mapMs/1000).toFixed(2)),unit:'s',target:'Target < 1.5 s · this browser session',bad:mapMs!==null&&mapMs>=1500,samples:stable.length}, {label:'API response p95',value:apiMs===null?null:Math.round(apiMs),unit:'ms',target:'Target < 1,000 ms · successful session requests',bad:apiMs!==null&&apiMs>=1000,samples:apiSamples.length},{label:'Basemap tile failures',value:tileFailures,unit:'failures',target:'Target 0 failures · this browser session',bad:tileFailures!==null&&tileFailures>0,samples:scenes.length},{label:'Thermal overlay failures',value:overlayFailures,unit:'failures',target:'Optional thermal transport · target 0 failures',bad:overlayFailures!==null&&overlayFailures>0,samples:scenes.length}];
  vm.services=[['Report data',source?'Available':'Unavailable'],['Outcome measurement',vm.outcome?'Available':'Unavailable'],['Basemap transport',tileFailures===null?'Not measured':tileFailures?'Source degraded':'No recorded failures'],['Thermal context',overlayFailures===null?'Not measured':overlayFailures?'Source degraded':'No recorded failures']];return vm;
}

export function NationalAwarenessViewModel(runtime) {
  const vm=baseVM(runtime,'global-awareness'),region=runtime.globalRegion??'ALL',layer=runtime.approvedNationalLayer??'incidents';
  const counts=new Map();for(const i of rows(vm.incidents).filter(i=>i.currentness?.inActiveQueue===true))counts.set(i.region,(counts.get(i.region)??0)+1);
  vm.regions=[['ALL','All authorized regions'],...[...counts].filter(([r])=>namedArea(r)).sort(([a],[b])=>a.localeCompare(b)).map(([r])=>[r,r])];
  vm.pillRegions=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([r])=>r);if(region!=='ALL'&&!vm.pillRegions.includes(region))vm.pillRegions.push(region);
  vm.typeOptions=[['ALL','All types'],...[...new Set(rows(vm.incidents).map(i=>i.type))].filter(t=>t&&!/unknown|not reported/i.test(t)).sort().map(t=>[t,t])];
  vm.ui={region,nationalLayer:layer,nationalType:runtime.globalType??'ALL'};vm.regionLabel=region==='ALL'?'Portugal · authorized scope':region;
  vm.regionIncidents=rows(vm.incidents).filter(i=>i.currentness?.inActiveQueue===true).filter(i=>(region==='ALL'||i.region===region)&&(!runtime.globalType||runtime.globalType==='ALL'||i.type===runtime.globalType));
  vm.incident=vm.regionIncidents.find(i=>i.id===runtime.globalSelectedIncidentId)??null;
  const ids=new Set(vm.regionIncidents.map(i=>i.id));vm.weather=rows(vm.scene?.layers?.weather?.value).filter(w=>region==='ALL'||ids.has(w.incidentId));
  vm.latest=vm.regionIncidents.map(i=>i.observedAt).filter(t=>Number.isFinite(Date.parse(t))).sort().at(-1)??null;
  vm.geolocated=vm.regionIncidents.filter(i=>i.coordinate).length;
  const authorized=value(vm.source,'authorizedScope');if(vm.scene&&/Portugal.*mainland/i.test(authorized?.region??'')){const bounds={west:-9.53,south:36.84,east:-6.38,north:42.29};vm.scene={...vm.scene,bounds,camera:{...vm.scene.camera,center:[-7.955,39.565],bbox:bounds,zoom:6}};}
  return vm;
}
