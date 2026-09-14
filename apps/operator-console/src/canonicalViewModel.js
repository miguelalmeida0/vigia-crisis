import { finiteNumberOrNull } from './truth.js?v=2.1.0';

export function envelope(state,key){return state?.runtime?.canonical?.globals?.[key]?.value??null;}
export function incidentEnvelope(state,key){const id=state?.selectedIncidentId;return id?state?.runtime?.canonical?.incidents?.[id]?.[key]?.value??null:null;}
export function section(source,key){return source?.data?.[key]??{state:'UNAVAILABLE',authority:'BACKEND_CANONICAL',reason:'canonical_projection_not_loaded',value:null};}
export function value(source,key){const item=section(source,key);return item.state==='READY'||item.state==='DEGRADED'?item.value:null;}
export function sectionAvailable(source,key){return ['READY','DEGRADED'].includes(section(source,key).state);}
export function availableCount(source,key,items){return sectionAvailable(source,key)&&Array.isArray(items)?items.length:'Unavailable';}
export function collection(source,key){const item=value(source,key);return Array.isArray(item)?item:[];}
export function display(input,{missing='Unavailable'}={}){if(input===null||input===undefined||input==='')return missing;if(typeof input==='boolean')return input?'Yes':'No';if(typeof input==='number')return Number.isFinite(input)?String(input):missing;if(typeof input==='string')return input.replaceAll('_',' ');return missing;}

const operatorLabels=new Map([
  ['READY','Available'],['ACTIVE','Active'],['HEALTHY','Operational'],['OPERATIONAL','Operational'],['COMPLETED','Complete'],['SATISFIED','Satisfied'],
  ['DEGRADED','Source degraded'],['DEGRADED_PARTIAL','Map imagery partially unavailable'],['STALE','Last known'],['STALE_LAST_GOOD','Last known map'],
  ['FAILED','Unavailable'],['UNAVAILABLE','Unavailable'],['UNKNOWN','Not yet known'],['OPEN','Open'],['INSUFFICIENT','Additional observation required'],
  ['WAITING_ON_REALITY','Waiting on external source'],['WAITING_FOR_OBSERVATION','Waiting on external source'],['AUTHORITY_REQUIRED','Operator approval required'],
  ['MANUAL_ESCALATION_REQUIRED','Operator review required'],['AUTHORITATIVE_CRISIS_TRUTH_GATE_NOT_PASSED','Scientific validation pending'],
  ['TIME_ACCUMULATION_REQUIRED','More observation time is required'],['ABSTAINED','Geometry withheld'],['NOT_EXECUTED','Not yet eligible'],
  ['NOT_ELIGIBLE','Not yet eligible'],['SHADOW','Shadow mode'],['RESEARCH_ONLY','Shadow mode'],['PROMOTED','Operationally eligible'],
  ['CONTRADICTS','Contradictory'],['CONTRADICTORY','Contradictory'],['SUPPORTS','Supporting'],['CONFIRMED','Confirmed'],
  ['UNDER_REVIEW','Under review'],['NEW','New'],['UNRESOLVED','Unresolved'],['EXCLUDED','Not admitted'],['MONITORING','Monitoring'],
  ['STRUCTURED_FALLBACK','Map imagery unavailable'],['LOADING','Loading'],['LIVE','Map live']
  ,['VERIFIED_CURRENT','Verified current'],['DETECTION_CANDIDATE','Detection candidate'],['NEEDS_REVALIDATION','Needs revalidation'],['HISTORICAL_CLOSED','Historical · closed']
  ,['RETRY_SCHEDULED_SOURCE_DEGRADATION','Source retry scheduled'],['ESCALATED_SOURCE_DEGRADATION','Source degradation escalated'],['SOURCE_CHECK_SCHEDULED','Source check scheduled'],['SOURCE_RESOLUTION','Source resolution']
  ,['NOT_VERIFIED','Not verified'],['GEOLOCATED','Geolocated'],['NOT_GEOLOCATED','Not geolocated'],['RETAINED','Retained evidence'],['WITHHELD','Withheld']
  ,['GOVERNED_TERRAIN_PROVIDER_NOT_INTEGRATED_FOR_VALID_INCIDENT_COORDINATE','Terrain provider not integrated for this incident']
  ,['GOVERNED_ROAD_CONTEXT_NOT_INTEGRATED_FOR_VALID_INCIDENT_COORDINATE','Road context provider not integrated for this incident']
  ,['GOVERNED_ASSET_CONTEXT_NOT_INTEGRATED_FOR_VALID_INCIDENT_COORDINATE','Asset context provider not integrated for this incident']
]);

