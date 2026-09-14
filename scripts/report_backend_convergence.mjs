import path from 'node:path';
import { compileDecisionDoctrine, decisionDoctrineCoverage } from '../packages/domain/src/decision-foundry/index.mjs';
import { readJson, writeJsonAtomic } from '../apps/api/src/shared/json-file.mjs';
import { decisionFoundryPaths } from '../apps/api/src/modules/decision-foundry/decision-foundry-paths.mjs';
import { writeLearningReport } from '../apps/api/src/modules/decision-foundry/learning-service.mjs';

const root = process.cwd(), paths = decisionFoundryPaths(root), incidents = ['2025-AZGCP-000597', '2026-WACOA-260140'];
const [database, benchmark, databaseBenchmark, demo, prospective, access, retainedQuality, currentQuality, learning, replays, packets] = await Promise.all([
  readJson(path.join(root, 'data/validation/backend-convergence/postgis-certification.json'), { state: 'NOT_RUN' }),
  readJson(path.join(paths.benchmarks, 'backend-convergence.json'), null),
  readJson(path.join(root, 'data/validation/backend-convergence/postgis-scale-benchmark.json'), null),
  readJson(path.join(paths.demos, 'backend-convergence.json'), null),
  readJson(path.join(paths.demos, 'prospective-knowledge-time.json'), null),
  readJson(path.join(root, 'data/validation/backend-convergence/second-region-access.json'), null),
  readJson(path.join(root, 'data/validation/backend-convergence/quality-certification.json'), null),
  readJson(path.join(root, 'data/validation/worldclass/integrated-quality.json'), null),
  writeLearningReport({ projectRoot: root }),
  Promise.all(incidents.map((id) => readJson(path.join(paths.replays, `${id}.json`), null))),
  Promise.all(incidents.map((id) => readJson(path.join(paths.packets, `${id}.json`), null)))
]);
const doctrine = compileDecisionDoctrine(), coverage = decisionDoctrineCoverage({ doctrine, operationalStates: replays.filter(Boolean).map((replay) => ({ id: replay.compilerInput.incident.id, context: { facts: replay.compilerInput.facts, hypotheses: packets.find((packet) => packet?.incident.id === replay.compilerInput.incident.id)?.hypotheses.results ?? [], dataProducts: replay.compilerInput.dataProducts, authority: replay.compilerInput.authorityContext, trust: replay.compilerInput.trustContext, rights: replay.compilerInput.decisionRights, sourceHealth: replay.compilerInput.decisionSourceHealth, policy: replay.compilerInput.policyContext } })) });
const databaseGatesPass = database.state === 'PASS' && database.semanticEquivalence?.state === 'PASS' && database.checks?.backupRestore === true, engineeringGatesPass = benchmark?.state === 'PASS' && databaseBenchmark?.state === 'PASS' && demo?.state === 'PASS';
const quality = currentQuality ?? retainedQuality;
const core = { schemaVersion: 'vigia.backend-convergence-report.v1', generatedAt: new Date().toISOString(), releaseState: databaseGatesPass && engineeringGatesPass ? 'PASS' : databaseGatesPass ? 'ENGINEERING_GATE_FAILURE' : 'DATABASE_GATE_FAILURE', database, quality, retainedPriorQuality: currentQuality ? retainedQuality : null, performance: benchmark, databasePerformance: databaseBenchmark, flagshipDemo: demo, prospectiveKnowledgeTime: prospective ? { incidentId: prospective.incidentId, providers: prospective.providers, snapshots: prospective.snapshots.length, rawBytes: prospective.rawBytes, immutable: prospective.firstSnapshotImmutable, consequentialActionsExecuted: prospective.consequentialActionsExecuted } : null, secondRegionAccess: access, doctrine: { libraryId: doctrine.libraryId, version: doctrine.libraryVersion, decisions: doctrine.definitions.length, priorDemonstrationDecisions: 5, netNewDecisions: doctrine.definitions.length - 5, consequentialDecisions: doctrine.definitions.filter((item) => item.consequential).length, coverage }, decisionMemory: learning, scientificReadiness: { negativeExamples: 0, hardNegatives: 0, calibrationOutcomes: learning.calibration.overall.examples, state: 'CORPUS_NOT_READY' }, secondaryHazard: { state: 'NOT_ATTEMPTED', reason: 'The completion directive remained scoped to the wildfire convergence backend; scientific transfer evidence is still absent.' } };
await writeJsonAtomic(path.join(root, 'data/validation/backend-convergence/backend-convergence-report.json'), core); process.stdout.write(`${JSON.stringify(core, null, 2)}\n`);
