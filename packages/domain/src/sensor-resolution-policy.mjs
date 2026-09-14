const POLICIES=Object.freeze({
  fuel_continuity:{label:'Landscape fuel continuity',screeningMaxM:20,candidateMaxM:3,nextObservation:['sub-3 m optical','drone','field inspection']},
  large_combustible_accumulation:{label:'Large combustible accumulation',screeningMaxM:10,candidateMaxM:3,nextObservation:['sub-3 m optical','drone','field inspection']},
  small_illegal_dumping:{label:'Small illegal dumping / object-scale hazard',screeningMaxM:.5,candidateMaxM:.3,nextObservation:['sub-0.5 m aerial imagery','drone','field inspection']},
  emergency_access_obstruction:{label:'Emergency-access obstruction',screeningMaxM:1,candidateMaxM:.5,nextObservation:['sub-1 m optical','drone','field inspection']},
  firebreak_condition:{label:'Firebreak condition',screeningMaxM:10,candidateMaxM:3,nextObservation:['sub-3 m optical','drone','field inspection']}
});
export function resolutionPolicyFor(decisionType){const policy=POLICIES[decisionType];return policy?{decisionType,...policy}:null;}
export function assessObservationResolution({decisionType,resolutionMeters,sensor='unknown'}={}){
  const policy=resolutionPolicyFor(decisionType),resolution=Number(resolutionMeters);
  if(!policy)return{state:'unsupported_question',decisionType,allowedUse:'abstain',reason:'No resolution policy exists for this decision type.'};
  if(!Number.isFinite(resolution)||resolution<=0)return{...policy,state:'resolution_unknown',sensor,resolutionMeters:null,allowedUse:'abstain',reason:'Source resolution is unknown; the system cannot make an object-scale claim.'};
  if(resolution<=policy.candidateMaxM)return{...policy,state:'candidate_resolution_sufficient',sensor,resolutionMeters:resolution,allowedUse:'candidate_detection',reason:`${resolution} m data meets the spatial-resolution gate for candidate detection. Human or independently validated evidence is still required for physical confirmation.`};
  if(resolution<=policy.screeningMaxM)return{...policy,state:'screening_only',sensor,resolutionMeters:resolution,allowedUse:'landscape_screening',reason:`${resolution} m data may screen landscape-scale change but cannot support the requested object-level determination.`,escalateTo:policy.nextObservation};
  return{...policy,state:'insufficient_resolution',sensor,resolutionMeters:resolution,allowedUse:'abstain',reason:`${resolution} m data is too coarse for ${policy.label.toLowerCase()}.`,escalateTo:policy.nextObservation};
}
