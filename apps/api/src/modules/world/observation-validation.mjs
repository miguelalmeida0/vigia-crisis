import { createHash } from 'node:crypto';

export const OBSERVATION_LIMITS = Object.freeze({ maximumRecords:20000, historyRecords:12000, historyHours:48, rejectedRecords:100 });
export const WEATHER_BOUNDS = Object.freeze({ temperatureC:[-90,65],humidityPercent:[0,100],windSpeedKph:[0,500],gustKph:[0,500],precipitationMm:[0,2000],pressureHpa:[300,1100] });
const validTime = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:?\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
export const validCoordinate = p => Array.isArray(p) && p.length === 2 && p.every(v=>typeof v==='number'&&Number.isFinite(v)) && Math.abs(p[0])<=180 && Math.abs(p[1])<=90;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Validate normalized records before last-good retention. Rejection metadata is bounded and contains no raw payload. */
export function validateSourceBatch(id, records, asOf) {
  if (!Array.isArray(records) || records.length > OBSERVATION_LIMITS.maximumRecords) throw new Error('provider_record_bound_or_schema_invalid');
  const data=[], rejected=[];
  for (const original of records) {
    let reason=null;
    if (!original || typeof original !== 'object' || Array.isArray(original)) reason='RECORD_NOT_OBJECT';
    else if (original.provenance?.synthetic !== false) reason='REAL_SOURCE_PROVENANCE_REQUIRED';
    else if (original.coordinate && !validCoordinate(original.coordinate)) reason='INVALID_COORDINATE';
    else if (['weather','ipmaWeather','fires','firms'].includes(id) && !validCoordinate(original.coordinate)) reason='COORDINATE_REQUIRED';
    else if (['weather','ipmaWeather','firms'].includes(id) && !validTime(original.observedAt)) reason='OBSERVATION_TIME_REQUIRED';
    else if (original.observedAt && (!validTime(original.observedAt) || Date.parse(original.observedAt)>Date.parse(asOf))) reason='INVALID_OR_FUTURE_OBSERVATION';
    else if (original.receivedAt && (!validTime(original.receivedAt) || Date.parse(original.receivedAt)>Date.parse(asOf))) reason='INVALID_OR_FUTURE_RECEIPT';
    if (reason) { rejected.push({id:String(original?.id??'unknown').slice(0,160),reason}); continue; }
    const record={...original};
    if (['weather','ipmaWeather'].includes(id)) {
      const invalidFields=[];
      for (const [key,[low,high]] of Object.entries(WEATHER_BOUNDS)) {
        const value=record[key];
        if (value !== null && value !== undefined && (typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)) {record[key]=null;invalidFields.push(key);}
      }
      if(invalidFields.length)record.validation={state:'PARTIAL',invalidFields};
    }
    data.push(record);
  }
  return {data,rejected:rejected.slice(0,OBSERVATION_LIMITS.rejectedRecords),rejectedCount:rejected.length};
}

/** First receipt survives refetch; differing values for an identical observation identity remain separate revisions. */
export function retainObservationHistory(previous=[], incoming=[], {sourceId,receivedAt,asOf}={}) {
  const now=Date.parse(asOf), map=new Map();
  for(const record of [...previous,...incoming.map(r=>({...r,sourceId,receivedAt:r.receivedAt??receivedAt}))]) {
    if(!record||typeof record!=='object')continue;
    if(!validTime(record.observedAt)||Date.parse(record.observedAt)>now||Date.parse(record.observedAt)<now-OBSERVATION_LIMITS.historyHours*3600000||!validCoordinate(record.coordinate)||record.provenance?.synthetic!==false)continue;
    const values=Object.fromEntries(Object.keys(WEATHER_BOUNDS).concat('windDirection').map(key=>[key,record[key]??null]));
    const observationId=`${record.sourceId}:${record.id}:${record.observedAt}`;
    const revision=hash([values,record.coordinate]),key=`${observationId}:${revision}`;
    if(!map.has(key))map.set(key,{...record,observationId,revision});
  }
  return [...map.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)).slice(-OBSERVATION_LIMITS.historyRecords);
}
