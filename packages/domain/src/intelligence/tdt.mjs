const parse=(value)=>Number.isFinite(Date.parse(value??''))?new Date(value).toISOString():null;
const earliest=(values)=>values.map(parse).filter(Boolean).sort()[0]??null;
function physical(item){return['thermal','camera','ground_sensor','field_sensor','drone','field','satellite','imagery'].includes(String(item.type??item.observationType??'').toLowerCase());}

export function deriveTimeToDefensibleTruth({incident={},operatorDecisions=[],decisionDelta=[],generatedAt=new Date().toISOString()}={}){
  const evidence=incident.observations??[],physicalRows=evidence.filter(physical).sort((a,b)=>Date.parse(a.visibleAt??a.receivedAt??a.at??a.observedAt)-Date.parse(b.visibleAt??b.receivedAt??b.at??b.observedAt)),families=new Set();let corroboration=null;
  for(const item of physicalRows){if(item.sourceFamily||item.independenceGroup)families.add(String(item.independenceGroup??item.sourceFamily));if(families.size>=2){corroboration=parse(item.visibleAt??item.receivedAt??item.at??item.observedAt);break;}}
  const firstSignal=earliest(evidence.map((item)=>item.visibleAt??item.receivedAt??item.at??item.observedAt)),firstPhysical=earliest(physicalRows.map((item)=>item.visibleAt??item.receivedAt??item.at??item.observedAt)),timing=incident.prospectiveDetectionTiming??{};
  const definitions=[
    ['FIRST_CREDIBLE_SIGNAL',firstSignal,evidence.find((item)=>parse(item.visibleAt??item.receivedAt??item.at??item.observedAt)===firstSignal)?.id],
    ['FIRST_PHYSICAL_OBSERVATION',firstPhysical,physicalRows.find((item)=>parse(item.visibleAt??item.receivedAt??item.at??item.observedAt)===firstPhysical)?.id],
    ['FIRST_INDEPENDENT_PHYSICAL_CORROBORATION',corroboration,physicalRows.find((item)=>parse(item.visibleAt??item.receivedAt??item.at??item.observedAt)===corroboration)?.id],
    ['FIRST_OPERATOR_VISIBLE_INTELLIGENCE_STATE',parse(timing.uiFirstSeenAt??timing.uiAvailableAt),timing.traceId??null],
    ['FIRST_OPERATOR_ACKNOWLEDGEMENT',earliest(operatorDecisions.filter((item)=>String(item.decisionType).includes('ACKNOWLEDG')).map((item)=>item.createdAt)),operatorDecisions.find((item)=>String(item.decisionType).includes('ACKNOWLEDG'))?.decisionId],
    ['DECISION_STATE_TRANSITION',earliest(decisionDelta.filter((item)=>item.fromState&&item.toState&&item.fromState!==item.toState).map((item)=>item.at)),decisionDelta.find((item)=>item.fromState&&item.toState&&item.fromState!==item.toState)?.id],
    ['EVIDENCE_GAP_CLOSURE',earliest(decisionDelta.filter((item)=>item.type==='EVIDENCE_NEED_RESOLVED').map((item)=>item.at)),decisionDelta.find((item)=>item.type==='EVIDENCE_NEED_RESOLVED')?.id]
  ];
  let previous=null;const stages=definitions.map(([stage,timestamp,sourceEvent])=>{const duration=timestamp&&previous?Math.max(0,Date.parse(timestamp)-Date.parse(previous)):null;if(timestamp)previous=timestamp;return Object.freeze({stage,timestamp,sourceEvent:sourceEvent??null,measurementStatus:timestamp?'MEASURED':'NOT_REACHED',durationFromPreviousMs:duration});});
  return Object.freeze({schemaVersion:'vigia.time-to-defensible-truth.v1',incidentId:incident.id??null,generatedAt,stages:Object.freeze(stages),benchmarkState:'NOT_PUBLISHED_INSUFFICIENT_MEASURED_INCIDENTS',qualification:'Durations are attributable lifecycle intervals. Missing stages and durations remain null.'});
}
