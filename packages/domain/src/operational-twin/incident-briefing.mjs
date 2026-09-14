import { timestamp, rows } from './physical-metric.mjs';

/** Structured observations and calculations only. This boundary cannot issue operational advice. */
export function incidentBriefing({physical,sources,spatial=null,asOf}) {
  const facts=[...rows(physical.weather?.metrics),...rows(physical.thermal?.metrics),physical.status,physical.fireDanger]
    .filter(m=>m&&m.value!==null&&m.sourceName&&m.validity==='VALID_VALUE');
  const changes=facts.filter(m=>m.trend?.material&&m.freshnessState==='CURRENT').map(m=>({
    id:m.id,label:m.label,source:m.sourceName,sourceId:m.sourceId,unit:m.unit,observedAt:m.observedAt,receivedAt:m.receivedAt,
    previous:m.trend.previousValue,current:m.value,delta:m.trend.delta,from:m.trend.from,to:m.trend.to,
    minutes:m.trend.minutes,direction:m.trend.direction,policy:m.trend.policy,limitation:m.trend.limitation,
    provenanceRef:m.provenanceRef,samples:m.trend.samples.slice(-2)
  }));
  const roads=rows(physical.places?.roads).filter(r=>r.source&&r.statusEvidenceId&&timestamp(r.observedAt)!==null&&timestamp(r.observedAt)<=timestamp(asOf));
  const currentRoads=roads.filter(r=>timestamp(asOf)-timestamp(r.observedAt)<=3600000&&!r.cancelled&&!r.superseded&&(!r.effective||timestamp(r.effective)<=timestamp(asOf))&&(!r.expires||timestamp(r.expires)>timestamp(asOf))),roadRestrictions=currentRoads.filter(r=>['CLOSED','RESTRICTED'].includes(r.state));
  const coverage=[
    {id:'perimeter',label:'Fire size and spread',state:spatial?.perimeter?.areaHa!==null&&spatial?.perimeter?.areaHa!==undefined?'AVAILABLE':'UNAVAILABLE',reason:spatial?.perimeter?.reason??'No attributable admitted perimeter is returned. Thermal points are not a perimeter.'},
    {id:'road-status',label:'Road closures',state:currentRoads.length?'PARTIAL':'UNAVAILABLE',reason:currentRoads.length?'Only returned dated status records; no claim of complete road coverage.':roads.length?'Only old road-condition reports are retained. Current access is unknown.':'No current attributable road-condition feed is connected. Mapped roads remain geography.'},
    {id:'movement',label:'Movement toward places',state:spatial?.perimeter?.newAreaHa!==null&&spatial?.perimeter?.newAreaHa!==undefined?'AVAILABLE':'UNAVAILABLE',reason:'Requires comparable dated perimeter revisions. Wind bearing does not establish fire movement.'},
    {id:'capacity',label:'Live facility capacity',state:'UNAVAILABLE',reason:'Mapped facility presence does not establish crews, beds, water availability or readiness. Inspect qualified operational reports in Response & Access.'}
  ];
  const knownSources=rows(sources?.sources),degraded=knownSources.filter(s=>s.configuration==='configured'&&s.status!=='healthy');
  return {schemaVersion:'vigia.incident-briefing.v1',incidentId:physical.incidentId,asOf,
    facts,changes,comparisonState:changes.length?'MATERIAL_CHANGES':facts.some(m=>m.trend)?'NO_MATERIAL_CHANGE_IN_COMPARABLE_READINGS':'NO_EARLIER_COMPARABLE_OBSERVATION',
    comparisonMeaning:'Comparable source observations only. No material change does not establish stable fire conditions.',
    weather:physical.weather,fire:{perimeter:spatial?.perimeter??null,thermal:physical.thermal},
    exposure:spatial??{state:'UNAVAILABLE',relationships:[],reason:'Geospatial context could not be read.'},
    access:{state:currentRoads.length?'PARTIAL':'UNAVAILABLE',knownRestrictions:roadRestrictions,retainedReports:roads,confirmedClosureCount:currentRoads.length?roadRestrictions.filter(r=>r.state==='CLOSED').length:null,coverageMinutes:60},
    sources,coverage,conflicts:facts.flatMap(m=>rows(m.conflicts)),
    conflictingMetrics:[...rows(physical.weather?.metrics),...rows(physical.air?.metrics)].filter(m=>m.missingReason==='CONFLICTING_VALUES'),
    freshness:{degradedSources:degraded.map(s=>s.id),oldestObservationAt:facts.map(m=>m.observedAt).filter(Boolean).sort()[0]??null},
    boundary:'Deterministic situational understanding. Proximity is not exposure, a prediction, road clearance or an instruction.'};
}
