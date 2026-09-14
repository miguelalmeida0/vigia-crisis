import { e, button } from './html.js';
import { icon } from './signal-icons.js';
import { displayMetric } from '../data/physical.js';
import { timeLabel } from '../../canonicalViewModel.js';
import { primaryMetric, currentSignals, nationalCurrentMetric } from '../data/hierarchy.js';

const appearance = {
  temperature:['temperature','blue'],humidity:['droplet','blue'],wind:['wind','blue'],
  gust:['wind','blue'],rain:['rain','blue'],fireDanger:['flame','amber'],
  stationDistance:['pin','blue'],thermalTime:['clock','amber'],aqCategory:['air','green'],warnings:['cloud','amber'],
  activeOfficial:['flame','blue'],thermalHour:['alert','blue'],nationalRisk:['flame','amber'],municipalitiesRisk:['shield','amber'],
};
export function SignalMetricCard(metric, { kind=metric.id, label=metric.label, compact=false, showLocation=!compact }={}) {
  if(!primaryMetric(metric))return '';
  const [baseSymbol,baseTone]=appearance[kind]??['alert','red'];
  const symbol=compact&&kind==='aqCategory'?'air-quality':baseSymbol;
  const tone=metric.id==='verifiedCurrent'&&metric.value>0?'red':kind==='thermalHour'&&metric.value>0?'amber':baseTone;
  const available=metric.available??(metric.value!==null&&metric.value!==undefined);
  const bars=['fireDanger','warnings'].includes(kind)&&metric.sparkline;
  const chart=bars?metric.sparkline.split(' ').map(point=>{const [x,y]=point.split(',').map(Number);return `<rect x="${x*.94}" y="${y}" width="6" height="${26-y}"/>`;}).join(''):`<polyline points="${e(metric.sparkline)}"/>`;
  return `<article class="signal-card signal-${tone} ${compact?'signal-compact':''} ${available?'':'signal-unavailable'}" data-vqa="signal-${e(kind)}" data-metric="${e(metric.id)}">
    <div class="signal-heading"><span class="signal-icon">${icon(symbol)}</span><h3>${e(label)}</h3></div>
    <div class="signal-value">${e(metric.display)}${available&&metric.unit?` <span>${e(metric.unit)}${metric.direction?' '+e(metric.direction):''}</span>`:''}</div>
    ${metric.trendLabel?`<p class="signal-trend ${metric.trend?.delta<0?'trend-down':''}">${e(metric.trend?((!compact?(metric.trend.delta>0?'↑ ':metric.trend.delta<0?'↓ ':''):'')+(metric.trend.delta>0?'+':'')+metric.trend.delta+' '+(metric.unit??'')+(compact?' · '+metric.trend.minutes+'m':'')):metric.trendLabel)}</p>`:''}
    ${!compact&&metric.sparkline?`<svg class="signal-sparkline ${bars?'signal-bars':''}" viewBox="0 0 100 26" role="img" aria-label="${e(label)} trend">${chart}</svg>`:''}
    <div class="signal-fact-context">${showLocation&&available?`<strong>${e(metric.location??metric.source??'Location not supplied')}</strong>`:''}<span>${e(metric.freshnessLabel)}</span>${compact&&metric.id==='rain'&&available?`<span>${metric.definition?.periodMinutes===60?'Previous 1h accumulation':'Measurement interval not supplied'}</span>`:''}${button('Why this?','fact-inspect',{tone:'fact-inspect',ico:'info',extra:`data-id="${e(metric.id)}" aria-label="Why this ${e(label.toLowerCase())}?"`})}</div>
  </article>`;
}
export function EnvironmentalConditionsStrip(vm,label='Current conditions') {
  const station=vm.physical?.station,candidates=currentSignals(vm.physical,Date.parse(vm.generatedAt)||Date.now()),metrics=candidates.length>1?candidates.filter(m=>m.id!=='stationDistance'):candidates;
  const times=[...new Set(metrics.map(m=>m.observedAt).filter(Boolean))],sharedAt=times.length===1&&metrics.every(m=>m.observedAt===times[0])?times[0]:null;
  const retained=metrics.some(m=>m.tone==='stale'||m.status==='SOURCE_UNAVAILABLE'),sourceFailed=metrics.some(m=>m.status==='SOURCE_UNAVAILABLE');
  if(!metrics.length)return `<div class="conditions-coverage">${button('Data coverage','data-coverage',{tone:'small-btn'})}</div>`;
  return `<section class="environmental-conditions" data-shared-observation-time="${Boolean(sharedAt)}" data-vqa="environmental-conditions"><div class="conditions-heading"><div><h2>${e(retained&&label==='Current conditions'?'Last reported conditions':label)}</h2>${station?`<p>${e(station.name)}${station.distanceKm!==null&&station.distanceKm!==undefined?' · '+e(station.distanceKm)+' km away':''} · conditions at the incident may differ</p>`:''}${sharedAt?`<p class="conditions-shared-time">${retained?'Stale · ':''}Measured ${e(timeLabel(sharedAt))}${sourceFailed?' · source failed':''}</p>`:''}</div>${button('Data coverage','data-coverage',{tone:'icon-button',ico:'info'})}</div><div class="signal-grid dynamic-signals" style="--signal-count:${metrics.length}">${metrics.map(metric=>SignalMetricCard(metric,{compact:true})).join('')}</div></section>`;
}
export function summaryMetric(vm,id,label,unit='') {
  return vm.physicalSummary.find(m=>m.id===id)??displayMetric({id,label,unit,value:null});
}
export function OverviewSignals(vm) {
  const cards=[
    ['national-temperature','Highest temperature','temperature'],['national-humidity','Lowest humidity','humidity'],
    ['national-wind','Highest observed wind','wind'],['highDangerRegions','Fire danger municipalities','fireDanger'],
    ['activeWarnings','Weather warnings','warnings'],['worstAQ','Air quality','aqCategory'],
  ].map(([id,label,kind])=>SignalMetricCard(summaryMetric(vm,id,label),{label,kind})).filter(Boolean);
  return cards.length?`<div class="signal-grid dynamic-signals" style="--signal-count:${cards.length}">${cards.join('')}</div>`:'';
}
export function NationalSignalStrip(vm) {
  const cards=[
    ['activeOfficial','Active official-feed records','activeOfficial'],['thermalHour','New detections (1h)','thermalHour'],
    ['national-temperature','Highest temperature','temperature'],['national-humidity','Lowest humidity','humidity'],
    ['activeWarnings','Official warnings','warnings'],['highDangerRegions','High fire-danger municipalities','municipalitiesRisk'],
  ].map(([id,label,kind])=>{let metric=summaryMetric(vm,id,label);if(id==='activeOfficial'&&!primaryMetric(metric)){const verified=nationalCurrentMetric(vm);if(verified){metric=verified;label=verified.label;}}const place=metric.sourceLocation?.name??metric.location??(metric.id==='verifiedCurrent'?'Canonical verification policy':({activeOfficial:'ANEPC-derived public feed',thermalHour:'NASA FIRMS · returned detections',activeWarnings:'IPMA · Portugal warning areas',highDangerRegions:'IPMA · municipality bulletin'}[id]));return SignalMetricCard({...metric,location:place},{label,kind,compact:true,showLocation:true});}).filter(Boolean);
  return cards.length?`<section class="national-signals" aria-label="National situation"><div class="signal-grid dynamic-signals national-primary-signals" style="--signal-count:${cards.length}">${cards.slice(0,2).join('')}${cards.length>2?`<details class="national-extra-signals" data-responsive-disclosure="national-signals" open><summary>Weather and fire danger</summary><div class="national-extra-grid">${cards.slice(2).join('')}</div></details>`:''}</div></section>`:'';
}
export function OfficialNotices(vm) {
  return vm.physicalNotices.length?`<div class="official-notices">${vm.physicalNotices.map(w=>`<article class="official-notice"><span class="notice-icon">${icon('cloud')}</span><div><h3>${e(w.authority)} · ${e(w.type)} · ${e(w.area)}</h3><p>${e(w.text)}</p><small>Effective ${e(timeLabel(w.effective))} · Expires ${e(timeLabel(w.expires))}</small></div><span class="badge ${w.state==='ACTIVE'?'amber':'neutral'}">${e(w.state==='ACTIVE'?'Active':'Currentness unavailable')}</span></article>`).join('')}</div>`:`<p class="panel-pad">${vm.physicalNoticeCoverage==='CURRENT'?'No active official warnings in the current source response.':'Official warning coverage unavailable.'}</p>`;
}
export function SourceStatusSummary(vm) {
  if(!vm.sourceStatuses)return '<p>Source health unavailable.</p>';
  const total=vm.sourceStatuses.length,active=vm.sourceStatuses.filter(s=>s.status==='ACTIVE').length,stale=vm.sourceStatuses.filter(s=>s.status==='STALE').length;
  return `<dl class="source-status-summary source-status-rows"><div><dt>Active source records</dt><dd>${active} / ${total}</dd></div><div><dt>Stale records</dt><dd>${stale}</dd></div><div><dt>Other states</dt><dd>${total-active-stale}</dd></div></dl>`;
}
