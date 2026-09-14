import { value } from '../../canonicalViewModel.js';

export const facilityKinds={FIRE_STATION:['Fire stations','flame','red'],HOSPITAL:['Hospitals','plus','red'],EMS_BASE:['Medical bases','plus','blue'],CIVIL_PROTECTION:['Civil protection','shield','blue'],SHELTER:['Shelters','home','green'],WATER_POINT:['Water points','droplet','blue'],AIR_SUPPORT_BASE:['Air bases','map','blue'],POLICE:['Police','shield','blue'],PUBLIC_INSTITUTION:['Public institutions','home','blue']};
export const number = n => typeof n==='number'&&Number.isFinite(n);
export const coordinate = p => Array.isArray(p)&&p.length>=2&&number(p[0])&&number(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
export const dated = at => Number.isFinite(Date.parse(at??''));
export const clock = at => dated(at)?new Date(at).toISOString().slice(11,16):'';
export const day = at => dated(at)?new Date(at).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}):'';
export const measured = at => dated(at)?`${day(at)} · ${clock(at)} UTC`:'';
export const usable = m => m?.available&&m.value!==''&&m.validity!=='INVALID_VALUE'&&m.validity!=='NO_VALID_VALUE'&&dated(m.observedAt??m.calculatedAt)&&Boolean(m.sourceName??m.source);
const text = v => typeof v==='string'?v:'';
const allowedEvent = new Set(['Weather','Fire detection','Warning','Incident update','Official update','Road','Field report','Air quality']);

// Formatting, filtering and ordering only: authority, routing and measurements
// remain properties of their canonical projections.
export function fieldModel(vm) {
 const p=vm.physical??{},metrics=p.metrics??{},end=Date.parse(vm.generatedAt)||Date.now();
 const events=(p.changes??[]).filter(c=>allowedEvent.has(c.type)&&dated(c.at)&&Date.parse(c.at)<=end&&text(c.text)&&text(c.source))
  .filter((c,n,all)=>all.findIndex(x=>x.at===c.at&&x.text===c.text&&x.source===c.source)===n).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const response=value(vm.source,'responseCapability');
 const facilities=Object.fromEntries(Object.entries(facilityKinds).map(([kind])=>[kind,(response?.facilities?.[kind]??[]).filter(f=>text(f.name)&&coordinate(f.coordinate)&&number(f.distanceKm)&&Boolean(f.provenance?.provider)).sort((a,b)=>a.distanceKm-b.distanceKm)]));
 const kinds=Object.keys(facilityKinds).filter(k=>facilities[k].length);
 const requested=vm.runtime.approvedFacilityKind;
 const kind=kinds.includes(requested)?requested:kinds[0];
 const routes=Object.values(facilities).flat().filter(f=>f.reachability?.state==='ROUTED'&&number(f.reachability.travelTimeMinutes)&&number(f.reachability.routeDistanceKm)&&dated(f.reachability.checkedAt)).sort((a,b)=>a.reachability.travelTimeMinutes-b.reachability.travelTimeMinutes);
 const warnings=(p.warnings??[]).filter(w=>w.state==='ACTIVE'&&dated(w.effective)&&dated(w.expires)&&Date.parse(w.effective)<=end&&Date.parse(w.expires)>end);
 const physical=value(vm.source,'physicalWorld')?.incidents?.find(i=>String(i.incidentId).replace(/^incident:/,'')===String(vm.selected).replace(/^incident:/,''));
 return {metrics,events,station:p.station,facilities,kinds,kind,routes,warnings,response,places:p.places??[],roads:p.roads??[],thermalRadiusKm:physical?.thermalRadiusKm,now:end};
}
