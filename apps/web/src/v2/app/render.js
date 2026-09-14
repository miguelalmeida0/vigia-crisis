import { queueItems, selectedItem } from './selectors.js';
import { renderQueue } from '../components/queue.js';
import { inspectorFor } from '../views/inspector.js';
import { commandFilters, commandIntro, commandSummary, commandWorkbench } from '../views/command.js';
import { observeFilters, observeIntro, observeSummary, renderObservation } from '../views/observe.js';
import { incidentFilters, incidentsIntro, incidentsSummary } from '../views/incidents.js';
import { fieldFilters, fieldSummary, fieldWorkbench } from '../views/field.js';
import { outcomeFilters, outcomesWorkbench } from '../views/outcomes.js';
import { consequenceSummary } from '../views/consequence.js';
import { liveFilters, liveIntro, liveSummary, renderLiveOverlay } from '../views/live.js';
import { replayFilters, replayIntro, replaySummary, renderReplayOverlay } from '../views/replay.js';
import { escapeHtml } from '../utils/html.js';
import { viewLabel, viewsForActor } from './role-policy.js';
import { ObservationStudio } from '../components/observation-studio.js';
import { systemProofSummary, systemProofWorkbench, validationFilters, validationSummary, validationWorkbench } from '../views/validation.js';
import { statusLabel } from '../utils/format.js';

