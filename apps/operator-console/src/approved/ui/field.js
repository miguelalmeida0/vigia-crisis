import { e,button,link } from './html.js';
import { icon } from './signal-icons.js';
import { panel } from './section-panel.js';
import { mapView } from './map.js';
import { ConditionsOverTime } from './trends.js';
import { facilityKinds,number,coordinate,dated,clock,day,measured,usable } from '../data/field.js';

const tones={temperature:'blue',humidity:'blue',wind:'blue',windDirection:'blue',rain:'blue',thermal60:'blue',thermalTime:'blue',fireDanger:'amber',station:'blue'};
const symbols={temperature:'temperature',humidity:'droplet',wind:'wind',windDirection:'arrow-up',rain:'rain',thermal60:'flame',thermalTime:'clock',fireDanger:'alert',station:'pin'};
const names={thermal60:'Thermal detections · 1h',wind:'Wind speed',windDirection:'Wind from',rain:'Rain · previous hour'};

export function FieldMetric(m,{label,iconName,tone,detail,meta,action=true,sharedContext=false}={}) {
 if(!usable(m))return '';
 const at=m.observedAt??m.calculatedAt;
 const direction=m.id==='wind'&&m.direction?` · ${m.direction}`:'';
 const shown=m.id==='thermalTime'?clock(m.value):m.value;
 const trend=m.trend&&number(m.trend.delta)?`${m.trend.delta>0?'+':''}${m.trend.delta} ${m.unit} / ${m.trend.minutes} min`:null;
 return `<article class="field-metric ${e(tone??tones[m.id]??'blue')}" data-vqa="metric-${e(m.id)}" data-shared-observation="${sharedContext}"><span class="field-metric-icon">${icon(iconName??symbols[m.id]??'pin')}</span><div class="field-metric-copy"><h2>${e(label??names[m.id]??m.label)}</h2><strong class="field-value">${e(shown)}<span>${e(m.id==='thermalTime'?'UTC':m.unit)}${e(direction)}</span></strong><p>${e(detail??m.sourceLocation?.name??m.sourceName??m.source)}</p><small>${e(meta??measured(at))}</small></div>${m.sparkline?`<svg class="field-sparkline" viewBox="0 0 100 28" aria-label="${e(m.label)} measurement history" role="img"><polyline points="${e(m.sparkline)}"/></svg>`:''}${action?`<button class="field-metric-inspect" data-action="fact-inspect" data-id="${e(m.id)}" aria-label="Measurement details: ${e(m.label)}">${icon('info')}</button>`:''}</article>`;
}

export function FieldSignals(f,{response=false}={}) {
 let metrics;
 if(response){
  const nearest=f.facilities.FIRE_STATION[0],hospital=f.facilities.HOSPITAL[0];
  const facilityMetric=(facility,id,label)=>facility?{id,label,available:true,value:facility.distanceKm,unit:'km',source:facility.provenance.provider,calculatedAt:f.response?.generatedAt,sourceLocation:{name:facility.name}}:null;
  metrics=[FieldMetric(facilityMetric(nearest,'fire-station','Nearby fire station'),{iconName:'flame',tone:'red',detail:nearest?.name,meta:'Straight-line distance',action:false}),FieldMetric(facilityMetric(hospital,'hospital','Nearby hospital'),{iconName:'plus',tone:'red',detail:hospital?.name,meta:'Straight-line distance',action:false}),...['wind','temperature','humidity'].map(id=>FieldMetric(f.metrics[id]))];
 }else metrics=['temperature','wind','humidity','rain','fireDanger','thermal60','thermalTime'].map(id=>FieldMetric(f.metrics[id],id==='thermal60'?{detail:number(f.thermalRadiusKm)?`Within ${f.thermalRadiusKm} km · NASA FIRMS`:'NASA FIRMS source query'}:{sharedContext:['temperature','wind','humidity','rain'].includes(id)&&f.metrics[id]?.observedAt===f.station?.observedAt}));
 if(!metrics.some(Boolean)&&f.station&&number(f.station.distanceKm)&&dated(f.station.observedAt))metrics.push(FieldMetric({id:'station',label:'Observation station',available:true,value:f.station.distanceKm,unit:'km',source:f.station.source,observedAt:f.station.observedAt},{iconName:'pin',detail:f.station.name,meta:'From incident · straight line',action:false}));
 const shown=metrics.filter(Boolean).slice(0,6);
 return shown.length?`<section class="field-signals" aria-label="${response?'Response snapshot':'Latest observations'}" data-vqa="field-signals" style="--signal-count:${shown.length}">${shown.join('')}</section>`:'';
}

