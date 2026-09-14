import { portugalEvents, preventionFindings, selectedReplayCase } from './viewModel.js?v=2.1.0';

export async function callResult(name,fn){
  const attemptedAt=new Date().toISOString(),started=performance.now();
  try{return{ok:true,value:await fn(),attemptedAt,durationMs:Number((performance.now()-started).toFixed(2)),error:null};}
  catch(error){if(error?.name!=='AbortError')console.warn(`[VIGIA] ${name} unavailable`,error);return{ok:false,value:null,attemptedAt,durationMs:Number((performance.now()-started).toFixed(2)),error:error?.name==='AbortError'?'request_aborted':String(error?.message??error).slice(0,200)};}
}
export async function safeCall(name,fn){const result=await callResult(name,fn);return result.ok?result.value:null;}

const authenticationMode=session=>session?.mode??session?.actor?.authentication?.mode??null;
export function sessionContinuityMatches(current,next){
  if(current?.authenticated!==true||next?.authenticated!==true)return false;
  if(['environment_bearer','operator_proxy_assertion'].includes(authenticationMode(current)))return authenticationMode(next)===authenticationMode(current)&&Boolean(current.actor?.id)&&next.actor?.id===current.actor.id;
  return Boolean(current.sessionId)&&next.sessionId===current.sessionId;
}

function dependency(result,previous,value){
  if(result.ok)return{state:'READY',lastAttemptAt:result.attemptedAt,lastSuccessAt:result.attemptedAt,lastGoodAt:result.attemptedAt,failureClass:null};
  const retainedValue=value!==null&&value!==undefined;
  return{state:retainedValue?'STALE':'FAILED',lastAttemptAt:result.attemptedAt,lastSuccessAt:previous?.lastSuccessAt??null,lastGoodAt:previous?.lastGoodAt??previous?.lastSuccessAt??null,failureClass:result.error??'dependency_unavailable'};
}
const retained=(result,previous)=>result.ok?result.value:previous??null;

