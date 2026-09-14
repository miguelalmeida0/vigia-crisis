import {readJson,writeJsonAtomic} from '../../shared/json-file.mjs';
import {hash} from '../../../../../packages/domain/src/intelligence/world-knowledge.mjs';
import {ipRoadObservations} from '../../../../../packages/domain/src/intelligence/road-observations.mjs';
export const IP_ROAD_BASE='https://utility.arcgis.com/usrsvcs/servers/98bffc4ef35b4e18a03641918c5d07dd/rest/services/webapps/viajar_na_estrada2024/MapServer';
export const IP_ROAD_SOURCE={id:'infraestruturas-portugal-traffic',provider:'Infraestruturas de Portugal',authority:'GOVERNMENT',url:'https://servicos.infraestruturasdeportugal.pt/viajar-na-estrada/transito-em-tempo-real',coverage:'Published occurrences on the IP traffic map. Incomplete road-network coverage; no road-clearance guarantee.'};
export class RoadStateService{
 constructor({pool=null,filePath,clock=()=>new Date(),fetchImpl=fetch}){Object.assign(this,{pool,filePath,clock,fetchImpl});this.state={snapshots:[],status:null};}
 async initialize(){if(this.pool){const [s,t]=await Promise.all([this.pool.query('SELECT payload FROM road_source_snapshot ORDER BY known_at DESC LIMIT 1'),this.pool.query('SELECT payload FROM road_source_status WHERE source_id=$1',[IP_ROAD_SOURCE.id])]);this.state={snapshots:s.rows.map(r=>r.payload),status:t.rows[0]?.payload??null};}else this.state=await readJson(this.filePath,this.state);}
 async tick(){if(this.running||Date.parse(this.state.status?.nextCheck??0)>this.clock().getTime())return;this.running=true;try{return await this.refresh();}finally{this.running=false;}}
 async refresh(){
  const at=this.clock().toISOString();let result;
  try{const observations=[];for(const layer of [0,1,2]){const url=IP_ROAD_BASE+'/'+layer+'/query?'+new URLSearchParams({f:'json',where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',resultRecordCount:'1000'}),r=await this.fetchImpl(url,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});if(!r.ok)throw new Error('road_http_'+r.status);const text=await r.text();if(text.length>2000000)throw new Error('road_source_size_limit');observations.push(...ipRoadObservations(JSON.parse(text),{...IP_ROAD_SOURCE,layer,dataUrl:url},at));}
   const contentHash=hash(observations.map(r=>[r.id,r.revision]).sort(([a],[b])=>a.localeCompare(b))),prior=this.state.snapshots[0],changed=prior?.contentHash!==contentHash,snapshot={id:'road-source:'+hash([at,contentHash]),sourceId:IP_ROAD_SOURCE.id,knownAt:at,contentHash,observations};
   if(changed){if(this.pool)await this.pool.query('INSERT INTO road_source_snapshot(id,source_id,known_at,content_hash,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[snapshot.id,snapshot.sourceId,at,contentHash,JSON.stringify(snapshot)]);this.state.snapshots=[snapshot,...this.state.snapshots].slice(0,200);}
   const recovered=this.state.status?.state!=='AVAILABLE';this.state.status={...IP_ROAD_SOURCE,state:'AVAILABLE',lastCheck:at,lastSuccessfulCheck:at,nextCheck:new Date(Date.parse(at)+300000).toISOString(),count:observations.length,changed};result={state:changed?'CHANGED':'UNCHANGED',count:observations.length};if(changed||recovered)await this.onChanged?.();
  }catch(error){this.state.status={...IP_ROAD_SOURCE,...this.state.status,state:'UNAVAILABLE',lastCheck:at,error:String(error.message).slice(0,200),nextCheck:new Date(Date.parse(at)+300000).toISOString()};result={state:'UNAVAILABLE',error:this.state.status.error};await this.onChanged?.();}
  if(this.pool){
   await this.pool.query('INSERT INTO road_source_status(source_id,payload) VALUES($1,$2) ON CONFLICT(source_id) DO UPDATE SET payload=excluded.payload',[IP_ROAD_SOURCE.id,JSON.stringify(this.state.status)]);
   if(this.lastRetentionDay!==at.slice(0,10)){
    // Keep the latest pre-window anchor as well as all changes in the last 30 days.
    await this.pool.query("DELETE FROM road_source_snapshot WHERE source_id=$1 AND known_at<$2::timestamptz-interval '30 days' AND id<>(SELECT id FROM road_source_snapshot WHERE source_id=$1 AND known_at<$2::timestamptz-interval '30 days' ORDER BY known_at DESC LIMIT 1)",[IP_ROAD_SOURCE.id,at]);
    this.lastRetentionDay=at.slice(0,10);
   }
  }else await writeJsonAtomic(this.filePath,this.state);return result;
 }
 context(at=this.clock().toISOString()){
  const status=this.state.status,snapshot=this.state.snapshots.find(s=>s.knownAt<=at),checked=status?.lastSuccessfulCheck,age=checked?Date.parse(at)-Date.parse(checked):Infinity,fresh=status?.state==='AVAILABLE'&&age>=0&&age<=600000;
  const reports=(snapshot?.observations??[]).filter(r=>r.knownAt<=at&&r.providerActive&&Date.parse(r.validFrom)<=Date.parse(at)&&(!r.validUntil||Date.parse(r.validUntil)>Date.parse(at))).map(r=>({...r,publishedValidUntil:r.validUntil,validUntil:new Date(Math.min(r.validUntil?Date.parse(r.validUntil):Infinity,Date.parse(checked??snapshot.knownAt)+600000)).toISOString()}));
  return {roadReports:reports,roadCoverage:{connected:!!snapshot,state:status?.state==='UNAVAILABLE'?'UNAVAILABLE':!snapshot?'NOT_CONNECTED':!fresh?'STALE':'PARTIAL',complete:false,checkedAt:checked??null,validUntil:checked?new Date(Date.parse(checked)+600000).toISOString():null,source:IP_ROAD_SOURCE.provider,sourceUrl:IP_ROAD_SOURCE.url,coveredRoads:[],lastAttemptAt:status?.lastCheck??null,sourceAgeMs:Number.isFinite(age)?age:null,reason:IP_ROAD_SOURCE.coverage}};
 }
}
