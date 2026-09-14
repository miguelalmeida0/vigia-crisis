const TYPES = new Set(['thermal','camera','ground_sensor','drone','field']);
function required(value, code) { const text=String(value??'').trim(); if(!text) throw new Error(code); return text; }
function coordinate(value) {
  const point=Array.isArray(value)?value.map(Number):[];
  if(point.length!==2||!point.every(Number.isFinite)||point[0] < -180||point[0] > 180||point[1] < -90||point[1] > 90) throw new Error('invalid_physical_observation_coordinate');
  return point;
}
function timestamp(value, code) { const ms=Date.parse(value??''); if(!Number.isFinite(ms)) throw new Error(code); return new Date(ms).toISOString(); }
function finite(value) { if(value===null||value===undefined||(typeof value==='string'&&value.trim()==='')||typeof value==='boolean')return null;const n=Number(value); return Number.isFinite(n)?n:null; }
export function normalizePhysicalObservation(input={}, { receivedAt=new Date() }={}) {
  const type=required(input.type,'physical_observation_type_required'); if(!TYPES.has(type)) throw new Error('invalid_physical_observation_type');
  const at=timestamp(input.at??input.observedAt,'invalid_physical_observation_timestamp');
  const received=timestamp(input.receivedAt??receivedAt,'invalid_physical_observation_received_at');
  const source=required(input.source,'physical_observation_source_required');
  const sourceFamily=required(input.sourceFamily??input.instrument??type,'physical_observation_source_family_required');
  const independenceGroup=required(input.independenceGroup??sourceFamily,'physical_observation_independence_group_required');
  const measurementType=required(input.measurementType??(type==='thermal'?'fire_radiative_power':type),'physical_observation_measurement_type_required');
  const measurement={...(input.measurement&&typeof input.measurement==='object'?input.measurement:{})};
  for(const [key,value] of [['frpMw',input.frpMw],['frpUncertaintyMw',input.frpUncertaintyMw],['brightnessK',input.brightnessK]]) if(finite(value)!==null) measurement[key]=finite(value);
  const provenance={...(input.provenance&&typeof input.provenance==='object'?input.provenance:{}),synthetic:input.provenance?.synthetic===true};
  return {...input,schemaVersion:'physical-observation.v1',id:required(input.id,'physical_observation_id_required'),type,source,sourceFamily,independenceGroup,measurementType,at,receivedAt:received,coordinate:coordinate(input.coordinate),geolocationUncertaintyM:finite(input.geolocationUncertaintyM),footprint:input.footprint&&typeof input.footprint==='object'?structuredClone(input.footprint):null,qualityFlags:Array.isArray(input.qualityFlags)?input.qualityFlags.map(String).slice(0,50):[],measurement,provenance,calibratedFireProbability:null};
}
export function isPhysicalObservation(value) { return TYPES.has(value?.type) && value?.schemaVersion==='physical-observation.v1'; }
