import { renderRoute } from './routes/index.js?v=3.0.0';
import { integratedRoutes } from './approved/index.js';
import { approvedController } from './approved/controller.js';
import { restoreStableSearchInput } from './stableSearchInput.js';
import { loadLastGoodRuntime, loadState, saveLastGoodRuntime, saveState } from './storage.js?v=3.0.0';
import { vigiaApi } from './vigiaApi.js?v=2.1.0';
import { bindShellState, esc } from './components.js?v=2.1.0';
import { canonicalIncidents, envelope, incidentCoordinate, incidentEnvelope, incidentId, incidentLabel, operatorText, timeLabel } from './canonicalViewModel.js?v=3.0.0';
import { callResult, sessionContinuityMatches } from './runtimeLoader.js?v=2.1.0';
import { clearMapFocus, fitMapContents, focusMapLayer, hydrateMaps, mapRuntimeSnapshot, recoverMap, reconcileVisibleMap, restorePersistentMaps, retainPersistentMaps } from './map.js?v=3.0.0';
import { icon } from './icons.js?v=2.1.0';
import { controlEvidenceGraph, hydrateEvidenceGraphs } from './evidenceGraph.js?v=2.1.0';
import { applyIncidentSelection, createLatestIncidentRequestGuard, revalidateSelectedEvidence } from './incidentSelection.js?v=2.1.0';
import { relativeTimeLabel, vigiaArtifactInspector, vigiaLayerPanel } from './operatorPrimitives.js?v=3.2.0';
import { applyRouteParams, approvedRoutes, migrateLegacyRouteState, parseRouteUrl, routeHash, routeParamsFromState, updateRouteParameter } from './routeState.js?v=3.2.0';
import { domainAction } from './domainActions.js?v=1.0.0';
import { incidentQuicklook } from './executiveComponents.js?v=3.0.0';
import { createAppActionController } from './appActionController.js?v=1.0.0';
import { warmIncidentContext } from './incidentContextWarmup.js?v=1.0.0';const app=document.querySelector('#app');
app.dataset.uiVersion='3.0.0';
const migratedLocation=migrateLegacyRouteState(location.href);if(migratedLocation.changed)history.replaceState({...(history.state??{}),vigiaRoute:true,migratedLegacyQuery:true},'',`${migratedLocation.url.pathname}${migratedLocation.url.search}${migratedLocation.url.hash}`);
const persistedState=loadState(),persistedIncidentId=persistedState?.selectedIncidentId;
let state=applyRouteParams(persistedState,migratedLocation.route,migratedLocation.params,{reset:true});
if(['incidents','incident-detail','intelligence','operations'].includes(migratedLocation.route)&&!migratedLocation.params.has('id')&&persistedIncidentId)state.selectedIncidentId=persistedIncidentId;
state.incidentSearchDraft=String(state.incidentSearch??'');
globalThis.__VIGIA_QUICKLOOK_EXPANDED__=Boolean(state.quicklookExpanded);
state.runtime={status:'loading',resourceState:'UNINITIALIZED',showSkeleton:false,error:null,health:null,operatorIdentity:null,session:null,loadedAt:null,lastGovernedMutationCompletedAt:null,lastOperatorInteractionAt:null,canonical:{globals:{},incidents:{},dependencies:{}},pendingOperations:{refresh:false,governedMutation:false},performance:{applicationMountedAt:performance.now(),routeHydrationMs:{},api:{}}};
const routes=new Set(approvedRoutes());
const runtimeObservability=globalThis.__VIGIA_APP_RUNTIME__??={documentIdentity:crypto.randomUUID(),applicationMountCount:0,routeRenderCount:0,documentTimeOrigin:performance.timeOrigin,navigationEntryCount:performance.getEntriesByType('navigation').length};runtimeObservability.applicationMountCount+=1;globalThis.__VIGIA_APP_RUNTIME__=runtimeObservability;app.dataset.documentIdentity=runtimeObservability.documentIdentity;app.dataset.applicationMountCount=String(runtimeObservability.applicationMountCount);app.dataset.documentTimeOrigin=String(runtimeObservability.documentTimeOrigin);app.dataset.navigationEntryCount=String(runtimeObservability.navigationEntryCount);
const executiveRuntime=globalThis.__VIGIA_EXECUTIVE_UX_RUNTIME__??={schemaVersion:'vigia.executive-ux-runtime.v2',quicklook:[],incidentSwitches:[],mapFocus:[],globalFilters:[],actions:[],unknownActions:[]};executiveRuntime.actions??=[];executiveRuntime.unknownActions??=[];delete executiveRuntime.deadActionCount;globalThis.__VIGIA_EXECUTIVE_UX_RUNTIME__=executiveRuntime;
const incidentRoutes=new Set(['incident-detail','intelligence','operations']),scrollMemory=new Map();let activeGlobalRequest=null,activeIncidentLoad=null,globalGeneration=0;
const incidentRequestGuard=createLatestIncidentRequestGuard();function syncAsyncRuntimeMarkers(){const globalRefreshPending=Boolean(state.runtime.pendingOperations.refresh||activeGlobalRequest),incidentLoadPending=Boolean(activeIncidentLoad);app.dataset.vigiaGlobalRefreshPending=String(globalRefreshPending);app.dataset.vigiaIncidentLoadPending=String(incidentLoadPending);runtimeObservability.globalRefreshPending=globalRefreshPending;runtimeObservability.incidentLoadPending=incidentLoadPending;runtimeObservability.hydrationIdle=!globalRefreshPending&&!incidentLoadPending;}
function backgroundRefreshEligible(){
  if(state.runtime.pendingOperations.governedMutation||activeGlobalRequest)return false;
  const lastMutationAt=Date.parse(state.runtime.lastGovernedMutationCompletedAt??'');
  if(Number.isFinite(lastMutationAt)&&Date.now()-lastMutationAt<30_000)return false;
  if(document.querySelector('.vigia-dialog')||state.openSelectId)return false;
  const lastInteractionAt=Number(state.runtime.lastOperatorInteractionAt);
  return !Number.isFinite(lastInteractionAt)||Date.now()-lastInteractionAt>=15_000;
}
function noteOperatorInteraction(){state.runtime.lastOperatorInteractionAt=Date.now();}
function routeFromHash(){const parsed=parseRouteUrl(location.href),canonicalHash=routeHash(parsed.route,parsed.params);if(location.hash!==canonicalHash)history.replaceState({...(history.state??{}),vigiaRoute:true},'',`${location.pathname}${location.search}${canonicalHash}`);return parsed.route;}
function persist(){saveState(state);}
let projectionRenderQueued=false;
function scheduleProjectionRender(){if(projectionRenderQueued)return;projectionRenderQueued=true;requestAnimationFrame(()=>{projectionRenderQueued=false;render();});}
function captureScroll(){document.querySelectorAll('[data-scroll-key]').forEach(element=>scrollMemory.set(element.dataset.scrollKey,element.scrollTop));}
function focusIdentity(){const active=document.activeElement;if(!active||active===document.body||!app.contains(active))return null;return{route:active.dataset.route??null,action:active.dataset.action??null,recordId:active.dataset.id??null,tab:active.dataset.tab??null,input:active.dataset.input??null,change:active.dataset.change??null,aria:active.getAttribute('aria-label')??null};}
function restoreFocus(identity){if(!identity)return;const candidates=[...app.querySelectorAll('[data-route],[data-action],[data-input],[data-change],[aria-label]')],target=candidates.find(item=>identity.route&&item.dataset.route===identity.route)||candidates.find(item=>identity.action&&item.dataset.action===identity.action&&(!identity.recordId||item.dataset.id===identity.recordId)&&(!identity.tab||item.dataset.tab===identity.tab))||candidates.find(item=>identity.input&&item.dataset.input===identity.input)||candidates.find(item=>identity.change&&item.dataset.change===identity.change)||candidates.find(item=>identity.aria&&item.getAttribute('aria-label')===identity.aria);target?.focus({preventScroll:true});}
function mobileNavigationMode(){return matchMedia(integratedRoutes.has(routeFromHash())?'(max-width: 760px)':'(max-width: 1120px)').matches;}
function navigationFocusable(){const sidebar=document.querySelector('#primary-navigation');return sidebar?[...sidebar.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(item=>!item.hasAttribute('inert')&&item.offsetParent!==null):[];}
const responsiveDisclosureState=new Map();
function syncResponsiveDisclosures(){
 const mobile=matchMedia('(max-width: 760px)').matches;
 document.querySelectorAll('[data-responsive-disclosure]').forEach(el=>{
  const key=el.dataset.responsiveDisclosure,prior=responsiveDisclosureState.get(key);
  el.open=prior?.mobile===mobile?prior.open:!mobile;
  responsiveDisclosureState.set(key,{mobile,open:el.open});
  if(!el.disclosureBound){el.addEventListener('toggle',()=>responsiveDisclosureState.set(key,{mobile:matchMedia('(max-width: 760px)').matches,open:el.open}));el.disclosureBound=true;}
 });
}
function syncMobileNavigation(){const sidebar=document.querySelector('#primary-navigation'),frame=document.querySelector('.app-frame'),trigger=document.querySelector('[data-action="toggle-nav"],[data-action="nav-toggle"]'),mobile=mobileNavigationMode();if(!sidebar)return;if(!mobile&&state.navOpen){state.navOpen=false;persist();}const open=mobile&&state.navOpen;sidebar.toggleAttribute('inert',mobile&&!open);sidebar.setAttribute('aria-hidden',mobile&&!open?'true':'false');if(open){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}frame?.toggleAttribute('inert',open);if(frame){if(open)frame.setAttribute('aria-hidden','true');else frame.removeAttribute('aria-hidden');}trigger?.setAttribute('aria-expanded',open?'true':'false');document.body.classList.toggle('nav-open',open);}
function focusMobileNavigation(){const items=navigationFocusable(),active=items.find(item=>item.getAttribute('aria-current')==='page')??items[0];active?.focus({preventScroll:true});}
function setMobileNavigation(open,{restoreTrigger=true}={}){state.navOpen=mobileNavigationMode()&&Boolean(open);persist();render();if(state.navOpen)focusMobileNavigation();else if(restoreTrigger)document.querySelector('[data-action="toggle-nav"],[data-action="nav-toggle"]')?.focus({preventScroll:true});}
function trapMobileNavigationFocus(event){if(event.key!=='Tab'||!mobileNavigationMode()||!state.navOpen||document.querySelector('.vigia-dialog'))return;const items=navigationFocusable();if(!items.length)return;const first=items[0],last=items.at(-1),active=document.activeElement;if(!items.includes(active)){event.preventDefault();first.focus();return;}if(event.shiftKey&&active===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}}
const mapHealthLabels=Object.freeze({LIVE:'Map transport live',LOADING:'Retained map · refreshing',DEGRADED_PARTIAL:'Map partial · retry active',STALE_LAST_GOOD:'Retained map · refreshing',STRUCTURED_FALLBACK:'Map transport unavailable',UNAVAILABLE:'Map transport unavailable'});
function syncMapHealthLabel(map,mapState=map?.dataset?.mapState){const panel=map?.closest?.('.incident-detail-map,.operations-map,.panel-surface'),label=panel?.querySelector?.(':scope > header [data-map-health]');if(label)label.textContent=mapHealthLabels[mapState]??'Map transport updating';}
function syncVisibleMapHealthLabels(root=document){root.querySelectorAll('.tile-map').forEach(map=>syncMapHealthLabel(map));}
let incidentSearchNode=null,incidentSearchComposing=false;
function render({focusMain=false,preserveScroll=true}={}){
  const started=performance.now(),prior=focusMain?null:focusIdentity();
  if(preserveScroll)captureScroll();
  state.runtime.mapObservability=mapRuntimeSnapshot();bindShellState(state);
  const route=routeFromHash(),stableIncidentSearch=route==='incidents'?app.querySelector('[data-input="incident-search"]'):null,stableContextSearch=state.openSelectId==='incident-context'?app.querySelector('[data-input="incident-context-search"]'):null;
  const searchSelection=stableIncidentSearch?{focused:document.activeElement===stableIncidentSearch,start:stableIncidentSearch.selectionStart,end:stableIncidentSearch.selectionEnd,direction:stableIncidentSearch.selectionDirection}:null;
  const contextSelection=stableContextSearch?{focused:document.activeElement===stableContextSearch,start:stableContextSearch.selectionStart,end:stableContextSearch.selectionEnd,direction:stableContextSearch.selectionDirection}:null;
  const template=document.createElement('template');template.innerHTML=renderRoute(route,state);
  const approved=integratedRoutes.has(route);
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link=>{if(link.href.includes('/assets/vendor/'))return;link.disabled=link.hasAttribute('data-approved-style')?!approved:approved;});
  retainPersistentMaps(app);app.replaceChildren(template.content);restorePersistentMaps(app);
  if(restoreStableSearchInput(app,stableIncidentSearch,'[data-input="incident-search"]',state.incidentSearchDraft??state.incidentSearch))incidentSearchNode=stableIncidentSearch;
  restoreStableSearchInput(app,stableContextSearch,'[data-input="incident-context-search"]',state.incidentContextSearch);
  document.body.dataset.vigiaAppState=state.runtime.status;document.body.dataset.vigiaResourceState=state.runtime.resourceState;document.body.dataset.vigiaRoute=route;app.dataset.vigiaAppState=state.runtime.status;app.dataset.vigiaResourceState=state.runtime.resourceState;syncAsyncRuntimeMarkers();runtimeObservability.routeRenderCount+=1;app.dataset.routeRenderCount=String(runtimeObservability.routeRenderCount);
  const main=document.querySelector('#main-content'),busy=['UNINITIALIZED','BOOTSTRAPPING','REFRESHING'].includes(state.runtime.resourceState);main?.setAttribute('aria-busy',busy?'true':'false');hydrateMaps(app);syncVisibleMapHealthLabels(app);hydrateEvidenceGraphs(app);document.body.classList.toggle('nav-open',state.navOpen);syncMobileNavigation();syncResponsiveDisclosures();
  for(const element of document.querySelectorAll('[data-scroll-key]')){const saved=scrollMemory.get(element.dataset.scrollKey);if(Number.isFinite(saved))element.scrollTop=saved;}
  if(focusMain)main?.focus({preventScroll:true});else restoreFocus(prior);
  if(searchSelection?.focused&&stableIncidentSearch?.isConnected){stableIncidentSearch.focus({preventScroll:true});stableIncidentSearch.setSelectionRange(searchSelection.start,searchSelection.end,searchSelection.direction);}
  if(contextSelection?.focused&&stableContextSearch?.isConnected){stableContextSearch.focus({preventScroll:true});stableContextSearch.setSelectionRange(contextSelection.start,contextSelection.end,contextSelection.direction);}
  if(state.openSelectId&&!contextSelection?.focused)requestAnimationFrame(()=>{const select=document.querySelector(`[data-vigia-select="${CSS.escape(state.openSelectId)}"]`),search=select?.querySelector('[data-input="operation-incident-search"],[data-input="incident-context-search"]'),active=select?.querySelector('[role="option"][aria-selected="true"]');(search??active)?.focus({preventScroll:true});});
  state.runtime.performance.routeHydrationMs[route]=Number((performance.now()-started).toFixed(2));
}
function patchIncidentSearchResults(input){
  if(routeFromHash()!=='incidents'||!input?.isConnected)return;
  const routeRenderBefore=runtimeObservability.routeRenderCount,mapInstanceBefore=activeMap()?.dataset.mapInstanceId??null,selection={start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
  const template=document.createElement('template');template.innerHTML=renderRoute('incidents',state);const freshRoute=template.content.querySelector('.incidents-route'),currentRoute=app.querySelector('.incidents-route');if(!freshRoute||!currentRoute)return;
  const currentInventory=currentRoute.querySelector('.incident-inventory'),freshInventory=freshRoute.querySelector('.incident-inventory');if(currentInventory&&freshInventory)currentInventory.replaceWith(freshInventory);
  if(integratedRoutes.has('incidents')){
    const currentOutside=currentRoute.querySelector('.preview-outside'),freshOutside=freshRoute.querySelector('.preview-outside');if(currentOutside&&freshOutside)currentOutside.replaceWith(freshOutside);else if(currentOutside)currentOutside.remove();else if(freshOutside)currentRoute.querySelector('.incident-preview-body')?.prepend(freshOutside);
    const existingClear=currentRoute.querySelector('[data-action="clear-search"]'),freshClear=freshRoute.querySelector('[data-action="clear-search"]');if(existingClear&&!freshClear)existingClear.remove();else if(!existingClear&&freshClear)input.after(freshClear);
  }
  const currentNotice=currentRoute.querySelector('.incident-filter-notice'),freshNotice=freshRoute.querySelector('.incident-filter-notice');if(currentNotice&&freshNotice)currentNotice.replaceWith(freshNotice);else if(currentNotice)currentNotice.remove();else if(freshNotice)currentRoute.querySelector('.incidents-layout')?.before(freshNotice);
  const currentSummary=currentRoute.querySelector('.incident-map-summary'),freshSummary=freshRoute.querySelector('.incident-map-summary'),currentMapPanel=currentRoute.querySelector('.incidents-map');if(currentSummary&&freshSummary)currentSummary.replaceWith(freshSummary);else if(currentSummary)currentSummary.remove();else if(freshSummary)currentMapPanel?.append(freshSummary);
  const currentMapHost=currentRoute.querySelector('.canonical-map'),freshMapHost=freshRoute.querySelector('.canonical-map');if(currentMapHost&&freshMapHost)reconcileVisibleMap(currentMapHost,freshMapHost);
  const reset=currentRoute.querySelector('.incidents-filter-reset'),freshReset=freshRoute.querySelector('.incidents-filter-reset');if(reset&&freshReset){reset.disabled=freshReset.disabled;reset.textContent=freshReset.textContent;}
  const clear=input.closest('.search-field')?.querySelector('.search-field__clear');if(clear)clear.hidden=!input.value;
  input.setSelectionRange?.(selection.start,selection.end,selection.direction);
  const proof={schemaVersion:'vigia.search-integrity.v1',domIdentity:input.dataset.domIdentity,sameNode:input===incidentSearchNode,isConnected:input.isConnected,focused:document.activeElement===input,value:input.value,selectionStart:input.selectionStart,selectionEnd:input.selectionEnd,selectionDirection:input.selectionDirection,routeRenderBefore,routeRenderAfter:runtimeObservability.routeRenderCount,routeRenderDelta:runtimeObservability.routeRenderCount-routeRenderBefore,mapInstanceBefore,mapInstanceAfter:activeMap()?.dataset.mapInstanceId??null,url:location.href,networkRequestDelta:performance.getEntriesByType('resource').length-Number(input.dataset.searchResourceStart??performance.getEntriesByType('resource').length),compositionSafe:incidentSearchComposing!==true,at:new Date().toISOString()};
  input.dataset.searchIntegrity=JSON.stringify(proof);globalThis.__VIGIA_SEARCH_PROOF__=proof;
}
function commit(mutator){mutator(state);persist();render();}
function toast(message,tone='teal'){const region=document.querySelector('.toast-region');if(!region)return;const node=document.createElement('div');node.className=`toast toast--${tone}`;node.textContent=message;region.append(node);requestAnimationFrame(()=>node.classList.add('is-visible'));setTimeout(()=>{node.classList.remove('is-visible');setTimeout(()=>node.remove(),180)},2200);}
function activeMap(){return app.querySelector('.tile-map');}
function syncQuery(parameter,value,{defaultValue='ALL'}={}){const url=updateRouteParameter(location.href,parameter,value,{defaultValue});history.replaceState({...(history.state??{}),vigiaFilters:true},'',`${url.pathname}${url.search}${url.hash}`);}
function applyLocationState(){
  const parsed=parseRouteUrl(location.href),priorIncidentId=state.selectedIncidentId;
  applyRouteParams(state,parsed.route,parsed.params,{reset:true});
  if((incidentRoutes.has(parsed.route)||parsed.route==='incidents')&&!parsed.params.has('id')){
    const inventory=canonicalIncidents(envelope(state,'incidents')),firstIncidentId=incidentId(inventory[0]);
    const retainedIncidentId=priorIncidentId&&inventory.some(item=>incidentId(item)===String(priorIncidentId))?priorIncidentId:firstIncidentId;
    if(retainedIncidentId){applyIncidentSelection(state,retainedIncidentId);const url=updateRouteParameter(location.href,'id',retainedIncidentId,{defaultValue:null});history.replaceState({...(history.state??{}),vigiaRoute:true,implicitIncidentSelection:true},'',`${url.pathname}${url.search}${url.hash}`);}
  }
  state.incidentSearchDraft=String(state.incidentSearch??'');state.openSelectId=null;
}
function updateActiveMapCamera(mutator){const map=activeMap(),identity=map?.dataset.mapSceneIdentity;if(!map||!identity)return;commit(current=>{current.mapSceneCameras={...(current.mapSceneCameras??{})};const prior={zoom:Number(map.dataset.mapZoom)||5,...(current.mapSceneCameras[identity]??{})};current.mapSceneCameras[identity]=mutator(prior);});}
function selectedCoordinate(id){for(const source of [envelope(state,'incidents'),envelope(state,'commandOverview')]){const row=canonicalIncidents(source).find(item=>incidentId(item)===String(id));const coordinate=incidentCoordinate(row);if(coordinate)return coordinate;}return null;}
function operatorTimestamp(value){return Number.isFinite(Date.parse(value??''))?`${timeLabel(value)} · ${relativeTimeLabel(value)}`:'Not reported';}
function retainSelectionCamera(id){const map=activeMap(),coordinate=selectedCoordinate(id),identity=map?.dataset.mapSceneIdentity;if(!coordinate||!identity)return;state.mapSceneCameras={...(state.mapSceneCameras??{}),[identity]:{...(state.mapSceneCameras?.[identity]??{}),center:coordinate,zoom:Math.max(7,Number(map.dataset.mapZoom)||7),selectedIncidentId:String(id)}};}
function activeMapScene(){const route=routeFromHash(),incidentKey=route==='incident-detail'?'detail':route,source=route==='command-overview'?envelope(state,'commandOverview'):route==='incidents'?envelope(state,'incidents'):route==='global-awareness'?envelope(state,'globalAwareness'):incidentEnvelope(state,incidentKey);return source?.data?.mapScene?.value??source?.data?.mapScene??null;}
function showOverlay(title,body,{kind='dialog'}={}){
 const previous=document.querySelector('.vigia-dialog'),returnFocus=previous?.returnFocus??document.activeElement;
 previous?.remove();
 const identity={action:returnFocus?.dataset?.action,record:returnFocus?.dataset?.id,id:returnFocus?.id},wrap=document.createElement('div'),titleId=`vigia-overlay-title-${Date.now()}`;
 wrap.returnFocus=returnFocus;wrap.className=`vigia-dialog vigia-overlay vigia-overlay--${kind}`;
 wrap.innerHTML=`<button type="button" tabindex="-1" class="vigia-dialog__scrim vigia-overlay__scrim" data-dialog-close aria-label="Close ${esc(title)}"></button><section class="vigia-dialog__panel vigia-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}"><header><h2 id="${titleId}">${esc(title)}</h2><button type="button" class="icon-button" data-dialog-close aria-label="Close ${esc(title)}">${icon('close',20)}</button></header><div class="vigia-dialog__body vigia-overlay__body">${body}</div></section>`;
 document.body.append(wrap);app.inert=true;document.body.classList.add('overlay-open');
 const panel=wrap.querySelector('[role="dialog"]');
 const close=()=>{wrap.remove();app.inert=false;document.body.classList.remove('overlay-open');const target=returnFocus?.isConnected?returnFocus:identity.action?[...document.querySelectorAll('[data-action]')].find(el=>el.dataset.action===identity.action&&(!identity.record||el.dataset.id===identity.record)):identity.id?document.getElementById(identity.id):null;target?.focus({preventScroll:true});};
 wrap.querySelectorAll('[data-dialog-close]').forEach(item=>item.addEventListener('click',close));
 wrap.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(target&&!target.disabled){event.preventDefault();if(await approvedActions.action(target))return;void onAction(target.dataset.action);}});
 wrap.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}if(event.key!=='Tab')return;const focusable=[...panel.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(item=>{if(item.tabIndex<0||item.matches(':disabled')||!item.getClientRects().length||getComputedStyle(item).visibility==='hidden')return false;for(let parent=item.parentElement;parent&&parent!==panel;parent=parent.parentElement){if(parent.matches('details:not([open])')&&!parent.querySelector(':scope > summary')?.contains(item))return false;}return true;});if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1),active=document.activeElement;if(!panel.contains(active)){event.preventDefault();first.focus();}else if(event.shiftKey&&active===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}});
 panel.querySelector('button')?.focus();
}
function showDialog(title,body){showOverlay(title,body,{kind:'dialog'});}
function retainedResult(previous,result){const at=result.attemptedAt??new Date().toISOString();if(result.ok){const refreshing=result.value?.delivery?.state==='LAST_GOOD_REFRESHING';return{value:result.value,error:null,dependency:{state:refreshing?'STALE':'READY',lastAttemptAt:at,lastSuccessAt:refreshing?(previous?.dependency?.lastSuccessAt??result.value?.delivery?.projectionGeneratedAt??at):at,lastGoodAt:result.value?.delivery?.projectionGeneratedAt??at,failureClass:null,deliveryState:result.value?.delivery?.state??'FRESH'}};}if(previous?.value)return{...previous,error:result.error,dependency:{...previous.dependency,state:'STALE',lastAttemptAt:at,failureClass:result.error}};return{value:null,error:result.error,dependency:{state:'FAILED',lastAttemptAt:at,lastSuccessAt:null,lastGoodAt:null,failureClass:result.error}};}
function recordDependencies(entries){for(const [key,entry] of Object.entries(entries))state.runtime.canonical.dependencies[key]=entry.dependency;}
function runtimeScopeKey(){const release=state.runtime.operatorIdentity?.releaseId??state.runtime.health?.releaseId??state.runtime.health?.release?.id,actor=state.runtime.session?.actor?.id,boundary=state.runtime.session?.sessionFamilyId??state.runtime.session?.sessionId??state.runtime.session?.mode,region=state.runtime.session?.actor?.region??state.runtime.operatorIdentity?.region??'authorized-scope';return release&&actor&&boundary?`${release}::${actor}::${boundary}::${region}`:null;}
function hydrateLastGood(scopeKey){const cached=loadLastGoodRuntime(scopeKey);if(!cached)return false;const globals=Object.fromEntries(Object.entries(cached.canonical?.globals??{}).map(([key,entry])=>[key,entry?.value?{...entry,dependency:{...(entry.dependency??{}),state:'STALE',lastGoodAt:entry.dependency?.lastGoodAt??entry.dependency?.lastSuccessAt??cached.savedAt,lastAttemptAt:new Date().toISOString()}}:entry])),incidents=Object.fromEntries(Object.entries(cached.canonical?.incidents??{}).map(([id,sections])=>[id,Object.fromEntries(Object.entries(sections??{}).map(([key,entry])=>[key,key==='loading'?false:entry?.value?{...entry,dependency:{...(entry.dependency??{}),state:'STALE',lastGoodAt:entry.dependency?.lastGoodAt??entry.dependency?.lastSuccessAt??cached.savedAt,lastAttemptAt:new Date().toISOString()}}:entry]))]));state.runtime.canonical={globals,incidents,dependencies:{}};recordDependencies(globals);for(const [id,sections] of Object.entries(incidents))for(const [key,entry] of Object.entries(sections))if(entry?.dependency)state.runtime.canonical.dependencies[`incident:${id}:${key}`]=entry.dependency;state.runtime.resourceState='HYDRATED_LAST_GOOD';state.runtime.status='degraded';state.runtime.loadedAt=cached.savedAt;return true;}
async function performIncidentLoad(id,{quiet=false,force=false}={}){
  if(!id)return;const previous=state.runtime.canonical.incidents[id]??{},request=incidentRequestGuard.start(id),controller=request.controller;
  if(force||!previous.location?.value){
   const location=await callResult('canonical location',()=>vigiaApi.operatorLocation(id,{signal:controller.signal}));
   if(!incidentRequestGuard.isCurrent(request))return;
   const entry=retainedResult(previous.location,location);previous.location=entry;state.runtime.canonical.incidents[id]={...previous,loading:true};recordDependencies({[`incident:${id}:location`]:entry});render();
   // Let raster work run before optional response, history and evidence queries.
   if(location.ok)await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);document.removeEventListener('vigia:map-first-frame',finish);resolve();},timer=setTimeout(finish,2500);document.addEventListener('vigia:map-first-frame',finish,{once:true});if(activeMap()?.dataset.mapFirstUsefulFrame)finish();});
   if(!incidentRequestGuard.isCurrent(request))return;
  }
  if(!quiet){state.runtime.canonical.incidents[id]={...previous,loading:true};render();}const specs={location:()=>vigiaApi.operatorLocation(id,{signal:controller.signal}),detail:()=>vigiaApi.operatorIncident(id,{signal:controller.signal}),intelligence:()=>vigiaApi.operatorIntelligence(id,{signal:controller.signal}),debt:()=>vigiaApi.operatorEvidenceDebt(id,{signal:controller.signal}),operations:()=>vigiaApi.operatorOperations(id,{signal:controller.signal})},results={},queue=Object.entries(specs);
  const required={'fire-activity':'intelligence','response-access':'operations'}[routeFromHash()]??'detail';queue.sort(([a],[b])=>Number(b===required)-Number(a===required));
  const worker=async()=>{while(queue.length&&incidentRequestGuard.isCurrent(request)){const [key,fn]=queue.shift();
   const result=(force&&key!=='location')||!previous[key]?.value?await callResult(`canonical ${key}`,fn):{cached:true};
   if(incidentRequestGuard.isCurrent(request)&&!result.cached){const entry=retainedResult(previous[key],result);state.runtime.canonical.incidents[id]={...state.runtime.canonical.incidents[id],[key]:entry,loading:true};recordDependencies({[`incident:${id}:${key}`]:entry});scheduleProjectionRender();}
   results[key]=result;
  }};await Promise.all([worker(),worker()]);
  if(!incidentRequestGuard.isCurrent(request))return;const entries=Object.fromEntries(Object.entries(results).map(([key,result])=>[key,result.cached?previous[key]:retainedResult(previous[key],result)]));state.runtime.canonical.incidents[id]={...entries,loading:false};recordDependencies(Object.fromEntries(Object.entries(entries).map(([key,entry])=>[`incident:${id}:${key}`,entry])));revalidateSelectedEvidence(state,id,state.runtime.canonical.incidents[id]);incidentRequestGuard.complete(request);state.runtime.loadedAt=new Date().toISOString();const scopeKey=runtimeScopeKey();if(scopeKey)saveLastGoodRuntime(scopeKey,state.runtime);persist();render();
}
function loadIncident(id,{quiet=false,force=false,coalesce=false}={}){if(!id)return Promise.resolve();if(activeIncidentLoad?.id===String(id)&&(!force||coalesce))return activeIncidentLoad.promise;const promise=performIncidentLoad(String(id),{quiet,force});activeIncidentLoad={id:String(id),promise};syncAsyncRuntimeMarkers();const cleanup=()=>{if(activeIncidentLoad?.promise===promise){activeIncidentLoad=null;syncAsyncRuntimeMarkers();}};promise.then(cleanup,cleanup);return promise;}
async function refreshRuntime({quiet=false,settleRefresh=true}={}){
  if(activeGlobalRequest)activeGlobalRequest.abort();
  const controller=new AbortController(),generation=++globalGeneration,previous=state.runtime.canonical.globals,hadLastGood=Object.values(previous).some(entry=>entry?.value);activeGlobalRequest=controller;state.runtime.pendingOperations.refresh=true;state.runtime.resourceState=hadLastGood?'REFRESHING':'BOOTSTRAPPING';if(!hadLastGood)state.runtime.status='loading';render();const skeletonTimer=setTimeout(()=>{if(generation===globalGeneration&&['UNINITIALIZED','BOOTSTRAPPING'].includes(state.runtime.resourceState)){state.runtime.showSkeleton=true;render();}},125);
  // Diagnostics must not delay session continuity or the authorized map reads.
  // Mutation readiness still requires the independently confirmed session below.
  void callResult('health',vigiaApi.health).then(result=>{if(controller.signal.aborted||generation!==globalGeneration)return;state.runtime.performance.api.health={durationMs:result.durationMs,attemptedAt:result.attemptedAt,ok:result.ok};if(result.ok)state.runtime.health=result.value;});
  const [identityResult,createdSession]=await Promise.all([callResult('operator identity',vigiaApi.operatorIdentity),callResult('operator session',vigiaApi.createSession)]);
  if(controller.signal.aborted||generation!==globalGeneration)return;
  const confirmedSession=createdSession.ok?await callResult('session continuity',vigiaApi.session):createdSession;
  for(const [key,result] of Object.entries({identity:identityResult,session:createdSession,sessionContinuity:confirmedSession}))state.runtime.performance.api[key]={durationMs:result.durationMs,attemptedAt:result.attemptedAt,ok:result.ok};
  state.runtime.operatorIdentity=identityResult.ok?identityResult.value:state.runtime.operatorIdentity;
  state.runtime.session=createdSession.ok&&confirmedSession.ok&&sessionContinuityMatches(createdSession.value,confirmedSession.value)?{...confirmedSession.value,mutationReady:true}:confirmedSession.ok?{...confirmedSession.value,mutationReady:false}:null;
  void ensureMapContext(routeFromHash());
  const scopeKey=runtimeScopeKey();if(!hadLastGood&&state.runtime.session?.authenticated===true&&hydrateLastGood(scopeKey))render();
  // Start the selected incident after session admission, independently of
  // reports and national portfolio projections. Detail can paint progressively.
  const earlyIncident=state.runtime.session?.authenticated===true&&incidentRoutes.has(routeFromHash())&&state.selectedIncidentId?loadIncident(state.selectedIncidentId,{quiet:true,force:true,coalesce:true}):null;
  const specs={commandOverview:vigiaApi.operatorCommandOverview,incidents:vigiaApi.operatorIncidents,reports:vigiaApi.operatorReports,globalAwareness:vigiaApi.operatorGlobalAwareness};
  // The first canonical projection after a cold start may build the governed
  // twin. Starting every portfolio projection against that same cold cache
  // made otherwise healthy requests contend until their independent 25 s
  // transport bounds expired. Preserve the route-independent result contract,
  // but let the command projection establish the shared cache before reading
  // the incident inventory. Other portfolios load on navigation.
  const resultEntries=[];
  const visibleKey={'command-overview':'commandOverview',incidents:'incidents','reports-analytics':'reports','national-awareness':'globalAwareness','global-awareness':'globalAwareness'}[routeFromHash()]??'incidents';
  const orderedSpecs=Object.entries(specs).filter(([key])=>key===visibleKey||key==='incidents').sort(([a],[b])=>Number(b===visibleKey)-Number(a===visibleKey));
  if(earlyIncident)await earlyIncident;
  for(const [key,fn] of orderedSpecs){
    const result=await callResult(`canonical ${key}`,()=>fn({signal:controller.signal}));resultEntries.push([key,result]);
    if(controller.signal.aborted||generation!==globalGeneration)return;
    const entry=retainedResult(state.runtime.canonical.globals[key]??previous[key],result);state.runtime.canonical.globals[key]=entry;recordDependencies({[key]:entry});state.runtime.performance.api[key]={durationMs:result.durationMs,attemptedAt:result.attemptedAt,ok:result.ok};state.runtime.resourceState=result.ok?(hadLastGood?'REFRESHING':'BOOTSTRAPPING'):state.runtime.resourceState;
    const visibleGlobalKey={'command-overview':'commandOverview',incidents:'incidents','reports-analytics':'reports','global-awareness':'globalAwareness'}[routeFromHash()];
    if(key===visibleGlobalKey&&entry?.value)state.runtime.status=entry.dependency?.state==='READY'?'ready':'degraded';
    persist();render();
  }
  const results=Object.fromEntries(resultEntries);
  if(controller.signal.aborted||generation!==globalGeneration)return;
  clearTimeout(skeletonTimer);state.runtime.showSkeleton=false;const success=Object.values(results).filter(result=>result.ok).length,retained=Object.values(state.runtime.canonical.globals).some(entry=>entry?.value),lastGoodRefreshing=Object.values(state.runtime.canonical.globals).some(entry=>entry?.dependency?.deliveryState==='LAST_GOOD_REFRESHING');state.runtime.resourceState=success===orderedSpecs.length&&state.runtime.session?.authenticated===true&&!lastGoodRefreshing?'READY_FRESH':lastGoodRefreshing?'READY_STALE':success?'DEGRADED_PARTIAL':retained?'READY_STALE':state.runtime.session?.authenticated===true?'FAILED_RETRYABLE':'SESSION_REQUIRED';state.runtime.status=state.runtime.resourceState==='READY_FRESH'?'ready':retained?'degraded':'error';state.runtime.error=state.runtime.status==='ready'?null:lastGoodRefreshing?'A data refresh is running; retained values remain visibly marked until it settles.':'Some requested information is not current. Retained values remain visibly marked.';state.runtime.loadedAt=new Date().toISOString();state.runtime.pendingOperations.refresh=false;
  const incidents=canonicalIncidents(envelope(state,'incidents'));if(!state.runtime.canonical.incidents[state.selectedIncidentId]?.detail?.value&&!incidents.some(item=>incidentId(item)===String(state.selectedIncidentId??''))){const first=incidentId(incidents[0]);if(first)applyIncidentSelection(state,first);else{state.selectedIncidentId=null;state.selectedEvidenceId=null;}}persist();activeGlobalRequest=null;render();if(earlyIncident)await earlyIncident;if(state.selectedIncidentId&&!state.runtime.canonical.incidents[state.selectedIncidentId]?.detail?.value)await loadIncident(state.selectedIncidentId,{quiet:true,coalesce:true});
  if(success&&scopeKey)saveLastGoodRuntime(scopeKey,state.runtime);
  if(lastGoodRefreshing&&settleRefresh)setTimeout(()=>{if(!activeGlobalRequest)void refreshRuntime({quiet:true,settleRefresh:false});},2_000);
}
const globalRouteRequests=new Map();
const mapContextRequests=new Map();
async function ensureMapContext(route){
 const key=route==='command-overview'?'command':['national-awareness','global-awareness'].includes(route)?'national':null,scope=runtimeScopeKey();
 if(!key||!scope||mapContextRequests.has(key))return;
 if(state.runtime.canonical.mapContexts?.[key])return;
 const request=callResult('map context',()=>vigiaApi.operatorMapContext(key));mapContextRequests.set(key,request);
 try{const result=await request;if(result.ok&&runtimeScopeKey()===scope){state.runtime.canonical.mapContexts??={};state.runtime.canonical.mapContexts[key]=result.value;scheduleProjectionRender();}}finally{mapContextRequests.delete(key);}
}
function prewarmNavigation(event){const link=event.target.closest?.('a[href^="#/"]');if(!link)return;const route=link.hash.slice(2).split('?')[0];if(['command-overview','national-awareness'].includes(route)){void ensureMapContext(route);void ensureGlobalProjection(route);}}
document.addEventListener('pointerover',prewarmNavigation,{passive:true});
document.addEventListener('focusin',prewarmNavigation);
async function ensureGlobalProjection(route){
 void ensureMapContext(route);
 const key={'command-overview':'commandOverview',incidents:'incidents','reports-analytics':'reports','national-awareness':'globalAwareness','global-awareness':'globalAwareness'}[route];
 if(!key||state.runtime.canonical.globals[key]?.value||globalRouteRequests.has(key)||state.runtime.session?.authenticated!==true)return;
 const fn={commandOverview:vigiaApi.operatorCommandOverview,incidents:vigiaApi.operatorIncidents,reports:vigiaApi.operatorReports,globalAwareness:vigiaApi.operatorGlobalAwareness}[key],scope=runtimeScopeKey(),request=callResult('canonical '+key,()=>fn());globalRouteRequests.set(key,request);
 try{const result=await request;if(scope!==runtimeScopeKey())return;const entry=retainedResult(state.runtime.canonical.globals[key],result);state.runtime.canonical.globals[key]=entry;recordDependencies({[key]:entry});state.runtime.performance.api[key]={durationMs:result.durationMs,attemptedAt:result.attemptedAt,ok:result.ok};persist();render();}finally{if(globalRouteRequests.get(key)===request)globalRouteRequests.delete(key);}
}

