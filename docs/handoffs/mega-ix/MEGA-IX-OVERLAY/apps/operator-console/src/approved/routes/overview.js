import {icon} from '../ui/signal-icons.js';
import {e,button,link,empty} from '../ui/html.js';
import {panel} from '../ui/section-panel.js';
import {mapView} from '../ui/map.js';
import {OverviewSignals,OfficialNotices,SourceStatusSummary} from '../ui/signals.js';
import {ActivityFeed} from '../ui/activity.js';
import {isLimited,timeLabel} from '../data/model.js';
import {primaryMetric} from '../data/hierarchy.js';
import {MissionSlot} from '../ui/mission-command.js';

export function overview(state) {
 const priorities=state.priorities,alerts=state.physicalChanges;
 const summaryLabels={activeOfficial:'current incident records',thermalHour:'new detections in 1h',activeWarnings:'official weather warnings',highDangerRegions:'high fire-danger municipalities'};
 const lifecycle=state.currentnessCounts;
 const summary=(lifecycle?[(lifecycle.CURRENT+lifecycle.NEW+lifecycle.REOPENED)+' current',lifecycle.MONITORING+' monitoring',lifecycle.HISTORICAL+' historical'].join(' · ')+' · ':'')+(state.physicalSummary??[]).filter(m=>summaryLabels[m.id]&&(!lifecycle||m.id!=='activeOfficial')&&primaryMetric(m)).map(m=>`${m.display} ${summaryLabels[m.id]}`).join(' · ');
 const priorityRows=priorities.map(i=>`<div class="row priority-row"><span class="flame-tile ${e(i.status)}">${icon('flame')}</span><div class="row-main"><h3>${e(i.name)}</h3><p>${e(i.statusLabel)} · ${e(i.type)}</p><small>${e(timeLabel(i.observedAt))}</small></div>${button('Open incident','open-incident',{tone:'small-btn',ico:'arrow',extra:`data-id="${e(i.id)}" aria-pressed="${i.id===state.selected}"`})}</div>`).join('');
 const alertRows=alerts.slice(0,6).map((a,n)=>`<article class="operator-alert"><span class="alert-icon blue">${icon('info')}</span><div><h3>${e(a.text)}</h3><p>${e(a.source)} · ${e(a.timeLabel)}</p></div>${button('View alert details','operator-alert',{ico:'chevron',tone:'icon-button',extra:`data-id="${n}"`})}</article>`).join('');
 const workload=state.workload.filter(([,n])=>Number.isFinite(n)).map(([label,n])=>`<div><dt>${e(label)}</dt><dd>${e(n)}</dd></div>`).join('');
 return `<div class="route-stack">
 <section class="current-situation" data-vqa="current-situation"><div class="situation-copy"><h2>Portugal · latest reported situation</h2><p>${e(summary||'Inspect dated incident records and source coverage.')}</p><small>Console refreshed ${e(timeLabel(state.generatedAt))}</small></div><details class="overview-conditions" data-responsive-disclosure="overview-conditions" open><summary>Weather and fire danger</summary>${OverviewSignals(state)}</details></section>
 ${priorities[0]?`<div class="mobile-priority"><span>Priority to review</span>${button(priorities[0].name,'open-incident',{ico:'arrow',extra:`data-id="${e(priorities[0].id)}"`})}<small>${e(priorities[0].statusLabel)} · ${e(timeLabel(priorities[0].observedAt))}</small></div>`:''}
 <div class="overview-main" data-vqa="overview-main">
 ${panel('Portugal map',mapView({state,id:'overview-map',height:400,limited:isLimited(state),legend:false,caption:false}),{cls:'overview-map-panel',ico:'map',sub:'Reported incident locations across Portugal.',action:button('Expand national view','navigate',{tone:'icon-button',ico:'expand',extra:'data-route="national-awareness"'})})}
 <aside class="overview-priorities">${MissionSlot()}<details class="mc-priorities"><summary>Priority incidents · ${priorities.length}</summary>${priorityRows?`<div class="rows">${priorityRows}</div>`:empty('No incidents in the operational queue','Historical records remain available in Incidents.')}${link('View all incidents','navigate','data-route="incidents"')}</details></aside>
 </div>
 ${alerts.length?panel('Operator alerts',`<div class="operator-alerts">${alertRows}</div>`,{ico:'bell',sub:'Latest material changes.',action:link('View activity','activity')}):`<div class="overview-alert-status"><strong>Operator alerts</strong><span>No recent material changes returned. This does not establish unchanged conditions.</span>${link('View activity','activity')}</div>`}
 <div class="overview-bottom" data-vqa="overview-bottom">${panel('Official weather notices',OfficialNotices(state),{ico:'cloud',sub:'IPMA · Portugal, including Madeira and the Azores.'})}</div>
 <details class="overview-work"><summary>Sources and ongoing work</summary><div class="workload-body">${SourceStatusSummary(state)}<dl class="source-status-rows">${workload}</dl>${link('View source health','system-info')}</div></details>
 <details class="recent-activity-panel"><summary>Recent activity and history</summary>${ActivityFeed(state.activity,{now:state.generatedAt,type:state.runtime.approvedActivityType??'All types',days:state.runtime.approvedActivityDays??'7',limit:state.runtime.approvedActivityLimit??5})}</details>
 <details class="workload-classification"><summary>Incident classification and health details</summary><div class="workload-metrics">${state.metrics.map(([label,n,sub,tone])=>`<article class="metric ${tone}"><strong class="value num">${e(n??'Unavailable')}</strong><h3>${e(label)}</h3><p>${e(sub)}</p></article>`).join('')}</div>${state.health.map(h=>`<div class="stat-line"><span>${e(h.label)}</span><span>${e(h.state)}</span></div>`).join('')}</details></div>`;
}
