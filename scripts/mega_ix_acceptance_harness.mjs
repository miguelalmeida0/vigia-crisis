// Local test support only. Never registered in the production API.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {TeamService} from '../apps/api/src/modules/mission/team-service.mjs';
import {TeamStore} from '../apps/api/src/modules/mission/team-store.mjs';
import {registerTeamRoutes} from '../apps/api/src/modules/mission/team-routes.mjs';
import {Router} from '../apps/api/src/http/router.mjs';
import {identity} from '../packages/domain/src/fieldnet/team-protocol.mjs';

export async function startControlledTeamHarness(incidentId){
  const make=()=>new TeamService({store:new TeamStore({filePath:':memory:'}),situation:{snapshot:async()=>({snapshot:null})}});
  const local=make(),central=make(),people=['Ana','Pedro','Sofia'];
  const actors=Object.fromEntries(people.map(name=>[name,{id:name,name,role:'administrator',incidentScopes:[incidentId],authentication:{authenticated:true,mode:'CONTROLLED_FIELD_TEST'}}]));
  for(const name of people){const d=await identity();await local.enroll(actors[name],{incidentId,deviceId:d.deviceId,publicKey:d.publicKey});}
  const group=await local.createGroup(actors.Ana,{incidentId,name:'CONTROLLED FIELD TEST — Louredo team',memberIds:['Pedro','Sofia'],lane:'CONTROLLED_FIELD_TEST'});
  let upstream=true;
  const provision=()=>{central.store.put('group',group.id,local.store.get('group',group.id));central.store.put('test-context',group.id,local.store.get('test-context',group.id));for(const d of local.store.list('device'))central.store.put('device',d.id,d);};
  provision();
  local.centralTransport={transmit:async(envelope,via)=>{if(!upstream)throw Error('Controlled upstream link disabled');provision();return central.accept(actors.Ana,envelope,via);},receive:async(id,after)=>{if(!upstream)throw Error('Controlled upstream link disabled');const page=central.store.page('envelope',id,after);return {...page,envelopes:page.records.map(r=>({envelope:r.envelope,via:r.relayedBy??[]}))};}};
  const tokens=Object.fromEntries(people.map(name=>[name,randomBytes(32).toString('hex')]));
  const router=new Router();registerTeamRoutes(router,{teamService:local});
  const server=http.createServer((req,res)=>{const name=people.find(p=>req.headers.authorization==='Bearer '+tokens[p]);void router.safeHandle(req,res,{actor:name?actors[name]:null});});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {origin:'http://127.0.0.1:'+server.address().port,tokens,group,
    setUpstream:value=>{upstream=Boolean(value);},
    snapshot:name=>local.snapshot(actors[name],group.id),
    counts:()=>Object.fromEntries(['local','central'].map((name,n)=>{const s=n?central:local;return [name,Object.fromEntries(['mission','report','confirmation','message','receipt'].map(kind=>[kind,s.records(kind,group).map(r=>r.id)]))];})),
    close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));local.store.close();central.store.close();}};
}
