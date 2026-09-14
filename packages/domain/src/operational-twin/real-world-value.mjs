/** Physical facts, not fire admission, dispatch authority or a safety model. */
export const MEASUREMENT_TYPES = Object.freeze(['OFFICIAL','OBSERVED_LOCAL','OBSERVED_NEARBY','OBSERVED_REGIONAL','MODELED','DERIVED','UNKNOWN']);
export const MISSING_REASONS = Object.freeze({
  FIELD_NOT_PROVIDED: 'This field is not provided by the selected source.',
  SOURCE_FAILED: 'The source could not be reached; any retained reading is its last known observation.',
  SOURCE_STALE: 'The last measurement is too old for current conditions.',
  NO_MATCHING_RECORD: 'No matching record was returned for this location and period.',
  NO_SUITABLE_LOCAL_OBSERVATION: 'No suitable local observation is available; station conditions may differ here.',
  CONFLICTING_VALUES: 'Two reports disagree; a single value cannot be selected.',
  PERMISSION_UNAVAILABLE: 'This information is outside your permitted scope.',
  CAPABILITY_NOT_CONNECTED: 'A source for this information is not connected.'
});
const time = v => Number.isFinite(Date.parse(v ?? '')) ? Date.parse(v) : null;
const iso = v => time(v) === null ? null : new Date(time(v)).toISOString();
const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) ? p : null;

/** @typedef {'OFFICIAL'|'OBSERVED_LOCAL'|'OBSERVED_NEARBY'|'OBSERVED_REGIONAL'|'MODELED'|'DERIVED'|'UNKNOWN'} MeasurementType */
/**
 * @typedef {Object} RealWorldValue
 * @property {string} id
 * @property {string|null} subjectId
 * @property {string} label
 * @property {number|string|null} value
 * @property {string} unit
 * @property {MeasurementType} measurementType
 * @property {string|null} observedAt
 * @property {string|null} receivedAt
 * @property {string|null} calculatedAt
 * @property {string|null} sourceId
 * @property {string|null} sourceName
 * @property {object|null} sourceLocation
 * @property {number|null} distanceToSubject Distance in km, never distance to a fire front.
 * @property {string} spatialScope
 * @property {string} freshnessState
 * @property {string|null} expiresAt
 * @property {object} suitability
 * @property {string[]} limitations
 * @property {string|null} provenanceRef
 */
/** @returns {RealWorldValue} */
export function realWorldValue({id,label,value=null,unit='',record={},asOf,ttlMs=null,context='',missingReason=null}) {
  const now=time(asOf), observedAt=iso(record.observedAt), receivedAt=iso(record.receivedAt), calculatedAt=iso(asOf);
  const sourceName=record.sourceName??record.source??null, sourceId=record.sourceId??sourceName;
  const measurementType=record.model||record.modelRun?'MODELED':MEASUREMENT_TYPES.includes(record.measurementType)?record.measurementType:'UNKNOWN';
  const observed=time(observedAt), basis=time(record.basisAt)??observed;
  const age=observed!==null&&now!==null&&observed<=now?now-observed:null;
  const dated=measurementType==='DERIVED'?now!==null&&basis!==null&&basis<=now:age!==null;
  const hasValue=typeof value==='number'?Number.isFinite(value):typeof value==='string'&&value.trim().length>0;
  const valid=hasValue&&dated&&Boolean(sourceName)&&!record.conflicting;
  const failed=/FAILED|UNAVAILABLE|QUARANTINED|COMPROMISED/i.test(record.sourceState??'');
  const stale=/STALE|DEGRADED/i.test(record.sourceState??record.freshness??'')||(basis!==null&&ttlMs!==null&&now-basis>ttlMs);
  const freshnessState=!valid?'UNKNOWN':failed?'SOURCE_FAILED':stale?'STALE':ttlMs===null?'AGE_ONLY':'CURRENT';
  const absentField=!hasValue&&(missingReason??record.missingReason)==='FIELD_NOT_PROVIDED';
  const reasonCode=record.conflicting?'CONFLICTING_VALUES':absentField?'FIELD_NOT_PROVIDED':failed?'SOURCE_FAILED':stale&&valid?'SOURCE_STALE':valid?null:missingReason??record.missingReason??'NO_MATCHING_RECORD';
  const spatialScope=record.spatialScope??(measurementType==='OBSERVED_LOCAL'?'AT_SOURCE_LOCATION':measurementType==='OBSERVED_NEARBY'?'NEARBY_CONTEXT':measurementType==='OBSERVED_REGIONAL'?'REGIONAL_CONTEXT':'UNSPECIFIED');
  const limitations=[...new Set([context,record.limitation,...(record.limitations??[]),reasonCode?MISSING_REASONS[reasonCode]:null,failed?MISSING_REASONS.SOURCE_FAILED:null].filter(Boolean))];
  return {id,subjectId:record.subjectId??null,label,value:valid?value:null,unit,measurementType,observedAt,receivedAt,calculatedAt,
    sourceId,sourceName,sourceLocation:record.sourceLocation??(point(record.coordinate)?{name:record.stationName??record.locationName??null,coordinate:point(record.coordinate)}:null),
    distanceToSubject:Number.isFinite(record.distanceKm)?record.distanceKm:null,spatialScope,
    validity:valid?'VALID_VALUE':'NO_VALID_VALUE',freshnessState,expiresAt:basis!==null&&ttlMs!==null?new Date(basis+ttlMs).toISOString():null,
    suitability:{state:!valid?'UNAVAILABLE':failed||stale?'HISTORICAL_CONTEXT':record.suitability?.state??(spatialScope==='REGIONAL_CONTEXT'?'REGIONAL_CONTEXT':measurementType==='MODELED'?'MODEL_CONTEXT':'SUITABLE_FOR_DECLARED_USE'),use:record.suitability?.use??'Describe the source observation; do not infer safety.'},
    limitations,missingReason:reasonCode,provenanceRef:record.provenanceRef??record.provenance?.rawSourceProductId??record.rawSourceProductId??record.id??null,
    definition:record.definition??null,transformation:record.transformation??'Source value, no interpolation.',supportingSources:record.supportingSources??[],conflicts:record.conflicts??[],version:record.provenance?.normalizerVersion??record.version??null,
    // Compatibility for existing physical views. asOf remains the observation clock.
    asOf:observedAt,source:sourceName,freshness:freshnessState==='SOURCE_FAILED'?'STALE':freshnessState,staleAfterMs:ttlMs,ageMinutes:age===null?null:Math.floor(age/60000),trend:null,
    status:!valid?'UNAVAILABLE':failed?'SOURCE_UNAVAILABLE':stale?'STALE':'REPORTED',context,location:record.stationName??record.locationName??null,reason:reasonCode?MISSING_REASONS[reasonCode]:null};
}
