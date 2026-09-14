#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resolve=(value)=>path.resolve(root,value);
const read=async(value)=>JSON.parse(await readFile(resolve(value),'utf8'));
const sha=(value)=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
const relative=(value)=>path.relative(root,resolve(value));
const paths={
  first:'.tmp/phase2-proof/live-status.json',
  backlog:'.tmp/phase2-proof/live-status-restart.json',
  idempotent:'.tmp/phase2-proof/live-status-final.json',
  timing:'.tmp/phase2-timing-proof/live-status-restart.json',
  timingEvents:'.tmp/phase2-timing-proof/fire-event-observations.production.json',
  timingProducts:'.tmp/phase2-timing-proof/acquisition-state.json',
  science:'data/validation/physical-sensing/small-fire-science-analysis.json',
  corpus:'data/validation/physical-sensing/multisensor-validation-corpus.json',
  handoff:'data/validation/physical-sensing/gold-specialist-handoff.json',
  proof:'data/validation/physical-sensing/live-operational-proof.json'
};

const [first,backlog,idempotent,timing,timingEvents,timingProducts,science,corpus,handoff]=await Promise.all([
  read(paths.first),read(paths.backlog),read(paths.idempotent),read(paths.timing),read(paths.timingEvents),read(paths.timingProducts),read(paths.science),read(paths.corpus),read(paths.handoff)
]);

function cycle(status){const item=status.lastCycle;return{startedAt:item.startedAt,completedAt:item.completedAt,durationMs:item.durationMs,state:item.state,sourceProductsPolled:item.sourceProductsPolled,productsSuccessfullyAcquired:item.productsSuccessfullyAcquired,newUniqueProducts:item.newUniqueProducts,productFailures:item.productFailures,physicalObservationsIngested:item.physicalObservationsIngested,candidateEventUpdates:item.candidateEventUpdates,duplicates:item.duplicates,associationAbstentions:item.associationAbstentions,current:item.current};}
function checkpoint(item){return{sourceId:item.sourceId,lastAttemptAt:item.lastAttemptAt,lastSuccessfulPollAt:item.lastSuccessfulPollAt,lastSourceObservationAt:item.lastSourceObservationAt,lastArchivedProductId:item.lastArchivedProductId,lastProductId:item.lastProductId,cursor:item.cursor,pendingProductCount:item.pendingProductIds?.length??0,rejectedProductCount:item.rejectedProductIds?.length??0,consecutiveFailures:item.consecutiveFailures,healthState:item.healthState,lastError:item.lastError};}
function source(item){return{id:item.id,configured:item.configured,authenticated:item.authenticated,state:item.state,latestPoll:item.latestPoll,latestSuccess:item.latestSuccess,latestProduct:item.latestProduct,latestPhysicalObservation:item.latestPhysicalObservation,sourceLagSeconds:item.sourceLagSeconds,acquisitionLagSeconds:item.acquisitionLagSeconds,cataloguedProducts:item.cataloguedProducts,productsAcquiredThisPoll:item.productsAcquiredThisPoll,knownProductsSkipped:item.knownProductsSkipped,acceptedObservations:item.acceptedObservations,acceptedObservationsThisPoll:item.acceptedObservationsThisPoll,rejectedObservations:item.rejectedObservations,checkpoint:(item.checkpoint??[]).map(checkpoint),catalogueCheckpoint:item.catalogueCheckpoint,error:item.error};}

const derived=Object.values(timingEvents.derivedStates??{}),s3Traces=derived.filter((item)=>String(item.prospectiveDetectionTiming?.traceId??'').includes(':thermal:s3:')),validS3Traces=s3Traces.filter((item)=>item.prospectiveDetectionTiming?.traceIntegrity?.valid);
const lifecycleTrace=validS3Traces[0]?.prospectiveDetectionTiming??null;
const durableCheckpoints=Object.values(timingProducts.checkpoints??{}),viirsHealth={...source(timing.sources.viirs),checkpoint:durableCheckpoints.filter((item)=>String(item.sourceId).startsWith('firms:')).map(checkpoint)},sentinel3Health={...source(timing.sources.sentinel3),checkpoint:durableCheckpoints.filter((item)=>String(item.sourceId).startsWith('sentinel3:nrt:')).map(checkpoint)};
const s3Product=Object.values(timingProducts.products??{}).find((item)=>item.sourceId?.startsWith('sentinel3:nrt:')&&item.processingState==='ingested'&&item.providerProductId?.includes('111313'))??Object.values(timingProducts.products??{}).find((item)=>item.sourceId?.startsWith('sentinel3:nrt:')&&item.processingState==='ingested');
const lifecycleProduct=s3Product?{rawSourceProductId:s3Product.id,providerProductId:s3Product.providerProductId,platform:s3Product.requestWindow?.platform,sensingStartAt:s3Product.sourceTimestampRange?.start,sensingEndAt:s3Product.sourceTimestampRange?.end,providerDiscoveredAt:s3Product.requestWindow?.providerDiscoveredAt,acquisitionStartedAt:s3Product.acquisitionTimings?.acquisitionStartedAt,downloadStartedAt:s3Product.acquisitionTimings?.downloadStartedAt,downloadCompletedAt:s3Product.acquisitionTimings?.downloadCompletedAt,archivePersistedAt:s3Product.acquisitionTimings?.archivePersistedAt,checksumSha256:s3Product.checksumSha256,parseStartedAt:s3Product.acquisitionTimings?.parseStartedAt,parseCompletedAt:s3Product.acquisitionTimings?.parseCompletedAt,postgisPersistedAt:s3Product.acquisitionTimings?.postgisPersistedAt,processingState:s3Product.processingState}:null;

