import { rows, timestamp } from './physical-metric.mjs';

/** @typedef {{primaryAnswer:string,supportingFacts:object[],asOf:string,limitations:string[],auditRef:string}} OperatorAnswer */
const metric=(c,id)=>[...rows(c.weather?.metrics),...rows(c.thermal?.metrics),...rows(c.air?.metrics),c.status].find(m=>m?.id===id);
const shown=m=>m?.value===null||m?.value===undefined?null:`${m.value}${m.unit?' '+m.unit:''}`;
const age=m=>m?.ageMinutes===null||m?.ageMinutes===undefined?'measurement time not supplied':`measured ${m.ageMinutes}m ago`;
const answer=(c,key,primaryAnswer,supportingFacts=[],limitations=[])=>({primaryAnswer,supportingFacts:supportingFacts.filter(Boolean),asOf:c.asOf,limitations:[...new Set(limitations.filter(Boolean))],auditRef:`operator-question:${c.incidentId??'national'}:${key}:${c.asOf}`});
const active=c=>rows(c.warnings?.warnings).filter(w=>w.state==='ACTIVE');

/** @returns {OperatorAnswer & {currentConditions:object}} */
export function getCurrentConditions(c) {
  const w=c.weather??{},m=metric(c,'wind'),s=w.station;
  const facts=['temperature','wind','gust','humidity','rain'].map(id=>metric(c,id));
  const values=facts.filter(m=>shown(m)).map(m=>`${m.label} ${shown(m)}${m.id==='wind'&&m.direction?' '+m.direction:''}`).join(' · ');
  const location=s?`${s.name}${s.distanceKm!==null?' · '+s.distanceKm+' km away':''}`:'No suitable station';
  return {...answer(c,'conditions',values?`${values}. ${location} · ${age(m)}. ${w.suitability?.state==='HISTORICAL_CONTEXT'?'Last known conditions; current weather is unknown.':'Regional station context; conditions at the incident may differ.'}`:'Current weather is unknown. No suitable dated station observation was returned.',facts,w.limitations??[]),currentConditions:w};
}
export function getNearbyFireActivity(c) {
  const t=c.thermal??{},last=metric(c,'thermalTime'),near=metric(c,'thermalDistance'),radius=c.thermalRadiusKm;
  const counts=Object.fromEntries([30,60,180].map(n=>[n,metric(c,'thermal'+n)?.value??null]));
  const primary=last?.value?`Latest ${t.latestThermalDetection?.product??'thermal'} detection: ${last.ageMinutes}m ago${near?.value!==null&&near?.value!==undefined?`; nearest returned detection ${near.value} km from the incident point`:''}${radius?` within the ${radius} km search`:''}.`:`No matching thermal detection returned${radius?' within '+radius+' km':''}.`;
  return {...answer(c,'fire',primary,rows(t.metrics),['Detection points and pixel footprints are not an exact fire location, fire front or official perimeter.',...(t.limitations??[])]),fireActivity:{
    officialIncident:c.status,latestThermalDetection:t.latestThermalDetection??null,nearestThermalDistance:near??null,detectionAge:last?.ageMinutes??null,
    detectionCount30m:counts[30],detectionCount1h:counts[60],detectionCount3h:counts[180],independentObservationFamilies:t.independentObservationFamilies??[],
    observedGeometry:c.observedGeometry??null,modeledGeometry:c.modeledGeometry??null,limitations:['An absent detection is not evidence of no fire.']}};
}
export function getOfficialStatus(c) {
  const s=c.status;
  return answer(c,'official',shown(s)?`Official incident status: ${s.value} · ${s.sourceName??s.source} · ${age(s)}${s.freshnessState==='STALE'?'. Status needs a current update':''}.`:'Current official incident status is unknown. No dated official update is associated with this record.',[s],['An internal open incident record is not an official Active status.']);
}
export function getApplicableWarnings(c) {
  const warnings=active(c),coverage=c.warnings?.applicabilityCoverage;
  const text=warnings.length?warnings.map(w=>`${w.authority}: ${w.type??'official warning'} for ${w.area??c.locationLabel??'the associated area'}, valid until ${w.expires??'time not supplied'}`).join('. '):coverage==='CURRENT'?'No active official warning found for the associated area.':'Warning applicability is unknown. No current area-matched official notice is available.';
  return {...answer(c,'warnings',text,[c.warnings?.metric],['National warnings are not automatically applicable to this incident. Outside a warning area does not establish safety.']),warnings};
}
export function getRoadContext(c) {
  const now=timestamp(c.asOf),roads=rows(c.places?.roads),restrictions=roads.filter(r=>r.statusEvidenceId&&['CLOSED','RESTRICTED','HAZARD_EXPOSED'].includes(r.state)&&timestamp(r.observedAt)!==null&&timestamp(r.observedAt)<=now&&(!r.effective||timestamp(r.effective)<=now)&&(timestamp(r.expires)>now||r.statusFreshness==='CURRENT'));
  const text=restrictions.length?restrictions.map(r=>`${r.label??r.name??'Reported road segment'}: ${r.statusLabel??r.state}, ${r.direction??'direction not supplied'} · update ${r.observedAt}`).join('. '):'Road status unknown. No connected restriction feed or current attributable field status for this incident.';
  return {...answer(c,'roads',text,rows(c.places?.roadMetrics),['No known closure is not a safe or passable route. A mapped road is not a status report.']),roads,restrictions,missingReason:restrictions.length?null:roads.some(r=>r.statusEvidenceId)?'SOURCE_STALE':'CAPABILITY_NOT_CONNECTED'};
}
export function getExposureContext(c) {
  const places=rows(c.places?.places),known=places.filter(p=>p.exposureBasis&&p.exposureState==='INSIDE_KNOWN_EXPOSURE'),modeled=places.filter(p=>p.exposureBasis&&p.exposureState==='INSIDE_MODELLED_EXPOSURE');
  const text=known.length?`${known.length} returned places inside the mapped observed exposure area: ${known.map(p=>p.label??p.name??'Unnamed place').slice(0,3).join(', ')}.`:modeled.length?`${modeled.length} returned places inside a modeled exposure area. Observed exposure is not established.`:'Affected places are not established. Nearby mapped places do not prove exposure or service availability.';
  return {...answer(c,'exposure',text,rows(c.places?.metrics),['Outside a mapped area does not mean safe. Nearby facilities are not confirmed available.']),places};
}
/** No physical escalation threshold is invented. Numeric deltas stay history unless a configured policy says otherwise. */
export const MATERIAL_CHANGE_POLICY=Object.freeze({version:'physical-changes-v2',lookbackMs:3600000,physicalThresholds:Object.freeze({}),primaryTypes:['Fire detection','Official update','Road','Field report','Operations','System failure']});
export function getMaterialChanges(c,since=new Date(timestamp(c.asOf)-MATERIAL_CHANGE_POLICY.lookbackMs).toISOString()) {
  const events=rows(c.changes).filter(e=>timestamp(e.at)!==null&&timestamp(e.at)>=timestamp(since)&&timestamp(e.at)<=timestamp(c.asOf));
  const material=events.filter(e=>e.material===true),history=events.filter(e=>e.material!==true);
  return {...answer(c,'changes',material[0]?.text??(history[0]?`Observation history: ${history[0].text}`:'No dated material change was returned in this period.'),[],['No change report does not establish unchanged conditions.',...(history.length?['Numeric changes without a configured materiality threshold are history, with no severity escalation.']:[])]),events:material,history,since};
}
export function getCurrentUnknowns(c) {
  const unknowns=[];
  const wind=metric(c,'wind'),gust=metric(c,'gust');
  if(!shown(wind))unknowns.push('Current weather at the incident is unknown.');
  else if(wind.suitability?.state==='HISTORICAL_CONTEXT')unknowns.push('Weather is stale or its source has failed; current local conditions need a new observation.');
  else if(wind.measurementType==='OBSERVED_REGIONAL')unknowns.push('Weather at the fire itself is unknown; the displayed station is regional context.');
  if(!shown(gust))unknowns.push(gust?.missingReason==='FIELD_NOT_PROVIDED'?'Current gust measurement is not supplied by the selected station feed.':'No suitable station observation is available to determine gusts.');
  if(!c.observedGeometry)unknowns.push('Current official fire perimeter is not available.');
  if(!shown(c.status))unknowns.push('Current official incident status is unknown.');
  if(!active(c).length&&c.warnings?.applicabilityCoverage!=='CURRENT')unknowns.push('Official warning applicability has not been established for this location.');
  if(!getRoadContext(c).restrictions.length)unknowns.push('Current road access is unknown.');
  if(!shown(metric(c,'pm25')))unknowns.push('No observed air-quality station reading is connected for this location.');
  const stale=[...rows(c.weather?.metrics),...rows(c.thermal?.metrics),...rows(c.air?.metrics),c.status].filter(m=>m?.value!==null&&['STALE','SOURCE_FAILED'].includes(m?.freshnessState));
  return {...answer(c,'unknowns',unknowns.join(' ')||'No additional unknowns recorded for these questions.',stale,[]),unknowns,stale};
}
export function getOperatorAttention(c) {
  const road=getRoadContext(c),unknowns=getCurrentUnknowns(c),actions=[];
  if(!road.restrictions.length)actions.push({action:'Verify road access before field movement.',reason:'Current access has not been reported.',route:'operations'});
  if(!shown(c.status))actions.push({action:'Obtain the latest official incident update.',reason:'This record has no dated official status.',route:'intelligence'});
  if(!c.observedGeometry)actions.push({action:'Request a current observed perimeter or field location report.',reason:'Thermal pixels and the incident point do not define the fire front.',route:'intelligence'});
  if(unknowns.stale.some(m=>m.id==='wind'))actions.push({action:'Obtain a current wind observation.',reason:'The displayed wind is last known context.',route:'intelligence'});
  return {...answer(c,'attention',actions[0]?`${actions[0].action} ${actions[0].reason}`:'Review current official instructions and ongoing assignments.',[],['Information collection guidance; not a dispatch, evacuation or route-safety instruction.']),actions};
}
export function incidentQuestions(c) {
  return {conditions:getCurrentConditions(c),fire:getNearbyFireActivity(c),official:getOfficialStatus(c),warnings:getApplicableWarnings(c),roads:getRoadContext(c),exposure:getExposureContext(c),changes:getMaterialChanges(c),unknowns:getCurrentUnknowns(c),attention:getOperatorAttention(c)};
}
export function getNationalSituation(p) {
  const metrics=rows(p.summary),counts=['activeOfficial','thermalHour','activeWarnings','highDangerRegions'].map(id=>metrics.find(m=>m.id===id)).filter(Boolean);
  return {...answer({asOf:p.asOf},'national',counts.map(m=>`${m.label}: ${shown(m)??'unknown'}`).join(' · '),metrics,[p.national?.boundary??p.boundary]),warnings:p.national?.warnings??[]};
}
export const OPERATOR_INTENTS=Object.freeze(['SITUATION','CONDITIONS','FIRE_ACTIVITY','WARNINGS','OFFICIAL_STATUS','ROADS','EXPOSURE','CHANGES','STALE','UNKNOWNS','ATTENTION','WHY_READING','AS_OF']);
export function parseOperatorQuestion(question) {
  const text=String(question??'').trim().toLowerCase();
  if(/what did.*know at|as of|at \d{1,2}:\d{2}/.test(text))return {type:'AS_OF',time:text.match(/\b(\d{1,2}:\d{2})\b/)?.[1]??null};
  if(/why.*(?:wind|reading|value)|what source.*(?:reading|value)|source produced/.test(text))return {type:'WHY_READING',metricId:/gust/.test(text)?'gust':/temperature/.test(text)?'temperature':/humidity/.test(text)?'humidity':'wind'};
  if(/stale|how old.*data/.test(text))return {type:'STALE'};
  if(/don't we know|do not.*know|unknown|missing information/.test(text))return {type:'UNKNOWNS'};
  if(/investigate next|attention next|collect next/.test(text))return {type:'ATTENTION'};
  if(/road|access|restriction/.test(text))return {type:'ROADS'};
  if(/expos|affected place/.test(text))return {type:'EXPOSURE'};
  if(/official.*warn|warnings.*apply|applicable.*warn/.test(text))return {type:'WARNINGS'};
  if(/official.*status|official.*update/.test(text))return {type:'OFFICIAL_STATUS'};
  if(/changed|change.*last/.test(text)){const count=Number(text.match(/last (\d+) (?:minute|min|hour)/)?.[1]??1);return {type:'CHANGES',minutes:/minute|min\b/.test(text)?count:count*60};}
  if(/thermal|latest.*(?:fire )?detection|how far.*detect|far away.*detect/.test(text))return {type:'FIRE_ACTIVITY'};
  if(/conditions|weather|wind|humidity|temperature|gust/.test(text))return {type:'CONDITIONS'};
  if(/happening|situation/.test(text))return {type:'SITUATION'};
  return null;
}
export function answerOperatorQuestion(c,intent) {
  const q=c.questions??incidentQuestions(c),mapping={CONDITIONS:'conditions',FIRE_ACTIVITY:'fire',WARNINGS:'warnings',OFFICIAL_STATUS:'official',ROADS:'roads',EXPOSURE:'exposure',UNKNOWNS:'unknowns',ATTENTION:'attention'};
  let result=mapping[intent.type]?q[mapping[intent.type]]:null;
  if(intent.type==='CHANGES')result=getMaterialChanges(c,new Date(timestamp(c.asOf)-Math.min(10080,Math.max(1,intent.minutes))*60000).toISOString());
  if(intent.type==='STALE')result=answer(c,'stale',q.unknowns.stale.length?q.unknowns.stale.map(m=>`${m.label}: ${shown(m)} · ${age(m)}`).join('. '):'No stale returned measurements identified. Missing sources remain unknown.',q.unknowns.stale,q.unknowns.limitations);
  if(intent.type==='WHY_READING'){const m=metric(c,intent.metricId);result=answer(c,'reading',shown(m)?`${m.label}: ${shown(m)} from ${m.location??m.sourceName} · ${m.distanceToSubject??'unknown'} km from the incident · ${age(m)}. ${m.definition?.statistic??'Measurement interval not supplied'}. ${m.context}`:m?.limitations?.join(' ')??'No attributable reading is available.',[m],m?.limitations??[]);}
  if(intent.type==='SITUATION'||intent.type==='AS_OF')result=answer(c,'situation',`${c.locationLabel??'Selected incident'}: ${q.fire.primaryAnswer} ${q.official.primaryAnswer} ${q.conditions.primaryAnswer}`,q.conditions.supportingFacts,[...q.fire.limitations,...q.unknowns.unknowns]);
  return result?{...result,intent:intent.type,state:'ANSWERED',answer:result.primaryAnswer,results:[],evidenceIds:result.supportingFacts.map(f=>f.provenanceRef).filter(Boolean)}:null;
}
