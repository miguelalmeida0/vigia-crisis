import {e,button} from './html.js';
const regionYs={Norte:14,Centro:33,Lisboa:52,Alentejo:70,Algarve:87};
/** Local, explicitly illustrative map adapter. Pan/zoom affect reference imagery, not a GIS engine. */
export function mapView({kind='local',id='map',title='',height,limited=false,region='Norte',selectRegions=false,legend=true}={}) {
 const national=kind==='national';
 const background=national?'national-reference.webp':'local-reference.webp';
 return `<div class="map-unit"><div class="map-root map-${national?'national':'local'}" data-map-id="${e(id)}"><div class="map-canvas" tabindex="0" role="group" aria-label="${e(title||'Illustrative map')}. Use the zoom controls. Not for navigation." ${height?`style="height:${Number(height)}px"`:''}>
 ${limited?`<div class="map-unavailable"><strong>Map information unavailable</strong><p>No scene was returned. No incident locations or routes have been invented.</p></div>`:`<div class="map-stage"><img src="./assets/${background}" alt="Illustrative basemap from the supplied design reference; not current satellite data." draggable="false">${national&&selectRegions?Object.entries(regionYs).map(([name,y])=>`<button type="button" class="map-region-target" style="top:${y}%" data-action="select-region" data-region="${e(name)}" aria-label="Select ${e(name)} region" aria-pressed="${name===region}">${e(name)}</button>`).join(''):''}</div>`}
 <div class="map-controls">${button('Zoom in','map-zoom',{ico:'plus',tone:'icon-button',extra:'data-delta="1"',disabled:limited})}${button('Zoom out','map-zoom',{ico:'minus',tone:'icon-button',extra:'data-delta="-1"',disabled:limited})}</div>
 <div class="map-topright">${button('Map information','map-info',{ico:'layers',tone:'icon-button'})}</div>
 ${title&&!national&&!limited?`<div class="map-selected-label">${e(title)}<br><span class="muted">Illustrative view · not a current observation</span></div>`:''}
 <div class="map-scale">${limited?'No current scene':national?'Regional context':'Reference imagery'}</div></div>
 <div class="map-caption">Design-reference imagery · sample markers · not for navigation</div></div>
 ${legend?`<div class="map-legend"><span><i class="dot red"></i>Observation</span><span><i class="dot amber"></i>Needs review</span><span><i class="dot"></i>Context only</span></div>`:''}</div>`;
}
const views=new Map();
export function changeMapZoom(root,delta){
 const id=root.dataset.mapId;const prev=views.get(id)||{zoom:1,x:0,y:0};prev.zoom=Math.min(2.5,Math.max(1,prev.zoom+delta*.25));if(prev.zoom===1){prev.x=0;prev.y=0;}views.set(id,prev);paint(root,prev);return prev.zoom;
}
function paint(root,v){const stage=root.querySelector('.map-stage');if(stage)stage.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.zoom})`;}
export function initMaps(container){
 for(const root of container.querySelectorAll('.map-root')){
  const canvas=root.querySelector('.map-canvas');const v=views.get(root.dataset.mapId)||{zoom:1,x:0,y:0};paint(root,v);
  canvas.addEventListener('keydown',event=>{if(event.target!==canvas)return;if(event.key==='+'||event.key==='='){event.preventDefault();changeMapZoom(root,1);}if(event.key==='-'){event.preventDefault();changeMapZoom(root,-1);}});
  let pointer=null;
  canvas.addEventListener('pointerdown',event=>{if(event.target.closest('button')||event.pointerType==='touch'||event.button!==0)return;const current=views.get(root.dataset.mapId)||{zoom:1,x:0,y:0};if(current.zoom<=1)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:current.x,startY:current.y};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',event=>{if(!pointer)return;const cur=views.get(root.dataset.mapId);const maxX=canvas.clientWidth*(cur.zoom-1)/2,maxY=canvas.clientHeight*(cur.zoom-1)/2;cur.x=Math.max(-maxX,Math.min(maxX,pointer.startX+event.clientX-pointer.x));cur.y=Math.max(-maxY,Math.min(maxY,pointer.startY+event.clientY-pointer.y));paint(root,cur);});
  const end=()=>{pointer=null;canvas.classList.remove('dragging');};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 }
}
