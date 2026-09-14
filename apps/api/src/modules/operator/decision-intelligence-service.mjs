import { assertCan,can,incidentInScope } from '../../../../../packages/domain/src/authorization.mjs';
import { projectDecisionSuperiority } from '../../../../../packages/domain/src/operational-twin/decision-superiority.mjs';
import { answerIntelligenceQuery } from '../../../../../packages/domain/src/operational-twin/intelligence-query.mjs';
import { operationalCounterfactual } from '../../../../../packages/domain/src/operational-twin/operational-counterfactual.mjs';
import { decisionHistory } from '../../../../../packages/domain/src/operational-twin/decision-context.mjs';
import { projectPhysicalWorld } from '../../../../../packages/domain/src/operational-twin/physical-world.mjs';
import { parseOperatorQuestion, answerOperatorQuestion, getNationalSituation } from '../../../../../packages/domain/src/operational-twin/operator-questions.mjs';
import { physicalWorldContext } from './operator-intelligence-projection.mjs';

export async function decisionIntelligenceQuery({actor,services,clock,currentTwin},{question,incidentId=null,asOf=null,assumption=null,history=false}={}){
  assertCan(actor,'read:incident_command');
  if(incidentId&&services.situationAsk&&!history&&!assumption){const answer=await services.situationAsk.answer(actor,{incidentId,question,asOf});if(answer.state!=='ABSTAINED')return answer;}
  const intent=parseOperatorQuestion(question);
  if(!asOf&&intent?.type==='AS_OF'&&intent.time){
    const [hour,minute]=intent.time.split(':').map(Number);
    if(hour>23||minute>59)throw Object.assign(new Error('historical_time_invalid_use_UTC_date_and_time'),{statusCode:400});
    asOf=clock().toISOString().slice(0,10)+'T'+String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00.000Z';
  }
  if(incidentId&&!incidentInScope(actor,incidentId))throw Object.assign(new Error('incident_scope_forbidden'),{statusCode:403});
  if(asOf&&(!Number.isFinite(Date.parse(asOf))||Date.parse(asOf)>clock().getTime()))throw Object.assign(new Error('historical_projection_time_invalid'),{statusCode:400});
  if(asOf)assertCan(actor,'read:replay');
  if(history){
    const historyAt=asOf??clock().toISOString();
    let native=[],nativeState=incidentId?'NOT_CONFIGURED':'SELECT_INCIDENT';
    if(incidentId&&services.intelligenceService?.decisionContexts){
      if(!can(actor,'read:evidence'))nativeState='PERMISSION_REQUIRED';
      else try{native=await services.intelligenceService.decisionContexts(actor,incidentId,{asOf:historyAt});nativeState='READY';}
      catch(error){nativeState=error.statusCode===503?'UNAVAILABLE':'FAILED';}
    }
    return {asOf:historyAt,decisions:[...decisionHistory(services.repository?.snapshot?.().humanAttentionActions,actor,{asOf:historyAt,incidentId}),...native].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,50),nativeHistoryState:nativeState,
      boundary:'Captured attention context plus exact immutable intelligence snapshot bindings. Missing history is never reconstructed from current work.'};
  }
  const twin=asOf?await services.operationalIntelligenceService.getTwinAsOf(asOf):await currentTwin();
  if(assumption)return operationalCounterfactual({twin,actor,incidentId,assumption});
  if(intent){
    // Historical answers use reconstructed event knowledge only. Current weather caches never enter replay.
    const physical=projectPhysicalWorld({twin,actor,incidentId,world:asOf?null:await physicalWorldContext(services),asOf:asOf??clock().toISOString()});
    const context=incidentId?physical.incidents[0]:null;
    if(!context){
      if(!incidentId&&intent.type==='SITUATION'&&actor.incidentScopes?.includes('*')){const a=getNationalSituation(physical);return {...a,answer:a.primaryAnswer,intent:'SITUATION',state:'ANSWERED'};}
      return {state:'SELECT_INCIDENT',intent:intent.type,answer:'Select an incident with information in your permitted scope.',asOf:asOf??clock().toISOString(),results:[],evidenceIds:[]};
    }
    const result=answerOperatorQuestion(context,intent);
    return {...result,historicalWorkBoundary:asOf?'Historical event knowledge only; present-day source caches and mutable task ledgers are excluded.':null,limitations:[...(result?.limitations??[]),...(asOf?['Answer reconstructed as of '+asOf+'; observations received later are excluded by the historical event query.']:[])]};
  }
  return {...answerIntelligenceQuery(projectDecisionSuperiority({twin,actor,incidentId}),question),historicalWorkBoundary:asOf?'Historical native event projection only; current mutable task/decision ledgers are not joined.':null};
}
