import {e,badge} from './html.js';

const present=v=>v!==null&&v!==undefined&&v!=='';
const text=v=>Array.isArray(v)?v.join(' · '):typeof v==='object'?JSON.stringify(v):v;
export const readableAge=value=>String(value??'Time not supplied').replace(/(\d+)m ago/g,(_,n)=>Number(n)<60?`${n}m ago`:Number(n)<1440?`${Math.floor(n/60)}h ${n%60}m ago`:`${Math.floor(n/1440)}d ago`);
const sourceName=value=>/Fogos\.pt/.test(value)?'Civil protection records':/^IPMA RCM/.test(value)?'IPMA fire danger':/NASA FIRMS/.test(value)?'NASA FIRMS':value;
const isSourceChange=c=>/source|system/i.test(c.type??'')||/could not be refreshed|source.*unavailable|provider.*unavailable/i.test(c.text??c.summary??'');
export function DetailRows(rows) {
 return `<dl class="ux-detail-rows">${rows.filter(([,v])=>present(v)).map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${e(text(value))}</dd></div>`).join('')}</dl>`;
}
export function TechnicalDetails(title,body) {return `<details class="ux-disclosure"><summary>${e(title)}</summary><div class="ux-disclosure-body">${body}</div></details>`;}

export function OfficialNoticeList(notices=[],coverage='UNAVAILABLE') {
 return `<section class="ux-notices"><h3>Official notices</h3>${notices.length?`<ul>${notices.map(w=>`<li><div><strong>${e(w.type??w.title??'Official notice')}</strong>${badge(String(w.state??w.level??'Notice').replaceAll('_',' ').toLowerCase(),'amber')}</div><p>${e(w.area??'Area not supplied')} · ${e(w.authority??w.source??'Source not supplied')}</p>${w.text?`<p>${e(w.text)}</p>`:''}${TechnicalDetails('Notice dates',DetailRows([['Issued',w.issuedAt??'Not supplied'],['Effective',w.effective],['Expires',w.expires]]))}</li>`).join('')}</ul>`:`<p class="ux-empty">${coverage==='CURRENT'?'No active notice was returned by the current source.':'Notice coverage is unavailable; an all-clear cannot be inferred.'}</p>`}</section>`;
}

export function ChangeList(changes=[]) {
 return `<section class="ux-changes" aria-label="What changed"><h3>What changed</h3>${changes.length?`<ol>${changes.map(c=>`<li><div><strong>${e(c.label??c.text??c.summary??'Reported change')}</strong>${present(c.previous)&&present(c.current)?`<span class="ux-change-values">${e(c.previous)} → <b>${e(c.current)} ${e(c.unit)}</b></span>`:''}</div><small>${e(c.source??'Source not supplied')} · ${e(c.timeLabel??c.to??c.at??'Time not supplied')}</small>${c.trendLabel?`<p>${e(c.trendLabel)}</p>`:''}</li>`).join('')}</ol>`:'<p class="ux-empty">No dated change was returned. Conditions may still have changed.</p>'}</section>`;
}

export function MeasurementPanel({metrics=[],changes=[],notices=[],coverage,boundary='',title='Current conditions',extra=''}) {
 const valid=metrics.filter(Boolean),known=valid.filter(m=>m.available),sources=new Map();
 const sourceChanges=changes.filter(isSourceChange),conditionChanges=changes.filter(c=>!isSourceChange(c));
 for(const m of valid){const key=m.source??'Source not supplied';if(!sources.has(key))sources.set(key,[]);sources.get(key).push(m);}
 const sampled=valid.filter(m=>m.trend?.samples?.length>1).map(m=>({label:m.label,source:m.source,previous:m.trend.samples[0].value,current:m.trend.samples.at(-1).value,unit:m.unit,timeLabel:m.timeLabel,trendLabel:m.trendLabel}));
 const detail=m=>DetailRows([['Measurement',m.label],['Value',m.available?`${m.display} ${m.unit??''}`:m.display],['Observed',m.observedAt??m.asOf],['Received',m.receivedAt],['Calculated',m.calculatedAt],['Source',m.source],['Location / coverage',m.context],['Freshness',m.freshnessLabel],['Reason',m.reason??m.missingText],['Change',m.trendLabel],['Definition',m.definition],['Limitations',m.limitations],['Provenance',m.provenanceRef],['Method',m.transformation],['Version',m.version]]);
 return `<div class="measurement-panel" data-vqa="measurement-panel"><section><h3>${e(title)}</h3>${known.length?`<dl class="ux-reading-list">${known.map(m=>`<div data-metric="${e(m.id)}"><dt>${e(m.label)}</dt><dd><strong>${e(m.display)}</strong>${m.unit?` <span>${e(m.unit)}</span>`:''}<small>${e(readableAge(m.freshnessLabel))}</small><small>${e(m.source??'Source not supplied')}${m.sourceLocation?.name?' · '+e(m.sourceLocation.name):''}</small></dd></div>`).join('')}</dl>`:'<p class="ux-empty">No measurements are available for this selection. Source coverage is shown below.</p>'}</section>
 ${ChangeList(conditionChanges.length?conditionChanges:sampled)}
 <section class="ux-source-coverage"><h3>Source status & coverage</h3>${[...sources].map(([source,items])=>{const available=items.filter(m=>m.available),failed=items.some(m=>m.status==='SOURCE_UNAVAILABLE'),stale=items.some(m=>m.tone==='stale');return TechnicalDetails(`${sourceName(source)} · ${failed?'Source unavailable':stale?'Includes older readings':available.length===items.length?'Readings available':available.length?'Some readings missing':'No readings available'}`,`<ul class="ux-coverage-list">${items.map(m=>`<li><strong>${e(m.label)}</strong><span>${e(m.available?m.freshnessLabel:m.display)}</span>${m.context||!m.available?`<p>${e(m.available?m.context:m.missingText)}</p>`:''}</li>`).join('')}</ul>`);}).join('')}${sourceChanges.length?TechnicalDetails('Source updates · '+sourceChanges.length,`<ul class="ux-source-updates">${sourceChanges.map(c=>`<li><strong>${e((c.text??c.summary??'Source update').replace(/ could not be refreshed\..*$/,' · refresh failed'))}</strong><small>${e(c.source)} · ${e(c.timeLabel??c.at)}</small>${TechnicalDetails('Full source report',`<p>${e(c.text??c.summary)}</p>`)}</li>`).join('')}</ul>`):''}${!sources.size?'<p class="ux-empty">No source coverage was returned.</p>':''}${boundary?`<p class="ux-boundary">${e(boundary)}</p>`:''}</section>
 ${OfficialNoticeList(notices,coverage)}${extra}
 <section class="ux-technical"><h3>Technical details</h3>${TechnicalDetails('Measurement definitions and provenance',valid.map(m=>TechnicalDetails(m.label,detail(m))).join(''))}</section></div>`;
}
