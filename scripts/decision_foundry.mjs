#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateDecisionDelta, evaluateContractCounterfactual } from '../packages/domain/src/decision-foundry/index.mjs';
import { buildDataFoundryCatalog } from '../apps/api/src/modules/data-foundry/catalog-builder.mjs';
import { buildCorpusProducts } from '../apps/api/src/modules/forecast-corpus/corpus-pipeline.mjs';
import { corpusPaths } from '../apps/api/src/modules/forecast-corpus/corpus-paths.mjs';
import { adjudicateSecondRegions, benchmarkDecisionFoundry, buildNegativeOpportunityAtlas, compileAndPersistDecisionPacket, explainNegativeCandidate, materializeFuelTerrainScale, materializeProgressionFactory, materializeWeatherAvailabilityGraph, reconcileDecisionFoundryOnce, replayDecisionPacket, runAutonomousDecisionFoundryDemo, runDecisionFoundryDoctor, writeDecisionFoundryReport } from '../apps/api/src/modules/decision-foundry/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), command = process.argv[2] ?? 'help', args = process.argv.slice(3), wantsHelp = args.includes('--help') || args.includes('-h'), value = (name, fallback = null) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback, incidentId = value('incident', '2025-AZGCP-000597'), json = (item) => console.log(JSON.stringify(item, null, 2));
function help() { console.log(`Usage:
  npm run decision-foundry:doctor
  npm run intelligence:compile -- --incident=<id>
  npm run hypotheses:explain -- --incident=<id>
  npm run decisions:dependencies -- --incident=<id>
  npm run decisions:delta -- --incident=<id>
  npm run acquisitions:value -- --incident=<id>
  npm run acquisitions:plan -- --incident=<id>
  npm run acquisitions:reconcile -- --once [--incident=<id>]
  npm run negatives:build-atlas
  npm run negatives:certify
  npm run progression:expand [-- --incident=<id>]
  npm run labels:build-horizons [-- --incident=<id>]
  npm run corpus:scale
  npm run regions:adjudicate
  npm run report:decision-foundry
  npm run benchmark:decision-foundry
  npm run demo:autonomous-decision-foundry [-- --incident=<id>]

Defaults are bounded: one incident for compilation/reconciliation, at most 250
progression states per incident, one selected acquisition, explicit byte/request/cost
budgets, no background process, no provider request without a proven opportunity.`); }
async function compile() { return compileAndPersistDecisionPacket({ projectRoot: root, incidentId }); }
async function scaleCorpus() { const [progression, weather, context] = await Promise.all([materializeProgressionFactory({ projectRoot: root }), materializeWeatherAvailabilityGraph({ projectRoot: root }), materializeFuelTerrainScale({ projectRoot: root })]), corpus = await buildCorpusProducts({ paths: corpusPaths(root) }), catalog = await buildDataFoundryCatalog({ projectRoot: root }); return { bounded: true, progression: progression.map((item) => ({ incidentId: item.incidentId, acceptedStates: item.sequence.acceptedStateIds.length, horizonCounts: item.labels.horizonCounts })), weather: { certifiedSlices: weather.certifiedSlices }, fuelTerrain: { packs: context.materializedPacks }, dataProducts: catalog.registry.products?.length ?? catalog.registry.dataProducts?.length ?? 0, examples: corpus.examples.length, readiness: corpus.readiness }; }

try {
  if (wantsHelp || command === 'help') help();
  else if (command === 'doctor') json(await runDecisionFoundryDoctor({ projectRoot: root }));
  else if (command === 'compile') json((await compile()).packet);
  else if (command === 'hypotheses') json((await compile()).packet.hypotheses);
  else if (command === 'decisions') json((await compile()).packet.decisions);
  else if (command === 'delta') { const packet = (await compile()).packet; json(calculateDecisionDelta({ before: packet, after: packet, policies: packet.currentPolicies, knowledgeTime: packet.knowledgeTime })); }
  else if (command === 'value') json((await compile()).packet.rankedAcquisitions);
  else if (command === 'plan') json((await compile()).packet.acquisitionPlan);
  else if (command === 'reconcile') { if (!args.includes('--once')) throw new Error('bounded_once_required'); json(await reconcileDecisionFoundryOnce({ projectRoot: root, incidentId })); }
  else if (command === 'negative-atlas') json(await buildNegativeOpportunityAtlas({ projectRoot: root }));
  else if (command === 'negative-certify') { const atlas = await buildNegativeOpportunityAtlas({ projectRoot: root }); json({ atlas, demonstration: explainNegativeCandidate(atlas.entries[0]) }); }
  else if (command === 'progression') json(await materializeProgressionFactory({ projectRoot: root, incidentId: value('incident') }));
  else if (command === 'labels') json((await materializeProgressionFactory({ projectRoot: root, incidentId: value('incident') })).map((item) => item.labels));
  else if (command === 'corpus-scale') json(await scaleCorpus());
  else if (command === 'regions') json(await adjudicateSecondRegions({ projectRoot: root }));
  else if (command === 'report') { const report = await writeDecisionFoundryReport({ projectRoot: root }); json({ schemaVersion: report.schemaVersion, fingerprint: report.fingerprint, decisionFoundryReadiness: report.doctor.readinessDecision, corpusReadiness: report.corpus.readiness.decision, packetFingerprint: report.decisionPacket.replayFingerprint, negativeAtlas: { candidates: report.negativeAtlas.candidates, certifiedNegatives: report.negativeAtlas.certifiedNegatives, validHardNegatives: report.negativeAtlas.validHardNegatives }, selectedSecondRegion: report.regions.selection.selectedRegionId }); }
  else if (command === 'benchmark') json(await benchmarkDecisionFoundry({ projectRoot: root }));
  else if (command === 'demo') json(await runAutonomousDecisionFoundryDemo({ projectRoot: root, incidentId }));
  else if (command === 'counterfactual') { const packet = (await compile()).packet; json(evaluateContractCounterfactual({ decisionPacket: packet, assumption: { type: 'SATISFY_DATA_GAP', gapId: packet.openDataGaps[0].id } })); }
  else if (command === 'replay') json(await replayDecisionPacket({ projectRoot: root, incidentId }));
  else throw new Error(`unknown_command:${command}`);
} catch (error) { console.error(JSON.stringify({ command, error: String(error.message ?? error) })); process.exitCode = /required|unknown_command|bounded_once/.test(String(error.message)) ? 2 : 1; }
