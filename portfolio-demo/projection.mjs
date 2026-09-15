// Explicit synthetic projection into the existing operator-console view models.
const section = value => ({state:'READY', authority:'PORTFOLIO_SYNTHETIC', value});
export function consoleState(snapshot) {
  const id='portfolio-evora', at=snapshot.facts.at;
  const operationalTruth={classification:'DETECTION_CANDIDATE',lastObservedAt:at,
    currentness:{state:'CURRENT',label:'Synthetic scenario',reason:'Controlled scenario; no real incident is asserted.',inActiveQueue:true,countsAsCurrent:true},
    axes:{verification:{state:'NOT_VERIFIED'},freshness:{state:snapshot.state.aged?'STALE':'READY'}}};
  const incident={id,incidentId:id,name:'Évora · controlled scenario',label:'Évora · controlled scenario',locationName:'Évora, Portugal',coordinate:[-7.909,38.571],type:'Synthetic wildfire scenario',observedAt:at,operationalTruth};
  const data={canonicalIncidents:section([incident]),canonicalIncident:section(incident),operationalTruth:section(operationalTruth),
    commandPresentation:section({priorityIncidents:[{incidentId:id}],metrics:{},activity:[]}),
    authorizedScope:section({region:'Portugal · synthetic scenario'})};
  const entry={value:{generatedAt:at,data},dependency:{state:'READY'}};
  return {selectedIncidentId:id,incidentStateFilter:'ALL',runtime:{status:'ready',resourceState:'READY',session:{authenticated:false,actor:{name:'Portfolio visitor',role:'Local scenario',region:'Synthetic data'}},canonical:{globals:{commandOverview:entry,incidents:entry,globalAwareness:entry,reports:entry},incidents:{[id]:{detail:entry,location:entry,intelligence:entry,operations:entry}},dependencies:{}}}};
}
