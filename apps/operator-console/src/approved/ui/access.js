import {facilityTypeLabel} from './facility-detail.js';
import {e,button} from './html.js';
import {icon} from './signal-icons.js';
import {rankedRoutes,nearestSupport,primaryMetric} from '../data/hierarchy.js';
import {facilityKinds,number,measured} from '../data/field.js';

const category={FIRE_STATION:'Fire station',WATER_POINT:'Water point',POLICE:'Police',PUBLIC_INSTITUTION:'Public institution',HOSPITAL:'Hospital',CIVIL_PROTECTION:'Civil protection',AIR_SUPPORT_BASE:'Air base',EMS_BASE:'Medical base',SHELTER:'Shelter'};
const routeCopy=r=>`${r.reachability.travelTimeMinutes} min · ${r.reachability.routeDistanceKm} km`;
export function ResponseCoverage(f) {
  if(f.response)return '';
  return `<div class="response-coverage" role="status"><p>Support mapping and road estimates could not be loaded. Refresh to retry before comparing mapped approaches.</p>${button('Retry support data','refresh-runtime',{tone:'small-btn',ico:'refresh'})}</div>`;
}
export function ResponseSnapshot(f) {
 const best=rankedRoutes(f)[0],nearest=nearestSupport(f)[0],point=best??nearest;
 if(!point)return '';
 return `<section class="response-snapshot" data-vqa="response-snapshot" aria-labelledby="response-snapshot-heading">
 <header class="snapshot-heading"><h2 id="response-snapshot-heading">Response snapshot</h2><span>${best?'Shortest available road estimate to the incident':'Closest returned support location'}</span></header>
 <div class="snapshot-summary"><div class="snapshot-place"><h3>${e(point.name)}</h3><p>${e(facilityTypeLabel(point))}${point.address?' · '+e(point.address):''}</p></div>
 <dl class="snapshot-facts">${best?`<div><dt>Estimated drive</dt><dd>${e(best.reachability.travelTimeMinutes)} <span>min</span></dd></div><div><dt>Road distance</dt><dd>${e(best.reachability.routeDistanceKm)} <span>km</span></dd></div>`:`<div><dt>Straight-line distance</dt><dd>${e(point.distanceKm)} <span>km</span></dd></div>`}</dl>
 ${button('View facility details','field-facility',{ico:'arrow',extra:`data-id="${e(point.canonicalId??point.id)}"`})}</div>
 <p class="snapshot-note">${best?'Facility → incident · Traffic and closures excluded. Confirm road status before travel.':'Availability unconfirmed. Contact the facility before travelling.'}</p></section>`;

}

export function AccessApproaches(f) {
  const routes=rankedRoutes(f).slice(0,3);
  if(!routes.length)return '';
  return `<section class="access-approaches" data-vqa="access-approaches"><header><h2>Access approaches</h2><p>Shortest returned facility-to-incident road estimates</p></header><ol>${routes.map((r,n)=>`<li class="${n===0?'first-approach':''}"><span class="approach-rank">${n+1}</span><div><h3>${e(r.name)}</h3><p>${e(facilityTypeLabel(r))} → incident</p><small>Road-network estimate · ${e(measured(r.reachability.checkedAt))}</small></div><div class="approach-value"><strong>${e(r.reachability.travelTimeMinutes)} <span>min</span></strong><span>${e(r.reachability.routeDistanceKm)} km</span></div>${button('View route details','field-facility',{tone:'small-btn',extra:`data-id="${e(r.canonicalId??r.id)}"`})}</li>`).join('')}</ol><p class="access-qualification">OSRM · estimates exclude live closures, traffic and emergency access restrictions. Confirm road status before movement.</p></section>`;
}

export function NearestSupport(f) {
  const support=nearestSupport(f).slice(0,6);
  if(!support.length)return '';
  return `<section class="nearest-support" data-vqa="nearest-support"><header><div><h2>Nearest support</h2><p>Closest returned location per category · straight-line ranking</p></div>${button('View all support points','all-support',{tone:'small-btn',ico:'arrow'})}</header><div class="support-priority-list">${support.map(s=>`<button type="button" class="support-priority" data-action="field-facility" data-id="${e(s.id)}"><span class="support-symbol">${icon(facilityKinds[s.kind]?.[1]??'pin')}</span><span><small>${e(category[s.kind])}</small><strong>${e(s.name)}</strong></span><span class="support-distance"><b>${e(s.distanceKm)} km</b><small>Straight line</small>${rankedRoutes({routes:[s]}).length?`<small>${e(routeCopy(s))} · road estimate</small>`:''}</span>${icon('arrow')}</button>`).join('')}</div><p class="support-qualification">Mapped presence does not establish staffing, capacity or availability.</p></section>`;
}

export function AccessConditions(f) {
  const wind=f.metrics.wind,rain=f.metrics.rain,rows=[];
  if(primaryMetric(wind))rows.push(['Wind',`${wind.value} km/h${wind.direction?' · from '+wind.direction:''}`]);
  if(f.station?.name&&number(f.station.distanceKm))rows.push(['Weather station',`${f.station.name} · ${f.station.distanceKm} km away`]);
  if(primaryMetric(rain))rows.push(['Rain',`${rain.value} mm${rain.definition?.periodMinutes?' · previous '+rain.definition.periodMinutes+' min':''}`]);
  if(!rows.length)return '';
  return `<section class="access-conditions" data-vqa="access-conditions"><h2>Access conditions</h2><dl>${rows.map(([k,v])=>`<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>${f.station?.observedAt?`<small>Station measured ${e(measured(f.station.observedAt))}. Conditions at the incident may differ.</small>`:''}</section>`;
}

export function AccessInterpretation(f) {
 if(!rankedRoutes(f).length&&!nearestSupport(f).length)return '';
 return `<section class="access-interpretation" data-vqa="access-interpretation"><h2>${icon('target')}Before field movement</h2><p>Confirm road status and facility availability. These mapped estimates exclude live closures, traffic and emergency access restrictions.</p><p>Mapped presence does not establish staffing, capacity or operational availability.</p></section>`;
}