export function FieldBanner(vm,f,{response=false}={}) {
 const name=vm.incident.name,station=f.station,weather=['temperature','wind','humidity','rain'].map(id=>f.metrics[id]).filter(usable),retained=weather.some(m=>m.tone==='stale'||m.status==='SOURCE_UNAVAILABLE'),sourceFailed=weather.some(m=>m.status==='SOURCE_UNAVAILABLE');
 const copy=response?'Locate mapped support points and compare road-network estimates.':station?`Weather measured at ${station.name}${number(station.distanceKm)?`, ${station.distanceKm} km from the incident`:''}. Conditions at the fire may differ. ${measured(station.observedAt)}.${retained?' Stale readings'+(sourceFailed?' · source failed.':'.'):''}`:'Explore the incident location and its dated field observations.';
 return `<section class="field-banner" data-vqa="field-banner"><span class="field-banner-icon">${icon(response?'pin':'flame')}</span><div><h2>${e(name)} <span>· ${response?'Response context':'Fire activity'}</span></h2><p>${e(copy)}</p></div>${button('Change incident','choose-incident',{ico:'down',tone:'small-btn'})}</section>`;
}

export function FieldMap(vm,{response=false}={}) {
 return panel(response?'Incident area, access and support points':'Incident area and thermal activity',mapView({state:vm,id:response?'response-access-map':'fire-activity-map',height:408,title:vm.incident.name,legend:false,caption:false,field:true}),{ico:response?'home':'flame',cls:'field-map-panel',sub:response?'Mapped facilities, road-network routes and surrounding geography.':'Incident location, dated observations and surrounding geography.',action:button('Map layers','map-layers',{ico:'layers',tone:'icon-button'})});
}

export function FieldFeed(events,{title='What changed',subtitle='Dated field observations near the incident.',limit=5,id='field-changes'}={}) {
 if(!events.length)return '';
 const items=events.slice(0,limit);
 const row=c=>`<article class="field-event"><time datetime="${e(c.at)}"><strong>${e(clock(c.at))}</strong><span>${e(day(c.at))}</span></time><span class="field-event-type">${icon(c.type==='Weather'?'wind':c.type==='Fire detection'?'flame':c.type==='Road'?'map':'bell')}<span>${e(c.type)}</span></span><div><p>${e(c.text)}</p>${c.where?`<small>${e(c.where)}</small>`:''}</div><span class="field-source">${e(c.source)}</span></article>`;
 return panel(title,`<div class="field-feed" data-vqa="${e(id)}">${items.map(row).join('')}${events.length>limit?`<details class="field-more"><summary>Show ${events.length-limit} more updates</summary>${events.slice(limit).map(row).join('')}</details>`:''}</div>`,{ico:'clock',cls:'field-feed-panel',sub:subtitle});
}

export const WeatherHistory=ConditionsOverTime;

export function ObservationContext(f) {
 const keys=['temperature','humidity','wind','rain'],facts=keys.map(k=>f.metrics[k]).filter(usable);
 if(!facts.length)return '';
 return panel('Environmental conditions',`<dl class="field-facts">${facts.map(m=>`<div>${icon(symbols[m.id])}<dt>${e(names[m.id]??m.label)}</dt><dd><strong>${e(m.value)} ${e(m.unit)}${m.id==='wind'&&m.direction?' · from '+e(m.direction):''}</strong><span>${e(m.definition?.statistic??m.sourceName??m.source)}</span></dd></div>`).join('')}</dl>${f.station?`<div class="field-footnote">${icon('pin')}<span>${e(f.station.name)}${number(f.station.distanceKm)?' · '+e(f.station.distanceKm)+' km away':''} · ${e(measured(f.station.observedAt))}</span></div>`:''}`,{ico:'wind',sub:'Measurements at the observation station.'});
}

export function ThermalPanel(f) {
 const time=f.metrics.thermalTime;
 if(!usable(time))return '';
 return panel('Latest thermal detection',`<dl class="field-facts">${['thermalTime','thermalLatestDistance','thermalProduct','frp'].map(k=>f.metrics[k]).filter(usable).map(m=>`<div>${icon('flame')}<dt>${e(m.label)}</dt><dd><strong>${e(m.id==='thermalTime'?measured(m.value):m.value)} ${e(m.unit)}</strong><span>${e(m.sourceName??m.source)}</span></dd></div>`).join('')}</dl><p class="field-footnote">A thermal observation identifies heat at the acquisition time; it does not trace a fire perimeter.</p>`,{ico:'flame',iconTone:'red'});
}

export function OfficialNotices(f) {
 if(!f.warnings.length)return '';
 return panel('Official weather notices',`<div class="field-notices">${f.warnings.map(w=>`<article><strong>${e(w.headline??w.title??w.awarenessTypeName??w.event??w.type??w.label)}</strong><p>${e(w.text??w.description??w.areaName??'')}</p><small>${e(measured(w.effective))} – ${e(measured(w.expires))} · IPMA</small></article>`).join('')}</div>`,{ico:'bell',iconTone:'amber'});
}

