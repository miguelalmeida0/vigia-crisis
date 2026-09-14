import { shell, esc } from '../components.js?v=2.1.0';
import { icon } from '../icons.js?v=2.1.0';
import { canonicalMap, emptyTruthState } from '../canonicalComponents.js?v=3.0.0';
import { canonicalIncidents, envelope, incidentAssessment, incidentEnvelope, incidentId, incidentLabel, incidentLocation, operatorText, section, value } from '../canonicalViewModel.js?v=3.0.0';
import { finiteNumberOrNull } from '../truth.js?v=2.1.0';
import { incidentQuicklook } from '../executiveComponents.js?v=3.0.0';
import { vigiaStateLabel } from '../operatorPrimitives.js?v=3.2.0';
import { crisisAutopilotCommand } from '../crisisOperatingSystem.js?v=4.0.0';

const rows=input=>Array.isArray(input)?input:[];
const number=input=>{const value=finiteNumberOrNull(input);return value===null?'Unavailable':value.toLocaleString('en-US');};
const tone=input=>{const state=String(input??'').toUpperCase();if(/CRITICAL|FAILED|BLOCK/.test(state))return'critical';if(/DETECTION_CANDIDATE|DEGRADED|WAIT|PARTIAL|ATTENTION/.test(state))return'warning';if(/VERIFIED_CURRENT|READY|HEALTHY|COMPLETE|CONTAINED|OPERATIONAL/.test(state))return'green';return'info';};

function metric(label,valueText,meta,iconName,kind='info',vqa=''){
  return `<article class="overview-metric overview-metric--${kind}"${vqa?` data-vqa="${vqa}"`:''}><i aria-hidden="true">${icon(iconName,20)}</i><span><small>${esc(label)}</small><strong>${esc(valueText)}</strong><em>${esc(meta)}</em></span></article>`;
}

function priorityItems(items,selectedId){
  if(!items.length)return emptyTruthState('Priority items unavailable','The canonical command projection did not return a current priority order.');
  return `<ol class="priority-items">${items.slice(0,5).map((item)=>{const id=String(item.incidentId??incidentId(item)),canonical=items.find(row=>incidentId(row)===id)??item,label=item.name??item.incident??incidentLabel(canonical),status=item.state??item.status??incidentAssessment(canonical),selected=id&&id===selectedId,location=item.location??incidentLocation(canonical);return `<li><button class="${selected?'is-selected':''}" data-action="inspect-incident:${esc(id)}" ${id?'':'disabled'} aria-pressed="${selected}"><i aria-hidden="true">${icon('flame',15)}</i><span><strong>${esc(label)}</strong><small>${esc(operatorText(location))}</small></span>${vigiaStateLabel(status,{compact:true})}</button></li>`;}).join('')}</ol>`;
}

function healthItem(label,state,iconName,axis){
  const stateLabel=operatorText(state);
  return `<article class="health-item"${axis?` data-health-axis="${esc(axis)}"`:''}><i aria-hidden="true">${icon(iconName,18)}</i><span><strong>${esc(label)}</strong>${vigiaStateLabel(state,{label:stateLabel,compact:true})}</span></article>`;
}

function operationalPeriodStrip(portfolio){
  const period=portfolio?.current;if(!period)return`<section class="eoc-period-strip panel-surface" data-vqa="command.operational-period"><span><small>Operational period</small><strong>Not started</strong></span><span><small>Software readiness</small><strong>Roles, objectives, handoff and after-action available</strong></span><span><small>External readiness</small><strong>Named authority and live exercise still required</strong></span></section>`;
  const openDecisions=rows(period.decisions).filter(item=>!['CLOSED','COMPLETED'].includes(item.state)).length,openActions=rows(period.actions).filter(item=>!['CLOSED','COMPLETED'].includes(item.state)).length;
  return`<section class="eoc-period-strip panel-surface" data-vqa="command.operational-period"><span><small>Current operational period</small><strong>${esc(period.shift)} · ${esc(period.commander)}</strong></span><span><small>Incident owners</small><strong>${rows(period.incidentOwners).length}</strong></span><span><small>Critical work</small><strong>${openDecisions} decisions · ${openActions} actions</strong></span><span><small>Source degradations</small><strong>${rows(period.sourceDegradations).length}</strong></span><span><small>Handoff</small><strong>${esc(operatorText(period.handoff?.state))}</strong></span></section>`;
}

