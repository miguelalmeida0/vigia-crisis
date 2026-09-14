import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { json } from '../../http/responses.mjs';
import { RequestGate } from '../../shared/request-gate.mjs';
import { visualizationClientKey } from '../../http/route-security-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const files = {
  definition:path.join(root,'data/validation/pilot/pilot-definition.json'),
  fieldProof:path.join(root,'data/validation/fieldnet/fieldnet-disconnection-proof.json'),
  incident:path.join(root,'data/validation/fieldnet/real-incident-package.json'),
  debt:path.join(root,'data/validation/measurement-debt/measurement-debt-handoff.json'),
  hardware:path.join(root,'data/validation/fieldnet/sensors/hardware-discovery.json'),
  consensus:path.join(root,'data/validation/prevention/consensus-topology-evaluation-v1.json'),
  evidenceContract:path.join(root,'data/validation/pilot/design-partner-evidence-contract-v1.json')
};
const readJson = async (file) => JSON.parse(await readFile(file,'utf8'));
const pilotGate=new RequestGate({maxConcurrent:4,maxConcurrentPerClient:2,maxRequestsPerWindow:60});
let artifactsPromise=null;
const artifacts=()=>artifactsPromise??=(async()=>{const [definition,fieldProof,incident,debt,hardware,consensus,evidenceContract]=await Promise.all([readJson(files.definition),readJson(files.fieldProof),readJson(files.incident),readJson(files.debt),readJson(files.hardware),readJson(files.consensus),readJson(files.evidenceContract)]);return{definition,fieldProof,incident,debt,hardware,consensus,evidenceContract};})();
const noCases = (qualification) => ({ state:'NO_OBSERVED_CASES', numerator:null, denominator:0, value:null, qualification });

