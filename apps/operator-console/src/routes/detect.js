import { shell, badge, button, esc } from '../components.js?v=2.1.0';
import { tileMap } from '../map.js?v=2.1.0';
import { portugalEvents, selectedEventSummary, selectedEventDetail, eventTone, eventStatus, ageLabel, physicalEvidenceGroups, formatMw, formatCoordinate } from '../viewModel.js?v=2.1.0';
import { formatMeasuredNumber } from '../truth.js?v=2.1.0';
import { detectIntelligence, incidentIntelligence } from '../intelligenceView.js?v=2.1.0';

const measured=value=>formatMeasuredNumber(value,{missing:'Unmeasured',fractionDigits:0});
const familyCount=event=>measured(event?.physicalSourceProfile?.familyCount??event?.physicalSourceProfile?.families?.length);

function filtered(state){
  const rows=portugalEvents(state);
  if(state.detectFilter==='new')return rows.filter(e=>e.physicalState?.freshness==='current'||e.reportState?.sourceActivity==='current');
  if(state.detectFilter==='review')return rows.filter(e=>e.actionNeed?.needsRouting);
  return rows;
}

function eventDrawer(state){
  const rows=filtered(state);
  const all=portugalEvents(state);
  const current=all.filter(e=>e.physicalState?.freshness==='current'||e.reportState?.sourceActivity==='current').length;
  const review=all.filter(e=>e.actionNeed?.needsRouting).length;
  return `<div class="detect-drawer-layer ${state.detectQueueOpen?'is-open':''}" aria-hidden="${state.detectQueueOpen?'false':'true'}" ${state.detectQueueOpen?'':'inert'}>
    <button class="detect-drawer-scrim" data-action="toggle-detect-queue" aria-label="Close event queue" tabindex="-1"></button>
    <aside class="detect-drawer panel" role="dialog" aria-modal="true" aria-labelledby="detect-drawer-title">
      <header class="detect-drawer__header">
        <div><span class="eyebrow">Portugal events</span><h2 id="detect-drawer-title">${all.length} canonical events</h2></div>
        <button class="icon-button" data-action="toggle-detect-queue" aria-label="Close event queue">×</button>
      </header>
      <div class="detect-drawer__metrics"><span><strong>${current}</strong> current</span><span><strong>${review}</strong> review</span></div>
      <div class="segmented">
        <button class="${state.detectFilter==='all'?'is-active':''}" data-action="detection-filter:all">All</button>
        <button class="${state.detectFilter==='new'?'is-active':''}" data-action="detection-filter:new">Current</button>
        <button class="${state.detectFilter==='review'?'is-active':''}" data-action="detection-filter:review">Review</button>
      </div>
      <div class="detection-list detection-list--drawer" data-scroll-key="detect-queue">
        ${rows.length?rows.map((e,i)=>`<button class="detection-row detection-row--drawer ${String(state.selectedEventId)===String(e.id)?'is-active':''}" data-action="select-event:${esc(e.id)}">
          <span class="detection-row__index">${String(i+1).padStart(2,'0')}</span>
          <span><strong>${esc(e.label??e.id)}</strong><small>${esc(ageLabel(e.lastSeenAt))} · ${esc(familyCount(e))} families</small></span>
          ${badge(eventStatus(e),eventTone(e),true)}
        </button>`).join(''):`<div class="empty-state"><strong>No Portugal events</strong><p>No canonical event is present in the retained window.</p></div>`}
      </div>
    </aside>
  </div>`;
}

function tabs(state){
  return `<div class="workspace-tabs" role="tablist">
    <button class="${state.detectView==='map'?'is-active':''}" data-action="detect-view:map">Map</button>
    <button class="${state.detectView==='detail'?'is-active':''}" data-action="detect-view:detail">Detail</button>
    <button class="${state.detectView==='replay'?'is-active':''}" data-action="detect-view:replay">Timeline</button>
  </div>`;
}

function headerActions(state){
  const count=portugalEvents(state).length;
  return `<div class="detect-header-actions">
    ${button(`Events ${count}`,{tone:state.detectQueueOpen?'primary':'secondary',iconName:'menu',action:'toggle-detect-queue'})}
    ${button('Refresh',{tone:'ghost',iconName:'sync',action:'refresh-runtime'})}
  </div>`;
}

function commonMap(state,event,{thermal=true,zoom=9}={}){
  const all=portugalEvents(state);
  return tileMap({
    coordinate:event?.coordinate??[-8,39.6],
    zoom,
    thermal:thermal&&state.runtime?.status==='ready',
    markers:all.slice(0,25).map(e=>({coordinate:e.coordinate,label:e.label??e.id,tone:String(e.id)===String(event?.id)?'critical':eventTone(e),action:`select-event:${e.id}`})),
    label:`Real satellite context for ${event?.label??'Portugal'}`,
    enabled:state.runtime?.session?.authenticated===true
  });
}