function navigate(route,{focus=true,loadProjection=true}={}){const target=routes.has(route)?route:'command-overview',params=routeParamsFromState(target,state);state.workspaceReturnRoute=routeFromHash();if(incidentRoutes.has(target)&&state.selectedIncidentId)params.set('id',state.selectedIncidentId);if(target==='incidents'&&state.selectedIncidentId)params.set('id',state.selectedIncidentId);const hash=routeHash(target,params);if(location.hash!==hash)history.pushState({vigiaRoute:true},'',`${location.pathname}${location.search}${hash}`);applyRouteParams(state,target,params,{reset:true});state.navOpen=false;state.openSelectId=null;state.quicklookRoute=null;state.quicklookIncidentId=null;state.quicklookExpanded=false;globalThis.__VIGIA_QUICKLOOK_EXPANDED__=false;persist();render({focusMain:focus,preserveScroll:true});if(loadProjection&&incidentRoutes.has(target)&&state.selectedIncidentId)void loadIncident(state.selectedIncidentId,{quiet:true});else if(loadProjection)ensureGlobalProjection(target);}
async function focusIncident(id){if(!id)return;const route=routeFromHash(),changed=applyIncidentSelection(state,id);if(route==='global-awareness')state.globalSelectedIncidentId=id;retainSelectionCamera(id);const parameter=route==='global-awareness'?'id':(['incidents','incident-detail','intelligence','operations'].includes(route)?'id':null);if(parameter)syncQuery(parameter,id,{defaultValue:null});persist();render();await loadIncident(id,{quiet:true,force:changed});}
async function openIncidentWorkspace(id=state.selectedIncidentId){if(!id)return;const changed=applyIncidentSelection(state,id);persist();navigate('incident-detail',{loadProjection:false});await loadIncident(id,{quiet:true,force:changed});}
function patchCommandQuicklook(id){
  if(routeFromHash()!=='command-overview')return false;
  const source=envelope(state,'commandOverview'),incident=canonicalIncidents(source).find(item=>incidentId(item)===String(id)),host=document.querySelector('.priority-rail');
  if(!incident||!host)return false;
  const detailSource=incidentEnvelope(state,'detail'),detail=detailSource?.data?.canonicalIncident?.value??null,work=detailSource?.data?.governedWork?.value??[],scene=source?.data?.mapScene?.value??null;
  host.classList.add('priority-rail--quicklook');host.innerHTML=incidentQuicklook({incident,detail,work,scene,route:'command-overview'});
  return true;
}
async function inspectIncident(id){
  if(!id)return;const started=performance.now(),route=routeFromHash(),before={mapInstanceId:activeMap()?.dataset.mapInstanceId??null,mountCount:mapRuntimeSnapshot().mountCount,documentIdentity:runtimeObservability.documentIdentity},proof={incidentId:id,uiAction:`inspect-incident:${id}`,route,state:'PENDING',at:new Date().toISOString()};executiveRuntime.quicklook.push(proof);
  try{const changed=applyIncidentSelection(state,id);if(route==='global-awareness')state.globalSelectedIncidentId=id;state.quicklookRoute=route;state.quicklookIncidentId=id;retainSelectionCamera(id);const parameter=route==='global-awareness'?'id':route==='incidents'?'id':null;if(parameter)syncQuery(parameter,id,{defaultValue:null});persist();const patched=patchCommandQuicklook(id);if(!patched)render();const map=activeMap(),quicklook=document.querySelector(`[data-quicklook-incident="${CSS.escape(id)}"]`),row=document.querySelector(`[data-action="inspect-incident:${CSS.escape(id)}"]`),summaryVisible=quicklook?.dataset.quicklookData==='canonical-summary';quicklook?.getBoundingClientRect();const shellMs=Number((performance.now()-started).toFixed(2));row?.scrollIntoView({block:'nearest'});quicklook?.focus({preventScroll:true});Object.assign(proof,{state:quicklook?'RECORDED':'FAIL',shellMs,dataMs:summaryVisible?shellMs:null,quicklookVisible:Boolean(quicklook),mapInstanceBefore:before.mapInstanceId,mapInstanceAfter:map?.dataset.mapInstanceId??null,mapRemountDelta:mapRuntimeSnapshot().mountCount-before.mountCount,documentIdentityBefore:before.documentIdentity,documentIdentityAfter:runtimeObservability.documentIdentity,dataVisible:Boolean(summaryVisible),rowSelected:Boolean(row?.getAttribute('aria-selected')==='true'||row?.getAttribute('aria-pressed')==='true'),url:location.href,focusMoved:document.activeElement===quicklook});app.dataset.quicklookShellMs=String(shellMs);if(summaryVisible)app.dataset.quicklookDataMs=String(shellMs);if(patched)requestAnimationFrame(()=>render());await loadIncident(id,{quiet:true,force:changed});const completed=Number((performance.now()-started).toFixed(2));proof.enrichmentMs=completed;if(proof.dataMs===null){proof.dataMs=completed;proof.dataVisible=Boolean(document.querySelector(`[data-quicklook-incident="${CSS.escape(id)}"]`));app.dataset.quicklookDataMs=String(proof.dataMs);}}
  catch(error){Object.assign(proof,{state:'FAIL',error:String(error?.message??error)});throw error;}
}
async function switchIncident(id){if(!id)return;const started=performance.now(),route=routeFromHash(),before=activeMap()?.dataset.mapInstanceId??null,prefetched=Boolean(state.runtime.canonical.incidents?.[id]?.detail?.value&&state.runtime.canonical.incidents?.[id]?.intelligence?.value&&state.runtime.canonical.incidents?.[id]?.operations?.value),proof={route,incidentId:id,uiAction:`select-context-incident:${id}`,state:'PENDING',at:new Date().toISOString()};executiveRuntime.incidentSwitches.push(proof);try{state.openSelectId=null;state.incidentContextSearch='';const load=focusIncident(id);await new Promise(resolve=>requestAnimationFrame(resolve));Object.assign(proof,{state:'RECORDED',durationMs:Number((performance.now()-started).toFixed(2)),prefetched,mapInstanceBefore:before,mapInstanceAfter:activeMap()?.dataset.mapInstanceId??null,url:location.href,requestGeneration:incidentRequestGuard.current?.generation??null});await load;proof.enrichmentMs=Number((performance.now()-started).toFixed(2));}catch(error){Object.assign(proof,{state:'FAIL',error:String(error?.message??error)});throw error;}}
async function openIncidentRoute(target,id){if(!incidentRoutes.has(target)||!id)return;const changed=applyIncidentSelection(state,id);state.quicklookRoute=null;state.quicklookIncidentId=null;persist();navigate(target,{loadProjection:false});await loadIncident(id,{quiet:true,force:changed});}
const onAction=createAppActionController({
  activeMap,activeMapScene,app,commit,executiveRuntime,focusIncident,inspectIncident,loadIncident,
  navigate,openIncidentRoute,openIncidentWorkspace,operatorTimestamp,persist,refreshRuntime,render,
  retainSelectionCamera,routeFromHash,setMobileNavigation,showDialog,showOverlay,state,switchIncident,
  syncQuery,toast,updateActiveMapCamera,
});
const approvedActions=approvedController({state,onAction,commit,persist,render,navigate,focusIncident,openIncidentWorkspace,showOverlay,syncQuery,setMobileNavigation,activeMap});
app.addEventListener('click',async event=>{noteOperatorInteraction();if(event.target.closest('.skip-link')){event.preventDefault();document.getElementById('main-content')?.focus();return;}const routeLink=event.target.closest('[data-route]');if(routeLink){event.preventDefault();navigate(routeLink.dataset.route==='national-awareness'?'global-awareness':routeLink.dataset.route);return;}const target=event.target.closest('[data-action]');if(target&&!target.disabled){event.preventDefault();if(integratedRoutes.has(routeFromHash())&&await approvedActions.action(target))return;void onAction(target.dataset.action);return;}if(state.openSelectId&&!event.target.closest('[data-vigia-select]'))commit(current=>current.openSelectId=null);});
document.addEventListener('change',event=>{if(event.target.dataset.control)approvedActions.change(event.target);});
window.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const disclosure=event.target.closest?.('.activity-overflow[open],.event-provenance[open]');if(!disclosure)return;event.preventDefault();event.stopImmediatePropagation();disclosure.open=false;disclosure.querySelector('summary')?.focus();},true);
app.addEventListener('keydown',event=>{const target=event.target.closest('[role="button"][data-action]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();target.click();}});
app.addEventListener('vigia:evidence-select',event=>{const id=event.detail?.evidenceId;if(id)commit(current=>current.selectedEvidenceId=id);});
app.addEventListener('vigia:map-action',async event=>{const action=event.detail?.action;if(!action)return;if(integratedRoutes.has(routeFromHash())&&await approvedActions.action({dataset:{action},closest:()=>null}))return;void onAction(action);});
let incidentSearchTimer=null,operationIncidentSearchTimer=null;
function scheduleIncidentSearch(input){clearTimeout(incidentSearchTimer);incidentSearchTimer=setTimeout(()=>{if(!input?.isConnected||incidentSearchComposing)return;state.incidentSearchDraft=input.value;state.incidentSearch=input.value;state.incidentPage=1;syncQuery('q',state.incidentSearch,{defaultValue:''});persist();patchIncidentSearchResults(input);},180);}
app.addEventListener('beforeinput',event=>{if(event.target.dataset.input!=='incident-search')return;event.target.dataset.searchBeforeValue=event.target.value;event.target.dataset.searchBeforeSelection=`${event.target.selectionStart}:${event.target.selectionEnd}`;event.target.dataset.searchResourceStart=String(performance.getEntriesByType('resource').length);});
app.addEventListener('compositionstart',event=>{if(event.target.dataset.input==='incident-search'){incidentSearchComposing=true;if(!incidentSearchNode?.isConnected)incidentSearchNode=event.target;}});
app.addEventListener('compositionend',event=>{if(event.target.dataset.input==='incident-search'){incidentSearchComposing=false;scheduleIncidentSearch(event.target);}});
app.addEventListener('input',event=>{const key=event.target.dataset.input;if(key==='incident-search'){if(!incidentSearchNode?.isConnected)incidentSearchNode=event.target;if(!event.target.dataset.domIdentity)event.target.dataset.domIdentity=crypto.randomUUID();state.incidentSearchDraft=event.target.value;const clear=event.target.closest('.search-field')?.querySelector('.search-field__clear');if(clear)clear.hidden=!event.target.value;if(!incidentSearchComposing)scheduleIncidentSearch(event.target);}if(key==='operation-incident-search'){state.operationIncidentSearch=event.target.value;persist();clearTimeout(operationIncidentSearchTimer);operationIncidentSearchTimer=setTimeout(()=>render(),120);}if(key==='incident-context-search'){state.incidentContextSearch=event.target.value;persist();clearTimeout(operationIncidentSearchTimer);operationIncidentSearchTimer=setTimeout(()=>render(),80);}if(key==='debt-search')commit(current=>current.debtSearch=event.target.value);});
app.addEventListener('change',event=>{const key=event.target.dataset.change,value=event.target.value;if(key==='incident-filter')commit(current=>{current.incidentStateFilter=value;current.incidentPage=1;});if(key==='incident-type')commit(current=>{current.incidentTypeFilter=value;current.incidentPage=1;});if(key==='incident-sort')commit(current=>{current.incidentSort=value;current.incidentPage=1;});if(key==='debt-filter')commit(current=>current.debtFilter=value);if(key==='global-region')commit(current=>current.globalRegion=value);if(key==='global-type')commit(current=>current.globalType=value);if(key==='global-priority')commit(current=>current.globalPriority=value);if(key==='global-status')commit(current=>current.globalStatus=value);if(key==='global-time')commit(current=>current.globalTime=value);});
app.addEventListener('vigia:map-camera-change',event=>{const identity=event.detail?.sceneIdentity,center=event.detail?.center,zoom=event.detail?.zoom,selectedIncidentId=event.detail?.selectedIncidentId??null;if(!identity||!Array.isArray(center)||!center.every(Number.isFinite)||!Number.isFinite(zoom))return;state.mapSceneCameras={...(state.mapSceneCameras??{}),[identity]:{...(state.mapSceneCameras?.[identity]??{}),center,zoom,selectedIncidentId}};persist();});
app.addEventListener('vigia:map-state',event=>{
  state.runtime.mapObservability=mapRuntimeSnapshot();
  const mapState=event.detail?.state;syncMapHealthLabel(event.target,mapState);
  const commandMapHealth=document.querySelector('[data-health-axis="map"] .signal');
  if(commandMapHealth){const failures=Number(state.runtime.mapObservability?.tileFailures??0),overlayFailures=Number(state.runtime.mapObservability?.overlayFailures??0),resolved=failures?'CRITICAL':mapState==='DEGRADED_PARTIAL'||overlayFailures?'DEGRADED':mapState==='LIVE'?'OPERATIONAL':mapState==='UNAVAILABLE'||mapState==='STRUCTURED_FALLBACK'?'CRITICAL':'NOT_MEASURED',resolvedTone=resolved==='OPERATIONAL'?'green':resolved==='DEGRADED'?'warning':resolved==='CRITICAL'?'critical':'info';commandMapHealth.className=`signal signal--${resolvedTone}`;commandMapHealth.textContent=operatorText(resolved);}
});
let locationRenderQueued=false;function onLocationChange(){if(locationRenderQueued)return;locationRenderQueued=true;queueMicrotask(()=>{locationRenderQueued=false;applyLocationState();persist();render({focusMain:true});const route=routeFromHash();if(incidentRoutes.has(route)&&state.selectedIncidentId)void loadIncident(state.selectedIncidentId,{quiet:true});else ensureGlobalProjection(route);});}
window.addEventListener('popstate',onLocationChange);
window.addEventListener('hashchange',onLocationChange);
window.addEventListener('resize',()=>{syncMobileNavigation();syncResponsiveDisclosures();});
window.addEventListener('online',()=>void refreshRuntime({quiet:true}));
window.addEventListener('keydown',event=>{noteOperatorInteraction();if(event.key==='Escape'&&document.querySelector('.vigia-dialog')){document.querySelector('[data-dialog-close]')?.click();return;}const keyboardAction=event.target.closest?.('[data-action]');if(keyboardAction&&!keyboardAction.matches('button,a,input,select,textarea')&&['Enter',' '].includes(event.key)){event.preventDefault();void onAction(keyboardAction.dataset.action);return;}const select=event.target.closest?.('[data-vigia-select]');if(select){const options=[...select.querySelectorAll('[role="option"]')],index=options.indexOf(event.target),move=target=>{event.preventDefault();options[target]?.focus();};if(event.key==='Escape'){event.preventDefault();const id=select.dataset.vigiaSelect;commit(current=>current.openSelectId=null);requestAnimationFrame(()=>document.querySelector(`[data-vigia-select-trigger="${CSS.escape(id)}"]`)?.focus());return;}if(!event.target.matches('input')&&options.length&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){if(event.key==='Home')move(0);else if(event.key==='End')move(options.length-1);else move((Math.max(0,index)+(event.key==='ArrowDown'?1:options.length-1))%options.length);return;}if(!event.target.matches('input')&&options.length&&event.key.length===1&&!event.metaKey&&!event.ctrlKey&&!event.altKey){const key=event.key.toLocaleLowerCase(),match=options.find(option=>option.textContent.trim().toLocaleLowerCase().startsWith(key));if(match){event.preventDefault();match.focus();return;}}if(event.target.matches('[data-vigia-select-trigger]')&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();void onAction(`select-toggle:${select.dataset.vigiaSelect}`);return;}}
  if(event.key==='Escape'&&event.target.matches?.('[data-input="incident-search"]')&&state.incidentSearch){event.preventDefault();void onAction('clear-incident-search');return;}
  const tab=event.target.closest?.('[role="tab"]');if(tab&&['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){const tabs=[...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab),target=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;event.preventDefault();tabs[target]?.focus({preventScroll:true});tabs[target]?.click();return;}
  if(event.key==='Escape'&&state.navOpen){setMobileNavigation(false);return;}const actionRow=event.target.closest?.('[data-action][tabindex="0"]');if(actionRow&&(event.key==='Enter'||event.key===' ')){event.preventDefault();void onAction(actionRow.dataset.action);return;}trapMobileNavigationFocus(event);});
for(const eventName of ['pointerover','focusin'])app.addEventListener(eventName,event=>{const action=event.target.closest?.('[data-action^="focus-incident:"],[data-action^="select-incident:"],[data-action^="open-incident-workspace:"],[data-action^="inspect-incident:"]')?.dataset.action,id=action?.slice(action.indexOf(':')+1);if(id&&id!==state.selectedIncidentId)void warmIncidentContext(vigiaApi,[id],payload=>{const previous=state.runtime.canonical.incidents[id]??{};if(Date.parse(previous.detail?.dependency?.lastAttemptAt??0)>Date.parse(payload.startedAt))return;const entries=Object.fromEntries(Object.entries(payload.results).map(([key,result])=>[key,retainedResult(previous[key],result)]));state.runtime.canonical.incidents[id]={...entries,loading:false};recordDependencies(Object.fromEntries(Object.entries(entries).map(([key,entry])=>[`incident:${id}:${key}`,entry])));persist();});});
if(!location.hash)history.replaceState({vigiaRoute:true},'',`${location.pathname}${location.search}#/command-overview`);
render({preserveScroll:false});
void refreshRuntime();
setInterval(()=>{if(backgroundRefreshEligible())void refreshRuntime({quiet:true});},60_000);
