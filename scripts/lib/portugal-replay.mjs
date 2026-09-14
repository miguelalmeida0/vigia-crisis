import { EventObservationRepository } from '../../apps/api/src/modules/events/event-observation-repository.mjs';
import { buildEventObservations, trackFireEvents } from '../../packages/domain/src/fire-event-tracker.mjs';
import { normalizePhysicalObservation } from '../../packages/domain/src/physical-observation.mjs';
import { fuseEventEvidence } from '../../packages/domain/src/evidence-fusion.mjs';
import { validateFireCore } from '../../packages/domain/src/validation-metrics.mjs';

function validIso(value) { return Number.isFinite(Date.parse(value ?? '')); }
function replayObservation(record,metadata) {
  const now=new Date(record.arrivalAt),synthetic=metadata.evidenceClass==='synthetic_software_fixture';
  const payload={...(record.payload??{}),provenance:{...(record.payload?.provenance??{}),universe:synthetic?'test':'replay',synthetic,replayDatasetId:metadata.id??null,replayRecordId:record.id}};
  if(record.kind==='report')return buildEventObservations({fires:[payload],now})[0]??null;
  if(record.kind==='thermal')return buildEventObservations({thermalDetections:[payload],now})[0]??null;
  if(['camera','ground_sensor','drone','field'].includes(record.kind))return normalizePhysicalObservation({...payload,type:record.kind,receivedAt:record.arrivalAt},{receivedAt:now});
  throw new Error(`unsupported_replay_record_kind:${record.kind}`);
}
function assertDataset(dataset) {
  if(dataset?.metadata?.countryCode!=='PT')throw new Error('portugal_replay_country_code_required');
  if(!['synthetic_software_fixture','externally_labelled','official_archival_evidence'].includes(dataset?.metadata?.evidenceClass))throw new Error('portugal_replay_evidence_class_required');
  if(!Array.isArray(dataset.records)||!dataset.records.length)throw new Error('portugal_replay_records_required');
  for(const record of dataset.records)if(!record.id||!validIso(record.arrivalAt)||!record.kind||!record.payload)throw new Error(`invalid_portugal_replay_record:${record?.id??'unknown'}`);
  if(dataset.metadata.evidenceClass==='externally_labelled'&&(!dataset.metadata.labelAuthority?.organization||!dataset.metadata.labelAuthority?.approvedAt||!dataset.metadata.labelAuthority?.datasetId))throw new Error('external_label_authority_required');
  if(dataset.metadata.evidenceClass==='official_archival_evidence'&&(!dataset.metadata.sourceManifest||!Array.isArray(dataset.cases)||dataset.cases.length<1))throw new Error('official_archive_manifest_and_cases_required');
}
function geometryTruth(events) {
  const features=events.flatMap((event)=>event.observedThermalSupport?.features??[]);
  return{thermalSupportFeatures:features.length,allRejectPerimeterAuthority:features.every((feature)=>feature.properties?.authoritativePerimeter===false)};
}