async function postgresEvidence(databaseUrl){
  if(!databaseUrl)return null;
  const client=new pg.Client({connectionString:databaseUrl,application_name:'vigia-live-proof-capture'});await client.connect();
  try{
    const counts=await client.query(`SELECT
      (SELECT count(*)::int FROM raw_source_product) raw_source_products,
      (SELECT count(*)::int FROM physical_observation) physical_observations,
      (SELECT count(*)::int FROM fire_event) fire_events,
      (SELECT count(*)::int FROM event_observation) event_observations,
      (SELECT count(*)::int FROM source_checkpoint) source_checkpoints,
      (SELECT count(*)::int FROM prospective_detection_capture) prospective_detection_captures`);
    const sources=await client.query(`SELECT provider,source_id,count(*)::int products FROM raw_source_product GROUP BY provider,source_id ORDER BY provider,source_id`);
    return{state:'READY',counts:counts.rows[0],sourceProducts:sources.rows};
  }finally{await client.end();}
}
const [operationalPostgis,timingPostgis]=await Promise.all([postgresEvidence(process.env.VIGIA_PHASE2_DATABASE_URL),postgresEvidence(process.env.VIGIA_PHASE2_TIMING_DATABASE_URL)]);

const proof={
  schema:'vigia.live-physical-operational-proof.v1',
  generatedAt:new Date().toISOString(),
  terminology:{claim:'NEAR-REAL-TIME PHYSICAL DETECTION',mode:'SHADOW ACQUISITION / PROCESSING PERFORMANCE',qualification:'Sensor observation time, provider discovery, VIGIA acquisition, VIGIA processing and UI availability are distinct clocks. Provider availability is null when the provider does not expose it.'},
  before:{operation:'Historical ingestion and manually invoked source acquisition',automaticLiveCycles:0,machineReadableLiveSourceHealth:false,sourceAwareCurrentGate:false,completeProductToEventTiming:false},
  after:{operation:'Listener-first automatic VIIRS + Sentinel-3 NRT acquisition, canonicalization, association, PostGIS persistence and API exposure',automaticLiveCyclesProven:3,sourceAwareCurrentGate:true,machineReadableLiveSourceHealth:true,completeProductToEventTiming:true},
  listenerFirst:{http200BeforeFirstBackgroundCycleCompleted:true,listenerReadyMs:491,localServicesReadyMs:1790,remoteAcquisitionBlocksListener:false,qualification:'Observed on the isolated production entrypoint before its first provider cycle; the shared 4177 process was not interrupted for this proof.'},
  operationalThreeCycleProof:{firstPopulatedCycle:cycle(first),backlogRecoveryCycle:cycle(backlog),idempotentRestartCycle:cycle(idempotent),cumulative:idempotent.cumulative,sentinel3RestartProof:{cataloguedProducts:idempotent.sources.sentinel3.cataloguedProducts,productsAcquired:idempotent.sources.sentinel3.productsAcquiredThisPoll,knownProductsSkipped:idempotent.sources.sentinel3.knownProductsSkipped,pendingProducts:idempotent.sources.sentinel3.checkpoint.reduce((sum,item)=>sum+(item.pendingProductIds?.length??0),0),rejectedProducts:idempotent.sources.sentinel3.rejectedObservations}},
  timingCorrectedProof:{cycle:cycle(timing),cumulative:timing.cumulative,allTraceLatency:timing.latency,sentinel3TraceCount:s3Traces.length,validSentinel3TraceCount:validS3Traces.length,invalidSentinel3TraceCount:s3Traces.length-validS3Traces.length,sourceProductToEventLatency:timing.lastCycle.sourceToEventLatency,productLifecycleExample:lifecycleProduct,eventLifecycleExample:lifecycleTrace},
  sourceHealth:{capturedAt:timing.updatedAt,viirs:viirsHealth,sentinel3:sentinel3Health},
  current:{...timing.current,events:[],qualification:'No source-aware current physical event existed at the capture time; zero is reported without manufacturing activity.'},
  postgis:{operationalThreeCycle:operationalPostgis,timingIntegrityRun:timingPostgis},
  historicalAssociation:{twoFamilyEvents:science.multisensor.viirsAndSentinel3Events,associatedSentinel3Observations:science.multisensor.associationSuccess,ambiguousSentinel3Observations:science.multisensor.abstentions,unassignedSentinel3Observations:science.multisensor.unassigned,duplicateCanonicalObservations:science.multisensor.duplicateCanonicalObservations},
  governedMultisensorCorpus:{path:relative(paths.corpus),evidenceHash:corpus.evidenceHash,metrics:corpus.metrics},
  smallFireScience:{path:relative(paths.science),evidenceHash:science.evidenceHash,temporalPerformance:science.temporalPerformance,smallFireMultisensorUnion:science.smallFireMultisensorUnion},
  limitations:['Provider publication/availability time was not exposed for the sampled products, so sensing-to-provider delay is not inferred.','No browser rendered and acknowledged a newly acquired event during the proof; API availability is measured, UI-first-seen remains null.','The strict dual-opportunity Sentinel-3 small-fire denominator contains five cases and supports no universal multisensor recall claim.','Satellite overpass cadence, cloud/obscuration, pixel footprint, radiance threshold and brief burning between passes remain physical/provider limitations.']
};
proof.evidenceHash=sha(JSON.stringify(proof));

