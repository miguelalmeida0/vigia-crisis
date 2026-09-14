import path from 'node:path';

export function dataFoundryPaths(root = process.cwd()) {
  const runtime = path.join(root, 'data/runtime/data-foundry'), validation = path.join(root, 'data/validation/data-foundry');
  return Object.freeze({ root, runtime, validation, state: path.join(runtime, 'foundry-state.json'), registry: path.join(runtime, 'product-registry.json'), lineage: path.join(runtime, 'lineage-graph.json'), gaps: path.join(runtime, 'data-gaps.json'), plans: path.join(runtime, 'gap-resolution-plan.json'), tasks: path.join(runtime, 'pipeline-tasks.json'), events: path.join(runtime, 'material-events.json'), opportunities: path.join(runtime, 'observation-opportunities.json'), hardNegatives: path.join(runtime, 'hard-negatives.json'), reports: path.join(validation, 'reports'), snapshots: path.join(validation, 'consumer-snapshots'), benchmarks: path.join(validation, 'benchmarks'), dossier: path.join(validation, 'external-dependencies') });
}
