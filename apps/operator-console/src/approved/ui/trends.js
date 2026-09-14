import { e,button } from './html.js';
import { panel } from './section-panel.js';
import { conditionsTrend } from '../data/hierarchy.js';
import { clock,day,measured } from '../data/field.js';

const names={temperature:'Temperature',wind:'Wind',rain:'Rain'};
const duration=minutes=>minutes%60===0?`${minutes/60}h`:`${minutes} min`;
export function ConditionsOverTime(f) {
  const trend=conditionsTrend(f);
  if(!trend.series.length)return '';
  const start=new Date(trend.start).toISOString(),end=new Date(trend.end).toISOString();
  const dateRange=start.slice(0,10)===end.slice(0,10)?day(start):`${day(start)} – ${day(end)}`;
  const ticks=trend.times.length<=4?trend.times:[trend.start,trend.times[Math.floor(trend.times.length/2)],trend.end];
  const x=at=>12+(Date.parse(at)-trend.start)/(trend.end-trend.start)*276;
  return panel('Conditions over time',`<div class="conditions-trends" data-vqa="conditions-over-time" style="--trend-count:${trend.series.length}">${trend.series.map(s=>{
    const values=s.samples.map(p=>p.value),min=s.id==='rain'?0:Math.min(...values),max=Math.max(...values),span=max-min;
    const y=value=>span?58-(value-min)/span*42:37;
    const delta=s.id==='rain'&&values.every(v=>v===0)?`0 mm in ${values.length} returned readings`:s.delta===0?`No change over ${duration(s.minutes)}`:`${s.delta>0?'+':''}${s.delta} ${s.metric.unit} over ${duration(s.minutes)}`;
    const mark=p=>{const title=`${measured(p.at)} · ${p.value} ${s.metric.unit}`;return s.id==='rain'?`<rect class="trend-mark" tabindex="0" role="img" aria-label="${e(title)}" data-at="${e(p.at)}" data-value="${p.value}" x="${x(p.at)-5}" y="${p.value===0?58:y(p.value)}" width="10" height="${p.value===0?1:58-y(p.value)}"><title>${e(title)}</title></rect>`:`<circle class="trend-mark" tabindex="0" role="img" aria-label="${e(title)}" data-at="${e(p.at)}" data-value="${p.value}" cx="${x(p.at)}" cy="${y(p.value)}" r="3.5"><title>${e(title)}</title></circle>`;};
    return `<article class="condition-trend trend-${s.id}" data-trend="${s.id}"><h3>${names[s.id]}</h3><strong>${e(s.current)} <span>${e(s.metric.unit)}${s.id==='wind'&&s.metric.direction?' · '+e(s.metric.direction):''}</span></strong><p class="condition-delta">${e(delta)}</p><svg viewBox="0 0 300 85" aria-label="${names[s.id]} actual source measurements, ${e(dateRange)} UTC" role="group"><line class="trend-baseline" x1="12" x2="288" y1="58" y2="58"/>${s.id!=='rain'?`<polyline class="trend-connector" points="${s.samples.map(p=>x(p.at)+','+y(p.value)).join(' ')}"><title>Guide between returned samples; no interpolated measurements.</title></polyline>`:''}${s.samples.map(mark).join('')}</svg><div class="trend-time-axis" aria-label="Observation times in UTC">${ticks.map(t=>`<time datetime="${new Date(t).toISOString()}" style="left:${x(new Date(t).toISOString())/3}%">${clock(new Date(t).toISOString())}</time>`).join('')}</div><small>Latest reading ${s.ageMinutes<1?'less than 1':s.ageMinutes} min ago</small></article>`;
  }).join('')}</div><p class="trend-scope">Actual source samples · dots show readings; bars show rain accumulation. UTC.</p>`,{ico:'chart',cls:'conditions-trend-panel',sub:`${f.station?.name??'Source station'} · ${dateRange} · ${clock(start)}–${clock(end)} UTC`,action:button('View readings','condition-readings',{tone:'small-btn',ico:'arrow'})});
}

export function ReadingsDetail(f) {
  const trend=conditionsTrend(f);
  return `<div class="readings-detail"><p>Exact returned observations. Gaps are not interpolated; each metric retains its source interval.</p>${trend.series.map(s=>`<section><h3>${names[s.id]} · ${e(s.metric.sourceName??s.metric.source)}</h3><table><thead><tr><th>Measured (UTC)</th><th>Value</th></tr></thead><tbody>${s.samples.map(p=>`<tr><td><time datetime="${e(p.at)}">${e(measured(p.at))}</time></td><td>${e(p.value)} ${e(s.metric.unit)}</td></tr>`).join('')}</tbody></table></section>`).join('')}</div>`;
}
