import { Api } from '../api.js';
import { createStore } from '../store.js';
import { collectRefs } from '../components/refs.js';
import { createToasts } from '../components/toasts.js';
import { createModal } from '../components/modal.js';
import { createDrawer } from '../components/drawer.js';
import { GroundTruthMap } from '../map/controller.js';
import { createRenderer } from './render.js';
import { defaultSelection, selectedItem } from './selectors.js';
import { createModalWorkflows } from './modal-workflows.js';
import { createActionHandler } from './action-handler.js';
import { canOpenView, defaultViewForActor } from './role-policy.js';
import { loadFullBootstrap, loadOperationsWorkspace, loadReplayWorkspace, loadValidationWorkspace, loadWorkspace, preserveLazyValidationWorkspace } from './workspace-load.js';
import { replayEntryIndex } from './replay-navigation.js';
import { bindEvents, connectStream } from './event-bindings.js';
function firstSelectionForView(state, view) {
  if (view === 'live') return null;
  if (view === 'incidents') { const physical=state.live?.events?.find((item)=>item.physicalState?.freshness==='current'); if(physical)return{kind:'event',id:physical.id};const replayId=state.replay?.heroCaseId??state.replay?.cases?.find((item)=>item.physicalFirst)?.id;return replayId?{kind:'replay',id:replayId}:state.live?.events?.[0]?{kind:'event',id:state.live.events[0].id}:null; }
  if (view === 'replay') { const id=state.replay?.heroCaseId??state.replay?.cases?.[0]?.id;return id?{kind:'replay',id}:null; }
  if (view === 'observe') return state.bootstrap?.prevention?.findings?.[0] ? {kind:'finding',id:state.bootstrap.prevention.findings[0].findingId} : state.bootstrap?.prevention?.candidates?.[0] ? { kind:'prevention', id:state.bootstrap.prevention.candidates[0].id } : null;
  if (view === 'consequence') {
    const item = state.bootstrap?.detection?.incidents?.find((value) => ['corroborated','verified'].includes(value.truthStage) && value.freshness?.state !== 'stale');
    return item ? { kind:'incident', id:item.id } : null;
  }
  return defaultSelection({ ...state, view });
}

function selectionAllowed(view, selection) {
  const kind = selection?.kind;
  if (!kind) return false;
  if (view === 'live') return kind === 'event' || kind === 'finding';
  if (view === 'incidents') return kind === 'event' || kind === 'replay';
  if (view === 'replay') return kind === 'replay';
  if (view === 'observe') return kind === 'prevention' || kind === 'finding' || kind === 'hazard';
  if (view === 'consequence') return kind === 'incident';
  if (view === 'field' || view === 'outcomes') return kind === 'operation';
  if (view === 'command') return ['event','prevention','hazard','operation'].includes(kind);
  if (view === 'validation') return false;
  return false;
}

