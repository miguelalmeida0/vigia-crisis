import path from 'node:path';

export function corpusPaths(root = process.cwd()) {
  const runtime = path.join(root, 'data/runtime/forecast-corpus'), validation = path.join(root, 'data/validation/forecast-corpus');
  return Object.freeze({ root, runtime, validation, plans: path.join(runtime, 'plans'), runs: path.join(runtime, 'runs'), bronze: path.join(runtime, 'bronze'), silver: path.join(runtime, 'silver'), gold: path.join(runtime, 'gold'), reports: path.join(validation, 'reports'), cards: path.join(validation, 'data-cards'), benchmarks: path.join(validation, 'benchmarks'), acquisitionState: path.join(runtime, 'acquisition-state.json'), providerState: path.join(runtime, 'provider-state.json') });
}
