import {TeamHubSync} from '../../../../field-node/src/team-hub-sync.mjs';
// An explicitly configured, already-authorized operator connection. Credentials
// remain on the hub. Provisioning/membership is never inferred or auto-expanded.
export function centralTeamTransport({url,token,fetchImpl=fetch}){
  const origin=new URL(url);if(origin.protocol!=='https:'||origin.username||origin.password)throw Error('Team central connection requires HTTPS.');
  if(!token||token.length<24)throw Error('An authenticated central operator token is required.');
  async function request(part,body){const r=await fetchImpl(new URL('/api/v10/team/'+part,origin),{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,accept:'application/json','content-type':'application/json','x-vigia-operator-intent':'operator-console'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000),redirect:'error'});if(!r.ok)throw Error('Central connection could not authorize this team.');const raw=await r.text();if(raw.length>16000000)throw Error('Central team response exceeded its bound.');return JSON.parse(raw);}
  return {transmit:(envelope,via)=>request('envelopes',{envelope,via}),receive:(groupId,after=0)=>request('groups/'+encodeURIComponent(groupId)+'/sync?after='+after)};
}
const synchronizers=new WeakMap();
export function teamSynchronizer(service,actor,groupId){let items=synchronizers.get(service);if(!items){items=new Map();synchronizers.set(service,items);}const key=groupId+':'+actor.id;if(!items.has(key))items.set(key,new TeamHubSync({service,actor,groupId,transport:service.centralTransport??null,clock:service.clock}));return items.get(key);}
