function priorityBand(event) {
  if(['satellite-only','sensor-only'].includes(event.evidenceState)&&event.candidateAssessment?.grade==='high')return'critical';
  if(event.behaviorState==='growing')return'critical';
  if(event.reportState?.freshness==='current'&&event.physicalState?.freshness!=='current')return'high';
  if(event.evidenceState==='association-uncertain')return'high';
  return'elevated';
}
export function acquisitionServiceLevel(priority) {
  const [acknowledgementMinutes,observationMinutes]=priority==='critical'?[5,15]:priority==='high'?[10,30]:[20,60];
  return{id:`evidence-acquisition-${priority}-v1`,acknowledgementMinutes,observationMinutes};
}
export function eventActionPlan(event) {
  const requirements=[];
  if(event.evidenceState==='reported') requirements.push('Independent physical observation');
  if(event.evidenceState==='association-uncertain') requirements.push('Resolve report ↔ physical-observation association');
  if(event.evidenceState==='satellite-only') requirements.push('Independent confirmation of thermal candidate');
  if(event.evidenceState==='sensor-only') requirements.push('Independent confirmation of external sensor candidate');
  if(event.physicalState?.freshness==='stale'||event.physicalState?.freshness==='unobserved') requirements.push('Fresh physical observation');
  const priority=priorityBand(event),serviceLevel=acquisitionServiceLevel(priority);
  return { priority, requirements, observationOptions:structuredClone(event.observationPlan?.options??[]), ranking:event.observationPlan?.ranking??null, suggestedAction:requirements[0]??'Continue monitoring current physical observations', ownerRequired:Boolean(event.actionNeed?.needsRouting), serviceLevel };
}