export function createGroundTruthApp(root) {
  const ui = collectRefs(root); const api = new Api(); const toasts = createToasts(ui.toasts); const modal = createModal(ui.modal, ui.modalCard); const drawer = createDrawer(ui);
  const store = createStore({ bootstrap: null, session:null, bootstrapProjection:null, fullBootstrapLoading:false, live: null, territory: null, replay: null, replayWorkspaceLoading:false, detectionBenchmark:null, validationLoading:false, validationState:'idle', validationError:null, validationUpdatedAt:null, replayCase: null, replayLoading: false, replayTimeIndex: 0, replayPlaying:false, replaySpeed:1, actorId: api.actorId, view: 'live', selected: null, query: '', filter: 'all', commandExpanded:false, loading: true, physicalLoading:false, loadError: null, loadFailures: {}, observation: null, observationLoading: false, consequence: null, consequenceLoading: false, exposure: null, exposureLoading: false, exposureStartedAt: null, changeScreenResult: null, timelineIndex: 1, liveTimeIndex: 0, liveThermalEnabled: false, analysisMode: false, persistentAlerts: [], operationsStatus:null, operationsMetrics:null, operationsNotifications:[], operationsState:'loading', operationsLoading:false, operationsCheckedAt:null, operationsError:null, incidentOperations:null, incidentOperationsError:null });
  let observationController = null; let observationGeneration = 0; const pendingUiTraces=new Set(); const acknowledgedUiTraces=new Set();
  const map = new GroundTruthMap(ui.map, { onSelect: (selection) => select(selection) }); const render = createRenderer({ ui, map, onEventsVisible:acknowledgeVisibleEvents }); store.subscribe(render);

  function acknowledgeVisibleEvents(events){
    for(const event of events){
      const traceId=event.prospectiveDetectionTiming?.traceId;if(!traceId||pendingUiTraces.has(traceId)||acknowledgedUiTraces.has(traceId))continue;pendingUiTraces.add(traceId);
      api.recordUiFirstSeen(event.id,{traceId,clientObservedAt:new Date().toISOString()}).then((ack)=>{pendingUiTraces.delete(traceId);acknowledgedUiTraces.add(traceId);store.set((state)=>({...state,live:{...state.live,events:(state.live?.events??[]).map((item)=>String(item.id)===String(event.id)?{...item,prospectiveDetectionTiming:{...item.prospectiveDetectionTiming,uiFirstSeenAt:ack.uiFirstSeenAt,uiAvailableAt:ack.uiFirstSeenAt,uiClientObservedAt:ack.uiClientObservedAt,uiFirstSeenSource:ack.source}}:item)}}));}).catch(()=>pendingUiTraces.delete(traceId));
    }
  }

  async function reload({ quiet = false, refreshObservation = false } = {}) {
    if (!quiet) store.set((state) => ({ ...state, loading: true, loadError: null }));
    try {
      const { bootstrap, session, live, territory, replay, detectionBenchmark, alerts, failures } = await loadWorkspace(api,{onShell:quiet?null:(shell)=>{
        globalThis.__VIGIA_SESSION__=shell.session;
        store.set((state)=>{
          const actor=shell.bootstrap.actor,view=canOpenView(actor,state.view)?state.view:defaultViewForActor(actor);
          const candidate={...state,bootstrap:shell.bootstrap,session:shell.session,bootstrapProjection:shell.bootstrap.meta?.projection??'full',live:shell.live,actorId:actor.id,view,filter:state.view===view?state.filter:(view==='field'?'open':'all'),loading:false,physicalLoading:true,loadError:null,loadFailures:shell.failures};
          const keepSelection=selectionAllowed(view,state.selected)&&selectedItem(candidate);
          return{...candidate,selected:keepSelection?state.selected:view==='live'?null:defaultSelection(candidate)};
        });
      }});
      store.set((state) => {
        globalThis.__VIGIA_SESSION__=session;
        const actor = bootstrap.actor;
        const view = canOpenView(actor, state.view) ? state.view : defaultViewForActor(actor);
        const candidate = { ...state, bootstrap, session, bootstrapProjection:bootstrap.meta?.projection??'full', live, territory, replay, detectionBenchmark:preserveLazyValidationWorkspace(state.detectionBenchmark,detectionBenchmark), persistentAlerts: alerts.alerts ?? [], actorId: actor.id, view, liveTimeIndex: Math.max(0, ((live.events?.find((event)=>String(event.id)===String(state.selected?.id))?.timeline?.length) ?? 1) - 1), filter: state.view === view ? state.filter : (view === 'field' ? 'open' : 'all'), loading: false, physicalLoading:false, loadError: null, loadFailures: failures };
        const keepSelection = selectionAllowed(view, state.selected) && selectedItem(candidate);
        return { ...candidate, selected: keepSelection ? state.selected : view==='live'?null:defaultSelection(candidate) };
      });
      const unavailable = Object.keys(failures);
      if (unavailable.length) toasts.show(`Loaded with unavailable service${unavailable.length === 1 ? '' : 's'}: ${unavailable.join(', ')}.`);
      let state = store.get();
      if (state.view === 'live' && state.selected?.kind === 'event') { const event = state.live?.events?.find((item)=>String(item.id)===String(state.selected.id)); if (event) { store.set((value)=>({ ...value, liveTimeIndex: Math.max(0,(event.timeline?.length??1)-1) })); state=store.get(); } }
      if ((state.view==='live'||state.view==='incidents')&&state.selected?.kind==='event') await hydrateLiveEvent(state.selected.id);
      if ((state.view === 'replay' || state.view==='incidents') && state.selected?.kind === 'replay') await loadReplayCase(state.selected.id, { resetClock: false });
      if (state.view === 'observe' && refreshObservation) await loadObservation(); if (state.view === 'consequence') await loadConsequence(state.selected?.id);
      void refreshOperationsWorkspace();
    } catch (error) { store.set((state) => ({ ...state, loading: false, loadError: state.bootstrap ? state.loadError : error.message, loadFailures: { ...state.loadFailures, bootstrap: error.message } })); toasts.show(`Load failed: ${error.message}`); }
  }

  async function refreshOperationsWorkspace({ force = false } = {}) {
    if (store.get().operationsLoading && !force) return;
    store.set((state)=>({...state,operationsLoading:true,operationsState:state.operationsStatus?'partially_available':'loading'}));
    try {
      const operations=await loadOperationsWorkspace(api,{includeNotifications:store.get().bootstrap?.actor?.authentication?.authenticated===true});
      store.set((state)=>({...state,...operations}));
    } catch (error) {
      store.set((state)=>({...state,operationsLoading:false,operationsState:'unavailable',operationsError:error.message,operationsCheckedAt:new Date().toISOString()}));
    }
  }

  async function ensureFullBootstrap(){
    const current=store.get();if(current.bootstrapProjection==='full')return current.bootstrap;if(current.fullBootstrapLoading)return null;
    store.set((state)=>({...state,fullBootstrapLoading:true}));
    try{const bootstrap=await loadFullBootstrap(api);store.set((state)=>({...state,bootstrap:{...bootstrap,operationsHandoff:state.bootstrap?.operationsHandoff??null},bootstrapProjection:'full',fullBootstrapLoading:false,actorId:bootstrap.actor.id}));return bootstrap;}
    catch(error){store.set((state)=>({...state,fullBootstrapLoading:false}));toasts.show(`Full operational workspace unavailable: ${error.message}`);return null;}
  }

  async function ensureReplayWorkspace(){
    if(store.get().replay?.state==='ready'||store.get().replayWorkspaceLoading)return;
    store.set((state)=>({...state,replayWorkspaceLoading:true}));
    try{const replay=await loadReplayWorkspace(api);store.set((state)=>({...state,replay,replayWorkspaceLoading:false}));if(store.get().view==='replay'&&!store.get().selected){const selected=firstSelectionForView(store.get(),'replay');store.set((state)=>({...state,selected}));if(selected)await loadReplayCase(selected.id);}}
    catch(error){store.set((state)=>({...state,replayWorkspaceLoading:false}));toasts.show(`Replay unavailable: ${error.message}`);}
  }

  async function ensureValidationWorkspace(){
    if(store.get().detectionBenchmark||store.get().validationLoading)return store.get().detectionBenchmark;
    store.set((state)=>({...state,validationLoading:true,validationState:'loading',validationError:null}));
    try{
      const detectionBenchmark=await loadValidationWorkspace(api);
      const artifactState=detectionBenchmark.availability?.state??'partially_available',validationError=Object.values(detectionBenchmark.availability?.failures??{})[0]??null;
      store.set((state)=>({...state,detectionBenchmark,validationLoading:false,validationState:artifactState,validationError,validationUpdatedAt:new Date().toISOString()}));
      return detectionBenchmark;
    }
    catch(error){
      const validationState=error?.status===404?'unavailable':'error';
      store.set((state)=>({...state,validationLoading:false,validationState,validationError:error.message,validationUpdatedAt:new Date().toISOString()}));
      toasts.show(`Validation benchmark unavailable: ${error.message}`);
      return null;
    }
  }

  async function hydrateView(view){
    if(view==='observe'){const loaded=await ensureFullBootstrap();if(!loaded||store.get().view!=='observe')return;if(!store.get().selected){store.set((state)=>({...state,selected:firstSelectionForView(state,'observe')}));}await loadObservation();}
    if(view==='validation'||view==='system'){
      const [full,benchmark]=await Promise.all([ensureFullBootstrap(),ensureValidationWorkspace()]);
      if(store.get().view===view)store.set((state)=>({...state,validationState:benchmark?(benchmark.availability?.state==='ready'&&full?'ready':'partially_available'):(state.validationState==='loading'?'unavailable':state.validationState)}));
    }
    if(view==='replay')await ensureReplayWorkspace();
  }

  async function loadReplayCase(id = store.get().selected?.id, { resetClock = true } = {}) {
    if (!id) return;
    store.set((state)=>({...state,replayLoading:true,replayCase:resetClock?null:state.replayCase}));
    try { const replayCase=await api.replayCase(id);store.set((state)=>({...state,replayCase,replayLoading:false,replayTimeIndex:replayEntryIndex(replayCase,state.view,state.replayTimeIndex,resetClock),replayPlaying:resetClock?false:state.replayPlaying})); }
    catch(error){store.set((state)=>({...state,replayLoading:false}));toasts.show(`Replay unavailable: ${error.message}`);}
  }

  async function hydrateLiveEvent(id=store.get().selected?.id){
    if(!id)return;const current=store.get().live?.events?.find((item)=>String(item.id)===String(id));
    const [detailResult,operationsResult]=await Promise.allSettled([current?.observationInventory?.truncated?api.event(id):Promise.resolve(null),api.operationsIncident(id)]);
    if(String(store.get().selected?.id)!==String(id))return;
    if(detailResult.status==='rejected')toasts.show(`Full event evidence unavailable: ${detailResult.reason.message}`);
    store.set((state)=>{const detail=detailResult.status==='fulfilled'?detailResult.value?.event:null;return{...state,live:detail?{...state.live,events:(state.live?.events??[]).map((item)=>String(item.id)===String(id)?detail:item)}:state.live,liveTimeIndex:detail?Math.max(0,(detail.timeline?.length??1)-1):state.liveTimeIndex,incidentOperations:operationsResult.status==='fulfilled'?operationsResult.value:null,incidentOperationsError:operationsResult.status==='rejected'?operationsResult.reason.message:null};});
  }

  async function loadObservation() {
    const stateAtStart = store.get(); let item = selectedItem(stateAtStart); const territorySignal=stateAtStart.selected?.kind==='finding'?stateAtStart.territory?.signals?.find((signal)=>signal.resourceKind==='finding'&&signal.resourceId===stateAtStart.selected.id):null; let coordinate=item?.coordinate??territorySignal?.coordinate;
    observationController?.abort('selection_changed'); observationController = new AbortController(); const generation = ++observationGeneration; const selectedId = String(stateAtStart.selected?.id ?? '');
    store.set((state) => ({ ...state, observationLoading: true, observation: null, changeScreenResult: null }));
    try {
      if(stateAtStart.selected?.kind==='finding'){
        try {
          const detail=await api.preventionFinding(selectedId);
          if(detail?.findingId){item={...item,...detail};coordinate=item.coordinate??coordinate;if(generation===observationGeneration&&String(store.get().selected?.id??'')===selectedId)store.set((state)=>({...state,bootstrap:{...state.bootstrap,prevention:{...state.bootstrap.prevention,findings:(state.bootstrap.prevention.findings??[]).map((finding)=>String(finding.findingId)===selectedId?{...finding,...detail}:finding)}}}));}
        } catch(error) { if(!coordinate)throw error; }
      }
      if(!coordinate)throw new Error('Selected finding has no attributable coordinate.');
      const observation = await api.observation(coordinate, {
        signal: observationController.signal,
        primaryId:stateAtStart.selected?.kind==='finding'?(item?.currentObservationId??territorySignal?.currentObservationId):null,
        comparableId:stateAtStart.selected?.kind==='finding'?(item?.comparisonObservationId??territorySignal?.comparisonObservationId):null
      });
      if (generation !== observationGeneration || String(store.get().selected?.id ?? '') !== selectedId) return;
      store.set((state) => ({ ...state, observation, observationLoading: false }));
    } catch (error) {
      if (error.code === 'request_cancelled' || generation !== observationGeneration) return;
      if (String(store.get().selected?.id ?? '') === selectedId) store.set((state) => ({ ...state, observation: null, observationLoading: false }));
      toasts.show(`Observation unavailable: ${error.message}`);
    }
  }

  async function loadConsequence(id = store.get().selected?.id) {
    if (!id) return; store.set((state) => ({ ...state, consequenceLoading: true, consequence: null, exposure: null }));
    try {
      const consequence = await api.consequence(id); store.set((state) => ({ ...state, consequence, consequenceLoading: false }));
      if (consequence.gate?.allowed) loadExposure(id);
    } catch (error) { store.set((state) => ({ ...state, consequenceLoading: false })); toasts.show(`Consequence unavailable: ${error.message}`); }
  }

  async function loadExposure(id = store.get().selected?.id) {
    if (!id) return;
    store.set((state) => ({ ...state, exposure: null, exposureLoading: true, exposureStartedAt: new Date().toISOString() }));
    try { const exposure = await api.exposure(id); store.set((state) => ({ ...state, exposure, exposureLoading: false })); }
    catch (error) { store.set((state) => ({ ...state, exposureLoading: false, exposure: { state: 'unavailable', limitation: error.message, assets: [], retryable: true } })); }
  }

  function setView(view, selection = null) {
    const requested = ['live','replay','command','observe','validation','system','incidents','consequence','field','outcomes'].includes(view) ? view : 'live';
    const currentActor = store.get().bootstrap?.actor;
    const nextView = canOpenView(currentActor, requested) ? requested : defaultViewForActor(currentActor);
    store.set((state) => ({ ...state, view: nextView, selected: null, query: '', filter: nextView === 'field' ? 'open' : 'all', commandExpanded:false, observation: null, consequence: null, exposure: null, exposureLoading: false, exposureStartedAt: null, timelineIndex: 1, replayPlaying:false, analysisMode:false, incidentOperations:null, incidentOperationsError:null }));
    const nextSelection = selection ?? firstSelectionForView(store.get(), nextView);
    store.set((state) => ({ ...state, selected: nextSelection }));
    ui.queue.scrollTop = 0; ui.queueList.scrollTop = 0; ui.inspectorContent.scrollTop = 0; const state = store.get(); const item = selectedItem(state); if (item?.coordinate && !['field','outcomes'].includes(nextView)) { const zoom = nextView === 'consequence' ? 11.8 : ['live','incidents'].includes(nextView) ? 12.2 : nextView === 'command' && state.selected?.kind === 'event' ? 11.8 : nextView === 'observe' ? 10.8 : 10.2; map.flyTo(item.coordinate, zoom); } else map.home();
    if (nextView === 'consequence') loadConsequence(state.selected?.id); if(nextView==='incidents'&&state.selected?.kind==='replay')loadReplayCase(state.selected?.id); void hydrateView(nextView);
    root.classList.remove('mobile-queue','mobile-inspector');
  }

  root.addEventListener('vigia:change-screened',(event)=>{ store.set((state)=>({ ...state, changeScreenResult:event.detail??null })); });

  async function select(selection) {
    const normalized = ['operation','incident','event','replay','hazard','thermal','prevention','finding'].includes(selection.kind) ? selection : { kind: 'prevention', id: selection.id };
    store.set((state) => { const event = normalized.kind === 'event' ? state.live?.events?.find((item)=>String(item.id)===String(normalized.id)) : null; return { ...state, selected: normalized, liveTimeIndex: event ? Math.max(0,(event.timeline?.length??1)-1) : state.liveTimeIndex, analysisMode:event ? state.analysisMode : false, incidentOperations:null, incidentOperationsError:null }; }); ui.inspectorContent.scrollTop = 0; const item = selectedItem(store.get()); if (item?.coordinate) map.flyTo(item.coordinate, normalized.kind === 'event' ? 12.4 : 10.8);
    if (store.get().view === 'observe') loadObservation(); if (store.get().view === 'consequence') loadConsequence(normalized.id); if((store.get().view==='replay'||store.get().view==='incidents')&&normalized.kind==='replay')loadReplayCase(normalized.id);
    if((store.get().view==='live'||store.get().view==='incidents')&&normalized.kind==='event')await hydrateLiveEvent(normalized.id);
    if (matchMedia('(max-width: 920px)').matches) root.classList.add('mobile-inspector');
  }

  const workflows = createModalWorkflows({ api, store, modal, toasts, reload });
  const handleAction = createActionHandler({ store, api, workflows, toasts, drawer, reload, setView, select, loadConsequence, loadExposure, ensureFullBootstrap, ensureValidationWorkspace, refreshOperationsWorkspace });
  bindEvents({ root, ui, api, store, map, drawer, handleAction, setView, select, reload });
  connectStream(reload); reload();
}
