import { performance } from 'node:perf_hooks';

const METRIC_DEFAULTS=Object.freeze({rowsConsidered:0,creates:0,updates:0,duplicates:0,quarantines:0,rejectionsAppended:0,duplicateRejections:0,acceptedJournalEventCount:0});

function instant(value){return new Date(value).toISOString();}
function timeoutError(subphase,timeoutMs){return Object.assign(new Error(`canonical_twin_startup_budget_exceeded:${subphase}:${timeoutMs}`),{code:'CANONICAL_TWIN_STARTUP_TIMEOUT',subphase,timeoutMs});}
async function bounded(operation,{subphase,timeoutMs,controller=null}){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort(timeoutError(subphase,timeoutMs));reject(timeoutError(subphase,timeoutMs));},timeoutMs);timer.unref?.();})
    ]);
  }finally{clearTimeout(timer);}
}
function errorDetails(error){return{errorCode:error?.code??'CANONICAL_TWIN_STARTUP_FAILED',errorMessage:String(error?.message??error)};}

export async function initializeCanonicalTwin({
  service,journal,reconciler,snapshotEvents=[],loadSnapshotEvents=null,clock=()=>new Date(),canonicalBudgetMs=30_000,compatibilityBudgetMs=12_000,onPhase=null
}={}){
  if(!service||!journal||!reconciler)throw new Error('canonical_twin_startup_dependencies_required');
  const report=(state,subphase,details={})=>{if(typeof onPhase==='function')onPhase({phase:'canonical_twin_projection',subphase,state,at:instant(clock()),...details});};
  const run=async(subphase,operation,{timeoutMs,controller=null,startedMetrics={}}={})=>{
    const startedAt=instant(clock()),started=performance.now(),base={...METRIC_DEFAULTS,acceptedJournalEventCount:journal.status().eventCount,...startedMetrics};
    report('subphase_started',subphase,{startedAt,...base});
    try{
      const outcome=await bounded(operation,{subphase,timeoutMs,controller}),completedAt=instant(clock()),metrics={...base,...(outcome?.metrics??{})};
      report('subphase_completed',subphase,{startedAt,completedAt,durationMs:Number((performance.now()-started).toFixed(3)),...metrics});
      return outcome?.value??outcome;
    }catch(error){
      const completedAt=instant(clock());report('subphase_failed',subphase,{startedAt,completedAt,durationMs:Number((performance.now()-started).toFixed(3)),...base,...errorDetails(error)});throw error;
    }
  };

  await run('journal_initialize',async()=>{await service.initialize();return{value:journal.status(),metrics:{acceptedJournalEventCount:journal.status().eventCount}};},{timeoutMs:canonicalBudgetMs});
  const durableTwin=await run('durable_twin_projection',async()=>{const twin=await service.getCurrentTwin();return{value:twin,metrics:{rowsConsidered:twin.eventCount,acceptedJournalEventCount:journal.status().eventCount}};},{timeoutMs:canonicalBudgetMs});

  const controller=new AbortController(),compatibilityStarted=performance.now(),deadlineMs=compatibilityStarted+compatibilityBudgetMs,remaining=()=>Math.max(1,Math.ceil(deadlineMs-performance.now()));
  let compatibilityRows=Array.isArray(snapshotEvents)?snapshotEvents:[];
  let plan=null,persistence=null;
  reconciler.begin?.(clock());
  try{
    plan=await run('compatibility_diff',async()=>{
      if(typeof loadSnapshotEvents==='function'){
        const loaded=await loadSnapshotEvents();compatibilityRows=Array.isArray(loaded)?loaded:Array.isArray(loaded?.events)?loaded.events:[];
      }
      const value=await reconciler.diff(compatibilityRows,{receivedAt:clock(),deadlineMs,budgetMs:compatibilityBudgetMs,signal:controller.signal});return{value,metrics:value.counts};
    },{timeoutMs:remaining(),controller,startedMetrics:{rowsConsidered:compatibilityRows.length}});
    persistence=await run('compatibility_persist',async()=>{
      const value=await reconciler.persist(plan,{deadlineMs,budgetMs:compatibilityBudgetMs,signal:controller.signal});return{value,metrics:value};
    },{timeoutMs:remaining(),controller,startedMetrics:plan.counts});
    const twin=await run('post_reconcile_projection',async()=>{
      const value=await service.getCurrentTwin();return{value,metrics:{...persistence,acceptedJournalEventCount:journal.status().eventCount}};
    },{timeoutMs:remaining(),controller,startedMetrics:persistence});
    const state=persistence.quarantines?'DEGRADED':plan.counts.rowsConsidered?'READY':'STALE';
    reconciler.complete?.({state,summary:{...persistence,projectionHash:twin.projectionHash,durationMs:Number((performance.now()-compatibilityStarted).toFixed(3))}});
    return{schemaVersion:'vigia.canonical-twin-startup.v1',state:'READY',durableProjectionHash:durableTwin.projectionHash,projectionHash:twin.projectionHash,compatibilityState:state,reconciliation:persistence,journal:journal.status()};
  }catch(error){
    controller.abort(error);const summary=persistence??plan?.counts??{...METRIC_DEFAULTS,rowsConsidered:compatibilityRows.length,acceptedJournalEventCount:journal.status().eventCount};
    reconciler.markDegraded(error,summary);
    for(const subphase of ['compatibility_diff','compatibility_persist','post_reconcile_projection']){
      const alreadyCompleted=subphase==='compatibility_diff'?Boolean(plan):subphase==='compatibility_persist'?Boolean(persistence):false;
      if(!alreadyCompleted&&error?.subphase!==subphase&&error?.phase!==subphase)report('subphase_skipped',subphase,{startedAt:null,completedAt:instant(clock()),durationMs:0,...METRIC_DEFAULTS,...summary,...errorDetails(error)});
    }
    return{schemaVersion:'vigia.canonical-twin-startup.v1',state:'READY_WITH_DEGRADED_COMPATIBILITY',durableProjectionHash:durableTwin.projectionHash,projectionHash:durableTwin.projectionHash,compatibilityState:'DEGRADED',reconciliation:summary,error:errorDetails(error),journal:journal.status()};
  }
}
