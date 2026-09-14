import { replayJumpIndex } from './replay-navigation.js';

export function bindEvents({ root, ui, api, store, map, drawer, handleAction, setView, select, reload }) {
  let replayTimer=null;
  const replayIsVisible=(state)=>state.view==='replay'||(state.view==='incidents'&&state.selected?.kind==='replay');
  const stopReplay=()=>{if(replayTimer)clearInterval(replayTimer);replayTimer=null;store.set((state)=>state.replayPlaying?({...state,replayPlaying:false}):state);};
  const beginReplay=()=>{if(replayTimer)clearInterval(replayTimer);store.set((state)=>({...state,replayPlaying:true}));const speed=Number(store.get().replaySpeed??1),delay=speed===20?90:speed===5?240:720;replayTimer=setInterval(()=>{const state=store.get(),last=Math.max(0,(state.replayCase?.controlledClock?.steps?.length??1)-1);if(!replayIsVisible(state)||state.replayTimeIndex>=last)return stopReplay();store.set((current)=>({...current,replayTimeIndex:Math.min(last,current.replayTimeIndex+1)}));},delay);};
  root.addEventListener('click', (event) => {
    const view = event.target.closest('[data-view-button]'); if (view) return setView(view.dataset.viewButton);
    const selectButton = event.target.closest('[data-select-id]'); if (selectButton) { if(selectButton.closest('[data-drawer]'))drawer.close();return select({ kind: selectButton.dataset.selectKind, id: selectButton.dataset.selectId }); }
    const filter = event.target.closest('[data-filter]'); if (filter) return store.set((state) => ({ ...state, filter: filter.dataset.filter }));
    const action = event.target.closest('[data-action]'); if (action) {
      if(action.dataset.action==='replay-play')return beginReplay();
      if(action.dataset.action==='replay-pause')return stopReplay();
      if(action.dataset.action==='replay-speed'){const speed=Number(action.dataset.speed)||1;store.set((state)=>({...state,replaySpeed:speed}));if(store.get().replayPlaying)beginReplay();return;}
      if(action.dataset.action==='replay-step'){stopReplay();return store.set((state)=>({...state,replayTimeIndex:Math.min(Math.max(0,(state.replayCase?.controlledClock?.steps?.length??1)-1),state.replayTimeIndex+1)}));}
      if(action.dataset.action?.startsWith('replay-jump-')){stopReplay();const target=action.dataset.action.replace('replay-jump-','');return store.set((state)=>({...state,replayTimeIndex:replayJumpIndex(state,target)}));}
      if (action.dataset.action === 'toggle-live-thermal') return store.set((state) => ({ ...state, liveThermalEnabled: state.liveThermalEnabled === false }));
      if (action.dataset.action === 'toggle-analysis-mode') return store.set((state) => ({ ...state, analysisMode: state.selected?.kind === 'event' ? state.analysisMode !== true : false }));
      if (action.dataset.action === 'toggle-queue') return togglePanel(root, 'queue');
      if (action.dataset.action === 'toggle-inspector') return togglePanel(root, 'inspector');
      if (action.dataset.action === 'mobile-queue') { root.classList.toggle('mobile-queue'); root.classList.remove('mobile-inspector'); return; }
      if (action.dataset.action === 'mobile-inspector') { root.classList.toggle('mobile-inspector'); root.classList.remove('mobile-queue'); return; }
      return handleAction(action.dataset.action, action);
    }
    const operation = event.target.closest('[data-operation-id]'); if (operation) return select({ kind: 'operation', id: operation.dataset.operationId });
    const mapAction = event.target.closest('[data-map-action]'); if (mapAction) { if (mapAction.dataset.mapAction === 'home') map.home(); if (mapAction.dataset.mapAction === 'zoom-in') map.zoomIn(); if (mapAction.dataset.mapAction === 'zoom-out') map.zoomOut(); }
  });
  root.addEventListener('input', (event) => { const range = event.target.closest?.('[data-live-range]'); if (range) store.set((state) => ({ ...state, liveTimeIndex: Number(range.value) })); const replayRange=event.target.closest?.('[data-replay-range]');if(replayRange){stopReplay();store.set((state)=>({...state,replayTimeIndex:Number(replayRange.value)}));} });
  ui.search.addEventListener('input', () => store.set((state) => ({ ...state, query: ui.search.value })));
  ui.scrim.addEventListener('click', drawer.close);
  window.addEventListener('online', () => reload({ quiet: true }));
  window.addEventListener('keydown', (event) => {
    if(event.key==='Escape'&&store.get().analysisMode){event.preventDefault();return store.set((state)=>({...state,analysisMode:false}));}
    if(replayIsVisible(store.get())&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){if(event.key===' '){event.preventDefault();return store.get().replayPlaying?stopReplay():beginReplay();}if(event.key==='ArrowRight'){event.preventDefault();stopReplay();return store.set((state)=>({...state,replayTimeIndex:Math.min(Math.max(0,(state.replayCase?.controlledClock?.steps?.length??1)-1),state.replayTimeIndex+1)}));}if(event.key==='ArrowLeft'){event.preventDefault();stopReplay();return store.set((state)=>({...state,replayTimeIndex:Math.max(0,state.replayTimeIndex-1)}));}}
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key === '[') { event.preventDefault(); togglePanel(root, 'queue'); }
    if (event.key === ']') { event.preventDefault(); togglePanel(root, 'inspector'); }
  });
}

function togglePanel(root, name) {
  const className = `${name}-collapsed`;
  const collapsed = root.classList.toggle(className);
  for (const button of root.querySelectorAll(`[data-action="toggle-${name}"]`)) button.setAttribute('aria-expanded', String(!collapsed));
}

export function connectStream(reload) {
  const stream = new EventSource('/api/v10/stream'); let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => reload({ quiet: true }), 450); };
  stream.addEventListener('operator.changed', schedule); stream.addEventListener('world.updated', schedule); stream.addEventListener('alerts.updated', schedule);
}
