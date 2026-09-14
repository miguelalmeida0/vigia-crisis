// Source readiness is independent: labels and context never gate geography.
export const MAP_SOURCE_TIERS=Object.freeze({
 'vigia-imagery':0,'vigia-markers':0,'vigia-operational':1,
 'vigia-thermal':1,'vigia-labels':2,
});
export function observeMapSources(gl,map,instance){
 const states={},attempts={},failedTiles={},timers=new Set();instance.sourceStates=states;
 const publish=()=>{map.dataset.mapSourceStates=JSON.stringify(states);};
 gl.on('sourcedataloading',event=>{if(event.sourceId in MAP_SOURCE_TIERS&&states[event.sourceId]!=='DEGRADED'){states[event.sourceId]='LOADING';publish();}});
 gl.on('sourcedata',event=>{const id=event.sourceId;if(!(id in MAP_SOURCE_TIERS))return;if(event.tile?.state==='loaded')failedTiles[id]?.delete(String(event.tile.tileID?.key??'source'));if(event.isSourceLoaded&&!failedTiles[id]?.size){states[id]='READY';publish();}});
 gl.on('error',event=>{
  const id=event.sourceId??event.error?.sourceId;if(!(id in MAP_SOURCE_TIERS))return;
  states[id]='DEGRADED';publish();
  (failedTiles[id]??=new Set()).add(String(event.tile?.tileID?.key??'source'));
  if(id!=='vigia-labels'||(attempts[id]??0)>=2)return;
  const attempt=attempts[id]=(attempts[id]??0)+1;
  const timer=setTimeout(()=>{timers.delete(timer);if(states[id]==='READY')return;const source=gl.getSource(id),tiles=source?.serialize?.().tiles;if(tiles?.length)source.setTiles(tiles);gl.triggerRepaint();},1000*2**attempt);
  timers.add(timer);
 });
 instance.disposeSources=()=>{for(const timer of timers)clearTimeout(timer);};
}
