const ROUTES=new Set(['command-overview','incidents','incident-detail','intelligence','operations','reports-analytics','global-awareness']);
const ALIASES=new Map([['fire-activity','intelligence'],['response-access','operations'],['overview','command-overview'],['evidence','intelligence'],['evidence-debt','intelligence'],['authority-trust','operations'],['authority','operations'],['control-plane','operations'],['reports','reports-analytics'],['global-situational-awareness','global-awareness'],['national-awareness','global-awareness']]);

const ROUTE_FIELDS=Object.freeze({
  incidents:{q:['incidentSearch',null,''],status:['incidentStateFilter',null,'ALL'],type:['incidentTypeFilter',null,'ALL'],priority:['incidentPriority',null,'ALL'],region:['incidentRegion',null,'ALL'],sort:['incidentSort',['IDENTITY','CHANGED'],'IDENTITY'],saved:['incidentSavedFilter',['ALL','NEW_CANDIDATES','NEEDS_REVALIDATION','OFFICIAL_VERIFIED','STALE_HIGH_PRIORITY','HUMAN_DECISION_DUE'],'ALL'],page:['incidentPage',null,1],id:['selectedIncidentId',null,null]},
  'incident-detail':{id:['selectedIncidentId',null,null],view:['incidentTab',['overview','assessment','evidence','decisions','operations','history'],'overview']},
  intelligence:{id:['selectedIncidentId',null,null]},
  operations:{id:['selectedIncidentId',null,null],lane:['operationsTab',['resolution','response','protect'],'resolution']},
  'reports-analytics':{view:['reportsTab',['summary','outcomes','performance','quality'],'summary'],range:['reportsRange',['H24','H72','H168','ALL'],'H24'],compare:['reportsCompare',['true','false'],'false']},
  'global-awareness':{region:['globalRegion',null,'ALL'],type:['globalType',null,'ALL'],priority:['globalPriority',null,'ALL'],status:['globalStatus',null,'ALL'],time:['globalTime',['ALL','H24','H72','H168'],'ALL'],id:['globalSelectedIncidentId',null,null]},
});
const LEGACY_PARAMETERS=new Set(Object.values(ROUTE_FIELDS).flatMap(fields=>Object.keys(fields)).concat(['incidentStatus','incidentType','incidentSort']));
const LEGACY_ALIASES=Object.freeze({incidentStatus:'status',incidentType:'type',incidentSort:'sort'});

function normalizedRoute(raw){const clean=String(raw??'').replace(/^#\/?/,'').split('?')[0]||'command-overview';return ALIASES.get(clean)??(ROUTES.has(clean)?clean:'command-overview');}
function allowedValue(raw,allowed){return raw!==null&&raw!==''&&(!allowed||allowed.includes(raw));}

export function parseRouteUrl(input){
  const url=input instanceof URL?new URL(input.href):new URL(String(input),globalThis.location?.origin??'http://vigia.local'),hash=url.hash.replace(/^#\/?/,''),question=hash.indexOf('?'),raw=question<0?hash:hash.slice(0,question),route=normalizedRoute(raw),params=new URLSearchParams(question<0?'':hash.slice(question+1));
  return{url,route,params,rawRoute:raw||'command-overview'};
}

export function routeHash(route,params=new URLSearchParams()){
  const target=normalizedRoute(route),allowed=new Set(Object.keys(ROUTE_FIELDS[target]??{})),clean=new URLSearchParams();
  for(const [key,value] of params)if(allowed.has(key)&&value!=='')clean.set(key,value);
  const publicRoute=({intelligence:'fire-activity',operations:'response-access'})[target]??target;
  return`#/${publicRoute}${clean.size?`?${clean}`:''}`;
}

export function routeParamsFromState(route,state){
  const target=normalizedRoute(route),fields=ROUTE_FIELDS[target]??{},params=new URLSearchParams();
  for(const [parameter,[key,,fallback]] of Object.entries(fields)){const value=state?.[key];if(value===null||value===undefined||value===''||String(value)===String(fallback))continue;params.set(parameter,String(value));}
  return params;
}

export function applyRouteParams(state,route,params,{reset=true}={}){
  const fields=ROUTE_FIELDS[normalizedRoute(route)]??{};
  for(const [parameter,[key,allowed,fallback]] of Object.entries(fields)){
    const raw=params.get(parameter),value=parameter==='page'&&raw!==null?Math.max(1,Number(raw)||1):raw;
    if(allowedValue(raw,allowed))state[key]=value;else if(reset)state[key]=fallback;
  }
  return state;
}

export function migrateLegacyRouteState(input){
  const parsed=parseRouteUrl(input),fields=ROUTE_FIELDS[parsed.route]??{},params=new URLSearchParams(parsed.params),search=new URLSearchParams(parsed.url.search);
  for(const parameter of LEGACY_PARAMETERS){
    const routeParameter=LEGACY_ALIASES[parameter]??parameter,value=search.get(parameter);
    if(value!==null&&Object.hasOwn(fields,routeParameter)&&!params.has(routeParameter))params.set(routeParameter,value);
    search.delete(parameter);
  }
  parsed.url.search=search.toString();parsed.url.hash=routeHash(parsed.route,params);
  return{url:parsed.url,route:parsed.route,params:new URLSearchParams(parsed.url.hash.split('?')[1]??''),changed:parsed.url.href!==new URL(String(input),parsed.url.origin).href};
}

export function updateRouteParameter(input,parameter,value,{defaultValue='ALL'}={}){
  const parsed=parseRouteUrl(input),fields=ROUTE_FIELDS[parsed.route]??{};if(!Object.hasOwn(fields,parameter))return parsed.url;
  const params=new URLSearchParams(parsed.params);if(value===null||value===undefined||value===''||String(value)===String(defaultValue))params.delete(parameter);else params.set(parameter,String(value));
  parsed.url.hash=routeHash(parsed.route,params);return parsed.url;
}

export function approvedRoutes(){return[...ROUTES];}
