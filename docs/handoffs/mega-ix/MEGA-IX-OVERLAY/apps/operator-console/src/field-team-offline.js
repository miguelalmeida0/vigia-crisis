// Offline projections may lose freshness, but may never gain an assurance.
export function datedTeamView(saved,now=Date.now()) {
  const view=structuredClone(saved);view.retainedAt=saved.retainedAt??saved.at;view.at=new Date(now).toISOString();
  const expired=x=>!x||!Number.isFinite(Date.parse(x))||Date.parse(x)<=now;
  view.missions=view.missions.map(m=>{
    const ended=expired(m.endAt),stale=ended||expired(view.context.sourceValidUntil)||expired(m.currentRoute?.validUntil)||(m.relevantReports??[]).some(r=>expired(r.validUntil));
    const dated={...m,fallback:expired(m.fallback?.validUntil)?null:m.fallback};return stale?{...dated,lifecycle:ended?'ENDED':m.lifecycle,state:'UNKNOWN',reason:ended?'This mission’s time window has ended.':'Stored information needs a new check. Connect to local VIGIA.'}:dated;
  });
  view.people=view.people.map(p=>({...p,online:false}));view.hub.localPeople=0;
  view.reports=view.reports.map(r=>({...r,missions:expired(r.validUntil)?[]:r.missions.map(m=>({...m,alternativeMinutes:view.missions.find(v=>v.id===m.id)?.fallback?.minutes??null}))}));
  return view;
}

export async function offlineKey(passphrase,salt){
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Use at least 12 characters for the offline passphrase.');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptOffline(value,key){const iv=crypto.getRandomValues(new Uint8Array(12));const body=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return {iv,body};}
export async function decryptOffline(record,key){return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv},key,record.body)));}
