const CELL_DEGREES=.1,REPRESENTATIVE_DEGREES=.005,SEARCH_CELLS=1,PHYSICAL_TYPES=new Set(['thermal','camera','ground_sensor','drone','field']),cache=new WeakMap();

function valid(item){return Number.isFinite(Date.parse(item?.at))&&Array.isArray(item?.coordinate)&&item.coordinate.length===2&&item.coordinate.every(Number.isFinite);}
function key(coordinate){return`${Math.floor(coordinate[0]/CELL_DEGREES)}:${Math.floor(coordinate[1]/CELL_DEGREES)}`;}
function representativeKey(item){const group=item.type==='report'?`report:${item.incidentId??item.id}`:PHYSICAL_TYPES.has(item.type)?'physical':item.type;return`${Math.floor(item.coordinate[0]/REPRESENTATIVE_DEGREES)}:${Math.floor(item.coordinate[1]/REPRESENTATIVE_DEGREES)}:${group}`;}
function add(index,item){
  index.history.push(item);const cell=key(item.coordinate),items=index.cells.get(cell)??new Map();items.set(representativeKey(item),item);index.cells.set(cell,items);
  index.sumLon+=item.coordinate[0];index.sumLat+=item.coordinate[1];
  if(item.type==='report')index.reports.push(item);if(PHYSICAL_TYPES.has(item.type))index.physical.push(item);
  if(item.incidentId)index.incidentIds.add(item.incidentId);if(item.municipality)index.municipalities.add(item.municipality);
}
function build(event){
  const raw=(event?.observations??[]).filter(valid),ordered=raw.every((item,index)=>index===0||Date.parse(raw[index-1].at)<=Date.parse(item.at))?raw:[...raw].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const index={history:[],cells:new Map(),reports:[],physical:[],incidentIds:new Set(),municipalities:new Set(),sumLon:0,sumLat:0,count:0,last:null};
  for(const item of ordered)add(index,item);index.count=(event?.observations??[]).length;index.last=(event?.observations??[]).at(-1)??null;cache.set(event,index);return index;
}
function current(event){
  const raw=event?.observations??[],prior=cache.get(event);
  if(!prior||prior.count>raw.length||(prior.count&&raw[prior.count-1]!==prior.last))return build(event);
  for(let position=prior.count;position<raw.length;position+=1){const item=raw[position];if(!valid(item)||prior.history.length&&Date.parse(item.at)<Date.parse(prior.history.at(-1).at))return build(event);add(prior,item);}
  prior.count=raw.length;prior.last=raw.at(-1)??null;return prior;
}
function nearby(index,coordinate){
  const x=Math.floor(coordinate[0]/CELL_DEGREES),y=Math.floor(coordinate[1]/CELL_DEGREES),items=[];
  for(let dx=-SEARCH_CELLS;dx<=SEARCH_CELLS;dx+=1)for(let dy=-SEARCH_CELLS;dy<=SEARCH_CELLS;dy+=1)items.push(...(index.cells.get(`${x+dx}:${y+dy}`)?.values()??[]));
  return items;
}
function recent(index,at,max=40,hours=18){
  const result=[];
  for(let position=index.history.length-1;position>=0&&result.length<max;position-=1){const item=index.history[position],delta=Math.abs(at-Date.parse(item.at))/3_600_000;if(delta<=hours)result.push(item);else if(Date.parse(item.at)<at-hours*3_600_000)break;}
  return result;
}

export function eventAssociationIndex(event,observation){const index=current(event),at=Date.parse(observation?.at);return{...index,nearby:nearby(index,observation.coordinate),recent:recent(index,at),centroid:index.history.length?[index.sumLon/index.history.length,index.sumLat/index.history.length]:null};}