async function pilotReport({ liveShadowCampaignService, alertService }) {
  const [{definition,fieldProof,incident,debt,hardware,consensus,evidenceContract},operations]=await Promise.all([artifacts(),alertService.metrics().catch((error)=>({ state:'UNAVAILABLE', latency:null, denominators:null, qualification:`Operational alert metrics unavailable: ${String(error.message??error)}` }))]);
  const scorecards=liveShadowCampaignService.scorecards(),window30=scorecards.windows.find((item)=>item.label==='LAST_30_DAYS');
  const integrity=fieldProof.dataIntegrity??{},transport=fieldProof.transport??{},timings=fieldProof.timingsMs??{};
  const report={
    schemaVersion:'vigia.governed-pilot-report.v1',generatedAt:new Date().toISOString(),pilot:definition,campaign:scorecards.campaign,
    territory:{...definition.territory,offlineGeography:incident.offlineMap?.baseLayer?.featureCounts,terrain:incident.offlineMap?.baseLayer?.terrain?.statistics,packageBytes:incident.byteLength,remoteTileDependencies:incident.offlineMap?.baseLayer?.remoteTileDependencies},
    sourceCoverage:window30?.metrics?.sourceAvailability??noCases('The prospective campaign has not recorded a source check.'),
    detections:{physicalCandidates:window30?.metrics?.physicalCandidates,physicalFirst:window30?.metrics?.physicalFirst,multisource:window30?.metrics?.multisource},
    alerts:{created:window30?.metrics?.alerts,delivered:window30?.metrics?.alertsDelivered,acknowledged:window30?.metrics?.acknowledged,operationsDenominators:operations.denominators??null},
    responseTimings:{prospective:operations.latency??null,controlledFieldExercise:{observationCommitMs:timings.firstOfflineObservationCommitMs,taskAcknowledgementMs:timings.taskAcknowledgementCommitMs,syncRecoveryMs:timings.automaticReconnectReconciliationMs},qualification:'Controlled FieldNet timings are deployment-readiness evidence, not customer production SLA.'},
    evidenceClosure:{summary:{total:debt.evidenceDebtItems?.length,open:debt.openDebt?.length,resolved:debt.resolvedDebt?.length,allWithPlans:(debt.measurementPlans?.length??0)===(debt.evidenceDebtItems?.length??-1)},prospectiveCreated:window30?.metrics?.evidenceDebtsCreated,prospectiveResolved:window30?.metrics?.evidenceDebtsSystemResolved},
    fieldNetResilience:{exerciseVerdict:fieldProof.verdict,scope:fieldProof.scope,messageDelivery:{numerator:transport.uniqueAcceptedMutations,denominator:transport.uniqueAcceptedMutations,state:transport.uniqueAcceptedMutations>0?'MEASURED':'NO_OBSERVED_CASES'},duplicateDeliveries:transport.duplicateDeliveries,duplicateApplications:integrity.duplicateMutationsAppliedAtCentral,zeroLostEvidence:integrity.zeroSilentLoss,audit:fieldProof.audit,sensorHardware:hardware.sensorHardware},
    preventScience:{machineVerified:debt.preventMetrics,consensus:{claimStates:consensus.consensusTopology?.claimStates,frozenEvaluation:consensus.frozenEvaluation?.aggregate,promotionDecision:consensus.frozenEvaluation?.aggregate?.promotion_decision,zones:consensus.zones},humanFieldValidation:debt.preventMetrics?.expertValidation,claimLevels:debt.claimLevels,boundary:consensus.scientificClaimBoundary},
    evidenceContract,
    kpis:{sourceAvailability:window30?.metrics?.sourceAvailability,physicalFirst:window30?.metrics?.physicalFirst,multisourceCorroboration:window30?.metrics?.multisource,eventToAlertLatency:operations.latency?.event_to_alert?{...operations.latency.event_to_alert,qualification:'Current operations-store snapshot; not attributed to the frozen prospective campaign window.'}:noCases('No prospective event-to-alert sample.'),alertToAcknowledgementLatency:operations.latency?.alert_to_acknowledgement?{...operations.latency.alert_to_acknowledgement,qualification:'Current operations-store snapshot; not attributed to the frozen prospective campaign window.'}:noCases('No prospective acknowledgement sample.'),falseAlertOutcomes:window30?.metrics?.attributableOutcomes,evidenceDebtClosure:window30?.metrics?.evidenceDebtsSystemResolved,operatorCorrections:window30?.metrics?.operatorCorrections,offlineUptime:window30?.metrics?.offlinePeriods,fieldNetMessageDelivery:{state:'MEASURED_CONTROLLED_EXERCISE',numerator:transport.uniqueAcceptedMutations,denominator:transport.uniqueAcceptedMutations,value:transport.uniqueAcceptedMutations?1:null},syncRecovery:{state:'MEASURED_CONTROLLED_EXERCISE',milliseconds:timings.automaticReconnectReconciliationMs},zeroLostEvidence:{state:'MEASURED_CONTROLLED_EXERCISE',value:integrity.zeroSilentLoss},preventMeasuredDimensions:{referenceConcordance:debt.preventMetrics?.landCover,counterfactualRobustness:debt.preventMetrics?.counterfactual}},
    incidentExamples:[{incidentId:incident.incidentId,qualification:incident.incidentState?.qualification,physicalFamilies:[...new Set((incident.physicalObservations??[]).map((item)=>item.sourceFamily))],fieldNetExerciseProofId:fieldProof.proofId}],
    limitations:[
      'The design partner, pilot dates, users, territory and alert policy approvals are unassigned.',
      'No supported environmental or thermal field sensor was physically present on the inspected Mac.',
      'The live shadow campaign is prospective from its frozen boundary; it does not backfill older events as prospective evidence.',
      'Human/field PREVENT validation was not performed. Machine measurements do not authorize intervention.',
      'No ROI, lives-saved or fires-avoided claim is made.'
    ],
    auditAndProvenance:{incidentEvidenceHash:incident.evidenceHash,fieldNetProofId:fieldProof.proofId,measurementDebtEvidenceHash:debt.evidenceHash,terrainRawSha256:incident.offlineMap?.baseLayer?.terrain?.source?.rawSha256,geographyRawSha256:incident.offlineMap?.baseLayer?.geographySource?.rawSha256}
  };
  return report;
}

export function registerPilotRoutes(router,{liveShadowCampaignService,alertService}){
  router.get('/api/v10/campaign/live-shadow',async({res})=>json(res,200,liveShadowCampaignService.status()));
  router.get('/api/v10/campaign/live-shadow/scorecards',async({res})=>json(res,200,liveShadowCampaignService.scorecards()));
  router.get('/api/v10/campaign/live-shadow/outcomes',async({res})=>json(res,200,liveShadowCampaignService.outcomes()));
  router.get('/api/v10/pilot/definition',async({req,res,context})=>json(res,200,structuredClone((await pilotGate.run(visualizationClientKey(req,context),artifacts)).definition)));
  router.get('/api/v10/pilot/evidence-contract',async({req,res,context})=>json(res,200,structuredClone((await pilotGate.run(visualizationClientKey(req,context),artifacts)).evidenceContract)));
  router.get('/api/v10/pilot/scorecard',async({req,res,context})=>{const report=await pilotGate.run(visualizationClientKey(req,context),()=>pilotReport({liveShadowCampaignService,alertService}));json(res,200,{schemaVersion:'vigia.pilot-scorecard.v1',generatedAt:report.generatedAt,pilotId:report.pilot.pilotId,organization:report.pilot.organization,kpis:report.kpis,limitations:report.limitations});});
  router.get('/api/v10/pilot/report',async({req,res,context})=>json(res,200,await pilotGate.run(visualizationClientKey(req,context),()=>pilotReport({liveShadowCampaignService,alertService}))));
}
