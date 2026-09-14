const palette={
  satellite:'#347E98',ground:'#D18419',camera:'#8B5D20',weather:'#2F6F9E',field:'#287B4B',official:'#347E98',support:'#6F6A62',review:'#A09A90',contradiction:'#CF3529',surface:'#FBFAF7',text:'#1E1D1A',muted:'#747068',border:'#DDD8CF'
};

function relationColor(input){const value=String(input??'').toUpperCase();if(/CONTRADICT/.test(value))return palette.contradiction;if(/SUPPORT|CONFIRM/.test(value))return palette.support;if(/QUALIF|VERIF|ACTIVE/.test(value))return palette.field;if(/UNRESOLVED|PENDING|UNKNOWN|STALE|REVIEW/.test(value))return palette.ground;return palette.review;}
function familyColor(input){const value=String(input??'').toUpperCase();if(/SATELLITE|OFFICIAL/.test(value))return palette.satellite;if(/GROUND|REPORT/.test(value))return palette.ground;if(/CAMERA/.test(value))return palette.camera;if(/WEATHER/.test(value))return palette.weather;if(/FIELD|OBSERV/.test(value))return palette.field;return palette.satellite;}
function human(input){const value=String(input??'Unavailable');return new Map([['CONTRADICTS','Contradictory'],['SUPPORTS','Supporting'],['OFFICIAL','Official'],['OBSERVED','Observed'],['ACTIVE','Active']]).get(value.toUpperCase())??value.replaceAll('_',' ').toLowerCase().replace(/^./,letter=>letter.toUpperCase());}
function label(context,text,x,y,{align='center',size=11,weight=500,color=palette.text,max=32}={}){context.fillStyle=color;context.font=`${weight} ${size}px Roboto, Arial, sans-serif`;context.textAlign=align;context.textBaseline='middle';const value=String(text??'Unavailable');context.fillText(value.length>max?`${value.slice(0,max-1)}…`:value,x,y);}
function line(context,from,to,{color=palette.review,width=1,dash=[]}={}){context.save();context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dash);context.beginPath();context.moveTo(from.x,from.y);context.lineTo(to.x,to.y);context.stroke();context.restore();}
function ring(context,pos,radius,{fill=palette.surface,stroke=palette.text,width=1}={}){context.fillStyle=fill;context.beginPath();context.arc(pos.x,pos.y,radius,0,Math.PI*2);context.fill();context.strokeStyle=stroke;context.lineWidth=width;context.stroke();}
function hexagon(context,pos,radius,{fill=palette.surface,stroke=palette.text,width=1}={}){context.save();context.fillStyle=fill;context.strokeStyle=stroke;context.lineWidth=width;context.beginPath();for(let index=0;index<6;index+=1){const angle=-Math.PI/2+index*Math.PI/3,x=pos.x+Math.cos(angle)*radius,y=pos.y+Math.sin(angle)*radius;index?context.lineTo(x,y):context.moveTo(x,y);}context.closePath();context.fill();context.stroke();context.restore();}
function square(context,pos,size,{fill=palette.surface,stroke=palette.satellite,width=1.5}={}){context.fillStyle=fill;context.fillRect(pos.x-size/2,pos.y-size/2,size,size);context.strokeStyle=stroke;context.lineWidth=width;context.strokeRect(pos.x-size/2,pos.y-size/2,size,size);}

const namedPositions=[
  [/SATELLITE|OFFICIAL/,{x:.22,y:.16}],
  [/GROUND|REPORT/,{x:.70,y:.185}],
  [/CAMERA/,{x:.16,y:.54}],
  [/WEATHER/,{x:.72,y:.56}],
  [/FIELD|OBSERV/,{x:.45,y:.73}],
];
const sparePositions=[{x:.45,y:.13},{x:.82,y:.40},{x:.80,y:.76},{x:.20,y:.78},{x:.08,y:.37}];
function normalizedPosition(family,index,claimed){
  const key=String(family?.familyClass??family?.label??'').toUpperCase(),match=namedPositions.find(([pattern])=>pattern.test(key));
  if(match&&!claimed.has(match[1])){claimed.add(match[1]);return match[1];}
  return sparePositions[index%sparePositions.length];
}

