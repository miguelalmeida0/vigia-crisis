import path from 'node:path';

export function decisionFoundryPaths(root = process.cwd()) {
  const runtime = path.join(root, 'data/runtime/decision-foundry'), validation = path.join(root, 'data/validation/decision-foundry');
  return Object.freeze({ root, runtime, validation, packets: path.join(runtime, 'packets'), replays: path.join(runtime, 'replays'), state: path.join(runtime, 'state.json'), atlas: path.join(runtime, 'negative-opportunity-atlas.json'), progressions: path.join(runtime, 'progressions'), progressionProjectionSummaries: path.join(runtime, 'projection-inputs', 'progressions'), labels: path.join(runtime, 'future-labels'), regions: path.join(runtime, 'region-adjudication.json'), weatherAvailability: path.join(runtime, 'weather-availability.json'), objectSetProjection: path.join(runtime, 'indexed-object-sets.json'), reports: path.join(validation, 'reports'), snapshots: path.join(validation, 'consumer-snapshots'), benchmarks: path.join(validation, 'benchmarks'), demos: path.join(validation, 'demos'), keys: path.join(runtime, 'proof-keys') });
}
