import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresAlertStore } from '../apps/api/src/modules/alerts/postgres-alert-store.mjs';
import { AlertService } from '../apps/api/src/modules/alerts/alert-service.mjs';
import { MonitoredTerritoryService } from '../apps/api/src/modules/monitored-territory/monitored-territory-service.mjs';
import { DeliveryAdapters } from '../apps/api/src/modules/notifications/delivery-adapters.mjs';
import { AlertDeliveryWorker } from '../apps/api/src/modules/notifications/alert-delivery-worker.mjs';
import { ObservationOpportunityService } from '../apps/api/src/modules/observations/observation-opportunity-service.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseUrl = process.env.VIGIA_DATABASE_URL;
if (!databaseUrl) throw new Error('VIGIA_DATABASE_URL_required');
const sourceFile = path.resolve(process.env.VIGIA_OPERATIONS_REPLAY_FILE ?? path.join(root, '.tmp/phase2-timing-proof/events-restart.json'));
const outputFile = path.resolve(process.env.VIGIA_OPERATIONS_PROOF_FILE ?? path.join(root, 'data/validation/operations/live-operations-proof.json'));
const raw = JSON.parse(await readFile(sourceFile, 'utf8'));
const observationRepositoryFile=path.join(path.dirname(sourceFile),'fire-event-observations.production.json');
const observationRepository=JSON.parse(await readFile(observationRepositoryFile,'utf8'));
const observationsByEvent=new Map();for(const observation of observationRepository.observations??[]){const eventId=observationRepository.observationEvents?.[observation.id];if(!eventId)continue;if(!observationsByEvent.has(eventId))observationsByEvent.set(eventId,[]);observationsByEvent.get(eventId).push(observation);}
const physicalCandidates = (raw.events ?? []).filter((event) => event.physicalFirst && event.physicalState?.lastAt && event.coordinate?.length === 2);
if (physicalCandidates.length < 3) throw new Error('three_real_physical_events_required');

let now = new Date(Math.max(...physicalCandidates.map((event) => Date.parse(event.physicalState.lastAt))) + 60_000);
const clock = () => new Date(now);