export function FacilityTable(f) {
 if(!f.kinds.length)return '';
 const items=f.facilities[f.kind];
 const row=facility=>`<tr><th scope="row"><button type="button" data-action="field-facility" data-id="${e(facility.canonicalId??facility.id)}">${e(facility.name)}${icon('arrow')}</button></th><td data-label="Straight line">${e(facility.distanceKm)} km</td><td data-label="Road estimate">${facility.reachability?.state==='ROUTED'&&number(facility.reachability.travelTimeMinutes)?e(facility.reachability.travelTimeMinutes)+' min':'Mapped location'}</td></tr>`;
 return panel('Mapped support points',`<div class="field-facility-tabs" aria-label="Facility type">${f.kinds.map(k=>`<button type="button" data-action="field-facility-tab" data-kind="${e(k)}" aria-pressed="${f.kind===k}">${icon(facilityKinds[k][1])}${e(facilityKinds[k][0])}<span>${f.facilities[k].length}</span></button>`).join('')}</div><table class="field-table" data-vqa="facility-table"><thead><tr><th>Name</th><th>Straight line</th><th>Road estimate</th></tr></thead><tbody>${items.slice(0,4).map(row).join('')}</tbody></table>${items.length>4?`<details class="field-more"><summary>Show all ${items.length} returned ${e(facilityKinds[f.kind][0].toLowerCase())}</summary><table class="field-table"><tbody>${items.slice(4).map(row).join('')}</tbody></table></details>`:''}<p class="field-footnote">OpenStreetMap · Mapped locations. Check service and crew availability directly.</p>`,{ico:'home',cls:'field-facilities-panel',sub:'Returned facilities around this incident. Select a name for details.'});
}

export function RoadOptions(f) {
 if(!f.routes.length)return '';
 // Prefer one of each response kind; this is presentation grouping, not a
 // recommendation or dispatch ranking.
 const kinds=new Set();const routes=f.routes.filter(r=>{if(kinds.has(r.kind))return false;kinds.add(r.kind);return true;}).slice(0,3);
 return panel('Road-network estimates',`<div class="field-route-options">${routes.map(r=>`<article><span class="field-route-kind">${icon(facilityKinds[r.kind][1])}${e(facilityKinds[r.kind][0])}</span><h3>${e(r.name)}</h3><p>Facility → incident</p><div class="field-route-numbers"><strong>${e(r.reachability.travelTimeMinutes)} <span>min</span></strong><span>${e(r.reachability.routeDistanceKm)} km</span></div><small>OSRM · ${e(measured(r.reachability.checkedAt))}</small>${button('Route details','field-facility',{tone:'small-btn',extra:`data-id="${e(r.canonicalId??r.id)}"`})}</article>`).join('')}</div><p class="field-footnote">Road-network estimates exclude live closures, traffic and emergency access restrictions. Check the route with field teams before travel.</p>`,{ico:'map',cls:'field-routes-panel',sub:'Planning context from the public road network.'});
}

export function LocationContext(vm,f) {
 const rows=[['Incident area',vm.incident.region],coordinate(vm.incident.coordinate)?['Incident coordinates',`${vm.incident.lat.toFixed(5)}, ${vm.incident.lon.toFixed(5)}`]:null,f.station?.name?['Weather station',`${f.station.name}${number(f.station.distanceKm)?' · '+f.station.distanceKm+' km away':''}`]:null].filter(r=>r&&r[1]&&!/unknown|not reported/i.test(r[1]));
 if(!rows.length)return '';
 return panel('Location & surroundings',`<dl class="field-location">${rows.map(([l,v])=>`<div><dt>${e(l)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>`,{ico:'pin',sub:'Geographic context for the selected incident.'});
}

export function WhyNow(f) {
 const wind=f.metrics.wind,rain=f.metrics.rain,notes=[];
 if(usable(wind))notes.push(`Wind measured at ${wind.sourceLocation?.name??f.station?.name??'the station'}: ${wind.value} km/h${wind.direction?' from '+wind.direction:''}, ${measured(wind.observedAt)}. Use local observations to assess conditions at the incident.`);
 if(usable(rain)&&rain.value>0)notes.push(`${rain.value} mm of rain measured in the previous hour at ${rain.sourceLocation?.name??'the station'}.`);
 if(f.routes.length)notes.push('Compare the mapped approaches, then check road restrictions and facility availability with field teams.');
 if(!notes.length)return '';
 return panel('Why this matters now',`<div class="field-why">${notes.map(n=>`<p>${icon('arrow')}${e(n)}</p>`).join('')}</div>`,{ico:'target',cls:'field-why-panel',sub:'Practical context for the next field check.'});
}

export {FacilityDetail} from './facility-detail.js';
