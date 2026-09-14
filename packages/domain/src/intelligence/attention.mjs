const ORDER=Object.freeze(['LIFE_SAFETY_RELEVANCE','ATTRIBUTABLE_CONTRADICTION','UNRESOLVED_DECISION_IMPACT','CURRENT_SINGLE_FAMILY_PHYSICAL_SIGNAL','INDEPENDENT_CORROBORATION_MISSING','SOURCE_DEGRADATION','EVIDENCE_REQUEST_ESCALATED','DEADLINE_OVERDUE','OPERATOR_OWNED','ACTIONABLE_REVIEW']);
const index=(value)=>{const at=ORDER.indexOf(value);return at<0?ORDER.length:at;};

export function deriveAttention({incident={},situation={},unknowns=[],sourceContext=[],evidenceRequests=[],asOf=new Date().toISOString()}={}){
  const factors=[];
  if(incident.lifeSafetyRelevance===true||incident.priority?.lifeSafety===true)factors.push('LIFE_SAFETY_RELEVANCE');
  if(situation.state==='PHYSICAL_REPORT_CONFLICT'||situation.underlyingState==='PHYSICAL_REPORT_CONFLICT')factors.push('ATTRIBUTABLE_CONTRADICTION');
  if(unknowns.some((item)=>item.classification==='DECISION_BLOCKING'))factors.push('UNRESOLVED_DECISION_IMPACT');
  if(situation.underlyingState==='SINGLE_FAMILY_PHYSICAL_SIGNAL')factors.push('CURRENT_SINGLE_FAMILY_PHYSICAL_SIGNAL','INDEPENDENT_CORROBORATION_MISSING');
  if(sourceContext.some((item)=>['DEGRADED','UNAVAILABLE','FAILED','STALE'].includes(String(item.providerHealth??item.state).toUpperCase())||item.performanceState==='HIGH_LATENCY'))factors.push('SOURCE_DEGRADATION');
  if(evidenceRequests.some((item)=>['ESCALATED','OVERDUE'].includes(String(item.state).toUpperCase())))factors.push('EVIDENCE_REQUEST_ESCALATED');
  if(evidenceRequests.some((item)=>Number.isFinite(Date.parse(item.dueAt??''))&&Date.parse(item.dueAt)<Date.parse(asOf)&&!['RESOLVED','CLOSED','CANCELLED'].includes(String(item.state).toUpperCase())))factors.push('DEADLINE_OVERDUE');
  if(unknowns.some((item)=>item.owner))factors.push('OPERATOR_OWNED');if(unknowns.some((item)=>item.currentAcquisitionWork?.length))factors.push('ACTIONABLE_REVIEW');
  const reasons=[...new Set(factors)].sort((a,b)=>index(a)-index(b)||a.localeCompare(b));
  const tier=reasons.some((item)=>['LIFE_SAFETY_RELEVANCE','ATTRIBUTABLE_CONTRADICTION'].includes(item))?'P1':reasons.some((item)=>['UNRESOLVED_DECISION_IMPACT','CURRENT_SINGLE_FAMILY_PHYSICAL_SIGNAL'].includes(item))?'P2':reasons.length?'P3':'P4';
  return Object.freeze({tier,reasons,blockedBy:unknowns.filter((item)=>item.classification==='DECISION_BLOCKING').map((item)=>item.id),actionability:reasons.length?'RECOMMENDED_OPERATOR_REVIEW':'MONITOR',orderingVector:reasons.map((factor)=>({factor,precedence:index(factor)})),score:null,probability:null});
}
