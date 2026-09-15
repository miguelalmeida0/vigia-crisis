import {createDemoSession,DEMO_LABEL} from './scenario.mjs';
import {consoleState} from './projection.mjs';
import {renderApprovedRoute} from '../apps/operator-console/src/approved/index.js';
import {consequenceSection} from '../apps/operator-console/src/approved/ui/operational-consequence.js';
import {e} from '../apps/operator-console/src/approved/ui/html.js';
import * as maplibregl from '../apps/operator-console/assets/vendor/maplibre-gl/maplibre-gl.mjs';
import boundary from '../data/replay/raw/openstreetmap/portugal-thermal-context-v1/portugal-boundary.json';

maplibregl.setWorkerUrl('./maplibre-gl-worker.mjs');
const session=createDemoSession(),app=document.querySelector('#app');
let snapshot=session.snapshot(),map=null;
const routes={'command-overview':'command-overview',incidents:'incidents','incident-detail':'incident-detail','fire-activity':'intelligence','response-access':'operations','national-awareness':'global-awareness'};
const button=(label,action,id='')=>`<button type="button" class="btn" data-demo="${e(action)}" data-id="${e(id)}">${e(label)}</button>`;
const serviceName=m=>m.service==='fire_response'?'Fire response':'Emergency healthcare';
const humanState=s=>({PROBLEM:'Needs attention',STALE:'Needs a new check',WATCHING:'Watching',UNKNOWN:'Unknown'}[s]??s.replaceAll('_',' ').toLowerCase());
function missions(){return consequenceSection(snapshot.current,{btn:button})+snapshot.facts.missions.map(m=>`<article class="demo-mission"><h3>${serviceName(m)}</h3><strong>${e(humanState(m.state))}</strong><p>${e(m.reason)}</p><p class="mc-meta">${m.currentRoute?`${e(m.currentRoute.roads.join(' → '))} · ${m.currentRoute.minutes} min stored route`:'No current stored route'}${m.fallback?` · ${m.fallback.minutes} min alternative`:' · No current alternative'}</p>${button('Inspect route options','routes',m.id)}</article>`).join('');}
function planning(){return `<details class="demo-planning"><summary>Resource feasibility & evening schedules</summary><p>Advisory calculations from this synthetic scenario. Nothing is dispatched.</p><h3>Resource feasibility</h3>${Object.values(snapshot.planning.candidates).flat().map(c=>`<article><strong>${e(c.resourceName)} · ${e(humanState(c.state))}</strong><p>${e(c.decisiveConstraint?.reason)}</p></article>`).join('')}<h3>Evening period · 18:20–22:20 UTC</h3><p>Period schedules model resource delays. Road blockage and information expiry are evaluated above; they do not change these schedules.</p>${snapshot.period.schedules.map(s=>`<details><summary>${e(s.label)} · ${e(humanState(s.globalState))}</summary><p>${e(s.rationale)}</p>${s.assignments.map(a=>`<p><strong>${e(a.resourceName)} → ${e(a.subjectName)}</strong><br>${e(a.window.reason)}</p>`).join('')}${s.unfilledSlots.length?`<p>${s.unfilledSlots.length} unfilled slots</p>`:''}</details>`).join('')}</details>`;}
function mountMap(route){
 const canvas=app.querySelector('.map-canvas');if(!canvas)return;
 canvas.innerHTML='<div id="demo-map" aria-label="Synthetic scenario geography"></div><p class="demo-map-note">Retained Portugal boundary · synthetic route geometry · no live basemap or safe-passage claim</p>';
 const national=route==='command-overview'||route==='global-awareness';
 const roads=[...new Map(snapshot.facts.catalog[0].services.flatMap(s=>s.routes).map(r=>[r.roads[0],r])).values()];
 const features=roads.map(r=>({type:'Feature',properties:{name:r.roads[0],blocked:snapshot.state.blocked&&r.roads[0]==='EM527'},geometry:r.geometry}));
 map=new maplibregl.Map({container:'demo-map',center:national?[-7.95,39.55]:[-7.908,38.58],zoom:national?5.5:12,attributionControl:false,
  style:{version:8,sources:{boundary:{type:'geojson',data:{type:'Feature',properties:{},geometry:boundary[0].geojson}},routes:{type:'geojson',data:{type:'FeatureCollection',features}}},layers:[
   {id:'background',type:'background',paint:{'background-color':'#eef3f4'}},
   {id:'land',type:'fill',source:'boundary',paint:{'fill-color':'#f8faf8','fill-outline-color':'#a0b2b7'}},
   {id:'roads',type:'line',source:'routes',paint:{'line-color':['case',['get','blocked'],'#b73335','#48716a'],'line-width':5}}]}});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
 map.addControl(new maplibregl.AttributionControl({compact:true,customAttribution:'© OpenStreetMap contributors · ODbL 1.0'}));
 const marker=document.createElement('button');marker.className='demo-map-marker';marker.textContent='Évora scenario';marker.addEventListener('click',()=>{location.hash='/incident-detail?id=portfolio-evora';});new maplibregl.Marker({element:marker}).setLngLat([-7.909,38.571]).addTo(map);
 if(!national)for(const r of roads){const label=document.createElement('span');label.className='demo-road-label';label.textContent=r.roads[0]+' · synthetic';new maplibregl.Marker({element:label}).setLngLat(r.geometry.coordinates[0]).addTo(map);}
 map.on('error',()=>{canvas.querySelector('.demo-map-note').textContent='Map rendering unavailable. Stored routes remain inspectable in the mission panel.';});
}
function render(){
 map?.remove();map=null;
 const route=routes[location.hash.slice(2).split('?')[0]]??'command-overview';
 app.innerHTML=renderApprovedRoute(route,consoleState(snapshot));
 const content=app.querySelector('main');
 content.insertAdjacentHTML('afterbegin',`<section class="demo-orientation" aria-label="Portfolio scenario"><strong>${DEMO_LABEL}</strong><p>Explore how one road report affects healthcare and fire response. Every incident, facility, route and resource is synthetic. Changes stay in this tab.</p><div class="mc-actions">${button(snapshot.state.blocked?'Road blocked':'Block EM527','block-road')}${button(snapshot.state.aged?'Information expired':'Expire road information','age-road-information')}${button(snapshot.state.delayed?'Engine delayed':'Delay Engine 8 · 60 min','delay-resource')}${button('Reset scenario','reset')}</div><p role="status">Scenario time: ${e(snapshot.facts.at.replace('T',' ').replace('.000Z',' UTC'))}</p></section>`);
 const slot=app.querySelector('[data-mission-command]');if(slot)slot.innerHTML='<h2>Important now</h2>'+missions()+planning();
 else content.insertAdjacentHTML('beforeend','<section class="mission-command demo-wide"><h2>Scenario consequences</h2>'+missions()+planning()+'</section>');
 app.querySelectorAll('[data-operational-picture]').forEach(el=>{el.textContent='This public scenario exposes the mission consequences above. Operational data services are not connected.';});
 app.querySelectorAll('.demo-pill').forEach(el=>{el.textContent='Local scenario';});
 app.querySelectorAll('.sidebar-user small').forEach((el,i)=>{el.textContent=i===0?'Synthetic scenario':'No operational account';});
 const situation=app.querySelector('.situation-copy h2');if(situation)situation.textContent='Portugal · controlled scenario';
 mountMap(route);
 const handled=new Set(['nav-toggle','nav-close','navigate','open-incident','choose-incident','refresh-runtime','fit-map-results']);
 app.querySelectorAll('button[data-action]').forEach(el=>{if(!handled.has(el.dataset.action)){el.disabled=true;el.title='Not connected in this public scenario';}});
 app.querySelectorAll('[data-control]').forEach(el=>{el.disabled=true;el.title='The public scenario contains one incident';});
}
function inspect(kind,id){
 const mission=snapshot.facts.missions.find(m=>m.id===id)??snapshot.facts.missions[0];
 const old=document.activeElement,dialog=document.createElement('dialog');dialog.className='demo-dialog';
 dialog.innerHTML=`<button class="btn" data-close>Close</button><h2>${kind==='report'?'Synthetic field report':e(serviceName(mission)+' · stored routes')}</h2>${kind==='report'?snapshot.facts.reports.map(r=>`<p>${e(r.note)}</p><p>Observed ${e(r.observedAt)}<br>Received ${e(r.receivedAt)}<br>Valid until ${e(r.validUntil)}</p>`).join(''):mission.savedRoutes.map(r=>`<article><h3>${e(r.name)}</h3><p>${e(r.roads.join(' → '))} · ${r.minutes} min · facility to incident</p><p>Alternative road conditions are unconfirmed. Calculations do not establish safe access.</p></article>`).join('')}`;
 document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();old?.focus();};dialog.showModal();
}
app.addEventListener('click',event=>{const target=event.target.closest('button');if(!target||target.disabled)return;const cmd=target.dataset.demo;
 if(cmd){if(['routes','mission','report'].includes(cmd)){inspect(cmd,target.dataset.id);return;}snapshot=session.apply(cmd);render();app.querySelector(`[data-demo="${cmd}"]`)?.focus();return;}
 const action=target.dataset.action;
 if(action==='nav-toggle'||action==='nav-close'){document.body.classList.toggle('demo-nav-open',action==='nav-toggle');return;}
 if(action==='open-incident'||action==='choose-incident')location.hash='/incident-detail?id=portfolio-evora';
 if(action==='navigate')location.hash='/'+target.dataset.route;
 if(action==='refresh-runtime')render();
 if(action==='fit-map-results')map?.flyTo({center:[-7.95,39.55],zoom:5.5,duration:0});
});
addEventListener('hashchange',()=>{document.body.classList.remove('demo-nav-open');render();app.querySelector('main')?.focus();});
render();