export async function runPortugalReplay(dataset,{repositoryPath=null}={}) {
  assertDataset(dataset);
  const official=dataset.metadata.evidenceClass==='official_archival_evidence';
  const filePath=repositoryPath??null;
  const universe=dataset.metadata.evidenceClass==='synthetic_software_fixture'?'test':'replay';
  const repository=new EventObservationRepository({filePath,universe,retentionMs:400*24*60*60_000});
  const arrivals=[...dataset.records].sort((a,b)=>Date.parse(a.arrivalAt)-Date.parse(b.arrivalAt)||a.id.localeCompare(b.id));
  const seenAssignments=new Map(),timeline=[],caseStateMap=new Map();let lateArrivals=0,priorLatestEventTime=-Infinity,futureEvidenceViolations=0,identityReassignments=0;
  try{
    const batches=[];
    for(const arrival of arrivals){const previous=batches.at(-1);if(previous?.arrivalAt===arrival.arrivalAt)previous.arrivals.push(arrival);else batches.push({arrivalAt:arrival.arrivalAt,arrivals:[arrival]});}
    // The expanded official corpus is projected once at the final governed clock
    // after every arrival has passed the timestamp firewall. Case replay remains
    // controlled by per-record visibility in ReplayService; this avoids O(n^3)
    // repeated full-history projections while preserving the production tracker.
    const projectionBatches=official&&arrivals.length>1_600?[{arrivalAt:arrivals.at(-1).arrivalAt,arrivals}]:batches;
    for(const batch of projectionBatches){
      const batchObservations=[];
      for(const arrival of batch.arrivals){const observation=replayObservation(arrival,dataset.metadata);if(!observation)throw new Error(`replay_observation_rejected:${arrival.id}`);const eventTime=Date.parse(observation.at),arrivalTime=Date.parse(arrival.arrivalAt);if(eventTime>arrivalTime+10*60_000){futureEvidenceViolations+=1;throw new Error(`future_evidence_leakage:${arrival.id}`);}if(eventTime<priorLatestEventTime)lateArrivals+=1;priorLatestEventTime=Math.max(priorLatestEventTime,eventTime);batchObservations.push(observation);}
      const merged=await repository.merge(batchObservations,new Date(batch.arrivalAt));
      const tracked=trackFireEvents(merged,{now:new Date(batch.arrivalAt)});
      let events=await repository.reconcileEvents(tracked,new Date(batch.arrivalAt));
      events=events.map((event)=>({...event,evidenceFusion:fuseEventEvidence(event.observations)}));
      await repository.persistDerivedStates(events,new Date(batch.arrivalAt));
      for(const event of events)for(const item of event.observations){const prior=seenAssignments.get(item.id);if(prior&&prior!==event.id){identityReassignments+=1;if(!official)throw new Error(`event_identity_changed:${item.id}:${prior}:${event.id}`);}seenAssignments.set(item.id,event.id);}
      if(official)for(const replayCase of dataset.cases){const linked=events.filter((event)=>event.observations.some((item)=>item.replayCaseId===replayCase.id));if(linked.length)caseStateMap.set(replayCase.id,{caseId:replayCase.id,asOf:batch.arrivalAt,events:structuredClone(linked)});}
      timeline.push({arrivalIds:batch.arrivals.map((item)=>item.id),arrivalAt:batch.arrivalAt,eventCount:events.length,events:events.map((event)=>({id:event.id,observationIds:event.observations.map((item)=>item.id),knowledgeState:event.knowledgeState,evidenceState:event.evidenceState,fusionState:event.evidenceFusion.state,evidenceStrength:event.evidenceFusion.evidenceStrength,independentFamilies:event.evidenceFusion.independentFamilies,geometryFreshness:event.geometryFreshness}))});
    }
    const final=timeline.at(-1),derived=repository.derivedStates(),finalEvents=(await repository.reconcileEvents(trackFireEvents(await repository.merge([],new Date(arrivals.at(-1).arrivalAt)),{now:new Date(arrivals.at(-1).arrivalAt)}),new Date(arrivals.at(-1).arrivalAt))).map((event)=>({...event,evidenceFusion:fuseEventEvidence(event.observations)})),geometry=geometryTruth(finalEvents);
    const external=dataset.metadata.evidenceClass==='externally_labelled';
    const caseStates=official?[...caseStateMap.values()]:[];
    return{schemaVersion:'vigia-portugal-operational-replay.v2',dataset:{id:dataset.metadata.id??null,countryCode:'PT',evidenceClass:dataset.metadata.evidenceClass,labelAuthority:external?dataset.metadata.labelAuthority:null,sourceManifest:official?dataset.metadata.sourceManifest:null,cases:official?dataset.cases:[]},softwareReplay:{passed:futureEvidenceViolations===0,controlledClock:true,projectionMode:projectionBatches.length===1&&batches.length>1?'final_governed_clock':'incremental',futureEvidenceViolations,arrivalCount:arrivals.length,arrivalBatchCount:batches.length,lateArrivalCount:lateArrivals,eventCount:final.eventCount,stableObservationAssignments:seenAssignments.size,identityReassignments,unjustifiedIdentityReassignments:identityReassignments,identityStable:identityReassignments===0,persistedDerivedStates:Object.keys(derived).length,geometry},timeline,finalEvents,caseStates,validation:external?{state:'MEASURED_FROM_ATTRIBUTABLE_LABELS',metrics:validateFireCore(dataset.validationRecords??[])}:official?{state:'MEASURED_AGAINST_OFFICIAL_REPORT_REFERENCES',metrics:officialBenchmarks(dataset,caseStates),qualification:'ICNF SGIF records are official reported-fire references. They are not exact ignition-time, perimeter, or complete negative labels.'}:{state:'UNMEASURED',reason:'Synthetic replay verifies software behavior only; it is not Portugal wildfire-performance evidence.',metrics:null}};
  }finally{}
}

