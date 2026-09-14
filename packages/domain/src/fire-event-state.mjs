const REPORT_CURRENT_MIN = 30;
const REPORT_DELAYED_MIN = 180;
const PHYSICAL_CURRENT_MIN = 90;
const PHYSICAL_DEGRADED_MIN = 180;
const PHYSICAL_SOURCE_THRESHOLDS=Object.freeze({
  viirs:Object.freeze({currentMinutes:90,agingMinutes:360}),
  sentinel3_slstr:Object.freeze({currentMinutes:120,agingMinutes:720}),
  camera:Object.freeze({currentMinutes:15,agingMinutes:60}),
  ground_sensor:Object.freeze({currentMinutes:10,agingMinutes:30}),
  drone:Object.freeze({currentMinutes:20,agingMinutes:60}),
  field:Object.freeze({currentMinutes:30,agingMinutes:120}),
  default:Object.freeze({currentMinutes:PHYSICAL_CURRENT_MIN,agingMinutes:PHYSICAL_DEGRADED_MIN})
});

function ageMinutes(at, now) {
  const ms = Date.parse(at ?? '');
  return Number.isFinite(ms) ? Math.max(0, (now.getTime() - ms) / 60_000) : null;
}
function reportStatusClosed(status) { return /(closed|ended|extint|encerrad|conclu[ií]d|resolvid)/i.test(String(status ?? '')); }
const PHYSICAL_TYPES=new Set(['thermal','camera','ground_sensor','drone','field']);
function latestOf(observations, predicate) { return observations.filter(predicate).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1) ?? null; }
function freshness(age, current, delayed) { if(!Number.isFinite(age))return'unknown'; if(age<=current)return'current'; if(age<=delayed)return'delayed'; return'stale'; }
function physicalPolicy(observation){const key=observation?.sourceFamily??observation?.type??'default';return{sourceFamily:key,...(PHYSICAL_SOURCE_THRESHOLDS[key]??PHYSICAL_SOURCE_THRESHOLDS.default)};}

export function fireEventState(observations = [], thermal = {}, { now = new Date() } = {}) {
  const latestReport=latestOf(observations,(item)=>['report','report_update'].includes(item.type));
  const firstReport=observations.find((item)=>item.type==='report')??null;
  const latestThermal=latestOf(observations,(item)=>item.type==='thermal'); const latestPhysical=latestOf(observations,(item)=>PHYSICAL_TYPES.has(item.type));
  const reportAgeMinutes=ageMinutes(latestReport?.at,now); const physicalAgeMinutes=ageMinutes(latestPhysical?.at,now);
  const reportFreshness=latestReport?freshness(reportAgeMinutes,REPORT_CURRENT_MIN,REPORT_DELAYED_MIN):'none';
  const policy=physicalPolicy(latestPhysical),physicalFreshness=latestPhysical?freshness(physicalAgeMinutes,policy.currentMinutes,policy.agingMinutes):'unobserved';
  const sourceClosed=latestReport?reportStatusClosed(latestReport.status):false;
  const sourceActivity=!latestReport?'no_report':sourceClosed?'closed':reportFreshness==='current'?'current':reportFreshness==='delayed'?'delayed':'stale_open';
  let behavior='unknown';
  if(physicalFreshness==='current'&&Number(thermal.currentSamples??0)>=2) behavior=thermal.currentDirection==='rising'?'growing':thermal.currentDirection==='cooling'?'cooling':thermal.currentDirection==='steady'?'stable':'unknown';
  let knowledge='unknown';
  if(physicalFreshness==='current')knowledge='physically_observed';
  else if(physicalFreshness==='delayed')knowledge='physical_observation_aging';
  else if(latestReport&&['current','delayed'].includes(reportFreshness))knowledge='report_only';
  else if(!latestReport&&latestPhysical&&physicalFreshness!=='stale')knowledge=latestPhysical.type==='thermal'?'thermal_candidate':'sensor_candidate';
  const eventLastAt=observations.at(-1)?.at??latestReport?.at??latestPhysical?.at??null; const eventAgeMinutes=ageMinutes(eventLastAt,now); const eventFreshness=freshness(eventAgeMinutes,20,180);
  const lifecycle=sourceClosed?'closed':eventFreshness==='stale'?'stale':behavior!=='unknown'?behavior:eventFreshness==='current'?'new':'current';
  return { report:{firstAt:firstReport?.at??null,lastAt:latestReport?.at??null,ageMinutes:reportAgeMinutes,freshness:reportFreshness,sourceActivity,sourceStatus:latestReport?.status??null}, physical:{firstAt:observations.filter((item)=>PHYSICAL_TYPES.has(item.type)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0]?.at??null,lastAt:latestPhysical?.at??null,ageMinutes:physicalAgeMinutes,freshness:physicalFreshness,sourceType:latestPhysical?.type??null,sourceFamily:latestPhysical?.sourceFamily??latestPhysical?.type??null,sensor:latestPhysical?.satellite??latestPhysical?.sensorId??latestPhysical?.instrument??null,sampleCount:Number(thermal.samples??0),currentSampleCount:Number(thermal.currentSamples??0),freshnessPolicy:policy}, knowledge, behavior, lifecycle, eventAgeMinutes };
}
export const FIRE_EVENT_THRESHOLDS=Object.freeze({REPORT_CURRENT_MIN,REPORT_DELAYED_MIN,PHYSICAL_CURRENT_MIN,PHYSICAL_DEGRADED_MIN,PHYSICAL_SOURCE_THRESHOLDS});