const CONFIG = {
  live: { mission:'Operational Briefing',kicker: 'OVERVIEW · OPERATIONAL BRIEFING', title: 'Attention queue', filters: liveFilters },
  replay: { mission:'Governed historical system proof',kicker: 'SYSTEM PROOF · GOVERNED REPLAY', title: 'Verified Portugal 2024 evidence', filters: replayFilters },
  command: { mission:'Owned evidence closure',kicker: 'ACTION', title: 'Unknowns requiring owned work', filters: commandFilters },
  observe: { mission:'Pre-ignition avoidance intelligence',kicker: 'PREVENT · MEASUREMENT INTELLIGENCE', title: 'Pre-ignition physical change', filters: observeFilters },
  validation:{mission:'Evidence, performance and limitations',kicker:'EVIDENCE · SYSTEM PROOF',title:'What VIGIA can defend',filters:validationFilters},
  system:{mission:'Release and capability proof',kicker:'SYSTEM PROOF · RELEASE BOUNDARY',title:'What VIGIA can defend now',filters:validationFilters},
  incidents: { mission:'Live physical detection map',kicker: 'DETECT · LIVE PHYSICAL FIRES', title: 'Detection queue', filters: incidentFilters },
  consequence: { kicker: 'CONSEQUENCE', title: 'Potential consequences', filters: incidentFilters },
  field: { kicker: 'FIELD', title: 'Assigned work', filters: fieldFilters },
  outcomes: { kicker: 'OUTCOMES', title: 'Verified outcomes', filters: outcomeFilters }
};
const DEGRADED = Object.freeze({
  live:{title:'Operational persistence unavailable',detail:'VIGIA cannot resolve current territory quantities until the physical-truth database is reachable.',lanes:['PHYSICAL FIRES NOW','NEW PHYSICAL CANDIDATES','SOURCE COVERAGE']},
  incidents:{title:'Current detections unavailable',detail:'No event count is substituted while persisted physical observations cannot be read.',lanes:['FIRST PHYSICAL','LATEST PHYSICAL','REPORT STATE']},
  observe:{title:'Prevention evidence unavailable',detail:'No pre-ignition zone is inferred without the governed finding and measurement records.',lanes:['CONSENSUS STATE','MEASUREMENT REQUIRED','SOURCE PAIR']},
  validation:{title:'System proof unavailable',detail:'Benchmarks and provenance remain hidden until their governed artifacts can be resolved.',lanes:['DETECTION PERFORMANCE','TRUTH CONTRACT','ERROR EXPLORER']},
  system:{title:'Release proof unavailable',detail:'Runtime, release, benchmark, and persistence proof remain withheld until governed artifacts resolve.',lanes:['APPLICATION HEALTH','DATABASE HEALTH','RELEASE IDENTITY']},
  replay:{title:'Governed replay unavailable',detail:'Historical evidence is never substituted into the live workspace or replayed without its controlled clock.',lanes:['HISTORICAL · NOT LIVE','CONTROLLED CLOCK','PROVENANCE']}
});
function renderDegradedWorkspace(ui,state){
  if(!ui.queueKicker||!ui.queueTitle||!ui.queueSummary||!ui.queueList||!ui.filters||!ui.inspectorContent)return;
  const config=CONFIG[state.view]??CONFIG.live,degraded=DEGRADED[state.view]??DEGRADED.live,error=escapeHtml(state.loadError??'runtime_dependency_unavailable');
  ui.queueKicker.textContent=config.kicker;ui.queueTitle.textContent=config.title;ui.filters.innerHTML='';
  ui.queueSummary.innerHTML='<p class="summary-note"><strong>STATE UNKNOWN</strong><br>Current quantities are withheld.</p>';
  ui.queueList.innerHTML=`<section class="md-degraded-list" aria-label="Unavailable operational quantities">${degraded.lanes.map((lane)=>`<article><span>${escapeHtml(lane)}</span><strong>UNAVAILABLE</strong><small>Awaiting governed persistence</small></article>`).join('')}</section>`;
  ui.modeLabel.textContent='DEGRADED · NO SYNTHETIC FALLBACK';ui.sourceState.textContent='Persistence unavailable';
  ui.inspectorKicker.textContent='SYSTEM STATE';ui.inspectorContent.innerHTML=`<section class="inspector-section md-degraded-detail"><span class="section-label">FAIL-CLOSED</span><h2>${escapeHtml(degraded.title)}</h2><p>${escapeHtml(degraded.detail)}</p><dl><div><dt>Operational state</dt><dd>Unavailable, not zero</dd></div><div><dt>Live evidence</dt><dd>Not rendered</dd></div><div><dt>Historical substitution</dt><dd>Prohibited</dd></div></dl><small>${error}</small></section>`;ui.inspectorActions.innerHTML='<button type="button" data-action="refresh">Retry governed runtime</button>';
}
function sourceLabel(sources) {
  const viirs=sources?.firms?.state??'not_configured',sentinel3=sources?.sentinel3Pixels?.state??'not_configured';
  const label=(value)=>value==='current'?'CURRENT':value==='stale'?'DELAYED':value==='empty'?'NO POSITIVE FRP':'UNAVAILABLE';
  return `VIIRS ${label(viirs)} · SLSTR ${label(sentinel3)}`;
}
function summary(state) {
  if (state.view === 'live') return liveSummary(state);
  if(state.view==='validation')return validationSummary(state);
  if(state.view==='system')return systemProofSummary(state);
  if (state.view === 'replay') return replaySummary(state);
  if (state.view === 'command') return commandSummary(state); if (state.view === 'observe') return observeSummary(state);
  if (state.view === 'incidents') return incidentsSummary(state); if (state.view === 'consequence') return consequenceSummary(state);
  if (state.view === 'field') return fieldSummary(state); return '<p class="summary-note">Closed before/action/after proof loops.</p>';
}
function intro(state) { if (state.view === 'live') return liveIntro(state); if (state.view === 'replay') return replayIntro(state); if (state.view === 'command') return commandIntro(state); if (state.view === 'observe') return observeIntro(); if (state.view === 'incidents') return incidentsIntro(state); return ''; }
function content(state) { if (state.view === 'validation') return validationWorkbench(state); if(state.view==='system')return systemProofWorkbench(state); if (state.view === 'command') return commandWorkbench(state); if (state.view === 'field') return fieldWorkbench(state); if (state.view === 'outcomes') return outcomesWorkbench(state); return ''; }
function legend(view) {
  const entries = view === 'live' ? [['#ffdc72','#ffdc72','Physical-first candidate'],['#ef6a44','#ef6a44','Two-family / multisource fire'],['#e7ba53','rgba(220,168,62,.13)','Pre-ignition finding'],['#ff4430','transparent','Report only'],['#7a655d','transparent','Stale']]
    : view === 'replay' ? [['#ffdc72','#ffdc72','Physical-first case'],['#eee7d6','transparent','Report-first case'],['#ff8d52','#ff8d52','Visible VIIRS point'],['#dca83e','rgba(220,168,62,.15)','Thermal support envelope']]
    : view === 'observe' || view === 'command' ? [['#dca83e','transparent','Inspection priority'],['#ef6a44','#eee7d6','Verified hazard'],['#ff4430','transparent','Reported incident']]
    : view === 'incidents' || view === 'consequence' ? [['#ff4430','transparent','Reported event'],['#ef6a44','#ef6a44','Multisource event'],['#ffdc72','#ffdc72','Satellite-only candidate'],['#7a655d','transparent','Stale / unknown']]
      : [['#59c7c5','#59c7c5','Mapped asset'],['#ef6a44','rgba(239,106,68,.15)','Scenario envelope']];
  return entries.map(([color, fill, label]) => `<span class="legend-item"><i style="--c:${color};--f:${fill}"></i>${label}</span>`).join('');
}
function visibleEventIds(container){
  const width=globalThis.innerWidth??Number.MAX_SAFE_INTEGER,height=globalThis.innerHeight??Number.MAX_SAFE_INTEGER;
  return[...container.querySelectorAll('[data-select-kind="event"][data-select-id]')].filter((element)=>{const rect=element.getBoundingClientRect();return element.getClientRects().length>0&&rect.bottom>0&&rect.right>0&&rect.top<height&&rect.left<width;}).map((element)=>element.dataset.selectId);
}
export function createRenderer({ ui, map, onEventsVisible = null }) {
  let studio = null; let studioKey = null; let paintGeneration=0;
  return function render(state) {
    const generation=++paintGeneration;
    if (state.view !== 'observe') {
      if (studio) studio.destroy?.();
      studio = null; studioKey = null;
      if (ui.observation.childElementCount) ui.observation.replaceChildren();
    }
    const startupFailed = !state.loading && !state.bootstrap && Boolean(state.loadError);
    ui.root.dataset.view = state.view; ui.root.dataset.selectedKind = state.selected?.kind ?? ''; ui.root.dataset.selectedId = state.selected?.id ?? ''; ui.root.dataset.ready = String(Boolean(state.bootstrap) && !state.loading); ui.root.dataset.startupState = state.loading ? 'loading' : startupFailed ? 'failed' : 'ready'; ui.root.dataset.physicalLoading=String(state.physicalLoading===true); ui.root.dataset.analysisMode = String(state.analysisMode === true && state.selected?.kind === 'event'); ui.root.dataset.operationsState=state.operationsState??'loading'; ui.root.dataset.validationState=state.validationState??'idle';
    ui.loading.setAttribute('aria-busy', String(state.loading)); ui.loading.setAttribute('aria-hidden', String(Boolean(state.bootstrap) && !state.loading)); ui.loading.setAttribute('role', startupFailed ? 'alert' : 'status');
    const loadingMode = startupFailed ? 'failed' : 'loading';
    if (ui.loading.dataset.mode !== loadingMode) { ui.loading.dataset.mode = loadingMode; ui.loading.classList.toggle('is-failed', startupFailed); ui.loading.innerHTML = startupFailed ? `<span aria-hidden="true">!</span><h2>Territory state unavailable</h2><p>${escapeHtml(state.loadError)}</p><button type="button" data-action="refresh">Retry connection</button>` : '<span aria-hidden="true"></span><p>Resolving the territory state</p>'; }
    const navView = state.view === 'consequence' ? 'incidents' : state.view;
    for (const button of ui.viewButtons) button.classList.toggle('is-active', button.dataset.viewButton === navView);
    if (!state.bootstrap){if(startupFailed)renderDegradedWorkspace(ui,state);return;}
    const config = CONFIG[state.view];
    const missionTitle=ui.root.querySelector('[data-mission-title]');if(missionTitle)missionTitle.textContent=config?.mission??'Wildfire physical intelligence';
    const liveThermal = state.live?.thermal?.selected;
    const mtgClock = state.live?.clocks?.mtg;
    ui.sourceState.textContent = state.view === 'live' && state.live?.state === 'unavailable'
      ? 'Live state unavailable'
      : state.view === 'replay' && state.replay?.state === 'unavailable'
        ? 'Replay unavailable'
        : state.view === 'replay'
          ? `${state.replay?.sources?.length ?? 0} verified archive products · controlled clock`
          : sourceLabel(state.live?.sources ?? state.bootstrap.sources);
    const sourceButton=ui.sourceState.closest?.('button');
    if(sourceButton){const values=Object.values(state.live?.sources??state.bootstrap.sources??{}).map((item)=>item?.state);sourceButton.dataset.health=state.live?.state==='unavailable'?'unavailable':values.some((value)=>['unavailable','failed','error'].includes(value))?'degraded':values.some((value)=>value==='stale')?'delayed':'current';}
    const authenticated = state.bootstrap.actor?.authentication?.authenticated === true;
    ui.modeLabel.textContent = `PRODUCTION · ${authenticated?'AUTHENTICATED ACTION':'READ-ONLY'} · SYNTHETIC OBSERVATIONS REJECTED`;
    const activeActor = state.bootstrap.actor;
    const baseViews = viewsForActor(activeActor);
    const orderedViews = baseViews; const visibleViews = new Set(orderedViews);
    for (const button of ui.viewButtons) {
      const view = button.dataset.viewButton; const visible = visibleViews.has(view); const order = orderedViews.indexOf(view),fixedMissionNav=Boolean(button.closest('.md-rail,.gt-mobile-nav'));
      button.hidden = !visible; button.style.order = fixedMissionNav?'':visible ? String(order) : '';
      const labelNode = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (labelNode) labelNode.textContent = ` ${viewLabel(view)}`;
      const numberNode = button.querySelector('span');
      if (numberNode && visible && !fixedMissionNav) numberNode.textContent = String(order + 1).padStart(2,'0');
    }
    ui.actorCaption.textContent = authenticated ? (state.bootstrap.actor?.title??'Operator') : 'Session identity';
    ui.actorCaption.title = authenticated ? `${state.bootstrap.actor?.name??'Signed-in operator'} · ${state.bootstrap.actor?.title??'Operator'} · ${statusLabel(state.bootstrap.actor?.role??'operator')}` : 'Session identity';
    ui.actorStatic.textContent = state.bootstrap.actor?.name ?? 'Public read-only';
    ui.actorStatic.dataset.action = authenticated ? 'signout' : 'authenticate';
    ui.actorStatic.title = authenticated ? 'Sign out' : 'Authenticate for Action';
    if(ui.commandIdentity){
      ui.commandIdentity.hidden=state.view!=='live';
      ui.commandIdentity.dataset.action=authenticated?'signout':'authenticate';
      ui.commandIdentity.title=authenticated?'Sign out':'Authenticate for Action';
      ui.commandIdentity.setAttribute('aria-label',authenticated?`Sign out ${activeActor.name}`:'Authenticate for Action');
      ui.commandIdentity.innerHTML=authenticated?`<strong>${escapeHtml(activeActor.name)}</strong><small>${escapeHtml(activeActor.title)} · ${escapeHtml(statusLabel(activeActor.role))}</small>`:'<strong>Read-only viewer</strong><small>Unauthenticated session</small>';
    }
    if(ui.workCount)ui.workCount.textContent=String((state.bootstrap.operations?.evidenceNeeds??[]).filter((item)=>item.state!=='RESOLVED').length);
    if(ui.alertCount){const unresolved=(state.persistentAlerts??[]).filter((item)=>!['RESOLVED','SUPPRESSED'].includes(item.lifecycleState)).length;ui.alertCount.textContent=state.operationsState==='unavailable'?'—':String(unresolved);ui.alertCount.closest('button')?.classList.toggle('is-unavailable',state.operationsState==='unavailable');}
    ui.queueKicker.textContent = config.kicker; ui.queueTitle.textContent = config.title; ui.queueSummary.innerHTML = summary(state);
    ui.filters.innerHTML = config.filters.map(([id,label]) => `<button type="button" class="${state.filter === id ? 'is-active' : ''}" data-filter="${id}">${escapeHtml(label)}</button>`).join('');
    const queuedItems = queueItems(state),allItems=state.view==='live'?queuedItems.filter((item)=>item.queueKind==='finding'?Number(item.reviewSummary?.count??0)===0:item.physicalState?.freshness==='current'||item.physicalState?.freshness==='delayed'||item.reportState?.sourceActivity==='current'):queuedItems,items=state.view==='live'&&state.commandExpanded!==true?allItems.slice(0,4):allItems; ui.queueList.innerHTML = renderQueue(items, state.selected,{command:state.view==='live'})+(state.view==='live'&&allItems.length>items.length?`<button type="button" class="attention-more" data-action="expand-attention">View all (${allItems.length})</button>`:'');
    if (ui.search.value !== state.query) ui.search.value = state.query;
    ui.stageIntro.hidden = !['live','replay','incidents'].includes(state.view); ui.stageIntro.innerHTML = intro(state);
    ui.liveOverlay.hidden = !['live','replay','incidents'].includes(state.view); if (state.view === 'live' || (state.view==='incidents'&&state.selected?.kind!=='replay')) ui.liveOverlay.innerHTML = renderLiveOverlay(state); else if (state.view === 'replay' || (state.view==='incidents'&&state.selected?.kind==='replay')) ui.liveOverlay.innerHTML = renderReplayOverlay(state); else ui.liveOverlay.innerHTML='';
    ui.observation.hidden = state.view !== 'observe'; ui.content.hidden = !['validation','system','command','field','outcomes'].includes(state.view);
    if (state.view === 'observe') {
      const item = selectedItem(state); const primary = state.observation?.primary?.id ?? 'none'; const comparable = state.observation?.comparable?.id ?? 'none';
      const nextStudioKey = `${state.selected?.id ?? 'none'}:${state.observationLoading ? 'loading' : `${primary}:${comparable}`}`;
      if (nextStudioKey !== studioKey) {
        studio?.destroy?.(); studio = null; studioKey = nextStudioKey;
        ui.observation.innerHTML = renderObservation(state, item);
        if (!state.observationLoading && state.observation?.primary) requestAnimationFrame(() => { if (studioKey === nextStudioKey) studio = new ObservationStudio(ui.observation); });
      }
    }
    if (['validation','system','command','field','outcomes'].includes(state.view)) ui.content.innerHTML = content(state);
    ui.map.hidden = ['observe','validation','system','command','field','outcomes'].includes(state.view); ui.mapControls.hidden = ui.map.hidden; ui.mapLegend.hidden = ui.map.hidden; ui.mapLegend.innerHTML = legend(state.view);
    const inspector = inspectorFor(state, selectedItem(state)); ui.inspectorKicker.textContent = inspector.kicker; ui.inspectorContent.innerHTML = inspector.content; ui.inspectorActions.innerHTML = inspector.actions;
    map.update(state);
    if(onEventsVisible&&state.live?.events?.length){
      const frame=globalThis.requestAnimationFrame??((callback)=>setTimeout(callback,0));
      frame(()=>frame(()=>{
        if(generation!==paintGeneration)return;
        const ids=new Set(visibleEventIds(ui.queueList)),events=state.live.events.filter((event)=>ids.has(String(event.id))&&event.prospectiveDetectionTiming?.traceId&&!event.prospectiveDetectionTiming?.uiFirstSeenAt);
        if(events.length)onEventsVisible(events);
      }));
    }
  };
}
