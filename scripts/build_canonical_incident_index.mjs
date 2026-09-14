import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCanonicalIncidentIndex, bindEventProjection, buildCanonicalIncidentIndex } from '../packages/domain/src/event-fabric/canonical-incident-index.mjs';
import { operatorEventProjection } from '../apps/api/src/modules/events/event-routes.mjs';
import { atomicWriteNoFollow } from './release/safe_artifact.mjs';
import { EVENT_PROJECTION_MAX_BYTES, readRequiredJson } from './local_runtime_json.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectionFile = path.join(root, 'data/runtime/event-projections.production.json');
const indexFile = path.join(root, 'data/runtime/canonical-incident-index.production.json');

export async function buildRetainedCanonicalIncidentIndex({ projectRoot = root, sourceFile = projectionFile, outputFile = indexFile } = {}) {
  const projection = await readRequiredJson(sourceFile, {
    root: projectRoot,
    maxBytes: EVENT_PROJECTION_MAX_BYTES,
    label: 'canonical_event_projection_artifact',
    validate: (value) => {
      if (value?.schema !== 'vigia.event-projections.v1' || !Array.isArray(value?.operatorEvents)) throw new Error('canonical_event_projection_schema_invalid');
      return value;
    },
  });
  const boundProjection = bindEventProjection({ ...projection, operatorEvents: projection.operatorEvents.map(operatorEventProjection) });
  const index = buildCanonicalIncidentIndex(boundProjection);
  // Each replacement is no-follow and atomic. The index is published last as
  // the compact commit marker for the projection fingerprint it names.
  await atomicWriteNoFollow(sourceFile, `${JSON.stringify(boundProjection, null, 2)}\n`, { root: projectRoot, mode: 0o600 });
  await atomicWriteNoFollow(outputFile, `${JSON.stringify(index, null, 2)}\n`, { root: projectRoot, mode: 0o600 });
  return assertCanonicalIncidentIndex(index);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    const index = await buildRetainedCanonicalIncidentIndex();
    process.stdout.write(`${JSON.stringify({ output: path.relative(root, indexFile), incidents: index.incidentCount, projectionFingerprint: index.projectionFingerprint })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
