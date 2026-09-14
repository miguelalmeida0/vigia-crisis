const AVAILABILITY_ORDER=Object.freeze({AUTOMATIC_ACQUISITION_ACTIVE:0,AVAILABLE_NOW:0,CONFIRMED_SOURCE_OPPORTUNITY:1,SCHEDULED_CONFIRMED:1,MANUAL_FIELD_OBSERVATION_REQUIRED:2,MANUAL_REQUEST:2,INSUFFICIENT_SCHEDULE_EVIDENCE:3,PASS_DEPENDENT:3,PROVIDER_UNAVAILABLE:4,CREDENTIAL_REQUIRED:4,NO_ELIGIBLE_ASSET_CONFIGURED:5});
const time=(value)=>Number.isFinite(Date.parse(value??''))?Date.parse(value):Number.POSITIVE_INFINITY;
function normalizedAvailability(item){
  const raw=String(item.availabilityState??item.availability??item.state??'').toUpperCase();
  if(['AVAILABLE_NOW','AUTOMATIC_ACQUISITION_ACTIVE'].includes(raw))return'AUTOMATIC_ACQUISITION_ACTIVE';
  if(['SCHEDULED_CONFIRMED','CONFIRMED_SOURCE_OPPORTUNITY','CURRENT_AVAILABLE'].includes(raw))return'CONFIRMED_SOURCE_OPPORTUNITY';
  if(['MANUAL_REQUEST','FIELD_CAPACITY'].includes(raw))return'MANUAL_FIELD_OBSERVATION_REQUIRED';
  if(['UNAVAILABLE','FAILED','CREDENTIAL_REQUIRED'].includes(raw))return'PROVIDER_UNAVAILABLE';
  return'INSUFFICIENT_SCHEDULE_EVIDENCE';
}
function sourceFamily(item){return String(item.sourceFamily??item.sourceId??item.eligibleSource??'');}
function eligible(item){
  if(!item||!sourceFamily(item))return false;
  if(item.canCloseEvidenceNeed===false)return false;
  if(item.opportunityType==='UNKNOWN'||String(item.availability).toUpperCase()==='OWNER_UNRESOLVED')return false;
  return Boolean(item.authority||item.commitment?.id||item.ownerId||item.accessState==='CONNECTED'||item.opportunityType==='FIELD_CAPACITY');
}

export function deriveNextBestEvidence({unknowns=[],opportunities=[],existingPhysicalFamilies=[]}={}){
  const material=unknowns.filter((item)=>['DECISION_BLOCKING','DECISION_MATERIAL','OPERATIONALLY_RELEVANT'].includes(item.classification)),existing=new Set(existingPhysicalFamilies.map(String));
  const candidates=[];
  for(const unknown of material)for(const item of opportunities.filter(eligible)){
    const family=sourceFamily(item),availabilityState=normalizedAvailability(item),independent=!existing.has(family),eta=item.windowStart??item.scheduledAt??item.commitment?.confirmedAt??null;
    candidates.push({candidateId:String(item.id),unknownId:unknown.id,candidateEvidenceType:String(item.opportunityType??item.methodType??item.kind??'GOVERNED_EVIDENCE'),eligibleSource:family,asset:item.platform??item.label??null,availabilityState,eta,addressesUnknown:unknown.whatIsUnknown,whyRankedHere:[independent?'INDEPENDENT_SOURCE_FAMILY':'EXISTING_SOURCE_FAMILY',availabilityState,item.authority?'ATTRIBUTABLE_AUTHORITY':'CONFIGURED_OWNER'].sort(),assumptions:[item.blockerReason,item.limitation,...Object.entries(item.qualityDependencies??{}).filter(([,required])=>required===true).map(([key])=>key)].filter(Boolean),authority:item.authority??item.commitment?.id??item.ownerId??null,independent});
  }
  candidates.sort((a,b)=>(AVAILABILITY_ORDER[a.availabilityState]??9)-(AVAILABILITY_ORDER[b.availabilityState]??9)||Number(b.independent)-Number(a.independent)||time(a.eta)-time(b.eta)||a.candidateId.localeCompare(b.candidateId));
  const ranked=candidates.map((item,index)=>Object.freeze({...item,rank:index+1}));
  return Object.freeze({state:ranked.length?ranked[0].availabilityState:'NO_ELIGIBLE_ASSET_CONFIGURED',candidates:Object.freeze(ranked),automaticTaskCreated:false,qualification:'Ranked operational eligibility; no probability or invented information-gain value is asserted.'});
}
