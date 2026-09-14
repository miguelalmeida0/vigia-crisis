import { canonicalIncidentId, incidentInScope } from '../authorization.mjs';
import { projectOperatorIntelligence } from './operator-intelligence.mjs';
import { rows, unique } from './decision-work.mjs';

export function captureDecisionContext({twin,actor,incidentId,action,reason=null,alternativesRejected=[]}) {
  const p=projectOperatorIntelligence({twin,actor,incidentId});
  return {schemaVersion:'vigia.decision-context.v1',asOf:twin.asOf,incidentId,decisionMaker:String(actor.id),chosenAction:action,
    stateAtDecision:p.incidents.map(i=>({incidentId:i.incidentId,assessment:i.assessment?.corroborationState??'UNKNOWN',priority:i.priority})),
    evidenceUsed:unique(p.incidents.flatMap(i=>rows(i.assessment?.evidenceIds))),recommendationsAvailable:p.incidents.flatMap(i=>i.recommendations.map(r=>({id:r.id,what:r.what,allowed:r.allowed,evidenceIds:r.evidenceIds}))),
    alternativesRejected:rows(alternativesRejected).map(String).slice(0,20),operatorNote:reason?String(reason).slice(0,2000):null,laterOutcome:null,
    boundary:'Immutable available-information snapshot; evidenceUsed means the system basis, not a claim that the human read each reference. No later outcome inferred.'};
}
export function decisionHistory(records,actor,{asOf,incidentId=null}={}) {
  return rows(records).filter(r=>r.decisionContext&&Date.parse(r.at)<=Date.parse(asOf)&&Date.parse(r.decisionContext.asOf)<=Date.parse(asOf)
    &&incidentInScope(actor,r.decisionContext.incidentId)&&(!incidentId||canonicalIncidentId(incidentId)===canonicalIncidentId(r.decisionContext.incidentId)))
    .map(r=>({decision:r.action,decisionMaker:r.actorId,timestamp:r.at,receiptId:r.receipt?.receiptId,...structuredClone(r.decisionContext)})).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,50);
}