function selectedDecisionDock(state,event){
  const projection=incidentIntelligence(state,event?.id),unknown=projection?.unknowns?.find(item=>item.classification==='DECISION_BLOCKING'),candidate=projection?.nextBestEvidence?.candidates?.[0],trace=projection?.explanationTrace??{},support=trace.supportingEvidence?.length??0,contradictions=trace.contradictoryEvidence?.length??0,stale=trace.excludedEvidence?.length??0;
  const situation=projection?.situation?.operatorStatement??eventStatus(event),next=candidate?.candidateEvidenceType?.replaceAll('_',' ')??projection?.nextBestEvidence?.state?.replaceAll('_',' ')??'No eligible evidence path';
  return `<section class="selected-event-dock selected-event-dock--decision" aria-label="Selected incident decision summary" data-operator-answer="selected-incident">
    <header><div><span class="eyebrow">Selected incident</span><strong>${esc(event.label??event.id)}</strong><small class="incident-identity">Event ${esc(event.id)}</small></div>${button('Open detail',{tone:'primary',action:'detect-view:detail'})}</header>
    <p data-operator-answer="situation">${esc(situation)}</p>
    <div class="selected-event-dock__facts"><span data-operator-answer="support"><small>Supports</small><strong>${support}</strong></span><span data-operator-answer="contradictions"><small>Contradicts</small><strong>${contradictions}</strong></span><span data-operator-answer="stale"><small>Stale / excluded</small><strong>${stale}</strong></span><span data-operator-answer="unknown"><small>Main unknown</small><strong>${esc(unknown?.whatIsUnknown??'None proven')}</strong></span><span data-operator-answer="next-evidence"><small>Review next</small><strong>${esc(next)}</strong></span></div>
  </section>`;
}

function mapView(state,event){
  const summary=state.runtime?.events?.summary??{};
  return `<section class="detect-workspace detect-workspace--map">
    <header class="workspace-header detect-workspace__header">
      <div><span class="eyebrow">Live physical map</span><h2>${esc(event?.label??'Portugal')}</h2>${event?.id?`<small class="incident-identity">Event ${esc(event.id)}</small>`:''}</div>
      ${tabs(state)}
      ${headerActions(state)}
    </header>
    <div class="detect-map-wrap detect-map-wrap--focus">
      ${event?commonMap(state,event,{thermal:true,zoom:9}):`<div class="map-loading-state"><div><strong>No canonical Portugal event selected</strong><span>VIGIA will not substitute fixture fires.</span></div></div>`}
      ${event?selectedDecisionDock(state,event):''}
    </div>
    <div class="detect-stat-strip detect-stat-strip--quiet">
      <article><span>Current physical</span><strong>${measured(summary.activeCurrentPhysicalEvents??summary.currentPhysicalEvents)}</strong></article>
      <article><span>Physical candidates</span><strong>${measured(summary.currentPhysicalCandidates)}</strong></article>
      <article><span>Multisource</span><strong>${measured(summary.currentMultisourcePhysicalEvents??summary.multisourceEvents)}</strong></article>
      <article><span>Selected coordinate</span><strong>${event?esc(formatCoordinate(event.coordinate)):'—'}</strong></article>
    </div>
    ${eventDrawer(state)}
  </section>`;
}

function detailTabs(state){
  const active=['now','next','why'].includes(state.detectDetailTab)?state.detectDetailTab:'now';
  return `<div class="detail-tab-row" role="tablist" aria-label="Incident decision context">
    <button class="${active==='now'?'is-active':''}" data-action="detect-detail-tab:now">Now</button>
    <button class="${active==='next'?'is-active':''}" data-action="detect-detail-tab:next">Next</button>
    <button class="${active==='why'?'is-active':''}" data-action="detect-detail-tab:why">Why</button>
  </div>`;
}

function nextObservation(event){
  const value=event.evidenceNeed?.nextObservationAt??event.observationPlan?.nextObservationAt??null;
  if(!value)return 'No scheduled observation returned';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString();
}

