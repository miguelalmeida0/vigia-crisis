import { createHash } from 'node:crypto';

export const FACILITY_TYPES = Object.freeze(['hospital','health_center','fire_station','police_station','public_prosecutor','civil_protection','official_wildfire_refuge','emergency_assembly_point','temporary_reception_center','shelter_generic','school','municipal_building','water_point','other_public_facility']);
// Relevance is a domain contract; it never asserts availability or capability.
export function facilityPresentation(type) {
 const reception=['official_wildfire_refuge','temporary_reception_center'].includes(type);
 const publicAccess=['hospital','health_center', 'municipal_building'].includes(type);
 return {
  showPublicContact:!['water_point','shelter_generic'].includes(type),
  showPublicAccess:publicAccess,
  showEmergencyDepartment:type==='hospital',
  showEmergencyShelterStatus:reception,
  showCapacity:reception,
  showOfficialDesignation:reception||type==='emergency_assembly_point',
  showResponseCapability:['fire_station','civil_protection'].includes(type),
  showWaterAvailability:type==='water_point',showRouting:true,
  capacity:reception?'NOT_RESOLVED_YET':'NOT_APPLICABLE',
  openingStatus:publicAccess||reception?'NOT_RESOLVED_YET':'NOT_APPLICABLE',
  distanceReference:'REPORTED_INCIDENT_POINT',
 };
}
export const canonicalTypeFromKind=kind=>({HOSPITAL:'hospital',FIRE_STATION:'fire_station',POLICE:'police_station',CIVIL_PROTECTION:'civil_protection',SHELTER:'shelter_generic',WATER_POINT:'water_point',PUBLIC_INSTITUTION:'other_public_facility'})[kind]??'other_public_facility';
export const AUTHORITY = Object.freeze({OWNER:1,GOVERNMENT:2,MUNICIPAL:3,OSM:4,PLACE_PROVIDER:5,REVERSE_GEOCODER:6,GEOMETRY:7});
export const MISSING_STATES = Object.freeze(['NOT_PUBLISHED','NOT_RESOLVED_YET','SOURCE_UNAVAILABLE','AMBIGUOUS','CONFLICTING','NOT_APPLICABLE','STALE','UNKNOWN']);
export const LOCATION_QUALITY = Object.freeze(['VERIFIED_FACILITY_LOCATION','OFFICIAL_ADDRESS','MAP_POINT','REVERSE_GEOCODED_LOCATION','LOCALITY_ONLY','APPROXIMATE','UNKNOWN']);
export const hash = value => createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const normalize = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/accao/g,'acao').replace(/\bdiap\b/g,'departamento investigacao acao penal').replace(/[^a-z0-9]+/g,' ').trim();
export const validPoint = value => Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&Math.abs(value[0])<=180&&Math.abs(value[1])<=90;
export function distanceKm(a,b){if(!validPoint(a)||!validPoint(b))return null;const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2)));}
const SAFE_FIELDS = new Set(['canonicalName','canonicalType','subtype','operator','authority','address.street','address.houseNumber','address.postcode','address.locality','address.municipality','address.district','address.country','contact.phone','contact.email','contact.website','location.geometry','location.locationQuality','capabilities.emergencyDepartment','capabilities.fireResponse','capabilities.wildfireRefuge','capabilities.evacuationCenter','capabilities.publicAccess','notice.roadClosure','notice.evacuationInstruction','notice.activation']);
const HIGH_RISK = new Set(['capabilities.wildfireRefuge','capabilities.evacuationCenter','notice.roadClosure','notice.evacuationInstruction','notice.activation']);
const SPECIAL_TYPES = new Set(['official_wildfire_refuge','emergency_assembly_point','temporary_reception_center']);
for(const field of ['designation.kind','designation.authority','designation.historicalKind','activation.state','activation.lastReported','activation.observedAt']){SAFE_FIELDS.add(field);HIGH_RISK.add(field);}
export function validateCandidate(candidate,document,{now=new Date().toISOString(),trustedRule=false,reviewed=false}={}){
 const reject=reason=>({accepted:false,reason,candidate});
 if(!candidate||!SAFE_FIELDS.has(candidate.predicate))return reject('UNSUPPORTED_PREDICATE');
 if(!document?.id||!document.source?.provider||!AUTHORITY[document.source.authority]||!document.source.url||!Number.isFinite(Date.parse(document.retrievedAt)))return reject('SOURCE_REQUIRED');
 if(!candidate.subjectCandidate||typeof candidate.sourceText!=='string'||candidate.sourceText.length<2||candidate.sourceText.length>6000||!document.text.includes(candidate.sourceText)||!candidate.sourceLocator)return reject('SUPPORTING_PASSAGE_REQUIRED');
 if(candidate.value===null||candidate.value===undefined||JSON.stringify(candidate.value).length>4000)return reject('VALUE_REQUIRED_OR_TOO_LARGE');
 if(candidate.predicate!=='location.geometry'&&!candidate.predicate.startsWith('capabilities.')&&typeof candidate.value!=='string')return reject('INVALID_VALUE_TYPE');
 if(candidate.predicate.startsWith('address.')&&AUTHORITY[document.source.authority]>=AUTHORITY.REVERSE_GEOCODER)return reject('REVERSE_LOCATION_IS_NOT_POSTAL_ADDRESS');
 for(const key of ['validFrom','validUntil'])if(candidate[key]&&!Number.isFinite(Date.parse(candidate[key])))return reject('INVALID_VALIDITY');
 if(candidate.validFrom&&candidate.validUntil&&Date.parse(candidate.validFrom)>=Date.parse(candidate.validUntil))return reject('INVALID_VALIDITY');
 if(candidate.predicate==='canonicalType'&&!FACILITY_TYPES.includes(candidate.value))return reject('INVALID_TYPE');
 if(candidate.predicate==='designation.kind'&&!['WILDFIRE_REFUGE','ASSEMBLY_POINT','RECEPTION_CENTER'].includes(candidate.value))return reject('INVALID_DESIGNATION');
 if(candidate.predicate==='activation.state'&&!['ACTIVATED','INACTIVE','CLOSED'].includes(candidate.value))return reject('INVALID_ACTIVATION');
 if(candidate.predicate==='activation.state'&&(!candidate.validFrom||!candidate.validUntil))return reject('ACTIVATION_VALIDITY_REQUIRED');
 if(candidate.predicate==='location.geometry'&&(candidate.value.type!=='Point'||!validPoint(candidate.value.coordinates)))return reject('INVALID_GEOMETRY');
 if(candidate.predicate==='location.locationQuality'&&!LOCATION_QUALITY.includes(candidate.value))return reject('INVALID_LOCATION_QUALITY');
 if(candidate.predicate==='contact.phone'&&!/^\+?[\d ()-]{7,30}$/.test(candidate.value))return reject('INVALID_PHONE');
 if(candidate.predicate==='contact.email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.value))return reject('INVALID_EMAIL');
 if(candidate.predicate==='contact.website'){try{const url=new URL(candidate.value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw 0;}catch{return reject('INVALID_WEBSITE');}}
 if(candidate.predicate==='address.postcode'&&!/^\d{4}-\d{3}$/.test(candidate.value))return reject('INVALID_POSTCODE');
 if(candidate.predicate.startsWith('capabilities.')&&typeof candidate.value!=='boolean')return reject('INVALID_CAPABILITY');
 const high=HIGH_RISK.has(candidate.predicate)||(candidate.predicate==='canonicalType'&&SPECIAL_TYPES.has(candidate.value));
 if(high&&(!(trustedRule||reviewed)||AUTHORITY[document.source.authority]>3))return reject('HIGH_RISK_REQUIRES_AUTHORITY_ADMISSION');
 if(candidate.extractionMethod==='LOCAL_MODEL'){
  if(high)return reject('MODEL_CANNOT_ACTIVATE_OPERATIONAL_STATE');
  // Text containment is necessary, but not sufficient for classification, capability or geometry assertions.
  if(candidate.predicate==='canonicalType'||candidate.predicate.startsWith('capabilities.')||candidate.predicate.startsWith('location.')||typeof candidate.value!=='string')return reject('MODEL_REVIEW_REQUIRED');
  if(!normalize(candidate.sourceText).includes(normalize(candidate.value)))return reject('VALUE_NOT_SUPPORTED');
  if(!normalize(candidate.sourceText).includes(normalize(candidate.subjectCandidate)))return reject('SUBJECT_NOT_BOUND_TO_PASSAGE');
  if(candidate.predicate==='contact.phone'&&new Set((candidate.sourceText.match(/(?:\+351[ -]?)?\b[29]\d(?:[ -]?\d){7}\b/g)??[]).map(v=>v.replace(/\D/g,''))).size>1)return reject('MULTIPLE_CONTACTS_REQUIRE_REVIEW');
  if(/\b(nao|antig[oa]|anterior|encerrad[oa]|historico|ignore|instructions|instrucoes)\b/.test(normalize(candidate.sourceText)))return reject('AMBIGUOUS_OR_HOSTILE_PASSAGE');
 }
 return{accepted:true,fact:{...candidate,id:'fact:'+hash([document.id,candidate.subjectCandidate,candidate.predicate,candidate.value,candidate.validFrom,candidate.validUntil]),documentId:document.id,source:{...document.source,retrievedAt:document.retrievedAt,publishedAt:document.publishedAt??null},firstSeen:now,lastSeen:now,ingestedAt:now,state:'ACCEPTED'}};
}
export function resolveFields(facts,{now=new Date().toISOString()}={}){
 const fields={},conflicts=[];
 for(const key of new Set(facts.map(f=>f.predicate))){
  const all=facts.filter(f=>f.predicate===key&&f.state==='ACCEPTED'),active=all.filter(f=>!f.supersededBy&&(!f.validFrom||Date.parse(f.validFrom)<=Date.parse(now))&&(!f.validUntil||Date.parse(f.validUntil)>Date.parse(now)));
  if(!active.length){fields[key]={value:null,state:all.length?'STALE':'NOT_RESOLVED_YET',provenance:all.map(f=>f.id)};continue;}
  const rank=Math.min(...active.map(f=>AUTHORITY[f.source.authority])),best=active.filter(f=>AUTHORITY[f.source.authority]===rank).sort((a,b)=>a.id.localeCompare(b.id));
  const values=new Map(best.map(f=>[JSON.stringify(f.value),f.value])),conflicting=values.size>1;
  fields[key]={value:conflicting?null:best[0].value,state:conflicting?'CONFLICTING':rank<=3?'RESOLVED':'PROBABLE',provenance:best.map(f=>f.id),authority:best[0].source.authority};
  const disagreement=active.filter(f=>!values.has(JSON.stringify(f.value)));
  if(conflicting||disagreement.length)conflicts.push({field:key,state:conflicting?'CONFLICTING':'LOWER_AUTHORITY_DISAGREEMENT',values:active.map(f=>({value:f.value,factId:f.id,source:f.source}))});
 }
 return{fields,conflicts};
}
const setPath=(object,path,value)=>{const parts=path.split('.');let target=object;for(const key of parts.slice(0,-1))target=target[key]??={};target[parts.at(-1)]=value;};
export function materializeEntity(entity,facts,{now=new Date().toISOString()}={}){
 const {fields,conflicts}=resolveFields(facts,{now}),result={id:entity.id,schemaVersion:'vigia.canonical-facility.v1',canonicalName:null,canonicalType:null,aliases:entity.aliases??[],externalIds:entity.externalIds??[],address:{},contact:{},location:{locationQuality:'UNKNOWN'},capabilities:{},fields,conflicts,updatedAt:now};
 for(const key of ['canonicalName','canonicalType','address.street','address.postcode','address.locality','address.municipality','contact.phone','contact.email','contact.website','operator'])fields[key]??={value:null,state:'NOT_RESOLVED_YET',provenance:[]};
 if(entity.matchResolution)result.matchResolution=entity.matchResolution;
 for(const [key,field]of Object.entries(fields))if(field.value!==null)setPath(result,key,field.value);
 result.presentation=facilityPresentation(result.canonicalType);
 result.resolutionState=conflicts.some(c=>c.state==='CONFLICTING')?'conflicting':!result.canonicalName||!result.canonicalType?'unresolved':Object.values(fields).some(f=>f.state==='PROBABLE')||!result.address.street?'probable':'resolved';
 result.provenance=Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,facts.filter(f=>field.provenance.includes(f.id)).map(f=>({factId:f.id,...f.source,sourceText:f.sourceText,sourceLocator:f.sourceLocator,resolutionMethod:f.extractionMethod,validFrom:f.validFrom??null,validUntil:f.validUntil??null}))]));
 result.revisionHash=hash([Object.fromEntries(Object.entries(result.fields).map(([key,field])=>[key,{value:field.value,state:field.state}])),result.presentation]);return result;
}
function similarity(a,b){const x=new Set(normalize(a).split(' ').filter(t=>t.length>2)),y=new Set(normalize(b).split(' ').filter(t=>t.length>2));return x.size&&y.size?[...x].filter(v=>y.has(v)).length/Math.max(x.size,y.size):0;}
export function resolveEntity(raw,candidates){
 const scored=candidates.map(entity=>{
  const external=(raw.externalIds??[]).some(id=>entity.externalIds?.includes(id));
  const d=distanceKm(raw.coordinate,entity.location?.geometry?.coordinates),municipality=normalize(raw.municipality),other=normalize(entity.address?.municipality);
  const phone=String(raw.phone??'').replace(/\D/g,'').replace(/^351(?=\d{9}$)/,''),samePhone=phone.length>=9&&phone===String(entity.contact?.phone??'').replace(/\D/g,'').replace(/^351(?=\d{9}$)/,'');
  const names=[entity.canonicalName,...entity.aliases??[]],name=Math.max(...names.map(n=>similarity(raw.name,n)),0);
  const sameAddress=Boolean(raw.postcode&&raw.postcode===entity.address?.postcode&&raw.street&&normalize(raw.street)===normalize(entity.address?.street));
  const addressConflict=!external&&((raw.postcode&&entity.address?.postcode&&raw.postcode!==entity.address.postcode)||(raw.street&&entity.address?.street&&normalize(raw.street)!==normalize(entity.address.street)&&name<1));
  const hardConflict=addressConflict||(d!==null&&d>10)||(municipality&&other&&municipality!==other)||(/\bregional\b/.test(normalize(raw.name))!==/\bregional\b/.test(normalize(entity.canonicalName))&&/\bcomarca\b/.test(normalize(raw.name)+' '+normalize(entity.canonicalName)));
  return{entityId:entity.id,score:external?100:Math.round(name*60)+(samePhone?30:0)+(sameAddress&&name>=.8?25:0)+(d!==null&&d<.4?25:0)+(municipality&&municipality===other?10:0),hardConflict,basis:{external,nameSimilarity:name,phone:samePhone,address:sameAddress,distanceKm:d,municipalityMatch:!!municipality&&municipality===other}};
 }).filter(r=>r.score>=45).sort((a,b)=>b.score-a.score||a.entityId.localeCompare(b.entityId));
 const valid=scored.filter(r=>!r.hardConflict),first=valid[0];
 if(!first)return{state:'unresolved',entityId:null,candidates:scored.slice(0,5)};
 if(valid[1]&&first.score-valid[1].score<15)return{state:'ambiguous',entityId:null,candidates:valid.slice(0,5)};
 const admitted=first.score>=80||(first.score>=75&&first.basis.nameSimilarity>=.8&&first.basis.distanceKm!==null&&first.basis.distanceKm<.4);
 return{state:admitted?'resolved':'probable',entityId:admitted?first.entityId:null,candidates:valid.slice(0,5)};
}
export function enrichmentPriority({distance=null,type,missing=[],conflict=false,visible=false,officialNotice=false}){return (distance!==null&&distance<5?40:distance!==null&&distance<25?20:0)+(['hospital','fire_station','official_wildfire_refuge'].includes(type)?20:0)+Math.min(missing.length,4)*5+(conflict?20:0)+(visible?10:0)+(officialNotice?20:0);}
export function selectWeatherStation(stations,coordinate,{now=new Date().toISOString(),maxAgeMs=3*3600000,maxDistanceKm=50}={}){return stations.map(s=>({...s,distanceKm:distanceKm(coordinate,s.coordinate),ageMs:Date.parse(now)-Date.parse(s.observedAt)})).filter(s=>s.valid!==false&&s.distanceKm!==null&&s.distanceKm<=maxDistanceKm&&s.ageMs>=0&&s.ageMs<=maxAgeMs).sort((a,b)=>(a.distanceKm+a.ageMs/3600000*5-Object.values(a.values??{}).filter(Number.isFinite).length)-(b.distanceKm+b.ageMs/3600000*5-Object.values(b.values??{}).filter(Number.isFinite).length)||String(a.id).localeCompare(String(b.id)))[0]??null;}
export function weatherDelta(previous,current,key){if(!previous||!current||previous.id!==current.id)return{state:'STATION_CHANGED',value:null};if(Date.parse(current.observedAt)<=Date.parse(previous.observedAt)||!Number.isFinite(previous.values?.[key])||!Number.isFinite(current.values?.[key]))return{state:'NOT_COMPARABLE',value:null};return{state:'MEASURED_DELTA',value:current.values[key]-previous.values[key],stationId:current.id,from:previous.observedAt,to:current.observedAt};}
