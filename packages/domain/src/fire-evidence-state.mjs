const PHYSICAL_SOURCES=['viirs','sentinel3','mtg','camera','groundSensor','drone','field'];

function latestReport(event){return(event.observations??[]).filter((item)=>['report','report_update'].includes(item.type)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1)??null;}
function coverageGap(name,value={}){return{name,state:value.state??'unknown',coverageState:value.coverageState??'unknown',temporalState:value.temporalState??'unknown',reason:value.note??'Coverage is not established.'};}

export function buildFireEvidenceState({event={},fusion={},coverage={},observationPlan={}}={}){
  const report=latestReport(event),contradictions=(fusion.ambiguities??[]).map((item)=>structuredClone(item));
  const unresolvedAssociations=event.ambiguousAssociations??[];
  const coverageGaps=PHYSICAL_SOURCES.map((name)=>coverageGap(name,coverage[name])).filter((item)=>!['associated_observation','observed_with_detection'].includes(item.coverageState));
  const physicalEvidence=(fusion.witnesses??[]).map((item)=>({dependencyGroup:item.dependencyGroup,sourceFamily:item.sourceFamily??null,measurementType:item.measurementType??null,source:item.source,type:item.type,platform:item.platform,instrument:item.instrument,latestAt:item.latestAt,observationCount:item.observationCount,polarity:item.polarity}));
  const physicalSourceFamilies=[...new Set(physicalEvidence.map((item)=>item.sourceFamily).filter(Boolean))];
  const unresolvedObservations=[...new Set([...contradictions.flatMap((item)=>item.observationIds??[]),...unresolvedAssociations.map((item)=>item.observationId).filter(Boolean)])];
  const conflict=contradictions.some((item)=>item.kind==='conflicting_physical_observations');
  const state=conflict?'EVIDENCE_CONFLICT':physicalEvidence.length?'PHYSICAL_EVIDENCE_PRESENT':report?'REPORT_ONLY':'EMPTY';
  const dependencyGroups=[...new Set([...(fusion.witnesses??[])].map((item)=>item.dependencyGroup))];
  const nextObservationOpportunity=observationPlan.recommended?{state:'COMMITTED_OR_AVAILABLE',id:observationPlan.recommended.id,label:observationPlan.recommended.label,availability:observationPlan.recommended.availability,scheduledAt:observationPlan.recommended.scheduledAt??null}:observationPlan.remote?.length?{state:'PASS_DEPENDENT_OR_BLOCKED',options:observationPlan.remote.map((item)=>({id:item.id,label:item.label,availability:item.availability,timingState:item.latency?.state??'UNMEASURED'}))}:{state:'MANUAL_OR_UNKNOWN'};
  return{
    state,physicalEvidence,reportEvidence:{present:Boolean(report),observationCount:fusion.reportObservationCount??0,latestAt:report?.at??null,source:report?.source??null},
    contradictions,unresolvedObservations,dependencyGroups,independenceGroups:dependencyGroups,physicalFamilies:physicalSourceFamilies,physicalSourceFamilies,physicalSourceFamilyCount:physicalSourceFamilies.length,twoPhysicalSourceFamilies:physicalSourceFamilies.length>=2,
    physicalFreshness:{state:event.physicalState?.freshness??'unobserved',latestAt:event.physicalState?.lastAt??null,ageMinutes:event.physicalState?.ageMinutes??null},
    freshness:{physical:{state:event.physicalState?.freshness??'unobserved',latestAt:event.physicalState?.lastAt??null,ageMinutes:event.physicalState?.ageMinutes??null},report:{state:event.reportState?.sourceActivity??(report?'observed':'unobserved'),latestAt:event.reportState?.lastAt??report?.at??null}},
    coverageGaps,associationAmbiguity:{state:unresolvedAssociations.length?'AMBIGUOUS':'NONE',count:unresolvedAssociations.length,reasonCodes:[...new Set(unresolvedAssociations.flatMap((item)=>item.reasonCodes??[]))]},
    nextObservationOpportunity,nextObservation:nextObservationOpportunity,
    calibrated:false,existenceProbability:null,probabilityReason:'No universal confidence number is computed across evidence families.'
  };
}