function detailInspector(state,event,groups){
  const active=['now','next','why'].includes(state.detectDetailTab)?state.detectDetailTab:'now';
  const intelligence=detectIntelligence(state,event,active);if(intelligence)return `<aside class="detail-inspector panel">${detailTabs(state)}<div class="detail-inspector__body">${intelligence}</div></aside>`;
  const families=event.physicalSourceProfile?.familyCount??groups.length;
  const thermal=event.thermal??{};
  const association=event.association??{};
  const candidate=event.candidateAssessment??{};
  const action=event.actionNeed?.kind?.replaceAll('_',' ')??'No routed action';
  const gap=event.evidenceNeed?.missingQuantity?.replaceAll('_',' ')??'No routed evidence gap';
  let body='';
  if(active==='now')body=`<div class="detail-inspector__hero"><span>Current state</span><strong>${esc(event.physicalOperationalState??event.knowledgeState??eventStatus(event))}</strong><p>${esc(event.actionNeed?.reason??'Current canonical event state shown without synthetic confidence.')}</p></div><div class="detail-inspector__facts"><div><span>Evidence</span><strong>${esc(event.evidenceState??'Unknown')}</strong></div><div><span>Report</span><strong>${esc(event.reportState?.sourceActivity??'No report')}</strong></div><div><span>Families</span><strong>${esc(families)}</strong></div><div><span>Latest FRP</span><strong>${esc(formatMw(thermal.latestMw))}</strong></div></div>`;
  if(active==='next')body=`<div class="detail-inspector__hero detail-inspector__hero--action"><span>Next governed action</span><strong>${esc(action)}</strong><p>${esc(event.actionNeed?.reason??'No additional operator action is currently routed.')}</p></div><div class="detail-inspector__facts"><div><span>Evidence gap</span><strong>${esc(gap)}</strong></div><div><span>Routing</span><strong>${event.actionNeed?.needsRouting?'Required':'Not routed'}</strong></div><div class="is-wide"><span>Next observation</span><strong>${esc(nextObservation(event))}</strong></div></div>`;
  if(active==='why')body=`<div class="detail-inspector__hero"><span>Why this state</span><strong>${esc(candidate.grade??association.grade??event.evidenceState??'Uncalibrated')}</strong><p>${esc(candidate.conclusion??'VIGIA keeps physical observations, public reports and association strength separate.')}</p></div><div class="detail-inspector__facts"><div><span>Association</span><strong>${esc(association.state??'Unmeasured')}</strong></div><div><span>Grade</span><strong>${esc(association.grade??candidate.grade??'Unmeasured')}</strong></div></div><div class="detail-source-list"><span class="eyebrow">Physical sources</span>${groups.length?groups.slice(0,5).map(g=>`<div><strong>${esc(g.label)}</strong><small>${g.rows.length} obs · ${esc(ageLabel(g.latest?.at??g.latest?.observedAt))}</small></div>`).join(''):'<p>No physical observation detail returned.</p>'}</div>${button('Open evidence',{tone:'secondary',iconName:'evidence',action:'auto:open-evidence'})}`;
  return `<aside class="detail-inspector panel">${detailTabs(state)}<div class="detail-inspector__body">${body}</div></aside>`;
}

function detailView(state,event){
  if(!event)return mapView(state,event);
  const groups=physicalEvidenceGroups(event), families=event.physicalSourceProfile?.familyCount??groups.length, thermal=event.thermal??{}, association=event.association??{};
  return `<section class="detect-workspace detect-workspace--detail">
    <header class="workspace-header detect-workspace__header"><div><span class="eyebrow">Incident detail · canonical</span><h2>${esc(event.label??event.id)}</h2><small class="incident-identity">Event ${esc(event.id)}</small></div>${tabs(state)}${headerActions(state)}</header>
    <div class="detail-layout detail-layout--focused"><div class="detail-map">${commonMap(state,event,{thermal:true,zoom:10})}</div>${detailInspector(state,event,groups)}</div>
    <div class="detect-detail-strip"><article><span>Evidence</span><strong>${esc(event.evidenceState??'Unknown')}</strong></article><article><span>Physical families</span><strong>${esc(families)}</strong></article><article><span>Latest FRP</span><strong>${esc(formatMw(thermal.latestMw))}</strong></article><article><span>Association</span><strong>${esc(association.state??'Unmeasured')}</strong></article></div>
    ${eventDrawer(state)}
  </section>`;
}

function timelineView(state,event){
  if(!event)return mapView(state,event);
  const timeline=(event.timeline?.length?event.timeline:event.observations??[]).slice(-24);
  return `<section class="detect-workspace detect-workspace--replay"><header class="workspace-header detect-workspace__header"><div><span class="eyebrow">Event timeline</span><h2>${esc(event.label??event.id)}</h2><small class="incident-identity">Event ${esc(event.id)}</small></div>${tabs(state)}${headerActions(state)}</header><div class="replay-layout"><aside class="replay-summary panel"><div><span>First seen</span><strong>${esc(ageLabel(event.firstSeenAt))}</strong></div><div><span>Last seen</span><strong>${esc(ageLabel(event.lastSeenAt))}</strong></div><div><span>Observations</span><strong>${esc(event.observationInventory?.total??event.observations?.length??'—')}</strong></div></aside><div class="replay-map">${commonMap(state,event,{thermal:true,zoom:9})}</div><aside class="replay-events panel"><span class="eyebrow">Attributable event steps</span>${timeline.length?timeline.map(item=>`<button data-action="map-marker-info" aria-label="${esc(item.source??item.type??'event')}"><time>${esc(new Date(item.at??item.observedAt??event.lastSeenAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time><span><strong>${esc(item.source??item.instrument??item.type??'Observation')}</strong><small>${esc(item.sourceFamily??item.state??'')}</small></span></button>`).join(''):'<p>No detailed timeline returned.</p>'}</aside></div>${eventDrawer(state)}</section>`;
}

export function renderDetect(state){
  const event=selectedEventDetail(state)??selectedEventSummary(state);
  const content=state.detectView==='detail'?detailView(state,event):state.detectView==='replay'?timelineView(state,event):mapView(state,event);
  return shell('detect',content,{fullBleed:true});
}
