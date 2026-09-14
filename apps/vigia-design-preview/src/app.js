import {createDemoProvider} from './data/provider.js';
import {parseRoute,routeURL,incidentFor,initialState,isReadonly} from './data/model.js';
import {BASE_INCIDENTS,REGIONS} from './data/fixtures.js';
import {shell,ROUTES} from './ui/shell.js';
import {button,empty} from './ui/html.js';
import {initMaps} from './ui/map.js';
import {toast} from './ui/dialog.js';
import {overview} from './routes/overview.js';
import {incidents} from './routes/incidents.js';
import {detail} from './routes/detail.js';
import {intelligence} from './routes/intelligence.js';
import {operations} from './routes/operations.js';
import {reports} from './routes/reports.js';
import {national} from './routes/national.js';
import {createActions} from './actions.js';
const provider=createDemoProvider();let state=provider.read();
const ui={route:'command-overview',page:1,incidentFilters:{search:'',status:'all',type:'all',priority:'all',region:'all'},taskTab:'all',taskId:null,reportTab:'performance',period:'24h',compare:false,region:'Norte',nationalLayer:'incidents'};
const renderers={'command-overview':overview,incidents,'incident-detail':detail,intelligence,operations,'reports-analytics':reports,'national-awareness':national};
function persist(next){state=next;if(!provider.write(state))toast('Storage is unavailable. Changes will last only for this session.');}
function render({focus=false}={}){
 const active=document.activeElement;const tabFocus=active?.getAttribute('role')==='tab'?{action:active.dataset.action,tab:active.dataset.tab}:null;const control=active?.dataset?.control;const selection=active?.tagName==='INPUT'?active.selectionStart:null;
 const content=renderers[ui.route]?renderers[ui.route](state,ui):empty('Page not found','This route is not part of the design preview.',button('Go to overview','navigate',{extra:'data-route="command-overview"'}));
 document.getElementById('app').innerHTML=shell(ui.route,state,content);document.querySelector('.vg-sidebar').inert=innerWidth<=760;document.body.style.overflow='';initMaps(document.getElementById('app'));
 document.title=`${ROUTES.find(x=>x[0]===ui.route)?.[1]||'Not found'} · VIGIA preview`;
 if(control){const next=document.querySelector(`[data-control="${CSS.escape(control)}"]`);next?.focus({preventScroll:true});if(next?.type==='search'&&selection!==null)next.setSelectionRange(selection,selection);}
 else if(tabFocus){const target=document.querySelector(`[data-action="${CSS.escape(tabFocus.action)}"][data-tab="${CSS.escape(tabFocus.tab)}"]`);if(target)target.focus({preventScroll:true});else if(focus)document.getElementById('page-content')?.focus({preventScroll:true});}
 else if(focus)document.getElementById('page-content')?.focus({preventScroll:true});
}
function navigate(route,incidentId=state.selected,extra={}){const next=routeURL(route,incidentId,extra);if(location.hash===next){readHash();return;}location.hash=next;}
function readHash(){const {route,params}=parseRoute(location.hash);const previous=ui.route;ui.route=route;
 if(params.has('id')){const id=params.get('id');if(id!==state.selected){persist({...state,selected:id});ui.taskId=null;}}
 if(params.has('region')&&REGIONS.includes(params.get('region'))){ui.region=params.get('region');ui.incidentFilters.region=ui.region;ui.page=1;}
 if(params.has('view')){const aliases={system:'performance',outcome:'outcomes',decisions:'decisions'};const tab=aliases[params.get('view')]||params.get('view');if(['performance','decisions','outcomes','quality'].includes(tab))ui.reportTab=tab;}
 render({focus:true});if(previous!==route)window.scrollTo(0,0);
 document.getElementById('announcer').textContent=`${ROUTES.find(x=>x[0]===route)?.[1]||'Page not found'} loaded.`;
}
const api={get state(){return state;},ui,persist,render,navigate,provider};
const actions=createActions(api);
document.addEventListener('click',async event=>{
 const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
 const action=actions[target.dataset.action];if(!action)return;
 try{await action(target,event);}catch(error){toast(error.message||'The action could not be completed.');}
});
document.addEventListener('input',event=>{const el=event.target;if(el.dataset.control==='incident-search'){ui.incidentFilters.search=el.value;ui.page=1;render();}});
document.addEventListener('change',event=>{const el=event.target;const c=el.dataset.control;if(!c)return;
 if(c==='variant'){persist({...state,variant:el.value});render();return;}
 if(c==='task-owner')return;
 if(c==='incident-status')ui.incidentFilters.status=el.value;
 if(c==='incident-type')ui.incidentFilters.type=el.value;
 if(c==='incident-priority')ui.incidentFilters.priority=el.value;
 if(c==='report-period')ui.period=el.value;
 if(c==='region')ui.region=el.value;
 if(c==='national-layer')ui.nationalLayer=el.value;
 ui.page=1;render();
});
document.addEventListener('keydown',event=>{
 const menu=document.querySelector('.vg-sidebar.menu-open');
 if(menu){if(event.key==='Escape'){event.preventDefault();actions['close-menu']();return;}if(event.key==='Tab'){const stops=[...menu.querySelectorAll('a[href],button:not([disabled])')].filter(e=>e.offsetParent!==null);const first=stops[0],last=stops.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
 const tab=event.target.closest('[role="tab"]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')];let i=tabs.indexOf(tab);i=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();const action=tabs[i].dataset.action,key=tabs[i].dataset.tab;tabs[i].click();document.querySelector(`[data-action="${action}"][data-tab="${key}"]`)?.focus();
});
window.addEventListener('hashchange',readHash);
window.addEventListener('resize',()=>{const sidebar=document.querySelector('.vg-sidebar');if(innerWidth>760){sidebar?.classList.remove('menu-open');document.querySelector('.mobile-shade')?.classList.remove('open');document.querySelector('.vg-main').inert=false;document.body.style.overflow='';}if(sidebar)sidebar.inert=innerWidth<=760&&!sidebar.classList.contains('menu-open');});
readHash();
// Intentional, read-only diagnostic contract for browser smoke tests and host integration.
Object.defineProperty(window,'VIGIA_PREVIEW',{value:Object.freeze({version:'1.0.0',mode:'demo',getSnapshot:()=>provider.read(),getRoute:()=>ui.route}),writable:false});
