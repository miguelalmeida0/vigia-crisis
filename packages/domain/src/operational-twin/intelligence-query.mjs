import { traceDependencies } from './dependency-graph.mjs';
import { rows, unique } from './decision-work.mjs';

export const SUPPORTED_INTELLIGENCE_QUERIES=Object.freeze([
  'Why is this incident unconfirmed?','What changed in the last 30 minutes?','What is blocking verification?',
  'What depends on [source or provider]?','Which incidents gained independent evidence?',
  'What should I investigate next?','What would resolve this incident?','What becomes stale next?','Which tasks are blocked?'
]);
export function parseIntelligenceQuery(input) {
  const text=String(input??'').trim().replace(/[?.!]$/,'').toLowerCase();
  if(text.length>240)return {intent:'UNKNOWN'};
  if(text==='why is this incident unconfirmed')return {intent:'WHY'};
  const changed=text.match(/^what changed in the last (\d{1,3}) minutes$/);if(changed&&Number(changed[1])<=360)return {intent:'CHANGES',minutes:Number(changed[1])};
  if(text==='what is blocking verification')return {intent:'BLOCKERS'};
  const depends=text.match(/^what depends on (.+)$/);if(depends)return {intent:'DEPENDENTS',label:depends[1]};
  if(text==='which incidents gained independent evidence')return {intent:'CORROBORATION'};
  if(text==='what should i investigate next')return {intent:'NEXT'};
  if(text==='what would resolve this incident')return {intent:'RESOLUTION'};
  if(text==='what becomes stale next')return {intent:'EXPIRY'};
  if(text==='which tasks are blocked')return {intent:'BLOCKED_TASKS'};
  return {intent:'UNKNOWN'};
}
export function answerIntelligenceQuery(projection,input) {
  const query=typeof input==='string'?parseIntelligenceQuery(input):input??{intent:'UNKNOWN'};
  let results=[],answer=null;
  switch(query.intent){
    case 'WHY': results=projection.assessments.map(a=>({summary:a.assessment?.summary,reasons:a.assessment?.reasons,evidenceIds:a.assessment?.evidenceIds,incidentId:a.incidentId}));break;
    case 'CHANGES': if(Number.isInteger(query.minutes)&&query.minutes>=0&&query.minutes<=360)results=projection.watches.filter(c=>Date.parse(c.at)<=Date.parse(projection.asOf)&&Date.parse(c.at)>=Date.parse(projection.asOf)-query.minutes*60000);break;
    case 'BLOCKERS': results=projection.assessments.flatMap(a=>a.gaps.map(g=>({summary:g.missingEvidenceType,reasons:g.resolutionCriteria,evidenceIds:g.evidenceIds})));break;
    case 'DEPENDENTS': {const matches=projection.graph.nodes.filter(n=>['SOURCE','PROVIDER'].includes(n.type)&&[n.label,n.recordId,n.id].some(v=>String(v??'').toLowerCase()===String(query.label??'').toLowerCase()));const identities=new Set(matches.map(n=>n.recordId));if(identities.size===1){const target=matches.find(n=>n.type==='SOURCE')??matches[0];results=traceDependencies(projection.graph,target.id,{downstream:true}).map(d=>({...d,summary:projection.graph.nodes.find(n=>n.id===d.entityId)?.label??d.entityId}));answer=`${results.length} recorded downstream dependencies; not a claim that every dependent workflow is blocked.`;}break;}
    case 'CORROBORATION':results=projection.watches.filter(w=>w.type==='corroboration_changed'&&/MULTI_SOURCE/.test(w.summary));break;
    case 'NEXT':results=projection.assessments.flatMap(a=>a.collectionRecommendations).filter(r=>r.allowed);break;
    case 'RESOLUTION':results=projection.assessments.map(a=>a.resolutionPath);break;
    case 'EXPIRY':results=projection.temporal.conditions.filter(c=>c.condition==='EVIDENCE_EXPIRES'&&c.remainingMs>0);break;
    case 'BLOCKED_TASKS':results=projection.readiness.filter(r=>r.type==='TASK'&&r.state!=='READY');break;
    default:break;
  }
  return {intent:query.intent,answer:answer??(results.length?`${results.length} matching structured intelligence records.`:"I don't have enough verified information to answer that."),
    reasons:results.length?['Derived only from the authorized canonical projection at the stated time.']:['The supported intent has no matching verified information, or the request is unsupported/ambiguous.'],
    results:results.slice(0,20),total:results.length,evidenceIds:unique(results.flatMap(r=>rows(r.evidenceIds))).slice(0,40),asOf:projection.asOf,
    boundary:'Read-only deterministic query. No action or authority is inferred.'};
}