function draw(canvas){
  let payload;try{payload=JSON.parse(decodeURIComponent(canvas.dataset.evidenceGraph??''));}catch{return;}
  const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1),width=Math.max(320,Math.round(rect.width)),height=Math.max(240,Math.round(rect.height)),zoom=Math.max(.75,Math.min(1.65,Number(canvas.dataset.graphZoom)||1));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);const context=canvas.getContext('2d');context.scale(ratio,ratio);context.clearRect(0,0,width,height);
  const families=payload.sourceFamilies??[],sources=payload.sources??[],observations=payload.observations??[],evidence=payload.evidence??[],lineages=payload.lineages??[],selectedId=payload.selectedEvidenceId??null,center={x:width*.455,y:height*.39},familyPositions=new Map(),observationPositions=new Map(),claimed=new Set();
  context.fillStyle=palette.surface;context.fillRect(0,0,width,height);
  context.save();context.translate(center.x,center.y);context.scale(zoom,zoom);context.translate(-center.x,-center.y);

  families.forEach((family,index)=>{const point=normalizedPosition(family,index,claimed),pos={x:width*point.x,y:height*point.y};familyPositions.set(family.id,pos);});
  families.forEach(family=>{
    const pos=familyPositions.get(family.id),familySources=sources.filter(source=>source.familyId===family.id),familySourceIds=new Set(familySources.map(source=>source.id)),familyObservations=observations.filter(observation=>familySourceIds.has(observation.sourceId)),familyEvidence=familyObservations.flatMap(observation=>evidence.filter(item=>item.observationId===observation.id)),contradictory=familyEvidence.some(item=>/CONTRADICT/.test(String(item.stance??item.contradictionStatus).toUpperCase())),supporting=familyEvidence.some(item=>/SUPPORT|CONFIRM/.test(String(item.stance??item.contradictionStatus).toUpperCase())),edgeColor=contradictory?palette.contradiction:supporting?palette.support:palette.review;
    line(context,pos,center,{color:edgeColor,width:supporting&&!contradictory?1.8:1.1,dash:contradictory?[3,3]:supporting?[]:[5,5]});
    const color=familyColor(family.familyClass??family.label);hexagon(context,pos,21,{stroke:color,width:1.7});ring(context,pos,11,{fill:color,stroke:color});label(context,human(family.familyClass).slice(0,3),pos.x,pos.y,{size:11,weight:700,color:'#FFFFFF',max:3});
    label(context,family.label??'Evidence source',pos.x,pos.y+35,{size:12,weight:650,max:25});label(context,`${familyObservations.length} item${familyObservations.length===1?'':'s'}`,pos.x,pos.y+51,{size:11,color:palette.muted,max:18});
    familyObservations.forEach((observation,observationIndex)=>{const angle=-Math.PI*.92+(Math.PI*1.84*(observationIndex+1)/(familyObservations.length+1)),radius=34+(observationIndex%2)*8,child={x:pos.x+Math.cos(angle)*radius,y:pos.y+Math.sin(angle)*radius};observationPositions.set(observation.id,child);line(context,pos,child,{color,width:.85});square(context,child,9,{stroke:relationColor(observation.state)});});
  });

  for(const lineage of lineages){const child=observationPositions.get(lineage.observationId);if(!child)continue;for(const rootId of lineage.rootObservationIds??[]){const root=observationPositions.get(rootId);if(root&&root!==child)line(context,child,root,{color:palette.review,dash:[4,4]});}}
  evidence.forEach(item=>{const pos=observationPositions.get(item.observationId);if(!pos)return;const color=relationColor(item.stance??item.contradictionStatus),selected=item.id===selectedId;line(context,pos,center,{color,width:selected?2.4:/CONTRADICT/.test(String(item.stance).toUpperCase())?1.7:1,dash:/CONTRADICT/.test(String(item.stance).toUpperCase())?[2,3]:[]});if(selected){ring(context,pos,8,{fill:'rgba(251,250,247,.5)',stroke:color,width:1.7});label(context,human(item.stance),pos.x,pos.y+18,{size:11,weight:700,color,max:18});}});

  hexagon(context,center,31,{fill:'#FDECEB',stroke:palette.contradiction,width:2});ring(context,center,13,{fill:palette.contradiction,stroke:palette.contradiction});label(context,'!',center.x,center.y,{size:13,weight:700,color:'#FFFFFF',max:1});label(context,payload.incident?.label??'Incident',center.x,center.y+49,{size:12,weight:650,max:30});label(context,human(payload.incident?.status??'Active'),center.x,center.y+66,{size:11,weight:700,color:palette.contradiction,max:20});context.restore();
  const screen=pos=>({x:center.x+(pos.x-center.x)*zoom,y:center.y+(pos.y-center.y)*zoom}),targets=[];
  for(const family of families){const pos=familyPositions.get(family.id),familySourceIds=new Set(sources.filter(source=>source.familyId===family.id).map(source=>source.id)),familyObservationIds=new Set(observations.filter(observation=>familySourceIds.has(observation.sourceId)).map(observation=>observation.id)),item=evidence.find(row=>familyObservationIds.has(row.observationId));if(pos&&item?.id)targets.push({...screen(pos),radius:28,evidenceId:item.id,label:family.label??'Evidence source'});}
  for(const item of evidence){const pos=observationPositions.get(item.observationId);if(pos)targets.push({...screen(pos),radius:14,evidenceId:item.id,label:human(item.stance)});}
  canvas.__vigiaEvidenceTargets=targets;
}

function bindCanvas(canvas){if(canvas.dataset.graphBound==='true')return;canvas.dataset.graphBound='true';canvas.addEventListener('click',event=>{const rect=canvas.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top},target=(canvas.__vigiaEvidenceTargets??[]).map(item=>({...item,distance:Math.hypot(item.x-point.x,item.y-point.y)})).filter(item=>item.distance<=item.radius).sort((a,b)=>a.distance-b.distance)[0];if(target?.evidenceId)canvas.dispatchEvent(new CustomEvent('vigia:evidence-select',{bubbles:true,detail:{evidenceId:target.evidenceId}}));});canvas.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const selected=(canvas.__vigiaEvidenceTargets??[]).find(item=>item.evidenceId);if(!selected)return;event.preventDefault();canvas.dispatchEvent(new CustomEvent('vigia:evidence-select',{bubbles:true,detail:{evidenceId:selected.evidenceId}}));});}

export function controlEvidenceGraph(root=document,action='fit'){const canvas=root.querySelector?.('canvas[data-evidence-graph]');if(!canvas)return false;const current=Number(canvas.dataset.graphZoom)||1;canvas.dataset.graphZoom=String(action==='zoom-in'?Math.min(1.65,current+.15):action==='zoom-out'?Math.max(.75,current-.15):1);draw(canvas);return true;}
export function hydrateEvidenceGraphs(root=document){for(const canvas of root.querySelectorAll?.('canvas[data-evidence-graph]')??[]){bindCanvas(canvas);draw(canvas);if(typeof ResizeObserver==='function'){let prior='';const observer=new ResizeObserver(()=>{const rect=canvas.getBoundingClientRect(),next=`${Math.round(rect.width)}x${Math.round(rect.height)}`;if(next===prior)return;prior=next;draw(canvas);});observer.observe(canvas);}}}
