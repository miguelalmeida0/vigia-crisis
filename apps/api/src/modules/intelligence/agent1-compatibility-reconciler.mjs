import { performance } from 'node:perf_hooks';
import {
  agent1CompatibilityRawPayloadHash,
  createIngestionRejection,
  operationalEventBindingHash
} from '../../../../../packages/domain/src/event-fabric/index.mjs';
import { immutable, semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';

const SOURCE_ID='agent1-operational-projection';

function instant(value){return new Date(value).toISOString();}
function uniqueSorted(values){return[...new Set((values??[]).map(String))].sort((left,right)=>left.localeCompare(right));}
function normalizedPayload(payload={}){
  const value=structuredClone(payload??{});
  if(Array.isArray(value.sourceIncidentIds))value.sourceIncidentIds=uniqueSorted(value.sourceIncidentIds);
  return value;
}
function revisionTime(value){
  if(value==='initial'||value===null||value===undefined||value==='')return Number.NEGATIVE_INFINITY;
  const parsed=Date.parse(String(value));return Number.isFinite(parsed)?parsed:null;
}
function compareRevision(left,right){
  const leftTime=revisionTime(left),rightTime=revisionTime(right);
  if(leftTime===null||rightTime===null)return null;
  return leftTime===rightTime?0:leftTime>rightTime?1:-1;
}
function latestEvent(events){
  return[...events].sort((left,right)=>{
    const compared=compareRevision(left.provider?.providerRevision,right.provider?.providerRevision);
    if(compared!==null&&compared!==0)return compared;
    return Number(left.journalSequence??0)-Number(right.journalSequence??0)||left.id.localeCompare(right.id);
  }).at(-1)??null;
}
function timeoutError(phase,budgetMs){
  return Object.assign(new Error(`agent1_compatibility_reconciliation_budget_exceeded:${phase}:${budgetMs}`),{code:'COMPATIBILITY_RECONCILIATION_TIMEOUT',phase,budgetMs});
}
function assertBudget({phase,deadlineMs,budgetMs,signal}){
  if(signal?.aborted||performance.now()>deadlineMs)throw timeoutError(phase,budgetMs);
}

export function agent1CompatibilityRevisionFingerprint(event={}){
  const core={
    provider:{adapterId:event.provider?.adapterId,providerEventId:event.provider?.providerEventId,providerRevision:event.provider?.providerRevision??null},
    eventType:event.eventType,hazardType:event.hazardType,
    source:{sourceId:event.source?.sourceId,familyId:event.source?.familyId,familyClass:event.source?.familyClass,producerId:event.source?.producerId,upstreamOrigin:event.source?.upstreamOrigin},
    clocks:{occurredAt:event.clocks?.occurredAt??null,observedAt:event.clocks?.observedAt??null,publishedAt:event.clocks?.publishedAt??null},
    geometry:event.geometry??null,correlationKeys:uniqueSorted(event.correlationKeys),subjectRefs:uniqueSorted(event.subjectRefs),payload:normalizedPayload(event.payload)
  };
  return semanticHash('agent1-compatibility-revision',core);
}

function rejectionFor({adapter,record,recordIndex,receivedAt,candidate,accepted,code,reasons}){
  const acceptedBindingHash=accepted?operationalEventBindingHash(accepted):null,attemptedBindingHash=candidate?operationalEventBindingHash(candidate):null;
  return createIngestionRejection({
    adapterId:adapter.id,adapterVersion:adapter.version,recordIndex,
    providerEventId:candidate?.provider?.providerEventId??record?.id??null,
    providerRevision:candidate?.provider?.providerRevision??record?.lastSeenAt??record?.updatedAt??record?.firstSeenAt??'initial',
    receivedAt,code,reasons,rawPayloadHash:agent1CompatibilityRawPayloadHash(record),retryable:false,
    conflict:accepted?{
      acceptedEventId:accepted.id,acceptedBindingHash,acceptedRevisionFingerprint:agent1CompatibilityRevisionFingerprint(accepted),
      attemptedEventId:candidate?.id??null,attemptedBindingHash,attemptedRevisionFingerprint:candidate?agent1CompatibilityRevisionFingerprint(candidate):null
    }:null
  });
}

export class Agent1CompatibilityReconciler{
  #service;#journal;#adapter;#clock;#status;
  constructor({service,journal,adapter,clock=()=>new Date()}={}){
    if(!service||!journal||!adapter)throw new Error('agent1_compatibility_reconciler_dependencies_required');
    this.#service=service;this.#journal=journal;this.#adapter=adapter;this.#clock=clock;
    this.#status={schemaVersion:'vigia.agent1-compatibility-reconciliation-status.v1',sourceId:adapter.id,state:'NOT_RUN',lastAttemptAt:null,lastCompletedAt:null,lastError:null,summary:null};
  }
  status(){return immutable(this.#status);}
  begin(at=this.#clock()){
    this.#status={...this.#status,state:'RECONCILING',lastAttemptAt:instant(at),lastError:null};
    return this.status();
  }
  complete({state='READY',summary=null}={}){
    this.#status={...this.#status,state,lastCompletedAt:instant(this.#clock()),lastError:null,summary:summary??this.#status.summary};
    return this.status();
  }
  markDegraded(error,summary=null){
    const at=instant(this.#clock());
    this.#status={...this.#status,state:'DEGRADED',lastCompletedAt:at,lastError:{code:error?.code??'COMPATIBILITY_RECONCILIATION_FAILED',message:String(error?.message??error)},summary:summary??this.#status.summary};
    return this.status();
  }
  async diff(records,{receivedAt=this.#clock(),deadlineMs=Number.POSITIVE_INFINITY,budgetMs=Number.POSITIVE_INFINITY,signal=null}={}){
    const at=instant(receivedAt),rows=(Array.isArray(records)?records:[records]).map((record,recordIndex)=>({record,recordIndex}));
    const accepted=(await this.#service.getOperationalEvents()).filter((event)=>event.provider?.adapterId===this.#adapter.id),byProvider=new Map();
    for(const event of accepted){const key=event.provider.providerEventId,history=byProvider.get(key)??[];history.push(event);byProvider.set(key,history);}
    const ordered=[...rows].sort((left,right)=>{
      const provider=String(left.record?.id??'').localeCompare(String(right.record?.id??''));if(provider)return provider;
      const leftRevision=left.record?.lastSeenAt??left.record?.updatedAt??left.record?.firstSeenAt??'initial',rightRevision=right.record?.lastSeenAt??right.record?.updatedAt??right.record?.firstSeenAt??'initial';
      const compared=compareRevision(leftRevision,rightRevision);return compared??String(leftRevision).localeCompare(String(rightRevision));
    });
    const items=[];
    for(const {record,recordIndex} of ordered){
      assertBudget({phase:'compatibility_diff',deadlineMs,budgetMs,signal});
      let candidate;
      try{
        const bytes=Buffer.byteLength(JSON.stringify(record??null));
        if(bytes>Number(this.#adapter.maxPayloadBytes??256*1024))throw Object.assign(new Error('provider_payload_too_large'),{code:'PAYLOAD_TOO_LARGE',details:[`payload_bytes:${bytes}`]});
        candidate=this.#adapter.adaptOne(record,{receivedAt:at,recordIndex});
      }catch(error){
        const rejection=rejectionFor({adapter:this.#adapter,record,recordIndex,receivedAt:at,candidate:null,accepted:null,code:error?.code??'ADAPTER_ERROR',reasons:error?.details??[String(error?.message??error)]});
        items.push({kind:'REJECTION',recordIndex,rejection});continue;
      }
      const providerEventId=candidate.provider.providerEventId,history=byProvider.get(providerEventId)??[];
      const sameRevision=history.filter((event)=>String(event.provider?.providerRevision??'')===String(candidate.provider.providerRevision??''));
      const matching=sameRevision.find((event)=>agent1CompatibilityRevisionFingerprint(event)===agent1CompatibilityRevisionFingerprint(candidate));
      if(matching){items.push({kind:'DUPLICATE',recordIndex,event:matching});continue;}
      if(sameRevision.length){
        const conflict=latestEvent(sameRevision),rejection=rejectionFor({adapter:this.#adapter,record,recordIndex,receivedAt:at,candidate,accepted:conflict,code:'PROVIDER_EVENT_IDENTITY_CONFLICT',reasons:['immutable_provider_revision_content_mismatch',conflict.id,candidate.id]});
        items.push({kind:'REJECTION',recordIndex,rejection});continue;
      }
      if(!history.length){
        items.push({kind:'CREATE',recordIndex,event:candidate});byProvider.set(providerEventId,[candidate]);continue;
      }
      const latest=latestEvent(history),comparison=compareRevision(candidate.provider.providerRevision,latest.provider.providerRevision);
      if(comparison===1){
        const update=this.#adapter.adaptOne(record,{receivedAt:at,recordIndex,action:'UPDATE',targetEventId:latest.id});
        items.push({kind:'UPDATE',recordIndex,event:update,priorEventId:latest.id});history.push(update);byProvider.set(providerEventId,history);continue;
      }
      const code=comparison===-1?'COMPATIBILITY_REVISION_REGRESSION':'COMPATIBILITY_REVISION_UNORDERED';
      const rejection=rejectionFor({adapter:this.#adapter,record,recordIndex,receivedAt:at,candidate,accepted:latest,code,reasons:[comparison===-1?'compatibility_snapshot_revision_precedes_current_accepted_revision':'compatibility_revision_order_cannot_be_proven',latest.id,candidate.id]});
      items.push({kind:'REJECTION',recordIndex,rejection});
    }
    const counts={rowsConsidered:rows.length,creates:items.filter((item)=>item.kind==='CREATE').length,updates:items.filter((item)=>item.kind==='UPDATE').length,duplicates:items.filter((item)=>item.kind==='DUPLICATE').length,quarantines:items.filter((item)=>item.kind==='REJECTION').length,acceptedJournalEventCount:this.#journal.status().eventCount};
    return{schemaVersion:'vigia.agent1-compatibility-reconciliation-plan.v1',adapter:{id:this.#adapter.id,version:this.#adapter.version},receivedAt:at,items,counts};
  }
  async persist(plan,{deadlineMs=Number.POSITIVE_INFINITY,budgetMs=Number.POSITIVE_INFINITY,signal=null}={}){
    const result={rowsConsidered:plan.counts.rowsConsidered,creates:0,updates:0,duplicates:0,quarantines:0,rejectionsAppended:0,duplicateRejections:0,acceptedJournalEventCount:this.#journal.status().eventCount};
    for(const item of plan.items){
      assertBudget({phase:'compatibility_persist',deadlineMs,budgetMs,signal});
      if(item.kind==='DUPLICATE'){result.duplicates+=1;continue;}
      if(item.kind==='REJECTION'){
        const persisted=await this.#journal.appendRejection(item.rejection,{recordedAt:plan.receivedAt});result.quarantines+=1;
        if(persisted.state==='DUPLICATE_REJECTION')result.duplicateRejections+=1;else result.rejectionsAppended+=1;
        continue;
      }
      const persisted=await this.#service.ingestOperationalEvent(item.event,{receivedAt:plan.receivedAt,ingestedAt:plan.receivedAt,project:false});
      if(persisted.state==='ACCEPTED')result[item.kind==='CREATE'?'creates':'updates']+=1;
      else if(persisted.state==='DUPLICATE')result.duplicates+=1;
      else result.quarantines+=1;
    }
    result.acceptedJournalEventCount=this.#journal.status().eventCount;
    return result;
  }
  async reconcile(records,{receivedAt=this.#clock(),projectedAt=this.#clock(),budgetMs=12_000,signal=null}={}){
    const startedAt=instant(this.#clock()),started=performance.now(),deadlineMs=started+budgetMs;
    this.begin(startedAt);
    try{
      const plan=await this.diff(records,{receivedAt,deadlineMs,budgetMs,signal});
      const summary=await this.persist(plan,{deadlineMs,budgetMs,signal});
      assertBudget({phase:'post_reconcile_projection',deadlineMs,budgetMs,signal});
      const twin=await this.#service.getCurrentTwin({asOf:projectedAt});
      const completedAt=instant(this.#clock()),state=summary.quarantines?'DEGRADED':plan.counts.rowsConsidered?'READY':'STALE';
      this.#status={...this.#status,state,lastCompletedAt:completedAt,lastError:null,summary:{...summary,projectionHash:twin.projectionHash,durationMs:Number((performance.now()-started).toFixed(3))}};
      return{schemaVersion:'vigia.agent1-compatibility-reconciliation.v1',state,plan,summary:this.#status.summary,twin};
    }catch(error){this.markDegraded(error);throw error;}
  }
}

export const AGENT1_COMPATIBILITY_SOURCE_ID=SOURCE_ID;
