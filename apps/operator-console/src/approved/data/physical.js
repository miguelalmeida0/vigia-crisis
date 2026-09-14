import { value, timeLabel } from '../../canonicalViewModel.js';

const definitions={temperature:['Temperature','°C'],wind:['Wind','km/h'],gust:['Wind gusts','km/h'],humidity:['Humidity','%'],rain:['Rain','mm'],windDirection:['Wind from',''],fireDanger:['Official fire danger',''],thermalTime:['Latest thermal detection',''],thermalLatestDistance:['Distance to latest detection','km'],thermalDistance:['Nearest thermal detection','km'],thermalProduct:['Satellite / product',''],frp:['Fire radiative power','MW'],thermal30:['Detections · 30m',''],thermal60:['Detections · 1h',''],thermal180:['Detections · 3h',''],independentFamilies:['Independent physical families',''],pm25:['PM2.5','µg/m³'],pm10:['PM10','µg/m³'],ozone:['Ozone','µg/m³'],aqCategory:['Air quality',''],aqDistance:['Distance to AQ station','km'],smoke:['Modelled smoke',''],officialStatus:['Official incident status',''],warnings:['Active official warnings',''],nearestIncident:['Nearest known incident record','km'],windToward:['Wind toward location','']};
export function displayMetric(input={},now=Date.now()) {
  const hasValue=input.value!==null&&input.value!==undefined,at=Date.parse(input.observedAt??input.asOf??''),age=Number.isFinite(at)&&at<=now?Math.floor((now-at)/60000):null;
  const stale=input.freshness==='STALE'||age!==null&&Number.isFinite(input.staleAfterMs)&&now-at>input.staleAfterMs;
  const trend=input.trend;
  const shown=input.id==='officialStatus'?String(input.value).replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase()):String(input.value);
  const missingLabel=input.missingReason==='FIELD_NOT_PROVIDED'?'Not reported':input.missingReason==='CAPABILITY_NOT_CONNECTED'?'Not connected':'Unknown';
  const missingText=input.limitations?.find(l=>/not provided|not supplied|not connected|source.*failed/i.test(l))??input.reason??'No matching dated measurement was returned.';
  return {...input,latency:{...input.latency,ingestionToScreenMs:Number.isFinite(Date.parse(input.receivedAt))&&now>=Date.parse(input.receivedAt)?now-Date.parse(input.receivedAt):null,ageAtDisplayMs:Number.isFinite(at)&&now>=at?now-at:null},available:hasValue,display:hasValue?(input.id==='thermalTime'?timeLabel(input.value):shown):missingLabel,missingText,
    freshnessLabel:!hasValue?missingText:age===null?(input.measurementType==='DERIVED'?`Checked ${Number.isFinite(Date.parse(input.receivedAt))?Math.max(0,Math.floor((now-Date.parse(input.receivedAt))/60000))+'m ago':'at unknown time'}`:'Measurement time not supplied'):`${stale?'Stale · ':''}Measured ${age<1?'<1':age}m ago${input.status==='SOURCE_UNAVAILABLE'?' · source failed':''}`,
    timeLabel:timeLabel(input.asOf),tone:stale?'stale':!hasValue?'unavailable':'reported',
    trendLabel:trend?`${trend.delta>0?'+':''}${trend.delta} ${input.unit} in ${trend.minutes}m${trend.maxLastHour!==null?` · max last hour ${trend.maxLastHour} ${input.unit}`:''}`:null,
    // Geometry for a compact sparkline is a view-model calculation, never renderer logic.
    sparkline:trend?.samples?.length>1?points(trend.samples):null};
}
function points(samples){samples=samples.filter(s=>typeof s.value==='number'&&Number.isFinite(s.value));if(samples.length<2)return null;const values=samples.map(s=>s.value),min=Math.min(...values),span=Math.max(...values)-min;return samples.map((s,i)=>`${(i/(samples.length-1)*100).toFixed(1)},${(24-(span?(s.value-min)/span*22:11)).toFixed(1)}`).join(' ');}
export function physicalVM(input,now=Date.now()) {
  const raw=input??{},all=[...(raw.metrics??[]),...(raw.weather?.metrics??[]),...(raw.thermal?.metrics??[]),...(raw.air?.metrics??[]),raw.air?.smoke,raw.status,raw.warnings?.metric,raw.fireDanger,raw.nearestIncident,raw.windToward,...(raw.places?.metrics??[]),...(raw.places?.roadMetrics??[])].filter(Boolean),index=new Map(all.map(m=>[m.id,m]));
  const metrics=Object.fromEntries(Object.entries(definitions).map(([id,[label,unit]])=>[id,displayMetric(index.get(id)??{id,label,unit,value:null,reason:'No attributable measurement returned.'},now)]));
  return {metrics,currentness:raw.currentness??null,questions:raw.questions??null,station:raw.weather?.station??raw.station,warnings:raw.warnings?.warnings??[],places:raw.places?.places??[],roads:raw.places?.roads??[],exposure:(raw.places?.metrics??[]).map(m=>displayMetric(m,now)),roadMetrics:(raw.places?.roadMetrics??[]).map(m=>displayMetric(m,now)),changes:(raw.changes??[]).map(c=>({...c,timeLabel:timeLabel(c.at)}))};
}
export function attachPhysical(vm,now=Date.now()) {
  const source=value(vm.source,'physicalWorld'),byId=new Map((source?.incidents??[]).map(i=>[String(i.incidentId).replace(/^incident:/,''),i]));
  const find=id=>byId.get(String(id??'').replace(/^incident:/,''));
  vm.physical=physicalVM(find(vm.incident?.id??vm.selected),now);
  vm.answers=vm.physical.questions??{};
  vm.nationalAnswer=source?.nationalQuestion??null;
  vm.auditActivity=vm.activity;
  vm.activity=(source?.activity??[]).map(c=>({raw:c,time:timeLabel(c.at),title:c.text,actor:c.source}));
  if(vm.route==='incident-detail')vm.timeline=vm.activity;
  for(const i of vm.incidents??[])i.physical=physicalVM(find(i.id),now);
  vm.physicalSummary=(source?.summary??[]).map(m=>displayMetric(m,now));
  vm.physicalNotices=source?.national?.warnings??[];
  vm.physicalNoticeCoverage=source?.national?.warningCoverage??'UNAVAILABLE';
  vm.physicalBoundary=source?.boundary??'Physical source measurements are unavailable for this authorized view.';
  vm.physicalChanges=(source?.activity??[]).filter(c=>c.material===true&&Date.parse(c.at)>=Date.parse(source.asOf)-3600000).slice(0,8).map(c=>({...c,timeLabel:timeLabel(c.at)}));
  return vm;
}
