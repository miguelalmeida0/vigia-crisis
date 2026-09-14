const ESCAPE = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=(value)=>String(value??'').replace(/[&<>"']/g,(character)=>ESCAPE[character]);
export const text=(value,fallback='UNKNOWN')=>value===null||value===undefined||value===''?fallback:String(value);
export const label=(value)=>text(value).replaceAll('_',' ');
export const count=(value)=>Number.isFinite(Number(value))?Number(value):null;
export function timeLabel(value){if(!value)return'UNKNOWN';const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'UNKNOWN';}
export function ageLabel(value,now=Date.now()){
  if(value===null||value===undefined||value==='')return'AGE UNKNOWN';
  const seconds=Number.isFinite(Number(value))?Number(value):Math.max(0,(now-Date.parse(value))/1000);
  if(!Number.isFinite(seconds))return'AGE UNKNOWN';
  if(seconds<60)return`${Math.round(seconds)}s ago`;
  if(seconds<3600)return`${Math.floor(seconds/60)}m ago`;
  return`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ago`;
}
export const isException=(state)=>['MISSING','MAYDAY','STALE','UNKNOWN','OVERDUE','DEGRADED','LOST','FAILED','INCOMPLETE','NOT_READY','UNACKNOWLEDGED','OUT_OF_SERVICE','CREW_SPLIT','NOT_CONFIRMED_OUTSIDE'].some((token)=>String(state??'').includes(token));
export const severity=(value)=>{const state=String(value??'').toUpperCase();return['P0','CRITICAL','MAYDAY','MISSING'].some((token)=>state.includes(token))?'critical':['P1','HIGH','DEGRADED','OVERDUE','INCOMPLETE'].some((token)=>state.includes(token))?'warning':'normal';};
export const roleLabel=(role)=>({FIREFIGHTER:'Firefighter',COMPANY_OFFICER:'Company officer',DIVISION_SUPERVISOR:'Division / Group',INCIDENT_COMMAND:'Incident command',DISPATCH_EOC:'Dispatch / EOC',ACCOUNTABILITY:'Accountability',MAYDAY_RESCUE:'Mayday / Rescue'})[role]??label(role);
export function locationLabel(location={}){
  const state=location.verificationState??location.verification_state??location.state??'UNKNOWN';
  if(state==='UNKNOWN')return'Location unknown — no map inference';
  const place=location.areaLabel??location.operationalArea??location.label??location.verbalMarker??'Operational area not reported';
  return state==='CONFIRMED'?place:state==='DEVICE_ESTIMATED'?`${place} · uncertainty region`:state==='REPORTED'?`${place} · reported area`:state==='STALE'?`${place} · faded last-known region`:place;
}