const sentenceCase=input=>{const words=String(input??'').replace(/^contract[.:]/i,'').replace(/^operational-transition:sha256:.*$/i,'operational change').replace(/^sha256:.*$/i,'technical record').replace(/^(?:incident|observation|evidence|source|family|transition):/i,'').replace(/[._:/-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();return words?words.replace(/^./,letter=>letter.toUpperCase()):'';};

export function operatorText(input,{missing='Unavailable'}={}){
  if(input===null||input===undefined||input==='')return missing;
  if(typeof input==='boolean')return input?'Yes':'No';
  if(typeof input==='number')return Number.isFinite(input)?String(input):missing;
  if(typeof input!=='string')return missing;
  const exact=operatorLabels.get(input.toUpperCase());if(exact)return exact;
  if(/^contract[.:]minimum[-_.]independent[-_.]families$/i.test(input))return'Independent confirmation required';
  if(/^wildfire[.:]independent[-_.]physical[-_.]corroboration$/i.test(input))return'Independent physical confirmation';
  if(/^wildfire[.:]official[-_.]corroboration$/i.test(input))return'Official incident confirmation';
  if(/^source selection required$/i.test(input))return'Source not yet identified';
  if(/^wildfire[.:]/i.test(input))return sentenceCase(input.replace(/^wildfire[.:]/i,''));
  if(/^canonical_projection_not_/i.test(input)||/_projection_(?:not_)?available$/i.test(input))return'Current information unavailable';
  if(/^incident:\d+$/i.test(input))return`Incident ${input.split(':').at(-1).slice(-5)}`;
  if(/^incident:/i.test(input))return`Incident ${sentenceCase(input.split(':').slice(1).join(' '))}`;
  if(/^evidence:/i.test(input))return'Evidence statement';
  if(/^observation:/i.test(input))return'Field observation';
  if(/^source:/i.test(input))return'Evidence source';
  if(/^family:/i.test(input))return'Source family';
  if(/^transition:/i.test(input))return'Operational change';
  if(/^(?:need|debt):/i.test(input))return'Information to collect';
  if(/^work:/i.test(input))return'Operational action';
  if(/^operational-transition:sha256:/i.test(input))return'Operational change';
  if(/^sha256:/i.test(input))return'Technical record';
  if(/^[A-Z][A-Z0-9_:-]{2,}$/.test(input)||/^contract[.:]/i.test(input))return sentenceCase(input);
  return input;
}

export function technicalIdLabel(input,{prefix='Record'}={}){const value=String(input??'').trim();if(!value)return`${prefix} unavailable`;const tail=value.split(':').at(-1).replace(/^sha256:/,'');return`${prefix} ${tail.slice(-6)}`;}
export function timeLabel(input){const at=Date.parse(input??'');return Number.isFinite(at)?`${new Date(at).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short',hour12:false})} UTC`:'Time unavailable';}
export function canonicalIncidents(source){const twin=value(source,'canonicalIncidents')??value(source,'incidents')??value(source,'situationalAwareness');return Array.isArray(twin?.incidents)?twin.incidents:[];}
export function selectedIncident(state){const detail=incidentEnvelope(state,'detail'),row=value(detail,'canonicalIncident');if(row)return row;const target=String(state?.selectedIncidentId??'');return canonicalIncidents(envelope(state,'incidents')).find(item=>incidentId(item)===target)??canonicalIncidents(envelope(state,'commandOverview')).find(item=>incidentId(item)===target)??null;}
export function incidentId(row){return String(row?.incident?.id??row?.incidentId??row?.id??'');}
export function incidentLabel(row){
  const raw=row?.incident?.operatorIdentity?.label??row?.operatorIdentity?.label??row?.incident?.label??row?.incident?.name??row?.label??incidentId(row),label=operatorText(raw,{missing:'Unnamed incident'});
  if(!/^Incident(?:\s+(?:Pt\s+\d{4}|\d+|[a-f0-9]{8,}))\b/i.test(label))return label;
  const place=row?.incident?.location?.label??row?.incident?.jurisdiction??row?.incident?.region??row?.location?.label;
  if(typeof place==='string'&&place.trim()&&!/^[-+]?\d/.test(place.trim()))return`${place.trim()} incident`;
  const coordinate=incidentCoordinate(row);
  return coordinate?`Incident near ${coordinate[1].toFixed(2)}, ${coordinate[0].toFixed(2)}`:'Current incident';
}
export function incidentLocation(row){const coordinate=incidentCoordinate(row);return display(row?.incident?.operatorIdentity?.locationLabel??row?.operatorIdentity?.locationLabel??row?.incident?.location?.label??row?.incident?.jurisdiction??row?.incident?.region??row?.location?.label??(coordinate?`${coordinate[1].toFixed(4)}, ${coordinate[0].toFixed(4)}`:null),{missing:'Location unavailable'});}
export function incidentCoordinate(row){const direct=row?.incident?.coordinate??row?.coordinate??row?.incident?.geometry?.coordinates??row?.incident?.location?.geometry?.coordinates??row?.location?.geometry?.coordinates;if(Array.isArray(direct)&&direct.length===2&&direct.every(Number.isFinite))return direct;return null;}
export function incidentAssessment(row){return operatorText(row?.evaluation?.state??row?.assessment?.state??row?.state,{missing:'Assessment unavailable'});}
export function incidentChangedAt(row){const transitions=row?.transitions??row?.transitionHistory??[];return transitions.at?.(-1)?.at??row?.operationalTruth?.lastObservedAt??row?.incident?.operationalTruth?.lastObservedAt??row?.updatedAt??row?.incident?.updatedAt??null;}
export function incidentUnknown(row){const debt=Array.isArray(row?.evidenceDebt)?row.evidenceDebt:Array.isArray(row?.evidenceDebt?.items)?row.evidenceDebt.items:[];return operatorText(debt[0]?.whatIsMissing??debt[0]?.missingQuantity??debt[0]?.quantity_question??debt[0]?.label??debt[0]?.id,{missing:'Ranked unknown unavailable'});}
export function incidentNextDecision(row){return operatorText(row?.nextDecision?.label??row?.decision?.next??row?.evaluation?.nextRequiredInformation,{missing:'Not provided'});}
export function incidentEvidenceClass(row){return operatorText(row?.evaluation?.state??row?.claim?.evidenceClass??row?.evidenceClass,{missing:'Not classified'});}
export function twinFrom(source,key){return value(source,key);}
export function objectRows(source,matcher){const repository=value(source,'semanticRepository')??value(source,'semanticObjects');const objects=repository?.objects??{};return Object.entries(objects).filter(([kind])=>matcher.test(kind)).flatMap(([,rows])=>Array.isArray(rows)?rows:[]);}
export function evidenceGraph(source){const direct=value(source,'evidenceGraph');if(direct&&!Array.isArray(direct)&&typeof direct==='object')return direct;const assessment=value(source,'currentAssessment');if(assessment?.evidenceGraph&&typeof assessment.evidenceGraph==='object')return assessment.evidenceGraph;return null;}
export function evidenceQualification(source){return value(source,'evidenceQualification')??value(source,'currentAssessment')?.evaluation??null;}
export function evidenceDebtItems(input){if(Array.isArray(input))return input;if(Array.isArray(input?.items))return input.items;return[];}
export function evidenceNeeds(input){if(Array.isArray(input?.needs))return input.needs;return[];}
export function backendState(input,{missing='UNAVAILABLE'}={}){const value=input?.state??input?.status;return value===null||value===undefined||value===''?missing:String(value);}
export function explicitEvidenceRole(item){const role=String(item?.evidenceRole??item?.role??item?.function??item?.relation??'').toUpperCase();return ['SUPPORTS','CONTRADICTS','DISTINGUISHES','UNRESOLVED'].includes(role)?role:null;}
export function informationValue(item){return operatorText(item?.informationValue?.explanation??item?.informationValue??item?.priorityExplanation??item?.valueExplanation,{missing:'Not measured'});}
export function measured(input,{suffix=''}={}){const number=finiteNumberOrNull(input);return number===null?'Not measured':`${number.toLocaleString()}${suffix}`;}
export function dependencyState(state,key){return state?.runtime?.canonical?.dependencies?.[key]?.state??'NOT_REQUESTED';}
export function isCurrent(state,key){return dependencyState(state,key)==='READY';}

const routeProjectionKeys=Object.freeze({
  'command-overview':{scope:'global',key:'commandOverview'},
  incidents:{scope:'global',key:'incidents'},
  'incident-detail':{scope:'incident',key:'detail'},
  intelligence:{scope:'incident',key:'intelligence'},
  operations:{scope:'incident',key:'operations'},
  'reports-analytics':{scope:'global',key:'reports'},
  'global-awareness':{scope:'global',key:'globalAwareness'},
});

export function routeProjectionDependency(state,route){
  const descriptor=routeProjectionKeys[route]??routeProjectionKeys['command-overview'],canonical=state?.runtime?.canonical??{},incidentKey=String(state?.selectedIncidentId??''),incidentStore=incidentKey?canonical?.incidents?.[incidentKey]:null;
  const entry=descriptor.scope==='global'?canonical?.globals?.[descriptor.key]:incidentStore?.[descriptor.key],dependencyKey=descriptor.scope==='global'?descriptor.key:`incident:${incidentKey}:${descriptor.key}`,dependency=entry?.dependency??canonical?.dependencies?.[dependencyKey]??null;
  let projectionState=String(dependency?.state??'').toUpperCase();
  if(!projectionState)projectionState=entry?.value?'READY':incidentStore?.loading?'LOADING':state?.runtime?.status==='loading'?'LOADING':'NOT_REQUESTED';
  if(route==='operations'&&['FAILED','NOT_REQUESTED'].includes(projectionState)){
    const governedWork=incidentStore?.detail?.value?.data?.governedWork;
    if(['READY','DEGRADED'].includes(String(governedWork?.state??'').toUpperCase())&&Array.isArray(governedWork.value))projectionState='DEGRADED';
  }
  return{state:projectionState,scope:descriptor.scope,key:descriptor.key,dependencyKey,retained:projectionState==='STALE'&&Boolean(entry?.value),lastGoodAt:dependency?.lastGoodAt??dependency?.lastSuccessAt??null,lastAttemptAt:dependency?.lastAttemptAt??null,deliveryState:dependency?.deliveryState??null,failureClass:dependency?.failureClass??null};
}
