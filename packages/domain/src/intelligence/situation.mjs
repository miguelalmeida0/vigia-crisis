const PHYSICAL_TYPES = new Set(['thermal','camera','ground_sensor','field_sensor','drone','field','satellite','imagery']);
const REPORT_TYPES = new Set(['report','report_update','public_report','field_report']);

export function evidenceKind(item = {}) {
  const kind=String(item.evidenceKind??item.sourceIdentity?.kind??'').toUpperCase(),type=String(item.type??item.observationType??'').toLowerCase();
  if (['SENSOR','SATELLITE','IMAGERY','PHYSICAL_OBSERVATION'].includes(kind)||PHYSICAL_TYPES.has(type)) return 'PHYSICAL_OBSERVATION';
  if (['REPORT','PUBLIC_REPORT','FIELD_REPORT'].includes(kind)||REPORT_TYPES.has(type)) return 'REPORT';
  return 'OTHER';
}

const instant=(item)=>item.visibleAt??item.receivedAt??item.at??item.observedAt??null;
const idOf=(item,index)=>String(item.id??item.observationId??`evidence:${index}`);
function current(item,incident,asOf,staleAfterMs){
  const explicit=String(item.freshness??'').toLowerCase();if(explicit)return explicit==='current';
  const incidentFreshness=String((evidenceKind(item)==='PHYSICAL_OBSERVATION'?incident.physicalState?.freshness:incident.reportState?.freshness??incident.reportState?.sourceActivity)??'').toLowerCase();
  if(incidentFreshness)return incidentFreshness==='current';
  const at=Date.parse(instant(item)??'');return Number.isFinite(at)&&asOf-at>=0&&asOf-at<=staleAfterMs;
}
function contradictions(incident){return [...(incident.contradictions??[]),...(incident.evidenceContradictions??[]),...(incident.evidenceFusion?.contradictions??[]),...(incident.fireEvidenceState?.contradictions??[])];}
function statement(state){return({
  NO_CURRENT_DEFENSIBLE_INCIDENT:'No current defensible incident is supported.',REPORT_ONLY_INCIDENT:'A current report exists without current physical support.',
  SINGLE_FAMILY_PHYSICAL_SIGNAL:'One current physical source family supports a signal; independent corroboration is missing.',MULTI_FAMILY_PHYSICAL_SUPPORT:'Multiple governed physical source families support the incident.',
  PHYSICAL_REPORT_CONFLICT:'Attributable evidence is in conflict and requires operator review.',STALE_PHYSICAL_EVIDENCE:'Physical evidence exists but is too stale to support a current claim.',
  INSUFFICIENT_EVIDENCE:'Available evidence is insufficient for a stronger incident state.',HISTORICAL_REHEARSAL_CASE:'This is a governed historical or rehearsal intelligence state.'
})[state];}

export function deriveSituation({ incident = {}, mode = 'LIVE', asOf = new Date().toISOString(), staleAfterMs = 6*60*60*1000 } = {}) {
  const at=Date.parse(asOf),evidence=incident.observations??incident.evidence??[],physical=evidence.filter((item)=>evidenceKind(item)==='PHYSICAL_OBSERVATION'),reports=evidence.filter((item)=>evidenceKind(item)==='REPORT');
  const currentPhysical=physical.filter((item)=>current(item,incident,at,staleAfterMs)),currentReports=reports.filter((item)=>current(item,incident,at,staleAfterMs));
  const independentFamilies=[...new Set(currentPhysical.map((item)=>item.independenceGroup??item.sourceFamily).filter(Boolean).map(String))].sort();
  const conflict=contradictions(incident),underlying=currentPhysical.length&&conflict.length?'PHYSICAL_REPORT_CONFLICT':independentFamilies.length>=2?'MULTI_FAMILY_PHYSICAL_SUPPORT':independentFamilies.length===1?'SINGLE_FAMILY_PHYSICAL_SIGNAL':currentReports.length?'REPORT_ONLY_INCIDENT':physical.length?'STALE_PHYSICAL_EVIDENCE':evidence.length?'INSUFFICIENT_EVIDENCE':'NO_CURRENT_DEFENSIBLE_INCIDENT';
  const historical=['HISTORICAL','HISTORICAL_REPLAY','REHEARSAL'].some((value)=>String(mode).toUpperCase().includes(value)),state=historical?'HISTORICAL_REHEARSAL_CASE':underlying;
  const supporting=(currentPhysical.length?currentPhysical:currentReports).map(idOf),excluded=physical.filter((item)=>!currentPhysical.includes(item)).map((item,index)=>({id:idOf(item,index),reason:'STALE'}));
  const missing=underlying==='SINGLE_FAMILY_PHYSICAL_SIGNAL'?['INDEPENDENT_PHYSICAL_CORROBORATION']:underlying==='REPORT_ONLY_INCIDENT'?['CURRENT_PHYSICAL_OBSERVATION']:underlying==='PHYSICAL_REPORT_CONFLICT'?['CONFLICT_RESOLUTION_EVIDENCE']:[];
  const rulesApplied=[independentFamilies.length>=2?'SIT-001':independentFamilies.length===1?'SIT-002':currentReports.length?'SIT-003':physical.length?'SIT-005':'SIT-003',...(conflict.length?['SIT-004']:[])];
  return Object.freeze({state,underlyingState:underlying,operatorStatement:statement(state),supportingEvidenceIds:supporting,contradictingEvidenceIds:conflict.map((item,index)=>idOf(item,index)),missingEvidence:missing,freshness:currentPhysical.length||currentReports.length?'CURRENT':physical.length||reports.length?'STALE':'UNAVAILABLE',applicabilityBoundary:historical?'Governed historical/rehearsal clock; not a current live claim.':'Current incident evidence visible at the governed clock.',why:{rulesApplied,independentPhysicalFamilies:independentFamilies,excludedEvidence:excluded}});
}
