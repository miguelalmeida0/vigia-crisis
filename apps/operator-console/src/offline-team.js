import * as maplibregl from '../assets/vendor/maplibre-gl/maplibre-gl.mjs';
import {FieldTeamStore} from './field-team-store.js';
import {MissionSlot,installMissionCommand} from './approved/ui/mission-command.js';
import {e} from './approved/ui/html.js';
const store=new FieldTeamStore(),host=document.querySelector('[data-offline-team]');
let map=null;
function lock(){host.classList.add('mission-command');map?.remove();map=null;document.getElementById('offline-map-list').replaceChildren();document.getElementById('offline-map-caption').textContent='Unlock this prepared device to view retained private information.';host.innerHTML='<h2>Unlock your field workspace</h2><form data-offline-unlock><label>Offline passphrase<input type="password" name="passphrase" autocomplete="current-password" required minlength="12"></label><button class="btn primary" type="submit">Unlock this device</button><p role="status"></p></form>';host.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;try{const bundle=await store.unlockOffline(new FormData(form).get('passphrase'));form.reset();render(bundle);}catch(error){form.querySelector('[role=status]').textContent=error.message;}});}
addEventListener('vigia-team-locked',lock);
lock();
function render({incident,session,view}){
  host.classList.remove('mission-command');
  host.innerHTML=MissionSlot();installMissionCommand({state:{selectedIncidentId:incident}});
  document.getElementById('offline-map-caption').textContent=`Stored ${new Date(view.at).toLocaleString()} · routes and named places only. Basemap imagery is not cached.`;
  const features=[];for(const place of view.context.catalog){if(place.coordinate)features.push({type:'Feature',properties:{name:place.name},geometry:{type:'Point',coordinates:place.coordinate}});for(const service of place.services)for(const route of service.routes)if(route.geometry)features.push({type:'Feature',properties:{name:route.name},geometry:route.geometry});}
  document.getElementById('offline-map-list').innerHTML=view.context.catalog.map(p=>`<p><strong>${e(p.name)}</strong></p>${p.services.flatMap(s=>s.routes).map(r=>`<p>${e(r.name)} · ${e(Math.round(r.minutes))} min · facility to ${r.direction==='FACILITY_TO_SETTLEMENT'?'community':'incident'} · calculated ${e(r.calculatedAt)}</p>`).join('')}`).join('');
  const center=view.context.catalog.find(p=>p.coordinate)?.coordinate??view.context.incident?.coordinate;
  if(center&&features.length){map=new maplibregl.Map({container:'offline-map',center,zoom:11,style:{version:8,sources:{retained:{type:'geojson',data:{type:'FeatureCollection',features}}},layers:[{id:'canvas',type:'background',paint:{'background-color':'#f8faff'}},{id:'routes',type:'line',source:'retained',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#175bb0','line-width':3}},{id:'places',type:'circle',source:'retained',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#175bb0','circle-radius':6,'circle-stroke-color':'#ffffff','circle-stroke-width':2}}]}});map.addControl(new maplibregl.NavigationControl());map.on('click','places',event=>{const f=event.features?.[0];if(f)new maplibregl.Popup().setLngLat(f.geometry.coordinates).setText(f.properties.name).addTo(map);});}
  else document.getElementById('offline-map-caption').textContent='No route geometry was stored. Team information remains available below.';
}