const store = new PostgresAlertStore({ databaseUrl, clock });
await store.initialize();
try {
  const territory = new MonitoredTerritoryService({ store, referenceFile: path.join(root, 'data/reference/portugal-thermal-context-v1.json'), operatorActorId: 'operations-proof-operator', operatorConfigured: true, operatorIncidentScopes:['*'], clock });
  await territory.initialize();
  const covered=[];for(const event of physicalCandidates){if((await territory.context(event)).territories.length)covered.push(event);if(covered.length===3)break;}
  if(covered.length<3)throw new Error('three_in_territory_real_physical_events_required');
  const physical=covered.sort((a,b)=>Date.parse(a.physicalState.lastAt)-Date.parse(b.physicalState.lastAt));
  const events = physical.map((event) => ({
    ...event, id: `CONTROLLED-REPLAY:${event.id}`, sourceEventId: event.id, controlledReplay: true,
    observations:observationsByEvent.get(event.id)??[],
    physicalState: { ...event.physicalState, ageMinutes: 1, freshness: 'current' },
    physicalOperationalState: event.physicalSourceProfile?.familyCount >= 2 ? 'CURRENT_MULTISOURCE_PHYSICAL_FIRE' : 'NEW_PHYSICAL_CANDIDATE'
  }));
  const adapters = new DeliveryAdapters();
  const worker = new AlertDeliveryWorker({ store, adapters, clock });
  const service = new AlertService({ store, territoryService: territory, deliveryWorker: worker, supervisorActorId: 'operations-proof-supervisor', clock });
  await service.initialize();
  const planner = new ObservationOpportunityService({ reader: async () => ({ opportunities: [] }), operationsStore: store, clock });
  await planner.refresh();
  const firstSync=[];const duplicateSync=[];const opportunityResults=[];
  for(const event of events){
    const physicalObservations=(event.observations??[]).filter((item)=>['thermal','camera','ground_sensor','drone','field'].includes(item.type)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),physicalObservation=physicalObservations[0];
    if(!physicalObservation)throw new Error(`attributable_physical_observation_required:${event.sourceEventId}`);
    const confirmedFor=(sourceFamily)=>{const observation=physicalObservations.find((item)=>item.sourceFamily===sourceFamily),rawProductId=observation?.provenance?.rawSourceProductId??observation?.rawSourceProductId;if(!observation||!rawProductId)return{state:'current'};return{state:'current',rawSourceProductIds:[rawProductId],upstreamAt:observation.at,currentCoverage:'Portugal mainland governed controlled-replay source product'};};
    const sourceStates={firms:confirmedFor('viirs'),sentinel3:confirmedFor('sentinel3_slstr'),sentinel2:{state:'catalogue_available'}};
    now=new Date(Date.parse(physicalObservation.at)-60_000);const planned=await planner.plan(event,{},sourceStates);opportunityResults.push(...planned.opportunityResults);
    now=new Date(Date.parse(event.physicalState.lastAt)+60_000);firstSync.push(...await service.sync({events:[event]}));duplicateSync.push(...await service.sync({events:[event]}));
    const reconciled=await planner.plan(event,{},sourceStates);opportunityResults.push(...reconciled.opportunityResults);
  }

  now = new Date(now.getTime() + 2 * 60_000);
  const actor = { id: 'operations-proof-operator', authentication: { authenticated: true } };
  const lifecycleEventId=events.at(-1).id,lifecycleAlert=firstSync.find((item)=>item.eventId===lifecycleEventId)??(await store.listAlerts({eventId:lifecycleEventId,limit:20}))[0];
  if(!lifecycleAlert)throw new Error('controlled_replay_lifecycle_alert_required');
  let acknowledged=await store.getAlert(lifecycleAlert.id),assigned=acknowledged,reassigned=acknowledged,resolved=acknowledged;
  if(!acknowledged.acknowledgedAt&&acknowledged.lifecycleState!=='RESOLVED')acknowledged=await service.acknowledge(lifecycleAlert.id, actor, 'Controlled replay acknowledgement.');
  if(acknowledged.lifecycleState!=='RESOLVED'){assigned=acknowledged.ownerActorId?acknowledged:await service.assign(lifecycleAlert.id, actor, 'operations-proof-operator', 'Controlled replay ownership.');reassigned=assigned.ownerActorId==='operations-proof-supervisor'?assigned:await service.reassign(lifecycleAlert.id, actor, 'operations-proof-supervisor', 'Controlled replay handoff.');resolved=await service.resolve(lifecycleAlert.id, actor, 'CONTROLLED_REPLAY_COMPLETE', 'Lifecycle proof only; no emergency disposition.');}

  now = new Date(now.getTime() + 25 * 60_000);
  const escalatedIds = await store.escalateDue({ supervisorActorId: 'operations-proof-supervisor' });
  const escalationDelivery = await worker.drain();
  const auditIntegrity = await store.verifyAudit(lifecycleAlert.id);
  const metrics = await store.metrics();
  const databaseEvidence = await store.operationalProof();
  const alerts = await store.listAlerts({ eventId: events.at(-1).id, limit: 20 });
  const persistedOpportunityResults=(await Promise.all(events.map((event)=>store.listOpportunityResults({eventId:event.id,limit:100})))).flat();
  const payload = {
    schemaVersion: 'vigia.live-operations-proof.v1', generatedAt: new Date().toISOString(), mode: 'CONTROLLED_REPLAY_OF_REAL_PHYSICAL_OBSERVATIONS',
    productionInjection: false, emergencyReadinessClaimed: false,
    source: { file: path.relative(root, sourceFile), sourceSnapshotGeneratedAt: raw.meta?.generatedAt ?? null, realEventIds: physical.map((event) => event.id), physicalLastAt: physical.map((event) => event.physicalState.lastAt), sourceFamilies: physical.map((event) => event.physicalSourceProfile?.families ?? []) },
    policy: { evaluatedEvents: events.length, firstSyncChanged: firstSync.length, identicalReplayChanged: duplicateSync.length, duplicateSuppressionHeld: duplicateSync.length === 0 },
    lifecycle: { alertId: lifecycleAlert.id, acknowledged: acknowledged.lifecycleState, assigned: assigned.lifecycleState, reassignedOwner: reassigned.ownerActorId, resolved: resolved.lifecycleState, escalatedIds, escalationDelivery },
    deliveryConfiguration: adapters.configuration(), databaseEvidence, metrics, auditIntegrity,
    incidentProjectionSeed: { canonicalControlledEventId: events.at(-1).id, sourceEventId: physical.at(-1).id, alertCount: alerts.length },
    observationOpportunities: { persisted: databaseEvidence.opportunities,results:databaseEvidence.opportunity_results,newResultsThisRun:opportunityResults.length,resultStates:Object.fromEntries([...new Set(persistedOpportunityResults.map((item)=>item.result_state))].map((state)=>[state,persistedOpportunityResults.filter((item)=>item.result_state===state).length])), semantics: 'Attributable archived products become CONFIRMED_PROVIDER_PRODUCT opportunities. Poll cadence is never promoted to an event-specific overpass.' },
    exclusions: { mtg: 'OUT_OF_SCOPE', webUiChanges: 0 },
    limitations: ['Controlled replay changes only the derived freshness clock; it does not inject data into the production event graph.', 'Email and webhook remain CONFIGURED_OFF because no provider configuration was supplied.', 'This proof supports shadow operational performance only.']
  };
  payload.evidenceHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
  await mkdir(path.dirname(outputFile), { recursive: true }); await writeFile(outputFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputFile: path.relative(root, outputFile), evidenceHash: payload.evidenceHash, firstSyncChanged: firstSync.length, identicalReplayChanged: duplicateSync.length, auditIntegrity, databaseEvidence, metrics }, null, 2));
} finally { await store.close(); }