export function renderCommandOverview(state){
  const source=envelope(state,'commandOverview'),presentation=value(source,'commandPresentation'),incidents=canonicalIncidents(source),mapScene=value(source,'mapScene'),healthAxes=value(source,'healthAxes')??{},operationalPeriod=value(source,'operationalPeriod')??{},crisisAutopilot=value(source,'crisisAutopilot');
  const selected=incidents.find(item=>incidentId(item)===String(state.selectedIncidentId??''))??incidents[0]??null,selectedId=incidentId(selected),priority=(rows(presentation?.priorityIncidents).length?rows(presentation.priorityIncidents):incidents).slice().sort((a,b)=>Number(b?.priorityScore??b?.operationalTruth?.priority?.score??0)-Number(a?.priorityScore??a?.operationalTruth?.priority?.score??0)),detailSource=incidentEnvelope(state,'detail'),detail=value(detailSource,'canonicalIncident'),detailWork=rows(value(detailSource,'governedWork'));
  const telemetry=presentation?.telemetry??{},backendMetrics=presentation?.metrics??{},changes=rows(presentation?.activity),metricValue=(key,fallback)=>number(backendMetrics?.[key]?.value??fallback),metricMeta=(key,fallback)=>operatorText(backendMetrics?.[key]?.definition,{missing:fallback});
  const metrics=[
    [backendMetrics.activeIncidents?.label??'Verified current',metricValue('activeIncidents',telemetry.activeIncidents),metricMeta('activeIncidents','Only verified, current incidents count as active'),'flame','critical','command.metric.active'],
    [backendMetrics.detectionCandidates?.label??'Detection candidates',metricValue('detectionCandidates',null),metricMeta('detectionCandidates','Current detections completing corroboration'),'detect','info','command.metric.candidates'],
    [backendMetrics.needsRevalidation?.label??'Needs revalidation',metricValue('needsRevalidation',null),metricMeta('needsRevalidation','Stale records under automated revalidation'),'sync','warning','command.metric.revalidation'],
    [backendMetrics.needsAttention?.label??'Needs attention',metricValue('needsAttention',null),metricMeta('needsAttention','Operator authority or escalation required'),'warning','warning','command.metric.attention']
  ];
  const mapRuntime=state.runtime?.mapObservability??{},mapScenes=Object.values(mapRuntime.scenes??{}),tileFailures=Number(mapRuntime.tileFailures??0),overlayFailures=Number(mapRuntime.overlayFailures??0),mapHealthState=tileFailures?'CRITICAL':overlayFailures||mapScenes.some(item=>item?.state==='DEGRADED_PARTIAL')?'DEGRADED':mapScenes.some(item=>item?.state==='LIVE')?'OPERATIONAL':healthAxes.mapTransportHealth?.state??'NOT_MEASURED',health=[
    ['Platform',healthAxes.platformHealth?.state??section(source,'serviceStatus').state,'sync','platform'],
    ['Map transport',mapHealthState,'map','map'],
    ['Source availability',healthAxes.sourceAvailabilityHealth?.state??section(source,'sourceHealth').state,'health','sources'],
    ['Data freshness',healthAxes.dataFreshnessHealth?.state??'NOT_MEASURED','clock','freshness'],
    ['Verification coverage',healthAxes.verificationCoverageHealth?.state??'NOT_MEASURED','proof','verification'],
    ['Operator workload',healthAxes.operatorWorkloadHealth?.state??section(source,'governedWork').state,'settings','workload']
  ];
  const body=`<section class="overview-metrics" data-vqa="command.metrics" aria-label="Command metrics">${metrics.map(args=>metric(...args)).join('')}</section>
    ${operationalPeriodStrip(operationalPeriod)}
    ${crisisAutopilotCommand(crisisAutopilot,{incidentId:selectedId,projectionAt:source?.generatedAt})}
    <div class="overview-primary">
      <section class="situation-map panel-surface" data-vqa="command.map"><header><div><h2>Situation Map</h2><p>Canonical regional incident universe</p></div><span data-map-health>${esc(operatorText(mapScene?.currentness?.state??section(source,'mapScene').state))}</span></header><div class="situation-map__canvas">${canonicalMap({state,incidents,selected,zoom:7,thermal:true,label:'Command overview situation map',commandProjection:presentation,mapScene,scope:'COMMAND',vqa:'command.map-canvas'})}</div></section>
      <aside class="priority-rail ${state.quicklookRoute==='command-overview'?'priority-rail--quicklook':''}" data-vqa="command.priority">${state.quicklookRoute==='command-overview'?incidentQuicklook({incident:selected,detail,work:detailWork,scene:mapScene,route:'command-overview'}):`<section class="panel-surface"><header><div><h2>Priority Items</h2><p>Operating order and immediate attention</p></div><a href="#/incidents" data-route="incidents">View all</a></header>${priorityItems(priority,selectedId)}<footer class="priority-rail__summary"><span><strong>${changes.length}</strong><small>Material changes</small></span><span><strong>${metricValue('needsAttention',null)}</strong><small>Need attention</small></span></footer></section>`}</aside>
    </div>
    <section class="system-health panel-surface" data-vqa="command.health"><header><h2>Operational health</h2><p>Platform, transport, source, freshness, verification, and workload are measured separately</p></header><div>${health.map(args=>healthItem(...args)).join('')}</div></section>`;
  return shell('command-overview',body,{pageClass:'final-white-route'});
}
