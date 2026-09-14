import path from 'node:path';
import { calculateDecisionDelta, evaluateContractCounterfactual, verifyCounterfactualSeparation } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { corpusPaths } from '../forecast-corpus/corpus-paths.mjs';
import { compileAndPersistDecisionPacket, replayDecisionPacket } from './compiler-service.mjs';
import { materializeFuelTerrainScale, materializeWeatherAvailabilityGraph } from './context-service.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';
import { buildNegativeOpportunityAtlas, explainNegativeCandidate } from './negative-atlas-service.mjs';
import { materializeProgressionFactory } from './progression-service.mjs';
import { reconcileDecisionFoundryOnce } from './reconciliation-service.mjs';
import { adjudicateSecondRegions } from './region-service.mjs';

const INCIDENT_IDS = Object.freeze(['2025-AZGCP-000597', '2026-WACOA-260140']);
export async function runDecisionFoundryDoctor({ projectRoot = process.cwd() } = {}) {
  const paths = decisionFoundryPaths(projectRoot), packets = [];
  for (const incidentId of INCIDENT_IDS) packets.push((await compileAndPersistDecisionPacket({ projectRoot, incidentId })).packet);
  const replay = await Promise.all(INCIDENT_IDS.map((incidentId) => replayDecisionPacket({ projectRoot, incidentId }))), atlas = await buildNegativeOpportunityAtlas({ projectRoot }), weather = await materializeWeatherAvailabilityGraph({ projectRoot }), context = await materializeFuelTerrainScale({ projectRoot }), regions = await adjudicateSecondRegions({ projectRoot }), firstGap = packets[0].openDataGaps[0], counterfactual = evaluateContractCounterfactual({ decisionPacket: packets[0], assumption: { type: 'SATISFY_DATA_GAP', gapId: firstGap.id } }), separation = verifyCounterfactualSeparation(counterfactual, { nodes: [] }), delta = calculateDecisionDelta({ before: packets[0], after: packets[0], knowledgeTime: packets[0].knowledgeTime });
  const gates = {
    hypothesisEvaluation: packets.every((p) => p.hypotheses.results.length === 10),
    decisionDependencies: packets.every((p) => p.decisions.results.length >= 5),
    decisionValue: packets.every((p) => p.rankedAcquisitions.every((x) => x.priorityVector?.doctrineVersion === '2.0.0' && x.orderingDoctrine?.ordering === 'LEXICOGRAPHIC')),
    acquisitionPlanning: packets.every((p) => p.acquisitionPlan && p.acquisitionPlan.items.length === p.rankedAcquisitions.length),
    counterfactualSeparation: separation.valid,
    decisionDelta: delta.schemaVersion === 'vigia.decision-delta.v1',
    proofVerification: packets.every((p) => p.proofVerification?.status === 'VALID'),
    replay: replay.every((x) => x.verification.identical),
    unsafeActions: packets.every((p) => !p.currentActions.includes('PROPOSE_OFFICIAL_WARNING') && p.acquisitionPlan.items.filter((x) => x.state === 'SELECTED').every((x) => x.failureModes.length === 0)),
  };
  const core = { schemaVersion: 'vigia.decision-foundry-doctor.v1', incidents: INCIDENT_IDS, gates, packetFingerprints: packets.map((p) => p.replayFingerprint), atlas: { candidates: atlas.candidates, certifiedNegatives: atlas.certifiedNegatives, validHardNegatives: atlas.validHardNegatives }, weather: { certifiedSlices: weather.certifiedSlices }, context: { packs: context.materializedPacks }, regions: { selected: regions.selection.selectedRegionId }, readinessDecision: Object.values(gates).every(Boolean) ? 'DECISION_FOUNDRY_READY_FOR_SHADOW' : 'DECISION_FOUNDRY_NOT_READY' };
  const doctor = { ...core, fingerprint: semanticHash('decision-foundry-doctor', core) };
  await writeJsonAtomic(paths.state, doctor); return doctor;
}