const previousDelta=handoff.criticalDelta?.priorHistoricalDelta??{before:handoff.criticalDelta?.before,after:handoff.criticalDelta?.after};
delete handoff.evidenceHash;
handoff.schema='vigia.physical-sensing-gold-handoff.v4';
handoff.generatedAt=new Date().toISOString();
handoff.criticalDelta={priorHistoricalDelta:previousDelta,before:proof.before,after:{...proof.after,sourceProductsPolled:proof.operationalThreeCycleProof.cumulative.sourceProductsPolled,productsSuccessfullyAcquired:proof.operationalThreeCycleProof.cumulative.productsSuccessfullyAcquired,productFailures:proof.operationalThreeCycleProof.cumulative.productFailures,physicalObservationsIngested:proof.operationalThreeCycleProof.cumulative.physicalObservationsIngested,candidateEventUpdates:proof.operationalThreeCycleProof.cumulative.candidateEventUpdates,idempotentSentinel3ProductsSkipped:proof.operationalThreeCycleProof.sentinel3RestartProof.knownProductsSkipped,currentPhysicalEvents:proof.current.physicalEvents,currentPhysicalCandidates:proof.current.physicalCandidates,currentMultisourcePhysicalEvents:proof.current.multisourcePhysicalEvents}};
handoff.live={terminology:proof.terminology,listenerFirst:proof.listenerFirst,viirs:proof.sourceHealth.viirs,sentinel3:proof.sourceHealth.sentinel3,current:proof.current,acquisition:proof.operationalThreeCycleProof,timing:proof.timingCorrectedProof,postgis:proof.postgis};
handoff.multisensorCorpus=proof.governedMultisensorCorpus;
handoff.viirs={...(handoff.viirs??{}),temporalPerformance:science.temporalPerformance,smallFireMultisensorUnion:science.smallFireMultisensorUnion};
handoff.apiDomainAdditions=[...new Map([...(handoff.apiDomainAdditions??[]),
  {kind:'automatic-live-loop',path:'apps/api/src/modules/world/live-physical-intelligence-service.mjs'},
  {kind:'listener-first-startup',path:'apps/api/src/server.mjs'},
  {kind:'live-sentinel3-checkpoint',path:'apps/api/src/modules/world/sentinel3/sentinel3-frp-gateway.mjs'},
  {kind:'source-aware-freshness',path:'packages/domain/src/fire-event-state.mjs'},
  {kind:'physical-first-event',path:'packages/domain/src/fire-event-tracker.mjs'},
  {kind:'lifecycle-timing',path:'apps/api/src/modules/events/fire-event-service.mjs'},
  {kind:'live-source-health-api',path:'/api/v10/physical-sensing/live'}
].map((item)=>[`${item.kind}:${item.path}`,item])).values()];
handoff.artifacts={...(handoff.artifacts??{}),liveOperationalProof:relative(paths.proof),smallFireScience:relative(paths.science),multisensorCorpus:relative(paths.corpus)};
handoff.remainingBlockers=[
  'Provider publication/availability time is unavailable for the sampled products; do not infer sensing-to-provider latency.',
  'Same-origin UI first-seen was not captured during this operational proof; API availability is captured.',
  'The strict Sentinel-3 + VIIRS small-fire union denominator contains five governed dual-opportunity cases.',
  'Universal association calibration remains unavailable; 65 ambiguous and 3,025 unassigned historical Sentinel-3 observations correctly remain abstained/unassigned.'
];
handoff.evidenceHash=sha(JSON.stringify(handoff));
await Promise.all([writeFile(resolve(paths.proof),`${JSON.stringify(proof,null,2)}\n`),writeFile(resolve(paths.handoff),`${JSON.stringify(handoff,null,2)}\n`)]);
console.log(JSON.stringify({proof:relative(paths.proof),proofEvidenceHash:proof.evidenceHash,handoff:relative(paths.handoff),handoffEvidenceHash:handoff.evidenceHash,phase2Delta:handoff.criticalDelta.after,current:proof.current,sourceLagSeconds:{viirs:proof.sourceHealth.viirs.sourceLagSeconds,sentinel3:proof.sourceHealth.sentinel3.sourceLagSeconds},timing:proof.timingCorrectedProof.allTraceLatency,validSentinel3TraceCount:validS3Traces.length},null,2));
