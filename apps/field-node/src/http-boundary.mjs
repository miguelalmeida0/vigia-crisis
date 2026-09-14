const decode = (value) => value ? decodeURIComponent(value) : '';
const nonempty = (value) => { const text=String(value??'').trim(); return text||null; };
const incidentCollectionActions=new Set(['import']);

export function resolveFieldRequestIncident({ pathname, searchParams, input, store }) {
  const candidates=[];
  const add=(value)=>{const text=nonempty(value);if(text)candidates.push(text);};
  const incidentPathSegment=decode(pathname.match(/^\/api\/fieldnet\/incidents\/([^/]+)/)?.[1]);
  if(!incidentCollectionActions.has(incidentPathSegment))add(incidentPathSegment);
  add(searchParams?.get?.('incidentId'));
  add(input?.incidentId);add(input?.package?.incidentId);add(input?.observation?.incidentId);add(input?.report?.incidentId);add(input?.task?.incidentId);
  add(input?.parameters?.incidentId);add(input?.observation?.parameters?.incidentId);add(input?.changes?.incidentId);
  const taskId=pathname.match(/^\/api\/fieldnet\/tasks\/([^/]+)/)?.[1];if(taskId)add(store.task(decode(taskId))?.incidentId);
  const conflictId=pathname.match(/^\/api\/fieldnet\/conflicts\/([^/]+)/)?.[1];if(conflictId)add(store.conflict(decode(conflictId))?.incidentId);
  const unique=[...new Set(candidates)];
  if(unique.length>1)throw Object.assign(new Error('fieldnet_incident_identity_mismatch'),{statusCode:409,details:{incidentIds:unique}});
  return unique[0]??'';
}

function collectIncidentIds(value,found=new Set(),depth=0){
  if(!value||typeof value!=='object'||depth>6)return found;
  if(nonempty(value.incidentId))found.add(String(value.incidentId));
  for(const nested of Object.values(value))collectIncidentIds(nested,found,depth+1);
  return found;
}
export function fieldEventIncidentId(event){const ids=[...collectIncidentIds(event?.payload)];return ids.length===1?ids[0]:null;}
export function fieldEventVisible(event,incidentId){const eventIncident=fieldEventIncidentId(event);return eventIncident===String(incidentId)||(!eventIncident&&['CONNECTION_STATE_CHANGED','SYNC_COMPLETED'].includes(event?.type));}

export function publicFieldNodeHealth({ releaseId, now = new Date() } = {}) {return{ok:true,service:'vigia-fieldnet-kernel',releaseId:releaseId??null,generatedAt:new Date(now).toISOString()};}
export function scopedFieldNodeSnapshot(snapshot,incidentId){return{schemaVersion:snapshot.schemaVersion,nodeId:snapshot.nodeId??null,connectionState:snapshot.connectionState,centralUrlConfigured:snapshot.centralUrlConfigured,releaseId:snapshot.releaseId,releaseCompatibility:snapshot.releaseCompatibility,incidents:(snapshot.incidents??[]).filter((item)=>String(item.incidentId)===String(incidentId)),generatedAt:snapshot.generatedAt};}