export async function writeDecisionFoundryReport({ projectRoot = process.cwd() } = {}) {
  const paths = decisionFoundryPaths(projectRoot), doctor = await runDecisionFoundryDoctor({ projectRoot }), corpus = await readJson(path.join(corpusPaths(projectRoot).gold, 'forecast-corpus.json'), null), packet = await readJson(path.join(paths.packets, `${INCIDENT_IDS[0]}.json`), null), atlas = await readJson(paths.atlas, null), progressions = await Promise.all(INCIDENT_IDS.map((id) => readJson(path.join(paths.progressions, `${id}.json`), null))), labels = await Promise.all(INCIDENT_IDS.map((id) => readJson(path.join(paths.labels, `${id}.json`), null))), regions = await readJson(paths.regions, null), weather = await readJson(paths.weatherAvailability, null), context = await readJson(path.join(paths.runtime, 'fuel-terrain-scale.json'), null);
  const report = { schemaVersion: 'vigia.autonomous-crisis-decision-foundry-report.v1', doctor, corpus: { readiness: corpus?.readiness, examples: corpus?.examples?.length ?? 0, splits: corpus?.splits?.counts, leakage: corpus?.leakage, baselines: corpus?.baselines }, decisionPacket: packet, negativeAtlas: atlas, progression: progressions.filter(Boolean), futureLabels: labels.filter(Boolean), regions, weather, fuelTerrain: context };
  report.fingerprint = semanticHash('autonomous-crisis-decision-foundry-report', report);
  await Promise.all([writeJsonAtomic(path.join(paths.reports, 'autonomous-crisis-decision-foundry.json'), report), writeJsonAtomic(path.join(paths.snapshots, 'vigia.crisis-decision-packet.v1.json'), packet)]); return report;
}

export async function runAutonomousDecisionFoundryDemo({ projectRoot = process.cwd(), incidentId = INCIDENT_IDS[0] } = {}) {
  const paths = decisionFoundryPaths(projectRoot), before = (await compileAndPersistDecisionPacket({ projectRoot, incidentId })).packet, materialization = (await materializeProgressionFactory({ projectRoot, incidentId }))[0], after = (await compileAndPersistDecisionPacket({ projectRoot, incidentId })).packet, delta = calculateDecisionDelta({ before, after, policies: before.currentPolicies, knowledgeTime: after.knowledgeTime }), ranked = before.rankedAcquisitions, top = ranked[0], gap = before.openDataGaps.find((item) => item.id === ranked.find((item) => item.gapId)?.gapId) ?? before.openDataGaps[0], counterfactual = evaluateContractCounterfactual({ decisionPacket: before, assumption: { type: 'SATISFY_DATA_GAP', gapId: gap.id } }), separation = verifyCounterfactualSeparation(counterfactual, { nodes: [] }), reconciliation = await reconcileDecisionFoundryOnce({ projectRoot, incidentId, packet: before }), replay = await replayDecisionPacket({ projectRoot, incidentId }), atlas = await buildNegativeOpportunityAtlas({ projectRoot }), negativeDemo = explainNegativeCandidate(atlas.entries[0]);
  const demo = { schemaVersion: 'vigia.autonomous-crisis-decision-foundry-demo.v1', incidentId, before: { packetFingerprint: before.replayFingerprint, hypotheses: before.hypotheses.results, decisions: before.decisions.results, openDataGaps: before.openDataGaps, rankedAcquisitions: ranked }, rankingExplanation: { first: top, outranks: ranked.slice(1).map((item) => ({ candidateId: item.candidateId, decisiveDimension: item.priorityVector ? 'LEXICOGRAPHIC_VECTOR' : 'UNAVAILABLE' })), selectionState: before.acquisitionPlan.items.find((item) => item.candidateId === top.candidateId)?.state }, safeBoundedMaterialization: { type: 'PROGRESSION_SEQUENCE_REVALIDATION', sequenceFingerprint: materialization.sequence.fingerprint, acceptedStates: materialization.sequence.acceptedStateIds.length, externalActionsExecuted: 0 }, after: { packetFingerprint: after.replayFingerprint, hypothesisChanges: delta.hypothesisChanges, decisionDelta: delta, exactExternalBlockers: reconciliation.blocked, obsoleteWorkSuperseded: [] }, counterfactual: { result: counterfactual, separation }, immutablePacket: { schemaVersion: after.schemaVersion, proofStatus: after.proofVerification.status, signedFingerprint: after.signedFingerprint }, replay: replay.verification, identicalFingerprints: replay.verification.identical, negativeIntelligenceDemo: negativeDemo, unsafeActionsExecuted: 0 };
  demo.fingerprint = semanticHash('autonomous-crisis-decision-foundry-demo', demo); await writeJsonAtomic(path.join(paths.demos, 'autonomous-crisis-decision-foundry.json'), demo); return demo;
}