export function createRuntimeLoader({state,api,render,persist,loadEvent,loadFinding,loadReplayCase,onRuntimeLoaded=()=>{}}){
  let refreshPromise=null;
  return async function refreshRuntime({quiet=false}={}){
    if(refreshPromise)return refreshPromise;
    const previous=structuredClone(state.runtime),previousDependencies=previous.dependencies??{};
    state.runtime.status='loading';if(!quiet)render();
    refreshPromise=(async()=>{
      const healthRequest=callResult('health',api.health),sessionResult=await callResult('session creation',api.createSession??api.session);
      const requests={
        health:healthRequest,bootstrap:callResult('bootstrap',api.bootstrap),events:callResult('events',api.events),
        command:callResult('command',api.commandBootstrap),territory:callResult('territory',api.territory),replay:callResult('replay',api.replay),alerts:callResult('alerts',api.alerts),
        operationsStatus:callResult('operations status',api.operationsStatus),fieldnet:callResult('fieldnet',api.fieldnet),benchmark:callResult('detection benchmark',api.detectionBenchmark),preventionConsensus:callResult('prevention consensus',api.preventionConsensus),intelligenceInbox:typeof api.intelligenceInbox==='function'?callResult('intelligence inbox',api.intelligenceInbox):Promise.resolve({ok:false,value:null,attemptedAt:new Date().toISOString(),error:'intelligence_not_configured'})
      };
      const [healthResult,bootstrapResult,eventsResult]=await Promise.all([requests.health,requests.bootstrap,requests.events]);
      const health=retained(healthResult,previous.health),session=sessionResult.ok?sessionResult.value:null,bootstrap=retained(bootstrapResult,previous.bootstrap),events=retained(eventsResult,previous.events);
      const sessionConfirmation=sessionResult.ok&&session?.authenticated?await callResult('session continuity',api.session):{ok:false,attemptedAt:new Date().toISOString(),error:'session_not_confirmed'};
      const mutationReady=Boolean(sessionResult.ok&&sessionConfirmation.ok&&sessionContinuityMatches(session,sessionConfirmation.value));
      const confirmedSession=session?{...session,mutationReady}:session;
      const dependencies={...previousDependencies,health:dependency(healthResult,previousDependencies.health,health),session:dependency(sessionResult,previousDependencies.session,confirmedSession),bootstrap:dependency(bootstrapResult,previousDependencies.bootstrap,bootstrap),events:dependency(eventsResult,previousDependencies.events,events)};
      Object.assign(state.runtime,{health,session:confirmedSession,bootstrap,events,dependencies,loadedAt:new Date().toISOString()});
      const requiredCurrent=healthResult.ok&&health?.ok&&eventsResult.ok&&bootstrapResult.ok;
      state.runtime.status=requiredCurrent?'ready':(health||events||bootstrap)?'degraded':'error';
      state.runtime.error=requiredCurrent?null:'Some requested information could not be loaded. Retained values are marked STALE and must not be read as current.';
      const eventsPt=portugalEvents(state);if(!eventsPt.some(event=>String(event.id)===String(state.selectedEventId)))state.selectedEventId=eventsPt[0]?.id??null;
      persist();render();
      if(!requiredCurrent)return{state:state.runtime.status,requiredSuccess:false,dependencies};
      const [commandResult,territoryResult,replayResult,alertsResult,operationsStatusResult,fieldnetResult,benchmarkResult,preventionConsensusResult,intelligenceInboxResult]=await Promise.all([requests.command,requests.territory,requests.replay,requests.alerts,requests.operationsStatus,requests.fieldnet,requests.benchmark,requests.preventionConsensus,requests.intelligenceInbox]);
      const command=retained(commandResult,previous.command),territory=retained(territoryResult,previous.territory),replay=retained(replayResult,previous.replay),alerts=retained(alertsResult,previous.alerts),operationsStatus=retained(operationsStatusResult,previous.operationsStatus),fieldnet=retained(fieldnetResult,previous.fieldnet),benchmark=retained(benchmarkResult,previous.benchmark),preventionConsensus=retained(preventionConsensusResult,previous.preventionConsensus),intelligenceInbox=retained(intelligenceInboxResult,previous.intelligenceInbox);
      Object.assign(dependencies,{command:dependency(commandResult,previousDependencies.command,command),territory:dependency(territoryResult,previousDependencies.territory,territory),replay:dependency(replayResult,previousDependencies.replay,replay),alerts:dependency(alertsResult,previousDependencies.alerts,alerts),operations:dependency(operationsStatusResult,previousDependencies.operations,operationsStatus),fieldnet:dependency(fieldnetResult,previousDependencies.fieldnet,fieldnet),benchmark:dependency(benchmarkResult,previousDependencies.benchmark,benchmark),prevention:dependency(preventionConsensusResult,previousDependencies.prevention,preventionConsensus),intelligence:dependency(intelligenceInboxResult,previousDependencies.intelligence,intelligenceInbox)});
      const operationsReady=operationsStatusResult.ok&&operationsStatus?.overallStatus==='READY'&&['ready','current'].includes(String(operationsStatus?.database?.state??operationsStatus?.persistence?.state).toLowerCase());
      const unavailable=(error)=>Promise.resolve({ok:false,attemptedAt:new Date().toISOString(),error});
      const [territoriesResult,assetsResult,rosterResult,needsResult,requestsResult]=await Promise.all([
        operationsReady?callResult('operations territories',api.operationsTerritories):unavailable('operations_not_ready'),operationsReady?callResult('operations assets',api.operationsAssets):unavailable('operations_not_ready'),operationsReady&&mutationReady?callResult('operations roster',api.operationsRoster):unavailable('operator_session_not_ready'),mutationReady?callResult('evidence needs',api.evidenceNeeds):unavailable('operator_session_not_ready'),mutationReady?callResult('evidence requests',api.evidenceRequests):unavailable('operator_session_not_ready')
      ]);
      const operationsTerritories=retained(territoriesResult,previous.operationsTerritories),operationsAssets=retained(assetsResult,previous.operationsAssets),operationsRoster=retained(rosterResult,previous.operationsRoster),evidenceNeeds=retained(needsResult,previous.evidenceNeeds),evidenceRequests=retained(requestsResult,previous.evidenceRequests);
      Object.assign(dependencies,{operationsTerritories:dependency(territoriesResult,previousDependencies.operationsTerritories,operationsTerritories),operationsAssets:dependency(assetsResult,previousDependencies.operationsAssets,operationsAssets),operationsRoster:dependency(rosterResult,previousDependencies.operationsRoster,operationsRoster),evidenceNeeds:dependency(needsResult,previousDependencies.evidenceNeeds,evidenceNeeds),evidenceRequests:dependency(requestsResult,previousDependencies.evidenceRequests,evidenceRequests)});
      const importedIds=[...new Set((state.pilotImportReceipts??[]).map(receipt=>receipt.incidentId).filter(Boolean))].slice(0,10),importedEntries=mutationReady?await Promise.all(importedIds.map(async incidentId=>[incidentId,await safeCall(`manual import ${incidentId}`,()=>api.commandIncident(incidentId))])):[],commandIncidents=Object.fromEntries(importedEntries.filter(([,incident])=>incident));
      Object.assign(state.runtime,{command,territory,replay,alerts,operationsStatus,operationsMetrics:operationsStatus?.metrics??previous.operationsMetrics??null,operationsTerritories,operationsAssets,operationsRoster,evidenceNeeds,evidenceRequests,commandIncidents,fieldnet,benchmark,preventionConsensus,intelligenceInbox,dependencies,loadedAt:new Date().toISOString()});
      const findings=preventionFindings(state);if(!findings.some(finding=>String(finding.findingId??finding.id)===String(state.selectedFindingId)))state.selectedFindingId=findings[0]?.findingId??findings[0]?.id??null;
      const replayCase=selectedReplayCase(state);if(!state.selectedReplayCaseId&&replayCase)state.selectedReplayCaseId=replayCase.id;
      persist();render();
      await Promise.all([state.selectedEventId?loadEvent(state.selectedEventId,{rerender:false,force:true}):null,state.selectedFindingId?loadFinding(state.selectedFindingId,{rerender:false}):null,state.selectedReplayCaseId?loadReplayCase(state.selectedReplayCaseId,{rerender:false}):null]);
      onRuntimeLoaded(previous,state.runtime);persist();render();
      return{state:state.runtime.status,requiredSuccess:true,dependencies};
    })().finally(()=>{refreshPromise=null;});
    return refreshPromise;
  };
}
