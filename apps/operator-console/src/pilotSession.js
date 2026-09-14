const MAX_RECORDS=1000;
const MAX_STRING=240;
const ALLOWED_TYPES=new Set(['SESSION_STARTED','SESSION_ENDED','ROUTE_TRANSITION','EVENT_SELECTED','PREVENT_COMPARATOR','IMPORT_VALIDATED','IMPORT_CONFIRMED','EVIDENCE_REQUESTED','EVIDENCE_ACKNOWLEDGED','SOURCE_RETRY','HANDOFF_SNAPSHOT','INCIDENT_BRIEF_EXPORTED','TASK_MARKER','FACILITATOR_OBSERVATION','EXPLANATION_TRACE_OPENED','SOURCE_PASSPORT_OPENED','INTELLIGENCE_DECISION_RECORDED','UI_ERROR']);

const SENSITIVE_KEY=/(?:authorization|proxy-authorization|token|api[_-]?key|password|secret|credential|cookie|session|private[_-]?key)/i;
function safeString(value){return String(value)
  .replace(/\b(authorization|proxy-authorization)\s*[:=]\s*(?:bearer|basic)?\s*[^\s,;]+/gi,'$1=[REDACTED]')
  .replace(/\bbearer\s+[a-z0-9._~+\/-]+=*/gi,'Bearer [REDACTED]')
  .replace(/([?&](?:access_token|token|api[_-]?key|signature|x-amz-credential|x-amz-signature)=)[^&#\s]*/gi,'$1[REDACTED]')
  .replace(/\b(token|api[_-]?key|password|secret|credential|cookie)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]')
  .slice(0,MAX_STRING);}
function clean(value,depth=0){
  if(depth>3)return '[bounded]';
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value??null;
  if(typeof value==='string')return safeString(value);
  if(Array.isArray(value))return value.slice(0,20).map(item=>clean(item,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,20).map(([key,item])=>{const safeKey=String(key).slice(0,60);return[safeKey,SENSITIVE_KEY.test(safeKey)?'[REDACTED]':clean(item,depth+1)];}));
  return safeString(value);
}

export function createPilotSession({id,startedAt}){
  if(!id||!Number.isFinite(Date.parse(startedAt)))throw new Error('invalid_pilot_session');
  return{schemaVersion:'vigia.operator-pilot-session.v1',id:String(id),startedAt:String(startedAt),endedAt:null,records:[{sequence:1,type:'SESSION_STARTED',at:String(startedAt),data:{}}]};
}

export function appendPilotRecord(session,type,data={},at=new Date().toISOString()){
  if(!session||session.endedAt)return session;
  if(!ALLOWED_TYPES.has(type))throw new Error('unsupported_pilot_record_type');
  if(!Number.isFinite(Date.parse(at)))throw new Error('invalid_pilot_record_time');
  const records=[...(session.records??[]),{sequence:(session.records?.at(-1)?.sequence??0)+1,type,at:String(at),data:clean(data)}].slice(-MAX_RECORDS);
  return{...session,records};
}

export function endPilotSession(session,endedAt=new Date().toISOString()){
  const next=appendPilotRecord(session,'SESSION_ENDED',{},endedAt);
  return next?{...next,endedAt:String(endedAt)}:next;
}

function csvSafe(value){
  let text=value===null||value===undefined?'':typeof value==='string'?value:JSON.stringify(value);
  if(/^[=+\-@]/.test(text))text=`'${text}`;
  return`"${text.replaceAll('"','""')}"`;
}

export function pilotSessionCsv(session){
  const header=['session_id','sequence','type','at','data_json'];
  const rows=(session?.records??[]).map(record=>[session.id,record.sequence,record.type,record.at,record.data].map(csvSafe).join(','));
  return[header.join(','),...rows].join('\n');
}

export function pilotSessionJson(session){return JSON.stringify(session,null,2);}
