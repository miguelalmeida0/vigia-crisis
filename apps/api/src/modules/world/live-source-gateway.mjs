import { SOURCE_DEFINITIONS } from './source-catalog.mjs';

const GROUPS={ptdata:['fires','riskToday','riskTomorrow','weather','warnings','history'],ipma:['ipmaWeather','ipmaWarnings'],copernicus:['copernicus'],firms:['firms']};
/** Acquisition protection only. Physical expiry continues to use each source's observation policy. */
export const SOURCE_FAILURE_POLICY=Object.freeze({deadlineMs:45000,openAfterFailures:3,cooldownMs:120000,retry:'Next scheduled acquisition after cooldown; no retries on the console read path',lastKnownValid:'Retain dated last-good data with failed/stale state; successful empty responses clear old data'});
export class LiveSourceGateway {
  constructor({ptdata,ipma,copernicus,firms,clock=()=>new Date(),policy={}}) {
    Object.assign(this,{ptdata,ipma,copernicus,firms,clock});
    this.policy={...SOURCE_FAILURE_POLICY,...policy};this.health=new Map();this.pending=new Map();
  }
  async acquire(group) {
    const ids=GROUPS[group],now=this.clock().getTime(),previous=this.health.get(group)??{failures:0,openUntil:0};
    const failure=reason=>Object.fromEntries(ids.map(id=>[id,{id,data:[],state:{id,...SOURCE_DEFINITIONS[id],state:'unavailable',lastAcquisitionAttemptAt:this.clock().toISOString(),error:reason,circuit:previous.openUntil>now?'OPEN':'CLOSED',failurePolicy:this.policy}}]));
    if(previous.openUntil>now)return failure('Provider circuit is cooling down; last known observations remain available.');
    if(this.pending.has(group))return failure('Previous provider request has not completed; overlapping acquisition suppressed.');
    let timer;
    const work=Promise.resolve().then(()=>this[group].snapshot());
    this.pending.set(group,work);
    work.then(()=>this.pending.delete(group),()=>this.pending.delete(group));
    try {
      const raw=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('provider_refresh_deadline_exceeded')),this.policy.deadlineMs);})]);
      const result=ids.length===1?{[ids[0]]:raw}:raw;
      const failed=ids.every(id=>!result[id]||['unavailable','failed'].includes(result[id].state?.state));
      const failures=failed?previous.failures+1:0;
      this.health.set(group,{failures,openUntil:failures>=this.policy.openAfterFailures?now+this.policy.cooldownMs:0});
      return Object.fromEntries(ids.map(id=>[id,result[id]?{...result[id],state:{...result[id].state,failurePolicy:{...this.policy,requestTimeoutMs:this[group].options?.timeoutMs??null,expirySeconds:SOURCE_DEFINITIONS[id]?.staleAfterSeconds,circuitScope:group},circuit:failures>=this.policy.openAfterFailures?'OPEN':'CLOSED',consecutiveProviderFailures:failures}}:failure('Source result missing')[id]]));
    } catch(error) {
      const failures=previous.failures+1;
      this.health.set(group,{failures,openUntil:failures>=this.policy.openAfterFailures?now+this.policy.cooldownMs:0});
      return failure(String(error.message??error));
    } finally {clearTimeout(timer);}
  }
  async snapshot() {
    const results=await Promise.allSettled(Object.keys(GROUPS).map(group=>this.acquire(group)));
    return Object.assign({},...results.map((r,index)=>r.status==='fulfilled'?r.value:Object.fromEntries(GROUPS[Object.keys(GROUPS)[index]].map(id=>[id,{id,data:[],state:{id,...SOURCE_DEFINITIONS[id],state:'unavailable',error:'Provider failed independently'}}]))));
  }
}