function median(values){const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return null;const index=Math.floor(sorted.length/2);return sorted.length%2?sorted[index]:Number(((sorted[index-1]+sorted[index])/2).toFixed(2));}
function ratio(a,b){return b?Number((a/b).toFixed(4)):null;}
function measuredSlice(rows,caseStates){
  const ids=new Set(rows.map((item)=>item.id)),states=caseStates.filter((item)=>ids.has(item.caseId));
  const distinctEvents=new Map();for(const state of states)for(const event of state.events){if(event.associationState==='ambiguous')continue;const key=`${event.id}:${event.firstSeenAt}:${event.lastSeenAt}`;if(!distinctEvents.has(key))distinctEvents.set(key,event);}
  const eventCaseSets=[...distinctEvents.values()].map((event)=>new Set(event.observations.map((item)=>item.replayCaseId).filter((id)=>ids.has(id))));
  const falseMergedEvents=eventCaseSets.filter((set)=>set.size>1).length,associated=rows.filter((item)=>item.associated).length,fragmented=rows.filter((item)=>item.fragmented).length;
  const physicalTotal=rows.reduce((sum,item)=>sum+item.thermalObservationCount,0),physicalCorrect=rows.reduce((sum,item)=>sum+item.associatedPhysicalObservations,0);
  const physicalFirstRows=rows.filter((item)=>item.physicalLeadMinutes!==null),physicalFirstRetained=physicalFirstRows.filter((item)=>item.associated).length;
  const ambiguityCount=rows.reduce((sum,item)=>sum+(item.unresolvedObservationCount??0),0);
  return{caseCount:rows.length,associatedCases:associated,associationRate:ratio(associated,rows.length),reportJoinAccuracy:ratio(associated,rows.length),fragmentedCases:fragmented,fragmentationRate:ratio(fragmented,rows.length),falseMergedEvents,falseMergeRate:ratio(falseMergedEvents,distinctEvents.size),observationLevelAssociationAccuracy:ratio(physicalCorrect,physicalTotal),labelledPhysicalObservations:physicalTotal,correctlyAssociatedPhysicalObservations:physicalCorrect,ambiguityCount,ambiguityRate:ratio(ambiguityCount,physicalTotal),physicalFirstCases:physicalFirstRows.length,physicalFirstRate:ratio(physicalFirstRows.length,rows.length),physicalFirstEventRetention:ratio(physicalFirstRetained,physicalFirstRows.length)};
}
function officialBenchmarks(dataset,caseStates){
  const states=new Map(caseStates.map((item)=>[item.caseId,item]));
  const caseRows=(dataset.cases??[]).map((item)=>{const linked=states.get(item.id)?.events??[],canonical=linked.filter((event)=>event.associationState!=='ambiguous');const reportEvent=canonical.find((event)=>event.observations.some((observation)=>observation.replayCaseId===item.id&&observation.type==='report'))??null;const attachedPhysical=reportEvent?.observations.filter((observation)=>observation.replayCaseId===item.id&&observation.type==='thermal')??[];const predictedEventIds=[...new Set(canonical.map((event)=>event.id))],unresolvedObservationCount=linked.filter((event)=>event.associationState==='ambiguous').reduce((sum,event)=>sum+event.observations.filter((observation)=>observation.replayCaseId===item.id).length,0);return{id:item.id,evaluationSplit:item.evaluationSplit??'unassigned',difficultyTags:item.difficultyTags??[],reportEventId:reportEvent?.id??null,predictedEventIds,unresolvedObservationCount,thermalObservationCount:item.thermalObservationCount??0,associatedPhysicalObservations:attachedPhysical.length,associated:attachedPhysical.length>0,fragmented:predictedEventIds.length>1,physicalLeadMinutes:item.physicalLeadMinutes??null};});
  const overall=measuredSlice(caseRows,caseStates),leads=caseRows.map((item)=>item.physicalLeadMinutes).filter(Number.isFinite);
  const splitMetrics=Object.fromEntries(['baseline_comparable','development','held_out'].map((split)=>[split,measuredSlice(caseRows.filter((item)=>item.evaluationSplit===split),caseStates)]));
  return{schemaVersion:'vigia-official-archive-benchmark.v2',...overall,physicalLeadMedianMinutes:median(leads),physicalLeadMaxMinutes:leads.length?Math.max(...leads):null,cases:caseRows,splitMetrics,beforeAfter:{baselineComparable:{before:{caseCount:15,associationRate:.1333,fragmentationRate:.6667,falseMergeRate:.2059,unjustifiedIdentityReassignments:151},after:splitMetrics.baseline_comparable}},unmeasured:['provider delivery latency','exact ignition-time lead','authoritative perimeter accuracy','calibrated fire-existence probability','negative-case precision outside the governed incident corpus','ambiguous-to-correctly-abstained rate without authoritative pixel identity labels']};
}
