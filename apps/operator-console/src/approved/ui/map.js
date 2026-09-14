import { mapPalette,incidentMapSymbols,facilityMapSymbol } from '../../mapStyle.js';
import { canonicalMap } from '../../canonicalComponents.js?v=3.0.0';
import { filterIncidents, rows } from '../data/model.js';
import { e, button } from './html.js';

function layerLegend(scene,runtime) {
 const names={incidentPoints:'Incident records',observations:'Thermal observations',thermalSupport:'Thermal support',weather:'Weather',wind:'Wind',basemapLabels:'Map labels'};
 const declared=[...new Set([...(scene.layerSet??Object.keys(scene.layers??{})),'basemapLabels'])];
 const shown=declared.filter(name=>names[name]).slice(0,5),visibility=runtime.mapLayerVisibility?.[scene.sceneId]??{};
 return `<div class="map-layer-legend" aria-label="Visible map layers">${shown.map(name=>{const layer=scene.layers?.[name],available=name==='basemapLabels'||['READY','DEGRADED'].includes(layer?.state)&&(layer?.inventory?.returned??rows(layer?.value).length)>0,on=available&&visibility[name]!==false;return `<button type="button" role="switch" aria-checked="${on}" aria-label="Toggle ${e(names[name])}" data-action="map-layer-toggle:${name}" ${available?'':'disabled'} title="${e(available?names[name]:names[name]+' unavailable in this scene')}"><span class="map-layer-check" aria-hidden="true">${on?'✓':''}</span><i class="map-layer-dot layer-${name}"></i><span>${e(names[name])}</span></button>`;}).join('')}${button('Layer details','map-layers',{tone:'map-layer-details'})}</div>`;
}

// The existing map runtime owns instances, sources, camera memory and selection.
// This adapter owns only the signed-off preview's outer box.
export function mapView({state, id='map', height=322, title='Operational map', legend=true, caption=true, field=false}) {
  const scope={'command-overview':'COMMAND',incidents:'INCIDENTS','incident-detail':'INCIDENT_DETAIL',intelligence:'INTELLIGENCE',operations:'OPERATIONS','global-awareness':'GLOBAL'}[state.route];
  let incidents=rows(state.incidents);
  if(state.route==='incidents'){
    incidents=filterIncidents(incidents,state.ui.incidentFilters);
    // The preview explicitly retains an out-of-filter selection. Its real point
    // must stay in the scene too, rather than pairing its name with another place.
    if(state.incident&&!incidents.some(i=>i.id===state.selected))incidents.push(state.incident);
  }
  if(state.route==='global-awareness')incidents=state.regionIncidents??incidents;
  if(['incident-detail','intelligence','operations'].includes(state.route))incidents=state.incident?[state.incident]:[];
  const truth=new Map(incidents.map(i=>[i.id,i.classification])),scene=state.scene?{...state.scene,layers:{...state.scene.layers,incidentPoints:{...state.scene.layers?.incidentPoints,value:rows(state.scene.layers?.incidentPoints?.value).map(i=>({...i,state:truth.get(i.incidentId)??i.state}))}}}:null;
  if(scene&&state.incident?.coordinate&&state.route!=='global-awareness'&&state.route!=='command-overview'){
    scene.camera={...scene.camera,center:state.incident.coordinate,zoom:field?(state.route==='operations'?10:11):Math.max(10,scene.camera?.zoom??10),bbox:null};scene.bounds=null;
    scene.windReading=state.physical?.metrics?.wind??null;
  }
  if(scene&&['incident-detail','intelligence'].includes(state.route)){
    const defaults={responseCoverageSurface:false,responseCoverageRoutes:false,responseFacilities:false};
    state.runtime.mapLayerVisibility={...state.runtime.mapLayerVisibility,[scene.sceneId]:{...defaults,...state.runtime.mapLayerVisibility?.[scene.sceneId]}};
  }
  if(scene&&field){
    scene.fieldPresentation=true;scene.controls=['focus','zoom'];
    const visible=key=>(scene.layerSet??[]).includes(key)&&state.runtime.mapLayerVisibility?.[scene.sceneId]?.[key]!==false&&['READY','DEGRADED'].includes(scene.layers?.[key]?.state)&&rows(scene.layers?.[key]?.value).length;
    const entry=(label,fill,stroke=mapPalette.outline,line=false)=>`<span><i aria-hidden="true" class="field-map-key${line?' is-line':''}" style="--map-symbol-fill:${e(fill)};--map-symbol-stroke:${e(stroke)}"></i>${e(label)}</span>`;
    const symbols=[];
    if(visible('incidentPoints'))for(const classification of new Set(incidents.map(i=>i.classification))){const symbol=incidentMapSymbols[classification];if(symbol)symbols.push(entry(symbol.label,symbol.fill,symbol.stroke));}
    if(visible('observations'))symbols.push(entry('Thermal observation',mapPalette.critical));
    if(visible('observedGeometry'))symbols.push(entry('Admitted geometry',mapPalette.critical,mapPalette.outline,true));
    if(visible('responseCoverageRoutes'))symbols.push(entry('Road estimate',mapPalette.route,mapPalette.route,true));
    if(visible('responseFacilities')){const seen=new Set();for(const row of rows(scene.layers.responseFacilities.value)){const p=row.properties??row,symbol=facilityMapSymbol(p.capacityAvailability??'UNKNOWN',p.canonicalType??'other_public_facility');if(!seen.has(symbol.label)){symbols.push(entry(symbol.label,symbol.fill));seen.add(symbol.label);}}}
    scene.fieldLegend=`<div class="field-map-legend" aria-label="Map legend">${symbols.join('')}</div>`;
  }
  const map=scene?canonicalMap({state:state.runtime,incidents:incidents.map(i=>i.raw),selected:state.incident?.raw??null,mapScene:scene,scope,commandProjection:state.route==='command-overview'?state.presentation:null,thermal:state.runtime.mapThermal===true,label:title,legendMarkup:field?scene.fieldLegend:['command-overview','global-awareness'].includes(state.route)?layerLegend(scene,state.runtime):null}):field?'<div class="field-map-retry" role="status"><h3>Reconnect the map</h3><p>Refresh the incident to reload its geographic view.</p>'+button('Refresh map','refresh-runtime')+'</div>':'<div class="empty-state" role="status"><h3>Map currently unavailable</h3><p>No governed map scene was returned. Incident information remains available outside the map.</p></div>';
  return `<div class="map-unit" id="${e(id)}"><div class="map-root"><div class="map-canvas approved-live-map" style="height:${Number(height)}px" data-approved-map-height="${Number(height)}">${map}<div class="map-topright">${button('Fit mapped records','fit-map-results',{ico:'target',tone:'icon-button',disabled:!incidents.some(i=>i.coordinate)})}</div></div>${caption?'<div class="map-caption">Source observations and context · measurement times remain explicit</div>':''}</div>${legend?'<div class="map-legend"><span><i class="dot red"></i>Verified current</span><span><i class="dot amber"></i>Reported signal</span><span><i class="dot"></i>Earlier report / context</span></div>':''}</div>`;
}
