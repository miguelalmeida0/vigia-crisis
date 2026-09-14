import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runPortugalReplay } from './lib/portugal-replay.mjs';

const input = path.resolve(process.argv[2] ?? 'data/replay/corpus/portugal-2024-official.json');
const output = path.resolve(process.argv[3] ?? 'data/replay/results/portugal-2024-benchmark.json');

try {
  const raw = await readFile(input);
  const dataset = JSON.parse(raw.toString('utf8'));
  if (dataset?.metadata?.evidenceClass !== 'official_archival_evidence') throw new Error('official_archival_evidence_corpus_required');
  const replay = await runPortugalReplay(dataset);
  const result = {
    schemaVersion: 'vigia-real-corpus-benchmark-result.v1',
    generatedAt: new Date().toISOString(),
    corpus: {
      id: dataset.metadata.id,
      file: path.relative(process.cwd(), input),
      checksumSha256: createHash('sha256').update(raw).digest('hex'),
      sourceManifest: dataset.metadata.sourceManifest,
      evidenceClass: dataset.metadata.evidenceClass
    },
    softwareReplay: replay.softwareReplay,
    validation: replay.validation,
    caseStates: replay.caseStates.map((state) => ({
      caseId: state.caseId,
      asOf: state.asOf,
      predictedEventCount: new Set(state.events.map((item) => item.id)).size,
      observationCount: state.events.reduce((sum, item) => sum + item.observations.length, 0),
      physicalObservationCount: state.events.reduce((sum, item) => sum + item.observations.filter((observation) => observation.type === 'thermal').length, 0),
      hasLivingGeometry: state.events.some((item) => (item.geometryTimeline?.length ?? 0) >= 2),
      movementMeasured: state.events.some((item) => item.movement?.direction === 'moving')
    }))
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ state: 'MEASURED', output: path.relative(process.cwd(), output), softwareReplay: result.softwareReplay, metrics: { ...result.validation.metrics, cases: undefined } }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ state: 'FAILED', error: String(error.message ?? error) }));
  process.exitCode = 1;
}
